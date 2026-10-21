# PROMPTS.md — AI Assistance Log

This file documents real AI-assistance sessions used during TrustVault development. Entries include date, the exact prompt used, what was generated, and how it was reviewed and modified.

---

## Entry 1 — 2026-10-18 | Authorization Middleware Design

**Prompt used:**
> "I'm building a FastAPI document management system. How should I implement server-side per-document authorization checks that run on every request? I need to ensure that checking permission in the database happens even when the user knows the document UUID directly (preventing IDOR/BOLA). Show me the dependency pattern."

**What was generated:**
AI produced a `get_current_user` FastAPI dependency using `python-jose` JWT decoding, and a `get_document_or_404` helper. It suggested using `Depends()` injection into each route rather than middleware, to keep authorization logic explicit at the route level.

**How I used it:**
Adopted the dependency pattern in [`app/core/deps.py`](backend/app/core/deps.py). Added explicit `is_owner OR has_active_permission` checks at the top of each route handler, rather than a generic permission middleware, to make authorization decisions visible and auditable per endpoint.

**Modification made:**
AI initially suggested caching the permission check result in the JWT claims. I rejected this because it would break immediate revocation — the core security requirement. Changed to live database lookup on every request.

---

## Entry 2 — 2026-10-18 | SHA-256 Tamper-Evident Audit Chain

**Prompt used:**
> "I need to build a tamper-evident audit trail in Python/SQLAlchemy. Each log entry should include a SHA-256 hash of the previous entry's hash (like a blockchain/Merkle structure), so that if someone modifies a log record in the database, a verification pass will detect it. Show the record_event and verify_chain functions."

**What was generated:**
AI produced the `record_event()` and `verify_chain()` functions using `hashlib.sha256`, with `json.dumps(sort_keys=True)` for canonical serialization, and sequential numbering for gap detection.

**How I used it:**
Implemented directly in [`app/services/audit.py`](backend/app/services/audit.py). Added timezone normalization (`_timestamp_for_hash`) after discovering that SQLite and PostgreSQL serialize timestamps differently, which would cause spurious hash mismatches.

**Security review note:**
AI included a comment noting that a DB admin who rewrites ALL hashes in sequence could still evade detection. I preserved this in the docstring and added it to THREATS.md as a known limitation, recommending external append-only storage for production.

---

## Entry 3 — 2026-10-18 | File Upload Validation (Magic Bytes)

**Prompt used:**
> "What's the secure way to validate uploaded files in Python to prevent polyglot exploits? I want to reject executables and scripts even if renamed with a safe extension. The allowed types are PDF, DOCX, XLSX, CSV, TXT, PNG, JPG."

**What was generated:**
AI recommended using `python-magic` to read the actual MIME type from file magic bytes, combined with an allowlist. It warned against relying on file extension or the `Content-Type` header sent by the client, as both are attacker-controlled.

**How I used it:**
Implemented in [`app/services/file_validator.py`](backend/app/services/file_validator.py). Added a fallback to `mimetypes` library for environments where `libmagic` is unavailable. Set a 10 MB size limit.

---

## Entry 4 — 2026-10-19 | Permission Revocation Test Coverage

**Prompt used:**
> "Write pytest tests for these security scenarios using FastAPI TestClient: (1) viewer can access doc before revocation but 403 after, (2) revoked user cannot download even with a valid JWT, (3) editor cannot grant access or delete. Use SQLite in-memory DB and override FastAPI dependencies."

**What was generated:**
AI produced `test_revocation_blocks_subsequent_access`, `test_revoked_user_cannot_download`, and the editor permission tests with proper fixture teardown.

**How I used it:**
Merged into [`tests/test_security.py`](backend/tests/test_security.py). Added the critical assertion comment: `# Viewer is immediately blocked (same JWT is still valid, but permission is gone)` to make the test intent explicit for reviewers.

**Result:** All 27 tests pass. Revocation is proven to be immediate at the DB layer, not dependent on JWT expiry.

---

## Entry 5 — 2026-10-19 | OWASP Threat Modeling

**Prompt used:**
> "Based on OWASP Top 10 and OWASP Authorization Cheat Sheet, what are the most critical threats to a document management system with role-based permissions, shared access, and a SHA-256 audit trail? For each threat, describe the attack vector, risk severity, and specific mitigation I should implement and test."

**What was generated:**
AI identified 10 threat categories including BOLA/IDOR, stale permission bypass, privilege escalation, audit trail tampering, and malicious uploads. It suggested specific HTTP status codes for each rejection and emphasized that frontend UI hiding is not a security control.

**How I used it:**
Used as the structural template for [`THREATS.md`](THREATS.md). Cross-referenced each threat with the specific test case that proves the mitigation works.

---

## Entry 6 — 2026-10-19 | Frontend Auth Architecture

**Prompt used:**
> "In Next.js App Router, how should I manage authentication state across all protected pages? I need a React context that stores the JWT, fetches /me on load, handles 401 redirects automatically, and provides a logout function. The auth state must be available in the sidebar, top nav, and all page components."

**What was generated:**
AI produced the `AuthProvider` / `useAuth` pattern using React context, `useEffect` for token restoration on mount, and a fetch interceptor pattern for 401 handling.

**How I used it:**
Implemented in [`lib/auth-context.tsx`](frontend/lib/auth-context.tsx). Modified the 401 handler: instead of a fetch interceptor, placed the redirect logic in the `fetchApi` utility in `api.ts` to avoid duplicating logic across components.

---

## Entry 7 — 2026-10-19 | Immediate Revocation Security Review

**Prompt used:**
> "In my current implementation, permission checks query the database on every API request. A security reviewer might ask: is this sufficient for immediate revocation, or does the JWT itself need to be invalidated? What are the trade-offs and what should I document?"

**What was generated:**
AI explained that database-per-request permission checks ARE sufficient for immediate revocation because the check happens before any resource is returned, regardless of JWT validity. It noted this is the standard pattern for fine-grained access control (vs. JWT-only auth which requires a token blacklist for immediate revocation).

**How I used it:**
Used this explanation to write the test comment in `test_revocation_blocks_subsequent_access` and the THREATS.md entry for Threat 2, clearly documenting why the design choice is correct.
