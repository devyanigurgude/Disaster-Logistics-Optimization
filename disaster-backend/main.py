"""
main.py — Entry point for the Smart Disaster Logistics FastAPI backend.

Run:
    uvicorn main:app --reload --port 8080

Docs:
    http://localhost:8080/docs
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router
from app.services.data_store import (
    STORE_FILE,
    initialize_from_data,
    load_data,
    seed_initial_data,
)
from app.utils.optimizer_bridge import ensure_compiled

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


# ─── Startup / Shutdown ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== Smart Disaster Logistics Backend starting ===")

    # 1. Compile C++ optimizer (if not already built)
    ok = ensure_compiled()
    if ok:
        logger.info("C++ optimizer: ready")
    else:
        logger.warning(
            "C++ optimizer could not be compiled. "
            "/route endpoint will return 500 until g++ or cmake is available."
        )

    # 2. Load persisted data or seed sample data on first startup
    if os.path.exists(STORE_FILE):
        initialize_from_data(load_data())
        logger.info("Persisted data loaded.")
    else:
        seed_initial_data()
        logger.info("Sample data seeded and persisted.")

    yield  # app is running

    logger.info("=== Backend shutting down ===")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "Smart Disaster Logistics API",
    description = (
        "Route Safety Optimization System backend.\n\n"
        "The `/route` endpoint calls a compiled C++ A* optimizer "
        "to compute disaster-aware routes in real time."
    ),
    version     = "1.0.0",
    lifespan    = lifespan,
)

# CORS — allow the React frontend (default Vite port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# Mount all routes under /api
app.include_router(router, prefix="/api")


# ─── Root ─────────────────────────────────────────────────────────────────────

@app.get("/", tags=["System"])
def root():
    return {
        "project": "Smart Disaster Logistics & Route Safety Optimization",
        "docs":    "/docs",
        "health":  "/api/health",
    }
