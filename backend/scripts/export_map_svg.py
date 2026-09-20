"""실제 잠실역~석촌역 지도를 SVG 한 장으로 내보낸다 (프론트 배경용).

- 도로: backend/data/map/walk_graph.json (이미 받아 둔 OSM 보행망)
- 물·공원·대로: Overpass 에서 한 번 받아 backend/data/map/areas.json 에 저장 후 재사용
- 출력 좌표계: viewBox "0 0 400 500" — 프론트 MapCanvas 의 SVG 와 동일
- 같이 내보내는 frontend/src/mapProjection.ts 로 위경도를 이 좌표계에 얹을 수 있다.

사용법 (backend 디렉터리에서):
    python scripts/export_map_svg.py
    python scripts/export_map_svg.py --refresh-areas      # 물·공원·대로 다시 받기
    python scripts/export_map_svg.py --theme dark         # 야간 시연용
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.route_engine import PLACES  # noqa: E402

GRAPH_PATH = BACKEND_DIR / "data" / "map" / "walk_graph.json"
AREAS_PATH = BACKEND_DIR / "data" / "map" / "areas.json"
SVG_OUT = REPO_DIR / "frontend" / "public" / "map-jamsil.svg"
PROJ_OUT = REPO_DIR / "frontend" / "src" / "mapProjection.ts"

VIEW_W, VIEW_H = 400.0, 500.0
PADDING = 1.45  # 출발·도착을 감싸는 여유

START, END = PLACES["잠실역"], PLACES["석촌역"]

# 지도에 이름을 적을 곳
LABELS = [
    ("잠실역", PLACES["잠실역"], "station"),
    ("석촌역", PLACES["석촌역"], "station"),
    ("롯데월드타워", PLACES["롯데월드타워"], "poi"),
    ("석촌호수", PLACES["석촌호수"], "water"),
    ("잠실새내역", PLACES["잠실새내역"], "station"),
    ("송파나루역", PLACES["송파나루역"], "station"),
]

THEMES = {
    "light": {
        "land": "#E8EEF4", "water": "#BEE3F8", "water_edge": "#90CDF4", "park": "#D5E8D4",
        "major_out": "#FFFFFF", "major_in": "#F1F5F9", "street": "#FFFFFF", "path": "#FFFFFF",
        "path_opacity": "0.75", "label": "#475569", "label_sub": "#94A3B8", "water_label": "#3B82F6",
    },
    "dark": {
        "land": "#1E293B", "water": "#1E3A5F", "water_edge": "#2C5282", "park": "#1F3D2B",
        "major_out": "#475569", "major_in": "#64748B", "street": "#3E4C5F", "path": "#334155",
        "path_opacity": "0.9", "label": "#CBD5E1", "label_sub": "#64748B", "water_label": "#60A5FA",
    },
}

MAJOR = {"primary", "secondary", "trunk", "primary_link", "secondary_link"}
STREET = {"tertiary", "residential", "living_street", "unclassified", "service"}

OVERPASS_MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
)


# ---------------------------------------------------------------- 좌표


def compute_bounds() -> dict:
    """출발·도착을 감싸면서 400:500 비율에 맞는 위경도 상자."""
    clat = (START[0] + END[0]) / 2
    clng = (START[1] + END[1]) / 2
    m_per_lat = 111_320.0
    m_per_lng = 111_320.0 * math.cos(math.radians(clat))

    need_h = abs(START[0] - END[0]) * m_per_lat * PADDING
    need_w = abs(START[1] - END[1]) * m_per_lng * PADDING
    aspect = VIEW_W / VIEW_H
    height_m = max(need_h, need_w / aspect, 900.0)
    width_m = height_m * aspect

    dlat = height_m / 2 / m_per_lat
    dlng = width_m / 2 / m_per_lng
    return {
        "south": round(clat - dlat, 6), "north": round(clat + dlat, 6),
        "west": round(clng - dlng, 6), "east": round(clng + dlng, 6),
        "width_m": round(width_m), "height_m": round(height_m),
    }


def projector(b: dict):
    span_lng = b["east"] - b["west"]
    span_lat = b["north"] - b["south"]

    def xy(lat: float, lng: float) -> tuple[float, float]:
        return ((lng - b["west"]) / span_lng * VIEW_W, (b["north"] - lat) / span_lat * VIEW_H)

    return xy


# ---------------------------------------------------------------- Overpass


def fetch_areas(b: dict) -> dict:
    import httpx

    bbox = f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    # 석촌호수처럼 큰 물·공원은 relation(다중 폴리곤)으로 되어 있어 way 만 받으면 빠진다.
    query = (
        "[out:json][timeout:90];("
        f'way["natural"="water"]({bbox});'
        f'relation["natural"="water"]({bbox});'
        f'way["water"]({bbox});'
        f'relation["water"]({bbox});'
        f'way["leisure"="park"]({bbox});'
        f'relation["leisure"="park"]({bbox});'
        f'way["landuse"~"^(grass|forest|recreation_ground|village_green)$"]({bbox});'
        f'way["highway"~"^(primary|secondary|trunk|primary_link|secondary_link)$"]({bbox});'
        ");out body;>;out skel qt;"
    )
    last = None
    for url in OVERPASS_MIRRORS:
        try:
            r = httpx.post(url, data={"data": query},
                           headers={"User-Agent": "kmu-walking-route-demo/1.0", "Accept": "application/json"},
                           timeout=120)
            r.raise_for_status()
            return r.json()
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"  {url} 실패: {exc}", file=sys.stderr)
    raise RuntimeError(f"Overpass 미러 전부 실패: {last}")


def load_areas(b: dict, refresh: bool) -> dict:
    if AREAS_PATH.exists() and not refresh:
        return json.loads(AREAS_PATH.read_text(encoding="utf-8"))
    print("물·공원·대로 데이터를 Overpass 에서 내려받는 중…")
    raw = fetch_areas(b)
    AREAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    AREAS_PATH.write_text(json.dumps(raw, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return raw


# ---------------------------------------------------------------- 렌더


def polygon_d(points: list[tuple[float, float]]) -> str:
    head = f"M {points[0][0]:.1f} {points[0][1]:.1f}"
    rest = " ".join(f"L {x:.1f} {y:.1f}" for x, y in points[1:])
    return f"{head} {rest} Z"


def lines_d(segments: list[tuple[tuple[float, float], tuple[float, float]]]) -> str:
    return " ".join(f"M {a[0]:.1f} {a[1]:.1f} L {b[0]:.1f} {b[1]:.1f}" for a, b in segments)


def in_view(p: tuple[float, float], margin: float = 60.0) -> bool:
    return -margin <= p[0] <= VIEW_W + margin and -margin <= p[1] <= VIEW_H + margin


def build_svg(b: dict, areas: dict, graph: dict, theme: dict) -> str:
    xy = projector(b)

    elements = areas.get("elements", [])
    nodes = {el["id"]: (el["lat"], el["lon"]) for el in elements if el["type"] == "node"}

    # relation(다중 폴리곤)의 바깥 경계 way 를 해당 종류로 분류해 둔다
    rel_kind: dict[int, str] = {}
    for el in elements:
        if el["type"] != "relation":
            continue
        tags = el.get("tags", {})
        kind = "water" if (tags.get("natural") == "water" or tags.get("water")) else (
            "park" if tags.get("leisure") == "park" else None)
        if not kind:
            continue
        for member in el.get("members", []):
            if member.get("type") == "way" and member.get("role") in ("outer", ""):
                rel_kind[member["ref"]] = kind

    water, parks, majors = [], [], []
    for el in elements:
        if el["type"] != "way":
            continue
        pts = [xy(*nodes[n]) for n in el.get("nodes", []) if n in nodes]
        if len(pts) < 2:
            continue
        tags = el.get("tags", {})
        kind = rel_kind.get(el["id"])
        if tags.get("natural") == "water" or tags.get("water"):
            kind = "water"
        elif tags.get("leisure") == "park" or tags.get("landuse"):
            kind = kind or "park"
        elif tags.get("highway") in MAJOR:
            majors.append(pts)
            continue
        if kind == "water":
            water.append(pts)
        elif kind == "park":
            parks.append(pts)

    gnodes = {int(k): (v[0], v[1]) for k, v in graph["nodes"].items()}
    streets, paths = [], []
    for u, v, _length, highway, _steps in graph["edges"]:
        a, c = xy(*gnodes[u]), xy(*gnodes[v])
        if not (in_view(a) or in_view(c)):
            continue
        (streets if highway in STREET else paths).append((a, c))

    def polyline_d(pts):
        return " ".join(f"{'M' if i == 0 else 'L'} {x:.1f} {y:.1f}" for i, (x, y) in enumerate(pts))

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W:.0f} {VIEW_H:.0f}" '
        f'width="{VIEW_W:.0f}" height="{VIEW_H:.0f}">',
        f'<rect width="{VIEW_W:.0f}" height="{VIEW_H:.0f}" fill="{theme["land"]}"/>',
    ]
    for pts in parks:
        out.append(f'<path d="{polygon_d(pts)}" fill="{theme["park"]}" opacity="0.85"/>')
    for pts in water:
        out.append(f'<path d="{polygon_d(pts)}" fill="{theme["water"]}" '
                   f'stroke="{theme["water_edge"]}" stroke-width="1.5"/>')
    if paths:
        out.append(f'<path d="{lines_d(paths)}" fill="none" stroke="{theme["path"]}" '
                   f'stroke-width="1.4" stroke-opacity="{theme["path_opacity"]}" stroke-linecap="round"/>')
    if streets:
        out.append(f'<path d="{lines_d(streets)}" fill="none" stroke="{theme["street"]}" '
                   f'stroke-width="3" stroke-linecap="round"/>')
    for pts in majors:
        out.append(f'<path d="{polyline_d(pts)}" fill="none" stroke="{theme["major_out"]}" '
                   f'stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>')
    for pts in majors:
        out.append(f'<path d="{polyline_d(pts)}" fill="none" stroke="{theme["major_in"]}" '
                   f'stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>')

    for name, coord, kind in LABELS:
        x, y = xy(*coord)
        if not (0 <= x <= VIEW_W and 0 <= y <= VIEW_H):
            continue
        color = theme["water_label"] if kind == "water" else (
            theme["label"] if kind == "station" else theme["label_sub"])
        size, weight = (9, 700) if kind == "station" else (8, 600)
        if kind == "station":
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{color}" opacity="0.7"/>')
        out.append(f'<text x="{x + 5:.1f}" y="{y + 3:.1f}" fill="{color}" font-size="{size}" '
                   f'font-weight="{weight}" font-family="system-ui, sans-serif" '
                   f'paint-order="stroke" stroke="{theme["land"]}" stroke-width="2.5">{name}</text>')

    out.append("</svg>")
    return "\n".join(out)


def build_projection_ts(b: dict) -> str:
    return f"""/** 자동 생성 — backend/scripts/export_map_svg.py. 직접 수정하지 마세요. */

/** map-jamsil.svg 의 좌표계. MapCanvas 의 viewBox 와 동일합니다. */
export const MAP_VIEWBOX = {{ width: {VIEW_W:.0f}, height: {VIEW_H:.0f} }} as const;

/** 그 SVG 가 덮는 실제 위경도 범위 (가로 {b["width_m"]}m × 세로 {b["height_m"]}m) */
export const MAP_BOUNDS = {{
  south: {b["south"]},
  west: {b["west"]},
  north: {b["north"]},
  east: {b["east"]},
}} as const;

/** 백엔드 응답의 위경도 → SVG viewBox 좌표 */
export function latLngToXY(lat: number, lng: number): {{ x: number; y: number }} {{
  const {{ south, west, north, east }} = MAP_BOUNDS;
  return {{
    x: ((lng - west) / (east - west)) * MAP_VIEWBOX.width,
    y: ((north - lat) / (north - south)) * MAP_VIEWBOX.height,
  }};
}}

/** 경로 좌표 배열 → <path d="..."> 문자열 */
export function toSvgPath(coords: readonly {{ lat: number; lng: number }}[]): string {{
  return coords
    .map((c, i) => {{
      const {{ x, y }} = latLngToXY(c.lat, c.lng);
      return `${{i === 0 ? "M" : "L"}} ${{x.toFixed(1)}} ${{y.toFixed(1)}}`;
    }})
    .join(" ");
}}

/** 경로 좌표 배열 → 퍼센트 좌표 (pathPoints 형식이 필요할 때) */
export function toPercentPoints(
  coords: readonly {{ lat: number; lng: number }}[],
): {{ x: number; y: number }}[] {{
  return coords.map((c) => {{
    const {{ x, y }} = latLngToXY(c.lat, c.lng);
    return {{ x: (x / MAP_VIEWBOX.width) * 100, y: (y / MAP_VIEWBOX.height) * 100 }};
  }});
}}
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh-areas", action="store_true", help="물·공원·대로를 Overpass 에서 다시 받기")
    ap.add_argument("--theme", choices=sorted(THEMES), default="light")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    if not GRAPH_PATH.exists():
        sys.exit(f"{GRAPH_PATH} 가 없습니다. 먼저 python scripts/build_walk_graph.py 를 실행하세요.")

    bounds = compute_bounds()
    print(f"지도 범위: 가로 {bounds['width_m']}m × 세로 {bounds['height_m']}m")
    print(f"  위도 {bounds['south']}~{bounds['north']}, 경도 {bounds['west']}~{bounds['east']}")

    areas = load_areas(bounds, args.refresh_areas)
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    svg = build_svg(bounds, areas, graph, THEMES[args.theme])

    out = args.out or (SVG_OUT if args.theme == "light" else SVG_OUT.with_name("map-jamsil-dark.svg"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")
    print(f"저장: {out.relative_to(REPO_DIR)}  ({len(svg) / 1024:.0f} KB)")

    PROJ_OUT.parent.mkdir(parents=True, exist_ok=True)
    PROJ_OUT.write_text(build_projection_ts(bounds), encoding="utf-8")
    print(f"저장: {PROJ_OUT.relative_to(REPO_DIR)}")


if __name__ == "__main__":
    main()
