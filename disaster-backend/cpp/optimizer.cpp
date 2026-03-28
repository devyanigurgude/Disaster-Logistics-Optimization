/**
 * optimizer.cpp
 * Smart Disaster Logistics — Route Safety Optimization Engine
 *
 * Algorithm: A* with disaster-zone penalty weighting
 *
 * Input  (stdin, JSON):
 * {
 *   "source":      { "lat": 28.6, "lon": 77.2 },
 *   "destination": { "lat": 19.0, "lon": 72.8 },
 *   "disasters":   [{ "lat": 23.0, "lon": 75.0, "radius_km": 50, "severity": 3 }],
 *   "waypoints":   []          // optional intermediate nodes
 * }
 *
 * Output (stdout, JSON):
 * {
 *   "status": "ok",
 *   "path": [{ "lat": ..., "lon": ... }, ...],
 *   "distance_km": 1234.5,
 *   "duration_min": 720,
 *   "blocked": false,
 *   "penalty_applied": true,
 *   "nodes_explored": 42
 * }
 */

#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <queue>
#include <unordered_map>
#include <cmath>
#include <limits>
#include <algorithm>
#include <iomanip>
// ─── Minimal JSON helpers (no external deps) ─────────────────────────────────

static std::string extractString(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";
    pos = json.find(":", pos) + 1;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '"')) ++pos;
    size_t end = json.find_first_of(",}\"]", pos);
    return json.substr(pos, end - pos);
}

static double extractDouble(const std::string& json, const std::string& key, double def = 0.0) {
    std::string val = extractString(json, key);
    if (val.empty()) return def;
    try { return std::stod(val); } catch (...) { return def; }
}

// ─── Core Data Structures ─────────────────────────────────────────────────────

struct LatLon {
    double lat, lon;
};

struct DisasterZone {
    LatLon center;
    double radius_km;
    int    severity;   // 1=low 2=medium 3=high 4=critical
};

struct Node {
    int    id;
    LatLon pos;
};

struct Edge {
    int    to;
    double base_cost;   // km
    double penalty;     // added cost if near disaster
};

// ─── Haversine Distance (km) ──────────────────────────────────────────────────
constexpr double PI = 3.14159265358979323846;
static double haversine(const LatLon& a, const LatLon& b) {
    const double R = 6371.0;
    double dLat = (b.lat - a.lat) * PI / 180.0;
    double dLon = (b.lon - a.lon) * PI / 180.0;
    double sinDLat = std::sin(dLat / 2.0);
    double sinDLon = std::sin(dLon / 2.0);
    double x = sinDLat * sinDLat +
               std::cos(a.lat * PI / 180.0) *
               std::cos(b.lat * PI / 180.0) *
               sinDLon * sinDLon;
    return R * 2.0 * std::atan2(std::sqrt(x), std::sqrt(1.0 - x));
}
// ─── Disaster Penalty for an Edge ────────────────────────────────────────────

static double disasterPenalty(const LatLon& from, const LatLon& to,
                               const std::vector<DisasterZone>& zones) {
    double penalty = 0.0;
    // Sample 5 points along the edge
    for (int i = 0; i <= 4; ++i) {
        double t = i / 4.0;
        LatLon mid{ from.lat + t * (to.lat - from.lat),
                    from.lon + t * (to.lon - from.lon) };
        for (const auto& z : zones) {
            double dist = haversine(mid, z.center);
            if (dist < z.radius_km) {
                // Penalty scales with severity and proximity
                double overlap = 1.0 - (dist / z.radius_km);
                penalty += z.severity * overlap * 200.0;  // km equivalent
            }
        }
    }
    return penalty;
}

// ─── Graph Generation ─────────────────────────────────────────────────────────
// We build a synthetic grid graph between src and dst with intermediate nodes
// that approximates realistic road-level routing granularity.

static std::vector<Node> buildGraph(const LatLon& src, const LatLon& dst,
                                    const std::vector<LatLon>& waypoints) {
    std::vector<Node> nodes;
    nodes.push_back({ 0, src });

    // Grid of intermediate nodes (5x5) covering the bounding box + margin
    double minLat = std::min(src.lat, dst.lat) - 0.5;
    double maxLat = std::max(src.lat, dst.lat) + 0.5;
    double minLon = std::min(src.lon, dst.lon) - 0.5;
    double maxLon = std::max(src.lon, dst.lon) + 0.5;

    const int GRID = 5;
    for (int i = 0; i <= GRID; ++i) {
        for (int j = 0; j <= GRID; ++j) {
            double lat = minLat + (maxLat - minLat) * i / GRID;
            double lon = minLon + (maxLon - minLon) * j / GRID;
            nodes.push_back({ (int)nodes.size(), { lat, lon } });
        }
    }

    // Additional nodes along great-circle path
    const int PATH_POINTS = 8;
    for (int k = 1; k < PATH_POINTS; ++k) {
        double t = (double)k / PATH_POINTS;
        nodes.push_back({ (int)nodes.size(),
            { src.lat + t * (dst.lat - src.lat),
              src.lon + t * (dst.lon - src.lon) } });
    }

    // User waypoints
    for (const auto& wp : waypoints) {
        nodes.push_back({ (int)nodes.size(), wp });
    }

    nodes.push_back({ (int)nodes.size(), dst });
    return nodes;
}

// ─── A* Search ───────────────────────────────────────────────────────────────

struct AStarState {
    double f;  // g + h
    double g;  // cost so far
    int    id;
    bool operator>(const AStarState& o) const { return f > o.f; }
};

struct SearchResult {
    std::vector<int> path;
    double           cost_km;
    bool             found;
    int              nodes_explored;
};

static SearchResult astar(const std::vector<Node>& nodes,
                           const std::vector<DisasterZone>& zones,
                           int src_id, int dst_id) {
    int N = (int)nodes.size();
    const double CONNECT_RADIUS_KM = 500.0;  // max edge length

    std::vector<double> g(N, std::numeric_limits<double>::infinity());
    std::vector<int>    parent(N, -1);
    std::priority_queue<AStarState, std::vector<AStarState>, std::greater<AStarState>> pq;

    g[src_id] = 0.0;
    double h0 = haversine(nodes[src_id].pos, nodes[dst_id].pos);
    pq.push({ h0, 0.0, src_id });

    int explored = 0;

    while (!pq.empty()) {
        AStarState cur = pq.top(); pq.pop();
        ++explored;

        if (cur.id == dst_id) break;
        if (cur.g > g[cur.id] + 1e-9) continue;  // stale

        // Connect to all nodes within radius (full connectivity)
        for (int j = 0; j < N; ++j) {
            if (j == cur.id) continue;
            double base = haversine(nodes[cur.id].pos, nodes[j].pos);
            if (base > CONNECT_RADIUS_KM) continue;

            double pen  = disasterPenalty(nodes[cur.id].pos, nodes[j].pos, zones);
            double cost = base + pen;
            double ng   = g[cur.id] + cost;

            if (ng < g[j]) {
                g[j]      = ng;
                parent[j] = cur.id;
                double h  = haversine(nodes[j].pos, nodes[dst_id].pos);
                pq.push({ ng + h, ng, j });
            }
        }
    }

    if (g[dst_id] == std::numeric_limits<double>::infinity()) {
        return { {}, 0.0, false, explored };
    }

    // Reconstruct path
    std::vector<int> path;
    for (int cur = dst_id; cur != -1; cur = parent[cur]) {
        path.push_back(cur);
    }
    std::reverse(path.begin(), path.end());
    return { path, g[dst_id], true, explored };
}

// ─── JSON Parsing Helpers ─────────────────────────────────────────────────────

static std::vector<DisasterZone> parseDisasters(const std::string& json) {
    std::vector<DisasterZone> result;
    size_t pos = 0;
    while ((pos = json.find('{', pos)) != std::string::npos) {
        size_t end = json.find('}', pos);
        if (end == std::string::npos) break;
        std::string obj = json.substr(pos, end - pos + 1);
        DisasterZone z;
        z.center.lat  = extractDouble(obj, "lat");
        z.center.lon  = extractDouble(obj, "lon");
        z.radius_km   = extractDouble(obj, "radius_km", 50.0);
        z.severity    = (int)extractDouble(obj, "severity", 2.0);
        if (z.center.lat != 0.0 || z.center.lon != 0.0) {
            result.push_back(z);
        }
        pos = end + 1;
    }
    return result;
}

static std::vector<LatLon> parseWaypoints(const std::string& json) {
    std::vector<LatLon> result;
    size_t pos = 0;
    while ((pos = json.find('{', pos)) != std::string::npos) {
        size_t end = json.find('}', pos);
        if (end == std::string::npos) break;
        std::string obj = json.substr(pos, end - pos + 1);
        LatLon p{ extractDouble(obj, "lat"), extractDouble(obj, "lon") };
        if (p.lat != 0.0 || p.lon != 0.0) result.push_back(p);
        pos = end + 1;
    }
    return result;
}

static std::string extractArray(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "[]";
    pos = json.find('[', pos);
    if (pos == std::string::npos) return "[]";
    int depth = 0;
    size_t end = pos;
    for (; end < json.size(); ++end) {
        if (json[end] == '[') ++depth;
        else if (json[end] == ']') { --depth; if (depth == 0) break; }
    }
    return json.substr(pos, end - pos + 1);
}

static std::string extractObject(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "{}";
    pos = json.find('{', pos);
    if (pos == std::string::npos) return "{}";
    int depth = 0;
    size_t end = pos;
    for (; end < json.size(); ++end) {
        if (json[end] == '{') ++depth;
        else if (json[end] == '}') { --depth; if (depth == 0) break; }
    }
    return json.substr(pos, end - pos + 1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

int main() {
    // Read all stdin
    std::string input((std::istreambuf_iterator<char>(std::cin)),
                       std::istreambuf_iterator<char>());

    if (input.empty()) {
        std::cout << R"({"status":"error","message":"No input provided"})" << std::endl;
        return 1;
    }

    // Parse source
    std::string srcObj = extractObject(input, "source");
    LatLon src{ extractDouble(srcObj, "lat"), extractDouble(srcObj, "lon") };

    // Parse destination
    std::string dstObj = extractObject(input, "destination");
    LatLon dst{ extractDouble(dstObj, "lat"), extractDouble(dstObj, "lon") };

    if (src.lat == 0.0 && src.lon == 0.0) {
        std::cout << R"({"status":"error","message":"Invalid source coordinates"})" << std::endl;
        return 1;
    }
    if (dst.lat == 0.0 && dst.lon == 0.0) {
        std::cout << R"({"status":"error","message":"Invalid destination coordinates"})" << std::endl;
        return 1;
    }

    // Parse disasters and waypoints
    std::string disasterArr  = extractArray(input, "disasters");
    std::string waypointArr  = extractArray(input, "waypoints");
    std::vector<DisasterZone> disasters  = parseDisasters(disasterArr);
    std::vector<LatLon>       waypoints  = parseWaypoints(waypointArr);

    // Build graph and run A*
    std::vector<Node> nodes = buildGraph(src, dst, waypoints);
    int src_id = 0;
    int dst_id = (int)nodes.size() - 1;

    SearchResult result = astar(nodes, disasters, src_id, dst_id);

    if (!result.found) {
        std::cout << R"({"status":"error","message":"No path found between given coordinates"})"
                  << std::endl;
        return 1;
    }

    // Check if any disaster zone was crossed (non-penalized distance check)
    bool penaltyApplied = false;
    bool routeBlocked   = false;
    for (int i = 0; i + 1 < (int)result.path.size(); ++i) {
        double p = disasterPenalty(nodes[result.path[i]].pos,
                                   nodes[result.path[i+1]].pos, disasters);
        if (p > 0) penaltyApplied = true;
    }
    // "blocked" means the DIRECT path goes through a disaster and we had to reroute
    if (!disasters.empty()) {
        double directPenalty = disasterPenalty(src, dst, disasters);
        routeBlocked = (directPenalty > 0 && penaltyApplied);
    }

    // Compute real geographic distance (ignoring penalties)
    double real_dist_km = 0.0;
    for (int i = 0; i + 1 < (int)result.path.size(); ++i) {
        real_dist_km += haversine(nodes[result.path[i]].pos,
                                  nodes[result.path[i+1]].pos);
    }

    // Estimate duration: average 60 km/h road speed
    double duration_min = (real_dist_km / 60.0) * 60.0;

    // Build output JSON
    std::ostringstream out;
    out << std::fixed << std::setprecision(6);
    out << "{\n";
    out << "  \"status\": \"ok\",\n";
    out << "  \"path\": [\n";
    for (int i = 0; i < (int)result.path.size(); ++i) {
        const auto& n = nodes[result.path[i]];
        out << "    {\"lat\": " << n.pos.lat << ", \"lon\": " << n.pos.lon << "}";
        if (i + 1 < (int)result.path.size()) out << ",";
        out << "\n";
    }
    out << "  ],\n";
    out << "  \"distance_km\": " << std::setprecision(2) << real_dist_km << ",\n";
    out << "  \"duration_min\": " << (int)duration_min << ",\n";
    out << "  \"blocked\": " << (routeBlocked ? "true" : "false") << ",\n";
    out << "  \"penalty_applied\": " << (penaltyApplied ? "true" : "false") << ",\n";
    out << "  \"nodes_explored\": " << result.nodes_explored << "\n";
    out << "}\n";

    std::cout << out.str();
    return 0;
}
