﻿import { useEffect, useRef, useState } from "react";
import { Loader2, Route, AlertTriangle, CheckCircle, ArrowRight, Info } from "lucide-react";
import CitySearch from "@/components/CitySearch";
import LeafletMap from "@/components/LeafletMap";
import { RouteData, RouteSegment, Disaster, useAppContext } from "@/contexts/AppContext";
import { fetchRoute } from "@/lib/api";
import { toast } from "sonner";

// â”€â”€â”€ Helpers (module level — outside the component) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const param = lenSq !== 0 ? dot / lenSq : -1;
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
  const tag = blocked
    ? { label: "Blocked", cls: "bg-red-50 text-red-600" }
    : isAlternate
    ? { label: "Recommended", cls: "bg-green-50 text-green-600" }
    : { label: "Safe", cls: "bg-green-50 text-green-600" };

  const shell = blocked
    ? "border-l-red-400 bg-red-50/40"
    : isAlternate
    ? "border-l-green-400 bg-green-50/30"
    : "border-l-green-400 bg-white";

  return (
    <div
      className={`stat-card border-l-4 ${shell}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {blocked
            ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            : <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />}
          <span className="text-sm font-semibold text-gray-800">{label}</span>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tag.cls}`}>
          {tag.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/70 px-3 py-3 text-center ring-1 ring-black/5">
          <p className={`text-lg font-semibold ${blocked ? "text-red-600" : "text-emerald-700"}`}>{distance.toLocaleString()} km</p>
          <p className="mt-1 text-xs text-gray-400">Distance</p>
        </div>
        <div className="rounded-2xl bg-white/70 px-3 py-3 text-center ring-1 ring-black/5">
          <p className={`text-lg font-semibold ${blocked ? "text-red-600" : "text-emerald-700"}`}>{eta}</p>
          <p className="mt-1 text-xs text-gray-400">ETA</p>
        </div>
        <div className="rounded-2xl bg-white/70 px-3 py-3 text-center ring-1 ring-black/5">
          <p className={`text-lg font-semibold ${blocked ? "text-red-600" : "text-emerald-700"}`}>{blocked ? "Blocked" : "Safe"}</p>
          <p className="mt-1 text-xs text-gray-400">Status</p>
        </div>
      </div>

      {deltaKm !== undefined && deltaPercent && (
        <p className="mt-2 text-sm text-gray-500">
          +{deltaKm.toLocaleString()} km (+{deltaPercent})
        </p>
      )}

      {blocked && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Passes through active disaster zone — safe detour shown on map
        </div>
      )}
      {isAlternate && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          Safe detour calculated by C++ optimizer (sum of path edges)
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function RouteOperationsTab() {
  const { state, dispatch, addLog, setRouteData, setAlternateRouteData } = useAppContext();
  const [finding, setFinding] = useState(false);
  const restoredLogged = useRef(false);

  useEffect(() => {
    if (restoredLogged.current) return;
    if (!state.route && !state.alternateRoute) return;

    restoredLogged.current = true;
    console.log("[route] restored from AppContext", {
      source: state.source?.name,
      destination: state.destination?.name,
      hasRoute: !!state.route,
      hasAlternate: !!state.alternateRoute,
    });
  }, [state.alternateRoute, state.destination, state.route, state.source]);

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
    setRouteData(null);
    setAlternateRouteData(null);

    try {
      const result = await fetchRoute(state.source, state.destination);
      const activeDisasters = state.disasters.filter((d) => d.status === "active");

      if (result.blocked) {
        // Backend already computed the safe detour in result.path
        // result.directPath is the original blocked route (for red line on map)
        setRouteData(result);
        console.log("[route] saved to AppContext (blocked)", { distance: result.distance, eta: result.eta });
        addLog("route", "Route blocked by disaster zone. Safe detour calculated by optimizer.", "warning");
        toast.warning("Route blocked — safe detour shown on map.");
      } else {
        // Double-check with frontend too
        const frontendSafe = isRouteActuallySafe(result.path, activeDisasters);
        const safeResult: RouteData = { ...result, safe: frontendSafe };
        setRouteData(safeResult);
        console.log("[route] saved to AppContext (safe)", { distance: safeResult.distance, eta: safeResult.eta });
        addLog("route", `Safe route: ${result.distance} km, ETA: ${result.eta}`, "success");
        toast.success(`Safe route found: ${result.distance} km, ETA: ${result.eta}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
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
    setRouteData(null);
    setAlternateRouteData(null);
    addLog("route", "Route cleared.", "info");
  };

  return (
    <div className="h-[calc(100vh-112px)]">
      <div className="tab-shell h-full overflow-y-auto lg:overflow-hidden">
        <div className="grid h-full grid-cols-1 grid-rows-[45vh_auto] gap-4 lg:grid-cols-4 lg:grid-rows-[1fr]">
          <div className="min-w-0 min-h-0 lg:col-span-3">
            <div className="stat-card h-full p-3">
              <LeafletMap className="h-full w-full" />
            </div>
          </div>

          <div className="min-w-0 min-h-0 lg:col-span-1 space-y-6 overflow-visible lg:overflow-y-auto pr-1">
            <div className="stat-card">
              <h2 className="page-title">Route Operations</h2>
              <p className="mt-1 text-sm text-gray-500">
                Plan primary routes, detect blockages, and compare safe detours.
              </p>
            </div>

            <section className="stat-card space-y-4">
              <h3 className="section-title">Route Planning</h3>
              <div className="space-y-3">
            <CitySearch
              label="Source City"
              value={state.source}
              onSelect={(c) => {
                dispatch({ type: "SET_SOURCE",      payload: c });
                setRouteData(null);
                setAlternateRouteData(null);
              }}
              placeholder="Search source city..."
            />
            <CitySearch
              label="Destination City"
              value={state.destination}
              onSelect={(c) => {
                dispatch({ type: "SET_DESTINATION", payload: c });
                setRouteData(null);
                setAlternateRouteData(null);
              }}
              placeholder="Search destination city..."
            />

            {state.source && state.destination && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-black/5">
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
                <button onClick={handleClearRoute} disabled={finding} className="btn-outline px-4">
                  Clear
                </button>
              )}
            </div>

            {state.errors.route && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {state.errors.route}
              </div>
            )}
          </div>
        </section>

        {state.route && (
          <section className="stat-card space-y-3">
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
              <div className="flex items-start gap-2 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Red dashed = original (blocked), Green solid = safe detour. Distances now show path sums!
              </div>
            )}
          </section>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}


