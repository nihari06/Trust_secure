import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.db.models import AuditEvent, AuditOutcome
import uuid
from fastapi import Request


SENSITIVE_KEYS = ("password", "passwd", "secret", "token", "authorization", "hashed_password")


def _redact(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    lowered = value.lower()
    for key in SENSITIVE_KEYS:
        if key in lowered:
            return "[redacted]"
    return value


def _compute_hash(event_data: dict) -> str:
    """Canonical SHA-256 hash of audit event data."""
    canonical = json.dumps(event_data, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _timestamp_for_hash(timestamp: datetime) -> str:
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = timestamp.astimezone(timezone.utc)
    return timestamp.isoformat()


def _event_payload(
    event_id,
    sequence_num,
    timestamp,
    actor_id,
    actor_email,
    action,
    resource_type,
    resource_id,
    resource_name,
    outcome,
    ip_address,
    request_id,
    details,
    prev_hash,
) -> dict:
    outcome_value = outcome.value if isinstance(outcome, AuditOutcome) else outcome
    return {
        "id": str(event_id),
        "sequence_num": sequence_num,
        "timestamp": _timestamp_for_hash(timestamp) if timestamp else None,
        "actor_id": str(actor_id) if actor_id else None,
        "actor_email": actor_email,
        "action": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id else None,
        "resource_name": resource_name,
        "outcome": outcome_value,
        "ip_address": ip_address,
        "request_id": request_id,
        "details": details,
        "prev_hash": prev_hash,
    }


def record_event(
    db: Session,
    action: str,
    outcome: AuditOutcome,
    actor_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    ip_address: Optional[str] = None,
    request_id: Optional[str] = None,
    details: Optional[str] = None,
) -> AuditEvent:
    """Append a tamper-evident audit event with hash chain linkage."""
    last_event = (
        db.query(AuditEvent)
        .order_by(AuditEvent.sequence_num.desc())
        .first()
    )
    prev_hash = last_event.event_hash if last_event else None
    seq = (last_event.sequence_num + 1) if last_event else 1

    event_id = uuid.uuid4()
    ts = datetime.now(timezone.utc)
    safe_details = _redact(details)

    event_data = _event_payload(
        event_id, seq, ts, actor_id, actor_email, action,
        resource_type, resource_id, resource_name, outcome,
        ip_address, request_id, safe_details, prev_hash,
    )
    event_hash = _compute_hash(event_data)

    event = AuditEvent(
        id=event_id,
        sequence_num=seq,
        timestamp=ts,
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        resource_name=resource_name,
        outcome=outcome,
        ip_address=ip_address,
        request_id=request_id,
        details=safe_details,
        prev_hash=prev_hash,
        event_hash=event_hash,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def record_from_request(
    db: Session,
    request: Request,
    action: str,
    outcome: AuditOutcome,
    actor=None,
    actor_email: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    details: Optional[str] = None,
) -> AuditEvent:
    from app.core.deps import get_client_ip, get_request_id

    return record_event(
        db,
        action=action,
        outcome=outcome,
        actor_id=getattr(actor, "id", None),
        actor_email=actor_email or getattr(actor, "email", None),
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        ip_address=get_client_ip(request),
        request_id=get_request_id(request),
        details=details,
    )


def _compute_hash_v1(event_data: dict) -> str:
    """Historical v1 canonical hash: default json formatting before request_id addition."""
    canonical = json.dumps(event_data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _event_payload_v1(
    event_id,
    sequence_num,
    timestamp,
    actor_id,
    actor_email,
    action,
    resource_type,
    resource_id,
    resource_name,
    outcome,
    ip_address,
    details,
    prev_hash,
) -> dict:
    outcome_value = outcome.value if isinstance(outcome, AuditOutcome) else outcome
    return {
        "id": str(event_id),
        "sequence_num": sequence_num,
        "timestamp": _timestamp_for_hash(timestamp) if timestamp else None,
        "actor_id": str(actor_id) if actor_id else None,
        "actor_email": actor_email,
        "action": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id else None,
        "resource_name": resource_name,
        "outcome": outcome_value,
        "ip_address": ip_address,
        "details": details,
        "prev_hash": prev_hash,
    }


def verify_chain(db: Session) -> dict:
    """
    Verify the audit hash chain. Returns a dict with:
      - valid: bool
      - checked: int
      - errors: list of descriptions
      - failed_event_ids: list of string UUIDs of events that failed verification
      - summary: concise summary message

    Limitation: a hash chain detects in-place modification, deletion, and
    reordering of events, but a privileged database administrator who
    rewrites every row (payloads AND hashes) can produce a new internally
    consistent chain. Independently protected checkpoints (WORM object
    storage, a transparency log, or periodic hash receipts stored off-host)
    are required to detect wholesale rewrite.
    """
    events = (
        db.query(AuditEvent)
        .order_by(AuditEvent.sequence_num.asc())
        .all()
    )

    errors = []
    failed_event_ids = []
    prev_hash = None

    for i, event in enumerate(events):
        event_data = _event_payload(
            event.id,
            event.sequence_num,
            event.timestamp,
            event.actor_id,
            event.actor_email,
            event.action,
            event.resource_type,
            event.resource_id,
            event.resource_name,
            event.outcome,
            event.ip_address,
            event.request_id,
            event.details,
            event.prev_hash,
        )
        expected_hash = _compute_hash(event_data)

        matched = False
        if event.event_hash == expected_hash:
            matched = True
        elif event.request_id is None:
            # Verify against historical v1 specification for pre-migration records
            event_data_v1 = _event_payload_v1(
                event.id,
                event.sequence_num,
                event.timestamp,
                event.actor_id,
                event.actor_email,
                event.action,
                event.resource_type,
                event.resource_id,
                event.resource_name,
                event.outcome,
                event.ip_address,
                event.details,
                event.prev_hash,
            )
            if event.event_hash == _compute_hash_v1(event_data_v1):
                matched = True

        if not matched:
            errors.append(
                f"Event #{event.sequence_num} (id={event.id}): hash mismatch — record may have been modified."
            )
            failed_event_ids.append(str(event.id))

        if event.prev_hash != prev_hash:
            errors.append(
                f"Event #{event.sequence_num} (id={event.id}): prev_hash broken — chain may be reordered or event missing."
            )
            failed_event_ids.append(str(event.id))

        if i > 0 and event.sequence_num != events[i - 1].sequence_num + 1:
            errors.append(
                f"Sequence gap before event #{event.sequence_num} — events may be missing or reordered."
            )
            failed_event_ids.append(str(event.id))

        prev_hash = event.event_hash

    unique_failed_ids = list(dict.fromkeys(failed_event_ids))
    is_valid = len(errors) == 0

    if is_valid:
        summary = f"Successfully validated {len(events)} consecutive audit events. Cryptographic hash chain is intact."
    else:
        summary = (
            f"Audit chain verification failed: {len(errors)} discrepancy(ies) detected "
            f"across {len(unique_failed_ids)} event(s)."
        )

    return {
        "valid": is_valid,
        "checked": len(events),
        "errors": errors,
        "failed_event_ids": unique_failed_ids,
        "summary": summary,
    }


def detect_suspicious_activity(
    db: Session,
    threshold: int = 3,
    window_minutes: Optional[int] = None,
) -> dict:
    """
    Detect repeated suspicious access attempts using a documented threshold.

    Documented Detection Rule:
    - Analyzes events where outcome in (AuditOutcome.denied, AuditOutcome.failure).
    - If window_minutes is specified, limits analysis to events within that time window.
    - Groups denied events by actor (actor_email or ip_address).
    - An incident is flagged when an actor accumulates >= threshold (default: 3)
      denied/failed attempts across endpoints (e.g. repeated unauthorized views,
      downloads, updates, or failed logins).
    - Severity is classified as:
        * 'HIGH' if denied_count >= 5
        * 'MEDIUM' if denied_count >= threshold (3)
    """
    query = db.query(AuditEvent).filter(
        AuditEvent.outcome.in_([AuditOutcome.denied, AuditOutcome.failure])
    )
    if window_minutes:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        query = query.filter(AuditEvent.timestamp >= cutoff)

    denied_events = query.order_by(AuditEvent.timestamp.asc()).all()

    # Group by actor key: prefer actor_email, fall back to ip_address or "unknown_actor"
    grouped: Dict[str, List[AuditEvent]] = {}
    for ev in denied_events:
        key = ev.actor_email or ev.ip_address or "unknown_actor"
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(ev)

    incidents = []
    for actor_key, evs in grouped.items():
        if len(evs) >= threshold:
            actions = list(dict.fromkeys(e.action for e in evs))
            resources = list(dict.fromkeys(e.resource_name or e.resource_id for e in evs if e.resource_name or e.resource_id))
            reasons = list(dict.fromkeys(e.details for e in evs if e.details))
            request_ids = list(dict.fromkeys(e.request_id for e in evs if e.request_id))
            ip = next((e.ip_address for e in reversed(evs) if e.ip_address), None)
            email = next((e.actor_email for e in reversed(evs) if e.actor_email), (actor_key if "@" in actor_key else None))

            first_ts = evs[0].timestamp
            last_ts = evs[-1].timestamp
            first_ts_str = first_ts.isoformat() if first_ts else None
            last_ts_str = last_ts.isoformat() if last_ts else None
            severity = "HIGH" if len(evs) >= 5 else "MEDIUM"

            incidents.append({
                "actor_email": email,
                "ip_address": ip,
                "denied_count": len(evs),
                "attempted_actions": actions,
                "target_resources": resources,
                "first_attempt": first_ts_str,
                "last_attempt": last_ts_str,
                "severity": severity,
                "reasons": reasons,
                "recent_request_ids": request_ids[-5:],
            })

    # Sort incidents by denied_count desc
    incidents.sort(key=lambda x: x["denied_count"], reverse=True)

    return {
        "threshold": threshold,
        "window_minutes": window_minutes,
        "incidents_count": len(incidents),
        "incidents": incidents,
    }


def get_audit_stats(db: Session) -> dict:
    """
    Compute real summary metrics directly from the audit_events table.
    """
    total_events = db.query(AuditEvent).count()

    # Document-level access successes
    successful_access = db.query(AuditEvent).filter(
        AuditEvent.outcome.in_([AuditOutcome.success, AuditOutcome.allowed]),
        AuditEvent.resource_type == "document",
    ).count()

    # Document-level access denials
    denied_access = db.query(AuditEvent).filter(
        AuditEvent.outcome.in_([AuditOutcome.denied, AuditOutcome.failure]),
        AuditEvent.resource_type == "document",
    ).count()

    total_denied = db.query(AuditEvent).filter(
        AuditEvent.outcome.in_([AuditOutcome.denied, AuditOutcome.failure])
    ).count()

    # Suspicious incidents computed with threshold=3
    suspicious_report = detect_suspicious_activity(db, threshold=3)

    return {
        "total_events": total_events,
        "successful_access": successful_access,
        "denied_access": denied_access,
        "total_denied": total_denied,
        "suspicious_incidents_count": suspicious_report["incidents_count"],
        "suspicious_incidents": suspicious_report["incidents"],
    }

