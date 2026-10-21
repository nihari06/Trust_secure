# THREATS.md — TrustVault Threat Model & Security Analysis

## Overview
This document describes potential attacks against TrustVault, their severity, and how the application mitigates each one. It follows the OWASP Top 10 and aligns with OWASP Authorization Cheat Sheet guidance.

---

## Threat 1 — Broken Object-Level Authorization (BOLA / IDOR)

**Attack:** An authenticated user (e.g. Charan) guesses or enumerates a document UUID and directly requests:
```
GET /api/v1/documents/<known-uuid>
GET /api/v1/documents/<known-uuid>/download
```

**Risk:** CRITICAL — exposes confidential documents to unauthorized users.

**Mitigation:**
- Every API endpoint re-checks `doc.owner_id == current_user.id` OR a valid active `DocumentPermission` row exists.
- There is **no frontend-only guard** — the backend enforces this on every request.
- Unauthorized attempts return HTTP 403 and are logged in the tamper-evident audit trail.
- Test proof: `test_owner_cannot_access_another_owners_document`, `test_admin_cannot_download_document_contents`

---

## Threat 2 — Stale Permission / Revocation Bypass

**Attack:** Bhanu has a valid JWT token and had access. Anu revokes Bhanu's permission. Bhanu re-uses the same JWT to request the document.

**Risk:** HIGH — user retains access beyond the intended window.

**Mitigation:**
- Permissions are checked **live against the database** on every request, not cached in the JWT.
- `DocumentPermission.is_active == True` is required; revocation sets `is_active = False` immediately.
- The JWT expiry (30 minutes) is a secondary layer, not the primary access control.
- Test proof: `test_revocation_blocks_subsequent_access`, `test_revoked_user_cannot_download`

---

## Threat 3 — Privilege Escalation (Viewer → Editor → Owner)

**Attack:** A viewer crafts a PATCH or DELETE request directly to the API, bypassing the UI button hiding.

**Risk:** HIGH — modifies or destroys documents without authorization.

**Mitigation:**
- PATCH requires `PermissionLevel.editor` or ownership. Viewer permission alone → HTTP 403.
- DELETE is **owner-only**. No permission level can substitute for ownership.
- UI hiding is supplemental UX, not security.
- Test proof: `test_viewer_cannot_edit_document`, `test_viewer_cannot_delete_document`, `test_editor_cannot_delete_document`

---

## Threat 4 — Unauthorized Permission Grant (Permission Escalation)

**Attack:** A viewer or editor attempts to grant themselves or others access to a document they don't own.

**Risk:** HIGH — allows lateral access spread.

**Mitigation:**
- `POST /documents/{id}/permissions` requires `doc.owner_id == current_user.id`. All other roles → HTTP 403.
- Test proof: `test_viewer_cannot_share_document`, `test_editor_cannot_grant_access`

---

## Threat 5 — Audit Trail Tampering

**Attack:** A privileged insider modifies the `audit_events` table to hide a security incident (e.g., removes a DOCUMENT_DOWNLOAD row).

**Risk:** HIGH — enables cover-up of unauthorized access.

**Mitigation:**
- Each audit event is hashed with SHA-256 including the previous event's hash, forming a linked chain.
- `GET /api/v1/audit/verify` re-computes all hashes and detects any mismatch or gap.
- Test proof: `test_audit_chain_detects_tampering`, `test_audit_chain_valid_when_untampered`
- **Known limitation:** A sophisticated attacker with full DB access who also rewrites all subsequent hashes could evade detection. Production systems should ship events to an append-only external store (e.g., AWS CloudTrail, transparency log).

---

## Threat 6 — Unauthenticated API Access

**Attack:** An anonymous caller hits any protected API endpoint directly without a JWT.

**Risk:** CRITICAL — bypasses all authentication.

**Mitigation:**
- All routes except `/api/v1/auth/login` require `get_current_user` dependency, which validates the Bearer JWT.
- Invalid or missing token → HTTP 401 Unauthorized.
- Test proof: `test_unauthenticated_cannot_access_documents`, `test_unauthenticated_cannot_download`

---

## Threat 7 — Malicious File Upload

**Attack:** An attacker uploads an executable (`.exe`, `.sh`, `.php`) or a polyglot file disguised as a PDF.

**Risk:** MEDIUM — server-side code execution, stored XSS, or malware delivery.

**Mitigation:**
- `file_validator.py` checks **both file extension and magic bytes** (libmagic MIME detection).
- Allowed types: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, GIF.
- Files exceeding 10 MB are rejected.
- Test proof: `test_upload_rejects_unsupported_extension`, `test_upload_rejects_oversized_file`

---

## Threat 8 — Credential Leakage via API Responses

**Attack:** The API accidentally returns `hashed_password` or JWT in a user or audit event response.

**Risk:** HIGH — enables offline password cracking or session hijacking.

**Mitigation:**
- Pydantic `UserOut` schema explicitly excludes `hashed_password`.
- Audit event details field is never populated with password data.
- Test proof: `test_password_not_in_user_response`, `test_audit_events_do_not_contain_passwords`

---

## Threat 9 — Cross-User Document Listing

**Attack:** User B queries `GET /api/v1/documents/` hoping to see User A's documents.

**Risk:** MEDIUM — information disclosure.

**Mitigation:**
- The listing query filters strictly by `Document.owner_id == current_user.id`.
- Shared documents are only returned via `/documents/shared`, scoped to active permissions.
- Test proof: `test_user_cannot_list_others_documents`

---

## Threat 10 — Admin Overreach (Data Access Scope Creep)

**Attack:** An admin user uses their elevated role to read or download document contents belonging to other users.

**Risk:** MEDIUM — violates principle of least privilege; admins should manage accounts, not read files.

**Mitigation:**
- Admin role grants access to user management and audit trail only.
- Document download enforces `is_owner OR has_active_permission` — admin role alone does not satisfy either.
- Test proof: `test_admin_cannot_download_document_contents`

---

## References
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Top 10: A01 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [OWASP Top 10: A02 Cryptographic Failures](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
- [OWASP Logging and Monitoring Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
