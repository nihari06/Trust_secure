"""
TrustVault Development Seed Script
===================================
Creates demo accounts, sample documents, permissions, and audit events.
Run: python seed.py

WARNING: Development-only credentials. Never use in production.
"""
import sys
import os
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal, engine, ensure_schema
from app.db.models import Base, User, Document, DocumentPermission, PermissionLevel, UserRole, AuditOutcome
from app.core.security import get_password_hash
from app.services import audit
from app.storage.local import save_file, generate_storage_key
import uuid
from datetime import datetime, timezone, timedelta

# ─── Demo Credentials (DEV ONLY) ─────────────────────────────────────────────
USERS = [
    {
        "email": "admin@trustvault.dev",
        "full_name": "Alice Admin",
        "password": "Admin1234!",
        "role": UserRole.admin,
    },
    {
        "email": "owner_a@trustvault.dev",
        "full_name": "Bob Owner",
        "password": "Owner1234!",
        "role": UserRole.owner,
    },
    {
        "email": "owner_b@trustvault.dev",
        "full_name": "Carol Owner",
        "password": "Owner1234!",
        "role": UserRole.owner,
    },
    {
        "email": "viewer@trustvault.dev",
        "full_name": "Dave Viewer",
        "password": "Viewer1234!",
        "role": UserRole.viewer,
    },
    {
        "email": "editor@trustvault.dev",
        "full_name": "Eve Editor",
        "password": "Editor1234!",
        "role": UserRole.editor,
    },
    {
        "email": "viewer_c@trustvault.dev",
        "full_name": "Charan Viewer",
        "password": "Viewer1234!",
        "role": UserRole.viewer,
    },
]

SAMPLE_DOCUMENTS = [
    {"title": "Q4 Financial Report 2024", "category": "Financial", "filename": "q4_report.pdf", "mime": "application/pdf"},
    {"title": "Employee NDA Template", "category": "Legal", "filename": "nda_template.docx", "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    {"title": "Project Charter Alpha", "category": "Technical", "filename": "project_charter.pdf", "mime": "application/pdf"},
    {"title": "Sales Data Q3", "category": "Report", "filename": "sales_q3.csv", "mime": "text/csv"},
    {"title": "Annual Performance Review", "category": "HR", "filename": "perf_review.docx", "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    {"title": "Vendor Contract 2025", "category": "Contract", "filename": "vendor_contract.pdf", "mime": "application/pdf"},
]


def seed():
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    print("🌱 Seeding TrustVault development database...")

    # Create users
    created_users = {}
    for u in USERS:
        existing = db.query(User).filter(User.email == u["email"]).first()
        if existing:
            created_users[u["email"]] = existing
            print(f"  ↩  User already exists: {u['email']}")
            continue
        user = User(
            email=u["email"],
            full_name=u["full_name"],
            hashed_password=get_password_hash(u["password"]),
            role=u["role"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_users[u["email"]] = user
        print(f"  ✓  Created user: {u['email']} ({u['role'].value})")

    owner_a = created_users["owner_a@trustvault.dev"]
    owner_b = created_users["owner_b@trustvault.dev"]
    viewer = created_users["viewer@trustvault.dev"]
    editor = created_users["editor@trustvault.dev"]

    # Create sample documents owned by Owner A
    created_docs = []
    for i, doc_data in enumerate(SAMPLE_DOCUMENTS[:4]):
        existing = db.query(Document).filter(Document.title == doc_data["title"], Document.owner_id == owner_a.id).first()
        if existing:
            created_docs.append(existing)
            print(f"  ↩  Document already exists: {doc_data['title']}")
            continue

        ext = doc_data["filename"].rsplit(".", 1)[-1]
        storage_key = generate_storage_key(ext)
        # Write placeholder file content
        sample_content = f"Sample content for {doc_data['title']}\n\nThis is a development placeholder document.".encode()
        save_file(storage_key, sample_content)

        doc = Document(
            title=doc_data["title"],
            description=f"Sample {doc_data['category']} document for demonstration.",
            category=doc_data["category"],
            owner_id=owner_a.id,
            storage_key=storage_key,
            original_filename=doc_data["filename"],
            mime_type=doc_data["mime"],
            file_size=len(sample_content),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        created_docs.append(doc)
        print(f"  ✓  Created document: {doc_data['title']}")

    # Owner B gets 2 documents
    for doc_data in SAMPLE_DOCUMENTS[4:]:
        existing = db.query(Document).filter(Document.title == doc_data["title"], Document.owner_id == owner_b.id).first()
        if existing:
            print(f"  ↩  Document already exists: {doc_data['title']}")
            continue

        ext = doc_data["filename"].rsplit(".", 1)[-1]
        storage_key = generate_storage_key(ext)
        sample_content = f"Sample content for {doc_data['title']}".encode()
        save_file(storage_key, sample_content)

        doc = Document(
            title=doc_data["title"],
            description=f"Sample {doc_data['category']} document.",
            category=doc_data["category"],
            owner_id=owner_b.id,
            storage_key=storage_key,
            original_filename=doc_data["filename"],
            mime_type=doc_data["mime"],
            file_size=len(sample_content),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        print(f"  ✓  Created document: {doc_data['title']} (Owner B)")

    # Share first doc with viewer
    if created_docs:
        first_doc = created_docs[0]
        existing_perm = db.query(DocumentPermission).filter(
            DocumentPermission.document_id == first_doc.id,
            DocumentPermission.grantee_id == viewer.id,
        ).first()
        if not existing_perm:
            perm = DocumentPermission(
                document_id=first_doc.id,
                grantee_id=viewer.id,
                granted_by_id=owner_a.id,
                permission_level=PermissionLevel.viewer,
            )
            db.add(perm)
            db.commit()
            print(f"  ✓  Shared '{first_doc.title}' with viewer")

        # Share second doc with editor
        if len(created_docs) > 1:
            second_doc = created_docs[1]
            existing_perm2 = db.query(DocumentPermission).filter(
                DocumentPermission.document_id == second_doc.id,
                DocumentPermission.grantee_id == editor.id,
            ).first()
            if not existing_perm2:
                perm2 = DocumentPermission(
                    document_id=second_doc.id,
                    grantee_id=editor.id,
                    granted_by_id=owner_a.id,
                    permission_level=PermissionLevel.editor,
                )
                db.add(perm2)
                db.commit()
                print(f"  ✓  Shared '{second_doc.title}' with editor")

    # Seed audit events
    print("  ✓  Seeding sample audit events...")
    audit.record_event(db, action="LOGIN_SUCCESS", outcome=AuditOutcome.success,
        actor_id=owner_a.id, actor_email=owner_a.email, ip_address="127.0.0.1")
    audit.record_event(db, action="DOCUMENT_UPLOAD", outcome=AuditOutcome.success,
        actor_id=owner_a.id, actor_email=owner_a.email,
        resource_type="document", resource_name="Q4 Financial Report 2024", ip_address="127.0.0.1",
        details="size=1024, mime=application/pdf")
    audit.record_event(db, action="PERMISSION_GRANTED", outcome=AuditOutcome.success,
        actor_id=owner_a.id, actor_email=owner_a.email,
        resource_type="document", resource_name="Q4 Financial Report 2024", ip_address="127.0.0.1",
        details="Granted viewer to viewer@trustvault.dev")
    audit.record_event(db, action="DOCUMENT_DOWNLOAD", outcome=AuditOutcome.success,
        actor_id=viewer.id, actor_email=viewer.email,
        resource_type="document", resource_name="Q4 Financial Report 2024", ip_address="127.0.0.2")
    audit.record_event(db, action="DOCUMENT_UPDATE_DENIED", outcome=AuditOutcome.denied,
        actor_id=viewer.id, actor_email=viewer.email,
        resource_type="document", resource_name="Q4 Financial Report 2024", ip_address="127.0.0.2",
        details="Viewer attempted to edit document.")
    audit.record_event(db, action="PERMISSION_REVOKED", outcome=AuditOutcome.success,
        actor_id=owner_a.id, actor_email=owner_a.email,
        resource_type="document", resource_name="Q4 Financial Report 2024", ip_address="127.0.0.1",
        details="Revoked access for viewer@trustvault.dev")
    audit.record_event(db, action="DOCUMENT_DOWNLOAD_DENIED", outcome=AuditOutcome.denied,
        actor_id=viewer.id, actor_email=viewer.email,
        resource_type="document", resource_name="Q4 Financial Report 2024", ip_address="127.0.0.2",
        details="Access revoked — unauthorized download attempt.")
    audit.record_event(db, action="LOGIN_FAILED", outcome=AuditOutcome.failure,
        actor_email="attacker@evil.com", ip_address="10.0.0.1", details="Invalid credentials.")

    db.close()
    print("\n✅ Seed complete!")
    print("\n─── Demo Accounts (DEV ONLY) ──────────────────────────────")
    print("  admin@trustvault.dev     / Admin1234!   (Admin)")
    print("  owner_a@trustvault.dev   / Owner1234!   (Owner)")
    print("  owner_b@trustvault.dev   / Owner1234!   (Owner)")
    print("  viewer@trustvault.dev    / Viewer1234!  (Viewer B — granted on Q4 Report)")
    print("  viewer_c@trustvault.dev  / Viewer1234!  (Viewer C — no grants)")
    print("  editor@trustvault.dev    / Editor1234!  (Editor)")
    print("────────────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    seed()
