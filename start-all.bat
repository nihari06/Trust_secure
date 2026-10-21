@echo off
title TrustVault - Starting Services
echo ===================================================
echo           Starting TrustVault Full Stack
echo ===================================================
echo.
echo [1/2] Starting Backend (FastAPI on http://127.0.0.1:8000)...
start "TrustVault Backend API" cmd /k "backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000"

echo [2/2] Starting Frontend (Next.js on http://localhost:3000)...
start "TrustVault Web Frontend" cmd /k "npm --prefix frontend run dev"

echo.
echo All services launched!
echo - Frontend Web:    http://localhost:3000
echo - Backend API:     http://127.0.0.1:8000
echo - Swagger Docs:    http://127.0.0.1:8000/api/docs
echo ===================================================
timeout /t 5

