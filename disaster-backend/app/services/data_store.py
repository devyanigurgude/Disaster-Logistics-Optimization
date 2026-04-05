"""
data_store.py
In-memory store with simple JSON file persistence.
Thread-safe for single-process use.
"""

from __future__ import annotations

import threading
import json
import os
from typing import Dict, List, Optional, TypeVar, Generic, Type
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

STORE_FILE = "data/store.json"


def load_data():
    if not os.path.exists(STORE_FILE):
        return {
            "disasters": [],
            "warehouses": [],
            "dispatches": [],
        }

    with open(STORE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    os.makedirs("data", exist_ok=True)
    with open(STORE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


class Store(Generic[T]):
    """Generic in-memory key-value store backed by a list."""

    def __init__(self, model_cls: Type[T], collection_key: str):
        self._model    = model_cls
        self._key      = collection_key
        self._data:  Dict[str, T] = {}
        self._lock   = threading.Lock()

    def all(self) -> List[T]:
        with self._lock:
            return list(self._data.values())

    def get(self, id: str) -> Optional[T]:
        with self._lock:
            return self._data.get(id)

    def add(self, item: T) -> T:
        with self._lock:
            self._data[item.id] = item  # type: ignore[attr-defined]
            return item

    def update(self, id: str, item: T) -> Optional[T]:
        with self._lock:
            if id not in self._data:
                return None
            self._data[id] = item
            return item

    def delete(self, id: str) -> bool:
        with self._lock:
            if id in self._data:
                del self._data[id]
                return True
            return False

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def seed(self, items: List[dict]) -> None:
        with self._lock:
            for raw in items:
                obj = self._model(**raw)
                self._data[obj.id] = obj  # type: ignore[attr-defined]

    def serialize(self) -> List[dict]:
        with self._lock:
            return [item.model_dump(mode="json") for item in self._data.values()]


# ─── Global store instances ───────────────────────────────────────────────────
# Imported by routes and services

from app.models import Disaster, Warehouse, Dispatch

disaster_store = Store(Disaster,  "disasters")
warehouse_store = Store(Warehouse, "warehouses")
dispatch_store  = Store(Dispatch,  "dispatches")


def get_all_data() -> dict:
    return {
        "disasters": disaster_store.serialize(),
        "warehouses": warehouse_store.serialize(),
        "dispatches": dispatch_store.serialize(),
    }


def persist_data() -> None:
    save_data(get_all_data())


def initialize_from_data(data: dict) -> None:
    disaster_store.clear()
    warehouse_store.clear()
    dispatch_store.clear()
    disaster_store.seed(data.get("disasters", []))
    warehouse_store.seed(data.get("warehouses", []))
    dispatch_store.seed(data.get("dispatches", []))


# ─── Seed data ────────────────────────────────────────────────────────────────

def seed_initial_data() -> None:
    """Populate stores with realistic sample data on first startup."""
    if disaster_store.all():
        return  # Already seeded

    from datetime import datetime

    _disasters = [
        {
            "id":          "d1",
            "type":        "Flood",
            "severity":    "high",
            "location":    {"name": "Mumbai", "lat": 19.076, "lon": 72.8777},
            "radius_km":   30.0,
            "status":      "active",
            "description": "Severe coastal flooding; roads submerged.",
            "timestamp":   datetime.utcnow().isoformat(),
        },
        {
            "id":          "d2",
            "type":        "Earthquake",
            "severity":    "critical",
            "location":    {"name": "Kathmandu", "lat": 27.7172, "lon": 85.324},
            "radius_km":   50.0,
            "status":      "active",
            "description": "7.2 magnitude earthquake; major infrastructure damage.",
            "timestamp":   datetime.utcnow().isoformat(),
        },
    ]

    _warehouses = [
        {
            "id":       "w1",
            "name":     "Delhi Relief Hub",
            "location": {"name": "New Delhi", "lat": 28.6139, "lon": 77.209},
            "capacity": 10000,
            "current_stock": {"food": 5000, "water": 8000, "medicine": 2000, "first_aid": 1500},
        },
        {
            "id":       "w2",
            "name":     "Pune Emergency Center",
            "location": {"name": "Pune", "lat": 18.5204, "lon": 73.8567},
            "capacity": 7500,
            "current_stock": {"food": 3000, "water": 6000, "medicine": 1200, "first_aid": 900},
        },
        {
            "id":       "w3",
            "name":     "Chennai Logistics Base",
            "location": {"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
            "capacity": 8000,
            "current_stock": {"food": 4000, "water": 5000, "medicine": 1800, "first_aid": 1100},
        },
    ]

    disaster_store.seed(_disasters)
    warehouse_store.seed(_warehouses)
    persist_data()