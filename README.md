# TrustVault — Secure Document Management Platform

> Enterprise-grade document sharing with fine-grained permissions, tamper-evident audit trails, and immediate access revocation.

[![Tests](https://img.shields.io/badge/tests-78%20passed-brightgreen)](backend/tests/test_security.py)
[![Backend](https://img.shields.io/badge/backend-FastAPI%20%2F%20Python%203.11-009688)](backend/)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%20%2F%20TailwindCSS-black)](frontend/)
[![Theme](https://img.shields.io/badge/theme-emerald%20green%20%26%20black-10B981)](#theme)

---

## 1. Project Overview

TrustVault is a secure document-sharing application engineered for uploading confidential files and strictly managing read and edit privileges.

Access control is enforced on the server for every request. An unauthorized user attempting to access, download, preview, or modify permissions on a confidential document is immediately denied with HTTP 403 Forbidden, and the attempt is permanently recorded in the tamper-evident SHA-256 audit ledger.

---

## 2. Technology Stack

- **Backend:** Python 3.11, FastAPI 0.103.2, Uvicorn 0.23.2, SQLAlchemy 2.0.30, Passlib (bcrypt 1.7.4), Python-Jose (JWT cryptographic signing), Pydantic, python-magic.
- **Database:** SQLite (persisted in `backend/trustvault.db` with live demo data, GUID types, and cryptographic parent hash chains).
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, TailwindCSS with Emerald-Green (#10B981 / #059669) & Black UI palette.
- **Unified Shell:** Standalone integrated responsive web interface served directly on port 5000 by `run.py`.

---

## 3. Required Application Startup

The application can be started using the standard Windows PowerShell commands:

```powershell
cd "PROJECT_PATH"
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 5000
```

The application is then immediately accessible in your browser at:

**`http://127.0.0.1:5000/`**

### Alternative Full-Stack Development Mode

If you are developing or running the separate Next.js frontend with live hot-reloading:

```powershell
# In one terminal:
.\start-all.bat

# Or manually:
# Backend:
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend:
cd frontend
npm run dev
```

- Web UI: `http://localhost:3000/`
- Backend API: `http://127.0.0.1:8000/`
- Swagger Documentation: `http://127.0.0.1:8000/api/docs`

---

## 4. Database Configuration & Environment Variables

The database is pre-configured and stored in `backend/trustvault.db`. Configuration is controlled via `backend/.env` or system environment variables:

| Variable | Default Value | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./trustvault.db` | SQLAlchemy SQLite database connection string. |
| `SECRET_KEY` | `dev-secret-key-change-in-production-long-random` | Cryptographic secret used for JWT signing. |
| `ALGORITHM` | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifespan before expiration. |
| `STORAGE_PATH` | `./storage` | Directory where uploaded files and avatars are safely stored. |
| `ALLOW_PUBLIC_REGISTRATION` | `True` | Allows new users to self-register via `/register`. |
| `HOST` | `127.0.0.1` | Network binding host. |
| `PORT` | `5000` | Application port. |

Existing demo accounts, password hashes, documents, and audit records in `trustvault.db` are preserved.

---

## 5. Roles & Permissions Matrix

TrustVault implements zero-trust role segregation:

| Capability / Action | Admin | Owner | Viewer | Document-Level Editor |
|---|---|---|---|---|
| Register Account | Yes (safe role assigned) | Yes | Yes | Yes |
| Sign In / Sign Out | Yes | Yes | Yes | Yes |
| Upload New Documents | Yes | Yes | Yes (owns uploaded doc) | Yes (owns uploaded doc) |
| Manage Documents Owned by Self | Yes | Yes | Yes | Yes |
| Preview / Download Confidential Content | Only if explicitly granted | Yes (owned/granted) | If granted by Owner | If granted by Owner |
| Grant / Revoke Access to Others | Yes | Yes (for own docs) | Denied (HTTP 403) | Denied (HTTP 403) |
| Edit Document Metadata | If owned/granted | Yes (for own docs) | Denied (HTTP 403) | Yes (for granted doc) |
| Delete Documents | If owned | Yes (for own docs) | Denied (HTTP 403) | Denied (HTTP 403) |
| Search Authorized Documents | Yes (authorized only) | Yes (authorized only) | Yes (authorized only) | Yes (authorized only) |
| Browse Categories | Yes | Yes | Yes | Yes |
| Update Password & Avatar | Yes | Yes | Yes | Yes |
| View Full Administrative Audit Trail | Yes | Denied (403) | Denied (403) | Denied (403) |
| Cryptographic Hash Chain Verification | Yes | Denied (403) | Denied (403) | Denied (403) |
| User Governance & Employee Offboarding | Yes | Denied (403) | Denied (403) | Denied (403) |

---

## 6. Registration & Authentication Workflow

### Registration (`/register`)
- A visible **Register / Create Account** link is displayed on the login page.
- Collects: Full Name, Email, Password, Confirm Password.
- Frontend and backend validation:
  - Valid RFC 5322 email formatting.
  - Password minimum 8 characters with strength requirements.
  - Password and Confirm Password must match.
  - Duplicate email rejection (HTTP 409 Conflict).
- **Safe Role Assignment:** Client-submitted roles are never trusted. Public registration assigns safe default unprivileged role (`viewer`), preventing self-assignment of `admin` or other privileged roles (HTTP 403 if attempted).
- Passwords securely hashed with `passlib` bcrypt (salted, resistant to offline brute-force).
- Account creation logged in the audit ledger with credentials redacted.

### Login & Session (`/login`)
- Verifies credentials against secure bcrypt hashes.
- Generic error messages prevent account enumeration.
- Returns JWT containing subject (`sub`) and `token_version` (`ver`).
- Session invalidation: Password change or employee offboarding increments `token_version`, immediately invalidating outstanding tokens.

### Demo Credentials

| Role | Email | Password | Capabilities |
|---|---|---|---|
| **Admin** | `admin@trustvault.dev` | `Admin1234!` | Full audit ledger, user governance, offboarding, hash verification. |
| **Owner A** | `owner_a@trustvault.dev` | `Owner1234!` | Owns sample confidential documents, can delegate and revoke. |
| **Owner B** | `owner_b@trustvault.dev` | `Owner1234!` | Owns independent sample documents. |
| **Viewer** | `viewer@trustvault.dev` | `Viewer1234!` | Has read-only grant to Q4 Report. |
| **Editor** | `editor@trustvault.dev` | `Editor1234!` | Has editor grant to NDA Template. |

---

## 7. Automated Test Suite

To run all automated security and functional tests:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pytest backend/tests/ -v
```

**Results:** **78 / 78 Tests Passing (100% Pass Rate)**

The test suite covers:
- Public registration, duplicate rejection, and password policies.
- Self-promotion prevention (cannot register as Admin).
- Password change and session invalidation.
- Server-side IDOR / BOLA immunity on direct URL access.
- Immediate access denial upon permission revocation.
- Administrative access segregation (no implicit file contents access).
- Tamper detection on the SHA-256 audit ledger.
- Safe file uploads (magic-byte MIME check, file size limits).

---

## 8. Completed Features & Known Limitations

### Completed Features
- [x] Public User Registration with safe role assignment and field validation.
- [x] Visible Register link on the Login interface.
- [x] Server-side permissions enforcement with immediate revocation.
- [x] Administrator and Owner permission delegation management.
- [x] Dedicated Document Search with title, filename, owner, category, and date filtering.
- [x] Dedicated Categories taxonomy view with document counters.
- [x] User Settings: Profile Avatar upload with MIME validation & Secure Password change.
- [x] Tamper-evident SHA-256 chained audit trail with Genesis-to-Head verification.
- [x] Black and Emerald-Green visual theme (`#10B981` / `#059669`).
- [x] Responsive layout across 360px, 375px, 768px, and desktop widths.
- [x] Single-command application startup via `python run.py` on `http://127.0.0.1:5000/`.

### Known Limitations
- **Single-Tenant Deployment:** Designed for a single organization. Multi-tenancy isolation is not currently supported.
- **Audit Storage:** Cryptographic chain detects retroactive alterations; production deployments should mirror events to an external write-once storage service.
