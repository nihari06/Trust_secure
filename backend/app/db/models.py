import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, BigInteger,
    ForeignKey, Text, Enum as SAEnum, Integer, UniqueConstraint
)
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.sql import func


class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as string or uuid.UUID.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return uuid.UUID(str(value)) if not isinstance(value, uuid.UUID) else value
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(str(value)))
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            return uuid.UUID(str(value))
        return value


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    admin = "admin"
    owner = "owner"
    viewer = "viewer"
    editor = "editor"


class PermissionLevel(str, enum.Enum):
    viewer = "viewer"
    editor = "editor"


class AuditOutcome(str, enum.Enum):
    success = "success"
    failure = "failure"
    allowed = "allowed"
    denied = "denied"


class User(Base):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.viewer)
    is_active = Column(Boolean, default=True, nullable=False)
    token_version = Column(Integer, default=1, nullable=False)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owned_documents = relationship("Document", back_populates="owner", foreign_keys="Document.owner_id")
    granted_permissions = relationship("DocumentPermission", back_populates="granted_by", foreign_keys="DocumentPermission.granted_by_id")
    received_permissions = relationship("DocumentPermission", back_populates="grantee", foreign_keys="DocumentPermission.grantee_id")
    audit_events = relationship("AuditEvent", back_populates="actor", foreign_keys="AuditEvent.actor_id")


class Document(Base):
    __tablename__ = "documents"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    owner_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    storage_key = Column(String(500), nullable=False, unique=True)
    original_filename = Column(String(500), nullable=False)
    mime_type = Column(String(200), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="owned_documents", foreign_keys=[owner_id])
    permissions = relationship("DocumentPermission", back_populates="document")


class DocumentPermission(Base):
    __tablename__ = "document_permissions"
    __table_args__ = (
        UniqueConstraint("document_id", "grantee_id", name="uq_document_grantee"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    document_id = Column(GUID(), ForeignKey("documents.id"), nullable=False)
    grantee_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    granted_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    permission_level = Column(SAEnum(PermissionLevel), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    document = relationship("Document", back_populates="permissions")
    grantee = relationship("User", back_populates="received_permissions", foreign_keys=[grantee_id])
    granted_by = relationship("User", back_populates="granted_permissions", foreign_keys=[granted_by_id])


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    sequence_num = Column(Integer, nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor_id = Column(GUID(), ForeignKey("users.id"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(500), nullable=True)
    resource_name = Column(String(500), nullable=True)
    outcome = Column(SAEnum(AuditOutcome), nullable=False)
    ip_address = Column(String(50), nullable=True)
    request_id = Column(String(64), nullable=True)
    details = Column(Text, nullable=True)
    prev_hash = Column(String(64), nullable=True)
    event_hash = Column(String(64), nullable=False)

    actor = relationship("User", back_populates="audit_events", foreign_keys=[actor_id])
