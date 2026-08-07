"""Central configuration, read once from the environment.

Importing this module fails loudly when a required variable is missing, so a
misconfigured deployment surfaces at startup instead of on the first request.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(dotenv_path=BASE_DIR / ".env")


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set. Copy backend/.env.example to backend/.env and fill it in."
        )
    return value


MONGODB_URL = _required("MONGODB_URL")
GOOGLE_API_KEY = _required("GOOGLE_API_KEY")

# Model ids are retired over time; keep this overridable without a code change.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Single source of truth for the vector store. Previously the API and the
# reindex script each derived their own path from os.getcwd() and disagreed,
# so the store the API queried was never the one the script wrote to.
CHROMA_PATH = os.getenv("CHROMA_PATH") or str(BASE_DIR / "chroma_db")
CHROMA_COLLECTION = "trials"

# Vector-search tuning. Distances are squared L2 over normalised embeddings, so
# they run 0 (identical) to ~2 (unrelated). Measured against this index,
# plausible trials score 1.2-1.5 while unrelated text scores 1.75+, so 1.6
# separates them without discarding weak-but-real candidates.
MAX_MATCH_DISTANCE = float(os.getenv("MAX_MATCH_DISTANCE", "1.6"))
# Retrieve more than we return: eligibility screening drops some candidates.
MATCH_CANDIDATES = int(os.getenv("MATCH_CANDIDATES", "10"))
MAX_MATCHES = int(os.getenv("MAX_MATCHES", "5"))

JWT_SECRET = _required("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "720"))

# Comma-separated. Vite falls back to 5174, 5175... when its default port is
# already taken, and localhost/127.0.0.1 are distinct origins to the browser,
# so cover the range that a dev server realistically lands on. Production sets
# ALLOWED_ORIGINS explicitly and none of these apply.
DEFAULT_ORIGINS = ",".join(
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in (5173, 5174, 5175)
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

# Hosts like Vercel mint a fresh origin for every preview deployment, so those
# cannot be enumerated ahead of time. Set this to a pattern that matches only
# your own project's deployments; leave it unset to allow nothing beyond the
# list above. Anchored at both ends so it cannot match a longer hostile host.
ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX") or None
