import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Security ---
# In production, load this from an environment variable / secrets manager.
SECRET_KEY = os.environ.get("MEDISYNC_SECRET_KEY", "dev-only-secret-change-me-before-deploying")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hour shift-length session

# --- Storage ---
DATABASE_URL = os.environ.get("MEDISYNC_DATABASE_URL", f"sqlite:///{BASE_DIR}/medisync.db")
UPLOAD_DIR = os.environ.get("MEDISYNC_UPLOAD_DIR", os.path.join(BASE_DIR, "storage"))
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB per document

os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_DOC_TYPES = [
    "prescription",
    "lab_report",
    "consultation_note",
    "scan",
    "discharge_summary",
    "other",
]

ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".txt"}
