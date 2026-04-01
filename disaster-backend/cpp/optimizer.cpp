/*
 * Aegis Disaster Logistics — Route Optimizer
 * Hard-constraint A* with strict disaster zone blocking.
 * No penalties. An edge either exists or it doesn't.
 *
 * stdin  → JSON (see InputSchema below)
 * stdout → JSON (see OutputSchema below)
 */

#include <iostream>
#include <sstream>
#include <vector>
#include <queue>
#include <unordered_map>
#include <cmath>
#include <limits>
#include <algorithm>
#include <string>

// ─────────────────────────────────────────────────────────────────────────────
// Minimal JSON helpers (no external deps)
// ─────────────────────────────────────────────────────────────────────────────
#include <regex>

// Very small JSON value reader — enough for our structured input
// For production, swap with nlohmann/json or rapidjson
static std::string extractField(const std::string& json,
                                const std::string& key) {
    // Finds "key": <value>  where value is string, number, or array/object
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";
    pos = json.find(':', pos) + 1;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\n')) ++pos;
    if (pos >= json.size()) return "";

    char first = json[pos];
    if (first == '"') {
        size_t end = json.find('"', pos + 1);
        return json.substr(pos + 1, end - pos - 1);
    }
    if (first == '[' || first == '{') {
        // Find matching bracket
        char open  = first;
        char close = (open == '[') ? ']' : '}';
        int depth = 0;
        size_t end = pos;
        for (; end < json.size(); ++end) {
            if (json[end] == open)  ++depth;
            if (json[end] == close) { --depth; if (depth == 0) break; }
        }
        return json.substr(pos, end - pos + 1);
    }
    // Number / bool / null
    size_t end = pos;
    while (end < json.size() && json[end] != ',' &&
           json[end] != '}' && json[end] != ']' && json[end] != '\n')
        ++end;
    std::string v = json.substr(pos, end - pos);
    // trim
    v.erase(0, v.find_first_not_of(" \t\r\n"));
    v.erase(v.find_last_not_of(" \t\r\n") + 1);
    return v;
}

static std::vector<std::string> extractArrayObjects(const std::string& arr) {
    // arr is a JSON array string like "[{...},{...}]"
    std::vector<std::string> result;
    int depth = 0;
    size_t start = std::string::npos;
    for (size_t i = 0; i < arr.size(); ++i) {
        if (arr[i] == '{') {
            if (depth == 0) start = i;
            ++depth;
        } else if (arr[i] == '}') {
            --depth;
            if (depth == 0 && start != std::string::npos) {
                result.push_back(arr.substr(start, i - start + 1));
                start = std::string::npos;
            }
        }
    }
    return result;
}

static std::vector<double> extractNumberArray(const std::string& arr) {
    // arr is like "[1.0, 2.0, 3.0]"
    std::vector<double> result;
    std::istringstream ss(arr);
    char c;
    double v;
    while (ss >> c) {
        if (c == '[' || c == ',' || c == ' ') continue;
        if (c == ']') break;
        ss.putback(c);
        if (ss >> v) result.push_back(v);
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────
static const double EARTH_R      = 6371.0;   // km
const int GRID = 12;   // or 15 for stronger avoidance
constexpr double R = 6371.0; // km (NOT meters)
static const double DEG2RAD      = 3.14159265358979323846 / 180.0;
static const double SAFETY_BUF   = 2.0;      // km hard safety buffer

struct LatLon { double lat, lon; };

struct DisasterZone {
    LatLon center;
    double radius_km;
    int    severity;   // 1–5 (not used for blocking, kept for metadata)
};

struct Edge {
    int    to;
    double dist_km;
};

using Graph      = std::unordered_map<int, std::vector<Edge>>;
using NodeCoords = std::unordered_map<int, LatLon>;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Haversine distance (km)
// ─────────────────────────────────────────────────────────────────────────────
double haversine(const LatLon& a, const LatLon& b) {
    double dlat = (b.lat - a.lat) * DEG2RAD;
    double dlon = (b.lon - a.lon) * DEG2RAD;
    double la1  = a.lat * DEG2RAD;
    double la2  = b.lat * DEG2RAD;
    double h    = std::sin(dlat/2)*std::sin(dlat/2)
                + std::cos(la1)*std::cos(la2)
                * std::sin(dlon/2)*std::sin(dlon/2);
    return 2.0 * EARTH_R * std::asin(std::sqrt(h));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Point-to-segment distance (km) — local equirectangular projection
// ─────────────────────────────────────────────────────────────────────────────
double pointToSegmentDist(const LatLon& P,
                          const LatLon& A,
                          const LatLon& B) {
    double cosLat = std::cos(A.lat * DEG2RAD);

    // Project to km offsets relative to A
    double bx = (B.lon - A.lon) * DEG2RAD * EARTH_R * cosLat;
    double by = (B.lat - A.lat) * DEG2RAD * EARTH_R;
    double px = (P.lon - A.lon) * DEG2RAD * EARTH_R * cosLat;
    double py = (P.lat - A.lat) * DEG2RAD * EARTH_R;

    double len2 = bx*bx + by*by;
    if (len2 < 1e-12) return haversine(P, A);   // degenerate edge

    double t = (px*bx + py*by) / len2;
    if (t < 0.0) t = 0.0;
    if (t > 1.0) t = 1.0;

    double dx = px - t * bx;
    double dy = py - t * by;
    return std::sqrt(dx*dx + dy*dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Hard edge-blocking — returns true if edge must be skipped
// ─────────────────────────────────────────────────────────────────────────────
static bool lineCircleIntersects(const LatLon& from, const LatLon& to, const LatLon& center, double radius_km) {
    // Returns true if line segment intersects circle
    double d1 = haversine(center, from);
    double d2 = haversine(center, to);
    if (d1 <= radius_km || d2 <= radius_km) return true;  // endpoint inside

    // Check closest point on segment
    double closest = pointToSegmentDist(center, from, to);
    return closest <= radius_km;
}

bool isEdgeBlocked(const LatLon& A,
                   const LatLon& B,
                   const std::vector<DisasterZone>& zones) {
    for (const auto& z : zones) {
        double buffer = 2.0; // km safety margin

        if (lineCircleIntersects(A, B, z.center, z.radius_km + buffer)) {
            return true;
        }
    }
    return false;
}

// Also check if a single node sits inside any zone (for source/dest validation)
bool isNodeInZone(const LatLon& P,
                  const std::vector<DisasterZone>& zones) {
    for (const auto& z : zones)
        if (haversine(P, z.center) <= z.radius_km + SAFETY_BUF) return true;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. A* — hard-constraint version
//    Returns empty path if no safe route exists.
// ─────────────────────────────────────────────────────────────────────────────
struct PQNode {
    double f;
    int    id;
    bool operator>(const PQNode& o) const { return f > o.f; }
};

std::vector<int> astar(int src, int dst,
                       const Graph&      graph,
                       const NodeCoords& coords,
                       const std::vector<DisasterZone>& zones) {

    auto h = [&](int n) { return haversine(coords.at(n), coords.at(dst)); };

    std::unordered_map<int, double> g;
    std::unordered_map<int, int>    parent;
    std::priority_queue<PQNode, std::vector<PQNode>, std::greater<PQNode>> open;

    g[src] = 0.0;
    open.push({h(src), src});

    while (!open.empty()) {
        PQNode top = open.top(); open.pop();
        double f_cur = top.f;
        int    cur   = top.id;

        if (cur == dst) {
            std::vector<int> path;
            for (int n = dst; n != src; n = parent.at(n))
                path.push_back(n);
            path.push_back(src);
            std::reverse(path.begin(), path.end());
            return path;
        }

        double g_cur = g.count(cur) ? g[cur] : std::numeric_limits<double>::max();
        if (f_cur > g_cur + h(cur) + 1e-9) continue;   // stale

        if (!graph.count(cur)) continue;
        for (const auto& edge : graph.at(cur)) {
            int next = edge.to;

            // ── HARD CONSTRAINT ───────────────────────────────────────────
            if (isEdgeBlocked(coords.at(cur), coords.at(next), zones))
                continue;   // skip — NO penalty, NO fallback, just skip
            // ─────────────────────────────────────────────────────────────

            double tg = g_cur + edge.dist_km;
            if (!g.count(next) || tg < g[next]) {
                g[next]      = tg;
                parent[next] = cur;
                open.push({tg + h(next), next});
            }
        }
    }
    return {};   // no safe path
}

// ─────────────────────────────────────────────────────────────────────────────
// Road network builder — dense grid interpolated between source and dest
// Generates intermediate waypoints that OSRM-style routing would use,
// but derived purely from straight-line geography.
//
// For real deployment: replace this with an actual OSM graph loader.
// For demo/academic: this grid is sufficient to demonstrate avoidance.
// ─────────────────────────────────────────────────────────────────────────────
void buildGraph(const LatLon& src, const LatLon& dst,
                Graph& graph, NodeCoords& coords,
                int gridN = 12) {
    // Build an (N+1) x (N+1) grid spanning src→dst with a margin
    double latMin = std::min(src.lat, dst.lat) - 0.3;
    double latMax = std::max(src.lat, dst.lat) + 0.3;
    double lonMin = std::min(src.lon, dst.lon) - 0.3;
    double lonMax = std::max(src.lon, dst.lon) + 0.3;

    double dLat = (latMax - latMin) / gridN;
    double dLon = (lonMax - lonMin) / gridN;

    auto nodeId = [&](int r, int c) { return r * (gridN + 1) + c; };

    for (int r = 0; r <= gridN; ++r)
        for (int c = 0; c <= gridN; ++c)
            coords[nodeId(r, c)] = { latMin + r * dLat,
                                     lonMin + c * dLon };

    // Connect 8-directional neighbours
    int dr[] = {-1,-1,-1, 0, 0, 1, 1, 1};
    int dc[] = {-1, 0, 1,-1, 1,-1, 0, 1};

    for (int r = 0; r <= gridN; ++r) {
        for (int c = 0; c <= gridN; ++c) {
            int from = nodeId(r, c);
            for (int d = 0; d < 8; ++d) {
                int nr = r + dr[d], nc = c + dc[d];
                if (nr < 0 || nr > gridN || nc < 0 || nc > gridN) continue;
                int to   = nodeId(nr, nc);
                double w = haversine(coords[from], coords[to]);
                graph[from].push_back({to, w});
            }
        }
    }
}

// Find the grid node nearest to a lat/lon
int nearestNode(const LatLon& pt, const NodeCoords& coords) {
    int    best = -1;
    double bestD = std::numeric_limits<double>::max();
    for (auto it = coords.begin(); it != coords.end(); ++it) {
        double d = haversine(pt, it->second);
        if (d < bestD) { bestD = d; best = it->first; }
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path geometry helpers
// ─────────────────────────────────────────────────────────────────────────────
double pathLength(const std::vector<int>& path, const NodeCoords& coords) {
    double total = 0;
    for (size_t i = 1; i < path.size(); ++i)
        total += haversine(coords.at(path[i-1]), coords.at(path[i]));
    return total;
}

// Verify a path is fully outside all disaster zones (double-check)
bool pathIsSafe(const std::vector<int>& path,
                const NodeCoords& coords,
                const std::vector<DisasterZone>& zones) {
    for (size_t i = 1; i < path.size(); ++i)
        if (isEdgeBlocked(coords.at(path[i-1]), coords.at(path[i]), zones))
            return false;
    return true;
}

// Build coordinate array string for JSON output
std::string pathToCoords(const std::vector<int>& path,
                         const NodeCoords& coords) {
    std::ostringstream ss;
    ss.precision(6);
    ss << std::fixed << "[";
    for (size_t i = 0; i < path.size(); ++i) {
        const auto& ll = coords.at(path[i]);
        ss << "[" << ll.lat << "," << ll.lon << "]";
        if (i + 1 < path.size()) ss << ",";
    }
    ss << "]";
    return ss.str();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — reads JSON from stdin, writes JSON to stdout
//
// Input JSON schema:
// {
//   "source":      [lat, lon],
//   "destination": [lat, lon],
//   "disasters": [
//     { "lat": f, "lon": f, "radius_km": f, "severity": i }, ...
//   ]
// }
//
// Output JSON schema:
// {
//   "status":       "ok" | "no_safe_path",
//   "blocked":      bool,         // true if direct route hits a disaster
//   "path":         [[lat,lon]],  // safe path (empty if none)
//   "distance_km":  float,
//   "duration_min": float,        // @ 50 km/h average relief speed
//   "direct_path":  [[lat,lon]]   // original blocked path (for red viz)
// }
// ─────────────────────────────────────────────────────────────────────────────
int main() {
    std::string input;
    {
        std::ostringstream ss;
        ss << std::cin.rdbuf();
        input = ss.str();
    }

    // Parse source
    std::string srcArr = extractField(input, "source");
    auto srcVals = extractNumberArray(srcArr);
    if (srcVals.size() < 2) {
        std::cout << R"({"status":"error","message":"invalid source"})" << "\n";
        return 1;
    }
    LatLon src = {srcVals[0], srcVals[1]};

    // Parse destination
    std::string dstArr = extractField(input, "destination");
    auto dstVals = extractNumberArray(dstArr);
    if (dstVals.size() < 2) {
        std::cout << R"({"status":"error","message":"invalid destination"})" << "\n";
        return 1;
    }
    LatLon dst = {dstVals[0], dstVals[1]};

    // Parse disasters
    std::vector<DisasterZone> zones;
    std::string disArr = extractField(input, "disasters");
    if (!disArr.empty() && disArr[0] == '[') {
        for (const auto& obj : extractArrayObjects(disArr)) {
            DisasterZone z;
            z.center.lat = std::stod(extractField(obj, "lat"));
            z.center.lon = std::stod(extractField(obj, "lon"));
            z.radius_km  = std::stod(extractField(obj, "radius_km"));
            std::string sv = extractField(obj, "severity");
            z.severity   = sv.empty() ? 3 : std::stoi(sv);
            zones.push_back(z);
        }
    }

    // Build road network grid
    Graph      graph;
    NodeCoords coords;
    buildGraph(src, dst, graph, coords, GRID);  // Use dense grid

    // Add source and destination as explicit nodes
    int srcId = (int)coords.size();
    int dstId = srcId + 1;
    coords[srcId] = src;
    coords[dstId] = dst;

    // Connect src/dst to their nearest grid nodes
    auto connectToNearest = [&](int newId) {
        LatLon pt = coords[newId];
        // Find 4 nearest grid nodes and connect bidirectionally
        std::vector<std::pair<double,int>> nearest;
        for (auto it = coords.begin(); it != coords.end(); ++it) {
            if (it->first == newId) continue;
            nearest.push_back({haversine(pt, it->second), it->first});
        }
        std::sort(nearest.begin(), nearest.end());
        int k = std::min(4, (int)nearest.size());
        for (int i = 0; i < k; ++i) {
            double w = nearest[i].first;
            int    nb = nearest[i].second;
            graph[newId].push_back({nb, w});
            graph[nb].push_back({newId, w});
        }
    };
    connectToNearest(srcId);
    connectToNearest(dstId);

    // ── Direct path (ignoring disasters, for red visualization) ──────────────
    // We compute this by running A* on a disaster-free zone list
    std::vector<DisasterZone> noZones;
    std::vector<int> directPath = astar(srcId, dstId, graph, coords, noZones);
    double directDist = directPath.empty() ? 0.0 : pathLength(directPath, coords);
    bool   directBlocked = !directPath.empty() &&
                           !pathIsSafe(directPath, coords, zones);

    // ── Safe path (hard-blocked A*) ───────────────────────────────────────────
    std::vector<int> safePath = astar(srcId, dstId, graph, coords, zones);
    bool hasSafe = !safePath.empty();

    // Verify the safe path (sanity check)
    if (hasSafe && !pathIsSafe(safePath, coords, zones)) {
        // Should never happen — but guard against logic errors
        safePath.clear();
        hasSafe = false;
    }

    double safeDist = hasSafe ? pathLength(safePath, coords) : 0.0;
    double avgSpeedKmH = 50.0;
    double safeDurMin  = hasSafe ? (safeDist / avgSpeedKmH * 60.0) : 0.0;

    // ── Build JSON output ────────────────────────────────────────────────────
    std::ostringstream out;
    out.precision(2);
    out << std::fixed;

    out << "{\n";
    out << "  \"status\": \"" << (hasSafe ? "ok" : "no_safe_path") << "\",\n";
    out << "  \"blocked\": " << (directBlocked ? "true" : "false") << ",\n";
    out << "  \"direct_path\": " << (directPath.empty() ? "[]" : pathToCoords(directPath, coords)) << ",\n";
    out << "  \"direct_distance_km\": " << directDist << ",\n";
    out << "  \"path\": " << (hasSafe ? pathToCoords(safePath, coords) : "[]") << ",\n";
    out << "  \"distance_km\": " << safeDist << ",\n";
    out << "  \"duration_min\": " << safeDurMin << ",\n";
    out << "  \"safe_path_found\": " << (hasSafe ? "true" : "false") << "\n";
    out << "}\n";

    std::cout << out.str();
    return 0;
}