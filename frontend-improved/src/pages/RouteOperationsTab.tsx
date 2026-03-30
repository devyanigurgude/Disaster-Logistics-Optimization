import { useState } from "react";
import { Loader2, Route, AlertTriangle, CheckCircle, ArrowRight, Info } from "lucide-react";
import CitySearch from "@/components/CitySearch";
import LeafletMap from "@/components/LeafletMap";
import { RouteData, useAppContext } from "@/contexts/AppContext";
import { fetchRoute, fetchAlternateRoute } from "@/lib/api";
import { toast } from "sonner";

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
  dispatch({ type: "SET_ERROR", payload: { route: null } });
  dispatch({ type: "SET_ROUTE", payload: null });
  dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });

  try {
    // Always fetch both primary and alternate routes in parallel
    const [route, altRoute] = await Promise.allSettled([
      fetchRoute(state.source, state.destination),
      fetchAlternateRoute(state.source, state.destination),
    ]);

    if (route.status === "rejected") {
      throw new Error(route.reason?.message ?? "Route calculation failed");
    }

    const primaryRoute = route.value;
    // Skip frontend collision check - trust backend blocked flag
    const blocked = primaryRoute.blocked;
    const affectingDisasters = []; // Filled only if needed for logs

    // Check if disaster is near source or destination directly
    const activeDisasters = state.disasters.filter((d) => d.status === "active");
    const nearbyDisaster = activeDisasters.some((d) => {
      const distToSrc = haversineCheck(
        state.source!.lat, state.source!.lon,
        d.location.lat, d.location.lon
      );
      const distToDst = haversineCheck(
        state.destination!.lat, state.destination!.lon,
        d.location.lat, d.location.lon
      );
      return distToSrc <= d.radius * 1.5 || distToDst <= d.radius * 1.5;
    });

    const isBlocked = blocked || nearbyDisaster;

    if (isBlocked) {
      const blockedRoute = {
        ...primaryRoute,
        blocked: true,
        safe: false,
        alternateAvailable: true,
      };
      dispatch({ type: "SET_ROUTE", payload: blockedRoute });
      addLog(
        "route",
        `Route blocked by: ${affectingDisasters.length > 0
          ? affectingDisasters.map((d) => `${d.type} near ${d.location.name}`).join("; ")
          : "active disaster zone near route"}`,
        "warning"
      );
      toast.warning("Primary route affected by disaster zone. Alternate route loaded.");

      if (altRoute.status === "fulfilled") {
        dispatch({ type: "SET_ALTERNATE_ROUTE", payload: altRoute.value });
        addLog(
          "route",
          `Alternate safe route: ${altRoute.value.distance} km, ETA: ${altRoute.value.eta}`,
          "success"
        );
      } else {
        addLog("route", "No alternate route available.", "error");
        toast.error("No alternate route could be calculated.");
      }
    } else {
      dispatch({ type: "SET_ROUTE", payload: primaryRoute });
      addLog(
        "route",
        `Safe route confirmed: ${primaryRoute.distance} km, ETA: ${primaryRoute.eta}`,
        "success"
      );
      toast.success(`Safe route: ${primaryRoute.distance} km, ETA: ${primaryRoute.eta}`);

      // Still show alternate if disasters exist anywhere on the map
      if (activeDisasters.length > 0 && altRoute.status === "fulfilled") {
        dispatch({ type: "SET_ALTERNATE_ROUTE", payload: altRoute.value });
      }
    }
  } catch (err: any) {
    const msg = err.message ?? "Unknown error";
    addLog("route", `Route calculation failed: ${msg}`, "error");
    dispatch({ type: "SET_ERROR", payload: { route: msg } });
    toast.error("Failed to calculate route.");
  } finally {
    setFinding(false);
    dispatch({ type: "SET_LOADING", payload: { route: false } });
  }
};

  const handleClearRoute = () => {
    dispatch({ type: "SET_SOURCE", payload: null });
    dispatch({ type: "SET_DESTINATION", payload: null });
    dispatch({ type: "SET_ROUTE", payload: null });
    dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });
    addLog("route", "Route cleared.", "info");
  };

  // Add this helper function inside the component file (outside the component):
  function haversineCheck(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
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

  const activeDisasters = state.disasters.filter((d) => d.status === "active");
  const routeLogs = state.logs.filter((l) => l.type === "route").slice(0, 8);

  
function RouteInfoCard({
  label,
  route,
  isAlternate,
}: {
  label: string;
  route: RouteData;
  isAlternate?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        route.blocked
          ? "border-red-200 bg-red-50"
          : isAlternate
          ? "border-emerald-300 bg-emerald-50"
          : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {route.blocked ? (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        ) : (
          <CheckCircle className="h-4 w-4 text-emerald-600" />
        )}

        <span className="text-sm font-bold text-foreground">{label}</span>

        {isAlternate && !route.blocked && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
            Recommended ✓
          </span>
        )}

        {!isAlternate && route.blocked && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
            Blocked ✖
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-sm font-bold">{route.distance} km</p>
          <p className="text-[11px] text-muted-foreground">Distance</p>
        </div>

        <div className="text-center">
          <p className="text-sm font-bold">{route.eta}</p>
          <p className="text-[11px] text-muted-foreground">ETA</p>
        </div>

        <div className="text-center">
          <p
            className={`text-sm font-bold ${
              route.blocked ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {route.blocked ? "Blocked" : "Safe"}
          </p>
          <p className="text-[11px] text-muted-foreground">Status</p>
        </div>
      </div>
    </div>
  );
}
  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
  
  <div className="w-[65%] min-w-0 p-3">
    <LeafletMap className="h-full w-full" />
  </div>

  <div className="w-[35%] shrink-0 overflow-y-auto border-l bg-white p-6 space-y-6">
    
    {/* Route Planning */}
        <section className="space-y-4">
          <h3 className="section-title">Route Planning</h3>
          <div className="space-y-3">
            <CitySearch label="Source City" value={state.source}
              onSelect={(c) => { dispatch({ type: "SET_SOURCE", payload: c }); dispatch({ type: "SET_ROUTE", payload: null }); dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null }); }}
              placeholder="Search source city..." />
            <CitySearch label="Destination City" value={state.destination}
              onSelect={(c) => { dispatch({ type: "SET_DESTINATION", payload: c }); dispatch({ type: "SET_ROUTE", payload: null }); dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null }); }}
              placeholder="Search destination city..." />

            {state.source && state.destination && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                <span className="font-semibold text-foreground truncate">{state.source.name}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-semibold text-foreground truncate">{state.destination.name}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleFindRoute}
                disabled={finding || !state.source || !state.destination}
                className="btn-primary flex-1">
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

{/* Route Result */}
{state.route && (
  <section className="space-y-3">
    <h3 className="section-title">Route Result</h3>

    {/* PRIMARY ROUTE */}
    <RouteInfoCard
      label="Primary Route (Original)"
      route={state.route}
    />

    {/* ALTERNATE ROUTE */}
    {state.alternateRoute && (
      <>
        <RouteInfoCard
          label="Alternate Route (Recommended)"
          route={state.alternateRoute}
          isAlternate
        />

        {/* Recommendation Logic */}
        {!state.alternateRoute.blocked && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-medium">
            ✔ System recommends using the alternate route for safe delivery
          </div>
        )}

        {state.alternateRoute.blocked && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ Alternate route is also affected. Manual decision required.
          </div>
        )}
      </>
    )}

    {/* NO ALTERNATE CASE */}
    {state.route.blocked && !state.alternateRoute && (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        No alternate route available. Manual coordination required.
      </div>
    )}
  </section>
)}
      </div>
    </div>
  );
}
