# Aegis Disaster Logistics and Route Safety Optimization System

A full-stack disaster response system for route safety optimization and efficient relief logistics.

## 📌 Overview
Aegis helps coordinate relief operations during disasters by:
- Managing disaster zones and warehouse inventories
- Calculating routes that avoid unsafe/blocked areas
- Supporting dispatch planning with stock validation
- Visualizing everything on an interactive map

## 🎯 Why This Project

In disaster situations, traditional routing systems fail to account for unsafe zones.  
Aegis addresses this by integrating disaster-aware routing with logistics and resource management.

## 🚀 Features
- Disaster Management: add / edit / delete disaster zones
- Warehouse Management: manage warehouses, capacity, and stock levels
- Route Calculation: backend route computation via a C++ optimizer
- Route Safety Detection: marks routes as safe or blocked
- Alternate Route Computation: attempts an alternate route when blocked
- Dispatch System: create dispatches with warehouse stock validation
- Map Visualization: Leaflet map with disasters, warehouses, routes, dispatch paths
- Logs & History: in-app logs with CSV export

## 🛠️ Tech Stack

**Frontend**
- React
- TypeScript
- Vite
- Tailwind CSS
- Leaflet (OpenStreetMap tiles)

**Backend**
- FastAPI (Python)
- Uvicorn

**Optimizer**
- C++ route optimizer (A* with disaster-zone penalty weighting)

## 📂 Project Structure
```
AEGIS/
 ├── frontend-improved/
 └── disaster-backend/
```

## ⚙️ Installation & Setup

### 1. Clone Repository
```bash
git clone <repo-link>
cd AEGIS
```

### 2. Backend Setup
```bash
cd disaster-backend
pip install -r requirements.txt
uvicorn main:app --reload 
```

### 3. Frontend Setup
```bash
cd frontend-improved
npm install
npm run dev
```

## 🔄 How It Works
1. Add or update a disaster zone (type, severity, radius, status).
2. Select source and destination in Route Operations.
3. Backend merges active stored disasters into the route request.
4. FastAPI calls the compiled C++ optimizer to compute a route + safety flag.
5. If the primary route is blocked, the UI attempts an alternate route.
6. Dispatch resources from the nearest warehouse to the disaster location with stock validation.

## 📊 API Endpoints
- `GET /api/disasters` / `POST /api/disasters` / `PUT /api/disasters/{id}` / `DELETE /api/disasters/{id}`
- `GET /api/warehouses` / `POST /api/warehouses` / `PUT /api/warehouses/{id}` / `DELETE /api/warehouses/{id}`
- `POST /api/route`
- `GET /api/dispatches` / `POST /api/dispatches`
- `PUT /api/dispatches/{id}/status`

## 🧠 Key Highlights
- Backend-driven safety evaluation (`blocked` flag comes from the optimizer result)
- C++ optimizer integrated via a Python bridge (compile + subprocess execution)
- Map-first operations with clear disaster/warehouse/route overlays (Leaflet)
- Stock-aware dispatch creation with backend validation and persistence

## 📝 Notes
- Backend persistence is JSON-based: `disaster-backend/data/store.json` (no database).
- The backend attempts to compile the C++ optimizer on startup; a C++ toolchain (e.g., `g++` or `cmake`) must be available for `/api/route` to work.
- Designed for academic/demo use.