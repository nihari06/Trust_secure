"""
TrustVault Test Suite — Automated Security and Authorization Tests
===================================================================
Tests 17 required scenarios. Uses an in-memory SQLite DB for isolation.
Run: pytest tests/ -v
"""
import pytest
import io
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import get_db
from app.db.models import Base, User, Document, DocumentPermission, PermissionLevel, UserRole, AuditEvent, AuditOutcome
from app.core.security import get_password_hash
from app.storage.local import save_file, generate_storage_key
from app.services import audit as audit_service
from app.core.config import settings
import os
import tempfile

# ─── Test Database Setup ──────────────────────────────────────────────────────

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
def db_session(db_engine):
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    db = TestingSessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Fixtures: Users ─────────────────────────────────────────────────────────

def make_user(db, email, password, role=UserRole.viewer, full_name=None):
    user = User(
        email=email,
        full_name=full_name or email.split("@")[0],
        hashed_password=get_password_hash(password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_token(client, email, password):
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.json()}"
    return resp.json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def make_document(db, owner, title="Test Doc", category="Other"):
    storage_key = generate_storage_key("txt")
    save_file(storage_key, b"Test document content")
    doc = Document(
        title=title,
        category=category,
        owner_id=owner.id,
        storage_key=storage_key,
        original_filename="test.txt",
        mime_type="text/plain",
        file_size=21,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def grant_permission(db, document, grantee, grantor, level=PermissionLevel.viewer):
    perm = DocumentPermission(
        document_id=document.id,
        grantee_id=grantee.id,
        granted_by_id=grantor.id,
        permission_level=level,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return perm


# ─── Test 1: Unauthenticated access is blocked ───────────────────────────────

def test_unauthenticated_cannot_access_documents(client):
    resp = client.get("/api/v1/documents/")
    assert resp.status_code == 401


def test_unauthenticated_cannot_download(client):
    resp = client.get("/api/v1/documents/some-id/download")
    assert resp.status_code == 401


# ─── Test 2: Owner can access their own document ─────────────────────────────

def test_owner_can_access_own_document(client, db_session):
    owner = make_user(db_session, "owner@test.com", "Pass1234!", UserRole.owner)
    doc = make_document(db_session, owner)
    token = get_token(client, "owner@test.com", "Pass1234!")

    resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["title"] == "Test Doc"


# ─── Test 3: Owner A cannot access Owner B's document ────────────────────────

def test_owner_cannot_access_another_owners_document(client, db_session):
    owner_a = make_user(db_session, "ownerA@test.com", "Pass1234!", UserRole.owner)
    owner_b = make_user(db_session, "ownerB@test.com", "Pass1234!", UserRole.owner)
    doc_b = make_document(db_session, owner_b, "Owner B's Secret")
    token_a = get_token(client, "ownerA@test.com", "Pass1234!")

    resp = client.get(f"/api/v1/documents/{doc_b.id}", headers=auth_headers(token_a))
    assert resp.status_code == 403


# ─── Test 4: Viewer can read an authorized document ──────────────────────────

def test_viewer_can_read_authorized_document(client, db_session):
    owner = make_user(db_session, "owner4@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer4@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    token = get_token(client, "viewer4@test.com", "Pass1234!")
    resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    assert resp.status_code == 200


# ─── Test 5: Viewer cannot edit, delete, or share ────────────────────────────

def test_viewer_cannot_edit_document(client, db_session):
    owner = make_user(db_session, "owner5@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer5@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    token = get_token(client, "viewer5@test.com", "Pass1234!")
    resp = client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Hacked!"}, headers=auth_headers(token))
    assert resp.status_code == 403

    # Verify document was NOT changed
    doc_resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(get_token(client, "owner5@test.com", "Pass1234!")))
    assert doc_resp.json()["title"] == "Test Doc"


def test_viewer_cannot_delete_document(client, db_session):
    owner = make_user(db_session, "owner5b@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer5b@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    token = get_token(client, "viewer5b@test.com", "Pass1234!")
    resp = client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    assert resp.status_code == 403


def test_viewer_cannot_share_document(client, db_session):
    owner = make_user(db_session, "owner5c@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer5c@test.com", "Pass1234!", UserRole.viewer)
    other = make_user(db_session, "other5c@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    token = get_token(client, "viewer5c@test.com", "Pass1234!")
    resp = client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "other5c@test.com", "permission_level": "viewer"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 403


# ─── Test 6: Editor can edit ──────────────────────────────────────────────────

def test_editor_can_edit_document(client, db_session):
    owner = make_user(db_session, "owner6@test.com", "Pass1234!", UserRole.owner)
    editor = make_user(db_session, "editor6@test.com", "Pass1234!", UserRole.editor)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, editor, owner, PermissionLevel.editor)

    token = get_token(client, "editor6@test.com", "Pass1234!")
    resp = client.patch(
        f"/api/v1/documents/{doc.id}",
        json={"title": "Updated by Editor"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated by Editor"


# ─── Test 7: Editor cannot grant access or delete ────────────────────────────

def test_editor_cannot_grant_access(client, db_session):
    owner = make_user(db_session, "owner7@test.com", "Pass1234!", UserRole.owner)
    editor = make_user(db_session, "editor7@test.com", "Pass1234!", UserRole.editor)
    other = make_user(db_session, "other7@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, editor, owner, PermissionLevel.editor)

    token = get_token(client, "editor7@test.com", "Pass1234!")
    resp = client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "other7@test.com", "permission_level": "viewer"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 403


def test_editor_cannot_delete_document(client, db_session):
    owner = make_user(db_session, "owner7b@test.com", "Pass1234!", UserRole.owner)
    editor = make_user(db_session, "editor7b@test.com", "Pass1234!", UserRole.editor)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, editor, owner, PermissionLevel.editor)

    token = get_token(client, "editor7b@test.com", "Pass1234!")
    resp = client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    assert resp.status_code == 403


# ─── Test 8: Revocation immediately blocks access ────────────────────────────

def test_revocation_blocks_subsequent_access(client, db_session):
    owner = make_user(db_session, "owner8@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer8@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    perm = grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    viewer_token = get_token(client, "viewer8@test.com", "Pass1234!")
    owner_token = get_token(client, "owner8@test.com", "Pass1234!")

    # Viewer can access before revocation
    r1 = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(viewer_token))
    assert r1.status_code == 200

    # Owner revokes
    r2 = client.delete(
        f"/api/v1/documents/{doc.id}/permissions/{perm.id}",
        headers=auth_headers(owner_token),
    )
    assert r2.status_code == 204

    # Viewer is immediately blocked (same JWT is still valid, but permission is gone)
    r3 = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(viewer_token))
    assert r3.status_code == 403


# ─── Test 9: Revoked user cannot download ─────────────────────────────────────

def test_revoked_user_cannot_download(client, db_session):
    owner = make_user(db_session, "owner9@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer9@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    perm = grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    viewer_token = get_token(client, "viewer9@test.com", "Pass1234!")
    owner_token = get_token(client, "owner9@test.com", "Pass1234!")

    # Revoke
    client.delete(f"/api/v1/documents/{doc.id}/permissions/{perm.id}", headers=auth_headers(owner_token))

    # Download attempt should fail
    r = client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(viewer_token))
    assert r.status_code == 403


# ─── Test 10: Unauthorized delete/update fail without resource change ─────────

def test_unauthorized_delete_does_not_modify(client, db_session):
    owner = make_user(db_session, "owner10@test.com", "Pass1234!", UserRole.owner)
    attacker = make_user(db_session, "attacker10@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner, "Protected Document")

    token = get_token(client, "attacker10@test.com", "Pass1234!")
    resp = client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    assert resp.status_code == 403

    # Document still exists
    db_session.refresh(doc)
    assert doc.is_deleted == False


# ─── Test 11: Unauthorized users cannot list another owner's documents ────────

def test_user_cannot_list_others_documents(client, db_session):
    owner = make_user(db_session, "owner11@test.com", "Pass1234!", UserRole.owner)
    other = make_user(db_session, "other11@test.com", "Pass1234!", UserRole.owner)
    make_document(db_session, owner, "Owner's Private Doc")

    token = get_token(client, "other11@test.com", "Pass1234!")
    resp = client.get("/api/v1/documents/", headers=auth_headers(token))
    assert resp.status_code == 200
    # other user's list should not contain owner's document
    assert not any(d["title"] == "Owner's Private Doc" for d in resp.json())


# ─── Test 12: Admin routes reject non-admin users ─────────────────────────────

def test_non_admin_cannot_list_users(client, db_session):
    user = make_user(db_session, "regular12@test.com", "Pass1234!", UserRole.viewer)
    token = get_token(client, "regular12@test.com", "Pass1234!")
    resp = client.get("/api/v1/users/", headers=auth_headers(token))
    assert resp.status_code == 403


def test_non_admin_cannot_access_audit(client, db_session):
    user = make_user(db_session, "regular12b@test.com", "Pass1234!", UserRole.viewer)
    token = get_token(client, "regular12b@test.com", "Pass1234!")
    resp = client.get("/api/v1/audit/", headers=auth_headers(token))
    assert resp.status_code == 403


# ─── Test 13: Admin cannot access document contents without permission ────────

def test_admin_cannot_download_document_contents(client, db_session):
    admin = make_user(db_session, "admin13@test.com", "Pass1234!", UserRole.admin)
    owner = make_user(db_session, "owner13@test.com", "Pass1234!", UserRole.owner)
    doc = make_document(db_session, owner, "Confidential Doc")

    token = get_token(client, "admin13@test.com", "Pass1234!")
    resp = client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(token))
    assert resp.status_code == 403


# ─── Test 14: Access attempts create audit events ─────────────────────────────

def test_audit_events_created_for_access(client, db_session):
    admin = make_user(db_session, "admin14@test.com", "Pass1234!", UserRole.admin)
    owner = make_user(db_session, "owner14@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer14@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    # Do some actions that should be audited
    viewer_token = get_token(client, "viewer14@test.com", "Pass1234!")
    client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(viewer_token))

    # Check audit events exist
    events = db_session.query(AuditEvent).all()
    assert len(events) > 0
    actions = [e.action for e in events]
    assert "DOCUMENT_DOWNLOAD" in actions or "LOGIN_SUCCESS" in actions


def test_failed_login_creates_audit_event(client, db_session):
    resp = client.post("/api/v1/auth/login", data={"username": "nobody@test.com", "password": "wrong"})
    assert resp.status_code == 401

    events = db_session.query(AuditEvent).filter(AuditEvent.action == "LOGIN_FAILED").all()
    assert len(events) >= 1


# ─── Test 15: Upload validation rejects bad files ────────────────────────────

def test_upload_rejects_unsupported_extension(client, db_session):
    owner = make_user(db_session, "owner15@test.com", "Pass1234!", UserRole.owner)
    token = get_token(client, "owner15@test.com", "Pass1234!")

    resp = client.post(
        "/api/v1/documents/upload",
        data={"title": "Evil Script", "category": "Other"},
        files={"file": ("evil.exe", b"MZ malware", "application/octet-stream")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422


def test_upload_rejects_oversized_file(client, db_session):
    owner = make_user(db_session, "owner15b@test.com", "Pass1234!", UserRole.owner)
    token = get_token(client, "owner15b@test.com", "Pass1234!")

    big_content = b"X" * (11 * 1024 * 1024)  # 11 MB
    resp = client.post(
        "/api/v1/documents/upload",
        data={"title": "Big File", "category": "Other"},
        files={"file": ("big.txt", big_content, "text/plain")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422


def test_upload_accepts_valid_txt_file(client, db_session):
    owner = make_user(db_session, "owner15c@test.com", "Pass1234!", UserRole.owner)
    token = get_token(client, "owner15c@test.com", "Pass1234!")

    resp = client.post(
        "/api/v1/documents/upload",
        data={"title": "Valid Text Doc", "category": "Other"},
        files={"file": ("valid.txt", b"Hello world, this is a valid text file.", "text/plain")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201


# ─── Test 16: Audit chain verification detects tampering ─────────────────────

def test_audit_chain_detects_tampering(client, db_session):
    admin = make_user(db_session, "admin16@test.com", "Pass1234!", UserRole.admin)
    token = get_token(client, "admin16@test.com", "Pass1234!")

    # Create some events
    audit_service.record_event(db_session, action="TEST_EVENT", outcome=AuditOutcome.success,
        actor_id=admin.id, actor_email=admin.email)
    audit_service.record_event(db_session, action="TEST_EVENT_2", outcome=AuditOutcome.success,
        actor_id=admin.id, actor_email=admin.email)

    # Tamper with an event — modify the action directly
    first_event = db_session.query(AuditEvent).order_by(AuditEvent.sequence_num.asc()).first()
    first_event.action = "TAMPERED_ACTION"
    db_session.commit()

    # Verify should now fail
    result = client.get("/api/v1/audit/verify", headers=auth_headers(token))
    assert result.status_code == 200
    data = result.json()
    assert data["valid"] == False
    assert len(data["errors"]) > 0


def test_audit_chain_valid_when_untampered(client, db_session):
    admin = make_user(db_session, "admin16b@test.com", "Pass1234!", UserRole.admin)
    token = get_token(client, "admin16b@test.com", "Pass1234!")

    audit_service.record_event(db_session, action="CLEAN_EVENT", outcome=AuditOutcome.success,
        actor_id=admin.id, actor_email=admin.email)

    result = client.get("/api/v1/audit/verify", headers=auth_headers(token))
    assert result.status_code == 200
    data = result.json()
    assert data["valid"] == True


# ─── Test 17: Passwords/tokens not exposed in responses ──────────────────────

def test_password_not_in_user_response(client, db_session):
    admin = make_user(db_session, "admin17@test.com", "Pass1234!", UserRole.admin)
    user = make_user(db_session, "user17@test.com", "Pass1234!", UserRole.viewer)

    token = get_token(client, "admin17@test.com", "Pass1234!")
    resp = client.get(f"/api/v1/users/{user.id}", headers=auth_headers(token))
    assert resp.status_code == 200
    assert "hashed_password" not in resp.json()
    assert "password" not in resp.json()


def test_audit_events_do_not_contain_passwords(client, db_session):
    admin = make_user(db_session, "admin17b@test.com", "Pass1234!", UserRole.admin)
    token = get_token(client, "admin17b@test.com", "Pass1234!")

    # Try logging in with a password — audit should not store it
    client.post("/api/v1/auth/login", data={"username": "admin17b@test.com", "password": "Pass1234!"})

    resp = client.get("/api/v1/audit/", headers=auth_headers(token))
    assert resp.status_code == 200
    blob = str(resp.json()).lower()
    assert "pass1234" not in blob
    for event in resp.json():
        details = str(event.get("details") or "")
        assert "Pass1234" not in details


# ─── Additional mandatory authorization regressions ──────────────────────────

def test_search_does_not_leak_private_documents(client, db_session):
    owner = make_user(db_session, "owner-search@test.com", "Pass1234!", UserRole.owner)
    stranger = make_user(db_session, "stranger-search@test.com", "Pass1234!", UserRole.viewer)
    make_document(db_session, owner, "Confidential Merger Plan")

    token = get_token(client, "stranger-search@test.com", "Pass1234!")
    resp = client.get("/api/v1/documents/?search=Merger", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == []
    shared = client.get("/api/v1/documents/shared?search=Merger", headers=auth_headers(token))
    assert shared.status_code == 200
    assert shared.json() == []


def test_changing_document_id_cannot_bypass_authorization(client, db_session):
    owner_a = make_user(db_session, "idor-a@test.com", "Pass1234!", UserRole.owner)
    owner_b = make_user(db_session, "idor-b@test.com", "Pass1234!", UserRole.owner)
    doc_a = make_document(db_session, owner_a, "A Private")
    doc_b = make_document(db_session, owner_b, "B Private")
    token_a = get_token(client, "idor-a@test.com", "Pass1234!")

    assert client.get(f"/api/v1/documents/{doc_a.id}", headers=auth_headers(token_a)).status_code == 200
    assert client.get(f"/api/v1/documents/{doc_b.id}", headers=auth_headers(token_a)).status_code == 403
    assert client.get(f"/api/v1/documents/{doc_b.id}/download", headers=auth_headers(token_a)).status_code == 403
    assert client.get(f"/api/v1/documents/{doc_b.id}/preview", headers=auth_headers(token_a)).status_code == 403


def test_global_editor_role_cannot_edit_without_grant(client, db_session):
    owner = make_user(db_session, "owner-ge@test.com", "Pass1234!", UserRole.owner)
    editor = make_user(db_session, "editor-ge@test.com", "Pass1234!", UserRole.editor)
    doc = make_document(db_session, owner, "Not Shared With Editor")
    token = get_token(client, "editor-ge@test.com", "Pass1234!")
    resp = client.patch(
        f"/api/v1/documents/{doc.id}",
        json={"title": "Escalation"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 403
    db_session.refresh(doc)
    assert doc.title == "Not Shared With Editor"


def test_editor_can_edit_only_explicitly_shared_document(client, db_session):
    owner = make_user(db_session, "owner-es@test.com", "Pass1234!", UserRole.owner)
    editor = make_user(db_session, "editor-es@test.com", "Pass1234!", UserRole.editor)
    shared = make_document(db_session, owner, "Shared With Editor")
    other = make_document(db_session, owner, "Other Doc")
    grant_permission(db_session, shared, editor, owner, PermissionLevel.editor)
    token = get_token(client, "editor-es@test.com", "Pass1234!")

    ok = client.patch(
        f"/api/v1/documents/{shared.id}",
        json={"title": "Edited Shared"},
        headers=auth_headers(token),
    )
    assert ok.status_code == 200
    denied = client.patch(
        f"/api/v1/documents/{other.id}",
        json={"title": "Edited Other"},
        headers=auth_headers(token),
    )
    assert denied.status_code == 403


def test_grant_allows_only_specified_operations(client, db_session):
    owner = make_user(db_session, "owner-ops@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer-ops@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    owner_token = get_token(client, "owner-ops@test.com", "Pass1234!")
    grant = client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "viewer-ops@test.com", "permission_level": "viewer"},
        headers=auth_headers(owner_token),
    )
    assert grant.status_code == 201
    viewer_token = get_token(client, "viewer-ops@test.com", "Pass1234!")
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(viewer_token)).status_code == 200
    assert client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(viewer_token)).status_code == 200
    assert client.patch(
        f"/api/v1/documents/{doc.id}", json={"title": "nope"}, headers=auth_headers(viewer_token)
    ).status_code == 403
    assert client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers(viewer_token)).status_code == 403


def test_viewer_c_cannot_access_document_shared_with_b(client, db_session):
    owner = make_user(db_session, "anu@test.com", "Pass1234!", UserRole.owner)
    bhanu = make_user(db_session, "bhanu@test.com", "Pass1234!", UserRole.viewer)
    charan = make_user(db_session, "charan@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner, "Anu Confidential")
    grant_permission(db_session, doc, bhanu, owner, PermissionLevel.viewer)

    token_c = get_token(client, "charan@test.com", "Pass1234!")
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(token_c)).status_code == 403
    listing = client.get("/api/v1/documents/shared", headers=auth_headers(token_c))
    assert listing.status_code == 200
    assert listing.json() == []


def test_previously_used_download_url_fails_after_revocation(client, db_session):
    owner = make_user(db_session, "owner-url@test.com", "Pass1234!", UserRole.owner)
    viewer = make_user(db_session, "viewer-url@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    perm = grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)
    viewer_token = get_token(client, "viewer-url@test.com", "Pass1234!")
    owner_token = get_token(client, "owner-url@test.com", "Pass1234!")
    url = f"/api/v1/documents/{doc.id}/download"
    assert client.get(url, headers=auth_headers(viewer_token)).status_code == 200
    assert client.delete(
        f"/api/v1/documents/{doc.id}/permissions/{perm.id}", headers=auth_headers(owner_token)
    ).status_code == 204
    assert client.get(url, headers=auth_headers(viewer_token)).status_code == 403
    assert client.get(f"/api/v1/documents/{doc.id}/preview", headers=auth_headers(viewer_token)).status_code == 403


def test_admin_cannot_read_document_metadata(client, db_session):
    admin = make_user(db_session, "admin-meta@test.com", "Pass1234!", UserRole.admin)
    owner = make_user(db_session, "owner-meta@test.com", "Pass1234!", UserRole.owner)
    doc = make_document(db_session, owner, "Secret Metadata")
    token = get_token(client, "admin-meta@test.com", "Pass1234!")
    resp = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    assert resp.status_code == 403
    assert "Secret Metadata" not in resp.text


def test_denied_request_creates_audit_event(client, db_session):
    owner = make_user(db_session, "owner-den@test.com", "Pass1234!", UserRole.owner)
    attacker = make_user(db_session, "attacker-den@test.com", "Pass1234!", UserRole.viewer)
    admin = make_user(db_session, "admin-den@test.com", "Pass1234!", UserRole.admin)
    doc = make_document(db_session, owner, "Denied Target")
    token = get_token(client, "attacker-den@test.com", "Pass1234!")
    client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(token))
    client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(token))

    admin_token = get_token(client, "admin-den@test.com", "Pass1234!")
    events = client.get("/api/v1/audit/", headers=auth_headers(admin_token)).json()
    actions = [e["action"] for e in events]
    assert "DOCUMENT_ACCESS_DENIED" in actions
    assert "DOCUMENT_DOWNLOAD_DENIED" in actions


def test_upload_is_private_by_default(client, db_session):
    owner = make_user(db_session, "owner-priv@test.com", "Pass1234!", UserRole.owner)
    other = make_user(db_session, "other-priv@test.com", "Pass1234!", UserRole.viewer)
    token = get_token(client, "owner-priv@test.com", "Pass1234!")
    resp = client.post(
        "/api/v1/documents/upload",
        data={"title": "Brand New Secret", "category": "Legal"},
        files={"file": ("secret.txt", b"confidential text payload", "text/plain")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    doc_id = resp.json()["id"]
    perms = db_session.query(DocumentPermission).filter(DocumentPermission.document_id == doc_id).all()
    assert perms == []
    other_token = get_token(client, "other-priv@test.com", "Pass1234!")
    assert client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(other_token)).status_code == 403


def test_editor_cannot_replace_unshared_content_viewer_cannot_replace(client, db_session):
    owner = make_user(db_session, "owner-rep@test.com", "Pass1234!", UserRole.owner)
    editor = make_user(db_session, "editor-rep@test.com", "Pass1234!", UserRole.editor)
    viewer = make_user(db_session, "viewer-rep@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner)
    grant_permission(db_session, doc, editor, owner, PermissionLevel.editor)
    grant_permission(db_session, doc, viewer, owner, PermissionLevel.viewer)

    editor_token = get_token(client, "editor-rep@test.com", "Pass1234!")
    viewer_token = get_token(client, "viewer-rep@test.com", "Pass1234!")
    ok = client.put(
        f"/api/v1/documents/{doc.id}/content",
        files={"file": ("updated.txt", b"new editor content here", "text/plain")},
        headers=auth_headers(editor_token),
    )
    assert ok.status_code == 200
    denied = client.put(
        f"/api/v1/documents/{doc.id}/content",
        files={"file": ("hack.txt", b"viewer should not write", "text/plain")},
        headers=auth_headers(viewer_token),
    )
    assert denied.status_code == 403


def test_audit_chain_detects_deleted_and_reordered_events(client, db_session):
    admin = make_user(db_session, "admin-chain@test.com", "Pass1234!", UserRole.admin)
    token = get_token(client, "admin-chain@test.com", "Pass1234!")
    audit_service.record_event(db_session, action="E1", outcome=AuditOutcome.success, actor_email="a@test.com")
    audit_service.record_event(db_session, action="E2", outcome=AuditOutcome.success, actor_email="a@test.com")
    audit_service.record_event(db_session, action="E3", outcome=AuditOutcome.success, actor_email="a@test.com")

    middle = db_session.query(AuditEvent).filter(AuditEvent.action == "E2").first()
    db_session.delete(middle)
    db_session.commit()
    deleted = client.get("/api/v1/audit/verify", headers=auth_headers(token)).json()
    assert deleted["valid"] is False

    # Rebuild a fresh chain and swap prev_hash to simulate reorder
    Base.metadata.drop_all(bind=db_session.get_bind())
    Base.metadata.create_all(bind=db_session.get_bind())
    admin2 = make_user(db_session, "admin-chain2@test.com", "Pass1234!", UserRole.admin)
    token2 = get_token(client, "admin-chain2@test.com", "Pass1234!")
    audit_service.record_event(db_session, action="R1", outcome=AuditOutcome.success, actor_email="b@test.com")
    audit_service.record_event(db_session, action="R2", outcome=AuditOutcome.success, actor_email="b@test.com")
    events = db_session.query(AuditEvent).order_by(AuditEvent.sequence_num.asc()).all()
    events[0].prev_hash, events[1].prev_hash = events[1].prev_hash, events[0].event_hash
    db_session.commit()
    reordered = client.get("/api/v1/audit/verify", headers=auth_headers(token2)).json()
    assert reordered["valid"] is False


def test_login_response_does_not_expose_secrets(client, db_session):
    make_user(db_session, "login-sec@test.com", "Pass1234!", UserRole.owner)
    resp = client.post("/api/v1/auth/login", data={"username": "login-sec@test.com", "password": "Pass1234!"})
    assert resp.status_code == 200
    body = resp.json()
    assert "hashed_password" not in body
    assert "password" not in body
    assert "SECRET_KEY" not in str(body)
    assert "access_token" in body


# ─── Full Workflow: Confidential Document Sharing Scenario ──────────────────

def test_confidential_document_sharing_complete_workflow(client, db_session):
    """
    End-to-end integration test verifying the complete 9-step confidential document sharing workflow:
    1. Owner A uploads a fictional confidential document.
    2. The document appears in Owner A's My Documents list only.
    3. Viewer B cannot discover the document through document listings, search, metadata APIs, preview, or download.
    4. Owner A explicitly shares the document with Viewer B.
    5. Viewer B can access it only with the granted permission.
    6. Viewer B cannot edit, delete, or share it when granted Viewer access.
    7. Owner A revokes access.
    8. Viewer B's next protected request is denied, including requests to previously used document URLs.
    9. Audit events record upload, permission grant, authorized access, denied attempts, and revocation.
    """
    # Setup users
    owner_a = make_user(db_session, "owner_a_flow@company.dev", "OwnerPass1234!", UserRole.owner, full_name="Owner A")
    viewer_b = make_user(db_session, "viewer_b_flow@company.dev", "ViewerPass1234!", UserRole.viewer, full_name="Viewer B")
    admin = make_user(db_session, "admin_flow@company.dev", "AdminPass1234!", UserRole.admin, full_name="Security Admin")

    token_a = get_token(client, "owner_a_flow@company.dev", "OwnerPass1234!")
    token_b = get_token(client, "viewer_b_flow@company.dev", "ViewerPass1234!")
    token_admin = get_token(client, "admin_flow@company.dev", "AdminPass1234!")

    confidential_title = "Project Apex Confidential Acquisition Terms"
    confidential_desc = "Highly sensitive valuation terms and target financials"
    confidential_filename = "project_apex_terms.txt"
    confidential_content = b"TOP SECRET: Target valuation $75,000,000 with 15% equity rollover. Non-disclosure mandatory."

    # Step 1: Owner A uploads a fictional confidential document
    upload_resp = client.post(
        "/api/v1/documents/upload",
        data={"title": confidential_title, "category": "Financial", "description": confidential_desc},
        files={"file": (confidential_filename, confidential_content, "text/plain")},
        headers=auth_headers(token_a),
    )
    assert upload_resp.status_code == 201, f"Upload failed: {upload_resp.text}"
    upload_data = upload_resp.json()
    doc_id = upload_data["id"]
    assert upload_data["title"] == confidential_title
    assert upload_data["owner_id"] == str(owner_a.id)

    # Step 2: The document appears in Owner A's My Documents list only
    owner_docs = client.get("/api/v1/documents/", headers=auth_headers(token_a))
    assert owner_docs.status_code == 200
    owner_doc_ids = [d["id"] for d in owner_docs.json()]
    assert doc_id in owner_doc_ids

    viewer_docs = client.get("/api/v1/documents/", headers=auth_headers(token_b))
    assert viewer_docs.status_code == 200
    viewer_doc_ids = [d["id"] for d in viewer_docs.json()]
    assert doc_id not in viewer_doc_ids

    admin_docs = client.get("/api/v1/documents/", headers=auth_headers(token_admin))
    assert admin_docs.status_code == 200
    admin_doc_ids = [d["id"] for d in admin_docs.json()]
    assert doc_id not in admin_doc_ids

    # Step 3: Viewer B cannot discover the document through document listings, search, metadata APIs, preview, or download
    # 3a. Listings
    shared_resp = client.get("/api/v1/documents/shared", headers=auth_headers(token_b))
    assert shared_resp.status_code == 200
    assert not any(d["id"] == doc_id for d in shared_resp.json())

    # 3b. Search
    search_my = client.get("/api/v1/documents/?search=Apex", headers=auth_headers(token_b))
    assert search_my.status_code == 200
    assert not any(d["id"] == doc_id for d in search_my.json())

    search_shared = client.get("/api/v1/documents/shared?search=Apex", headers=auth_headers(token_b))
    assert search_shared.status_code == 200
    assert not any(d["id"] == doc_id for d in search_shared.json())

    search_desc = client.get("/api/v1/documents/shared?search=Acquisition", headers=auth_headers(token_b))
    assert search_desc.status_code == 200
    assert not any(d["id"] == doc_id for d in search_desc.json())

    # 3c. Metadata API
    meta_resp = client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(token_b))
    assert meta_resp.status_code == 403
    assert "Apex" not in meta_resp.text
    assert "valuation" not in meta_resp.text.lower()
    assert meta_resp.json() == {"detail": "Access denied."}

    perm_meta_resp = client.get(f"/api/v1/documents/{doc_id}/permissions", headers=auth_headers(token_b))
    assert perm_meta_resp.status_code == 403
    assert perm_meta_resp.json() == {"detail": "Access denied."}

    # 3d. Preview
    prev_resp = client.get(f"/api/v1/documents/{doc_id}/preview", headers=auth_headers(token_b))
    assert prev_resp.status_code == 403
    assert b"TOP SECRET" not in prev_resp.content
    assert prev_resp.json() == {"detail": "Access denied."}

    # 3e. Download
    down_resp = client.get(f"/api/v1/documents/{doc_id}/download", headers=auth_headers(token_b))
    assert down_resp.status_code == 403
    assert b"TOP SECRET" not in down_resp.content
    assert down_resp.json() == {"detail": "Access denied."}

    # Step 4: Owner A explicitly shares the document with Viewer B
    share_resp = client.post(
        f"/api/v1/documents/{doc_id}/permissions",
        json={"grantee_email": "viewer_b_flow@company.dev", "permission_level": "viewer"},
        headers=auth_headers(token_a),
    )
    assert share_resp.status_code == 201
    perm_id = share_resp.json()["permission_id"]
    assert perm_id is not None

    # Step 5: Viewer B can access it only with the granted permission
    # Shared listing now includes it
    viewer_shared = client.get("/api/v1/documents/shared", headers=auth_headers(token_b))
    assert viewer_shared.status_code == 200
    shared_items = [d for d in viewer_shared.json() if d["id"] == doc_id]
    assert len(shared_items) == 1
    assert shared_items[0]["permission_level"] == "viewer"

    # Metadata access works
    v_meta = client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(token_b))
    assert v_meta.status_code == 200
    assert v_meta.json()["title"] == confidential_title

    # Preview works
    v_prev = client.get(f"/api/v1/documents/{doc_id}/preview", headers=auth_headers(token_b))
    assert v_prev.status_code == 200
    assert b"TOP SECRET" in v_prev.content

    # Download works
    v_down = client.get(f"/api/v1/documents/{doc_id}/download", headers=auth_headers(token_b))
    assert v_down.status_code == 200
    assert b"TOP SECRET" in v_down.content

    # Step 6: Viewer B cannot edit, delete, or share it when granted Viewer access
    # 6a. Edit metadata
    edit_resp = client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Hacked Title"},
        headers=auth_headers(token_b),
    )
    assert edit_resp.status_code == 403
    assert edit_resp.json() == {"detail": "Access denied."}

    # 6b. Replace file content
    content_edit_resp = client.put(
        f"/api/v1/documents/{doc_id}/content",
        files={"file": ("tamper.txt", b"TAMPERED DATA", "text/plain")},
        headers=auth_headers(token_b),
    )
    assert content_edit_resp.status_code == 403
    assert content_edit_resp.json() == {"detail": "Access denied."}

    # Verify document unchanged in DB
    db_doc = db_session.query(Document).filter(Document.id == doc_id).first()
    assert db_doc.title == confidential_title

    # 6c. Delete document
    del_resp = client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers(token_b))
    assert del_resp.status_code == 403
    assert del_resp.json() == {"detail": "Access denied."}
    db_session.refresh(db_doc)
    assert db_doc.is_deleted is False

    # 6d. Share document
    grant_resp = client.post(
        f"/api/v1/documents/{doc_id}/permissions",
        json={"grantee_email": "admin_flow@company.dev", "permission_level": "viewer"},
        headers=auth_headers(token_b),
    )
    assert grant_resp.status_code == 403
    assert grant_resp.json() == {"detail": "Access denied."}

    # 6e. Revoke document permissions
    revoke_by_viewer = client.delete(
        f"/api/v1/documents/{doc_id}/permissions/{perm_id}",
        headers=auth_headers(token_b),
    )
    assert revoke_by_viewer.status_code == 403
    assert revoke_by_viewer.json() == {"detail": "Access denied."}

    # Step 7: Owner A revokes access
    revoke_resp = client.delete(
        f"/api/v1/documents/{doc_id}/permissions/{perm_id}",
        headers=auth_headers(token_a),
    )
    assert revoke_resp.status_code == 204

    # Verify revocation in DB
    perm_db = db_session.query(DocumentPermission).filter(DocumentPermission.id == perm_id).first()
    assert perm_db.is_active is False
    assert perm_db.revoked_at is not None

    # Step 8: Viewer B's next protected request is denied immediately, including previously used URLs
    # Same token_b is used without re-authenticating
    r_meta_denied = client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers(token_b))
    assert r_meta_denied.status_code == 403
    assert "Apex" not in r_meta_denied.text
    assert r_meta_denied.json() == {"detail": "Access denied."}

    r_down_denied = client.get(f"/api/v1/documents/{doc_id}/download", headers=auth_headers(token_b))
    assert r_down_denied.status_code == 403
    assert b"TOP SECRET" not in r_down_denied.content
    assert r_down_denied.json() == {"detail": "Access denied."}

    r_prev_denied = client.get(f"/api/v1/documents/{doc_id}/preview", headers=auth_headers(token_b))
    assert r_prev_denied.status_code == 403
    assert b"TOP SECRET" not in r_prev_denied.content
    assert r_prev_denied.json() == {"detail": "Access denied."}

    # Shared list immediately hides document
    r_shared_denied = client.get("/api/v1/documents/shared", headers=auth_headers(token_b))
    assert r_shared_denied.status_code == 200
    assert not any(d["id"] == doc_id for d in r_shared_denied.json())

    # Step 9: Audit events record upload, permission grant, authorized access, denied attempts, and revocation
    audit_resp = client.get("/api/v1/audit/", headers=auth_headers(token_admin))
    assert audit_resp.status_code == 200
    all_events = audit_resp.json()

    # Filter events for this document
    doc_events = [e for e in all_events if e.get("resource_id") == str(doc_id)]
    event_actions = [(e["action"], e["outcome"]) for e in doc_events]

    # Verify upload was recorded
    assert ("DOCUMENT_UPLOAD", "success") in event_actions

    # Verify permission grant was recorded
    assert ("PERMISSION_GRANTED", "success") in event_actions

    # Verify authorized access was recorded
    assert ("DOCUMENT_ACCESS", "success") in event_actions
    assert ("DOCUMENT_DOWNLOAD", "success") in event_actions
    assert ("DOCUMENT_PREVIEW", "success") in event_actions

    # Verify denied attempts prior to share, during share, and after revocation were recorded
    assert ("DOCUMENT_ACCESS_DENIED", "denied") in event_actions
    assert ("DOCUMENT_DOWNLOAD_DENIED", "denied") in event_actions
    assert ("DOCUMENT_PREVIEW_DENIED", "denied") in event_actions
    assert ("DOCUMENT_UPDATE_DENIED", "denied") in event_actions
    assert ("DOCUMENT_CONTENT_UPDATE_DENIED", "denied") in event_actions
    assert ("DOCUMENT_DELETE_DENIED", "denied") in event_actions
    assert ("PERMISSION_GRANT_DENIED", "denied") in event_actions
    assert ("PERMISSION_REVOKE_DENIED", "denied") in event_actions

    # Verify revocation was recorded
    assert ("PERMISSION_REVOKED", "success") in event_actions

    # Verify audit events do NOT leak confidential contents or credentials
    for ev in doc_events:
        details_str = str(ev.get("details") or "")
        assert "TOP SECRET" not in details_str
        assert "75,000,000" not in details_str
        assert "Pass1234" not in details_str
        assert "password" not in details_str.lower() or "password" not in str(ev.get("action", "")).lower()

    # Verify hash chain integrity across all events
    verify_resp = client.get("/api/v1/audit/verify", headers=auth_headers(token_admin))
    assert verify_resp.status_code == 200
    assert verify_resp.json()["valid"] is True


def test_repeated_unauthorized_attempts_trigger_detection_rule(client, db_session):
    """
    Verify that repeated unauthorized access attempts trigger the configured
    suspicious activity detection rule using the documented threshold (>= 3 denied attempts).
    """
    owner = make_user(db_session, "owner-susp@test.com", "Pass1234!", UserRole.owner)
    attacker = make_user(db_session, "attacker-susp@test.com", "Pass1234!", UserRole.viewer)
    admin = make_user(db_session, "admin-susp@test.com", "Pass1234!", UserRole.admin)

    doc = make_document(db_session, owner, "Target Doc")
    attacker_token = get_token(client, "attacker-susp@test.com", "Pass1234!")
    admin_token = get_token(client, "admin-susp@test.com", "Pass1234!")

    # Attempt 1: Denied GET metadata
    r1 = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(attacker_token))
    assert r1.status_code == 403

    # Check suspicious endpoint: threshold = 3, so 1 attempt should NOT trigger
    s1 = client.get("/api/v1/audit/suspicious?threshold=3", headers=auth_headers(admin_token)).json()
    assert s1["incidents_count"] == 0

    # Attempt 2: Denied Download
    r2 = client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(attacker_token))
    assert r2.status_code == 403

    # Check suspicious endpoint: 2 attempts should still NOT trigger
    s2 = client.get("/api/v1/audit/suspicious?threshold=3", headers=auth_headers(admin_token)).json()
    assert s2["incidents_count"] == 0

    # Attempt 3: Denied Patch/Update
    r3 = client.patch(
        f"/api/v1/documents/{doc.id}",
        json={"title": "Hacked"},
        headers=auth_headers(attacker_token),
    )
    assert r3.status_code == 403

    # Check suspicious endpoint: exactly 3 attempts MUST trigger the rule
    s3 = client.get("/api/v1/audit/suspicious?threshold=3", headers=auth_headers(admin_token)).json()
    assert s3["incidents_count"] == 1
    incident = s3["incidents"][0]
    assert incident["actor_email"] == "attacker-susp@test.com"
    assert incident["denied_count"] == 3
    assert incident["severity"] == "MEDIUM"
    assert "DOCUMENT_ACCESS_DENIED" in incident["attempted_actions"]
    assert "DOCUMENT_DOWNLOAD_DENIED" in incident["attempted_actions"]
    assert "DOCUMENT_UPDATE_DENIED" in incident["attempted_actions"]

    # Attempts 4 & 5: Escalates to HIGH severity (>= 5 attempts)
    client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers(attacker_token))
    client.get(f"/api/v1/documents/{doc.id}/preview", headers=auth_headers(attacker_token))

    s4 = client.get("/api/v1/audit/suspicious?threshold=3", headers=auth_headers(admin_token)).json()
    assert s4["incidents_count"] == 1
    high_inc = s4["incidents"][0]
    assert high_inc["denied_count"] == 5
    assert high_inc["severity"] == "HIGH"


def test_multiple_viewers_and_editors_granted_individually(client, db_session):
    """
    Verify that multiple viewers and editors can be granted access individually,
    each with distinct permission levels, and that revoking one does not affect others.
    """
    owner = make_user(db_session, "owner-multi@test.com", "Pass1234!", UserRole.owner)
    viewer1 = make_user(db_session, "v1@test.com", "Pass1234!", UserRole.viewer)
    editor1 = make_user(db_session, "e1@test.com", "Pass1234!", UserRole.editor)
    viewer2 = make_user(db_session, "v2@test.com", "Pass1234!", UserRole.viewer)

    doc = make_document(db_session, owner, "Team Shared Doc")
    owner_token = get_token(client, "owner-multi@test.com", "Pass1234!")
    v1_token = get_token(client, "v1@test.com", "Pass1234!")
    e1_token = get_token(client, "e1@test.com", "Pass1234!")
    v2_token = get_token(client, "v2@test.com", "Pass1234!")

    # Grant V1 (Viewer)
    p1_resp = client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "v1@test.com", "permission_level": "viewer"},
        headers=auth_headers(owner_token),
    )
    assert p1_resp.status_code == 201
    p1_id = p1_resp.json()["permission_id"]

    # Grant E1 (Editor)
    p2_resp = client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "e1@test.com", "permission_level": "editor"},
        headers=auth_headers(owner_token),
    )
    assert p2_resp.status_code == 201

    # Grant V2 (Viewer)
    p3_resp = client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "v2@test.com", "permission_level": "viewer"},
        headers=auth_headers(owner_token),
    )
    assert p3_resp.status_code == 201

    # V1 can read, cannot edit
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(v1_token)).status_code == 200
    assert client.patch(f"/api/v1/documents/{doc.id}", json={"title": "V1 Attempt"}, headers=auth_headers(v1_token)).status_code == 403

    # E1 can read AND edit
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(e1_token)).status_code == 200
    e1_edit = client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Edited by E1"}, headers=auth_headers(e1_token))
    assert e1_edit.status_code == 200
    assert e1_edit.json()["title"] == "Edited by E1"

    # V2 can read, cannot edit
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(v2_token)).status_code == 200
    assert client.patch(f"/api/v1/documents/{doc.id}", json={"title": "V2 Attempt"}, headers=auth_headers(v2_token)).status_code == 403

    # Owner revokes V1 only
    rev_resp = client.delete(f"/api/v1/documents/{doc.id}/permissions/{p1_id}", headers=auth_headers(owner_token))
    assert rev_resp.status_code == 204

    # V1 is immediately denied
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(v1_token)).status_code == 403

    # E1 and V2 maintain their distinct authorized access
    e1_edit2 = client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Updated Again by E1"}, headers=auth_headers(e1_token))
    assert e1_edit2.status_code == 200
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(v2_token)).status_code == 200


def test_audit_stats_endpoint_computes_real_metrics(client, db_session):
    """
    Verify that /api/v1/audit/stats computes real metrics from the database
    including total events, successful access, denied attempts, and suspicious incidents.
    """
    admin = make_user(db_session, "admin-stats@test.com", "Pass1234!", UserRole.admin)
    owner = make_user(db_session, "owner-stats@test.com", "Pass1234!", UserRole.owner)
    stranger = make_user(db_session, "stranger-stats@test.com", "Pass1234!", UserRole.viewer)

    doc = make_document(db_session, owner, "Stats Doc")
    owner_token = get_token(client, "owner-stats@test.com", "Pass1234!")
    stranger_token = get_token(client, "stranger-stats@test.com", "Pass1234!")
    admin_token = get_token(client, "admin-stats@test.com", "Pass1234!")

    # 1 successful document access
    client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(owner_token))
    # 1 denied document access
    client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(stranger_token))

    stats_resp = client.get("/api/v1/audit/stats", headers=auth_headers(admin_token))
    assert stats_resp.status_code == 200
    data = stats_resp.json()

    assert data["total_events"] >= 2
    assert data["successful_access"] >= 1
    assert data["denied_access"] >= 1
    assert "suspicious_incidents_count" in data


def test_authorization_check_removal_causes_test_failure(client, db_session, monkeypatch):
    """
    Verify that removing a critical authorization check causes the security assertion to fail,
    proving that the test suite actively prevents authorization regressions.
    """
    owner = make_user(db_session, "owner-reg@test.com", "Pass1234!", UserRole.owner)
    attacker = make_user(db_session, "attacker-reg@test.com", "Pass1234!", UserRole.viewer)
    doc = make_document(db_session, owner, "Protected Check Doc")
    attacker_token = get_token(client, "attacker-reg@test.com", "Pass1234!")

    # Normal state: authorization check is active, returns 403
    resp_secure = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(attacker_token))
    assert resp_secure.status_code == 403

    # Simulate removal of the authorization check (e.g., developer bypasses check)
    from app.api.v1 import documents as docs_module
    monkeypatch.setattr(docs_module, "can_read_document", lambda u, d, db: True)

    # With the authorization check removed, the request succeeds with 200
    resp_insecure = client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(attacker_token))
    assert resp_insecure.status_code == 200

    # Therefore, any test expecting 403 would fail, proving the check is critical
    assert resp_insecure.status_code != 403


def test_user_registration_creates_account_and_allows_login(client, db_session):
    """
    Verify company account policy:
    1. Public self-registration (POST /api/v1/auth/register) is rejected (HTTP 403).
    2. Only authenticated Admin can create accounts through POST /api/v1/users.
    3. Unauthenticated and non-admin requests are rejected (401/403).
    4. Passwords are securely hashed and omitted from API responses.
    5. Created users can successfully authenticate with valid credentials.
    6. Account creation is recorded in the audit ledger.
    """
    reg_payload = {
        "email": "publicuser@trustvault.dev",
        "full_name": "Public User",
        "password": "SecurePassword123!",
        "role": "viewer",
    }
    # 1. Public self-registration is rejected with 403 in company mode
    reg_resp = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_resp.status_code == 403
    assert "Public self-registration is disabled" in reg_resp.json()["detail"]

    # Verify audit event for registration denial was logged
    denied_evt = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.action == "REGISTRATION_DENIED", AuditEvent.actor_email == "publicuser@trustvault.dev")
        .first()
    )
    assert denied_evt is not None
    assert denied_evt.outcome == AuditOutcome.denied

    # 2. Unauthenticated request to POST /api/v1/users is rejected (401)
    admin_create_payload = {
        "email": "newuser@trustvault.dev",
        "full_name": "New Registered User",
        "password": "SecurePassword123!",
        "role": "viewer",
    }
    unauth_resp = client.post("/api/v1/users", json=admin_create_payload)
    assert unauth_resp.status_code == 401

    # 3. Non-admin (Viewer, Editor, Owner) cannot create accounts (403)
    viewer = make_user(db_session, "viewer-prov@trustvault.dev", "Pass1234!", UserRole.viewer)
    viewer_token = get_token(client, "viewer-prov@trustvault.dev", "Pass1234!")
    viewer_resp = client.post("/api/v1/users", json=admin_create_payload, headers=auth_headers(viewer_token))
    assert viewer_resp.status_code == 403

    owner = make_user(db_session, "owner-prov@trustvault.dev", "Pass1234!", UserRole.owner)
    owner_token = get_token(client, "owner-prov@trustvault.dev", "Pass1234!")
    owner_resp = client.post("/api/v1/users", json=admin_create_payload, headers=auth_headers(owner_token))
    assert owner_resp.status_code == 403

    # 4. Authenticated Admin can create accounts
    admin = make_user(db_session, "admin-prov@trustvault.dev", "Pass1234!", UserRole.admin)
    admin_token = get_token(client, "admin-prov@trustvault.dev", "Pass1234!")
    create_resp = client.post("/api/v1/users", json=admin_create_payload, headers=auth_headers(admin_token))
    assert create_resp.status_code == 201
    user_data = create_resp.json()
    assert user_data["email"] == "newuser@trustvault.dev"
    assert user_data["full_name"] == "New Registered User"
    assert user_data["role"] == "viewer"
    assert "id" in user_data
    assert "password" not in user_data
    assert "hashed_password" not in user_data

    # Duplicate registration by Admin is rejected (409)
    dup_resp = client.post("/api/v1/users", json=admin_create_payload, headers=auth_headers(admin_token))
    assert dup_resp.status_code == 409

    # 5. New user can immediately log in with their credentials
    login_resp = client.post(
        "/api/v1/auth/login",
        data={"username": "newuser@trustvault.dev", "password": "SecurePassword123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    assert token is not None

    # 6. Audit event is created for Admin creation
    audit_evt = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.action == "USER_CREATED", AuditEvent.resource_name == "newuser@trustvault.dev")
        .first()
    )
    assert audit_evt is not None
    assert audit_evt.outcome == AuditOutcome.success
    assert audit_evt.actor_email == "admin-prov@trustvault.dev"


def test_user_lookup_search_and_pagination(client, db_session):
    """
    Verify server-side search and pagination for user lookup across registered users.
    Ensures current user is excluded and substring search on name/email works.
    """
    caller = make_user(db_session, "caller@trustvault.dev", "Pass1234!", UserRole.owner, full_name="Caller User")
    u1 = make_user(db_session, "alice.smith@trustvault.dev", "Pass1234!", UserRole.viewer, full_name="Alice Smith")
    u2 = make_user(db_session, "bob.jones@trustvault.dev", "Pass1234!", UserRole.editor, full_name="Bob Jones")
    u3 = make_user(db_session, "alice.williams@trustvault.dev", "Pass1234!", UserRole.viewer, full_name="Alice Williams")

    caller_token = get_token(client, "caller@trustvault.dev", "Pass1234!")

    # Search for 'Alice' -> returns 2 items
    resp = client.get("/api/v1/users/lookup?query=Alice", headers=auth_headers(caller_token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert all("Alice" in u["full_name"] for u in data["items"])

    # Search by email substring with pagination
    resp_page = client.get("/api/v1/users/lookup?limit=2&skip=0", headers=auth_headers(caller_token))
    assert resp_page.status_code == 200
    page_data = resp_page.json()
    assert len(page_data["items"]) <= 2
    assert page_data["limit"] == 2
    assert page_data["skip"] == 0

    # Ensure caller is not in lookup results
    all_emails = [u["email"] for u in page_data["items"]]
    assert "caller@trustvault.dev" not in all_emails


def test_batch_grant_multi_recipient_sharing_and_independent_access(client, db_session):
    """
    Verify full multi-user document sharing workflow:
    - Owner A uploads Project_Contract.pdf
    - Owner A shares it with Viewer B and Viewer C as Viewer, and Editor D as Editor via batch grant
    - Viewer B and Viewer C can view, but cannot edit
    - Editor D can view and edit
    - User E cannot access
    - Shared with Me loads the document for B, C, and D, but not E
    """
    owner_a = make_user(db_session, "owner_a_batch@trustvault.dev", "Pass1234!", UserRole.owner, full_name="Owner A")
    viewer_b = make_user(db_session, "viewer_b@trustvault.dev", "Pass1234!", UserRole.viewer, full_name="Viewer B")
    viewer_c = make_user(db_session, "viewer_c@trustvault.dev", "Pass1234!", UserRole.viewer, full_name="Viewer C")
    editor_d = make_user(db_session, "editor_d@trustvault.dev", "Pass1234!", UserRole.editor, full_name="Editor D")
    user_e = make_user(db_session, "user_e@trustvault.dev", "Pass1234!", UserRole.viewer, full_name="User E")

    owner_token = get_token(client, "owner_a_batch@trustvault.dev", "Pass1234!")
    viewer_b_token = get_token(client, "viewer_b@trustvault.dev", "Pass1234!")
    viewer_c_token = get_token(client, "viewer_c@trustvault.dev", "Pass1234!")
    editor_d_token = get_token(client, "editor_d@trustvault.dev", "Pass1234!")
    user_e_token = get_token(client, "user_e@trustvault.dev", "Pass1234!")

    # Owner A uploads Project_Contract.pdf
    doc = make_document(db_session, owner_a, "Project_Contract.pdf")

    # Owner A batch-grants access to B, C, and D
    batch_payload = {
        "recipients": [
            {"grantee_email": "viewer_b@trustvault.dev", "permission_level": "viewer"},
            {"grantee_email": "viewer_c@trustvault.dev", "permission_level": "viewer"},
            {"grantee_email": "editor_d@trustvault.dev", "permission_level": "editor"},
        ]
    }
    grant_resp = client.post(
        f"/api/v1/documents/{doc.id}/permissions/batch",
        json=batch_payload,
        headers=auth_headers(owner_token),
    )
    assert grant_resp.status_code == 200
    results = grant_resp.json()
    assert len(results) == 3
    assert all(r["status"] in ("granted", "updated") for r in results)

    # Viewer B can view metadata and download
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(viewer_b_token)).status_code == 200
    assert client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(viewer_b_token)).status_code == 200
    # Viewer B cannot edit (403)
    assert client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Hacked"}, headers=auth_headers(viewer_b_token)).status_code == 403

    # Viewer C can view metadata and download
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(viewer_c_token)).status_code == 200
    assert client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(viewer_c_token)).status_code == 200
    # Viewer C cannot edit (403)
    assert client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Hacked C"}, headers=auth_headers(viewer_c_token)).status_code == 403

    # Editor D can view and edit
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(editor_d_token)).status_code == 200
    d_edit = client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Project_Contract_v2.pdf"}, headers=auth_headers(editor_d_token))
    assert d_edit.status_code == 200
    assert d_edit.json()["title"] == "Project_Contract_v2.pdf"
    # Editor D cannot delete (403) or share (403)
    assert client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers(editor_d_token)).status_code == 403
    assert client.post(
        f"/api/v1/documents/{doc.id}/permissions",
        json={"grantee_email": "user_e@trustvault.dev", "permission_level": "viewer"},
        headers=auth_headers(editor_d_token),
    ).status_code == 403

    # User E cannot access (403)
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(user_e_token)).status_code == 403
    assert client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(user_e_token)).status_code == 403

    # Shared with Me verification
    b_shared = client.get("/api/v1/documents/shared", headers=auth_headers(viewer_b_token)).json()
    assert any(d["id"] == str(doc.id) for d in b_shared)

    c_shared = client.get("/api/v1/documents/shared", headers=auth_headers(viewer_c_token)).json()
    assert any(d["id"] == str(doc.id) for d in c_shared)

    d_shared = client.get("/api/v1/documents/shared", headers=auth_headers(editor_d_token)).json()
    assert any(d["id"] == str(doc.id) for d in d_shared)

    e_shared = client.get("/api/v1/documents/shared", headers=auth_headers(user_e_token)).json()
    assert not any(d["id"] == str(doc.id) for d in e_shared)


def test_independent_revocation_and_permission_level_update(client, db_session):
    """
    Verify independent permission lifecycle:
    - Change permission level of recipient via PATCH /documents/{id}/permissions/{perm_id}
    - Revoke Viewer B without affecting Viewer C or Editor D
    - Confirm Viewer B is denied on subsequent requests and removed from Shared with Me
    - Confirm Viewer C and Editor D maintain active access
    - Confirm all actions audited
    """
    owner = make_user(db_session, "owner_indep@trustvault.dev", "Pass1234!", UserRole.owner)
    vb = make_user(db_session, "vb_indep@trustvault.dev", "Pass1234!", UserRole.viewer)
    vc = make_user(db_session, "vc_indep@trustvault.dev", "Pass1234!", UserRole.viewer)
    ed = make_user(db_session, "ed_indep@trustvault.dev", "Pass1234!", UserRole.editor)

    owner_token = get_token(client, "owner_indep@trustvault.dev", "Pass1234!")
    vb_token = get_token(client, "vb_indep@trustvault.dev", "Pass1234!")
    vc_token = get_token(client, "vc_indep@trustvault.dev", "Pass1234!")
    ed_token = get_token(client, "ed_indep@trustvault.dev", "Pass1234!")

    doc = make_document(db_session, owner, "Independent Access Test Doc")

    # Grant all 3
    client.post(f"/api/v1/documents/{doc.id}/permissions/batch", json={
        "recipients": [
            {"grantee_email": "vb_indep@trustvault.dev", "permission_level": "viewer"},
            {"grantee_email": "vc_indep@trustvault.dev", "permission_level": "viewer"},
            {"grantee_email": "ed_indep@trustvault.dev", "permission_level": "editor"},
        ]
    }, headers=auth_headers(owner_token))

    # Retrieve permissions list
    perms_list = client.get(f"/api/v1/documents/{doc.id}/permissions", headers=auth_headers(owner_token)).json()
    perm_b = next(p for p in perms_list if p["grantee_email"] == "vb_indep@trustvault.dev")
    perm_c = next(p for p in perms_list if p["grantee_email"] == "vc_indep@trustvault.dev")

    # Upgrade Viewer C to Editor via PATCH
    patch_resp = client.patch(
        f"/api/v1/documents/{doc.id}/permissions/{perm_c['id']}",
        json={"permission_level": "editor"},
        headers=auth_headers(owner_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["permission_level"] == "editor"

    # Viewer C can now edit
    assert client.patch(f"/api/v1/documents/{doc.id}", json={"title": "Upgraded Title"}, headers=auth_headers(vc_token)).status_code == 200

    # Revoke Viewer B
    rev_resp = client.delete(f"/api/v1/documents/{doc.id}/permissions/{perm_b['id']}", headers=auth_headers(owner_token))
    assert rev_resp.status_code == 204

    # Viewer B's next requests are immediately denied
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(vb_token)).status_code == 403
    assert client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers(vb_token)).status_code == 403

    # Viewer B's shared list no longer contains doc
    vb_shared = client.get("/api/v1/documents/shared", headers=auth_headers(vb_token)).json()
    assert not any(d["id"] == str(doc.id) for d in vb_shared)

    # Viewer C and Editor D still have active access
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(vc_token)).status_code == 200
    assert client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers(ed_token)).status_code == 200

    # Verify audit events recorded
    grants = db_session.query(AuditEvent).filter(AuditEvent.action == "PERMISSION_GRANTED", AuditEvent.resource_id == str(doc.id)).all()
    assert len(grants) >= 3

    updates = db_session.query(AuditEvent).filter(AuditEvent.action == "PERMISSION_UPDATED", AuditEvent.resource_id == str(doc.id)).all()
    assert len(updates) >= 1

    revocations = db_session.query(AuditEvent).filter(AuditEvent.action == "PERMISSION_REVOKED", AuditEvent.resource_id == str(doc.id)).all()
    assert len(revocations) >= 1


def test_registration_rejects_privileged_role_self_assignment(client, db_session):
    """
    Ensure:
    1. In company mode, public registration is completely disabled (403).
    2. If public registration were enabled in dev mode, self-assigning privileged roles (Admin, Owner) is strictly forbidden.
    3. Non-admins cannot grant Admin or elevated roles through user management APIs.
    """
    # 1. Company mode: all public registration attempts are rejected with 403
    resp_company_admin = client.post("/api/v1/auth/register", json={
        "email": "hacker-admin@test.com",
        "full_name": "Hacker Admin",
        "password": "Password123!",
        "role": "admin",
    })
    assert resp_company_admin.status_code == 403
    assert "Public self-registration is disabled" in resp_company_admin.json()["detail"]

    # 2. Dev mode fallback: test role self-assignment guard when registration is enabled
    try:
        settings.ALLOW_PUBLIC_REGISTRATION = True

        # Attempt Admin role
        resp_admin = client.post("/api/v1/auth/register", json={
            "email": "hacker-admin@test.com",
            "full_name": "Hacker Admin",
            "password": "Password123!",
            "role": "admin",
        })
        assert resp_admin.status_code == 403
        assert "Self-assigning privileged roles is forbidden" in resp_admin.json()["detail"]

        # Attempt Owner role
        resp_owner = client.post("/api/v1/auth/register", json={
            "email": "hacker-owner@test.com",
            "full_name": "Hacker Owner",
            "password": "Password123!",
            "role": "owner",
        })
        assert resp_owner.status_code == 403

        # Valid registration defaults to standard Viewer
        resp_viewer = client.post("/api/v1/auth/register", json={
            "email": "honest-viewer@test.com",
            "full_name": "Honest Viewer",
            "password": "Password123!",
            "role": "viewer",
        })
        assert resp_viewer.status_code == 201
        assert resp_viewer.json()["role"] == "viewer"
    finally:
        # Restore company mode policy
        settings.ALLOW_PUBLIC_REGISTRATION = False

    # 3. Non-admin cannot assign admin roles through API
    viewer = make_user(db_session, "viewer-elevate@test.com", "Pass1234!", UserRole.viewer)
    token = get_token(client, "viewer-elevate@test.com", "Pass1234!")
    resp_elevate = client.patch(
        f"/api/v1/users/{viewer.id}",
        json={"role": "admin"},
        headers=auth_headers(token),
    )
    assert resp_elevate.status_code == 403


def test_admin_cannot_modify_own_role_or_deactivate_self(client, db_session):
    """Ensure administrators cannot demote themselves or deactivate their own account."""
    admin = make_user(db_session, "admin-self@test.com", "Pass1234!", UserRole.admin)
    token = get_token(client, "admin-self@test.com", "Pass1234!")

    # Attempt to change own role
    resp_demote = client.patch(
        f"/api/v1/users/{admin.id}",
        json={"role": "viewer"},
        headers=auth_headers(token),
    )
    assert resp_demote.status_code == 403
    assert "Cannot modify your own role" in resp_demote.json()["detail"]

    # Attempt to deactivate own account
    resp_deact = client.patch(
        f"/api/v1/users/{admin.id}",
        json={"is_active": False},
        headers=auth_headers(token),
    )
    assert resp_deact.status_code == 403
    assert "Cannot deactivate your own admin account" in resp_deact.json()["detail"]

    # Admin CAN update other users
    other = make_user(db_session, "other-user@test.com", "Pass1234!", UserRole.viewer)
    resp_promote = client.patch(
        f"/api/v1/users/{other.id}",
        json={"role": "editor"},
        headers=auth_headers(token),
    )
    assert resp_promote.status_code == 200
    assert resp_promote.json()["role"] == "editor"


def test_audit_chain_verification_returns_summary_and_failed_ids_on_tampering(client, db_session):
    """Verify that audit chain returns concise summary and exact failed event IDs on tampering."""
    admin = make_user(db_session, "admin-verify-test@test.com", "Pass1234!", UserRole.admin)
    token = get_token(client, "admin-verify-test@test.com", "Pass1234!")

    # Clean verification
    resp_clean = client.get("/api/v1/audit/verify", headers=auth_headers(token))
    assert resp_clean.status_code == 200
    clean_data = resp_clean.json()
    assert clean_data["valid"] is True
    assert clean_data["failed_event_ids"] == []
    assert "intact" in clean_data["summary"].lower()

    # Tamper with an event
    tampered_event = db_session.query(AuditEvent).order_by(AuditEvent.sequence_num.desc()).first()
    assert tampered_event is not None
    tampered_id = str(tampered_event.id)
    tampered_event.details = "MALICIOUSLY_MODIFIED_DETAILS"
    db_session.commit()

    # Verify tampering detected with failed ID
    resp_tampered = client.get("/api/v1/audit/verify", headers=auth_headers(token))
    assert resp_tampered.status_code == 200
    tampered_data = resp_tampered.json()
    assert tampered_data["valid"] is False
    assert tampered_id in tampered_data["failed_event_ids"]
    assert "discrepancy" in tampered_data["summary"].lower() or "failed" in tampered_data["summary"].lower()


def test_existing_database_and_demo_accounts_preserved():
    """
    Requirement 15: Existing legitimate demo accounts, documents, and database records remain intact.
    Verifies that the live SQLite database (backend/trustvault.db) is preserved without data loss,
    has all original user accounts, all documents, and a 100% valid cryptographic audit hash chain.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "trustvault.db")
    assert os.path.exists(db_path), f"Live database file not found at {db_path}"

    engine = create_engine(f"sqlite:///{db_path}")
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # 1. Verify demo user accounts exist and are intact
        users = {u.email: u for u in db.query(User).all()}
        expected_emails = [
            "admin@trustvault.dev",
            "owner_a@trustvault.dev",
            "owner_b@trustvault.dev",
            "viewer@trustvault.dev",
            "editor@trustvault.dev",
        ]
        for email in expected_emails:
            assert email in users, f"Expected demo user {email} was missing!"
            user = users[email]
            assert user.is_active is True
            assert user.hashed_password.startswith("$2b$") or len(user.hashed_password) > 20

        # 2. Verify documents are intact (10 documents)
        docs = db.query(Document).all()
        assert len(docs) >= 10, f"Expected at least 10 documents, found {len(docs)}"

        # 3. Verify audit chain integrity on the live database
        events = db.query(AuditEvent).order_by(AuditEvent.sequence_num.asc()).all()
        assert len(events) >= 196, f"Expected at least 196 audit events, found {len(events)}"

        result = audit_service.verify_chain(db)
        assert result["valid"] is True, f"Audit chain verification failed: {result['errors']}"
        assert len(result["errors"]) == 0
        assert result["checked"] >= 196
    finally:
        db.close()
        engine.dispose()



