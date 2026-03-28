import { Bell, Shield, User, Wifi } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";

const tabs = [
  "Dashboard",
  "Route Operations",
  "Warehouses",
  "Dispatch",
  "Disaster Management",
  "History & Logs",
] as const;

export type TabName = (typeof tabs)[number];

interface AppHeaderProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

export default function AppHeader({ activeTab, onTabChange }: AppHeaderProps) {
  const { state } = useAppContext();

  const activeAlerts = state.disasters.filter((d) => d.status === "active").length;
  const inTransit   = state.dispatches.filter((d) => d.status === "in_transit").length;
  const alertCount  = activeAlerts + inTransit;

  const systemStatus =
    activeAlerts > 0
      ? { label: `${activeAlerts} Active Alert${activeAlerts > 1 ? "s" : ""}`, cls: "status-badge-danger" }
      : inTransit > 0
      ? { label: `${inTransit} In Transit`, cls: "status-badge-warning" }
      : { label: "Monitoring Active", cls: "status-badge-active" };

  return (
    <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground leading-none">
              Smart Disaster Logistics
            </h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-1">
              Route Safety Optimization System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={systemStatus.cls}>
            <Wifi className="h-3 w-3" />
            {systemStatus.label}
          </span>

          <div className="relative">
            <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Bell className="h-5 w-5" />
            </button>
            {alertCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Admin</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <nav className="flex gap-0 px-6 overflow-x-auto" aria-label="Main navigation">
        {tabs.map((tab) => {
          const badge =
            tab === "Disaster Management" ? activeAlerts
            : tab === "Dispatch" ? inTransit
            : 0;

          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {tab}
                {badge > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </span>
              {activeTab === tab && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}