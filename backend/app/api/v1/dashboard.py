from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User, Document, DocumentPermission, AuditEvent
from app.core.deps import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
def dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Real metrics computed from the database — never hardcoded."""
    my_docs = db.query(Document).filter(
        Document.owner_id == current_user.id, Document.is_deleted == False
    ).count()

    shared_with_me = db.query(DocumentPermission).filter(
        DocumentPermission.grantee_id == current_user.id,
        DocumentPermission.is_active == True,
    ).count()

    owned_doc_ids = [
        d.id for d in db.query(Document).filter(
            Document.owner_id == current_user.id, Document.is_deleted == False
        ).all()
    ]
    active_permissions = db.query(DocumentPermission).filter(
        DocumentPermission.is_active == True,
        DocumentPermission.document_id.in_(owned_doc_ids) if owned_doc_ids else False,
    )
    active_perm_count = active_permissions.count() if owned_doc_ids else 0

    recent_activity = db.query(AuditEvent).filter(
        AuditEvent.actor_id == current_user.id
    ).count()

    return {
        "my_documents": my_docs,
        "shared_with_me": shared_with_me,
        "active_permissions": active_perm_count,
        "recent_activities": recent_activity,
    }


@router.get("/recent-documents")
def recent_documents(
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    docs = (
        db.query(Document)
        .filter(Document.owner_id == current_user.id, Document.is_deleted == False)
        .order_by(Document.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "category": d.category,
            "mime_type": d.mime_type,
            "file_size": d.file_size,
            "created_at": d.created_at.isoformat(),
            "updated_at": d.updated_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/recent-activity")
def recent_activity(
    limit: int = Query(10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.actor_id == current_user.id)
        .order_by(AuditEvent.sequence_num.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(e.id),
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_name": e.resource_name,
            "outcome": e.outcome.value,
            "timestamp": e.timestamp.isoformat(),
        }
        for e in events
    ]
