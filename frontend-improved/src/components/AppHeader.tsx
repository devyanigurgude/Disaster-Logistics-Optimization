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
      ? { label: `${inTransit} In Transit`, cls: "status-badge-blue" }
      : { label: "Monitoring Active", cls: "status-badge-active" };

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/70 backdrop-blur-md">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5">
            <Shield className="h-5 w-5 text-gray-800" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-gray-800 leading-none">
              Smart Disaster Logistics
            </h1>
            <p className="text-[11px] text-gray-500 leading-none mt-1">
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
            <button className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800">
              <Bell className="h-5 w-5" />
            </button>
            {alertCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-full bg-black/5 px-3 py-2">
            <User className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-800">Admin</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <nav className="flex gap-2 px-6 overflow-x-auto" aria-label="Main navigation">
        {tabs.map((tab) => {
          const badge =
            tab === "Disaster Management" ? activeAlerts
            : tab === "Dispatch" ? inTransit
            : 0;

          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`relative my-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? "bg-black text-white shadow-sm"
                  : "text-gray-600 hover:bg-black/5 hover:text-gray-800"
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
            </button>
          );
        })}
      </nav>
    </header>
  );
}
