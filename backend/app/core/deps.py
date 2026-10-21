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


def can(
    user: User,
    action: str,
    document: Document | None = None,
    db: Session | None = None,
) -> bool:
    """
    Central role-based and document-level authorization function.
    Fails closed (returns False by default).

    Role Boundaries:
    - Inactive / offboarded accounts are denied on all actions.
    - Admin: can manage users, view all audit metadata, verify audit chain,
      transfer document ownership during administrative workflows.
      Must NOT automatically read, preview, or download confidential document contents
      unless granted explicitly as owner or recipient.
    - Owner: can manage own documents, upload, grant/revoke recipient access,
      and delete own documents. Cannot access other owners' documents.
    - Editor: can read, preview, download, and edit documents explicitly shared with them.
      Cannot grant permissions, delete documents, or manage users.
    - Viewer: can read, preview, and download explicitly shared documents.
      Cannot edit, delete, share, upload, or manage users.
    """
    if not user or not user.is_active:
        return False

    # 1. Administrative / user management actions
    if action in ("manage_users", "create_user", "update_user", "offboard_user"):
        return user.role == UserRole.admin

    # 2. Global audit actions
    if action in ("view_audit_trail", "verify_audit_chain", "audit_stats", "audit_actions"):
        return user.role == UserRole.admin

    # 3. Document upload (only Owners and Administrators can upload new documents)
    if action == "document_upload":
        return user.role in (UserRole.owner, UserRole.admin)

    # 4. Document-level actions require document object
    if document is None:
        return False

    # Document ownership check
    is_owner = (document.owner_id == user.id)

    # Delete & permission management are OWNER-ONLY
    if action == "delete":
        return is_owner

    if action in ("manage_permissions", "grant_permission", "revoke_permission", "update_permission"):
        return is_owner

    # Ownership transfer allowed for document owner or system admin
    if action == "transfer_ownership":
        return is_owner or (user.role == UserRole.admin)

    # Read / preview / download
    if action in ("read", "preview", "download"):
        if is_owner:
            return True
        if db is None:
            return False
        return get_user_permission(user, document, db) is not None

    # Edit / update metadata / replace content
    if action in ("edit", "update", "replace_content"):
        if is_owner:
            return True
        if db is None:
            return False
        return get_user_permission(user, document, db) == PermissionLevel.editor

    # Deny by default
    return False


def can_read_document(user: User, document: Document, db: Session) -> bool:
    return can(user, "read", document, db)


def can_edit_document(user: User, document: Document, db: Session) -> bool:
    return can(user, "edit", document, db)


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
    if required == "owner":
        if not can(user, "delete", document, db):
            raise HTTPException(
                status_code=403,
                detail="Only the document owner can perform this action.",
            )
        return

    if required == "editor":
        if not can(user, "edit", document, db):
            raise HTTPException(status_code=403, detail="Editor permission required.")
        return

    # default / viewer
    if not can(user, "read", document, db):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this document.",
        )
