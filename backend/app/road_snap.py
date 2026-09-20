"""역할 4 — 후보 경로 좌표를 실제 도로 지오메트리로 스냅한다.

로컬 보행망(walk_graph.json)의 노드 시퀀스는 OSM 에 형상점이 없는 구간에서
직선으로 그려져 카카오맵 위 실제 도로와 어긋나 보인다. 이 모듈은 후보의 경유점
몇 개를 뽑아 OSRM 도보 라우팅 서비스에 넘겨, 실제 도로를 따라가는 좌표열로
바꿔 준다. 후보의 corridor(어느 길로 도는지)는 경유점으로 유지된다.

기본은 꺼져 있다(외부 API 호출 없음). 환경변수로 켠다:

    SNAP_TO_ROADS=true
    OSRM_FOOT_URL=https://routing.openstreetmap.de/routed-foot   # 기본값

서비스에 닿지 못하거나 실패하면 원본 좌표를 그대로 돌려준다(그레이스풀 폴백).
거리·시간·지표 계산은 스냅 전 원본 경로 길이를 그대로 쓰므로 점수 파이프라인은
영향받지 않는다. 스냅은 오직 표시용 좌표만 바꾼다.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import List, Sequence, Tuple

from .geo import LatLng, haversine_m

DEFAULT_OSRM_URL = "https://routing.openstreetmap.de/routed-foot"

# OSRM 은 경유점이 너무 많으면 URL 이 길어지고 느려진다. corridor 를 유지할
# 정도로만 뽑는다. 노드 간격이 이보다 크게 벌어질 때마다 경유점 하나를 넣는다.
WAYPOINT_SPACING_M = 220.0
MAX_WAYPOINTS = 12  # 시작·끝 포함 상한
REQUEST_TIMEOUT_S = 8.0


def snap_enabled() -> bool:
    return os.getenv("SNAP_TO_ROADS", "").strip().lower() in ("1", "true", "yes")


def _osrm_url() -> str:
    return os.getenv("OSRM_FOOT_URL", DEFAULT_OSRM_URL).rstrip("/")


def _select_waypoints(coords: Sequence[LatLng]) -> List[LatLng]:
    """corridor 를 유지할 만큼만 경유점을 고른다. 시작·끝은 항상 포함."""
    if len(coords) <= 2:
        return list(coords)
    picked: List[LatLng] = [coords[0]]
    acc = 0.0
    for prev, cur in zip(coords, coords[1:]):
        acc += haversine_m(prev, cur)
        if acc >= WAYPOINT_SPACING_M:
            picked.append(cur)
            acc = 0.0
    if picked[-1] != coords[-1]:
        picked.append(coords[-1])
    # 상한 초과 시 균등 다운샘플 (시작·끝 유지)
    if len(picked) > MAX_WAYPOINTS:
        step = (len(picked) - 1) / (MAX_WAYPOINTS - 1)
        idx = sorted({round(i * step) for i in range(MAX_WAYPOINTS)} | {0, len(picked) - 1})
        picked = [picked[i] for i in idx]
    return picked


def _osrm_geometry(waypoints: Sequence[LatLng]) -> List[LatLng]:
    """OSRM 도보 라우팅 → (lat, lng) 좌표열. 실패 시 예외."""
    import httpx

    coords_param = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"{_osrm_url()}/route/v1/foot/{coords_param}"
    params = {"overview": "full", "geometries": "geojson", "continue_straight": "true"}
    resp = httpx.get(url, params=params, timeout=REQUEST_TIMEOUT_S,
                     headers={"User-Agent": "kmu-walking-route-demo/1.0"})
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM 응답이 경로를 담고 있지 않습니다: {data.get('code')}")
    line = data["routes"][0]["geometry"]["coordinates"]  # [lng, lat]
    return [(lat, lng) for lng, lat in line]


@lru_cache(maxsize=256)
def _snap_cached(waypoints_json: str) -> str:
    waypoints = [tuple(p) for p in json.loads(waypoints_json)]
    line = _osrm_geometry(waypoints)
    return json.dumps(line)


def snap_to_roads(coords: Sequence[LatLng]) -> List[LatLng]:
    """후보 좌표열을 실제 도로 지오메트리로 바꾼다. 실패하면 원본 반환."""
    if not snap_enabled() or len(coords) < 2:
        return list(coords)
    waypoints = _select_waypoints(coords)
    try:
        line_json = _snap_cached(json.dumps(waypoints))
        line = [tuple(p) for p in json.loads(line_json)]
    except Exception:  # noqa: BLE001 — 네트워크/파싱 실패는 조용히 폴백
        return list(coords)
    if len(line) < 2:
        return list(coords)
    return line
