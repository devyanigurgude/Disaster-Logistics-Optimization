import { useState } from "react";
import { Loader2, Route, AlertTriangle, CheckCircle, ArrowRight, Info } from "lucide-react";
import CitySearch from "@/components/CitySearch";
import LeafletMap from "@/components/LeafletMap";
import { RouteData, RouteSegment, Disaster, useAppContext } from "@/contexts/AppContext";
import { fetchRoute } from "@/lib/api";
import { toast } from "sonner";

// ─── Helpers (module level — outside the component) ───────────────────────────

function haversineCheck(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function distancePointToSegment(
  cLat: number, cLon: number,
  p1Lat: number, p1Lon: number,
  p2Lat: number, p2Lon: number
): number {
  const A = p1Lat - cLat;
  const B = p1Lon - cLon;
  const C = p2Lat - cLat;
  const D = p2Lon - cLon;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  let xx: number, yy: number;
  if (param < 0)      { xx = p1Lon; yy = p1Lat; }
  else if (param > 1) { xx = p2Lon; yy = p2Lat; }
  else                { xx = p1Lon + param * (p2Lon - p1Lon); yy = p1Lat + param * (p2Lat - p1Lat); }
  return haversineCheck(yy, xx, cLat, cLon);
}

function isRouteActuallySafe(path: RouteSegment[], disasters: Disaster[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const d of disasters) {
      const dist = distancePointToSegment(
        d.location.lat, d.location.lon,
        path[i].lat, path[i].lon,
        path[i + 1].lat, path[i + 1].lon
      );
      if (dist <= d.radius) return false;
    }
  }
  return true;
}

interface RouteInfoProps {
  label: string;
  distance: number;
  eta: string;
  blocked: boolean;
  isAlternate?: boolean;
  deltaKm?: number;
  deltaPercent?: string;
}

function RouteInfoCard({
  label, distance, eta, blocked, isAlternate, deltaKm, deltaPercent,
}: RouteInfoProps) {
  return (
    <div className={`rounded-xl border-2 p-4 ${
      blocked
        ? "border-red-300 bg-red-50"
        : isAlternate
        ? "border-emerald-400 bg-emerald-50"
        : "border-emerald-200 bg-emerald-50"
    }`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {blocked
            ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            : <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />}
          <span className="text-sm font-bold text-foreground">{label}</span>
        </div>
        {blocked ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 px-2 py-1 rounded-md border border-red-200">
            BLOCKED
          </span>
        ) : isAlternate ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md border border-emerald-200">
            SAFE DETOUR
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center bg-white/60 rounded-lg py-2 px-1">
          <p className={`text-lg font-bold ${blocked ? "text-red-600" : "text-emerald-700"}`}>
            {distance.toLocaleString()} km
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5">Distance</p>
        </div>
        <div className="text-center bg-white/60 rounded-lg py-2 px-1">
          <p className={`text-lg font-bold ${blocked ? "text-red-600" : "text-emerald-700"}`}>
            {eta}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5">ETA</p>
        </div>
        <div className="text-center bg-white/60 rounded-lg py-2 px-1">
          <p className={`text-lg font-bold ${blocked ? "text-red-600" : "text-emerald-700"}`}>
            {blocked ? "Blocked" : "Safe"}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5">Status</p>
        </div>
      </div>

      {deltaKm !== undefined && deltaPercent && (
        <div className="mt-2 p-2 bg-gradient-to-r from-emerald-100 to-blue-100 rounded-lg border">
          <p className="text-sm font-semibold text-emerald-800">
            +{deltaKm.toLocaleString()} km ({deltaPercent} longer)
          </p>
        </div>
      )}

      {blocked && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-100 border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Passes through active disaster zone — safe detour shown on map
        </div>
      )}
      {isAlternate && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-100 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 font-medium">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          Safe detour calculated by C++ optimizer (sum of path edges)
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RouteOperationsTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [finding, setFinding] = useState(false);

  const handleFindRoute = async () => {
    if (!state.source || !state.destination) {
      toast.error("Please select both source and destination cities.");
      return;
    }
    if (
      state.source.lat === state.destination.lat &&
      state.source.lon === state.destination.lon
    ) {
      toast.error("Source and destination cannot be the same city.");
      return;
    }

    setFinding(true);
    dispatch({ type: "SET_LOADING", payload: { route: true } });
    dispatch({ type: "SET_ERROR",   payload: { route: null } });
    dispatch({ type: "SET_ROUTE",   payload: null });
    dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });

    try {
      const result = await fetchRoute(state.source, state.destination);
      const activeDisasters = state.disasters.filter((d) => d.status === "active");

      if (result.blocked) {
        // Backend already computed the safe detour in result.path
        // result.directPath is the original blocked route (for red line on map)
        dispatch({ type: "SET_ROUTE", payload: result });
        addLog("route", "Route blocked by disaster zone. Safe detour calculated by optimizer.", "warning");
        toast.warning("Route blocked — safe detour shown on map.");
      } else {
        // Double-check with frontend too
        const frontendSafe = isRouteActuallySafe(result.path, activeDisasters);
        dispatch({ type: "SET_ROUTE", payload: { ...result, safe: frontendSafe } });
        addLog("route", `Safe route: ${result.distance} km, ETA: ${result.eta}`, "success");
        toast.success(`Safe route found: ${result.distance} km, ETA: ${result.eta}`);
      }
    } catch (err: any) {
      const msg = err.message ?? "Unknown error";
      addLog("route", `Route calculation failed: ${msg}`, "error");
      dispatch({ type: "SET_ERROR", payload: { route: msg } });
      toast.error("Failed to calculate route. Is the backend running?");
    } finally {
      setFinding(false);
      dispatch({ type: "SET_LOADING", payload: { route: false } });
    }
  };

  const handleClearRoute = () => {
    dispatch({ type: "SET_SOURCE",         payload: null });
    dispatch({ type: "SET_DESTINATION",    payload: null });
    dispatch({ type: "SET_ROUTE",          payload: null });
    dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });
    addLog("route", "Route cleared.", "info");
  };

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
      <div className="w-[65%] min-w-0 p-3">
        <LeafletMap className="h-full w-full" />
      </div>

      <div className="w-[35%] shrink-0 overflow-y-auto border-l bg-white p-6 space-y-6">

        <section className="space-y-4">
          <h3 className="section-title">Route Planning</h3>
          <div className="space-y-3">
            <CitySearch
              label="Source City"
              value={state.source}
              onSelect={(c) => {
                dispatch({ type: "SET_SOURCE",      payload: c });
                dispatch({ type: "SET_ROUTE",       payload: null });
                dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });
              }}
              placeholder="Search source city..."
            />
            <CitySearch
              label="Destination City"
              value={state.destination}
              onSelect={(c) => {
                dispatch({ type: "SET_DESTINATION", payload: c });
                dispatch({ type: "SET_ROUTE",       payload: null });
                dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });
              }}
              placeholder="Search destination city..."
            />

            {state.source && state.destination && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                <span className="font-semibold text-foreground truncate">{state.source.name}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-semibold text-foreground truncate">{state.destination.name}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleFindRoute}
                disabled={finding || !state.source || !state.destination}
                className="btn-primary flex-1"
              >
                {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                {finding ? "Calculating..." : "Find Route"}
              </button>
              {(state.source || state.destination || state.route) && (
                <button onClick={handleClearRoute} disabled={finding} className="btn-outline px-3">
                  Clear
                </button>
              )}
            </div>

            {state.errors.route && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {state.errors.route}
              </div>
            )}
          </div>
        </section>

        {state.route && (
          <section className="space-y-3">
            <h3 className="section-title">Route Result</h3>

            {state.route && (
              (() => {
                const originalDistance = state.route.directDistance || state.route.distance;
                const safeDistance = state.route.safeDistance || state.route.distance;
                const deltaKm = safeDistance - originalDistance;
                const deltaPercent = deltaKm > 0 ? ((deltaKm / originalDistance) * 100).toFixed(1) + "%" : "0%";

                console.log("Route distances:", {
                  originalDistance,
                  safeDistance,
                  deltaKm,
                  blocked: state.route.blocked,
                });

                if (state.route.blocked) {
                  return (
                    <>
                      <RouteInfoCard
                        label="Original Route — Blocked"
                        distance={originalDistance}
                        eta={state.route.eta}
                        blocked={true}
                      />
                      <RouteInfoCard
                        label="Safe Detour (Recommended)"
                        distance={safeDistance}
                        eta={state.route.eta}
                        blocked={false}
                        isAlternate={true}
                        deltaKm={deltaKm}
                        deltaPercent={deltaPercent}
                      />
                    </>
                  );
                } else {
                  return (
                    <RouteInfoCard
                      label="Primary Route — Safe"
                      distance={originalDistance}
                      eta={state.route.eta}
                      blocked={false}
                    />
                  );
                }
              })()
            )}

            {state.route?.blocked && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Red dashed = original (blocked), Green solid = safe detour. Distances now show path sums!
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
