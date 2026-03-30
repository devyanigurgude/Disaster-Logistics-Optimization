// useBackendSync.ts
// Loads disasters and warehouses from the backend on app startup
// and keeps the AppContext in sync.

import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { loadDisasters, loadWarehouses } from "@/lib/api";

export function useBackendSync() {
  const { dispatch, addLog } = useAppContext();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const [disasters, warehouses] = await Promise.all([
          loadDisasters(),
          loadWarehouses(),
        ]);
        if (cancelled) return;

        dispatch({ type: "SET_DISASTERS",  payload: disasters });
        dispatch({ type: "SET_WAREHOUSES", payload: warehouses });
        addLog("system", `Synced ${disasters.length} disasters and ${warehouses.length} warehouses from backend.`, "success");
        setReady(true);
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
