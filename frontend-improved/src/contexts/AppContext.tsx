import React, { createContext, useContext, useReducer, useCallback, ReactNode } from "react";

export interface City {
  name: string;
  lat: number;
  lon: number;
}

export interface RouteSegment {
  lat: number;
  lon: number;
}

export interface RouteData {
  path: RouteSegment[];
  distance: number;
  eta: string;
  safe: boolean;
  blocked: boolean;
  alternateAvailable: boolean;
}

export interface Disaster {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  location: City;
  radius: number;
  status: "active" | "monitoring" | "resolved";
  timestamp: string;
  description: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: City;
  capacity: number;
  currentStock: {
    food: number;
    water: number;
    medicine: number;
    firstAid: number;
  };
}

export interface Dispatch {
  id: string;
  warehouseId: string;
  warehouseName: string;
  route: RouteData | null;
  resources: { food: number; water: number; medicine: number; firstAid: number };
  status: "pending" | "in_transit" | "delivered";
  eta: string;
  timestamp: string;
  destination: City;
  currentPosition?: RouteSegment;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "route" | "disaster" | "dispatch" | "system";
  message: string;
  status: "info" | "warning" | "error" | "success";
}

interface AppState {
  source: City | null;
  destination: City | null;
  route: RouteData | null;
  alternateRoute: RouteData | null;
  disasters: Disaster[];
  warehouses: Warehouse[];
  dispatches: Dispatch[];
  logs: LogEntry[];
  loading: { route: boolean; disasters: boolean; warehouses: boolean; dispatch: boolean };
  errors: { route: string | null; disasters: string | null; warehouses: string | null };
}

type Action =
  | { type: "SET_SOURCE"; payload: City | null }
  | { type: "SET_DESTINATION"; payload: City | null }
  | { type: "SET_ROUTE"; payload: RouteData | null }
  | { type: "SET_ALTERNATE_ROUTE"; payload: RouteData | null }
  | { type: "SET_DISASTERS"; payload: Disaster[] }
  | { type: "ADD_DISASTER"; payload: Disaster }
  | { type: "UPDATE_DISASTER"; payload: Disaster }
  | { type: "REMOVE_DISASTER"; payload: string }
  | { type: "SET_WAREHOUSES"; payload: Warehouse[] }
  | { type: "ADD_WAREHOUSE"; payload: Warehouse }
  | { type: "UPDATE_WAREHOUSE"; payload: Warehouse }
  | { type: "REMOVE_WAREHOUSE"; payload: string }
  | { type: "ADD_DISPATCH"; payload: Dispatch }
  | { type: "UPDATE_DISPATCH"; payload: { id: string; updates: Partial<Dispatch> } }
  | { type: "ADD_LOG"; payload: LogEntry }
  | { type: "CLEAR_LOGS" }
  | { type: "SET_LOADING"; payload: Partial<AppState["loading"]> }
  | { type: "SET_ERROR"; payload: Partial<AppState["errors"]> };

const seedDisasters: Disaster[] = [
  {
    id: "d1",
    type: "Flood",
    severity: "high",
    location: { name: "Mumbai", lat: 19.076, lon: 72.8777 },
    radius: 30,
    status: "active",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    description: "Severe flooding in coastal areas; major roads submerged.",
  },
  {
    id: "d2",
    type: "Earthquake",
    severity: "critical",
    location: { name: "Kathmandu", lat: 27.7172, lon: 85.324 },
    radius: 50,
    status: "active",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    description: "7.2 magnitude earthquake; major infrastructure damage reported.",
  },
  {
    id: "d3",
    type: "Wildfire",
    severity: "medium",
    location: { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
    radius: 20,
    status: "monitoring",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    description: "Wildfire spreading eastward; evacuation orders in effect.",
  },
];

const seedWarehouses: Warehouse[] = [
  {
    id: "w1",
    name: "Delhi Relief Hub",
    location: { name: "New Delhi", lat: 28.6139, lon: 77.209 },
    capacity: 10000,
    currentStock: { food: 5000, water: 8000, medicine: 2000, firstAid: 1500 },
  },
  {
    id: "w2",
    name: "Pune Emergency Center",
    location: { name: "Pune", lat: 18.5204, lon: 73.8567 },
    capacity: 7500,
    currentStock: { food: 3000, water: 6000, medicine: 1200, firstAid: 900 },
  },
  {
    id: "w3",
    name: "Chennai Logistics Base",
    location: { name: "Chennai", lat: 13.0827, lon: 80.2707 },
    capacity: 8000,
    currentStock: { food: 4000, water: 5000, medicine: 1800, firstAid: 1100 },
  },
];

const seedLogs: LogEntry[] = [
  {
    id: "l1",
    timestamp: new Date(Date.now() - 600000).toISOString(),
    type: "system",
    message: "System initialized. Real-time monitoring active.",
    status: "info",
  },
  {
    id: "l2",
    timestamp: new Date(Date.now() - 300000).toISOString(),
    type: "disaster",
    message: "New disaster reported: Flood at Mumbai (high severity).",
    status: "warning",
  },
  {
    id: "l3",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    type: "disaster",
    message: "Critical earthquake detected at Kathmandu. Emergency response initiated.",
    status: "error",
  },
];

const initialState: AppState = {
  source: null,
  destination: null,
  route: null,
  alternateRoute: null,
  disasters: seedDisasters,
  warehouses: seedWarehouses,
  dispatches: [],
  logs: seedLogs,
  loading: { route: false, disasters: false, warehouses: false, dispatch: false },
  errors: { route: null, disasters: null, warehouses: null },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_SOURCE":
      return { ...state, source: action.payload };
    case "SET_DESTINATION":
      return { ...state, destination: action.payload };
    case "SET_ROUTE":
      return { ...state, route: action.payload };
    case "SET_ALTERNATE_ROUTE":
      return { ...state, alternateRoute: action.payload };
    case "SET_DISASTERS":
      return { ...state, disasters: action.payload };
    case "ADD_DISASTER":
      return { ...state, disasters: [...state.disasters, action.payload] };
    case "UPDATE_DISASTER":
      return {
        ...state,
        disasters: state.disasters.map((d) =>
          d.id === action.payload.id ? action.payload : d
        ),
      };
    case "REMOVE_DISASTER":
      return {
        ...state,
        disasters: state.disasters.filter((d) => d.id !== action.payload),
      };
    case "SET_WAREHOUSES":
      return { ...state, warehouses: action.payload };
    case "ADD_WAREHOUSE":
      return { ...state, warehouses: [...state.warehouses, action.payload] };
    case "UPDATE_WAREHOUSE":
      return {
        ...state,
        warehouses: state.warehouses.map((w) =>
          w.id === action.payload.id ? action.payload : w
        ),
      };
    case "REMOVE_WAREHOUSE":
      return {
        ...state,
        warehouses: state.warehouses.filter((w) => w.id !== action.payload),
      };
    case "ADD_DISPATCH":
      return { ...state, dispatches: [...state.dispatches, action.payload] };
    case "UPDATE_DISPATCH":
      return {
        ...state,
        dispatches: state.dispatches.map((d) =>
          d.id === action.payload.id ? { ...d, ...action.payload.updates } : d
        ),
      };
    case "ADD_LOG":
      return { ...state, logs: [action.payload, ...state.logs] };
    case "CLEAR_LOGS":
      return { ...state, logs: [] };
    case "SET_LOADING":
      return { ...state, loading: { ...state.loading, ...action.payload } };
    case "SET_ERROR":
      return { ...state, errors: { ...state.errors, ...action.payload } };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  addLog: (type: LogEntry["type"], message: string, status: LogEntry["status"]) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addLog = useCallback(
    (type: LogEntry["type"], message: string, status: LogEntry["status"]) => {
      dispatch({
        type: "ADD_LOG",
        payload: {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type,
          message,
          status,
        },
      });
    },
    []
  );

  return (
    <AppContext.Provider value={{ state, dispatch, addLog }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
