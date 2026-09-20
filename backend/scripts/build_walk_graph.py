"""OpenStreetMap 보행 네트워크를 한 번 내려받아 로컬 그래프 파일로 저장한다.

경로 계산은 이 파일(backend/data/map/walk_graph.json)만 사용한다. 실행 중에는
외부 지도/길찾기 API를 호출하지 않는다.

사용법 (backend 디렉터리에서):
    python scripts/build_walk_graph.py            # Overpass에서 받아서 빌드
    python scripts/build_walk_graph.py --raw x.json  # 저장해 둔 Overpass 응답으로 빌드
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.geo import haversine_m  # noqa: E402

OUT_PATH = BACKEND_DIR / "data" / "map" / "walk_graph.json"

# 잠실역 ~ 석촌역 일대, 석촌호수·롯데월드타워 포함 (south, west, north, east)
BBOX = (37.499, 127.088, 37.521, 127.118)

# primary/secondary(송파대로·올림픽로 같은 대로)는 인도가 별도 footway 로 매핑되어 있으므로
# 차도 중심선을 보행 그래프에 넣지 않는다. 넣으면 최단 경로가 차도 위를 걷는다.
WALKABLE = (
    "footway|path|pedestrian|steps|residential|living_street|service|"
    "tertiary|unclassified|track|cycleway"
)
QUERY = (
    "[out:json][timeout:90];"
    f'(way["highway"~"^({WALKABLE})$"]["foot"!~"^(no|private)$"]'
    f"({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););"
    "out body;>;out skel qt;"
)
MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
)


def fetch_overpass() -> dict:
    import httpx

    last_error: Exception | None = None
    for url in MIRRORS:
        try:
            resp = httpx.post(
                url,
                data={"data": QUERY},
                headers={"User-Agent": "kmu-walking-route-demo/1.0", "Accept": "application/json"},
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # noqa: BLE001 — 다음 미러 시도
            last_error = exc
            print(f"  {url} 실패: {exc}", file=sys.stderr)
    raise RuntimeError(f"Overpass 미러 전부 실패: {last_error}")


def build_graph(raw: dict) -> dict:
    nodes: dict[int, tuple[float, float]] = {}
    ways: list[dict] = []
    for el in raw["elements"]:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lat"], el["lon"])
        elif el["type"] == "way":
            ways.append(el)

    edges: dict[tuple[int, int], dict] = {}
    for way in ways:
        tags = way.get("tags", {})
        highway = tags.get("highway", "")
        is_steps = highway == "steps"
        refs = [r for r in way["nodes"] if r in nodes]
        for u, v in zip(refs, refs[1:]):
            if u == v:
                continue
            key = (u, v) if u < v else (v, u)
            length = haversine_m(nodes[u], nodes[v])
            if length <= 0:
                continue
            # 같은 두 점을 잇는 중복 way는 짧은 쪽 유지
            if key not in edges or edges[key]["length_m"] > length:
                edges[key] = {"length_m": length, "highway": highway, "steps": is_steps}

    # 가장 큰 연결 성분만 남긴다 (끊어진 자투리 제거)
    adj: dict[int, list[int]] = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    seen: set[int] = set()
    best: set[int] = set()
    for start in adj:
        if start in seen:
            continue
        comp, stack = set(), [start]
        while stack:
            n = stack.pop()
            if n in comp:
                continue
            comp.add(n)
            stack.extend(adj[n])
        seen |= comp
        if len(comp) > len(best):
            best = comp

    kept_edges = [
        [u, v, round(e["length_m"], 1), e["highway"], e["steps"]]
        for (u, v), e in edges.items()
        if u in best and v in best
    ]
    kept_nodes = {str(n): [nodes[n][0], nodes[n][1]] for n in best}
    return {
        "source": "OpenStreetMap contributors (ODbL) via Overpass API",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bbox": BBOX,
        "node_count": len(kept_nodes),
        "edge_count": len(kept_edges),
        "nodes": kept_nodes,
        "edges": kept_edges,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, help="저장된 Overpass JSON 응답")
    parser.add_argument("--out", type=Path, default=OUT_PATH)
    args = parser.parse_args()

    if args.raw:
        raw = json.loads(args.raw.read_text(encoding="utf-8"))
    else:
        print("Overpass에서 보행 네트워크를 내려받는 중…")
        raw = fetch_overpass()

    graph = build_graph(raw)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total_km = sum(e[2] for e in graph["edges"]) / 1000
    print(f"저장: {args.out}")
    print(f"노드 {graph['node_count']}개, 엣지 {graph['edge_count']}개, 총 {total_km:.1f} km")


if __name__ == "__main__":
    main()
