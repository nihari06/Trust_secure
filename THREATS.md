# THREATS.md — TrustVault Threat Model & Security Analysis

## Overview
This document describes protected assets, potential threats against TrustVault, their severity, implemented mitigations, and remaining risks. It follows the OWASP Top 10 and aligns with the OWASP Authorization Cheat Sheet.

---

## 1. Protected Assets

TrustVault protects the following primary assets:
1. **Confidential Document Content:** User-uploaded confidential and proprietary files stored on content-addressable storage outside public static directories.
2. **Access Control & Permissions Ledger:** Granular per-recipient `document_permissions` determining READ and EDIT capabilities.
3. **Audit Trail & Cryptographic Chain:** Immutable, SHA-256 Merkle-linked audit records verifying all actions and security rejections.
4. **User Credentials & Session Tokens:** Passlib bcrypt password hashes and cryptographically signed JWT tokens with version tracking.

---

## 2. Threat Analysis & Mitigations

### Threat 1 — Broken Object-Level Authorization (BOLA / IDOR)
- **Attack:** An authenticated user crafts or enumerates document IDs (`/api/v1/documents/{id}/download` or `/api/v1/documents/{id}`) to access other users' files.
- **Risk:** CRITICAL — unauthorized disclosure of confidential files.
- **Implemented Mitigation:** Server-side `can(user, action, document, db)` re-evaluates database ownership and active permissions on every request. URL tampering is rejected with HTTP 403 and logged in the audit trail.
- **Verification:** `test_viewer_c_cannot_access_document_shared_with_b`, `test_user_cannot_list_others_documents`.

### Threat 2 — Stale Permission / Revocation Bypass
- **Attack:** A revoked user re-submits requests using an existing, non-expired JWT.
- **Risk:** HIGH — access persistence beyond authorization window.
- **Implemented Mitigation:** Authorization checks query the live database (`DocumentPermission.is_active == True`), not cached JWT claims. Revocation immediately takes effect without requiring token expiration.
- **Verification:** `test_revocation_blocks_subsequent_access`, `test_revoked_user_cannot_download`.

### Threat 3 — Privilege Escalation via Public Registration
- **Attack:** A newly registering user submits `role: "admin"` or `role: "owner"` in request payload to gain administrative access.
- **Risk:** CRITICAL — full compromise of administrative operations.
- **Implemented Mitigation:** Public registration endpoint rejects any self-assigned privileged role with HTTP 403. Roles cannot be elevated through client requests.
- **Verification:** `test_user_registration_creates_account_and_allows_login`, `test_registration_rejects_privileged_role_self_assignment`.

### Threat 4 — Unauthorized Permission Delegation
- **Attack:** A Viewer or Editor attempts to grant or revoke document access to third parties.
- **Risk:** HIGH — unauthorized lateral expansion of document access.
- **Implemented Mitigation:** Permission management is restricted strictly to the document Owner and authorized Administrators (`is_owner or user.role == UserRole.admin`).
- **Verification:** `test_admin_and_owner_can_manage_permissions_unauthorized_denied`, `test_viewer_cannot_share_document`.

### Threat 5 — Audit Trail Tampering
- **Attack:** An attacker alters database records to conceal unauthorized access.
- **Risk:** HIGH — loss of forensic accountability.
- **Implemented Mitigation:** SHA-256 Merkle-chained records where each event embeds the previous event's hash. Gap, modification, or reordering causes `verify_chain()` to report tampering with exact event IDs.
- **Verification:** `test_audit_chain_detects_tampering`, `test_audit_chain_valid_when_untampered`.

### Threat 6 — Malicious File Uploads & Polyglot Exploitation
- **Attack:** Uploading executable scripts (`.exe`, `.sh`, `.php`) renamed as `.pdf` or `.png`.
- **Risk:** HIGH — remote code execution or malware storage.
- **Implemented Mitigation:** Magic-byte MIME inspection via `file_validator.py`, strict extension allowlist, 10MB maximum file size limit, and randomized content-addressable storage keys.
- **Verification:** `test_upload_rejects_unsupported_extension`, `test_upload_rejects_oversized_file`.

### Threat 7 — Session Theft & Brute-Force Login
- **Attack:** Credential guessing or reusing stolen JWT tokens after password change or employee departure.
- **Risk:** HIGH — account takeover.
- **Implemented Mitigation:**
  - Secure bcrypt password hashing with salt.
  - Login returns generic error messages without revealing email registration status.
  - `token_version` tracking: password changes and offboarding increment the token version, instantly invalidating all outstanding JWTs.
- **Verification:** `test_user_password_change_invalidates_prior_sessions`, `test_offboarded_user_cannot_login`.

### Threat 8 — Administrative Overreach
- **Attack:** Administrator attempts to read confidential document contents without explicit access.
- **Risk:** MEDIUM — violation of data isolation principles.
- **Implemented Mitigation:** Administrator role manages users and inspects audit ledgers, but possesses zero implicit document read or download rights without explicit grants.
- **Verification:** `test_admin_cannot_download_document_contents`.

---

## 3. Deployment Scope & Multi-Tenancy

> [!NOTE]
> **Single-Tenant Deployment:** TrustVault is currently engineered for a single organization/enterprise deployment. Multi-tenancy (isolated company organizations or virtual tenant boundaries) is **not implemented** in the current database schema. All users share the same user pool and access is governed strictly by document-level and account-level roles.

---

## 4. Remaining Risks & Recommendations

1. **Database-Level Cryptographic Redo:** If an attacker gains raw write access to the SQLite file, they could theoretically recalculate all hashes from the point of edit to the head. Recommendation: Mirror audit events to an external immutable, write-once-read-many (WORM) storage service (e.g. AWS S3 Object Lock, CloudTrail).
2. **Horizontal Scaling:** Current file storage utilizes local content-addressable storage. Recommendation: For clustered deployments, configure an S3-compatible backend.
