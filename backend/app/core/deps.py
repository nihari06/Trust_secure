from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User, Document, DocumentPermission, PermissionLevel, UserRole
from app.core.security import decode_access_token
import uuid

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise credentials_exception
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise credentials_exception
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Access revoked.",
        )
    token_ver = payload.get("ver")
    if token_ver is not None and token_ver != (user.token_version or 1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user


def get_document_or_404(document_id: str, db: Session) -> Document:
    """Return document if it exists and is not deleted."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document not found.")
    doc = db.query(Document).filter(Document.id == doc_uuid, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


def get_user_permission(user: User, document: Document, db: Session) -> PermissionLevel | None:
    """Return the active document-level permission, or None.

    Global account roles (admin/owner/viewer/editor) are never treated as
    an implicit grant. Admin cannot read contents through this helper.
    """
    if document.owner_id == user.id:
        return None
    perm = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.document_id == document.id,
            DocumentPermission.grantee_id == user.id,
            DocumentPermission.is_active == True,
        )
        .first()
    )
    return perm.permission_level if perm else None


def is_document_owner(user: User, document: Document) -> bool:
    return document.owner_id == user.id


def can_read_document(user: User, document: Document, db: Session) -> bool:
    if is_document_owner(user, document):
        return True
    return get_user_permission(user, document, db) is not None


def can_edit_document(user: User, document: Document, db: Session) -> bool:
    if is_document_owner(user, document):
        return True
    return get_user_permission(user, document, db) == PermissionLevel.editor


def require_document_access(
    document: Document,
    user: User,
    db: Session,
    required: str = "viewer",
) -> None:
    """
    Fail closed. Identity comes from the verified JWT user, never from
    the client body. Admin role is not a substitute for ownership or an
    explicit document grant.

    required: "viewer" | "editor" | "owner"
    """
    is_owner = is_document_owner(user, document)
    if required == "owner":
        if not is_owner:
            raise HTTPException(
                status_code=403,
                detail="Only the document owner can perform this action.",
            )
        return

    if is_owner:
        return

    perm_level = get_user_permission(user, document, db)
    if perm_level is None:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this document.",
        )

    if required == "editor" and perm_level != PermissionLevel.editor:
        raise HTTPException(status_code=403, detail="Editor permission required.")
