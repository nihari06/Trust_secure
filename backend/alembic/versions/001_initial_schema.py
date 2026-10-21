"""Initial TrustVault schema.

Revision ID: 001_initial
Revises:
Create Date: 2026-10-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    return name in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("email", sa.String(255), nullable=False, unique=True),
            sa.Column("full_name", sa.String(255), nullable=False),
            sa.Column("hashed_password", sa.String(255), nullable=False),
            sa.Column("role", sa.String(32), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not _has_table("documents"):
        op.create_table(
            "documents",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(100), nullable=True),
            sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("storage_key", sa.String(500), nullable=False, unique=True),
            sa.Column("original_filename", sa.String(500), nullable=False),
            sa.Column("mime_type", sa.String(200), nullable=False),
            sa.Column("file_size", sa.BigInteger(), nullable=False),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not _has_table("document_permissions"):
        op.create_table(
            "document_permissions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id"), nullable=False),
            sa.Column("grantee_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("granted_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("permission_level", sa.String(32), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("document_id", "grantee_id", name="uq_document_grantee"),
        )
    if not _has_table("audit_events"):
        op.create_table(
            "audit_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("sequence_num", sa.Integer(), nullable=False, index=True),
            sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("actor_email", sa.String(255), nullable=True),
            sa.Column("action", sa.String(100), nullable=False),
            sa.Column("resource_type", sa.String(100), nullable=True),
            sa.Column("resource_id", sa.String(500), nullable=True),
            sa.Column("resource_name", sa.String(500), nullable=True),
            sa.Column("outcome", sa.String(32), nullable=False),
            sa.Column("ip_address", sa.String(50), nullable=True),
            sa.Column("request_id", sa.String(64), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("prev_hash", sa.String(64), nullable=True),
            sa.Column("event_hash", sa.String(64), nullable=False),
        )
    else:
        bind = op.get_bind()
        inspector = Inspector.from_engine(bind)
        cols = {c["name"] for c in inspector.get_columns("audit_events")}
        if "request_id" not in cols:
            op.add_column("audit_events", sa.Column("request_id", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("document_permissions")
    op.drop_table("documents")
    op.drop_table("users")
