from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def ensure_schema():
    """Add columns introduced after the original create_all (SQLite/Postgres)."""
    inspector = inspect(engine)
    if "audit_events" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("audit_events")}
        if "request_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE audit_events ADD COLUMN request_id VARCHAR(64)"))
    if "users" in inspector.get_table_names():
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        if "token_version" not in user_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1"))
        if "deactivated_at" not in user_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMP"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
