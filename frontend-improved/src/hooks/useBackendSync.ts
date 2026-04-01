// useBackendSync.ts
// Loads disasters and warehouses from the backend on app startup
// and keeps the AppContext in sync.

import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { loadDisasters, loadWarehouses, loadDispatches } from "@/lib/api";

export function useBackendSync() {
  const { dispatch, addLog } = useAppContext();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const [disasters, warehouses, dispatches] = await Promise.all([
          loadDisasters(),
          loadWarehouses(),
          loadDispatches(),
        ]);
        if (cancelled) return;

        dispatch({ type: "SET_DISASTERS",  payload: disasters });
        dispatch({ type: "SET_WAREHOUSES", payload: warehouses });
        dispatches.forEach((d) => dispatch({ type: "ADD_DISPATCH", payload: d }));
        addLog("system", `Synced ${disasters.length} disasters, ${warehouses.length} warehouses, ${dispatches.length} dispatches from backend.`, "success");    setReady(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Backend unreachable";
        setError(msg);
        addLog("system", `Backend sync failed (${msg}). Using local seed data.`, "warning");
        setReady(true);
      }
    }

    sync();
    return () => { cancelled = true; };
  }, [addLog, dispatch]);

  return { ready, error };
}
