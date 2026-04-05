import { useAppContext } from "@/contexts/AppContext";
import { Activity, AlertTriangle, MapPin, Package, Warehouse, RefreshCw } from "lucide-react";

export default function DashboardTab() {
  const { state, dispatch } = useAppContext();

  const activeDisasters   = state.disasters.filter((d) => d.status === "active").length;
  const monitoringCount   = state.disasters.filter((d) => d.status === "monitoring").length;
  const activeRoutes      = state.route ? 1 : 0;
  const ongoingDispatches = state.dispatches.filter((d) => d.status !== "delivered").length;
  const deliveredCount    = state.dispatches.filter((d) => d.status === "delivered").length;
  const totalStock        = state.warehouses.reduce(
    (s, w) => s + w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid, 0
  );

  const systemStatus =
    activeDisasters > 0
      ? { label: "Alert — Active Disasters", cls: "status-badge-danger" }
      : monitoringCount > 0
      ? { label: "Monitoring", cls: "status-badge-warning" }
      : { label: "All Systems Operational", cls: "status-badge-active" };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="tab-shell space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">System Overview</h2>
          <p className="mt-1 text-sm text-gray-500">
            Real-time disaster logistics monitoring
          </p>
        </div>
        <span className={systemStatus.cls}>
          <Activity className="h-3 w-3" />
          {systemStatus.label}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-50"
          label="Active Disasters"
          value={activeDisasters}
          sub={monitoringCount > 0 ? `${monitoringCount} monitoring` : "None monitoring"}
          valueColor={activeDisasters > 0 ? "text-red-600" : "text-foreground"}
        />
        <StatCard
          icon={<MapPin className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Active Routes"
          value={activeRoutes}
          sub={state.route?.blocked ? "Route blocked" : state.route ? "Route safe" : "No route calculated"}
        />
        <StatCard
          icon={<Package className="h-5 w-5 text-amber-600" />}
          iconBg="bg-yellow-50"
          label="Ongoing Dispatches"
          value={ongoingDispatches}
          sub={deliveredCount > 0 ? `${deliveredCount} delivered` : "None delivered yet"}
        />
        <StatCard
          icon={<Warehouse className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-green-50"
          label="Total Warehouses"
          value={state.warehouses.length}
          sub={`${totalStock.toLocaleString()} units total`}
        />
      </div>

      {/* Two column */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Active Disasters */}
        <div className="stat-card space-y-4">
          <h3 className="section-title">Active Disasters</h3>
          {state.disasters.filter((d) => d.status === "active").length === 0 ? (
            <p className="text-sm text-muted-foreground">No active disasters reported.</p>
          ) : (
            <div className="space-y-3">
              {state.disasters.filter((d) => d.status === "active").map((d) => (
                <div
                  key={d.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md border-l-4 border-l-red-500"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{d.type} — {d.location.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Radius: {d.radius} km</p>
                    </div>
                  </div>
                  <SeverityBadge severity={d.severity} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Warehouse Stock */}
        <div className="stat-card space-y-4">
          <h3 className="section-title">Warehouse Stock Levels</h3>
          {state.warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warehouses configured.</p>
          ) : (
            <div className="space-y-4">
              {state.warehouses.map((w) => {
                const total = w.currentStock.food + w.currentStock.water + w.currentStock.medicine + w.currentStock.firstAid;
                const pct   = w.capacity > 0 ? Math.min(Math.round((total / w.capacity) * 100), 100) : 0;
                const bar   = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={w.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-foreground">{w.name}</p>
                      <span className="text-xs text-muted-foreground">{total.toLocaleString()} units</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{w.location.name} · {pct}% stocked</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live Alerts */}
      <div className="stat-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Live Alerts Feed</h3>
          {state.logs.length > 0 && (
            <button
              onClick={() => dispatch({ type: "CLEAR_LOGS" })}
              className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
        {state.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {state.logs.slice(0, 15).map((log) => (
              <div key={log.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors">
                <LogDot status={log.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{log.message}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{new Date(log.timestamp).toLocaleString()}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${
                  log.status === "error" ? "text-red-600" :
                  log.status === "warning" ? "text-amber-600" :
                  log.status === "success" ? "text-emerald-600" : "text-blue-600"
                }`}>{log.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function StatCard({ icon, iconBg, label, value, sub, valueColor = "text-foreground" }: {
  icon: React.ReactNode; iconBg: string; label: string;
  value: number; sub?: string; valueColor?: string;
}) {
  return (
    <div className="stat-card flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
        <p className="mt-1 text-sm font-semibold text-gray-700">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    low: "status-badge-neutral", medium: "status-badge-warning",
    high: "status-badge-danger", critical: "status-badge-danger",
  };
  return <span className={`${cls[severity] ?? "status-badge-neutral"} shrink-0`}>{severity}</span>;
}

function LogDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    info: "bg-blue-500", warning: "bg-amber-500",
    error: "bg-red-500", success: "bg-emerald-500",
  };
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colors[status] ?? "bg-muted-foreground"}`} />;
}

