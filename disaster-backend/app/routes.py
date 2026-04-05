"""
routes.py
All API endpoints. Imported by main.py and mounted on the FastAPI app.
"""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException, status

from app.models import (
    Disaster, DisasterCreate,
    Warehouse, WarehouseCreate,
    Dispatch, DispatchCreate,
    RouteRequest, RouteResponse,
)
from app.services.data_store import disaster_store, warehouse_store, dispatch_store, persist_data
from app.services.route_service import calculate_route

router = APIRouter()


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/health", tags=["System"])
def health_check():
    return {
        "status":     "ok",
        "disasters":  len(disaster_store.all()),
        "warehouses": len(warehouse_store.all()),
        "dispatches": len(dispatch_store.all()),
    }


# ─── Disasters ────────────────────────────────────────────────────────────────

@router.get("/disasters", response_model=List[Disaster], tags=["Disasters"])
def get_disasters():
    """Return all disaster records."""
    return disaster_store.all()


@router.post("/disasters", response_model=Disaster,
             status_code=status.HTTP_201_CREATED, tags=["Disasters"])
def create_disaster(body: DisasterCreate):
    """Report a new disaster."""
    disaster = Disaster(**body.model_dump())
    created = disaster_store.add(disaster)
    persist_data()
    return created


@router.get("/disasters/{id}", response_model=Disaster, tags=["Disasters"])
def get_disaster(id: str):
    d = disaster_store.get(id)
    if not d:
        raise HTTPException(status_code=404, detail=f"Disaster '{id}' not found")
    return d


@router.put("/disasters/{id}", response_model=Disaster, tags=["Disasters"])
def update_disaster(id: str, body: DisasterCreate):
    existing = disaster_store.get(id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Disaster '{id}' not found")
    updated = Disaster(id=id, timestamp=existing.timestamp, **body.model_dump())
    saved = disaster_store.update(id, updated)
    persist_data()
    return saved


@router.delete("/disasters/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Disasters"])
def delete_disaster(id: str):
    if not disaster_store.delete(id):
        raise HTTPException(status_code=404, detail=f"Disaster '{id}' not found")
    persist_data()


# ─── Warehouses ───────────────────────────────────────────────────────────────

@router.get("/warehouses", response_model=List[Warehouse], tags=["Warehouses"])
def get_warehouses():
    """Return all warehouses."""
    return warehouse_store.all()


@router.post("/warehouses", response_model=Warehouse,
             status_code=status.HTTP_201_CREATED, tags=["Warehouses"])
def create_warehouse(body: WarehouseCreate):
    """Register a new warehouse."""
    warehouse = Warehouse(**body.model_dump())
    created = warehouse_store.add(warehouse)
    persist_data()
    return created


@router.get("/warehouses/{id}", response_model=Warehouse, tags=["Warehouses"])
def get_warehouse(id: str):
    w = warehouse_store.get(id)
    if not w:
        raise HTTPException(status_code=404, detail=f"Warehouse '{id}' not found")
    return w


@router.put("/warehouses/{id}", response_model=Warehouse, tags=["Warehouses"])
def update_warehouse(id: str, body: WarehouseCreate):
    if not warehouse_store.get(id):
        raise HTTPException(status_code=404, detail=f"Warehouse '{id}' not found")
    updated = Warehouse(id=id, **body.model_dump())
    saved = warehouse_store.update(id, updated)
    persist_data()
    return saved


@router.delete("/warehouses/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Warehouses"])
def delete_warehouse(id: str):
    if not warehouse_store.delete(id):
        raise HTTPException(status_code=404, detail=f"Warehouse '{id}' not found")
    persist_data()


# ─── Route Optimization ───────────────────────────────────────────────────────

@router.post("/route", response_model=RouteResponse, tags=["Route"])
def find_route(body: RouteRequest):
    """
    Calculate an optimized, disaster-aware route using the C++ A* engine.

    - Accepts source & destination coordinates
    - Merges active stored disasters with any extra zones in the request
    - Calls optimizer.cpp via subprocess
    - Returns the path, distance, ETA, and safety flags
    """
    try:
        return calculate_route(body)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Dispatch ─────────────────────────────────────────────────────────────────

@router.get("/dispatches", response_model=List[Dispatch], tags=["Dispatch"])
def get_dispatches():
    return dispatch_store.all()


@router.post("/dispatches", response_model=Dispatch,
             status_code=status.HTTP_201_CREATED, tags=["Dispatch"])
def create_dispatch(body: DispatchCreate):
    """Create a new dispatch order."""
    warehouse = warehouse_store.get(body.warehouse_id)
    if not warehouse:
        raise HTTPException(status_code=404, detail=f"Warehouse '{body.warehouse_id}' not found")

    requested_resources = body.resources.model_dump()
    current_stock = warehouse.current_stock.model_dump()

    for resource_name, requested_quantity in requested_resources.items():
        available_quantity = current_stock.get(resource_name, 0)
        if requested_quantity > available_quantity:
            raise HTTPException(
                status_code=400,
                detail="Not enough stock available in warehouse",
            )

    updated_stock = {
        resource_name: max(0, current_stock.get(resource_name, 0) - requested_quantity)
        for resource_name, requested_quantity in requested_resources.items()
    }
    updated_warehouse = warehouse.model_copy(
        update={"current_stock": warehouse.current_stock.model_copy(update=updated_stock)}
    )
    warehouse_store.update(warehouse.id, updated_warehouse)

    dispatch = Dispatch(**body.model_dump())
    created = dispatch_store.add(dispatch)
    persist_data()
    return created


@router.put("/dispatches/{id}/status", response_model=Dispatch, tags=["Dispatch"])
def update_dispatch_status(id: str, new_status: str):
    """Update dispatch status: pending → in_transit → delivered."""
    d = dispatch_store.get(id)
    if not d:
        raise HTTPException(status_code=404, detail=f"Dispatch '{id}' not found")
    valid = {"pending", "in_transit", "delivered"}
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid}")
    updated = d.model_copy(update={"status": new_status})
    saved = dispatch_store.update(id, updated)
    persist_data()
    return saved