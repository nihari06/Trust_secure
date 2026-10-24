import asyncio
import uuid
import httpx
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Request, HTTPException, WebSocket
from fastapi.responses import HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import router
from app.db.session import ensure_schema
from app.db.models import Base
from app.db.session import engine

# ─── Shared persistent HTTP client ─────────────────────────────────────────────
# Reuse a single httpx client across all requests — avoids TCP reconnect overhead
_http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http_client
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    # Create shared client with connection pooling
    _http_client = httpx.AsyncClient(
        timeout=20.0,
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )
    yield
    if _http_client:
        await _http_client.aclose()


app = FastAPI(
    title="TrustVault API",
    description="Secure document management platform — API v1",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_and_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "TrustVault API"}


@app.websocket("/_next/{path:path}")
async def websocket_next_proxy(websocket: WebSocket, path: str):
    """Proxy Next.js dev server HMR WebSockets transparently."""
    await websocket.accept()
    query = websocket.scope.get("query_string", b"").decode("utf-8")
    target_url = f"ws://127.0.0.1:3000/_next/{path}"
    if query:
        target_url = f"{target_url}?{query}"

    try:
        import websockets
        async with websockets.connect(target_url) as target_ws:
            async def client_to_target():
                try:
                    while True:
                        msg = await websocket.receive_text()
                        await target_ws.send(msg)
                except Exception:
                    pass

            async def target_to_client():
                try:
                    async for msg in target_ws:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(client_to_target(), target_to_client(), return_exceptions=True)
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.api_route("/", methods=["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], include_in_schema=False)
@app.api_route("/{full_path:path}", methods=["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], include_in_schema=False)
async def web_ui(request: Request, full_path: str = ""):
    # Pass through API requests directly or 404
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(status_code=404, detail="Not Found")

    # Forward to Next.js frontend using the persistent shared client
    try:
        headers = {}
        body = None
        if request:
            for k, v in request.headers.items():
                if k.lower() not in ("host", "content-length"):
                    headers[k] = v
            body = await request.body()

        client = _http_client or httpx.AsyncClient(timeout=20.0)
        resp = await client.request(
            method=request.method if request else "GET",
            url=f"http://127.0.0.1:3000/{full_path}",
            headers=headers,
            content=body if body else None,
            params=dict(request.query_params) if request else {},
            follow_redirects=False,
        )
        excluded = {"transfer-encoding", "content-encoding", "content-length"}
        out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return Response(content=resp.content, status_code=resp.status_code, headers=out_headers)
    except Exception:
        html = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TrustVault — Starting</title>
  <meta http-equiv="refresh" content="2">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0E1A30; color: #fff; }
    .card { text-align: center; background: #162544; border: 1px solid #243B6A; padding: 36px 48px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .spinner { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #3478F6; border-radius: 50%; width: 32px; height: 32px; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { font-size: 18px; margin: 0 0 8px; color: #fff; }
    p { font-size: 13px; color: #94A3B8; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Starting TrustVault Interface</h2>
    <p>Loading application services... Page will refresh automatically.</p>
  </div>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=200)
