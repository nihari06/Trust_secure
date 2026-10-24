from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
import os
import uuid
from app.db.session import get_db
from app.db.models import User, UserRole, AuditOutcome, Document, DocumentPermission
from app.core.deps import get_current_user, require_admin
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.config import settings
from app.schemas.schemas import (
    UserOut, UserCreate, UserUpdate, UserLookupOut, UserLookupResponse,
    OffboardRequest, OffboardResponse, PasswordChangeRequest
)
from app.services import audit

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=list[UserOut])
@router.get("", response_model=list[UserOut], include_in_schema=False)
def list_users(
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        q = q.filter(
            (User.email.ilike(f"%{search}%")) | (User.full_name.ilike(f"%{search}%"))
        )
    if role:
        q = q.filter(User.role == role)
    if is_active is not None:
        q = q.filter(User.is_active == is_active)
    return q.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=UserOut, status_code=201)
@router.post("", response_model=UserOut, status_code=201, include_in_schema=False)
def create_user(
    body: UserCreate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered.")
    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=get_password_hash(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit.record_from_request(
        db,
        request,
        action="USER_CREATED",
        outcome=AuditOutcome.success,
        actor=admin,
        resource_type="user",
        resource_id=str(user.id),
        resource_name=user.email,
        details=f"Role: {user.role.value}",
    )
    return user


@router.get("/search/by-email")
def search_user_by_email(
    email: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Used for sharing: find a user by email (returns minimal info only)."""
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}


@router.get("/lookup", response_model=UserLookupResponse)
def lookup_users(
    query: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Search registered users for sharing by name or email with server-side pagination.
    Excludes the current user and inactive accounts.
    """
    limit = min(max(limit, 1), 100)
    q = db.query(User).filter(
        User.is_active == True,
        User.id != current_user.id,
    )
    if query and query.strip():
        term = query.strip()
        q = q.filter(
            (User.email.ilike(f"%{term}%")) | (User.full_name.ilike(f"%{term}%"))
        )
    total = q.count()
    users = q.order_by(User.full_name.asc(), User.email.asc()).offset(skip).limit(limit).all()
    return UserLookupResponse(
        items=[
            UserLookupOut(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                role=u.role,
            )
            for u in users
        ],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found.")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found.")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent modifying own role or self-deactivation by admin
    if str(user.id) == str(admin.id):
        if body.role is not None and body.role != user.role:
            raise HTTPException(status_code=403, detail="Cannot modify your own role.")
        if body.is_active is False:
            raise HTTPException(status_code=403, detail="Cannot deactivate your own admin account.")

    changes = []
    if body.full_name is not None:
        user.full_name = body.full_name
        changes.append(f"full_name={body.full_name}")
    if body.role is not None:
        changes.append(f"role={user.role.value}->{body.role.value}")
        user.role = body.role
    if body.is_active is not None:
        changes.append(f"is_active={body.is_active}")
        user.is_active = body.is_active
        if not body.is_active:
            user.token_version = (user.token_version or 1) + 1
            user.deactivated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)
    audit.record_from_request(
        db,
        request,
        action="USER_UPDATED",
        outcome=AuditOutcome.success,
        actor=admin,
        resource_type="user",
        resource_id=str(user.id),
        resource_name=user.email,
        details=", ".join(changes),
    )
    return user


@router.get("/{user_id}/offboard-summary")
def get_offboard_summary(
    user_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Returns context on user's owned documents and permissions prior to offboarding."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found.")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    owned_docs = (
        db.query(Document)
        .filter(Document.owner_id == user.id, Document.is_deleted == False)
        .all()
    )
    active_perms = (
        db.query(DocumentPermission)
        .filter(DocumentPermission.grantee_id == user.id, DocumentPermission.is_active == True)
        .all()
    )
    potential_owners = (
        db.query(User)
        .filter(User.id != user.id, User.is_active == True, User.role.in_([UserRole.owner, UserRole.admin]))
        .order_by(User.full_name.asc())
        .all()
    )

    return {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "is_active": user.is_active,
        "owned_documents_count": len(owned_docs),
        "owned_documents": [{"id": str(d.id), "title": d.title, "category": d.category} for d in owned_docs],
        "active_permissions_count": len(active_perms),
        "active_permissions": [
            {
                "permission_id": str(p.id),
                "document_id": str(p.document_id),
                "level": p.permission_level.value,
            }
            for p in active_perms
        ],
        "potential_owners": [
            {"id": str(o.id), "email": o.email, "full_name": o.full_name, "role": o.role.value}
            for o in potential_owners
        ],
    }


@router.post("/{user_id}/offboard", response_model=OffboardResponse)
def offboard_user(
    user_id: str,
    body: OffboardRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Safely offboards an employee:
    1. Preserves document ownership continuity by transferring owned documents to a designated owner.
    2. Deactivates user account (is_active = False) without deleting historical audit or user records.
    3. Invalidates active sessions and tokens via token_version increment.
    4. Immediately revokes all active document permissions (Viewer & Editor).
    5. Fully audits each step without logging secrets or document contents.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found.")

    target_user = db.query(User).filter(User.id == uid).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    if str(target_user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot offboard your own administrator account.")

    now = datetime.now(timezone.utc)
    transferred_count = 0

    # 1. Document ownership transfer if requested
    owned_docs = (
        db.query(Document)
        .filter(Document.owner_id == target_user.id, Document.is_deleted == False)
        .all()
    )
    if owned_docs and body.transfer_documents_to_user_id:
        try:
            new_owner_uuid = uuid.UUID(body.transfer_documents_to_user_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid new owner ID.")
        new_owner = db.query(User).filter(User.id == new_owner_uuid, User.is_active == True).first()
        if not new_owner:
            raise HTTPException(status_code=400, detail="Designated new owner not found or inactive.")
        if new_owner.id == target_user.id:
            raise HTTPException(status_code=400, detail="Cannot transfer documents back to departing user.")

        for doc in owned_docs:
            doc.owner_id = new_owner.id
            transferred_count += 1
            audit.record_from_request(
                db,
                request,
                action="DOCUMENT_OWNERSHIP_TRANSFERRED",
                outcome=AuditOutcome.success,
                actor=admin,
                resource_type="document",
                resource_id=str(doc.id),
                resource_name=doc.title,
                details=f"Ownership transferred from {target_user.email} to {new_owner.email}. Reason: {body.reason}",
            )

    # 2. Revoke all active permissions granted to this user (Viewer and Editor)
    active_perms = (
        db.query(DocumentPermission)
        .filter(DocumentPermission.grantee_id == target_user.id, DocumentPermission.is_active == True)
        .all()
    )
    revoked_count = 0
    for perm in active_perms:
        perm.is_active = False
        perm.revoked_at = now
        revoked_count += 1

        doc = db.query(Document).filter(Document.id == perm.document_id).first()
        doc_title = doc.title if doc else str(perm.document_id)
        audit.record_from_request(
            db,
            request,
            action="PERMISSION_REVOKED",
            outcome=AuditOutcome.success,
            actor=admin,
            resource_type="document",
            resource_id=str(perm.document_id),
            resource_name=doc_title,
            details=f"Offboarding revocation: revoked {perm.permission_level.value} permission for {target_user.email}. Reason: {body.reason}",
        )

    # 3. Invalidate active sessions, refresh credentials, deactivate account safely
    target_user.is_active = False
    target_user.token_version = (target_user.token_version or 1) + 1
    target_user.deactivated_at = now

    db.commit()
    db.refresh(target_user)

    # 4. Audit overall employee offboarding event
    audit.record_from_request(
        db,
        request,
        action="EMPLOYEE_OFFBOARDED",
        outcome=AuditOutcome.success,
        actor=admin,
        resource_type="user",
        resource_id=str(target_user.id),
        resource_name=target_user.email,
        details=f"Offboarded employee {target_user.email}. Deactivated account, invalidated active sessions, revoked {revoked_count} permissions, transferred {transferred_count} documents. Reason: {body.reason}",
    )

    return OffboardResponse(
        status="success",
        user_id=target_user.id,
        email=target_user.email,
        is_active=False,
        revoked_permissions_count=revoked_count,
        transferred_documents_count=transferred_count,
        details=f"Successfully offboarded {target_user.email}. {revoked_count} permissions revoked, {transferred_count} documents transferred, sessions invalidated.",
    )


@router.post("/me/password")
def change_password(
    body: PasswordChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Secure password change verifying current password and invalidating prior sessions."""
    if not verify_password(body.current_password, current_user.hashed_password):
        audit.record_from_request(
            db, request,
            action="PASSWORD_CHANGE_FAILED",
            outcome=AuditOutcome.failure,
            actor=current_user,
            details="Incorrect current password provided.",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    confirm_val = body.confirm_new_password or body.confirm_password
    if not confirm_val or body.new_password != confirm_val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match.",
        )

    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password.",
        )

    # Hash new password securely
    current_user.hashed_password = get_password_hash(body.new_password)
    # Invalidate other active sessions by bumping token_version
    current_user.token_version = (current_user.token_version or 1) + 1
    db.commit()
    db.refresh(current_user)

    # Issue a new valid token for current session
    new_token = create_access_token({"sub": str(current_user.id), "ver": current_user.token_version})

    audit.record_from_request(
        db, request,
        action="PASSWORD_CHANGED",
        outcome=AuditOutcome.success,
        actor=current_user,
        details="Password changed successfully. Token version bumped.",
    )

    return {
        "detail": "Password changed successfully.",
        "access_token": new_token,
    }


@router.post("/me/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload user avatar image with content and size validation."""
    ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    MAX_SIZE = 2 * 1024 * 1024  # 2MB

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Avatar file too large. Maximum size is 2MB.")

    # Validate MIME type
    detected_mime = file.content_type
    ext = ALLOWED_IMAGE_TYPES.get(detected_mime)
    if not ext:
        if content.startswith(b"\xff\xd8\xff"):
            detected_mime, ext = "image/jpeg", ".jpg"
        elif content.startswith(b"\x89PNG\r\n\x1a\n"):
            detected_mime, ext = "image/png", ".png"
        elif content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
            detected_mime, ext = "image/gif", ".gif"
        elif content.startswith(b"RIFF") and b"WEBP" in content[:16]:
            detected_mime, ext = "image/webp", ".webp"
        else:
            raise HTTPException(status_code=400, detail="Unsupported image format. Allowed: JPG, PNG, WEBP, GIF.")

    avatar_dir = os.path.join(settings.STORAGE_PATH, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(avatar_dir, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    audit.record_from_request(
        db, request,
        action="AVATAR_UPDATED",
        outcome=AuditOutcome.success,
        actor=current_user,
        details=f"Avatar image updated ({len(content)} bytes).",
    )

    return {
        "detail": "Avatar uploaded successfully.",
        "avatar_url": f"/api/v1/users/{current_user.id}/avatar",
    }


@router.get("/{user_id}/avatar")
def get_avatar(user_id: str, db: Session = Depends(get_db)):
    """Serve user avatar image securely."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found.")

    avatar_dir = os.path.join(settings.STORAGE_PATH, "avatars")
    if os.path.exists(avatar_dir):
        # Pick latest avatar for user
        matching = [f for f in os.listdir(avatar_dir) if f.startswith(f"avatar_{uid}_")]
        if matching:
            matching.sort(reverse=True)
            file_path = os.path.join(avatar_dir, matching[0])
            ext = os.path.splitext(matching[0])[1].lower()
            mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/gif"
            with open(file_path, "rb") as af:
                data = af.read()
            return Response(content=data, media_type=mime)
    raise HTTPException(status_code=404, detail="Avatar not found.")
