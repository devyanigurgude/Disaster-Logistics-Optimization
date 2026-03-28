// API integration layer.
// Routes go through the Python/C++ backend.
// Disasters & warehouses are synced with the backend on load and on mutation.

import { City, RouteData, RouteSegment, Disaster, Warehouse } from "@/contexts/AppContext";

export const API_BASE = "/api";

// ─── Generic fetch helper ─────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `API error ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// ─── Route (calls Python → C++ optimizer) ────────────────────────────────────

export async function fetchRoute(
  source: City,
  destination: City
): Promise<RouteData> {
  // IMPORTANT:
  // Do NOT send disasters from frontend.
  // Backend is the single source of truth for disaster data.
  const body = {
    source:      { lat: source.lat, lon: source.lon },
    destination: { lat: destination.lat, lon: destination.lon },
  };

  const data = await apiFetch<any>("/route", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const path: RouteSegment[] = data.path.map((p: any) => ({
    lat: p.lat,
    lon: p.lon,
  }));

  return {
    path,
    distance:           Math.round(data.distance_km),
    eta:                data.eta,
    safe:               !data.blocked,
    blocked:            data.blocked,
    alternateAvailable: false,
  };
}

// IMPORTANT:
// Alternate route must NOT be forced safe.
// Trust backend response for safety status.
export async function fetchAlternateRoute(
  source: City,
  destination: City
): Promise<RouteData> {
  const data = await apiFetch<any>("/route", {
    method: "POST",
    body: JSON.stringify({
      source:      { lat: source.lat, lon: source.lon },
      destination: { lat: destination.lat, lon: destination.lon },
    }),
  });

  const path: RouteSegment[] = data.path.map((p: any) => ({
    lat: p.lat,
    lon: p.lon,
  }));

  return {
    path,
    distance:           Math.round(data.distance_km),
    eta:                data.eta,
    safe:               !data.blocked,
    blocked:            data.blocked,
    alternateAvailable: false,
  };
}

// ─── Disasters ────────────────────────────────────────────────────────────────

export async function loadDisasters(): Promise<Disaster[]> {
  const data = await apiFetch<any[]>("/disasters");
  return data.map(mapDisaster);
}

export async function createDisaster(d: Omit<Disaster, "id" | "timestamp">): Promise<Disaster> {
  const body = {
    type:        d.type,
    severity:    d.severity,
    location:    d.location,
    radius_km:   d.radius,
    status:      d.status,
    description: d.description,
  };
  const data = await apiFetch<any>("/disasters", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapDisaster(data);
}

export async function updateDisaster(id: string, d: Omit<Disaster, "id" | "timestamp">): Promise<Disaster> {
  const body = {
    type:        d.type,
    severity:    d.severity,
    location:    d.location,
    radius_km:   d.radius,
    status:      d.status,
    description: d.description,
  };
  const data = await apiFetch<any>(`/disasters/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapDisaster(data);
}

export async function deleteDisaster(id: string): Promise<void> {
  await apiFetch(`/disasters/${id}`, { method: "DELETE" });
}

// ─── Warehouses ───────────────────────────────────────────────────────────────

export async function loadWarehouses(): Promise<Warehouse[]> {
  const data = await apiFetch<any[]>("/warehouses");
  return data.map(mapWarehouse);
}

export async function createWarehouse(w: Omit<Warehouse, "id">): Promise<Warehouse> {
  const body = {
    name:     w.name,
    location: w.location,
    capacity: w.capacity,
    current_stock: {
      food:      w.currentStock.food,
      water:     w.currentStock.water,
      medicine:  w.currentStock.medicine,
      first_aid: w.currentStock.firstAid,
    },
  };
  const data = await apiFetch<any>("/warehouses", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapWarehouse(data);
}

export async function updateWarehouse(id: string, w: Omit<Warehouse, "id">): Promise<Warehouse> {
  const body = {
    name:     w.name,
    location: w.location,
    capacity: w.capacity,
    current_stock: {
      food:      w.currentStock.food,
      water:     w.currentStock.water,
      medicine:  w.currentStock.medicine,
      first_aid: w.currentStock.firstAid,
    },
  };
  const data = await apiFetch<any>(`/warehouses/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapWarehouse(data);
}

export async function deleteWarehouse(id: string): Promise<void> {
  await apiFetch(`/warehouses/${id}`, { method: "DELETE" });
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export async function createDispatch(payload: {
  warehouse_id: string;
  destination: City;
  resources: { food: number; water: number; medicine: number; firstAid: number };
  route_summary?: string;
}): Promise<void> {
  await apiFetch("/dispatches", {
    method: "POST",
    body: JSON.stringify({
      warehouse_id:  payload.warehouse_id,
      destination:   payload.destination,
      resources: {
        food:      payload.resources.food,
        water:     payload.resources.water,
        medicine:  payload.resources.medicine,
        first_aid: payload.resources.firstAid,
      },
      route_summary: payload.route_summary ?? null,
    }),
  });
}

// ─── Local helpers (no backend needed) ───────────────────────────────────────

export function checkRouteAgainstDisasters(
  route: RouteData,
  disasters: Disaster[]
): { blocked: boolean; affectingDisasters: Disaster[] } {
  const active = disasters.filter((d) => d.status === "active");
  const affecting: Disaster[] = [];
  for (const d of active) {
    const sampled = route.path.filter((_, i) => i % 5 === 0);
    for (const pt of sampled) {
      if (haversine(pt.lat, pt.lon, d.location.lat, d.location.lon) <= d.radius) {
        affecting.push(d);
        break;
      }
    }
  }
  return { blocked: affecting.length > 0, affectingDisasters: affecting };
}

export function selectBestWarehouse(
  destination: City,
  warehouses: Warehouse[],
  required: { food: number; water: number; medicine: number; firstAid: number }
): { best: Warehouse | null; alternatives: Warehouse[]; reason: string } {
  if (!warehouses.length) return { best: null, alternatives: [], reason: "No warehouses available" };

  const scored = warehouses
    .map((w) => ({
      warehouse: w,
      distance: haversine(destination.lat, destination.lon, w.location.lat, w.location.lon),
      hasResources:
        w.currentStock.food >= required.food &&
        w.currentStock.water >= required.water &&
        w.currentStock.medicine >= required.medicine &&
        w.currentStock.firstAid >= required.firstAid,
    }))
    .sort((a, b) => a.distance - b.distance);

  const eligible = scored.filter((s) => s.hasResources);
  if (eligible.length > 0) {
    return {
      best:         eligible[0].warehouse,
      alternatives: eligible.slice(1).map((e) => e.warehouse),
      reason:       `Nearest warehouse with sufficient resources (${Math.round(eligible[0].distance)} km away)`,
    };
  }
  return {
    best:         scored[0].warehouse,
    alternatives: scored.slice(1).map((s) => s.warehouse),
    reason:       `Nearest warehouse selected (${Math.round(scored[0].distance)} km away — verify stock levels)`,
  };
}

export function selectNearestWarehouse(destination: City, warehouses: Warehouse[]): Warehouse | null {
  if (!warehouses.length) return null;
  return warehouses.reduce((nearest, w) => {
    const dNearest = haversine(destination.lat, destination.lon, nearest.location.lat, nearest.location.lon);
    const dCurrent = haversine(destination.lat, destination.lon, w.location.lat, w.location.lon);
    return dCurrent < dNearest ? w : nearest;
  });
}

export function getWarehouseDistance(destination: City, warehouse: Warehouse): number {
  return Math.round(haversine(destination.lat, destination.lon, warehouse.location.lat, warehouse.location.lon));
}

// ─── Mappers (backend snake_case → frontend camelCase) ────────────────────────

function mapDisaster(d: any): Disaster {
  return {
    id:          d.id,
    type:        d.type,
    severity:    d.severity,
    location:    d.location,
    radius:      d.radius_km,  // ← backend sends radius_km not radius
    status:      d.status,
    timestamp:   d.timestamp,
    description: d.description,
  };
}
function mapWarehouse(w: any): Warehouse {
  return {
    id:       w.id,
    name:     w.name,
    location: w.location,
    capacity: w.capacity,
    currentStock: {
      food:      w.current_stock?.food      ?? 0,
      water:     w.current_stock?.water     ?? 0,
      medicine:  w.current_stock?.medicine  ?? 0,
      firstAid:  w.current_stock?.first_aid ?? 0,
    },
  };
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
