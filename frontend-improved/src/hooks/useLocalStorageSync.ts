import { useEffect, useRef } from "react";
import { useAppContext } from "@/contexts/AppContext";

const KEYS = {
  disasters:  "sdl_disasters",
  warehouses: "sdl_warehouses",
  dispatches: "sdl_dispatches",
  logs:       "sdl_logs",
};

function save(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useLocalStorageSync() {
  const { state, dispatch } = useAppContext();
  const initialized = useRef(false);

  // ── On first mount: load saved data from localStorage ──────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const disasters  = load<any[]>(KEYS.disasters);
    const warehouses = load<any[]>(KEYS.warehouses);
    const dispatches = load<any[]>(KEYS.dispatches);
    const logs       = load<any[]>(KEYS.logs);

    if (disasters  && disasters.length  > 0) {
      dispatch({ type: "SET_DISASTERS", payload: disasters });
    }
    if (warehouses && warehouses.length > 0) {
      dispatch({ type: "SET_WAREHOUSES", payload: warehouses });
    }
    if (dispatches && dispatches.length > 0) {
      dispatches.forEach((d) =>
        dispatch({ type: "ADD_DISPATCH", payload: d })
      );
    }
    if (logs && logs.length > 0) {
      // logs are stored newest-first, restore in reverse so ADD_LOG
      // keeps newest on top
      [...logs].reverse().forEach((l) =>
        dispatch({ type: "ADD_LOG", payload: l })
      );
    }
  }, []);

  // ── Save whenever state changes ─────────────────────────────────────────
  useEffect(() => {
    if (!initialized.current) return;
    save(KEYS.disasters, state.disasters);
  }, [state.disasters]);

  useEffect(() => {
    if (!initialized.current) return;
    save(KEYS.warehouses, state.warehouses);
  }, [state.warehouses]);

  useEffect(() => {
    if (!initialized.current) return;
    save(KEYS.dispatches, state.dispatches);
  }, [state.dispatches]);

  useEffect(() => {
    if (!initialized.current) return;
    save(KEYS.logs, state.logs);
  }, [state.logs]);
}