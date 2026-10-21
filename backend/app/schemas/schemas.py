from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from app.db.models import UserRole, PermissionLevel, AuditOutcome


# ─── Auth ────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ─── Users ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.viewer

    @validator("password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    token_version: Optional[int] = 1
    deactivated_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        orm_mode = True


class OffboardRequest(BaseModel):
    transfer_documents_to_user_id: Optional[str] = None
    reason: Optional[str] = "Employee offboarding"


class OffboardResponse(BaseModel):
    status: str
    user_id: UUID
    email: str
    is_active: bool
    revoked_permissions_count: int
    transferred_documents_count: int
    details: str


class TransferOwnershipRequest(BaseModel):
    new_owner_id: str
    reason: Optional[str] = "Administrative transfer"


# ─── Documents ───────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    category: Optional[str]
    owner_id: UUID
    owner_name: Optional[str] = None
    original_filename: str
    mime_type: str
    file_size: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


class UserLookupOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole

    class Config:
        orm_mode = True


class UserLookupResponse(BaseModel):
    items: List[UserLookupOut]
    total: int
    skip: int
    limit: int


# ─── Permissions ─────────────────────────────────────────────────────────────

class PermissionCreate(BaseModel):
    grantee_email: EmailStr
    permission_level: PermissionLevel


class PermissionUpdate(BaseModel):
    permission_level: PermissionLevel


class BatchPermissionItem(BaseModel):
    grantee_email: EmailStr
    permission_level: PermissionLevel = PermissionLevel.viewer


class BatchPermissionCreate(BaseModel):
    recipients: List[BatchPermissionItem]


class BatchPermissionResult(BaseModel):
    grantee_email: str
    permission_level: str
    status: str
    permission_id: Optional[str] = None
    message: Optional[str] = None


class PermissionOut(BaseModel):
    id: UUID
    document_id: UUID
    grantee_id: UUID
    grantee_email: Optional[str] = None
    grantee_name: Optional[str] = None
    granted_by_id: UUID
    granted_by_email: Optional[str] = None
    permission_level: PermissionLevel
    is_active: bool
    created_at: datetime
    revoked_at: Optional[datetime]

    class Config:
        orm_mode = True


# ─── Audit ───────────────────────────────────────────────────────────────────

class AuditEventOut(BaseModel):
    id: UUID
    sequence_num: int
    timestamp: datetime
    actor_id: Optional[UUID]
    actor_email: Optional[str]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    resource_name: Optional[str]
    outcome: AuditOutcome
    ip_address: Optional[str]
    request_id: Optional[str] = None
    details: Optional[str]
    prev_hash: Optional[str]
    event_hash: str

    class Config:
        orm_mode = True


class AuditChainStatus(BaseModel):
    valid: bool
    checked: int
    errors: List[str]
    failed_event_ids: List[str] = []
    summary: Optional[str] = None


class SuspiciousIncident(BaseModel):
    actor_email: Optional[str] = None
    ip_address: Optional[str] = None
    denied_count: int
    attempted_actions: List[str] = []
    target_resources: List[str] = []
    first_attempt: Optional[str] = None
    last_attempt: Optional[str] = None
    severity: str
    reasons: List[str] = []
    recent_request_ids: List[str] = []


class SuspiciousActivityReport(BaseModel):
    threshold: int
    window_minutes: Optional[int] = None
    incidents_count: int
    incidents: List[SuspiciousIncident]


class AuditStatsOut(BaseModel):
    total_events: int
    successful_access: int
    denied_access: int
    total_denied: int
    suspicious_incidents_count: int
    suspicious_incidents: List[SuspiciousIncident]

