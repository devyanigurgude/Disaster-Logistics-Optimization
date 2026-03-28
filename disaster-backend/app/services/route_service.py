"""
route_service.py
Business logic for route optimization.
Builds the C++ input payload, calls the optimizer, formats the response.
"""

from __future__ import annotations

import math
import logging
from typing import List

from app.models import (
    RouteRequest, RouteResponse, PathPoint,
    Disaster, DisasterZoneInput,
)
from app.utils.optimizer_bridge import run_optimizer

logger = logging.getLogger(__name__)

# Severity string → integer (for C++ input)
_SEVERITY_MAP = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _format_eta(duration_min: int) -> str:
    hours = duration_min // 60
    mins  = duration_min % 60
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m"


def _disasters_to_zones(disasters: List[Disaster]) -> List[dict]:
    """Convert stored Disaster objects to the compact format C++ expects."""
    zones = []
    for d in disasters:
        if d.status == "resolved":
            continue
        zones.append({
            "lat":       d.location.lat,
            "lon":       d.location.lon,
            "radius_km": d.radius_km,
            "severity":  _SEVERITY_MAP.get(str(d.severity), 2),
        })
    return zones


def calculate_route(request: RouteRequest) -> RouteResponse:
    """
    Main service function.
    1. Merge disasters from request payload with active stored disasters.
    2. Build JSON payload for C++ optimizer.
    3. Call optimizer via subprocess.
    4. Parse and return structured response.
    """
    from app.services.data_store import disaster_store

    # Merge request disasters + active stored disasters (deduplicated by proximity)
    stored_zones = _disasters_to_zones(disaster_store.all())

    # Convert request disasters (already in DisasterZoneInput format)
    request_zones = [
        {"lat": d.lat, "lon": d.lon, "radius_km": d.radius_km, "severity": d.severity}
        for d in request.disasters
    ]

    all_zones = stored_zones + request_zones
    print("Zones sent to C++:", all_zones)
    # Build C++ input payload
    cpp_input = {
        "source": {
            "lat": request.source.lat,
            "lon": request.source.lon,
        },
        "destination": {
            "lat": request.destination.lat,
            "lon": request.destination.lon,
        },
        "disasters": all_zones,
        "waypoints": [
            {"lat": wp.lat, "lon": wp.lon}
            for wp in request.waypoints
        ],
    }

    logger.info(
        f"Route request: ({request.source.lat:.4f},{request.source.lon:.4f}) → "
        f"({request.destination.lat:.4f},{request.destination.lon:.4f}) | "
        f"{len(all_zones)} disaster zones"
    )

    # ── Call C++ optimizer ──
    cpp_result = run_optimizer(cpp_input)

    # ── Build response ──
    path = [PathPoint(lat=p["lat"], lon=p["lon"]) for p in cpp_result.get("path", [])]
    distance_km  = round(float(cpp_result.get("distance_km", 0)), 2)
    duration_min = int(cpp_result.get("duration_min", 0))

    return RouteResponse(
        status          = "ok",
        path            = path,
        distance_km     = distance_km,
        duration_min    = duration_min,
        eta             = _format_eta(duration_min),
        blocked         = bool(cpp_result.get("blocked", False)),
        penalty_applied = bool(cpp_result.get("penalty_applied", False)),
        nodes_explored  = int(cpp_result.get("nodes_explored", 0)),
        source          = request.source,
        destination     = request.destination,
    )
