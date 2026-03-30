import { useState } from "react";
import AppHeader, { TabName } from "@/components/AppHeader";
import DashboardTab from "@/pages/DashboardTab";
import RouteOperationsTab from "@/pages/RouteOperationsTab";
import WarehousesTab from "@/pages/WarehousesTab";
import DispatchTab from "@/pages/DispatchTab";
import DisasterManagementTab from "@/pages/DisasterManagementTab";
import HistoryLogsTab from "@/pages/HistoryLogsTab";
import { AppProvider } from "@/contexts/AppContext";
import { useBackendSync } from "@/hooks/useBackendSync";
import { useLocalStorageSync } from "@/hooks/useLocalStorageSync";

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabName>("Dashboard");
  const { ready, error } = useBackendSync();
  useLocalStorageSync();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {error && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-700 flex items-center gap-2">
          <span className="font-semibold">? Backend offline:</span>
          {error} — running on local data.
        </div>
      )}

      <main className="flex-1">
        {!ready ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Connecting to backend...
          </div>
        ) : (
          <>
            {activeTab === "Dashboard"            && <DashboardTab />}
            {activeTab === "Route Operations"     && <RouteOperationsTab />}
            {activeTab === "Warehouses"           && <WarehousesTab />}
            {activeTab === "Dispatch"             && <DispatchTab />}
            {activeTab === "Disaster Management"  && <DisasterManagementTab />}
            {activeTab === "History & Logs"       && <HistoryLogsTab />}
          </>
        )}
      </main>
    </div>
  );
}

export default function Index() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
