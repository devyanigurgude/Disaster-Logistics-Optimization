import { useState } from "react";
import { Loader2, Route, AlertTriangle, CheckCircle, ArrowRight, Info } from "lucide-react";
import CitySearch from "@/components/CitySearch";
import LeafletMap from "@/components/LeafletMap";
import { useAppContext } from "@/contexts/AppContext";
import { fetchRoute, fetchAlternateRoute } from "@/lib/api";
import { toast } from "sonner";

export default function RouteOperationsTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [finding, setFinding] = useState(false);

  const handleFindRoute = async () => {
    if (!state.source || !state.destination) { toast.error("Please select both source and destination cities."); return; }
    if (state.source.lat === state.destination.lat && state.source.lon === state.destination.lon) {
      toast.error("Source and destination cannot be the same city."); return;
    }
    setFinding(true);
    dispatch({ type: "SET_LOADING", payload: { route: true } });
    dispatch({ type: "SET_ERROR", payload: { route: null } });
    dispatch({ type: "SET_ROUTE", payload: null });
    dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });
    try {
      const response = await fetchRoute(state.source, state.destination);
      // IMPORTANT:
      // Route safety MUST come from backend.
      // Do NOT recompute on frontend.
      const route = {
        ...response,
        blocked: response.blocked,
        safe: response.safe,
      };
      addLog("route", `Route calculated: ${state.source.name} → ${state.destination.name} (${route.distance} km, ETA: ${route.eta})`, "info");
      dispatch({ type: "SET_ROUTE", payload: route });
      if (route.blocked) {
        addLog("route", "Route blocked by backend safety evaluation.", "warning");
        toast.warning("Primary route passes through disaster zone. Searching for alternate route...");
        try {
          const alternateRoute = await fetchAlternateRoute(state.source, state.destination);
          const altRoute = {
            ...alternateRoute,
            blocked: alternateRoute.blocked,
            safe: alternateRoute.safe,
          };
          dispatch({ type: "SET_ALTERNATE_ROUTE", payload: altRoute });
          if (altRoute.blocked) {
            addLog("route", `Alternate route also blocked: ${altRoute.distance} km, ETA: ${altRoute.eta}`, "warning");
            toast.warning("Alternate route also blocked.");
          } else {
            addLog("route", `Alternate route found: ${altRoute.distance} km, ETA: ${altRoute.eta}`, "success");
            toast.success("Alternate route found.");
          }
        } catch {
          addLog("route", "No alternate route available.", "error");
          toast.error("No alternate route could be calculated.");
        }
      } else {
        addLog("route", `Safe route confirmed: ${route.distance} km, ETA: ${route.eta}`, "success");
        toast.success(`Safe route found: ${route.distance} km, ETA: ${route.eta}`);
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

  const activeDisasters = state.disasters.filter((d) => d.status === "active");
  const routeLogs = state.logs.filter((l) => l.type === "route").slice(0, 8);

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
      <div className="w-[65%] min-w-0 p-3">
        <LeafletMap className="h-full w-full" />
      </div>

      <div className="w-[35%] shrink-0 overflow-y-auto border-l bg-card p-6 space-y-6">

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
            <RouteInfoCard label="Primary Route" route={state.route} />
            {state.alternateRoute && (
              <>
                <RouteInfoCard label="Alternate Route" route={state.alternateRoute} isAlternate />
                {state.alternateRoute.blocked && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Alternate route also blocked.
                  </div>
                )}
              </>
            )}
            {state.route.blocked && !state.alternateRoute && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No alternate route available. Manual coordination required.
              </div>
            )}
          </section>
        )}

        {/* Active Disaster Zones */}
        <section className="space-y-3">
          <h3 className="section-title">Active Disaster Zones</h3>
          {activeDisasters.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              No active disaster zones detected.
            </div>
          ) : (
            <div className="space-y-2">
              {activeDisasters.map((d) => (
                <div key={d.id} className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{d.type} — {d.location.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.severity} severity · {d.radius} km radius</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Route Activity Log */}
        <section className="space-y-3">
          <h3 className="section-title">Route Activity Log</h3>
          {routeLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No route activity yet.</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {routeLogs.map((log) => (
                <div key={log.id} className={`rounded-lg px-3 py-2.5 text-xs border-l-4 ${
                  log.status === "error" ? "border-red-500 bg-red-50" :
                  log.status === "warning" ? "border-amber-500 bg-amber-50" :
                  log.status === "success" ? "border-emerald-500 bg-emerald-50" :
                  "border-blue-500 bg-blue-50"
                }`}>
                  <p className="font-medium text-foreground">{log.message}</p>
                  <p className="mt-0.5 font-mono text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RouteInfoCard({ label, route, isAlternate }: {
  label: string; route: any; isAlternate?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${
      route.blocked ? "border-red-200 bg-red-50" :
      isAlternate ? "border-emerald-300 bg-emerald-50" : "border-emerald-200 bg-emerald-50"
    }`}>
      <div className="flex items-center gap-2 mb-3">
        {route.blocked
          ? <AlertTriangle className="h-4 w-4 text-red-600" />
          : <CheckCircle className="h-4 w-4 text-emerald-600" />}
        <span className="text-sm font-bold text-foreground">{label}</span>
        {isAlternate && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
            Recommended
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Distance", value: `${route.distance} km` },
          { label: "ETA", value: route.eta },
          { label: "Status", value: route.blocked ? "Blocked" : route.safe ? "Safe" : "Unknown",
            color: route.blocked ? "text-red-600" : route.safe ? "text-emerald-600" : "text-foreground" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className={`text-sm font-bold ${s.color ?? "text-foreground"}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
