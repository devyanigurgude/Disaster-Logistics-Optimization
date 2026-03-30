import { useState } from "react";
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
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
      {/* Map */}
      <div className="w-[65%] min-w-0 p-3">
        <LeafletMap className="h-full w-full" />
      </div>

      {/* Panel */}
      <div className="w-[35%] shrink-0 overflow-y-auto border-l bg-card p-5 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Warehouses</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.warehouses.length} configured · {totalStockAll.toLocaleString()} total units
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Add Warehouse
          </button>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-blue-50 border-blue-200 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-blue-700">{state.warehouses.length}</p>
            <p className="text-xs font-medium text-blue-600 mt-0.5">Total</p>
          </div>
          <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-emerald-700">
              {state.warehouses.filter(w => {
                const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
                return (total / (w.capacity * 4)) > 0.3;
              }).length}
            </p>
            <p className="text-xs font-medium text-emerald-600 mt-0.5">Well Stocked</p>
          </div>
          <div className="rounded-lg border bg-amber-50 border-amber-200 px-3 py-2.5 text-center">
            <p className="text-xl font-bold text-amber-700">
              {state.warehouses.filter(w => {
                const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
                return (total / (w.capacity * 4)) <= 0.3;
              }).length}
            </p>
            <p className="text-xs font-medium text-amber-600 mt-0.5">Low Stock</p>
          </div>
        </div>

        {/* Warehouse list */}
        {state.warehouses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <WarehouseIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No warehouses configured.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Warehouse
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {state.warehouses.map((w) => {
              const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
              const pct = Math.min(Math.round((total / (w.capacity * 4)) * 100), 100);
              const barColor = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-500" : "bg-red-500";
              const isExpanded = expandedId === w.id;

              return (
                <div key={w.id} className="rounded-lg border bg-background hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between gap-2 p-3.5">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => setExpandedId(isExpanded ? null : w.id)}
                    >
                      <div className="flex items-center gap-2">
                        <WarehouseIcon className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-sm font-semibold text-foreground truncate">{w.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                        {w.location.name} · {total.toLocaleString()} / {(w.capacity * 4).toLocaleString()} units
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {state.destination && (
                        <span className="text-[11px] text-muted-foreground mr-1">
                          {getWarehouseDistance(state.destination, w)} km
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : w.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleEdit(w)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(w)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stock bar */}
                  <div className="px-3.5 pb-2">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% stocked</p>
                  </div>

                  {/* Expanded stock detail */}
                  {isExpanded && (
                    <div className="border-t px-3.5 py-3 bg-muted/20">
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        {(["food", "water", "medicine", "firstAid"] as const).map((key) => (
                          <div key={key} className="text-center">
                            <p className="text-[10px] uppercase text-muted-foreground font-medium">
                              {key === "firstAid" ? "Aid" : key}
                            </p>
                            <p className="text-sm font-bold text-foreground">{w.currentStock[key].toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground border-t pt-2">
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
        <div className="rounded-lg border bg-muted/20 overflow-hidden">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
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
  );
}
