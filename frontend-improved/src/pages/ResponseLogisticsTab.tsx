import { useState } from "react";
import {
  Loader2, Package, Truck, CheckCircle, Clock, Plus, Pencil,
  Trash2, MapPin, ChevronDown, ChevronUp, Warehouse as WarehouseIcon, AlertTriangle,
} from "lucide-react";
import LeafletMap from "@/components/LeafletMap";
import CitySearch from "@/components/CitySearch";
import { useAppContext, Warehouse, Dispatch, City } from "@/contexts/AppContext";
import {
  selectBestWarehouse,
  getWarehouseDistance,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "@/lib/api";
import { toast } from "sonner";
import { createDispatch } from "@/lib/api";

export default function ResponseLogisticsTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [resources, setResources] = useState({ food: 100, water: 200, medicine: 50, firstAid: 30 });
  const [dispatching, setDispatching] = useState(false);
  const [showWarehouseMgmt, setShowWarehouseMgmt] = useState(true);

  const { best, alternatives, reason } = state.destination
    ? selectBestWarehouse(state.destination, state.warehouses, resources)
    : { best: null, alternatives: [] as Warehouse[], reason: "" };

  const canDispatch = !dispatching && !!best && !!state.destination && !!(state.route || state.alternateRoute);
  const totalResources = resources.food + resources.water + resources.medicine + resources.firstAid;

  const handleDispatch = async () => {
    if (!best || !state.destination) {
      toast.error("No warehouse or destination selected.");
      return;
    }
    if (totalResources === 0) {
      toast.error("Please allocate at least one resource unit.");
      return;
    }
    if (!state.route && !state.alternateRoute) {
      toast.error("Calculate a route in Route Operations before dispatching.");
      return;
    }

    setDispatching(true);
    dispatch({ type: "SET_LOADING", payload: { dispatch: true } });

    const chosenRoute = state.alternateRoute || state.route;

    const newDispatch: Dispatch = {
      id: crypto.randomUUID(),
      warehouseId: best.id,
      warehouseName: best.name,
      route: chosenRoute,
      resources: { ...resources },
      status: "pending",
      eta: chosenRoute?.eta ?? "—",
      timestamp: new Date().toISOString(),
      destination: state.destination,
      currentPosition: best.location,
    };

    // Simulate dispatch initiation delay
    await new Promise((r) => setTimeout(r, 700));

    dispatch({ type: "ADD_DISPATCH", payload: newDispatch });
    addLog("dispatch", `Dispatch initiated: ${best.name} → ${state.destination.name} (${totalResources} units)`, "success");
    toast.success("Emergency supplies dispatched!");
    try {
    await createDispatch({
    warehouse_id: best.id,
    destination:  state.destination,
    resources:    resources,
    route_summary: `${best.name} → ${state.destination.name} (${chosenRoute?.eta ?? "?"})`,
    });
    } catch {
    // Non-fatal — local state already updated
      addLog("dispatch", "Failed to notify backend about dispatch. Local state updated, but backend may be out of sync.", "warning"); 
  }
    // Update warehouse stock
    const updatedWarehouse: Warehouse = {
      ...best,
      currentStock: {
        food: Math.max(0, best.currentStock.food - resources.food),
        water: Math.max(0, best.currentStock.water - resources.water),
        medicine: Math.max(0, best.currentStock.medicine - resources.medicine),
        firstAid: Math.max(0, best.currentStock.firstAid - resources.firstAid),
      },
    };
    dispatch({ type: "UPDATE_WAREHOUSE", payload: updatedWarehouse });

    // Simulate status transitions
    setTimeout(() => {
      dispatch({ type: "UPDATE_DISPATCH", payload: { id: newDispatch.id, updates: { status: "in_transit" } } });
      addLog("dispatch", `Dispatch ${newDispatch.id.slice(0, 8)} is now in transit to ${state.destination!.name}`, "info");
    }, 3000);

    setTimeout(() => {
      dispatch({ type: "UPDATE_DISPATCH", payload: { id: newDispatch.id, updates: { status: "delivered", currentPosition: undefined } } });
      addLog("dispatch", `Dispatch ${newDispatch.id.slice(0, 8)} delivered successfully to ${state.destination!.name}`, "success");
    }, 12000);

    setDispatching(false);
    dispatch({ type: "SET_LOADING", payload: { dispatch: false } });
    setResources({ food: 100, water: 200, medicine: 50, firstAid: 30 });
  };

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
  {/* Left: Map */}
  <div className="w-[65%] min-w-0 p-3">
  <LeafletMap className="h-full w-full" showDispatches />
</div>
<div className="w-[35%] shrink-0 overflow-y-auto border-l bg-card p-5 space-y-4">

        {/* Destination (shared from Route tab) */}
        <section>
          <h3 className="section-title mb-3">Affected Area / Destination</h3>
          {state.destination ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
              <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">{state.destination.name}</p>
                <p className="text-xs text-muted-foreground">{state.destination.lat.toFixed(4)}, {state.destination.lon.toFixed(4)}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-center text-sm text-muted-foreground">
              No destination set. Go to Route Operations to select one.
            </div>
          )}
        </section>

        {/* Warehouse Management */}
        <section>
          <button
            onClick={() => setShowWarehouseMgmt((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <WarehouseIcon className="h-4 w-4 text-primary" />
              Warehouse Management
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {state.warehouses.length}
              </span>
            </span>
            {showWarehouseMgmt ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showWarehouseMgmt && (
            <div className="mt-3 space-y-3">
              <WarehouseForm />
              <WarehouseList destination={state.destination} />
            </div>
          )}
        </section>

        {/* Resource Allocation */}
        <section>
          <h3 className="section-title mb-3">Resource Allocation</h3>
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
                  max={best?.currentStock[key] ?? undefined}
                  value={resources[key]}
                  onChange={(e) =>
                    setResources((r) => ({
                      ...r,
                      [key]: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
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

        {/* Dispatch System */}
        <section>
          <h3 className="section-title mb-3">Dispatch System</h3>

          {!state.route && !state.alternateRoute && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Calculate a route in Route Operations first to enable dispatch.
            </div>
          )}

          {best && state.destination && (
            <div className="mb-3 rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-foreground">{reason}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                <div>
                  <span className="text-muted-foreground">Warehouse</span>
                  <p className="font-medium text-foreground">{best.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Destination</span>
                  <p className="font-medium text-foreground">{state.destination.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Distance</span>
                  <p className="font-medium text-foreground">{getWarehouseDistance(state.destination, best)} km</p>
                </div>
                <div>
                  <span className="text-muted-foreground">ETA</span>
                  <p className="font-medium text-foreground">
                    {state.alternateRoute?.eta || state.route?.eta || "—"}
                  </p>
                </div>
                {state.alternateRoute && (
                  <div className="col-span-2">
                    <span className="text-emerald-600 font-medium">Using alternate route</span>
                  </div>
                )}
              </div>
              {alternatives.length > 0 && (
                <p className="text-muted-foreground pt-1">
                  {alternatives.length} alternative warehouse{alternatives.length > 1 ? "s" : ""} available
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleDispatch}
            disabled={!canDispatch}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            {dispatching ? "Dispatching..." : "Dispatch Emergency Supplies"}
          </button>
          {!state.destination && (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">Set a destination to enable dispatch</p>
          )}
          {state.warehouses.length === 0 && (
            <p className="mt-1.5 text-center text-xs text-destructive">Add a warehouse to enable dispatch</p>
          )}
        </section>

        {/* Active Dispatches */}
        <section>
          <h3 className="section-title mb-3">Active Dispatches</h3>
          {state.dispatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispatches initiated yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
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

// ─── Warehouse Add / Edit Form ───────────────────────────────────────────────
function WarehouseForm({ existing, onDone }: { existing?: Warehouse; onDone?: () => void }) {
  const { dispatch, addLog } = useAppContext();
  const [name, setName] = useState(existing?.name ?? "");
  const [location, setLocation] = useState<City | null>(existing?.location ?? null);
  const [capacity, setCapacity] = useState<number>(existing?.capacity ?? 5000);
  const [stock, setStock] = useState(
    existing?.currentStock ?? { food: 1000, water: 2000, medicine: 500, firstAid: 300 }
  );
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!existing;

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Warehouse name is required."); return; }
    if (!location) { toast.error("Please search and select a location."); return; }
    if (capacity <= 0) { toast.error("Capacity must be greater than 0."); return; }

    setSubmitting(true);
    try {
      if (isEdit && existing) {
        const warehouse = await updateWarehouse(existing.id, {
          name: name.trim(),
          location,
          capacity,
          currentStock: { ...stock },
        });
        dispatch({ type: "UPDATE_WAREHOUSE", payload: warehouse });
        addLog("system", `Warehouse "${warehouse.name}" updated`, "info");
        toast.success("Warehouse updated.");
      } else {
        const warehouse = await createWarehouse({
          name: name.trim(),
          location,
          capacity,
          currentStock: { ...stock },
        });
        dispatch({ type: "ADD_WAREHOUSE", payload: warehouse });
        addLog("system", `Warehouse "${warehouse.name}" added at ${location.name}`, "success");
        toast.success("Warehouse added.");
      }

      if (!isEdit) {
        setName("");
        setLocation(null);
        setCapacity(5000);
        setStock({ food: 1000, water: 2000, medicine: 500, firstAid: 300 });
      }
      onDone?.();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {isEdit ? "Edit Warehouse" : "Add New Warehouse"}
      </h4>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Warehouse Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Central Relief Hub"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <CitySearch
        label="Location *"
        value={location}
        onSelect={setLocation}
        placeholder="Search city…"
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Capacity (units) *</label>
        <input
          type="number"
          min={0}
          value={capacity || ""}
          onChange={(e) => setCapacity(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Initial Stock</label>
        <div className="grid grid-cols-2 gap-2">
          {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
            <div key={key}>
              <span className="text-[11px] capitalize text-muted-foreground">
                {key === "firstAid" ? "First Aid" : key}
              </span>
              <input
                type="number"
                min={0}
                value={stock[key] || ""}
                onChange={(e) =>
                  setStock((s) => ({ ...s, [key]: Math.max(0, parseInt(e.target.value) || 0) }))
                }
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {submitting ? "Saving..." : isEdit ? "Update Warehouse" : "Add Warehouse"}
        </button>
        {isEdit && onDone && (
          <button
            onClick={onDone}
            className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Warehouse List ──────────────────────────────────────────────────────────
function WarehouseList({ destination }: { destination: City | null }) {
  const { state, dispatch, addLog } = useAppContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (state.warehouses.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">No warehouses configured.</p>
        <p className="mt-1 text-xs text-muted-foreground">Use the form above to add one.</p>
      </div>
    );
  }

  const handleDelete = async (w: Warehouse) => {
    setDeletingId(w.id);
    try {
      await deleteWarehouse(w.id);
      dispatch({ type: "REMOVE_WAREHOUSE", payload: w.id });
      addLog("system", `Warehouse "${w.name}" removed`, "warning");
      toast.success(`Warehouse "${w.name}" removed.`);
      if (editingId === w.id) setEditingId(null);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setDeletingId((current) => (current === w.id ? null : current));
    }
  };

  const { best } = destination
    ? selectBestWarehouse(destination, state.warehouses, { food: 0, water: 0, medicine: 0, firstAid: 0 })
    : { best: null };

  return (
    <div className="space-y-2">
      {state.warehouses.map((w) => {
        const isNearest = best?.id === w.id;
        const totalStock = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
        const dist = destination ? getWarehouseDistance(destination, w) : null;
        const stockPct = Math.min(Math.round((totalStock / (w.capacity * 4)) * 100), 100);

        if (editingId === w.id) {
          return (
            <WarehouseForm key={w.id} existing={w} onDone={() => setEditingId(null)} />
          );
        }

        return (
          <div
            key={w.id}
            className={`rounded-md border text-sm transition-colors ${
              isNearest ? "border-primary/40 bg-primary/5" : "hover:bg-muted/20"
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <button
                className="flex-1 text-left min-w-0"
                onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{w.name}</span>
                  {isNearest && <span className="status-badge-active text-[10px] shrink-0">Nearest</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {w.location.name}{dist !== null && ` · ${dist} km`} · {totalStock.toLocaleString()} units
                </p>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingId(w.id)}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(w)}
                  disabled={deletingId === w.id}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Stock bar */}
            <div className="px-3 pb-2">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    stockPct > 60 ? "bg-emerald-500" : stockPct > 30 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${stockPct}%` }}
                />
              </div>
            </div>

            {expandedId === w.id && (
              <div className="border-t px-3 py-2.5 grid grid-cols-4 gap-2 bg-muted/20">
                {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
                  <div key={key} className="text-center">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {key === "firstAid" ? "Aid" : key}
                    </p>
                    <p className="text-sm font-semibold text-foreground">{w.currentStock[key].toLocaleString()}</p>
                  </div>
                ))}
                <div className="col-span-4 pt-1 border-t mt-1 text-xs text-muted-foreground flex justify-between">
                  <span>Cap: {w.capacity.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{w.location.lat.toFixed(3)}, {w.location.lon.toFixed(3)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Dispatch Card ────────────────────────────────────────────────────────────
function DispatchCard({ dispatch: d }: { dispatch: Dispatch }) {
  const statusConfig = {
    delivered: { icon: CheckCircle, cls: "status-badge-active", label: "Delivered" },
    in_transit: { icon: Truck, cls: "status-badge-warning", label: "In Transit" },
    pending: { icon: Clock, cls: "status-badge-neutral", label: "Pending" },
  };
  const { icon: Icon, cls, label } = statusConfig[d.status];
  const total = d.resources.food + d.resources.water + d.resources.medicine + d.resources.firstAid;

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-foreground truncate">{d.warehouseName}</span>
        <span className={`${cls} shrink-0`}>
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        → {d.destination.name} · ETA: {d.eta} · {total.toLocaleString()} units
      </p>
      <p className="text-xs text-muted-foreground font-mono mt-0.5">
        {new Date(d.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
