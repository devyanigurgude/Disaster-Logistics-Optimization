import { useEffect, useRef } from "react";
import L from "leaflet";
import { useAppContext, Disaster, Warehouse } from "@/contexts/AppContext";
import { selectNearestWarehouse } from "@/lib/api";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ─── Path Smoothing (Chaikin's Algorithm) ─────────────────────────────────────
// Converts the jagged C++ grid path into a smooth curve.
// iterations=3 gives a good balance of smoothness vs. accuracy.
function chaikinSmooth(
  coords: L.LatLngTuple[],
  iterations: number = 3
): L.LatLngTuple[] {
  if (coords.length < 3) return coords;

  let pts = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: L.LatLngTuple[] = [pts[0]]; // keep first point
    for (let i = 0; i < pts.length - 1; i++) {
      const [lat0, lon0] = pts[i];
      const [lat1, lon1] = pts[i + 1];
      smoothed.push([lat0 * 0.75 + lat1 * 0.25, lon0 * 0.75 + lon1 * 0.25]);
      smoothed.push([lat0 * 0.25 + lat1 * 0.75, lon0 * 0.25 + lon1 * 0.75]);
    }
    smoothed.push(pts[pts.length - 1]); // keep last point
    pts = smoothed;
  }
  return pts;
}

// Converts path array to smoothed LatLngTuple array
function smoothPath(path: { lat: number; lon: number }[]): L.LatLngTuple[] {
  const raw: L.LatLngTuple[] = path.map((p) => [p.lat, p.lon]);
  return chaikinSmooth(raw, 3);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function svgIcon(color: string, label: string) {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
      <text x="12" y="16" text-anchor="middle" font-size="8" fill="${color}" font-weight="bold">${label}</text>
    </svg>`
  );
  return new L.Icon({
    iconUrl: `data:image/svg+xml,${svg}`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

const sourceIcon    = svgIcon("#1c5ce7", "S");
const destIcon      = svgIcon("#dc2626", "D");
const warehouseIcon = svgIcon("#d97706", "W");

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeafletMapProps {
  className?: string;
  showDispatches?: boolean;
  selectedDisaster?: Disaster | null;
  selectedWarehouse?: Warehouse | null;
}

function addReliefRoute(
  layers: L.LayerGroup,
  warehouse: Warehouse,
  disaster: Disaster,
  bounds: L.LatLngTuple[]
) {
  const reliefCoords: L.LatLngTuple[] = [
    [warehouse.location.lat, warehouse.location.lon],
    [disaster.location.lat, disaster.location.lon],
  ];

  const reliefLine = L.polyline(reliefCoords, {
    color: "#f97316",
    weight: 3,
    opacity: 0.9,
    dashArray: "8 5",
  }).bindPopup(
    `<strong>Relief Route</strong><br/>` +
    `From: ${warehouse.name}<br/>` +
    `To: ${disaster.type} - ${disaster.location.name}<br/>` +
    `<small>Warehouse to disaster location</small>`
  );
  layers.addLayer(reliefLine);

  const pulse = L.circleMarker(
    [warehouse.location.lat, warehouse.location.lon],
    { radius: 14, color: "#f97316", fillColor: "#f97316", fillOpacity: 0.15, weight: 2, dashArray: "4 4" }
  );
  layers.addLayer(pulse);

  const midLat = (warehouse.location.lat + disaster.location.lat) / 2;
  const midLon = (warehouse.location.lon + disaster.location.lon) / 2;
  const label = L.marker([midLat, midLon], {
    icon: L.divIcon({
      className: "",
      html: '<div style="background:#f97316;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">Relief Route</div>',
      iconAnchor: [40, 10],
    }),
  });
  layers.addLayer(label);
  bounds.push(...reliefCoords);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LeafletMap({
  className = "",
  showDispatches = false,
  selectedDisaster = null,
  selectedWarehouse = null,
}: LeafletMapProps) {
  const mapRef       = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef    = useRef<L.LayerGroup>(L.layerGroup());
  const { state }    = useAppContext();

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 78],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
      crossOrigin: true,
      keepBuffer: 4,
      updateWhenIdle: false,
    }).addTo(map);

    layersRef.current.addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize({ animate: false }), 100);
    setTimeout(() => map.invalidateSize({ animate: false }), 500);

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Legend ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    const legend = new L.Control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.style.cssText =
        "background:white;padding:10px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" +
        "font-size:12px;line-height:1.6;border:1px solid #e2e8f0;min-width:140px;";
      div.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;color:#374151;">Map Legend</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:12px;height:12px;border-radius:50%;background:#2563eb;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Source</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:12px;height:12px;border-radius:50%;background:#dc2626;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Destination</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:24px;height:3px;background:#16a34a;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Alternate Route</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:24px;height:3px;background:#ef4444;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Blocked Route</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:12px;height:12px;border-radius:50%;background:rgba(239,68,68,0.4);border:2px solid #ef4444;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Disaster Zone</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:12px;height:12px;border-radius:50%;background:#d97706;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Warehouse</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:24px;height:2px;border-top:2px dashed #f97316;display:inline-block;flex-shrink:0;"></span><span style="color:#374151;">Relief Route</span></div>
      `;
      return div;
    };
    legend.addTo(mapRef.current);
    return () => { legend.remove(); };
  }, []);

  // ── Layers (routes, disasters, warehouses) ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    const layers = layersRef.current;
    layers.clearLayers();
    const bounds: L.LatLngTuple[] = [];

    // Source marker
    if (state.source) {
      layers.addLayer(
        L.marker([state.source.lat, state.source.lon], { icon: sourceIcon }).bindPopup(
          `<strong>Source</strong><br/>${state.source.name}<br/>` +
          `<small>${state.source.lat.toFixed(4)}, ${state.source.lon.toFixed(4)}</small>`
        )
      );
      bounds.push([state.source.lat, state.source.lon]);
    }

    // Destination marker
    if (state.destination) {
      layers.addLayer(
        L.marker([state.destination.lat, state.destination.lon], { icon: destIcon }).bindPopup(
          `<strong>Destination</strong><br/>${state.destination.name}<br/>` +
          `<small>${state.destination.lat.toFixed(4)}, ${state.destination.lon.toFixed(4)}</small>`
        )
      );
      bounds.push([state.destination.lat, state.destination.lon]);
    }

    // ── Primary route ─────────────────────────────────────────────────────────
    if (state.route && state.route.path.length > 0) {
      // Smooth the C++ grid path before drawing
      const smoothed = smoothPath(state.route.path);

      if (state.route.blocked) {
        // Red dashed line for blocked route
        layers.addLayer(
          L.polyline(smoothed, {
            color:     "#dc2626",
            weight:    5,
            opacity:   0.85,
            dashArray: "12 6",
          }).bindPopup(
            `<strong>🚫 Primary Route — BLOCKED</strong><br/>` +
            `${state.route.distance} km · ETA: ${state.route.eta}<br/>` +
            `<small>Passes through active disaster zone — use alternate route</small>`
          )
        );

        // Blocked markers along route
        const step = Math.max(1, Math.floor(smoothed.length / 4));
        for (let i = step; i < smoothed.length - 1; i += step) {
          layers.addLayer(
            L.circleMarker(smoothed[i], {
              radius: 7, color: "#dc2626", fillColor: "#dc2626",
              fillOpacity: 1, weight: 2,
            }).bindTooltip("⛔ Route blocked", { permanent: false })
          );
        }
      } else {
        // Solid green for safe primary route
        layers.addLayer(
          L.polyline(smoothed, {
            color:   "#16a34a",
            weight:  5,
            opacity: 0.9,
          }).bindPopup(
            `<strong>✅ Primary Route — Safe</strong><br/>` +
            `${state.route.distance} km · ETA: ${state.route.eta}`
          )
        );
      }

      smoothed.forEach((c) => bounds.push(c));
    }
    // ── Direct (blocked) path — red dashed line ───────────────────────────────
    if (state.route?.directPath && state.route.directPath.length > 0) {
      const directSmoothed = smoothPath(state.route.directPath);
      layers.addLayer(
        L.polyline(directSmoothed, {
          color:     "#dc2626",
          weight:    4,
          opacity:   0.75,
          dashArray: "10 6",
        }).bindPopup(
          `<strong>Original route</strong><br/>${state.route.directDistance || state.route.distance} km`
        )
      );
    }

    // ── Safe detour/path — green solid line ───────────────────────────────────
    if (state.route?.path && state.route.path.length > 0) {
      const safeSmoothed = smoothPath(state.route.path);
      layers.addLayer(
        L.polyline(safeSmoothed, {
          color:   "#16a34a",
          weight:  5,
          opacity: 0.9,
        }).bindPopup(
          `<strong>Safe Route</strong><br/>${state.route.safeDistance || state.route.distance} km · ETA: ${state.route.eta}<br/><small>Disaster-free path by C++ A* optimizer</small>`
        )
      );
      safeSmoothed.forEach((c) => bounds.push(c));
    }
    // ── Alternate route ───────────────────────────────────────────────────────
    if (state.alternateRoute && state.alternateRoute.path.length > 0) {
      const smoothed = smoothPath(state.alternateRoute.path);

      layers.addLayer(
        L.polyline(smoothed, {
          color:   "#16a34a",
          weight:  5,
          opacity: 0.9,
        }).bindPopup(
          `<strong>✅ Safe Alternate Route</strong><br/>` +
          `${state.alternateRoute.distance} km · ETA: ${state.alternateRoute.eta}<br/>` +
          `<small>Recommended — avoids all disaster zones</small>`
        )
      );

      smoothed.forEach((c) => bounds.push(c));
    }

    // ── Disaster zones ────────────────────────────────────────────────────────
    const severityColor: Record<string, string> = {
      low: "#ef4444", medium: "#ef4444", high: "#ef4444", critical: "#7f1d1d",
    };

    state.disasters.forEach((disaster: Disaster) => {
      if (disaster.status === "resolved") return;
      const color = severityColor[disaster.severity] ?? "#ef4444";

      layers.addLayer(
        L.circle([disaster.location.lat, disaster.location.lon], {
          radius:      disaster.radius * 1000,
          color,
          fillColor:   color,
          fillOpacity: 0.18,
          weight:      2,
        }).bindPopup(
          `<strong>${disaster.type}</strong><br/>${disaster.location.name}<br/>` +
          `Severity: <b>${disaster.severity}</b><br/>Radius: ${disaster.radius} km<br/>` +
          `${disaster.description}`
        )
      );
      bounds.push([disaster.location.lat, disaster.location.lon]);
    });

    // ── Warehouses ────────────────────────────────────────────────────────────
    state.warehouses.forEach((warehouse) => {
      const totalStock =
        warehouse.currentStock.food + warehouse.currentStock.water +
        warehouse.currentStock.medicine + warehouse.currentStock.firstAid;

      layers.addLayer(
        L.marker([warehouse.location.lat, warehouse.location.lon], { icon: warehouseIcon }).bindPopup(
          `<strong>${warehouse.name}</strong><br/>${warehouse.location.name}<br/>` +
          `Cap: ${warehouse.capacity.toLocaleString()} · Stock: ${totalStock.toLocaleString()} units<br/>` +
          `<small>Food: ${warehouse.currentStock.food} | Water: ${warehouse.currentStock.water}<br/>` +
          `Medicine: ${warehouse.currentStock.medicine} | Aid: ${warehouse.currentStock.firstAid}</small>`
        )
      );
      bounds.push([warehouse.location.lat, warehouse.location.lon]);
    });

    // ── Relief routes (selected disaster/warehouse preview) ───────────────────
    const previewDisaster  = selectedDisaster;
    const previewWarehouse =
      selectedWarehouse ??
      (previewDisaster ? selectNearestWarehouse(previewDisaster.location, state.warehouses) : null);

    if (previewDisaster && previewWarehouse) {
      addReliefRoute(layers, previewWarehouse, previewDisaster, bounds);
    }

    // ── Dispatch overlays ─────────────────────────────────────────────────────
    // ── Dispatch overlays ─────────────────────────────────────────────────────
    if (showDispatches) {
      state.dispatches
        .filter((d) => d.status === "in_transit")
        .forEach((dispatchItem) => {
          const dispatchWarehouse = state.warehouses.find((w) => w.id === dispatchItem.warehouseId);
          if (dispatchWarehouse) {
            addReliefRoute(layers, dispatchWarehouse, {
              id:          dispatchItem.id,
              type:        "Dispatch",
              severity:    "low",
              location:    dispatchItem.destination,
              radius:      0,
              status:      "active",
              timestamp:   dispatchItem.timestamp,
              description: "Dispatch destination",
            }, bounds);
          }
        
         if (
          dispatchItem.currentPosition &&
          dispatchItem.status === "in_transit" &&
          typeof dispatchItem.currentPosition.lat === "number" &&
          typeof dispatchItem.currentPosition.lon === "number"
        ) {
          layers.addLayer(
            L.circleMarker(
              [dispatchItem.currentPosition.lat, dispatchItem.currentPosition.lon],   ).bindPopup(
              `<strong>${dispatchItem.warehouseName}</strong><br/>` +
              `-> ${dispatchItem.destination.name}<br/>` +
              `Status: ${dispatchItem.status}<br/>ETA: ${dispatchItem.eta}`
            )
          );
          bounds.push([dispatchItem.currentPosition.lat, dispatchItem.currentPosition.lon]);
        }
      });
    }

    // ── Fit map to content ────────────────────────────────────────────────────
    if (bounds.length >= 2) {
      mapRef.current.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 });
    } else if (bounds.length === 1) {
      mapRef.current.setView(bounds[0], 9);
    }
  }, [
    state.source,
    state.destination,
    state.route,
    state.alternateRoute,
    state.disasters,
    state.warehouses,
    state.dispatches,
    showDispatches,
    selectedDisaster,
    selectedWarehouse,
  ]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 rounded-lg border" />
    </div>
  );
}