from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .database import engine, Base
from .routers import auth, patients, documents, timeline

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MediSync API",
    description=(
        "AI-assisted healthcare information management platform. "
        "Aggregates scattered patient documents (prescriptions, lab reports, "
        "consultation notes, scans, discharge summaries) into a single "
        "chronological timeline, and flags missing or conflicting information "
        "for clinician review. Final medical decisions remain with qualified "
        "healthcare professionals — this system organizes and surfaces "
        "information, it does not diagnose or prescribe."
    ),
    version="0.1.0",
)

# Wide-open CORS for local development. Lock this down to your real
# frontend origin(s) before deploying anywhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(documents.router)
app.include_router(timeline.router)


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": "medisync-api"}
