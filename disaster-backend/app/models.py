"""
models.py — Pydantic data models for all API request/response bodies.
"""

from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class SeverityLevel(str, Enum):
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"

class DisasterStatus(str, Enum):
    ACTIVE     = "active"
    MONITORING = "monitoring"
    RESOLVED   = "resolved"

class DispatchStatus(str, Enum):
    PENDING    = "pending"
    IN_TRANSIT = "in_transit"
    DELIVERED  = "delivered"


# ─── Shared ───────────────────────────────────────────────────────────────────

class Coordinates(BaseModel):
    lat: float = Field(..., ge=-90,  le=90,  description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")

class CityLocation(BaseModel):
    name: str
    lat:  float
    lon:  float


# ─── Disasters ────────────────────────────────────────────────────────────────

class DisasterCreate(BaseModel):
    type:        str
    severity:    SeverityLevel
    location:    CityLocation
    radius_km:   float = Field(50.0, gt=0, description="Affected radius in km")
    status:      DisasterStatus = DisasterStatus.ACTIVE
    description: str

class Disaster(DisasterCreate):
    id:        str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    class Config:
        use_enum_values = True


# ─── Warehouses ───────────────────────────────────────────────────────────────

class StockLevels(BaseModel):
    food:      int = Field(0, ge=0)
    water:     int = Field(0, ge=0)
    medicine:  int = Field(0, ge=0)
    first_aid: int = Field(0, ge=0)

class WarehouseCreate(BaseModel):
    name:          str
    location:      CityLocation
    capacity:      int = Field(..., gt=0)
    current_stock: StockLevels = Field(default_factory=StockLevels)

class Warehouse(WarehouseCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    class Config:
        use_enum_values = True


# ─── Route ────────────────────────────────────────────────────────────────────

class DisasterZoneInput(BaseModel):
    """Compact disaster zone passed directly in the route request."""
    lat:       float
    lon:       float
    radius_km: float = 50.0
    severity:  int   = Field(2, ge=1, le=4)

class RouteRequest(BaseModel):
    source:      Coordinates
    destination: Coordinates
    disasters:   List[DisasterZoneInput] = []
    waypoints:   List[Coordinates]       = []

class PathPoint(BaseModel):
    lat: float
    lon: float
from typing import Optional, List

class RouteResponse(BaseModel):
    status: str
    path: List[dict]
    distance_km: float
    duration_min: int
    eta: str
    blocked: bool
    penalty_applied: bool
    nodes_explored: int
    source: dict
    destination: dict

    # 🔥 ADD THESE (VERY IMPORTANT)
    direct_distance_km: Optional[float] = None
    safe_distance_km: Optional[float] = None
    direct_path: Optional[List[dict]] = None
    safe_path: Optional[List[dict]] = None
    safe_duration_min: Optional[int] = None

    
    class Config:
        use_enum_values = True
        # Allow extra fields from C++ output without crashing
        extra = "ignore"


# ─── Dispatch ─────────────────────────────────────────────────────────────────

class DispatchCreate(BaseModel):
    warehouse_id:  str
    destination:   CityLocation
    resources:     StockLevels
    route_summary: Optional[str] = None

class Dispatch(DispatchCreate):
    id:        str           = Field(default_factory=lambda: str(uuid.uuid4()))
    status:    DispatchStatus = DispatchStatus.PENDING
    timestamp: str           = Field(default_factory=lambda: datetime.utcnow().isoformat())
    eta:       Optional[str] = None

    class Config:
        use_enum_values = True