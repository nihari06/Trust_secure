import magic
from typing import Optional

# Allowed MIME types and their valid extensions
ALLOWED_TYPES: dict[str, list[str]] = {
    "application/pdf": ["pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
    "text/csv": ["csv"],
    "text/plain": ["txt", "csv"],
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def validate_upload(filename: str, content: bytes) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Validate file upload.
    Returns (is_valid, mime_type, error_message).
    Checks: size, extension, magic-byte MIME type (not browser-supplied).
    """
    # Size check
    if len(content) > MAX_FILE_SIZE:
        return False, None, f"File exceeds maximum size of 10 MB (got {len(content) / 1024 / 1024:.1f} MB)."

    # Extension check
    if "." not in filename:
        return False, None, "File must have an extension."

    ext = filename.rsplit(".", 1)[-1].lower()
    allowed_exts = {e for exts in ALLOWED_TYPES.values() for e in exts}
    if ext not in allowed_exts:
        return False, None, f"File type '.{ext}' is not allowed. Allowed: pdf, docx, xlsx, csv, txt, png, jpg."

    if not content:
        return False, None, "Empty files are not allowed."

    # Magic byte MIME detection (never trust browser MIME). Fail closed.
    try:
        detected_mime = magic.from_buffer(content, mime=True)
    except Exception:
        return False, None, "Unable to determine file type; upload rejected."

    if detected_mime not in ALLOWED_TYPES:
        # Allow text/* for csv/txt if extension matches
        if detected_mime.startswith("text/") and ext in ["csv", "txt"]:
            detected_mime = "text/plain" if ext == "txt" else "text/csv"
        else:
            return False, None, f"Detected file type '{detected_mime}' is not permitted."

    # Cross-check extension vs detected MIME
    valid_exts_for_mime = ALLOWED_TYPES.get(detected_mime, [])
    if ext not in valid_exts_for_mime:
        # Allow csv with text/plain
        if not (detected_mime == "text/plain" and ext in ["txt", "csv"]):
            return False, None, f"Extension '.{ext}' does not match detected type '{detected_mime}'."

    return True, detected_mime, None
