from fastapi import FastAPI
import uvicorn
from api import endpoints
from config import ALLOWED_ORIGINS
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ClinSync")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
