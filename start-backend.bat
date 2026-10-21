@echo off
title TrustVault Backend
echo Starting TrustVault Backend (FastAPI on http://127.0.0.1:8000)...
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000

