from fastapi import APIRouter
from app.api.v1 import auth, users, documents, audit, dashboard

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(users.router)
router.include_router(documents.router)
router.include_router(audit.router)
router.include_router(dashboard.router)
