"""역할 3 실데이터가 오기 전까지 쓸 샘플 CSV 7종을 만든다 (docs/data-spec.md 컬럼 그대로).

보행 그래프의 실제 도로 위에 가로등·그늘·소음원을 배치하고, 100m 격자 유동인구와
행사·상권을 넣는다. 값은 시드 고정 난수라 실행할 때마다 같다. sources.json 은 전부 "mock".

길 등급:
  main     — 차도 중심선(primary/secondary/tertiary). 가로등은 여기 두지 않는다(실제로는 인도에 있음)
  sidewalk — 큰길에서 30m 이내의 보행로. 밝고 시끄럽고 사람 많음
  local    — 골목(residential/living_street/service/unclassified)
  path     — 큰길에서 떨어진 산책로·계단(석촌호수 둘레길 등). 어둡고 조용하고 그늘 많음

사용법 (backend 디렉터리에서): python scripts/generate_sample_data.py
"""

from __future__ import annotations

import csv
import json
import math
import random
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.geo import haversine_m, point_to_polyline_m  # noqa: E402
from app.route_engine import PLACES, WalkGraph, generate_diverse_paths  # noqa: E402

# 실데이터(backend/data/)를 덮어쓰지 않도록 샘플은 data/sample/ 에 쓴다
DATA_DIR = BACKEND_DIR / "data" / "sample"
GRAPH_PATH = BACKEND_DIR / "data" / "map" / "walk_graph.json"
DAY = "2026-09-19"
rng = random.Random(20260919)

MAIN = {"primary", "secondary", "tertiary"}
LOCAL = {"residential", "living_street", "unclassified", "service"}
SIDEWALK_M = 30.0

START = PLACES["잠실역"]
END = PLACES["석촌역"]
TOWER = PLACES["롯데월드타워"]
LAKE = PLACES["석촌호수"]

# 등급별 가로등 간격(m). 100m당 개수 = 100/간격. data-spec: 100m당 4개 = 100점
LIGHT_SPACING = {"sidewalk": 30, "local": 60, "path": 130}
SHADE_SPACING = {"sidewalk": 120, "local": 60, "path": 35}


def offset(p, d_m, bearing_deg):
    lat = p[0] + (d_m * math.cos(math.radians(bearing_deg))) / 111_320
    lng = p[1] + (d_m * math.sin(math.radians(bearing_deg))) / (111_320 * math.cos(math.radians(p[0])))
    return round(lat, 6), round(lng, 6)


def midpoint(a, b):
    return (a[0] + b[0]) / 2, (a[1] + b[1]) / 2


def classify_edges(edges, nodes):
    """엣지 → 등급. 큰길 30m 이내의 보행로는 sidewalk."""
    main_mids = [midpoint(nodes[str(u)], nodes[str(v)]) for u, v, _l, hw, _s in edges if hw in MAIN]
    # 큰길 중점을 격자 버킷에 넣어 근접 판정을 빠르게
    bucket = {}
    for m in main_mids:
        bucket.setdefault((round(m[0] * 1000), round(m[1] * 1000)), []).append(m)

    def near_main(p):
        bl, bg = round(p[0] * 1000), round(p[1] * 1000)
        for dl in (-1, 0, 1):
            for dg in (-1, 0, 1):
                for m in bucket.get((bl + dl, bg + dg), ()):
                    if haversine_m(p, m) <= SIDEWALK_M:
                        return True
        return False

    classes = {}
    for u, v, _l, hw, _s in edges:
        if hw in MAIN:
            cls = "main"
        elif hw in LOCAL:
            cls = "local"
        else:
            cls = "sidewalk" if near_main(midpoint(nodes[str(u)], nodes[str(v)])) else "path"
        classes[(u, v)] = cls
    return classes


def along_edges(edges, nodes, classes, spacing_by_class, jitter=0.3):
    """엣지 위를 등급별 간격으로 걸으며 점을 뽑는다."""
    for u, v, length, _hw, _s in edges:
        cls = classes[(u, v)]
        spacing = spacing_by_class.get(cls)
        if not spacing:
            continue
        n = max(0, int(length / spacing + rng.random()))
        a, b = nodes[str(u)], nodes[str(v)]
        for i in range(n):
            t = min(1.0, max(0.0, (i + 0.5 + rng.uniform(-jitter, jitter)) / max(1, n)))
            yield (round(a[0] + (b[0] - a[0]) * t, 6), round(a[1] + (b[1] - a[1]) * t, 6)), cls


def write(name, header, rows):
    path = DATA_DIR / name
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print(f"  {name}: {len(rows)}행")


def main() -> None:
    raw = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    nodes, edges = raw["nodes"], raw["edges"]
    g = WalkGraph(raw)
    print("샘플 데이터 생성 중…")
    classes = classify_edges(edges, nodes)
    counts = {c: sum(1 for x in classes.values() if x == c) for c in ("main", "sidewalk", "local", "path")}
    print(f"  길 등급: {counts}")

    # 1. 가로등
    lights = []
    for p, _cls in along_edges(edges, nodes, classes, LIGHT_SPACING):
        if rng.random() < 0.08:
            continue
        lights.append((f"SL{len(lights) + 1:05d}", p[0], p[1]))
    write("streetlights.csv", ["streetlight_id", "lat", "lng"], lights)

    # 2. 구간별 가로등 개수 (fallback용)
    segs = []
    for u, v, length, _hw, _s in edges:
        spacing = LIGHT_SPACING.get(classes[(u, v)])
        if not spacing or length < 40:
            continue
        a, b = nodes[str(u)], nodes[str(v)]
        segs.append((f"SEG{len(segs) + 1:05d}", a[0], a[1], b[0], b[1], int(length / spacing)))
    write("streetlight_segments.csv", ["segment_id", "start_lat", "start_lng", "end_lat", "end_lng", "streetlight_count"], segs)

    # 3. 그늘 — 산책로 가로수 촘촘, 골목 보통, 큰길 인도는 건물 그늘 드물게
    shade = []
    for p, cls in along_edges(edges, nodes, classes, SHADE_SPACING):
        kind = "building" if cls == "sidewalk" else ("canopy" if rng.random() < 0.1 else "tree")
        score = {"tree": rng.randint(55, 95), "building": rng.randint(35, 70), "canopy": rng.randint(70, 90)}[kind]
        shade.append((f"SH{len(shade) + 1:05d}", p[0], p[1], kind, score))
    write("shade.csv", ["shade_id", "lat", "lng", "shade_type", "shade_score"], shade)

    # 4. 소음 — 교통(큰길 인도, 시간대별), 상권(석촌역·롯데타워 주변 저녁), 공사장 2곳(주간)
    noise = []
    for p, _cls in along_edges(edges, nodes, classes, {"sidewalk": 90}):
        for hour, db in ((8, 72), (12, 68), (18, 76), (23, 62)):
            noise.append((f"NZ{len(noise) + 1:05d}", p[0], p[1], db + rng.randint(-4, 4), f"{DAY}T{hour:02d}:00:00+09:00", "traffic"))
    for center, count in ((END, 30), (TOWER, 30)):
        for _ in range(count):
            p = offset(center, rng.uniform(20, 200), rng.uniform(0, 360))
            for hour, db in ((18, 70), (20, 73), (23, 66)):
                noise.append((f"NZ{len(noise) + 1:05d}", p[0], p[1], db + rng.randint(-3, 3), f"{DAY}T{hour:02d}:00:00+09:00", "commercial"))
    for site in (offset(START, 350, 200), offset(END, 300, 60)):
        for hour in (9, 11, 14, 16):
            noise.append((f"NZ{len(noise) + 1:05d}", site[0], site[1], 82 + rng.randint(-2, 2), f"{DAY}T{hour:02d}:00:00+09:00", "construction"))
    write("noise.csv", ["noise_id", "lat", "lng", "noise_level_db", "occurred_at", "noise_type"], noise)

    # 5. 유동인구 격자 — 100m × 24시간. 큰길·역·타워 가까울수록 높고, 호수 둘레는 낮다
    s, w_, n, e = raw["bbox"]
    main_mids = [midpoint(nodes[str(u)], nodes[str(v)]) for u, v, _l, hw, _s in edges if hw in MAIN][::2]
    grid = []
    lat_step, lng_step = 100 / 111_320, 100 / (111_320 * math.cos(math.radians((s + n) / 2)))
    hour_profile = [0.15, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6, 0.9, 0.7, 0.6, 0.65, 0.8, 0.7, 0.65, 0.7, 0.8, 0.95, 1.0, 0.9, 0.75, 0.6, 0.45, 0.3]
    gid = 0
    lat = s
    while lat < n:
        lng = w_
        while lng < e:
            c = (lat + lat_step / 2, lng + lng_step / 2)
            attract = 0.0
            for center, radius, peak in ((START, 300, 1.0), (TOWER, 300, 0.9), (END, 200, 0.5)):
                attract = max(attract, peak * max(0.0, 1 - haversine_m(c, center) / radius))
            d_main = min((haversine_m(c, p) for p in main_mids), default=999)
            road_bonus = 35 if d_main < 50 else 15 if d_main < 120 else 0
            lake_penalty = 18 if haversine_m(c, LAKE) < 260 and d_main > 60 else 0
            base = max(5, 10 + 45 * attract + road_bonus - lake_penalty)
            gid += 1
            for hour in range(24):
                score = max(0, min(100, base * (0.35 + 0.65 * hour_profile[hour]) + rng.uniform(-5, 5)))
                score = round(score, 1)
                grid.append((f"G{gid:04d}", round(c[0], 6), round(c[1], 6), hour, int(score * 12), score))
            lng += lng_step
        lat += lat_step
    write("crowd_grid.csv", ["grid_id", "lat", "lng", "time_slot", "population", "crowd_score"], grid)

    # 6. 행사 — 최단 경로 위, 다른 후보들에서 가장 먼 지점에 진행 중 행사 1건(저녁). 종료된 행사 1건
    paths = generate_diverse_paths(g, g.nearest_node(START), g.nearest_node(END))
    shortest, others = paths[0], paths[1:]
    other_lines = [[g.nodes[n] for n in p] for p in others]
    inner = shortest[len(shortest) // 5 : -len(shortest) // 5] or shortest
    if other_lines:
        spot = max(inner, key=lambda n: min(point_to_polyline_m(g.nodes[n], line) for line in other_lines))
    else:
        spot = inner[len(inner) // 2]
    ev = g.nodes[spot]
    events = [
        ("EV001", ev[0], ev[1], f"{DAY}T17:00:00+09:00", f"{DAY}T23:30:00+09:00", "true", 800),
        ("EV002", *offset(TOWER, 150, 45), f"{DAY}T10:00:00+09:00", f"{DAY}T14:00:00+09:00", "false", 200),
    ]
    write("events.csv", ["event_id", "lat", "lng", "start_time", "end_time", "is_active", "expected_attendance"], events)

    # 7. 상권 — 잠실역·롯데월드타워 주변 밀집, 석촌역 보통
    zones = []
    for center, count, kinds, lo, hi in (
        (START, 12, ("restaurant", "retail", "entertainment", "mixed"), 8, 30),
        (TOWER, 10, ("retail", "restaurant", "mixed"), 10, 30),
        (END, 8, ("restaurant", "retail"), 4, 14),
    ):
        for _ in range(count):
            p = offset(center, rng.uniform(30, 240), rng.uniform(0, 360))
            zones.append((f"ZN{len(zones) + 1:03d}", p[0], p[1], rng.choice(kinds), rng.randint(lo, hi)))
    write("store_zones.csv", ["zone_id", "lat", "lng", "zone_type", "store_count"], zones)

    print("완료. sources.json 은 전부 'mock' 입니다. 실데이터로 바꾸면 출처명을 적어 주세요.")


if __name__ == "__main__":
    main()
