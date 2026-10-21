"""
TrustVault Employee Offboarding Test Suite
==========================================
Proves that after account deactivation:
 - The departing user cannot access documents through an existing session.
 - Previously copied document URLs and download endpoints are denied.
 - Previously granted Viewer and Editor permissions no longer authorize.
 - Other authorized users retain their access.
 - The audit trail records offboarding and all related revocations.
 - Historical audit records and document ownership history remain available.

Run from: cd backend && .venv/Scripts/pytest.exe tests/test_offboarding.py -v
"""
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import get_db
from app.db.models import (
    Base, User, Document, DocumentPermission,
    PermissionLevel, UserRole, AuditEvent, AuditOutcome
)
from app.core.security import get_password_hash, create_access_token
from app.storage.local import save_file, generate_storage_key
from app.services import audit as audit_service
from app.core.config import settings

# ─── Test database setup ─────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def set_test_storage(tmp_path_factory):
    tmpdir = str(tmp_path_factory.mktemp("storage"))
    settings.STORAGE_PATH = tmpdir
    yield


@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(db_engine):
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    db = TestingSessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_user(db, email, password, role=UserRole.viewer, full_name=None):
    user = User(
        email=email,
        full_name=full_name or email.split("@")[0],
        hashed_password=get_password_hash(password),
        role=role,
        token_version=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_doc(db, owner, title="Test Doc"):
    ext = "txt"
    storage_key = generate_storage_key(ext)
    content = b"Confidential content: top secret."
    save_file(storage_key, content)
    doc = Document(
        title=title,
        description="Test document",
        category="Other",
        owner_id=owner.id,
        storage_key=storage_key,
        original_filename=f"{title.lower().replace(' ', '_')}.txt",
        mime_type="text/plain",
        file_size=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def grant_perm(db, doc, grantee, grantor, level=PermissionLevel.viewer):
    perm = DocumentPermission(
        document_id=doc.id,
        grantee_id=grantee.id,
        granted_by_id=grantor.id,
        permission_level=level,
        is_active=True,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return perm


def get_token(client, email, password):
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ─── Offboarding tests ───────────────────────────────────────────────────────

class TestOffboardingAccountDeactivation:
    """Account is deactivated and sessions blocked immediately."""

    def test_offboard_deactivates_account(self, client, db):
        """Admin offboards departing employee → account is_active becomes False."""
        admin = make_user(db, "admin@test.com", "Admin1234!", UserRole.admin)
        employee = make_user(db, "emp@test.com", "Emp12345!", UserRole.viewer)
        admin_token = get_token(client, "admin@test.com", "Admin1234!")

        resp = client.post(
            f"/api/v1/users/{employee.id}/offboard",
            json={"reason": "Test offboarding"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["is_active"] == False

        db.refresh(employee)
        assert employee.is_active == False
        assert employee.deactivated_at is not None

    def test_offboarded_user_cannot_login(self, client, db):
        """After offboarding, the employee cannot log in."""
        admin = make_user(db, "admin2@test.com", "Admin1234!", UserRole.admin)
        employee = make_user(db, "emp2@test.com", "Emp12345!", UserRole.viewer)
        admin_token = get_token(client, "admin2@test.com", "Admin1234!")

        # Offboard
        client.post(
            f"/api/v1/users/{employee.id}/offboard",
            json={"reason": "Gone"},
            headers=auth(admin_token),
        )

        # Attempt login
        resp = client.post(
            "/api/v1/auth/login",
            data={"username": "emp2@test.com", "password": "Emp12345!"},
        )
        assert resp.status_code in (401, 403)

    def test_existing_token_rejected_after_offboarding(self, client, db):
        """
        Employee obtains a JWT *before* offboarding, then offboarding happens.
        The stale token must be rejected on the next request (token_version check).
        """
        admin = make_user(db, "admin3@test.com", "Admin1234!", UserRole.admin)
        employee = make_user(db, "emp3@test.com", "Emp12345!", UserRole.owner)
        doc = make_doc(db, employee, "Pre-Offboard Doc")

        # Employee logs in BEFORE being offboarded
        old_token = get_token(client, "emp3@test.com", "Emp12345!")

        # Confirm the token works initially
        resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth(old_token))
        assert resp.status_code == 200

        # Admin offboards the employee
        admin_token = get_token(client, "admin3@test.com", "Admin1234!")
        offboard_resp = client.post(
            f"/api/v1/users/{employee.id}/offboard",
            json={"reason": "Offboarding test"},
            headers=auth(admin_token),
        )
        assert offboard_resp.status_code == 200

        # Same old token must now be rejected — session invalidated
        resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth(old_token))
        assert resp.status_code in (401, 403), (
            f"Stale token was still accepted after offboarding! Status: {resp.status_code}"
        )


class TestOffboardingDocumentAccess:
    """Previously copied document URLs are denied after offboarding."""

    def test_departing_user_document_metadata_denied(self, client, db):
        """After offboarding, GET /documents/{id} is denied to the departing user."""
        admin = make_user(db, "admin4@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner4@test.com", "Owner1234!", UserRole.owner)
        viewer = make_user(db, "viewer4@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Secret Report")
        grant_perm(db, doc, viewer, owner)

        # Viewer has access before offboarding
        viewer_token = get_token(client, "viewer4@test.com", "View1234!")
        resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth(viewer_token))
        assert resp.status_code == 200

        # Admin offboards viewer
        admin_token = get_token(client, "admin4@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Resignation"},
            headers=auth(admin_token),
        )

        # Old token: request denied (account deactivated + token_version bumped)
        resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth(viewer_token))
        assert resp.status_code in (401, 403)

    def test_departing_user_download_url_denied(self, client, db):
        """After offboarding, previously copied download URL is denied."""
        admin = make_user(db, "admin5@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner5@test.com", "Owner1234!", UserRole.owner)
        viewer = make_user(db, "viewer5@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Download Target")
        grant_perm(db, doc, viewer, owner)

        # Viewer copies download URL (obtains token before offboarding)
        viewer_token = get_token(client, "viewer5@test.com", "View1234!")
        resp = client.get(f"/api/v1/documents/{doc.id}/download", headers=auth(viewer_token))
        assert resp.status_code == 200  # works before offboarding

        # Admin offboards viewer
        admin_token = get_token(client, "admin5@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Contract ended"},
            headers=auth(admin_token),
        )

        # Same token: download denied
        resp = client.get(f"/api/v1/documents/{doc.id}/download", headers=auth(viewer_token))
        assert resp.status_code in (401, 403), (
            f"Download was accessible after offboarding! Status: {resp.status_code}"
        )

    def test_departing_user_preview_url_denied(self, client, db):
        """Previously copied preview URL is denied after offboarding."""
        admin = make_user(db, "admin6@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner6@test.com", "Owner1234!", UserRole.owner)
        editor = make_user(db, "editor6@test.com", "Edit1234!", UserRole.editor)
        doc = make_doc(db, owner, "Preview Target")
        grant_perm(db, doc, editor, owner, PermissionLevel.editor)

        editor_token = get_token(client, "editor6@test.com", "Edit1234!")
        resp = client.get(f"/api/v1/documents/{doc.id}/preview", headers=auth(editor_token))
        assert resp.status_code == 200

        admin_token = get_token(client, "admin6@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{editor.id}/offboard",
            json={"reason": "Performance"},
            headers=auth(admin_token),
        )

        resp = client.get(f"/api/v1/documents/{doc.id}/preview", headers=auth(editor_token))
        assert resp.status_code in (401, 403)


class TestOffboardingPermissionRevocation:
    """All active permissions are revoked as part of offboarding."""

    def test_viewer_permission_revoked_after_offboard(self, client, db):
        """Viewer permission is_active becomes False and revoked_at is set."""
        from datetime import datetime
        admin = make_user(db, "admin7@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner7@test.com", "Owner1234!", UserRole.owner)
        viewer = make_user(db, "viewer7@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Viewer Doc")
        perm = grant_perm(db, doc, viewer, owner)

        admin_token = get_token(client, "admin7@test.com", "Admin1234!")
        resp = client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Offboarding"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["revoked_permissions_count"] >= 1

        db.refresh(perm)
        assert perm.is_active == False
        assert perm.revoked_at is not None

    def test_editor_permission_revoked_after_offboard(self, client, db):
        """Editor permission is revoked during offboarding."""
        admin = make_user(db, "admin8@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner8@test.com", "Owner1234!", UserRole.owner)
        editor = make_user(db, "editor8@test.com", "Edit1234!", UserRole.editor)
        doc = make_doc(db, owner, "Editor Doc")
        perm = grant_perm(db, doc, editor, owner, PermissionLevel.editor)

        # Editor can edit before offboarding
        editor_token = get_token(client, "editor8@test.com", "Edit1234!")
        resp = client.patch(
            f"/api/v1/documents/{doc.id}",
            json={"description": "Editor update"},
            headers=auth(editor_token),
        )
        assert resp.status_code == 200

        # Offboard the editor
        admin_token = get_token(client, "admin8@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{editor.id}/offboard",
            json={"reason": "Termination"},
            headers=auth(admin_token),
        )

        # Attempt PATCH with stale editor token
        resp = client.patch(
            f"/api/v1/documents/{doc.id}",
            json={"description": "Post-offboard edit attempt"},
            headers=auth(editor_token),
        )
        assert resp.status_code in (401, 403)

    def test_multiple_permissions_all_revoked(self, client, db):
        """All active permissions for the departing user are revoked."""
        admin = make_user(db, "admin9@test.com", "Admin1234!", UserRole.admin)
        owner1 = make_user(db, "owner9a@test.com", "Owner1234!", UserRole.owner)
        owner2 = make_user(db, "owner9b@test.com", "Owner1234!", UserRole.owner)
        viewer = make_user(db, "viewer9@test.com", "View1234!", UserRole.viewer)
        doc1 = make_doc(db, owner1, "Doc One")
        doc2 = make_doc(db, owner2, "Doc Two")
        perm1 = grant_perm(db, doc1, viewer, owner1)
        perm2 = grant_perm(db, doc2, viewer, owner2)

        admin_token = get_token(client, "admin9@test.com", "Admin1234!")
        resp = client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Offboarding"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["revoked_permissions_count"] == 2

        db.refresh(perm1)
        db.refresh(perm2)
        assert perm1.is_active == False
        assert perm2.is_active == False


class TestOffboardingOtherUsersUnaffected:
    """Other authorized users retain their access after offboarding a different user."""

    def test_other_viewer_retains_access_after_offboard(self, client, db):
        """Offboarding user A does not affect user B's access to the same document."""
        admin = make_user(db, "admin10@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner10@test.com", "Owner1234!", UserRole.owner)
        viewer_a = make_user(db, "viewera@test.com", "View1234!", UserRole.viewer)
        viewer_b = make_user(db, "viewerb@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Shared Doc")
        grant_perm(db, doc, viewer_a, owner)
        grant_perm(db, doc, viewer_b, owner)

        # Both can access before offboarding
        token_a = get_token(client, "viewera@test.com", "View1234!")
        token_b = get_token(client, "viewerb@test.com", "View1234!")
        assert client.get(f"/api/v1/documents/{doc.id}", headers=auth(token_a)).status_code == 200
        assert client.get(f"/api/v1/documents/{doc.id}", headers=auth(token_b)).status_code == 200

        # Offboard viewer A
        admin_token = get_token(client, "admin10@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{viewer_a.id}/offboard",
            json={"reason": "Resignation"},
            headers=auth(admin_token),
        )

        # Viewer A denied (stale token + account deactivated)
        assert client.get(f"/api/v1/documents/{doc.id}", headers=auth(token_a)).status_code in (401, 403)

        # Viewer B still has access — get a fresh token
        token_b2 = get_token(client, "viewerb@test.com", "View1234!")
        assert client.get(f"/api/v1/documents/{doc.id}", headers=auth(token_b2)).status_code == 200

    def test_document_owner_retains_access_after_unrelated_offboard(self, client, db):
        """Offboarding a viewer does not affect the document owner."""
        admin = make_user(db, "admin11@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner11@test.com", "Owner1234!", UserRole.owner)
        viewer = make_user(db, "viewer11@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Owner's Doc")
        grant_perm(db, doc, viewer, owner)

        admin_token = get_token(client, "admin11@test.com", "Admin1234!")
        owner_token = get_token(client, "owner11@test.com", "Owner1234!")

        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Contract ended"},
            headers=auth(admin_token),
        )

        # Owner still has full access
        resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth(owner_token))
        assert resp.status_code == 200


class TestOffboardingAuditTrail:
    """Audit trail records offboarding events and all related revocations."""

    def test_offboard_audit_event_recorded(self, client, db):
        """EMPLOYEE_OFFBOARDED action appears in the audit trail."""
        admin = make_user(db, "admin12@test.com", "Admin1234!", UserRole.admin)
        viewer = make_user(db, "viewer12@test.com", "View1234!", UserRole.viewer)
        admin_token = get_token(client, "admin12@test.com", "Admin1234!")

        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Audit test"},
            headers=auth(admin_token),
        )

        events = db.query(AuditEvent).filter(
            AuditEvent.action == "EMPLOYEE_OFFBOARDED"
        ).all()
        assert len(events) >= 1
        offboard_event = events[-1]
        assert str(viewer.id) in (offboard_event.resource_id or "")
        assert viewer.email in (offboard_event.details or "")
        assert offboard_event.outcome == AuditOutcome.success
        assert offboard_event.actor_id == admin.id

    def test_permission_revocation_audit_events_recorded(self, client, db):
        """Each revoked permission produces a PERMISSION_REVOKED audit event."""
        admin = make_user(db, "admin13@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner13@test.com", "Owner1234!", UserRole.owner)
        viewer = make_user(db, "viewer13@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Audit Perm Doc")
        grant_perm(db, doc, viewer, owner)

        admin_token = get_token(client, "admin13@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Audit test"},
            headers=auth(admin_token),
        )

        revoke_events = db.query(AuditEvent).filter(
            AuditEvent.action == "PERMISSION_REVOKED",
            AuditEvent.details.like(f"%{viewer.email}%"),
        ).all()
        assert len(revoke_events) >= 1

    def test_audit_records_not_deleted_after_offboard(self, client, db):
        """Historical audit records for the offboarded user remain intact."""
        admin = make_user(db, "admin14@test.com", "Admin1234!", UserRole.admin)
        viewer = make_user(db, "viewer14@test.com", "View1234!", UserRole.viewer)

        # Create some pre-existing audit events for the viewer
        audit_service.record_event(
            db,
            action="LOGIN_SUCCESS",
            outcome=AuditOutcome.success,
            actor_id=viewer.id,
            actor_email=viewer.email,
            ip_address="127.0.0.1",
        )

        admin_token = get_token(client, "admin14@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Audit preservation test"},
            headers=auth(admin_token),
        )

        # Historical login event still exists — not deleted
        historical_events = db.query(AuditEvent).filter(
            AuditEvent.actor_id == viewer.id,
            AuditEvent.action == "LOGIN_SUCCESS",
        ).all()
        assert len(historical_events) >= 1

        # User record still exists (not deleted)
        db_user = db.query(User).filter(User.id == viewer.id).first()
        assert db_user is not None
        assert db_user.email == viewer.email


class TestOffboardingDocumentTransfer:
    """Document ownership can be transferred to a new owner during offboarding."""

    def test_document_ownership_transferred_to_new_owner(self, client, db):
        """During offboarding, owned documents are transferred to the specified new owner."""
        admin = make_user(db, "admin15@test.com", "Admin1234!", UserRole.admin)
        departing_owner = make_user(db, "leaving@test.com", "Leave123!", UserRole.owner)
        new_owner = make_user(db, "staying@test.com", "Stay1234!", UserRole.owner)
        doc = make_doc(db, departing_owner, "Will Be Transferred")

        assert doc.owner_id == departing_owner.id

        admin_token = get_token(client, "admin15@test.com", "Admin1234!")
        resp = client.post(
            f"/api/v1/users/{departing_owner.id}/offboard",
            json={
                "transfer_documents_to_user_id": str(new_owner.id),
                "reason": "Ownership transfer test",
            },
            headers=auth(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["transferred_documents_count"] >= 1

        db.refresh(doc)
        assert doc.owner_id == new_owner.id

    def test_transfer_audit_recorded(self, client, db):
        """Document ownership transfer during offboarding creates DOCUMENT_OWNERSHIP_TRANSFERRED event."""
        admin = make_user(db, "admin16@test.com", "Admin1234!", UserRole.admin)
        departing = make_user(db, "departing@test.com", "Dep12345!", UserRole.owner)
        new_owner = make_user(db, "incoming@test.com", "Inc12345!", UserRole.owner)
        doc = make_doc(db, departing, "Transfer Audit Doc")

        admin_token = get_token(client, "admin16@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{departing.id}/offboard",
            json={
                "transfer_documents_to_user_id": str(new_owner.id),
                "reason": "Transfer audit test",
            },
            headers=auth(admin_token),
        )

        transfer_events = db.query(AuditEvent).filter(
            AuditEvent.action == "DOCUMENT_OWNERSHIP_TRANSFERRED"
        ).all()
        assert len(transfer_events) >= 1

    def test_new_owner_accesses_transferred_document(self, client, db):
        """New owner can access the document after transfer."""
        admin = make_user(db, "admin17@test.com", "Admin1234!", UserRole.admin)
        departing = make_user(db, "departing17@test.com", "Dep12345!", UserRole.owner)
        new_owner = make_user(db, "newowner17@test.com", "New12345!", UserRole.owner)
        doc = make_doc(db, departing, "Transferred Doc")

        admin_token = get_token(client, "admin17@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{departing.id}/offboard",
            json={"transfer_documents_to_user_id": str(new_owner.id), "reason": "Test"},
            headers=auth(admin_token),
        )

        new_owner_token = get_token(client, "newowner17@test.com", "New12345!")
        resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth(new_owner_token))
        assert resp.status_code == 200


class TestOffboardingEdgeCases:
    """Edge cases and guard rails for offboarding endpoint."""

    def test_cannot_offboard_self(self, client, db):
        """Admin cannot offboard their own account."""
        admin = make_user(db, "admin18@test.com", "Admin1234!", UserRole.admin)
        admin_token = get_token(client, "admin18@test.com", "Admin1234!")

        resp = client.post(
            f"/api/v1/users/{admin.id}/offboard",
            json={"reason": "Self-offboarding attempt"},
            headers=auth(admin_token),
        )
        assert resp.status_code == 400

    def test_non_admin_cannot_offboard(self, client, db):
        """Non-admin user cannot call the offboard endpoint."""
        owner = make_user(db, "owner19@test.com", "Own12345!", UserRole.owner)
        victim = make_user(db, "victim@test.com", "Vict1234!", UserRole.viewer)
        owner_token = get_token(client, "owner19@test.com", "Own12345!")

        resp = client.post(
            f"/api/v1/users/{victim.id}/offboard",
            json={"reason": "Unauthorized attempt"},
            headers=auth(owner_token),
        )
        assert resp.status_code == 403

    def test_offboard_summary_available_pre_action(self, client, db):
        """GET /offboard-summary returns owned docs, active perms, and potential owners."""
        admin = make_user(db, "admin20@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner20@test.com", "Own12345!", UserRole.owner)
        viewer = make_user(db, "viewer20@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "Summary Doc")
        grant_perm(db, doc, viewer, owner)

        admin_token = get_token(client, "admin20@test.com", "Admin1234!")
        resp = client.get(
            f"/api/v1/users/{viewer.id}/offboard-summary",
            headers=auth(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "viewer20@test.com"
        assert data["active_permissions_count"] >= 1

    def test_offboard_preserves_historical_ownership_history(self, client, db):
        """The document permission records are preserved (is_active=False) not deleted."""
        admin = make_user(db, "admin21@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner21@test.com", "Own12345!", UserRole.owner)
        viewer = make_user(db, "viewer21@test.com", "View1234!", UserRole.viewer)
        doc = make_doc(db, owner, "History Doc")
        perm = grant_perm(db, doc, viewer, owner)
        perm_id = perm.id

        admin_token = get_token(client, "admin21@test.com", "Admin1234!")
        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "History preservation test"},
            headers=auth(admin_token),
        )

        # Permission record still exists (not deleted), just is_active=False
        existing_perm = db.query(DocumentPermission).filter(
            DocumentPermission.id == perm_id
        ).first()
        assert existing_perm is not None, "Permission record was deleted — should be preserved"
        assert existing_perm.is_active == False
        assert existing_perm.revoked_at is not None

    def test_offboarded_user_not_returned_in_lookup(self, client, db):
        """Offboarded user does not appear in user lookup results (for sharing)."""
        admin = make_user(db, "admin22@test.com", "Admin1234!", UserRole.admin)
        owner = make_user(db, "owner22@test.com", "Own12345!", UserRole.owner)
        viewer = make_user(db, "findme22@test.com", "View1234!", UserRole.viewer)

        admin_token = get_token(client, "admin22@test.com", "Admin1234!")
        owner_token = get_token(client, "owner22@test.com", "Own12345!")

        # Before offboarding: findme22 should appear in lookup
        resp = client.get("/api/v1/users/lookup?query=findme22", headers=auth(owner_token))
        assert resp.status_code == 200
        items_before = resp.json()["items"]
        assert any("findme22" in u["email"] for u in items_before)

        # Offboard the viewer
        client.post(
            f"/api/v1/users/{viewer.id}/offboard",
            json={"reason": "Lookup test"},
            headers=auth(admin_token),
        )

        # After offboarding: findme22 must not appear (inactive users excluded)
        resp = client.get("/api/v1/users/lookup?query=findme22", headers=auth(owner_token))
        assert resp.status_code == 200
        items_after = resp.json()["items"]
        assert not any("findme22" in u["email"] for u in items_after), (
            "Offboarded user still visible in lookup — should be excluded"
        )
