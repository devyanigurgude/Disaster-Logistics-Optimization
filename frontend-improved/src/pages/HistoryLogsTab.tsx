import { useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { History, Route, AlertTriangle, Truck, Monitor, Trash2, Download } from "lucide-react";

const typeFilters   = ["all", "route", "disaster", "dispatch", "system"] as const;
const statusFilters = ["all", "info", "warning", "error", "success"] as const;

const iconMap: Record<string, React.ReactNode> = {
  route:    <Route className="h-4 w-4 text-blue-600" />,
  disaster: <AlertTriangle className="h-4 w-4 text-red-600" />,
  dispatch: <Truck className="h-4 w-4 text-amber-600" />,
  system:   <Monitor className="h-4 w-4 text-muted-foreground" />,
};

const statusBadge: Record<string, string> = {
  info:    "status-badge-blue",
  warning: "status-badge-warning",
  error:   "status-badge-danger",
  success: "status-badge-active",
};

const rowBg: Record<string, string> = {
  error:   "bg-red-50/40",
  warning: "bg-amber-50/40",
  success: "bg-emerald-50/30",
  info:    "",
};

export default function HistoryLogsTab() {
  const { state, dispatch } = useAppContext();
  const [typeFilter,   setTypeFilter]   = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search,       setSearch]       = useState("");

  let filtered = state.logs;
  if (typeFilter !== "all")   filtered = filtered.filter((l) => l.type   === typeFilter);
  if (statusFilter !== "all") filtered = filtered.filter((l) => l.status === statusFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((l) => l.message.toLowerCase().includes(q));
  }

  const handleExport = () => {
    const rows = [
      ["Timestamp", "Type", "Status", "Message"],
      ...state.logs.map((l) => [
        new Date(l.timestamp).toISOString(),
        l.type,
        l.status,
        l.message,
      ]),
    ];
    const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `disaster-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="tab-shell space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-primary" />
          <div>
            <h2 className="page-title">History & Logs</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {state.logs.length} entries recorded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.logs.length > 0 && (
            <>
              <button
                onClick={handleExport}
                className="btn-outline text-xs px-3 py-2"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button
                onClick={() => dispatch({ type: "CLEAR_LOGS" })}
                className="btn-danger text-xs px-3 py-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="stat-card space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search log messages…"
          className="input-base"
        />
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Type:
            </span>
            {typeFilters.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  typeFilter === t
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Status:
            </span>
            {statusFilters.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty states */}
      {state.logs.length === 0 ? (
        <div className="stat-card flex flex-col items-center justify-center py-20 text-center">
          <History className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">
            No activity recorded yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Operations, dispatches, and disaster events will appear here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="stat-card flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-semibold text-muted-foreground">
            No logs match your filters.
          </p>
          <button
            onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setSearch(""); }}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="stat-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-black/5 bg-white/50">
                  {["Timestamp", "Type", "Message", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${rowBg[log.status] ?? ""}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                      <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {iconMap[log.type]}
                        <span className="capitalize font-semibold text-foreground text-xs">
                          {log.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground max-w-md">
                      <p className="line-clamp-2 text-sm">{log.message}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            log.status === "error"
                              ? "bg-red-500"
                              : log.status === "warning"
                              ? "bg-yellow-500"
                              : log.status === "success"
                              ? "bg-green-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <span className={statusBadge[log.status] ?? "status-badge-neutral"}>{log.status}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-2.5 text-xs font-medium text-muted-foreground bg-muted/20">
            Showing {filtered.length} of {state.logs.length} entries
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

