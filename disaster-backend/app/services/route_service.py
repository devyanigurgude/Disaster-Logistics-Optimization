# route_service.py
# Bridges FastAPI ↔ C++ optimizer.
# Matches actual RouteRequest / RouteResponse shapes from models.py exactly.

import subprocess
import json
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# ── Binary path ───────────────────────────────────────────────────────────────
# __file__ = disaster-backend/app/services/route_service.py
# We need  = disaster-backend/bin/optimizer(.exe)
_SERVICE_DIR  = os.path.dirname(os.path.abspath(__file__))   # .../app/services/
_APP_DIR      = os.path.dirname(_SERVICE_DIR)                 # .../app/
_PROJECT_ROOT = os.path.dirname(_APP_DIR)                     # .../disaster-backend/
_BIN          = os.path.join(_PROJECT_ROOT, "bin", "optimizer")
_BIN_CANDIDATES = [_BIN + ".exe", _BIN] if os.name == "nt" else [_BIN]

print("Looking for binary at:", _BIN_CANDIDATES)
print("Found:", [c for c in _BIN_CANDIDATES if os.path.isfile(c)])
def _get_optimizer_bin() -> str:
    for candidate in _BIN_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    raise RuntimeError(
        f"Optimizer binary not found. Expected at: {_BIN}(.exe)\n"
        "Compile with:\n"
        "  mkdir bin\n"
        "  g++ -std=c++14 -O2 -o bin/optimizer cpp/optimizer.cpp -lm"
    )


# ── Call C++ binary ───────────────────────────────────────────────────────────
def _call_optimizer(source_lat: float, source_lon: float,
                    dest_lat: float,   dest_lon: float,
                    disasters: list) -> dict:
    binary = _get_optimizer_bin()

    payload = {
        "source":      [source_lat, source_lon],
        "destination": [dest_lat,   dest_lon],
        "disasters":   disasters,
    }

    try:
        result = subprocess.run(
            [binary],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=15,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("C++ optimizer timed out after 15 seconds.")
    except FileNotFoundError:
        raise RuntimeError(f"Optimizer binary not found or not executable: {binary}")

    if result.returncode != 0:
        logger.error("Optimizer stderr: %s", result.stderr)
        raise RuntimeError(
            f"Optimizer exited with code {result.returncode}. "
            f"stderr: {result.stderr[:300]}"
        )

    raw_out = result.stdout.strip()
    if not raw_out:
        raise RuntimeError("Optimizer returned empty output.")

    try:
        return json.loads(raw_out)
    except json.JSONDecodeError as e:
        logger.error("Optimizer raw output: %s", raw_out[:500])
        raise RuntimeError(f"Optimizer returned invalid JSON: {e}")


# ── Convert stored disasters → optimizer payload ──────────────────────────────
def _build_disaster_payload(all_disasters: list, extra_zones: list) -> list:
    """
    Merges stored Disaster model instances + any DisasterZoneInput from the request.
    Returns list of {lat, lon, radius_km, severity} dicts for C++ binary.
    """
    severity_map = {
        "low": 1, "medium": 2, "moderate": 2,
        "high": 3, "severe": 4, "critical": 5
    }
    payload = []

    # ── Stored disasters from data_store ──────────────────────────────────────
    for d in all_disasters:
        if hasattr(d, "model_dump"):
            d = d.model_dump()

        if d.get("status", "active") != "active":
            continue

        loc = d.get("location", {})
        if hasattr(loc, "__dict__"):
            loc = vars(loc)

        lat = loc.get("lat") or loc.get("latitude")
        lon = loc.get("lon") or loc.get("longitude") or loc.get("lng")
        if lat is None or lon is None:
            logger.warning("Skipping disaster '%s': missing lat/lon", d.get("id"))
            continue

        sev_raw = d.get("severity", "high")
        severity = severity_map.get(sev_raw.lower(), 3) if isinstance(sev_raw, str) else int(sev_raw)
        radius = float(d.get("radius_km") or d.get("radius") or 10.0)

        payload.append({
            "lat":       float(lat),
            "lon":       float(lon),
            "radius_km": radius,
            "severity":  severity,
        })

    # ── Extra DisasterZoneInput zones from the RouteRequest body ──────────────
    for z in extra_zones:
        if hasattr(z, "model_dump"):
            z = z.model_dump()
        payload.append({
            "lat":       float(z["lat"]),
            "lon":       float(z["lon"]),
            "radius_km": float(z.get("radius_km", 50.0)),
            "severity":  int(z.get("severity", 2)),
        })

    return payload


# ── ETA string helper ─────────────────────────────────────────────────────────
def _eta_string(duration_min: float) -> str:
    eta_time = datetime.utcnow() + timedelta(minutes=duration_min)
    return eta_time.strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Main entry point (called by routes.py) ────────────────────────────────────
def calculate_route(body) -> dict:
    """
    Called by routes.py as: calculate_route(body)

    body = RouteRequest:
        source:      Coordinates  → .lat, .lon
        destination: Coordinates  → .lat, .lon
        disasters:   List[DisasterZoneInput]  (extra zones, usually empty)
        waypoints:   List[Coordinates]        (ignored for now)

    Returns a dict that exactly matches RouteResponse:
        status, path, distance_km, duration_min, eta,
        blocked, penalty_applied, nodes_explored,
        source, destination
    """
    from app.services.data_store import disaster_store

    # ── Coordinates from RouteRequest ─────────────────────────────────────────
    source_lat = float(body.source.lat)
    source_lon = float(body.source.lon)
    dest_lat   = float(body.destination.lat)
    dest_lon   = float(body.destination.lon)

    # ── Build disaster payload ────────────────────────────────────────────────
    stored     = disaster_store.all()
    extra      = list(body.disasters) if body.disasters else []
    dis_payload = _build_disaster_payload(stored, extra)

    logger.info(
        "Route: (%.4f,%.4f)→(%.4f,%.4f) | %d disaster zone(s)",
        source_lat, source_lon, dest_lat, dest_lon, len(dis_payload)
    )

    # ── Call C++ optimizer ────────────────────────────────────────────────────
    raw = _call_optimizer(source_lat, source_lon, dest_lat, dest_lon, dis_payload)

    blocked     = raw.get("blocked", False)
    safe_path   = raw.get("path", [])           # [[lat,lon], ...]  safe detour
    direct_path = raw.get("direct_path", [])    # [[lat,lon], ...]  original route
    safe_dist   = float(raw.get("distance_km", 0.0))
    safe_dur    = float(raw.get("duration_min", 0.0))
    direct_dist = float(raw.get("direct_distance_km", 0.0))
    safe_found  = raw.get("safe_path_found", len(safe_path) > 0)
    direct_dur  = (direct_dist / 50.0 * 60.0) if direct_dist > 0 else 0.0

    # ── Choose which path and stats to surface as the primary response ────────
    #
    # RouteResponse has ONE path field.  We follow this rule:
    #   • Not blocked  → return direct path, mark safe
    #   • Blocked + safe detour found → return safe detour path, mark as detour
    #   • Blocked + no detour → return direct path, mark blocked
    #
    if not blocked:
        chosen_path  = direct_path if direct_path else safe_path
        chosen_dist  = round(direct_dist or safe_dist, 1)
        chosen_dur   = round(direct_dur or safe_dur, 0)
        status       = "ok"
        is_blocked   = False
    elif safe_found and safe_path:
        chosen_path  = safe_path
        chosen_dist  = round(safe_dist, 1)
        chosen_dur   = round(safe_dur, 0)
        status       = "ok"
        is_blocked   = True   # True = frontend knows to show red for original
    else:
        chosen_path  = direct_path
        chosen_dist  = round(direct_dist, 1)
        chosen_dur   = round(direct_dur, 0)
        status       = "no_safe_path"
        is_blocked   = True

    # Convert [[lat,lon],...] → [{"lat":..., "lon":...}, ...]
    path_points = [{"lat": p[0], "lon": p[1]} for p in chosen_path]

    # Also attach the raw direct_path for frontend red-line visualization
    # (stored in a bonus field; RouteResponse will ignore unknown fields
    #  unless you add it — see models.py note below)
    direct_path_points = [{"lat": p[0], "lon": p[1]} for p in direct_path]

    return {
        # ── Core RouteResponse fields (must all be present) ──────────────────
        "status":          status,
        "path":            path_points,
        "distance_km":     chosen_dist,
        "duration_min":    int(chosen_dur),
        "eta":             _eta_string(chosen_dur),
        "blocked":         is_blocked,
        "penalty_applied": False,       # hard blocking, no penalties
        "nodes_explored":  0,           # C++ doesn't report this; placeholder
        "source":          {"lat": source_lat, "lon": source_lon},
        "destination":     {"lat": dest_lat,   "lon": dest_lon},

        # ── Bonus fields for frontend visualization (ALWAYS include BOTH) ──────
        "direct_path":     direct_path_points,
        "direct_distance_km": round(direct_dist, 1),
        "safe_path":       [{"lat": p[0], "lon": p[1]} for p in safe_path],
        "safe_distance_km": round(safe_dist, 1),
        "safe_duration_min": int(safe_dur),
    }
