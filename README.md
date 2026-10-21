# TrustVault — Secure Document Management Platform

> Enterprise-grade document sharing with fine-grained permissions, tamper-evident audit trails, and immediate access revocation.

[![Tests](https://img.shields.io/badge/tests-27%20passed-brightgreen)](backend/tests/test_security.py)
[![Backend](https://img.shields.io/badge/backend-FastAPI-009688)](backend/)
[![Frontend](https://img.shields.io/badge/frontend-Next.js-black)](frontend/)

---

## The Problem

Three users interact with the same confidential document:

| User | Role | Expected Access |
|------|------|----------------|
| **Anu** | Document Owner | Full access — upload, read, edit, delete, share |
| **Bhanu** | Viewer (granted by Anu) | Read-only — can view and download, cannot edit |
| **Charan** | Unauthorized | No access — every request is denied and logged |

TrustVault enforces this at the **server level** on every request. Hiding a button in the UI is not security. When Anu revokes Bhanu's permission, the **next request from Bhanu is immediately denied** — no token invalidation required.

---

## 6-Step Demo

> Run as: Owner → share → viewer reads → viewer can't edit → revoke → access denied

### Step 1: Owner uploads a private document
Log in as `owner_a@trustvault.dev` / `Owner1234!` → My Documents → Upload Document.

### Step 2: Prove unauthorized user cannot access it
Log in as `viewer@trustvault.dev` / `Viewer1234!` → My Documents shows 0 files. Direct API call returns **403 Forbidden** + audit event logged.

### Step 3: Grant viewer access, prove reading works
As owner_a: Access & Permissions → Grant New Access → `viewer@trustvault.dev`, Viewer level.
Log back in as viewer → Shared with Me → document now appears. Download works.

### Step 4: Viewer tries to edit — rejected
Viewer attempts PATCH `/api/v1/documents/{id}` → **403 Editor permission required**. Document unchanged.

### Step 5: Owner revokes access
As owner_a: Access & Permissions → Revoke Access for viewer.

### Step 6: Viewer's next request is immediately denied
Viewer (same browser session, same JWT) → requests document → **403 Forbidden**. No logout required.

### Step 7: Open Audit Trail
Admin (`admin@trustvault.dev` / `Admin1234!`) → Audit Trail shows the full chained ledger:
`PERMISSION_GRANTED` → `DOCUMENT_DOWNLOAD` → `DOCUMENT_UPDATE_DENIED` → `PERMISSION_REVOKED` → `DOCUMENT_ACCESS_DENIED`

---

## Running the Application

### Prerequisites
- Python 3.11+
- Node.js 18+

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
python seed.py                  # Creates DB + demo data
uvicorn app.main:app --reload   # http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:3000
```

### API Documentation
Available at http://localhost:8000/docs (Swagger UI)

---

## Demo Credentials

| Role | Email | Password | Capabilities |
|------|-------|----------|-------------|
| **Admin** | `admin@trustvault.dev` | `Admin1234!` | Full audit trail, user management, hash verification |
| **Owner A** | `owner_a@trustvault.dev` | `Owner1234!` | Owns 4 sample documents, can grant/revoke |
| **Owner B** | `owner_b@trustvault.dev` | `Owner1234!` | Owns 2 sample documents |
| **Viewer** | `viewer@trustvault.dev` | `Viewer1234!` | Has viewer access to Q4 Report |
| **Editor** | `editor@trustvault.dev` | `Editor1234!` | Has editor access to NDA Template |

---

## Automated Security Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

**27 tests — all pass.** Coverage:

| # | Test | Security Requirement |
|---|------|---------------------|
| 1-2 | Unauthenticated requests blocked | Authentication |
| 3 | Owner accesses own document | Basic access |
| 4 | Owner B cannot access Owner A's doc | BOLA/IDOR prevention |
| 5 | Viewer can read shared document | Authorized viewer access |
| 6-8 | Viewer cannot edit, delete, or share | Privilege enforcement |
| 9 | Editor can edit, cannot grant/delete | Role boundary |
| 10-11 | **Revocation immediately blocks access + download** | Immediate revocation |
| 12 | Unauthorized delete has no effect | Integrity preservation |
| 13 | User cannot list another owner's docs | Data isolation |
| 14-15 | Non-admin blocked from users/audit | Admin privilege scope |
| 16 | Admin cannot download document contents | Least privilege |
| 17-18 | Audit events created for access attempts | Audit completeness |
| 19-21 | File validation rejects bad uploads | Upload security |
| 22-23 | Tampered audit chain detected | Tamper evidence |
| 24-25 | Passwords never appear in responses/audit | Credential safety |

---

## Architecture

```
trust secure/
├── backend/                    # FastAPI Python application
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py         # Login, logout, /me
│   │   │   ├── documents.py    # CRUD + permissions + download
│   │   │   ├── audit.py        # Audit trail + chain verify
│   │   │   ├── users.py        # Admin user management
│   │   │   └── dashboard.py    # Stats + recent activity
│   │   ├── core/
│   │   │   ├── deps.py         # get_current_user dependency
│   │   │   ├── security.py     # JWT + bcrypt
│   │   │   └── config.py       # Settings from .env
│   │   ├── db/
│   │   │   ├── models.py       # SQLAlchemy models (GUID-compatible)
│   │   │   └── session.py      # SQLite/PostgreSQL auto-detect
│   │   ├── services/
│   │   │   ├── audit.py        # SHA-256 hash chain
│   │   │   └── file_validator.py  # Magic byte MIME check
│   │   └── storage/
│   │       └── local.py        # File storage abstraction
│   ├── tests/
│   │   └── test_security.py    # 27 automated security tests
│   └── seed.py                 # Demo data seeder
│
├── frontend/                   # Next.js TypeScript application
│   ├── app/
│   │   ├── dashboard/          # Overview with stats + activity
│   │   ├── documents/          # My Documents (table + grid view)
│   │   ├── shared/             # Shared with Me
│   │   ├── permissions/        # Grant & Revoke Access
│   │   ├── audit/              # Tamper-evident Audit Trail
│   │   ├── settings/           # Account + JWT + permission matrix
│   │   └── admin/users/        # Admin: User Management
│   ├── components/
│   │   ├── Sidebar.tsx         # Navigation + active state
│   │   ├── TopNav.tsx          # Search + notifications + user
│   │   ├── AuthLayout.tsx      # Auth guard + layout shell
│   │   ├── UploadModal.tsx     # File upload with validation
│   │   └── ShareModal.tsx      # Grant permission UI
│   └── lib/
│       ├── api.ts              # Typed API client + 401 handling
│       └── auth-context.tsx    # JWT context + auto-restore
│
├── COMPLIANCE_REPORT.md        # Comprehensive verification & compliance audit
├── THREATS.md                  # Attack analysis & mitigations
└── PROMPTS.md                  # AI assistance log (7 entries)
```

---

## Security Design Decisions

### 1. Server-side authorization on every request
Permission is checked against the **live database** on every API call. There is no permission cache in the JWT. This guarantees that revoking a permission takes effect on the next request — not at JWT expiry.

### 2. Tamper-evident SHA-256 audit chain
Every audit event includes `SHA-256(event_data + prev_event_hash)`. The `GET /audit/verify` endpoint recomputes all hashes and detects any field modification or gap.

### 3. File validation via magic bytes
Uploaded files are validated using both extension allowlisting and `python-magic` MIME detection. Client-supplied `Content-Type` headers are never trusted.

### 4. Admin scope limited to management, not data
Admin users can manage accounts and inspect audit logs. They cannot download document contents — documents belong to their owners only.

---

## Switching to PostgreSQL (Production)

1. Install PostgreSQL and create database:
```sql
CREATE DATABASE trustvault;
CREATE USER trustvault WITH PASSWORD 'trustvault';
GRANT ALL PRIVILEGES ON DATABASE trustvault TO trustvault;
```

2. Update `backend/.env`:
```
DATABASE_URL=postgresql://trustvault:trustvault@localhost:5432/trustvault
```

3. Re-run seed:
```bash
python seed.py
```

The `GUID` type in `models.py` automatically uses PostgreSQL's native `UUID` type when connected to PostgreSQL.
