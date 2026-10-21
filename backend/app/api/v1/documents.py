from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, Document, DocumentPermission, PermissionLevel, AuditOutcome, UserRole
from app.core.deps import (
    get_current_user,
    get_document_or_404,
    can_read_document,
    can_edit_document,
    is_document_owner,
)
from app.schemas.schemas import (
    DocumentOut,
    DocumentUpdate,
    PermissionCreate,
    PermissionUpdate,
    BatchPermissionCreate,
    BatchPermissionResult,
    TransferOwnershipRequest,
)
from app.services import audit
from app.services.file_validator import validate_upload
from app.storage.local import generate_storage_key, save_file, read_file, delete_file

router = APIRouter(prefix="/documents", tags=["Documents"])

DOCUMENT_CATEGORIES = ["Contract", "Report", "Invoice", "Legal", "HR", "Financial", "Technical", "Other"]


def _enrich(doc: Document, db: Session) -> dict:
    owner = db.query(User).filter(User.id == doc.owner_id).first()
    return {
        "id": doc.id,
        "title": doc.title,
        "description": doc.description,
        "category": doc.category,
        "owner_id": doc.owner_id,
        "owner_name": owner.full_name if owner else None,
        "original_filename": doc.original_filename,
        "mime_type": doc.mime_type,
        "file_size": doc.file_size,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }


def _safe_filename(name: Optional[str]) -> str:
    raw = Path(name or "upload").name
    if not raw or raw in {".", ".."} or "/" in raw or "\\" in raw:
        raise HTTPException(status_code=422, detail="Invalid filename.")
    return raw


def _deny(db: Session, request: Request, user: User, action: str, doc: Document, details: str):
    audit.record_from_request(
        db,
        request,
        action=action,
        outcome=AuditOutcome.denied,
        actor=user,
        resource_type="document",
        resource_id=str(doc.id),
        resource_name=doc.title,
        details=details,
    )
    raise HTTPException(status_code=403, detail="Access denied.")


@router.get("/", response_model=list[DocumentOut])
@router.get("", response_model=list[DocumentOut], include_in_schema=False)
def list_documents(
    search: Optional[str] = None,
    category: Optional[str] = None,
    owner: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    all_vault: Optional[bool] = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List documents the current user owns, or all documents if admin requests all_vault."""
    q = db.query(Document).filter(Document.is_deleted == False)
    if not (current_user.role == UserRole.admin and all_vault):
        q = q.filter(Document.owner_id == current_user.id)
    if search:
        q = q.filter(Document.title.ilike(f"%{search}%"))
    if category:
        q = q.filter(Document.category == category)
    if owner:
        owner_obj = db.query(User).filter(User.id == current_user.id).first()
        hay = f"{owner_obj.full_name} {owner_obj.email}".lower() if owner_obj else ""
        if owner.lower() not in hay:
            return []
    if from_date:
        q = q.filter(Document.created_at >= from_date)
    if to_date:
        q = q.filter(Document.created_at <= to_date)
    docs = q.order_by(Document.created_at.desc()).all()
    return [_enrich(d, db) for d in docs]


@router.get("/shared", response_model=list[dict])
def list_shared_documents(
    search: Optional[str] = None,
    category: Optional[str] = None,
    owner: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List documents explicitly shared with the current user."""
    perms = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.grantee_id == current_user.id,
            DocumentPermission.is_active == True,
        )
        .all()
    )
    result = []
    for perm in perms:
        doc = db.query(Document).filter(Document.id == perm.document_id, Document.is_deleted == False).first()
        if not doc:
            continue
        owner_obj = db.query(User).filter(User.id == doc.owner_id).first()
        grantor = db.query(User).filter(User.id == perm.granted_by_id).first()

        if search and search.lower() not in doc.title.lower():
            continue
        if category and doc.category != category:
            continue
        if owner and owner_obj:
            if owner.lower() not in (owner_obj.full_name or "").lower() and owner.lower() not in owner_obj.email.lower():
                continue
        if from_date and doc.created_at and doc.created_at < from_date:
            continue
        if to_date and doc.created_at and doc.created_at > to_date:
            continue

        result.append({
            "id": str(doc.id),
            "title": doc.title,
            "description": doc.description,
            "category": doc.category,
            "original_filename": doc.original_filename,
            "mime_type": doc.mime_type,
            "file_size": doc.file_size,
            "owner_name": owner_obj.full_name if owner_obj else None,
            "owner_email": owner_obj.email if owner_obj else None,
            "permission_level": perm.permission_level.value,
            "shared_at": perm.created_at.isoformat() if perm.created_at else None,
            "granted_by": grantor.full_name if grantor else None,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
        })
    return result


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str = Form("Other"),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename = _safe_filename(file.filename)
    content = await file.read()
    is_valid, detected_mime, error_msg = validate_upload(filename, content)
    if not is_valid:
        audit.record_from_request(
            db, request, action="DOCUMENT_UPLOAD_FAILED", outcome=AuditOutcome.failure,
            actor=current_user, resource_type="document", resource_name=filename, details=error_msg,
        )
        raise HTTPException(status_code=422, detail=error_msg)

    if category not in DOCUMENT_CATEGORIES:
        category = "Other"

    ext = filename.rsplit(".", 1)[-1].lower()
    storage_key = generate_storage_key(ext)

    try:
        save_file(storage_key, content)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to store file.")

    doc = Document(
        title=title,
        description=description,
        category=category,
        owner_id=current_user.id,
        storage_key=storage_key,
        original_filename=filename,
        mime_type=detected_mime,
        file_size=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    audit.record_from_request(
        db, request, action="DOCUMENT_UPLOAD", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id),
        resource_name=doc.title, details=f"size={len(content)}, mime={detected_mime}",
    )
    return _enrich(doc, db)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not can_read_document(current_user, doc, db):
        _deny(db, request, current_user, "DOCUMENT_ACCESS_DENIED", doc, "No permission to view document metadata.")
    audit.record_from_request(
        db,
        request,
        action="DOCUMENT_ACCESS",
        outcome=AuditOutcome.success,
        actor=current_user,
        resource_type="document",
        resource_id=str(doc.id),
        resource_name=doc.title,
    )
    return _enrich(doc, db)


def _serve_file(doc: Document, inline: bool) -> Response:
    try:
        content = read_file(doc.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content not found.")
    disposition = "inline" if inline else "attachment"
    return Response(
        content=content,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{doc.original_filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not can_read_document(current_user, doc, db):
        _deny(db, request, current_user, "DOCUMENT_DOWNLOAD_DENIED", doc, "Unauthorized download attempt.")
    audit.record_from_request(
        db, request, action="DOCUMENT_DOWNLOAD", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id), resource_name=doc.title,
    )
    return _serve_file(doc, inline=False)


@router.get("/{document_id}/preview")
def preview_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not can_read_document(current_user, doc, db):
        _deny(db, request, current_user, "DOCUMENT_PREVIEW_DENIED", doc, "Unauthorized preview attempt.")
    audit.record_from_request(
        db, request, action="DOCUMENT_PREVIEW", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id), resource_name=doc.title,
    )
    return _serve_file(doc, inline=True)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: str,
    body: DocumentUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not can_edit_document(current_user, doc, db):
        _deny(db, request, current_user, "DOCUMENT_UPDATE_DENIED", doc, "Insufficient permission to update document.")

    changes = []
    if body.title is not None:
        changes.append(f"title: '{doc.title}' -> '{body.title}'")
        doc.title = body.title
    if body.description is not None:
        doc.description = body.description
        changes.append("description updated")
    if body.category is not None:
        if body.category not in DOCUMENT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Invalid category.")
        doc.category = body.category
        changes.append(f"category: '{body.category}'")

    db.commit()
    db.refresh(doc)
    audit.record_from_request(
        db, request, action="DOCUMENT_UPDATED", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id),
        resource_name=doc.title, details=", ".join(changes),
    )
    return _enrich(doc, db)


@router.put("/{document_id}/content", response_model=DocumentOut)
async def replace_document_content(
    document_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace file bytes. Owner or document-level editor only. Does not change ownership."""
    doc = get_document_or_404(document_id, db)
    if not can_edit_document(current_user, doc, db):
        _deny(db, request, current_user, "DOCUMENT_CONTENT_UPDATE_DENIED", doc, "Insufficient permission to replace file content.")

    filename = _safe_filename(file.filename)
    content = await file.read()
    is_valid, detected_mime, error_msg = validate_upload(filename, content)
    if not is_valid:
        raise HTTPException(status_code=422, detail=error_msg)

    ext = filename.rsplit(".", 1)[-1].lower()
    storage_key = generate_storage_key(ext)
    save_file(storage_key, content)
    old_key = doc.storage_key
    doc.storage_key = storage_key
    doc.original_filename = filename
    doc.mime_type = detected_mime
    doc.file_size = len(content)
    db.commit()
    db.refresh(doc)
    try:
        delete_file(old_key)
    except Exception:
        pass

    audit.record_from_request(
        db, request, action="DOCUMENT_CONTENT_UPDATED", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id),
        resource_name=doc.title, details=f"size={len(content)}, mime={detected_mime}",
    )
    return _enrich(doc, db)


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not is_document_owner(current_user, doc):
        _deny(db, request, current_user, "DOCUMENT_DELETE_DENIED", doc, "Only owners can delete documents.")

    doc.is_deleted = True
    db.commit()
    try:
        delete_file(doc.storage_key)
    except Exception:
        pass

    audit.record_from_request(
        db, request, action="DOCUMENT_DELETED", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id), resource_name=doc.title,
    )


def _permission_payload(p: DocumentPermission, db: Session) -> dict:
    grantee = db.query(User).filter(User.id == p.grantee_id).first()
    grantor = db.query(User).filter(User.id == p.granted_by_id).first()
    return {
        "id": str(p.id),
        "document_id": str(p.document_id),
        "grantee_id": str(p.grantee_id),
        "grantee_email": grantee.email if grantee else None,
        "grantee_name": grantee.full_name if grantee else None,
        "granted_by_id": str(p.granted_by_id),
        "granted_by_email": grantor.email if grantor else None,
        "permission_level": p.permission_level.value,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "revoked_at": p.revoked_at.isoformat() if p.revoked_at else None,
    }


@router.get("/{document_id}/permissions", response_model=list[dict])
@router.get("/{document_id}/permissions/", response_model=list[dict], include_in_schema=False)
def list_permissions(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not is_document_owner(current_user, doc):
        _deny(db, request, current_user, "PERMISSION_LIST_DENIED", doc, "Only the document owner can list permissions.")

    perms = db.query(DocumentPermission).filter(DocumentPermission.document_id == doc.id).all()
    return [_permission_payload(p, db) for p in perms]


@router.post("/{document_id}/permissions", status_code=201)
@router.post("/{document_id}/permissions/", status_code=201, include_in_schema=False)
def grant_permission(
    document_id: str,
    body: PermissionCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not is_document_owner(current_user, doc):
        _deny(db, request, current_user, "PERMISSION_GRANT_DENIED", doc, "Non-owner attempted to grant permission.")

    grantee = db.query(User).filter(User.email == str(body.grantee_email), User.is_active == True).first()
    if not grantee:
        raise HTTPException(status_code=404, detail="User not found.")
    if grantee.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot grant permission to yourself.")

    perm_level = body.permission_level

    existing = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.document_id == doc.id,
            DocumentPermission.grantee_id == grantee.id,
        )
        .first()
    )
    if existing:
        existing.is_active = True
        existing.permission_level = perm_level
        existing.granted_by_id = current_user.id
        existing.revoked_at = None
        db.commit()
        db.refresh(existing)
        perm = existing
    else:
        perm = DocumentPermission(
            document_id=doc.id,
            grantee_id=grantee.id,
            granted_by_id=current_user.id,
            permission_level=perm_level,
        )
        db.add(perm)
        db.commit()
        db.refresh(perm)

    audit.record_from_request(
        db, request, action="PERMISSION_GRANTED", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id),
        resource_name=doc.title, details=f"Granted {perm_level.value} to {grantee.email}",
    )
    return {"detail": "Access granted.", "permission_id": str(perm.id)}


@router.delete("/{document_id}/permissions/{permission_id}", status_code=204)
def revoke_permission(
    document_id: str,
    permission_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not is_document_owner(current_user, doc):
        _deny(db, request, current_user, "PERMISSION_REVOKE_DENIED", doc, "Non-owner attempted to revoke permission.")

    import uuid
    try:
        perm_uuid = uuid.UUID(permission_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Permission not found.")

    perm = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.id == perm_uuid,
            DocumentPermission.document_id == doc.id,
        )
        .first()
    )
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found.")

    grantee = db.query(User).filter(User.id == perm.grantee_id).first()
    perm.is_active = False
    perm.revoked_at = datetime.now(timezone.utc)
    db.commit()

    audit.record_from_request(
        db, request, action="PERMISSION_REVOKED", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id),
        resource_name=doc.title, details=f"Revoked access for {grantee.email if grantee else permission_id}",
    )


@router.patch("/{document_id}/permissions/{permission_id}", response_model=dict)
def update_permission(
    document_id: str,
    permission_id: str,
    body: PermissionUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not is_document_owner(current_user, doc):
        _deny(db, request, current_user, "PERMISSION_UPDATE_DENIED", doc, "Non-owner attempted to update permission.")

    import uuid
    try:
        perm_uuid = uuid.UUID(permission_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Permission not found.")

    perm = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.id == perm_uuid,
            DocumentPermission.document_id == doc.id,
        )
        .first()
    )
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found.")

    old_level = perm.permission_level.value
    perm.permission_level = body.permission_level
    perm.is_active = True
    perm.revoked_at = None
    db.commit()
    db.refresh(perm)

    grantee = db.query(User).filter(User.id == perm.grantee_id).first()
    audit.record_from_request(
        db, request, action="PERMISSION_UPDATED", outcome=AuditOutcome.success,
        actor=current_user, resource_type="document", resource_id=str(doc.id),
        resource_name=doc.title,
        details=f"Changed permission from {old_level} to {body.permission_level.value} for {grantee.email if grantee else perm.grantee_id}",
    )
    return _permission_payload(perm, db)


@router.post("/{document_id}/permissions/batch", response_model=list[BatchPermissionResult])
@router.post("/{document_id}/permissions/batch/", response_model=list[BatchPermissionResult], include_in_schema=False)
def batch_grant_permissions(
    document_id: str,
    body: BatchPermissionCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = get_document_or_404(document_id, db)
    if not is_document_owner(current_user, doc):
        _deny(db, request, current_user, "PERMISSION_GRANT_DENIED", doc, "Non-owner attempted batch permission grant.")

    results = []
    for item in body.recipients:
        grantee = db.query(User).filter(User.email == str(item.grantee_email), User.is_active == True).first()
        if not grantee:
            results.append(BatchPermissionResult(
                grantee_email=str(item.grantee_email),
                permission_level=item.permission_level.value,
                status="error",
                message="User not found or inactive."
            ))
            continue
        if grantee.id == current_user.id:
            results.append(BatchPermissionResult(
                grantee_email=str(item.grantee_email),
                permission_level=item.permission_level.value,
                status="error",
                message="Cannot grant permission to yourself."
            ))
            continue

        existing = (
            db.query(DocumentPermission)
            .filter(
                DocumentPermission.document_id == doc.id,
                DocumentPermission.grantee_id == grantee.id,
            )
            .first()
        )
        if existing:
            existing.is_active = True
            existing.permission_level = item.permission_level
            existing.granted_by_id = current_user.id
            existing.revoked_at = None
            db.commit()
            db.refresh(existing)
            perm = existing
            status_str = "updated"
        else:
            perm = DocumentPermission(
                document_id=doc.id,
                grantee_id=grantee.id,
                granted_by_id=current_user.id,
                permission_level=item.permission_level,
            )
            db.add(perm)
            db.commit()
            db.refresh(perm)
            status_str = "granted"

        audit.record_from_request(
            db, request, action="PERMISSION_GRANTED", outcome=AuditOutcome.success,
            actor=current_user, resource_type="document", resource_id=str(doc.id),
            resource_name=doc.title, details=f"Batch {status_str}: {item.permission_level.value} to {grantee.email}",
        )
        results.append(BatchPermissionResult(
            grantee_email=grantee.email,
            permission_level=item.permission_level.value,
            status=status_str,
            permission_id=str(perm.id),
            message=f"Access {status_str} successfully."
        ))

    return results


@router.post("/{document_id}/transfer-ownership", response_model=DocumentOut)
def transfer_document_ownership(
    document_id: str,
    body: TransferOwnershipRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Safely transfers document ownership to another designated owner.
    Allowed for document owners or system administrators.
    Preserves document integrity, metadata, and audit records.
    """
    import uuid
    doc = get_document_or_404(document_id, db)
    if doc.owner_id != current_user.id and current_user.role != UserRole.admin:
        _deny(db, request, current_user, "DOCUMENT_TRANSFER_DENIED", doc, "Only document owner or admin can transfer ownership.")

    try:
        new_owner_uuid = uuid.UUID(body.new_owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid new owner ID.")

    new_owner = db.query(User).filter(User.id == new_owner_uuid, User.is_active == True).first()
    if not new_owner:
        raise HTTPException(status_code=400, detail="New owner not found or inactive.")

    prev_owner_id = doc.owner_id
    prev_owner = db.query(User).filter(User.id == prev_owner_id).first()
    prev_owner_email = prev_owner.email if prev_owner else str(prev_owner_id)

    doc.owner_id = new_owner.id
    db.commit()
    db.refresh(doc)

    audit.record_from_request(
        db,
        request,
        action="DOCUMENT_OWNERSHIP_TRANSFERRED",
        outcome=AuditOutcome.success,
        actor=current_user,
        resource_type="document",
        resource_id=str(doc.id),
        resource_name=doc.title,
        details=f"Ownership transferred from {prev_owner_email} to {new_owner.email}. Reason: {body.reason}",
    )
    return _enrich(doc, db)
