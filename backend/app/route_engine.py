"""역할 4 — 후보 경로 생성, Hard Constraint, 점수, 순위.

경로 생성은 외부 길찾기 API를 쓰지 않는다. backend/data/map/walk_graph.json(OSM 보행
네트워크를 한 번 내려받아 저장한 것) 위에서 Dijkstra + 벌점 반복으로 서로 다른 후보 3개를
만든다. 후보마다 역할 3의 data_service 로 RouteMetrics 를 붙인다.

USE_MOCK_DATA=true 이거나 그래프 파일이 없으면 mocks/candidate-routes.json 을 그대로 쓴다.
"""

from __future__ import annotations

import heapq
import json
import math
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from . import data_service
from . import road_snap
from .geo import LatLng, haversine_m, point_to_polyline_m, within_m
from .schemas import (
    CandidateRoute,
    Coordinate,
    CrowdDirection,
    PreferenceProfile,
    RouteRequest,
    ScoredRoute,
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
MOCKS_DIR = BACKEND_DIR.parent / "mocks"
GRAPH_PATH = data_service.DATA_DIR / "map" / "walk_graph.json"

WALK_SPEED_M_PER_MIN = 75.0  # 4.5 km/h
STEPS_MINUTES_PER_EDGE = 0.3  # 계단 구간 하나당 추가 시간
CANDIDATE_COUNT = 3
MAX_DETOUR_RATIO = 1.8  # 최단 대비 이 배수를 넘는 후보는 버린다
MAX_OVERLAP = 0.6  # 기존 후보 corridor 안을 지나는 길이 비율 상한. 출발·도착역이 같은 대로 위라 앞뒤 40%는 늘 겹친다
CORRIDOR_M = 70.0  # 대로 양쪽 인도(송파대로 폭 ≈ 50~60m)를 "같은 길"로 묶는 폭
EDGE_PENALTY = 1.5  # 직전 경로 근처 엣지의 비용 배수 (반복마다 누적)
PENALTY_CAP = 5.0  # 누적 벌점 상한 — 없으면 몇 번 만에 우회율이 폭주한다
MAX_ITERATIONS = 40
MAX_SNAP_M = 600.0  # 입력 위치가 그래프 노드에서 이보다 멀면 서비스 지역 밖으로 본다

# 데모용 장소 사전. 지오코딩 API 대신 사용한다. "lat,lng" 문자열도 받는다.
PLACES: Dict[str, LatLng] = {
    "잠실역": (37.5133, 127.1001),
    "잠실": (37.5133, 127.1001),
    "석촌역": (37.5055, 127.1067),
    "석촌": (37.5055, 127.1067),
    "롯데월드타워": (37.5126, 127.1026),
    "롯데월드몰": (37.5126, 127.1026),
    "롯데월드": (37.5111, 127.0982),
    "석촌호수": (37.5089, 127.1035),
    "석촌호수동호": (37.5093, 127.1063),
    "석촌호수서호": (37.5085, 127.1003),
    "잠실새내역": (37.5116, 127.0863),
    "송파나루역": (37.5107, 127.1123),
    "삼전역": (37.5045, 127.0912),
}


class DataUnavailableError(RuntimeError):
    """후보 경로 데이터를 만들 수 없을 때 (503)."""


class UnknownPlaceError(ValueError):
    """장소 이름을 좌표로 바꾸지 못했을 때 (400)."""


class OutOfServiceAreaError(ValueError):
    """입력 위치가 보행망 그래프(서비스 지역) 밖일 때 (400)."""


# ---------------------------------------------------------------- 그래프


class WalkGraph:
    def __init__(self, raw: dict):
        self.nodes: Dict[int, LatLng] = {int(k): (v[0], v[1]) for k, v in raw["nodes"].items()}
        self.adj: Dict[int, List[Tuple[int, float, bool]]] = {n: [] for n in self.nodes}
        self.edge_len: Dict[Tuple[int, int], float] = {}
        self.edge_steps: Dict[Tuple[int, int], bool] = {}
        for u, v, length, _highway, steps in raw["edges"]:
            key = (u, v) if u < v else (v, u)
            self.edge_len[key] = float(length)
            self.edge_steps[key] = bool(steps)
            self.adj[u].append((v, float(length), bool(steps)))
            self.adj[v].append((u, float(length), bool(steps)))
        self.source = raw.get("source", "")
        # 엣지 중점 — 기존 후보 근처 엣지를 찾을 때(공간 다양성) 쓴다
        self.edge_keys: List[Tuple[int, int]] = list(self.edge_len)
        self.edge_mid: List[LatLng] = [
            ((self.nodes[u][0] + self.nodes[v][0]) / 2, (self.nodes[u][1] + self.nodes[v][1]) / 2)
            for u, v in self.edge_keys
        ]

    def edges_near(self, path: Sequence[int], radius_m: float) -> List[Tuple[int, int]]:
        line = [self.nodes[n] for n in path]
        return [self.edge_keys[i] for i in within_m(self.edge_mid, line, radius_m)]

    @staticmethod
    def key(u: int, v: int) -> Tuple[int, int]:
        return (u, v) if u < v else (v, u)

    def nearest_node(self, p: LatLng, max_snap_m: Optional[float] = None) -> int:
        # 1만 노드 선형 탐색 — 요청당 2번이라 충분히 빠르다
        n = min(self.nodes, key=lambda n: haversine_m(p, self.nodes[n]))
        if max_snap_m is not None and haversine_m(p, self.nodes[n]) > max_snap_m:
            raise OutOfServiceAreaError(
                "입력 위치가 서비스 지역(잠실~석촌 일대)에서 너무 멀리 떨어져 있습니다."
            )
        return n

    def dijkstra(self, s: int, t: int, cost: Callable[[int, int, float], float]) -> Optional[List[int]]:
        dist = {s: 0.0}
        prev: Dict[int, int] = {}
        heap = [(0.0, s)]
        done = set()
        while heap:
            d, u = heapq.heappop(heap)
            if u in done:
                continue
            if u == t:
                break
            done.add(u)
            for v, length, _steps in self.adj[u]:
                nd = d + cost(u, v, length)
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))
        if t not in dist:
            return None
        path = [t]
        while path[-1] != s:
            path.append(prev[path[-1]])
        path.reverse()
        return path

    def path_length(self, path: Sequence[int]) -> float:
        return sum(self.edge_len[self.key(a, b)] for a, b in zip(path, path[1:]))

    def path_steps(self, path: Sequence[int]) -> int:
        return sum(1 for a, b in zip(path, path[1:]) if self.edge_steps[self.key(a, b)])


@lru_cache(maxsize=1)
def _graph() -> Optional[WalkGraph]:
    if not GRAPH_PATH.exists():
        return None
    return WalkGraph(json.loads(GRAPH_PATH.read_text(encoding="utf-8")))


def graph_available() -> bool:
    return _graph() is not None


# ---------------------------------------------------------------- 장소


_COORD_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


def geocode(text: str) -> LatLng:
    m = _COORD_RE.match(text)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            return lat, lng
    key = re.sub(r"\s+", "", text)
    if key in PLACES:
        return PLACES[key]
    for name, coord in PLACES.items():
        if name in key or key in name:
            return coord
    raise UnknownPlaceError(
        f"'{text}'의 위치를 모릅니다. 사용 가능: {', '.join(sorted(set(PLACES)))} 또는 'lat,lng'"
    )


# ---------------------------------------------------------------- 후보 생성


def _corridor_ratio(g: WalkGraph, path: Sequence[int], other: Sequence[int]) -> float:
    """path 길이 중 other 폴리라인에서 CORRIDOR_M 이내를 지나는 비율. 나란한 인도도 잡는다."""
    other_line = [g.nodes[n] for n in other]
    near = 0.0
    for a, b in zip(path, path[1:]):
        mid = ((g.nodes[a][0] + g.nodes[b][0]) / 2, (g.nodes[a][1] + g.nodes[b][1]) / 2)
        if point_to_polyline_m(mid, other_line) <= CORRIDOR_M:
            near += g.edge_len[g.key(a, b)]
    return near / max(1.0, g.path_length(path))


@lru_cache(maxsize=64)
def _cached_paths(s: int, t: int) -> Tuple[Tuple[int, ...], ...]:
    g = _graph()
    assert g is not None
    return tuple(tuple(p) for p in generate_diverse_paths(g, s, t))


def generate_diverse_paths(g: WalkGraph, s: int, t: int, k: int = CANDIDATE_COUNT) -> List[List[int]]:
    """최단 경로 + 벌점 반복으로 공간적으로 다른 경로 k개. 최단이 항상 첫 번째.

    이미 뽑힌 경로 '근처'(CORRIDOR_M) 엣지에 벌점을 누적해 다시 Dijkstra 를 돌리고,
    새 경로가 기존 후보 corridor 안을 MAX_OVERLAP 비율 넘게 지나면 버린다.
    """
    shortest = g.dijkstra(s, t, lambda u, v, length: length)
    if shortest is None:
        return []
    paths = [shortest]
    base_len = g.path_length(shortest)
    penalty: Dict[Tuple[int, int], float] = {}
    last = shortest
    for _ in range(MAX_ITERATIONS):
        if len(paths) >= k:
            break
        for key in g.edges_near(last, CORRIDOR_M):
            penalty[key] = min(PENALTY_CAP, penalty.get(key, 1.0) * EDGE_PENALTY)
        cand = g.dijkstra(s, t, lambda u, v, length: length * penalty.get(g.key(u, v), 1.0))
        if cand is None:
            break
        last = cand
        if g.path_length(cand) > base_len * MAX_DETOUR_RATIO:
            continue
        if any(_corridor_ratio(g, cand, p) > MAX_OVERLAP for p in paths):
            continue
        paths.append(cand)
    return paths


def _duration_min(distance_m: float, steps_edges: int) -> int:
    return max(1, math.ceil(distance_m / WALK_SPEED_M_PER_MIN + steps_edges * STEPS_MINUTES_PER_EDGE))


def _route_id(index: int) -> str:
    return f"route-{chr(ord('a') + index)}"


def _name_candidates(routes: List[CandidateRoute]) -> None:
    """최단 경로 대비 가장 두드러진 장점으로 이름을 붙인다."""
    if not routes:
        return
    routes[0].name = "최단 경로"
    base = routes[0].metrics
    used = {"최단 경로"}
    for route in routes[1:]:
        m = route.metrics
        gains = {
            "밝은 길": m.lightingScore - base.lightingScore,
            "한적한 길": base.crowdScore - m.crowdScore,
            "조용한 길": m.quietScore - base.quietScore,
            "그늘 많은 길": m.shadeScore - base.shadeScore,
        }
        label, gain = max(gains.items(), key=lambda kv: kv[1])
        name = label if gain >= 5 else "우회 경로"
        if name in used:
            name = f"{name} {sum(1 for u in used if u.startswith(name)) + 1}"
        used.add(name)
        route.name = name


# ---------------------------------------------------------------- 선호 반영 길찾기

PREFERENCE_LAMBDA = 2.0  # 선호 벌점 강도. 1.0 이면 "지표 0점인 선분은 길이가 2배로 보인다"
LAMBDA_SHRINK = 0.6  # maxExtraMinutes 를 넘으면 이 비율로 줄여 다시 찾는다
THRESHOLD_PENALTY = 3.0  # minLightingScore / minQuietScore 미달 선분의 비용 배수
LAMBDA_ROUNDS = 6


def _hour_key(departure) -> str:
    return departure.replace(minute=0, second=0, microsecond=0).isoformat()


@lru_cache(maxsize=24)
def _edge_feature_map(hour_key: str) -> Dict[Tuple[int, int], data_service.EdgeFeatures]:
    """시간대별 선분 특징. 첫 계산 1~2초, 이후 캐시."""
    g = _graph()
    assert g is not None
    feats = data_service.edge_features(g.edge_mid, data_service.parse_departure(hour_key))
    return dict(zip(g.edge_keys, feats))


def _preference_cost(g: WalkGraph, profile: PreferenceProfile, feats, lam: float, enforce_blocks: bool):
    w = profile.preferences
    hc = profile.hardConstraints
    non_distance = w.crowdWeight + w.lightingWeight + w.quietWeight + w.shadeWeight

    def cost(u: int, v: int, length: float) -> float:
        key = g.key(u, v)
        f = feats[key]
        if enforce_blocks and ((hc.avoidStairs and g.edge_steps[key]) or (hc.avoidActiveEvents and f.event_near)):
            return math.inf
        # 조도·조용함 최소 기준 미달 선분은 막지 않고 3배 벌점 (역 주변이 전부 미달이면 길이 없어지므로)
        threshold_penalty = 1.0
        if hc.minLightingScore is not None and f.lighting < hc.minLightingScore:
            threshold_penalty *= THRESHOLD_PENALTY
        if hc.minQuietScore is not None and f.quiet < hc.minQuietScore:
            threshold_penalty *= THRESHOLD_PENALTY
        if non_distance <= 0:
            return length * threshold_penalty
        crowd_u = _crowd_utility(f.crowd, w.crowdDirection)
        penalty = (
            w.lightingWeight * (1 - f.lighting / 100)
            + w.crowdWeight * (1 - crowd_u / 100)
            + w.quietWeight * (1 - f.quiet / 100)
            + w.shadeWeight * (1 - f.shade / 100)
        ) / non_distance
        return length * (1 + lam * penalty) * threshold_penalty

    return cost


def _personalized_path(g: WalkGraph, s: int, t: int, profile: PreferenceProfile, feats, shortest_len: float):
    """선호 비용으로 찾은 길. maxExtraMinutes 를 넘으면 λ를 줄여가며 다시 찾는다."""
    hc = profile.hardConstraints
    limit = None
    if hc.maxExtraMinutes is not None:
        limit = shortest_len + hc.maxExtraMinutes * WALK_SPEED_M_PER_MIN
    lam = PREFERENCE_LAMBDA
    best = None
    for _ in range(LAMBDA_ROUNDS):
        path = g.dijkstra(s, t, _preference_cost(g, profile, feats, lam, enforce_blocks=True))
        if path is None:  # 차단(계단·행사) 때문에 길이 없음 → 차단 없이 찾고 경로 단계 Hard Constraint 에 맡긴다
            path = g.dijkstra(s, t, _preference_cost(g, profile, feats, lam, enforce_blocks=False))
            if path is None:
                return None
        best = path
        if limit is None or g.path_length(path) <= limit:
            return path
        lam *= LAMBDA_SHRINK
    return best


@lru_cache(maxsize=64)
def _cached_pref_paths(s: int, t: int, profile_json: str, hour_key: str) -> Tuple[Tuple[str, Tuple[int, ...]], ...]:
    """(이름, 경로) 목록. 최단 → 맞춤 → 대안 순."""
    g = _graph()
    assert g is not None
    profile = PreferenceProfile.model_validate_json(profile_json)
    feats = _edge_feature_map(hour_key)

    shortest = g.dijkstra(s, t, lambda u, v, length: length)
    if shortest is None:
        return ()
    base_len = g.path_length(shortest)
    personalized = _personalized_path(g, s, t, profile, feats, base_len) or shortest

    if personalized == shortest:
        named = [("최단·맞춤 경로", shortest)]
    else:
        named = [("최단 경로", shortest), ("맞춤 경로", personalized)]

    # 대안: 맞춤 경로 corridor 에 벌점을 주고 같은 선호 비용으로 다시 찾는다
    penalty: Dict[Tuple[int, int], float] = {}
    last = personalized
    pref_cost = _preference_cost(g, profile, feats, PREFERENCE_LAMBDA * LAMBDA_SHRINK, enforce_blocks=False)
    for _ in range(MAX_ITERATIONS):
        if len(named) >= CANDIDATE_COUNT:
            break
        for key in g.edges_near(last, CORRIDOR_M):
            penalty[key] = min(PENALTY_CAP, penalty.get(key, 1.0) * EDGE_PENALTY)
        cand = g.dijkstra(s, t, lambda u, v, length: pref_cost(u, v, length) * penalty.get(g.key(u, v), 1.0))
        if cand is None:
            break
        last = cand
        if g.path_length(cand) > base_len * MAX_DETOUR_RATIO:
            continue
        if any(_corridor_ratio(g, cand, p) > MAX_OVERLAP for _, p in named):
            continue
        named.append(("대안 경로", cand))
    return tuple((name, tuple(p)) for name, p in named)


def _use_mock() -> bool:
    return os.getenv("USE_MOCK_DATA", "").strip().lower() in ("1", "true", "yes")


def _load_mock_candidates() -> List[CandidateRoute]:
    path = MOCKS_DIR / "candidate-routes.json"
    if not path.exists():
        raise DataUnavailableError(f"candidate routes not found: {path}")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return [CandidateRoute.model_validate(item) for item in raw]
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise DataUnavailableError(str(exc)) from exc


def candidates_are_mock() -> bool:
    return _use_mock() or not graph_available()


def candidate_sources() -> Dict[str, str]:
    """응답의 metricSources. mock 후보를 쓰면 전부 'mock'."""
    if candidates_are_mock():
        return {k: "mock" for k in ("crowd", "lighting", "quiet", "shade", "event", "store")}
    return data_service.metric_sources()


def load_candidate_routes(
    request: RouteRequest, profile: Optional[PreferenceProfile] = None
) -> List[CandidateRoute]:
    """계약 함수. 그래프 위에서 후보를 만들고 역할 3 지표를 붙인다.

    profile 이 있으면 선호를 길찾기 비용에 넣어 '맞춤 경로'를 만든다. 없으면 선호 무관 후보.
    """
    if candidates_are_mock():
        return _load_mock_candidates()

    g = _graph()
    assert g is not None
    departure = data_service.parse_departure(request.departureTime)
    start = g.nearest_node(geocode(request.start), MAX_SNAP_M)
    end = g.nearest_node(geocode(request.end), MAX_SNAP_M)
    if start == end:
        raise UnknownPlaceError("출발지와 도착지가 같은 지점입니다.")

    if profile is None:
        named = [("", list(p)) for p in _cached_paths(start, end)]
    else:
        named = [(n, list(p)) for n, p in _cached_pref_paths(start, end, profile.model_dump_json(), _hour_key(departure))]
    if not named:
        raise DataUnavailableError("보행 네트워크에서 출발지와 도착지를 잇는 경로를 찾지 못했습니다.")

    routes: List[CandidateRoute] = []
    for i, (name, path) in enumerate(named):
        node_coords = [(g.nodes[n][0], g.nodes[n][1]) for n in path]
        distance = g.path_length(path)
        steps = g.path_steps(path)
        # 표시용 좌표만 실제 도로 지오메트리로 스냅한다. 거리·계단·지표는
        # 원본 그래프 경로(node_coords, distance)를 그대로 쓰므로 점수는 불변.
        display = road_snap.snap_to_roads(node_coords)
        coords = [Coordinate(lat=lat, lng=lng) for lat, lng in display]
        routes.append(
            CandidateRoute(
                routeId=_route_id(i),
                name=name,
                durationMin=_duration_min(distance, steps),
                distanceM=max(1, int(round(distance))),
                hasStairs=steps > 0,
                coordinates=coords,
                metrics=data_service.compute_metrics(
                    [Coordinate(lat=lat, lng=lng) for lat, lng in node_coords],
                    distance,
                    departure,
                ),
            )
        )
    if profile is None:
        _name_candidates(routes)
    return routes


# ---------------------------------------------------------------- Hard Constraint


def apply_hard_constraints(
    routes: List[CandidateRoute], profile: PreferenceProfile
) -> List[ScoredRoute]:
    """위반 경로를 rejected=True 로 표시한다. 응답에서 빼지 않는다."""
    if not routes:
        return []

    shortest_duration = min(route.durationMin for route in routes)
    constraints = profile.hardConstraints
    result: List[ScoredRoute] = []

    for route in routes:
        extra_minutes = route.durationMin - shortest_duration
        reasons: List[str] = []

        if constraints.maxExtraMinutes is not None and extra_minutes > constraints.maxExtraMinutes:
            reasons.append(
                f"우회 시간 {extra_minutes}분이 허용 기준 {constraints.maxExtraMinutes}분을 초과합니다."
            )
        if (
            constraints.minLightingScore is not None
            and route.metrics.lightingScore < constraints.minLightingScore
        ):
            reasons.append(
                f"조도 점수 {route.metrics.lightingScore:g}점이 요구 기준 "
                f"{constraints.minLightingScore:g}점 미만입니다."
            )
        if (
            constraints.minQuietScore is not None
            and route.metrics.quietScore < constraints.minQuietScore
        ):
            reasons.append(
                f"조용함 점수 {route.metrics.quietScore:g}점이 요구 기준 "
                f"{constraints.minQuietScore:g}점 미만입니다."
            )
        if constraints.avoidStairs and route.hasStairs:
            reasons.append("계단이 포함되어 있습니다.")
        if constraints.avoidActiveEvents and route.metrics.activeEventCount >= 1:
            reasons.append(f"진행 중인 행사 {route.metrics.activeEventCount}건이 있습니다.")

        result.append(
            ScoredRoute(
                **route.model_dump(),
                rank=1,
                extraMinutes=extra_minutes,
                matchScore=0,
                rejected=bool(reasons),
                rejectionReasons=reasons,
                recommendationReasons=[],
            )
        )

    return result


# ---------------------------------------------------------------- 점수·순위


def _crowd_utility(score: float, direction: CrowdDirection) -> float:
    if direction == CrowdDirection.MORE:
        return score
    if direction == CrowdDirection.LESS:
        return 100 - score
    return 50


def _recommendation_reasons(route: ScoredRoute, profile: PreferenceProfile) -> List[str]:
    m = route.metrics
    w = profile.preferences
    crowd = _crowd_utility(m.crowdScore, w.crowdDirection)
    reasons = [
        f"혼잡 선호 충족도 {crowd:.0f}% (가중치 {w.crowdWeight * 100:.0f}%, 혼잡도 {m.crowdScore:g}점).",
        f"밝기 {m.lightingScore:g}점 (가중치 {w.lightingWeight * 100:.0f}%, 가로등 {m.streetlightCount}개).",
        f"조용함 {m.quietScore:g}점 (가중치 {w.quietWeight * 100:.0f}%, 소음원 {m.noiseSourceCount}곳).",
    ]
    if w.shadeWeight > 0:
        reasons.append(f"그늘 {m.shadeScore:g}점 (가중치 {w.shadeWeight * 100:.0f}%, 그늘 {m.shadeSpotCount}곳).")
    if m.activeEventCount:
        reasons.append(f"진행 중 행사 {m.activeEventCount}건이 근처에 있습니다.")
    if m.storeCount:
        reasons.append(f"주변 상가 {m.storeCount}곳.")
    return reasons


def score_and_rank_routes(
    routes: List[ScoredRoute], profile: PreferenceProfile
) -> List[ScoredRoute]:
    """통과 경로 점수 → 정렬 → 제외 경로 뒤에 붙이고 rank 부여 (scoring-spec 2~3절)."""
    passed = [route for route in routes if not route.rejected]
    rejected = [route for route in routes if route.rejected]

    distances = [route.distanceM for route in passed]
    min_distance = min(distances) if distances else 0
    max_distance = max(distances) if distances else 0
    distance_range = max_distance - min_distance
    weights = profile.preferences

    for route in passed:
        distance_utility = (
            50
            if distance_range == 0
            else 100 * (max_distance - route.distanceM) / distance_range
        )
        score = (
            _crowd_utility(route.metrics.crowdScore, weights.crowdDirection) * weights.crowdWeight
            + route.metrics.lightingScore * weights.lightingWeight
            + distance_utility * weights.distanceWeight
            + route.metrics.quietScore * weights.quietWeight
            + route.metrics.shadeScore * weights.shadeWeight
        )
        route.matchScore = round(score, 2)
        route.recommendationReasons = _recommendation_reasons(route, profile)

    passed.sort(key=lambda route: (-route.matchScore, route.durationMin))
    rejected.sort(key=lambda route: route.extraMinutes)
    ordered = passed + rejected
    for rank, route in enumerate(ordered, start=1):
        route.rank = rank
    return ordered


def build_recommendation_summary(
    routes: List[ScoredRoute], profile: PreferenceProfile
) -> str:
    if not routes:
        return "추천할 수 있는 경로가 없습니다."
    top = routes[0]
    if top.rejected:
        return f"모든 후보가 조건을 위반하여 가장 가까운 대안인 '{top.name}'(을)를 제시합니다: {' '.join(top.rejectionReasons)}"
    shortest = next((r for r in routes if r.extraMinutes == 0), None)
    detour = "최단 경로이며" if top.extraMinutes == 0 else f"최단 경로보다 {top.extraMinutes}분 더 걸리지만"
    why = ""
    if shortest is not None and shortest is not top:
        m, b = top.metrics, shortest.metrics
        diffs = []
        if profile.preferences.crowdDirection == CrowdDirection.LESS and b.crowdScore > m.crowdScore:
            diffs.append(f"유동인구가 약 {(b.crowdScore - m.crowdScore) / max(1, b.crowdScore) * 100:.0f}% 낮고")
        if profile.preferences.crowdDirection == CrowdDirection.MORE and m.crowdScore > b.crowdScore:
            diffs.append("사람이 더 있고")
        if m.lightingScore > b.lightingScore + 5:
            diffs.append(f"조도가 {b.lightingScore:g}→{m.lightingScore:g}점으로 높고")
        if m.quietScore > b.quietScore + 5:
            diffs.append("더 조용하고")
        if diffs:
            why = " " + " ".join(diffs)
    rejected = [r for r in routes if r.rejected]
    tail = f" {len(rejected)}개 경로는 조건 미달로 제외했습니다." if rejected else ""
    return f"{detour}{why} 선호에 가장 잘 맞는 '{top.name}' 추천 (충족도 {top.matchScore:g}%).{tail}"
