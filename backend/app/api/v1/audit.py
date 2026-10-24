from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.db.session import get_db
from app.db.models import AuditEvent, AuditOutcome, User, UserRole
from app.core.deps import get_current_user, require_admin
from app.schemas.schemas import AuditEventOut, AuditChainStatus, SuspiciousActivityReport, AuditStatsOut
from app.services.audit import verify_chain, detect_suspicious_activity, get_audit_stats

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/", response_model=list[AuditEventOut])
@router.get("", response_model=list[AuditEventOut], include_in_schema=False)
def list_audit_events(
    search: Optional[str] = None,
    action: Optional[str] = None,
    outcome: Optional[AuditOutcome] = None,
    actor: Optional[str] = None,
    resource_id: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(AuditEvent)
    if search:
        q = q.filter(
            AuditEvent.actor_email.ilike(f"%{search}%")
            | AuditEvent.action.ilike(f"%{search}%")
            | AuditEvent.resource_name.ilike(f"%{search}%")
        )
    if action:
        q = q.filter(AuditEvent.action == action)
    if outcome:
        q = q.filter(AuditEvent.outcome == outcome)
    if actor:
        q = q.filter(AuditEvent.actor_email.ilike(f"%{actor}%"))
    if resource_id:
        q = q.filter(AuditEvent.resource_id == resource_id)
    if from_date:
        q = q.filter(AuditEvent.timestamp >= from_date)
    if to_date:
        q = q.filter(AuditEvent.timestamp <= to_date)

    events = q.order_by(AuditEvent.sequence_num.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return events


@router.get("/suspicious", response_model=SuspiciousActivityReport)
def suspicious_activity(
    threshold: int = Query(3, ge=2, le=50, description="Minimum denied attempts to trigger suspicious classification"),
    window_minutes: Optional[int] = Query(None, ge=1, le=1440, description="Optional time window in minutes"),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Detect and return repeated suspicious attempts using the documented threshold rule."""
    return detect_suspicious_activity(db, threshold=threshold, window_minutes=window_minutes)


@router.get("/stats", response_model=AuditStatsOut)
def audit_statistics(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return real audit metrics including access counts and suspicious incident summaries."""
    return get_audit_stats(db)


@router.get("/count")
def audit_event_count(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return {"count": db.query(AuditEvent).count()}


@router.get("/verify", response_model=AuditChainStatus)
def verify_audit_chain(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Verify the integrity of the audit hash chain."""
    return verify_chain(db)


@router.get("/my", response_model=list[AuditEventOut])
def my_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Users can see their own audit events only."""
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.actor_id == current_user.id)
        .order_by(AuditEvent.sequence_num.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return events


@router.get("/actions")
def list_audit_actions(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return distinct action names for filter dropdowns."""
    rows = db.query(AuditEvent.action).distinct().all()
    return sorted([r[0] for r in rows])
