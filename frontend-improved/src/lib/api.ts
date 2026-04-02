// API integration layer.
// Routes go through the Python/C++ backend.
// Disasters & warehouses are synced with the backend on load and on mutation.

import { City, RouteData, RouteSegment, Disaster, Warehouse } from "@/contexts/AppContext";

// export const API_BASE = "/api";
const API_BASE = "http://localhost:8000/api";

type BackendRoutePoint = { lat: number; lon: number };
type BackendRouteResponse = {
  path: BackendRoutePoint[];
  direct_path?: BackendRoutePoint[];
  safe_path?: BackendRoutePoint[];
  distance_km: number;
  direct_distance_km?: number;
  safe_distance_km?: number;
  eta: string;
  blocked: boolean;
  direct_duration_min?: number;
  safe_duration_min?: number;
};

function formatEta(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const mins = Math.round((then - now) / 60000);
  if (isNaN(mins) || mins <= 0) return "-";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
type BackendDisaster = {
  id: string;
  type: string;
  severity: Disaster["severity"];
  location: City;
  radius_km: number;
  status: Disaster["status"];
  timestamp: string;
  description: string;
};

type BackendWarehouse = {
  id: string;
  name: string;
  location: City;
  capacity: number;
  current_stock?: {
    food?: number;
    water?: number;
    medicine?: number;
    first_aid?: number;
  };
};

function errorDetailFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as Record<string, unknown>).detail;
  return typeof detail === "string" ? detail : null;
}

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
    const errBody = (await res.json().catch(() => null)) as unknown;
    const detail = errorDetailFromBody(errBody);
    throw new Error(detail ?? `API error ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// ─── Route (calls Python → C++ optimizer) ────────────────────────────────────
export async function fetchRoute(
  source: City,
  destination: City
): Promise<RouteData> {

  const body = {
    source:      { lat: source.lat, lon: source.lon },
    destination: { lat: destination.lat, lon: destination.lon },
  };

  const data = await apiFetch<any>("/route", {
    method: "POST",
    body: JSON.stringify(body),
  });

  console.log("Backend route data:", {
    direct_distance_km: data.direct_distance_km,
    safe_distance_km: data.safe_distance_km,
    distance_km: data.distance_km,
    blocked: data.blocked,
    direct_path: data.direct_path?.length,
    safe_path: data.safe_path?.length,
    path: data.path?.length,
  });

  // Backend returns safe path as primary `path`, direct/blocked as `direct_path`
  const path: RouteSegment[] = (data.path || []).map((p: any) => ({
    lat: p.lat,
    lon: p.lon,
  }));

  const directPath: RouteSegment[] = (data.direct_path || path).map((p: any) => ({
    lat: p.lat,
    lon: p.lon,
  }));

  const safePath: RouteSegment[] = (data.safe_path || path).map((p: any) => ({
    lat: p.lat,
    lon: p.lon,
  }));

  const directDistance = Math.round((data.direct_distance_km || data.distance_km || 0));
  const safeDistance = Math.round((data.safe_distance_km || data.distance_km || 0));

  return {
    path: data.blocked ? safePath : path,
    directPath,
    safePath,
    directDistance,
    safeDistance,
    distance: safeDistance,  // chosen/primary
    eta: formatEta(data.eta || ""),
    safe: data.status === "ok" && !data.blocked,
    blocked: !!data.blocked,
    alternateAvailable: data.blocked && !!data.safe_path && data.safe_path.length > 0,
  };
}

// ─── Route computation (to be called from component with state & dispatch) ────
// ─── Disasters ────────────────────────────────────────────────────────────────

export async function loadDisasters(): Promise<Disaster[]> {
  const data = await apiFetch<BackendDisaster[]>("/disasters");
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
  const data = await apiFetch<BackendDisaster>("/disasters", {
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
  const data = await apiFetch<BackendDisaster>(`/disasters/${id}`, {
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
  const data = await apiFetch<BackendWarehouse[]>("/warehouses");
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
  const data = await apiFetch<BackendWarehouse>("/warehouses", {
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
  const data = await apiFetch<BackendWarehouse>(`/warehouses/${id}`, {
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
        food:      payload.resources.food      ?? 0,
        water:     payload.resources.water     ?? 0,
        medicine:  payload.resources.medicine  ?? 0,
        first_aid: payload.resources.firstAid  ?? 0,
      }, route_summary: payload.route_summary ?? null,
    }),
  });
}

// ─── Local helpers (no backend needed) ───────────────────────────────────────
export function selectBestWarehouse(
  destination: City,
  warehouses: Warehouse[],
  required: { food: number; water: number; medicine: number; firstAid: number }
): { best: Warehouse | null; alternatives: Warehouse[]; reason: string } {
  if (!warehouses.length) return { best: null, alternatives: [], reason: "No warehouses available" };

  const scored = warehouses
    .map((w) => {
      const distance = haversine(destination.lat, destination.lon, w.location.lat, w.location.lon);
      const totalStock = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
      const stockFill = w.capacity > 0 ? totalStock / w.capacity : 0;
      const hasResources =
        w.currentStock.food >= required.food &&
        w.currentStock.water >= required.water &&
        w.currentStock.medicine >= required.medicine &&
        w.currentStock.firstAid >= required.firstAid;
      const hasAnyStock =
        w.currentStock.food > 0 ||
        w.currentStock.water > 0 ||
        w.currentStock.medicine > 0 ||
        w.currentStock.firstAid > 0;
      const safetyPenalty = 0; // Future: integrate route.blocked or disaster proximity
      const score = (distance * 0.6) - (stockFill * 100 * 0.4) + safetyPenalty;
      return { warehouse: w, distance, stockFill, hasResources, hasAnyStock, score };
    })
    .sort((a, b) => a.score - b.score); // Lower score better

  const PROXIMITY_MAX_KM = 500;

  // Priority 1: Full stock within 500km (score-sorted)
  const fullProximal = scored.filter(s => s.distance <= PROXIMITY_MAX_KM && s.hasResources);
  if (fullProximal.length > 0) {
    return {
      best: fullProximal[0].warehouse,
      alternatives: fullProximal.slice(1).map(e => e.warehouse),
      reason: `Best warehouse within 500km with full resources (${Math.round(fullProximal[0].distance)} km, ${Math.round(fullProximal[0].stockFill * 100)}% fill)`,
    };
  }

  // Priority 2: Partial stock within 500km
  const partialProximal = scored.filter(s => s.distance <= PROXIMITY_MAX_KM && s.hasAnyStock && !s.hasResources);
  if (partialProximal.length > 0) {
    return {
      best: partialProximal[0].warehouse,
      alternatives: partialProximal.slice(1).map(e => e.warehouse),
      reason: `Best partial-stock warehouse within 500km (${Math.round(partialProximal[0].distance)} km, ${Math.round(partialProximal[0].stockFill * 100)}% fill)`,
    };
  }

  // Priority 3: Full stock any distance
  const fullAny = scored.filter(s => s.hasResources);
  if (fullAny.length > 0) {
    return {
      best: fullAny[0].warehouse,
      alternatives: fullAny.slice(1).map(e => e.warehouse),
      reason: `Best full-stock warehouse (${Math.round(fullAny[0].distance)} km away, ${Math.round(fullAny[0].stockFill * 100)}% fill) — beyond 500km proximity`,
    };
  }

  // Priority 4: Partial stock any distance
  const partialAny = scored.filter(s => s.hasAnyStock && !s.hasResources);
  if (partialAny.length > 0) {
    return {
      best: partialAny[0].warehouse,
      alternatives: partialAny.slice(1).map(e => e.warehouse),
      reason: `Best available partial-stock warehouse (${Math.round(partialAny[0].distance)} km, ${Math.round(partialAny[0].stockFill * 100)}% fill)`,
    };
  }

  // Fallback: nearest regardless
  return {
    best: scored[0]?.warehouse ?? null,
    alternatives: scored.slice(1).map(s => s.warehouse),
    reason: `Nearest warehouse selected (${Math.round(scored[0]?.distance ?? 0)} km) — low/no stock warning`,
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

function mapDisaster(d: BackendDisaster): Disaster {
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
function mapWarehouse(w: BackendWarehouse): Warehouse {
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
export async function loadDispatches() {
  try {
    const data = await apiFetch<any[]>("/dispatches");
    return data.map((d) => ({
      id: d.id,
      warehouseId: d.warehouse_id,
      warehouseName: d.warehouse_id,
      route: null,
      resources: {
        food:      d.resources?.food      ?? 0,
        water:     d.resources?.water     ?? 0,
        medicine:  d.resources?.medicine  ?? 0,
        firstAid:  d.resources?.first_aid ?? 0,
      },
      status: d.status ?? "pending",
      eta: d.eta ?? "-",
      timestamp: d.timestamp ?? new Date().toISOString(),
      destination: d.destination,
      currentPosition: undefined,
    }));
  } catch {
    return [];
  }
}

export async function updateDispatchStatus(id: string, newStatus: string): Promise<void> {
  await apiFetch(`/dispatches/${id}/status?new_status=${newStatus}`, { method: "PUT" });
}