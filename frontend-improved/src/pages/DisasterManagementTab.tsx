import { useState } from "react";
import { Plus, Pencil, Trash2, AlertTriangle, MapPin, Filter, ChevronDown, ChevronUp } from "lucide-react";
import CitySearch from "@/components/CitySearch";
import LeafletMap from "@/components/LeafletMap";
import { useAppContext, Disaster, City } from "@/contexts/AppContext";
import { createDisaster, updateDisaster, deleteDisaster } from "@/lib/api";
import { toast } from "sonner";

const disasterTypes = [
  "Earthquake", "Flood", "Wildfire", "Hurricane",
  "Tsunami", "Landslide", "Volcanic Eruption", "Storm", "Drought", "Avalanche",
];
const severities = ["low", "medium", "high", "critical"] as const;
const statuses = ["active", "monitoring", "resolved"] as const;

const defaultForm = {
  type: "",
  severity: "medium" as Disaster["severity"],
  location: null as City | null,
  radius: 50,
  status: "active" as Disaster["status"],
  description: "",
};

export default function DisasterManagementTab() {
  const { state, dispatch, addLog } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Disaster | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setForm(defaultForm);
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.type) { toast.error("Please select a disaster type."); return; }
    if (!form.location) { toast.error("Please search and select a location."); return; }
    if (!form.description.trim()) { toast.error("Description is required."); return; }
    if (form.radius < 1) { toast.error("Radius must be at least 1 km."); return; }

    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateDisaster(editing.id, {
          type: form.type, severity: form.severity, location: form.location,
          radius: form.radius, status: form.status, description: form.description,
        });
        dispatch({ type: "UPDATE_DISASTER", payload: updated });
        addLog("disaster", `Disaster updated: ${form.type} at ${form.location.name}`, "info");
        toast.success("Disaster updated.");
      } else {
        const created = await createDisaster({
          type: form.type, severity: form.severity, location: form.location,
          radius: form.radius, status: form.status, description: form.description,
        });
        dispatch({ type: "ADD_DISASTER", payload: created });
        addLog("disaster", `New disaster: ${form.type} at ${form.location.name} (${form.severity})`,
          form.severity === "critical" || form.severity === "high" ? "error" : "warning");
        toast.success("Disaster reported.");
      }
      resetForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (d: Disaster) => {
    setForm({
      type: d.type, severity: d.severity, location: d.location,
      radius: d.radius, status: d.status, description: d.description,
    });
    setEditing(d);
    setShowForm(true);
  };

  const handleDelete = async (id: string, label: string) => {
    try {
      await deleteDisaster(id);
      dispatch({ type: "REMOVE_DISASTER", payload: id });
      addLog("disaster", `Disaster removed: ${label}`, "info");
      toast.success("Disaster removed.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed: ${msg}`);
    }
  };

  const handleQuickStatus = async (d: Disaster, newStatus: Disaster["status"]) => {
    try {
      const updated = await updateDisaster(d.id, {
        type: d.type,
        severity: d.severity,
        location: d.location,
        radius: d.radius,
        status: newStatus,
        description: d.description,
      });
      dispatch({ type: "UPDATE_DISASTER", payload: updated });
      addLog("disaster", `${d.type} at ${d.location.name} → ${newStatus}`, "info");
      toast.success(`Status updated to ${newStatus}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed: ${msg}`);
    }
  };

  const filtered = state.disasters.filter((d) => {
    if (filterSeverity !== "all" && d.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    active:     state.disasters.filter((d) => d.status === "active").length,
    monitoring: state.disasters.filter((d) => d.status === "monitoring").length,
    resolved:   state.disasters.filter((d) => d.status === "resolved").length,
  };

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
      {/* Left: Map */}
      <div className="w-[65%] min-w-0 p-3">
        <LeafletMap className="h-full w-full" />
      </div>

      {/* Right: Panel */}
      <div className="w-[35%] shrink-0 overflow-y-auto border-l bg-card p-5 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Disaster Management</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.active} active · {stats.monitoring} monitoring · {stats.resolved} resolved
            </p>
          </div>
          <button
            onClick={() => { if (showForm && !editing) { resetForm(); } else { setEditing(null); setForm(defaultForm); setShowForm(true); } }}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Report Disaster
          </button>
        </div>

        {/* Stat pills — clickable to filter */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Active",     count: stats.active,     key: "active",     cls: "border-red-200 bg-red-50 text-red-700",         ring: "ring-red-400" },
            { label: "Monitoring", count: stats.monitoring, key: "monitoring", cls: "border-amber-200 bg-amber-50 text-amber-700",   ring: "ring-amber-400" },
            { label: "Resolved",   count: stats.resolved,   key: "resolved",   cls: "border-emerald-200 bg-emerald-50 text-emerald-700", ring: "ring-emerald-400" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterStatus(filterStatus === s.key ? "all" : s.key)}
              className={`rounded-lg border px-3 py-2.5 text-center transition-all hover:opacity-80 ${s.cls} ${filterStatus === s.key ? `ring-2 ${s.ring}` : ""}`}
            >
              <p className="text-xl font-bold">{s.count}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Disaster List — ABOVE the form */}
        <div className="space-y-3">
          {/* Severity filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Severity:</span>
            {["all", ...severities].map((s) => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                  filterSeverity === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No disasters match the current filter.</p>
              <button
                onClick={() => { setFilterSeverity("all"); setFilterStatus("all"); }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => (
                <DisasterCard
                  key={d.id}
                  disaster={d}
                  onEdit={() => handleEdit(d)}
                  onDelete={() => handleDelete(d.id, `${d.type} at ${d.location.name}`)}
                  onStatusChange={(status) => handleQuickStatus(d, status)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Form — BELOW the list, collapsible */}
        <div className="rounded-lg border bg-muted/20 overflow-hidden">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              {editing ? "Edit Disaster" : "Report New Disaster"}
            </span>
            {showForm ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showForm && (
            <div className="px-4 pb-4 space-y-3 border-t">
              <div className="grid grid-cols-2 gap-3 pt-3">
                {/* Type */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select type...</option>
                    {disasterTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Severity */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Severity *</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Disaster["severity"] }))}
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {severities.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>

                {/* Location */}
                <div className="col-span-2">
                  <CitySearch
                    label="Location *"
                    value={form.location}
                    onSelect={(c) => setForm((f) => ({ ...f, location: c }))}
                    placeholder="Search disaster location..."
                  />
                </div>

                {/* Radius with slider */}
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Radius — <span className="text-primary font-bold">{form.radius} km</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={500}
                    value={form.radius}
                    onChange={(e) => setForm((f) => ({ ...f, radius: parseInt(e.target.value) }))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>1 km</span>
                    <span>500 km</span>
                  </div>
                </div>

                {/* Status */}
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Disaster["status"] }))}
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {statuses.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description *</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="Describe the situation, impact and affected areas..."
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editing ? "Update Disaster" : "Report Disaster"}
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

// ─── Disaster Card ────────────────────────────────────────────────────────────

function DisasterCard({ disaster: d, onEdit, onDelete, onStatusChange }: {
  disaster: Disaster;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: Disaster["status"]) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const leftBorder: Record<string, string> = {
    low:      "border-l-4 border-l-slate-400",
    medium:   "border-l-4 border-l-amber-500",
    high:     "border-l-4 border-l-red-500",
    critical: "border-l-4 border-l-red-700",
  };

  const statusBg: Record<string, string> = {
    active:     "bg-red-50/50",
    monitoring: "bg-amber-50/50",
    resolved:   "bg-emerald-50/30",
  };

  return (
    <div className={`rounded-lg border p-3.5 transition-all hover:shadow-sm ${leftBorder[d.severity]} ${statusBg[d.status]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {d.type} — {d.location.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{d.description}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <SeverityBadge severity={d.severity} />
            <StatusBadge status={d.status} />
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />{d.radius} km
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(d.timestamp).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowActions(!showActions)}
            className="rounded p-1.5 text-muted-foreground hover:bg-white/70 hover:text-foreground transition-colors text-sm leading-none"
            title="Quick status"
          >
            ···
          </button>
          <button
            onClick={onEdit}
            className="rounded p-1.5 text-muted-foreground hover:bg-white/70 hover:text-foreground transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 text-muted-foreground hover:bg-white/70 hover:text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Quick status change */}
      {showActions && (
        <div className="mt-2.5 pt-2.5 border-t border-black/5 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">Change status:</span>
          {statuses.filter((s) => s !== d.status).map((s) => (
            <button
              key={s}
              onClick={() => { onStatusChange(s); setShowActions(false); }}
              className="rounded-full border bg-white/80 px-2.5 py-0.5 text-xs font-medium capitalize text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              → {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    low:      "status-badge-neutral",
    medium:   "status-badge-warning",
    high:     "status-badge-danger",
    critical: "status-badge-danger",
  };
  return <span className={`${cls[severity] ?? "status-badge-neutral"} capitalize`}>{severity}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    active:     "status-badge-danger",
    monitoring: "status-badge-warning",
    resolved:   "status-badge-active",
  };
  return <span className={`${cls[status] ?? "status-badge-neutral"} capitalize`}>{status}</span>;
}
