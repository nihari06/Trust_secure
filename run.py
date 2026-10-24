"""
TrustVault — Enterprise Secure Document Management Platform
Unified Application Runner

Usage:
    python run.py

Serves the complete TrustVault application at:
    http://127.0.0.1:5000/
"""

import sys
import os
import time
import socket
import signal
import subprocess

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")

# Auto-re-exec in project .venv if launched via global python
venv_python = os.path.join(PROJECT_DIR, ".venv", "Scripts", "python.exe")
if os.path.exists(venv_python) and os.path.normpath(sys.executable).lower() != os.path.normpath(venv_python).lower():
    sys.exit(subprocess.call([venv_python, os.path.abspath(__file__)] + sys.argv[1:]))

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a local TCP port is already listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def ensure_db():
    """Ensure database tables and schema migrations are applied."""
    try:
        from app.db.session import ensure_schema, engine
        from app.db.models import Base
        Base.metadata.create_all(bind=engine)
        ensure_schema()
        print("[TrustVault] Database schema verified.")
    except Exception as e:
        print(f"[TrustVault] Database check notice: {e}")


def ensure_frontend_built():
    """Build Next.js for production if not already built."""
    build_id = os.path.join(FRONTEND_DIR, ".next", "BUILD_ID")
    if os.path.exists(build_id):
        print("[TrustVault] Frontend production build found — skipping build.")
        return True

    print("[TrustVault] Building Next.js frontend for production (first-time only)...")
    print("[TrustVault] This may take 30–60 seconds. Please wait...")
    shell = (sys.platform == "win32")
    try:
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=FRONTEND_DIR,
            shell=shell,
            timeout=300,
        )
        if result.returncode == 0:
            print("[TrustVault] Frontend build complete.")
            return True
        else:
            print("[TrustVault] Build failed — falling back to dev mode.")
            return False
    except Exception as e:
        print(f"[TrustVault] Build error ({e}) — falling back to dev mode.")
        return False


def start_frontend_process(production: bool = True):
    """Start Next.js frontend on port 3000."""
    if is_port_open(3000):
        print("[TrustVault] Frontend already active on port 3000.")
        return None

    cmd = ["npm", "start"] if production else ["npm", "run", "dev"]
    mode = "production" if production else "dev"
    print(f"[TrustVault] Starting Next.js frontend ({mode}) on port 3000...")
    shell = (sys.platform == "win32")
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=FRONTEND_DIR,
            shell=shell,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return proc
    except Exception as e:
        print(f"[TrustVault] Warning: Could not auto-launch frontend ({e}).")
        print("[TrustVault] Please start frontend separately via: cd frontend && npm start")
        return None


def main():
    print("=" * 66)
    print("      TrustVault — Secure Sharing & Document Management")
    print("=" * 66)

    # 1. Verify Database
    ensure_db()

    # 2. Build and start frontend
    production = ensure_frontend_built()
    frontend_proc = start_frontend_process(production=production)

    # Wait for port 3000 to become available
    if frontend_proc:
        print("[TrustVault] Waiting for frontend to be ready...", end="", flush=True)
        for _ in range(40):
            if is_port_open(3000):
                print(" Ready!")
                break
            time.sleep(0.5)
            print(".", end="", flush=True)
        else:
            print(" (timeout — continuing anyway)")

    print()
    print("  Application running at:  http://127.0.0.1:5000/")
    print("  Interactive API docs:    http://127.0.0.1:5000/api/docs")
    print("  Press Ctrl+C to stop all services.")
    print("=" * 66)
    print()

    # 3. Clean shutdown handler
    def cleanup(signum=None, frame=None):
        print("\n[TrustVault] Shutting down services...")
        if frontend_proc:
            try:
                if sys.platform == "win32":
                    subprocess.call(["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    frontend_proc.terminate()
            except Exception:
                pass
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, cleanup)

    # 4. Start FastAPI Uvicorn on port 5000
    try:
        import uvicorn
        uvicorn.run(
            "app.main:app",
            host="127.0.0.1",
            port=5000,
            log_level="info",
            app_dir=BACKEND_DIR,
        )
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()
