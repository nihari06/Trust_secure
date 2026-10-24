import os
import uuid
import shutil
from pathlib import Path
from app.core.config import settings


def _storage_root() -> Path:
    path = Path(settings.STORAGE_PATH)
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_storage_key(extension: str) -> str:
    """Generate a UUID-based storage key — never user-supplied filenames."""
    safe_ext = extension.lstrip(".").lower()
    # Restrict to known safe extensions
    allowed_exts = {"pdf", "docx", "xlsx", "csv", "txt", "png", "jpg", "jpeg"}
    if safe_ext not in allowed_exts:
        safe_ext = "bin"
    return f"{uuid.uuid4().hex}.{safe_ext}"


def save_file(storage_key: str, content: bytes) -> None:
    """Write file content to private storage — never exposed as a public URL."""
    dest = _storage_root() / storage_key
    # Prevent path traversal
    dest = dest.resolve()
    root = _storage_root().resolve()
    if not str(dest).lower().startswith(str(root).lower()):
        raise ValueError("Path traversal attempt detected.")
    dest.write_bytes(content)


def read_file(storage_key: str) -> bytes:
    """Read file content from private storage."""
    dest = (_storage_root() / storage_key).resolve()
    root = _storage_root().resolve()
    if not str(dest).lower().startswith(str(root).lower()):
        raise ValueError("Path traversal attempt detected.")
    if not dest.exists():
        raise FileNotFoundError(f"Storage key not found: {storage_key}")
    return dest.read_bytes()


def delete_file(storage_key: str) -> None:
    dest = (_storage_root() / storage_key).resolve()
    root = _storage_root().resolve()
    if not str(dest).lower().startswith(str(root).lower()):
        raise ValueError("Path traversal attempt detected.")
    if dest.exists():
        dest.unlink()
