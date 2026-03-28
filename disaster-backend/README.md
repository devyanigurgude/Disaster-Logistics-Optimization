# Smart Disaster Logistics — Backend

FastAPI + C++ (A* optimizer) backend for the Route Safety Optimization System.

---

## Data Flow

```
React Frontend
     │
     │  HTTP POST /api/route
     ▼
FastAPI (Python)
     │
     │  subprocess stdin/stdout (JSON)
     ▼
optimizer (C++ binary)   ← A* algorithm with disaster penalties
     │
     │  JSON result
     ▼
FastAPI → JSON response
     │
     ▼
React Frontend
```

---

## Folder Structure

```
disaster-backend/
├── main.py                        # FastAPI app entry point
├── requirements.txt
├── README.md
├── bin/                           # Compiled C++ binary (auto-generated)
│   └── optimizer
├── cpp/
│   ├── optimizer.cpp              # C++ A* route optimizer
│   └── CMakeLists.txt
└── app/
    ├── __init__.py
    ├── models.py                  # Pydantic models
    ├── routes.py                  # All API endpoints
    ├── services/
    │   ├── __init__.py
    │   ├── data_store.py          # In-memory store + seed data
    │   └── route_service.py      # Route business logic
    └── utils/
        ├── __init__.py
        └── optimizer_bridge.py   # Python ↔ C++ subprocess bridge
```

---

## Setup & Run

### 1. Install Python dependencies

```bash
cd disaster-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Compile C++ optimizer

**Option A — g++ (simplest):**
```bash
mkdir -p bin
g++ -std=c++17 -O2 -o bin/optimizer cpp/optimizer.cpp
```

**Option B — CMake:**
```bash
cd cpp && mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .
cp optimizer ../../bin/
```

> The Python backend also auto-compiles on first startup if g++ or cmake is found.

### 3. Start the backend

```bash
uvicorn main:app --reload --port 8000
```

### 4. Open API docs

```
http://localhost:8000/docs
```

---

## API Reference

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| GET    | /api/health                     | System health check                |
| GET    | /api/disasters                  | List all disasters                 |
| POST   | /api/disasters                  | Report a new disaster              |
| GET    | /api/disasters/{id}             | Get disaster by ID                 |
| PUT    | /api/disasters/{id}             | Update disaster                    |
| DELETE | /api/disasters/{id}             | Remove disaster                    |
| GET    | /api/warehouses                 | List all warehouses                |
| POST   | /api/warehouses                 | Register a warehouse               |
| GET    | /api/warehouses/{id}            | Get warehouse by ID                |
| PUT    | /api/warehouses/{id}            | Update warehouse                   |
| DELETE | /api/warehouses/{id}            | Remove warehouse                   |
| POST   | /api/route                      | **Calculate optimized route**      |
| GET    | /api/dispatches                 | List all dispatches                |
| POST   | /api/dispatches                 | Create dispatch order              |
| PUT    | /api/dispatches/{id}/status     | Update dispatch status             |

---

## POST /api/route — Example

**Request:**
```json
{
  "source":      { "lat": 28.6139, "lon": 77.2090 },
  "destination": { "lat": 19.0760, "lon": 72.8777 },
  "disasters": [
    { "lat": 23.0, "lon": 75.0, "radius_km": 80, "severity": 3 }
  ],
  "waypoints": []
}
```

**Response:**
```json
{
  "status":          "ok",
  "path":            [{ "lat": 28.6139, "lon": 77.209 }, "..."],
  "distance_km":     1412.5,
  "duration_min":    1413,
  "eta":             "23h 33m",
  "blocked":         true,
  "penalty_applied": true,
  "nodes_explored":  58,
  "source":          { "lat": 28.6139, "lon": 77.2090 },
  "destination":     { "lat": 19.076,  "lon": 72.8777 }
}
```

---

## Frontend Integration

In your React `src/lib/api.ts`, replace direct OSRM calls with:

```typescript
const API_BASE = "http://localhost:8000/api";

export async function fetchRoute(source: City, destination: City): Promise<RouteData> {
  const res = await fetch(`${API_BASE}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source:      { lat: source.lat, lon: source.lon },
      destination: { lat: destination.lat, lon: destination.lon },
    }),
  });
  if (!res.ok) throw new Error(`Route API error: ${res.status}`);
  const data = await res.json();
  return {
    path:               data.path.map((p: any) => ({ lat: p.lat, lon: p.lon })),
    distance:           Math.round(data.distance_km),
    eta:                data.eta,
    safe:               !data.blocked,
    blocked:            data.blocked,
    alternateAvailable: false,
  };
}
```
