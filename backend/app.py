import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
import uvicorn
from api import endpoints
from config import ALLOWED_ORIGINS, ALLOWED_ORIGIN_REGEX
from db.reset import ensure_index
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        indexed = await ensure_index()
        if indexed:
            logger.info("Indexed %d trials into the vector store on startup.", indexed)
    except Exception:
        # A missing index breaks matching only; auth and trial CRUD still work,
        # so log loudly and serve rather than taking the whole service down.
        logger.exception("Could not build the trial index; matching will find nothing.")
    yield


app = FastAPI(title="ClinSync", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
