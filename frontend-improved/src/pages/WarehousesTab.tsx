﻿import { useState } from "react";
import { Plus, Pencil, Trash2, MapPin, ChevronDown, ChevronUp, Warehouse as WarehouseIcon } from "lucide-react";
import LeafletMap from "@/components/LeafletMap";
import CitySearch from "@/components/CitySearch";
import { useAppContext, Warehouse, City } from "@/contexts/AppContext";
import { createWarehouse, updateWarehouse, deleteWarehouse, getWarehouseDistance } from "@/lib/api";
import { toast } from "sonner";

const defaultForm = {
  name: "",
  location: null as City | null,
  capacity: 5000,
  currentStock: { food: 1000, water: 2000, medicine: 500, firstAid: 300 },
};

export default function WarehousesTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => {
    setForm(defaultForm);
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Warehouse name is required."); return; }
    if (!form.location) { toast.error("Please select a location."); return; }
    if (form.capacity <= 0) { toast.error("Capacity must be greater than 0."); return; }

    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateWarehouse(editing.id, {
          name: form.name.trim(),
          location: form.location,
          capacity: form.capacity,
          currentStock: form.currentStock,
        });
        dispatch({ type: "UPDATE_WAREHOUSE", payload: updated });
        addLog("system", `Warehouse "${form.name}" updated`, "info");
        toast.success("Warehouse updated.");
      } else {
        const created = await createWarehouse({
          name: form.name.trim(),
          location: form.location,
          capacity: form.capacity,
          currentStock: form.currentStock,
        });
        dispatch({ type: "ADD_WAREHOUSE", payload: created });
        addLog("system", `Warehouse "${form.name}" added at ${form.location.name}`, "success");
        toast.success("Warehouse added.");
      }
      resetForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (w: Warehouse) => {
    setForm({
      name: w.name,
      location: w.location,
      capacity: w.capacity,
      currentStock: { ...w.currentStock },
    });
    setEditing(w);
    setShowForm(true);
  };

  const handleDelete = async (w: Warehouse) => {
    try {
      await deleteWarehouse(w.id);
      dispatch({ type: "REMOVE_WAREHOUSE", payload: w.id });
      addLog("system", `Warehouse "${w.name}" removed`, "warning");
      toast.success(`Warehouse "${w.name}" removed.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed: ${msg}`);
    }
  };

  const totalStockAll = state.warehouses.reduce((sum, w) =>
    sum + w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid, 0
  );

  return (
    <div className="h-full min-h-0">
      <div className="tab-shell flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden">
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Map */}
          <div className="lg:col-span-7 min-w-0 min-h-0 h-[45vh] lg:h-full stat-card p-3">
            <LeafletMap className="h-full w-full" />
          </div>

          {/* Panel */}
          <div className="lg:col-span-5 min-w-0 min-h-0 space-y-6 overflow-visible lg:overflow-y-auto lg:h-full pr-1">

            {/* Header */}
            <div className="stat-card flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="page-title">Warehouses</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {state.warehouses.length} configured · {totalStockAll.toLocaleString()} total units
                </p>
              </div>
              <button
                onClick={() => { resetForm(); setShowForm(!showForm); }}
                className="btn-primary whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          

        {/* Summary stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="stat-card p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{state.warehouses.length}</p>
            <p className="mt-1 text-xs text-gray-400">Total</p>
          </div>
          <div className="stat-card p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {state.warehouses.filter(w => {
                const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
                const pct = w.capacity > 0 ? Math.min(Math.round((total / w.capacity) * 100), 100) : 0;
                return pct / 100 > 0.3;
              }).length}
            </p>
            <p className="mt-1 text-xs text-gray-400">Well Stocked</p>
          </div>
          <div className="stat-card p-4 text-center">
            <p className="text-2xl font-bold text-red-600">
              {state.warehouses.filter(w => {
                const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
                const pct = w.capacity > 0 ? Math.min(Math.round((total / w.capacity) * 100), 100) : 0;
                return pct / 100 <= 0.3;
              }).length}
            </p>
            <p className="mt-1 text-xs text-gray-400">Low Stock</p>
          </div>
        </div>

        {/* Warehouse list */}
        {state.warehouses.length === 0 ? (
          <div className="stat-card flex flex-col items-center justify-center py-12 text-center">
            <WarehouseIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No warehouses configured.</p>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary mt-4"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Warehouse
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {state.warehouses.map((w) => {
              const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
              const pct = w.capacity > 0 ? Math.min(Math.round((total / w.capacity) * 100), 100) : 0;
              const barColor = "bg-blue-500";
              const isExpanded = expandedId === w.id;
              const stockBadge =
                pct > 60
                  ? { label: "Well stocked", cls: "bg-green-50 text-green-600" }
                  : pct > 30
                  ? { label: "Medium", cls: "bg-yellow-50 text-yellow-600" }
                  : { label: "Low stock", cls: "bg-red-50 text-red-600" };

              return (
                <div key={w.id} className="stat-card">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => setExpandedId(isExpanded ? null : w.id)}
                    >
                      <div className="flex items-center gap-2">
                        <WarehouseIcon className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-sm font-semibold text-gray-800 truncate">{w.name}</span>
                        <span className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold ${stockBadge.cls}`}>
                          {stockBadge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500 ml-6 truncate">{w.location.name}</p>
                      <div className="mt-2 ml-6 flex items-center justify-between gap-3 text-sm text-gray-600">
                        <span>
                          Stock <span className="font-semibold text-gray-800">{total.toLocaleString()}</span>
                          {" "}/{" "}
                          <span className="font-semibold text-gray-800">{w.capacity.toLocaleString()}</span>
                        </span>
                        <span className="text-xs text-gray-400">{pct}%</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {state.destination && (
                        <span className="text-[11px] text-muted-foreground mr-1">
                          {getWarehouseDistance(state.destination, w)} km
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : w.id)}
                        className="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleEdit(w)}
                        className="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(w)}
                        className="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-red-50 hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stock bar */}
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{pct}% stocked</p>
                  </div>

                  {/* Expanded stock detail */}
                  {isExpanded && (
                    <div className="mt-4 rounded-2xl bg-white/70 px-4 py-4 ring-1 ring-black/5">
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
                          <div key={key} className="text-center">
                            <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">
                              {key === "firstAid" ? "Aid" : key}
                            </p>
                            <p className="text-sm font-bold text-gray-800">{w.currentStock[key].toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 border-t border-black/5 pt-3">
                        <MapPin className="h-3 w-3" />
                        {w.location.lat.toFixed(4)}, {w.location.lon.toFixed(4)} · Cap: {w.capacity.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add / Edit Form — collapsible at bottom */}
        <div className="stat-card overflow-hidden p-0">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              {editing ? "Edit Warehouse" : "Add New Warehouse"}
            </span>
            {showForm ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showForm && (
            <div className="px-4 pb-4 space-y-3 border-t pt-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Warehouse Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Central Relief Hub"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <CitySearch
                label="Location *"
                value={form.location}
                onSelect={(c) => setForm((f) => ({ ...f, location: c }))}
                placeholder="Search city..."
              />

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capacity (units) *</label>
                <input
                  type="number"
                  min={0}
                  value={form.capacity || ""}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Initial Stock</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
                    <div key={key}>
                      <span className="text-[11px] capitalize text-muted-foreground">
                        {key === "firstAid" ? "First Aid" : key}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={form.currentStock[key] || ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            currentStock: { ...f.currentStock, [key]: Math.max(0, parseInt(e.target.value) || 0) },
                          }))
                        }
                        className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editing ? "Update Warehouse" : "Add Warehouse"}
                </button>
                <button
                  onClick={resetForm}
                  className="rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
</div>
  );
}

