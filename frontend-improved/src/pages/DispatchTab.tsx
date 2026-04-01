import { useEffect, useState } from "react";
import { Truck, CheckCircle, Clock, Loader2, AlertTriangle, Package } from "lucide-react";
import LeafletMap from "@/components/LeafletMap";
import { useAppContext, Warehouse, Dispatch, Disaster } from "@/contexts/AppContext";
import { selectBestWarehouse, getWarehouseDistance, createDispatch, updateDispatchStatus, updateWarehouse } from "@/lib/api";
import { toast } from "sonner";

export default function DispatchTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [resources, setResources] = useState({ food: 100, water: 200, medicine: 50, firstAid: 30 });
  const [dispatching, setDispatching] = useState(false);
  const [selectedDisasterId, setSelectedDisasterId] = useState<string | null>(null);

  const dispatchableDisasters = state.disasters.filter((d) => d.status !== "resolved");
  const selectedDisaster = dispatchableDisasters.find((d) => d.id === selectedDisasterId) ?? null;

  useEffect(() => {
    if (!dispatchableDisasters.length) {
      if (selectedDisasterId !== null) {
        setSelectedDisasterId(null);
      }
      return;
    }

    const stillValid = dispatchableDisasters.some((d) => d.id === selectedDisasterId);
    if (!stillValid) {
      setSelectedDisasterId(dispatchableDisasters[0].id);
    }
  }, [dispatchableDisasters, selectedDisasterId]);

  const { best, alternatives, reason } = selectedDisaster
    ? selectBestWarehouse(selectedDisaster.location, state.warehouses, resources)
    : { best: null, alternatives: [] as Warehouse[], reason: "" };

  const totalResources = resources.food + resources.water + resources.medicine + resources.firstAid;
  const hasRoute = !!(state.route || state.alternateRoute);
  const canDispatch = !dispatching && !!best && !!selectedDisaster && hasRoute && totalResources > 0;

  const handleDispatch = async () => {
    if (!selectedDisaster) {
      toast.error("Please select a disaster location");
      return;
    }
    if (!best) {
      toast.error("No warehouse available for the selected disaster.");
      return;
    }
    if (totalResources === 0) {
      toast.error("Allocate at least one resource unit.");
      return;
    }
    if (!hasRoute) {
      toast.error("Calculate a route in Route Operations first.");
      return;
    }
    // Read route BEFORE clearing
    const chosenRoute = state.alternateRoute || state.route;

    setDispatching(true);
    dispatch({ type: "SET_LOADING", payload: { dispatch: true } });

    // Clear routes after reading
    dispatch({ type: "SET_ROUTE", payload: null });
    dispatch({ type: "SET_ALTERNATE_ROUTE", payload: null });
    const newDispatch: Dispatch = {
      id: crypto.randomUUID(),
      warehouseId: best.id,
      warehouseName: best.name,
      route: chosenRoute,
      resources: { ...resources },
      status: "pending",
      eta: chosenRoute?.eta ?? "-",
      timestamp: new Date().toISOString(),
      destination: selectedDisaster.location,
      currentPosition: best.location,
    };

    await new Promise((r) => setTimeout(r, 700));
    dispatch({ type: "ADD_DISPATCH", payload: newDispatch });

    const updatedWarehouse: Warehouse = {
      ...best,
      currentStock: {
        food:     Math.max(0, best.currentStock.food     - resources.food),
        water:    Math.max(0, best.currentStock.water    - resources.water),
        medicine: Math.max(0, best.currentStock.medicine - resources.medicine),
        firstAid: Math.max(0, best.currentStock.firstAid - resources.firstAid),
      },
    };
    dispatch({ type: "UPDATE_WAREHOUSE", payload: updatedWarehouse });
    updateWarehouse(updatedWarehouse.id, {
      name:         updatedWarehouse.name,
      location:     updatedWarehouse.location,
      capacity:     updatedWarehouse.capacity,
      currentStock: updatedWarehouse.currentStock,
    }).catch(() => {});
    addLog("dispatch", `Dispatch: ${best.name} -> ${selectedDisaster.location.name} (${totalResources} units)`, "success");
    toast.success("Emergency supplies dispatched!");

    try {
      await createDispatch({
        warehouse_id: best.id,
        destination: selectedDisaster.location,
        resources,
        route_summary: `${best.name} -> ${selectedDisaster.location.name} (${chosenRoute?.eta ?? "?"})`,
      });
    } catch (err: any) {
      console.warn("Backend dispatch sync failed (non-fatal):", err.message);
      // Non-fatal — local state already updated
    }

    setTimeout(async () => {
      dispatch({ type: "UPDATE_DISPATCH", payload: { id: newDispatch.id, updates: { status: "in_transit" } } });
      addLog("dispatch", `In transit to ${selectedDisaster.location.name}`, "info");
      updateDispatchStatus(newDispatch.id, "in_transit").catch((e) =>
        console.warn("Status sync failed:", e.message)
      );
    }, 3000);

    setTimeout(async () => {
      dispatch({ type: "UPDATE_DISPATCH", payload: { id: newDispatch.id, updates: { status: "delivered", currentPosition: undefined } } });
      addLog("dispatch", `Delivered to ${selectedDisaster.location.name}`, "success");
      updateDispatchStatus(newDispatch.id, "delivered").catch((e) =>
        console.warn("Status sync failed:", e.message)
      );
    }, 12000);setDispatching(false);
    dispatch({ type: "SET_LOADING", payload: { dispatch: false } });
    setResources({ food: 100, water: 200, medicine: 50, firstAid: 30 });
  };

  const activeDispatches = state.dispatches.filter((d) => d.status !== "delivered");
  const deliveredDispatches = state.dispatches.filter((d) => d.status === "delivered");

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
      <div className="w-[65%] min-w-0 p-3">
        <LeafletMap className="h-full w-full" showDispatches />
      </div>

      <div className="w-[35%] shrink-0 space-y-4 overflow-y-auto border-l bg-card p-5">
        <div>
          <h2 className="text-base font-bold text-foreground">Dispatch</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
           {activeDispatches.length} active · {deliveredDispatches.length} delivered
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-blue-700">{state.dispatches.filter((d) => d.status === "pending").length}</p>
            <p className="mt-0.5 text-xs font-medium text-blue-600">Pending</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-amber-700">{state.dispatches.filter((d) => d.status === "in_transit").length}</p>
            <p className="mt-0.5 text-xs font-medium text-amber-600">In Transit</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-emerald-700">{deliveredDispatches.length}</p>
            <p className="mt-0.5 text-xs font-medium text-emerald-600">Delivered</p>
          </div>
        </div>

        <section>
          <h3 className="section-title mb-2">Dispatch to Disaster Location</h3>
          {dispatchableDisasters.length > 0 ? (
            <div className="space-y-2">
              <label htmlFor="dispatch-disaster" className="block text-xs font-medium text-muted-foreground">
                Select Disaster
              </label>
              <select
                id="dispatch-disaster"
                value={selectedDisasterId ?? ""}
                onChange={(e) => setSelectedDisasterId(e.target.value || null)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {dispatchableDisasters.map((disaster: Disaster) => (
                  <option key={disaster.id} value={disaster.id}>
                    {disaster.type} - {disaster.location.name}
                  </option>
                ))}
              </select>

              {selectedDisaster && (
                <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium text-foreground">{selectedDisaster.location.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedDisaster.location.lat.toFixed(4)}, {selectedDisaster.location.lon.toFixed(4)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-center text-sm text-muted-foreground">
              No active disaster location available for dispatch.
            </div>
          )}
        </section>

        {!hasRoute && selectedDisaster && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Calculate a route in Route Operations before dispatching.
          </div>
        )}

        {best && selectedDisaster && (
          <section>
            <h3 className="section-title mb-2">Selected Warehouse</h3>
            <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-xs">
              <p className="text-sm font-semibold text-foreground">{best.name}</p>
              <p className="text-muted-foreground">{reason}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                <div>
                  <span className="text-muted-foreground">Distance</span>
                  <p className="font-medium text-foreground">{getWarehouseDistance(selectedDisaster.location, best)} km</p>
                </div>
                <div>
                  <span className="text-muted-foreground">ETA</span>
                  <p className="font-medium text-foreground">{state.alternateRoute?.eta || state.route?.eta || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Route</span>
                  <p className={`font-medium ${state.alternateRoute ? "text-emerald-600" : state.route?.blocked ? "text-destructive" : "text-emerald-600"}`}>
                    {state.alternateRoute ? "Alternate (safe)" : state.route?.blocked ? "Blocked" : "Safe"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Alternatives</span>
                  <p className="font-medium text-foreground">{alternatives.length} available</p>
                </div>
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="section-title mb-2">Resource Allocation</h3>
          <div className="grid grid-cols-2 gap-3">
            {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium capitalize text-muted-foreground">
                  {key === "firstAid" ? "First Aid" : key}
                  {best && (
                    <span className="ml-1 text-muted-foreground/60">
                      / {best.currentStock[key].toLocaleString()}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  value={resources[key]}
                  onChange={(e) => setResources((r) => ({ ...r, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ))}
          </div>
          {totalResources > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Total: <span className="font-medium text-foreground">{totalResources.toLocaleString()} units</span>
            </p>
          )}
        </section>

        <button
          onClick={handleDispatch}
          disabled={!canDispatch}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          {dispatching ? "Dispatching..." : "Dispatch Emergency Supplies"}
        </button>

        <section>
          <h3 className="section-title mb-2">Active Dispatches</h3>
          {state.dispatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
              <Package className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No dispatches yet.</p>
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {[...state.dispatches].reverse().map((d) => (
                <DispatchCard key={d.id} dispatch={d} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DispatchCard({ dispatch: d }: { dispatch: Dispatch }) {
  const config = {
    delivered: { icon: CheckCircle, cls: "status-badge-active", label: "Delivered" },
    in_transit: { icon: Truck, cls: "status-badge-warning", label: "In Transit" },
    pending: { icon: Clock, cls: "status-badge-neutral", label: "Pending" },
  };
  const { icon: Icon, cls, label } = config[d.status];
  const total = d.resources.food + d.resources.water + d.resources.medicine + d.resources.firstAid;

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-medium text-foreground">{d.warehouseName}</span>
        <span className={`${cls} shrink-0`}>
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {d.destination.name} — ETA: {d.eta} — {total.toLocaleString()} units
      </p>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
        {new Date(d.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
    