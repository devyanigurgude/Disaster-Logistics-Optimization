﻿import { useEffect, useMemo, useRef, useState } from "react";
import { Truck, CheckCircle, Clock, Loader2, AlertTriangle, Package } from "lucide-react";
import LeafletMap from "@/components/LeafletMap";
import { useAppContext, Warehouse, Dispatch, Disaster } from "@/contexts/AppContext";
import { selectBestWarehouse, getWarehouseDistance, createDispatch, updateDispatchStatus, loadWarehouses } from "@/lib/api";
import { toast } from "sonner";

export default function DispatchTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [resources, setResources] = useState({ food: 100, water: 200, medicine: 50, firstAid: 30 });
  const [dispatching, setDispatching] = useState(false);
  const [selectedDisasterId, setSelectedDisasterId] = useState<string | null>(null);
  const isDispatchingRef = useRef(false);

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

  const hasEnoughStock = useMemo(() => {
    if (!best) return false;
    return (
      best.currentStock.food >= resources.food &&
      best.currentStock.water >= resources.water &&
      best.currentStock.medicine >= resources.medicine &&
      best.currentStock.firstAid >= resources.firstAid
    );
  }, [best, resources]);

  const canDispatch = !dispatching && !!best && !!selectedDisaster && hasRoute && totalResources > 0 && hasEnoughStock;

  const dispatchesSorted = useMemo(() => {
    const unique = new Map<string, Dispatch>();
    for (const d of state.dispatches) unique.set(d.id, d);
    return Array.from(unique.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [state.dispatches]);

  const activeDispatches = useMemo(
    () => dispatchesSorted.filter((d) => d.status !== "delivered"),
    [dispatchesSorted]
  );
  const deliveredDispatches = useMemo(
    () => dispatchesSorted.filter((d) => d.status === "delivered"),
    [dispatchesSorted]
  );

  const pendingCount = useMemo(
    () => dispatchesSorted.filter((d) => d.status === "pending").length,
    [dispatchesSorted]
  );
  const inTransitCount = useMemo(
    () => dispatchesSorted.filter((d) => d.status === "in_transit").length,
    [dispatchesSorted]
  );

  const handleDispatch = async () => {
    if (isDispatchingRef.current) return;
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
    if (!hasEnoughStock) {
      toast.error("Not enough stock available in the selected warehouse.");
      return;
    }

    const chosenRoute = state.alternateRoute || state.route;
    console.log("[dispatch] using existing route from AppContext", {
      hasRoute: !!state.route,
      hasAlternate: !!state.alternateRoute,
      chosenEta: chosenRoute?.eta,
    });

    // Refresh warehouses right before dispatch so UI stock can't drift from backend stock.
    // This prevents 400s caused by stale warehouse data.
    let warehouseForDispatch = best;
    try {
      const latest = await loadWarehouses();
      dispatch({ type: "SET_WAREHOUSES", payload: latest });

      const { best: latestBest } = selectBestWarehouse(selectedDisaster.location, latest, resources);
      if (!latestBest) {
        toast.error("No warehouse available for the selected disaster.");
        return;
      }
      warehouseForDispatch = latestBest;

      const enoughNow =
        latestBest.currentStock.food >= resources.food &&
        latestBest.currentStock.water >= resources.water &&
        latestBest.currentStock.medicine >= resources.medicine &&
        latestBest.currentStock.firstAid >= resources.firstAid;
      if (!enoughNow) {
        toast.error("Not enough stock available in warehouse");
        return;
      }
    } catch (e: unknown) {
      // If refresh fails, continue with best-known local data; backend will still enforce correctness.
      console.warn("Pre-dispatch warehouse refresh failed:", e);
    }

    const destinationName = selectedDisaster.location.name;
    const routeSummary = `${warehouseForDispatch.name} -> ${destinationName} (${chosenRoute?.eta ?? "?"})`;

    isDispatchingRef.current = true;
    setDispatching(true);
    dispatch({ type: "SET_LOADING", payload: { dispatch: true } });

    try {
      const created = await createDispatch({
        warehouse_id: warehouseForDispatch.id,
        destination: selectedDisaster.location,
        resources,
        route_summary: routeSummary,
      });

      const dispatchForUI: Dispatch = {
        ...created,
        warehouseId: warehouseForDispatch.id,
        warehouseName: warehouseForDispatch.name,
        route: chosenRoute ?? null,
        eta: chosenRoute?.eta ?? created.eta ?? "-",
        destination: selectedDisaster.location,
        currentPosition: warehouseForDispatch.location,
      };

      dispatch({ type: "ADD_DISPATCH", payload: dispatchForUI });
      console.log("[dispatch] created dispatch", { id: created.id, destination: destinationName });

      try {
        const refreshed = await loadWarehouses();
        dispatch({ type: "SET_WAREHOUSES", payload: refreshed });
      } catch (e: unknown) {
        console.warn("Warehouse refresh failed:", e);
      }

      addLog("dispatch", `Dispatch: ${best.name} -> ${destinationName} (${totalResources} units)`, "success");
      toast.success("Emergency supplies dispatched!");

      setTimeout(() => {
        dispatch({ type: "UPDATE_DISPATCH", payload: { id: created.id, updates: { status: "in_transit" } } });
        addLog("dispatch", `In transit to ${destinationName}`, "info");
        updateDispatchStatus(created.id, "in_transit").catch((e) =>
          console.warn("Status sync failed:", e.message)
        );
      }, 3000);

      setTimeout(() => {
        dispatch({ type: "UPDATE_DISPATCH", payload: { id: created.id, updates: { status: "delivered", currentPosition: undefined } } });
        addLog("dispatch", `Delivered to ${destinationName}`, "success");
        updateDispatchStatus(created.id, "delivered").catch((e) =>
          console.warn("Status sync failed:", e.message)
        );
      }, 12000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addLog("dispatch", `Dispatch failed: ${msg}`, "error");
      toast.error(msg);
    } finally {
      isDispatchingRef.current = false;
      setDispatching(false);
      dispatch({ type: "SET_LOADING", payload: { dispatch: false } });
      setResources({ food: 100, water: 200, medicine: 50, firstAid: 30 });
    }
  };
  return (
    <div className="h-full min-h-0">
      <div className="tab-shell flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden">
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 min-w-0 min-h-0 h-[45vh] lg:h-full stat-card p-3">
            <LeafletMap className="h-full w-full" showDispatches />
          </div>

          <div className="lg:col-span-5 min-w-0 min-h-0 space-y-6 overflow-visible lg:overflow-y-auto lg:h-full pr-1">
            <div className="stat-card">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="page-title">Dispatch</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {activeDispatches.length} active · {deliveredDispatches.length} delivered
                  </p>
                </div>
                <span className="status-badge-blue">Live</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
                <p className="mt-1 text-xs text-gray-400">Pending</p>
              </div>
              <div className="stat-card p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{inTransitCount}</p>
                <p className="mt-1 text-xs text-gray-400">In Transit</p>
              </div>
              <div className="stat-card p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{deliveredDispatches.length}</p>
                <p className="mt-1 text-xs text-gray-400">Delivered</p>
              </div>
            </div>

            <section className="stat-card space-y-4">
              <div>
                <h3 className="section-title">Dispatch to Disaster Location</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Choose an active disaster and allocate resources from the best warehouse.
                </p>
              </div>

              {dispatchableDisasters.length > 0 ? (
                <div className="space-y-3">
                  <label htmlFor="dispatch-disaster" className="block text-xs text-gray-400">
                    Select disaster
                  </label>
                  <select
                    id="dispatch-disaster"
                    value={selectedDisasterId ?? ""}
                    onChange={(e) => setSelectedDisasterId(e.target.value || null)}
                    className="input-base"
                  >
                    {dispatchableDisasters.map((disaster: Disaster) => (
                      <option key={disaster.id} value={disaster.id}>
                        {disaster.type} - {disaster.location.name}
                      </option>
                    ))}
                  </select>

                  {selectedDisaster && (
                    <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-black/5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-black" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{selectedDisaster.location.name}</p>
                        <p className="text-xs text-gray-400">
                          {selectedDisaster.location.lat.toFixed(4)}, {selectedDisaster.location.lon.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-4 py-6 text-center text-sm text-gray-500">
                  No active disaster location available for dispatch.
                </div>
              )}
            </section>

            {!hasRoute && selectedDisaster && (
              <div className="flex items-start gap-2 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Calculate a route in Route Operations before dispatching.
              </div>
            )}

            {best && selectedDisaster && (
              <section className="stat-card space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="section-title">Selected Warehouse</h3>
                    <p className="mt-1 text-sm text-gray-500">{reason}</p>
                  </div>
                  <span
                    className={
                      state.alternateRoute
                        ? "status-badge-active"
                        : state.route?.blocked
                        ? "status-badge-danger"
                        : "status-badge-active"
                    }
                  >
                    {state.alternateRoute ? "Safe (Alt)" : state.route?.blocked ? "Blocked" : "Safe"}
                  </span>
                </div>

                <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-black/5">
                  <p className="text-lg font-semibold text-gray-800">{best.name}</p>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Distance</p>
                      <p className="mt-0.5 font-medium text-gray-700">
                        {getWarehouseDistance(selectedDisaster.location, best)} km
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">ETA</p>
                      <p className="mt-0.5 font-medium text-gray-700">{state.alternateRoute?.eta || state.route?.eta || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Alternatives</p>
                      <p className="mt-0.5 font-medium text-gray-700">{alternatives.length} available</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Units (planned)</p>
                      <p className="mt-0.5 font-medium text-gray-700">{totalResources.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="stat-card space-y-4">
              <div>
                <h3 className="section-title">Resource Allocation</h3>
                <p className="mt-1 text-sm text-gray-500">Adjust quantities for this dispatch.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs text-gray-400">
                      {key === "firstAid" ? "First Aid" : key}
                      {best && (
                        <span className="ml-1 text-gray-400">
                          / {best.currentStock[key].toLocaleString()}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={resources[key]}
                      onChange={(e) => setResources((r) => ({ ...r, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                      className="input-base"
                    />
                  </div>
                ))}
              </div>

              {totalResources > 0 && (
                <p className="text-sm text-gray-600">
                  Total: <span className="font-semibold text-gray-800">{totalResources.toLocaleString()} units</span>
                </p>
              )}
            </section>

            <div className="stat-card">
              <button
                onClick={handleDispatch}
                disabled={!canDispatch}
                className="btn-primary w-full py-3"
              >
                {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {dispatching ? "Dispatching..." : "Dispatch Emergency Supplies"}
              </button>
              {!canDispatch && (
                <p className="mt-3 text-sm text-gray-500">
                  Select a disaster, calculate a route, and ensure sufficient stock to enable dispatch.
                </p>
              )}
            </div>

            <section className="stat-card space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="section-title">Dispatches</h3>
                  <p className="mt-1 text-sm text-gray-500">Track active operations and completed deliveries.</p>
                </div>
                <span className="text-xs text-gray-400">{dispatchesSorted.length} total</span>
              </div>

              {dispatchesSorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white/60 py-10 text-center">
                  <Package className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-gray-500">No dispatches yet.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-700">Active Dispatches</h4>
                      <span className="text-xs text-gray-400">{activeDispatches.length}</span>
                    </div>
                    {activeDispatches.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-4 py-4 text-sm text-gray-500">
                        No active dispatches.
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {activeDispatches.map((d) => (
                          <DispatchCard
                            key={d.id}
                            dispatch={d}
                            warehouseName={
                              state.warehouses.find((w) => w.id === d.warehouseId)?.name ??
                              d.warehouseName ??
                              d.warehouseId
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-700">Delivered Dispatches</h4>
                      <span className="text-xs text-gray-400">{deliveredDispatches.length}</span>
                    </div>
                    {deliveredDispatches.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-4 py-4 text-sm text-gray-500">
                        No delivered dispatches yet.
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {deliveredDispatches.map((d) => (
                          <DispatchCard
                            key={d.id}
                            dispatch={d}
                            warehouseName={
                              state.warehouses.find((w) => w.id === d.warehouseId)?.name ??
                              d.warehouseName ??
                              d.warehouseId
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function DispatchCard({ dispatch: d, warehouseName }: { dispatch: Dispatch; warehouseName: string }) {
  const config = {
    pending: { icon: Clock, cls: "bg-yellow-50 text-yellow-600", label: "Pending" },
    in_transit: { icon: Truck, cls: "bg-blue-50 text-blue-600", label: "In Transit" },
    delivered: { icon: CheckCircle, cls: "bg-green-50 text-green-600", label: "Delivered" },
  } as const;
  const statusKey = d.status as keyof typeof config;
  const { icon: Icon, cls, label } = config[statusKey] ?? {
    icon: Clock,
    cls: "bg-gray-100 text-gray-600",
    label: "Unknown",
  };
  const total = d.resources.food + d.resources.water + d.resources.medicine + d.resources.firstAid;
  const etaText = d.eta && d.eta !== "-" ? d.eta : d.route?.eta ?? "ETA unavailable";

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-gray-800">{warehouseName}</p>
          <p className="mt-1 truncate text-sm text-gray-500">
            <span className="mr-1 text-gray-400">→</span>
            {d.destination.name}
          </p>
        </div>

        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
        <div>
          <p className="text-xs text-gray-400">ETA</p>
          <p className="mt-0.5 font-medium text-gray-700">{etaText}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Units</p>
          <p className="mt-0.5 font-medium text-gray-700">{total.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Time</p>
          <p className="mt-0.5 font-medium text-gray-700">{new Date(d.timestamp).toLocaleTimeString()}</p>
        </div>
      </div>
    </div>
  );
}
    
