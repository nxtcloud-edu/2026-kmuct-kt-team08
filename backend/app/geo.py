"""좌표 계산 공용 유틸 (역할 3·4 공용).

모든 거리는 m, 좌표는 WGS84 lat/lng. 외부 패키지 없이 haversine과
등거리 근사(로컬 평면 투영)만 사용한다. 1~2km 규모 도보 경로에는 충분하다.
"""

from __future__ import annotations

import math
from typing import Iterable, List, Sequence, Tuple

EARTH_RADIUS_M = 6_371_000.0

LatLng = Tuple[float, float]


def haversine_m(a: LatLng, b: LatLng) -> float:
    """두 점 사이 대원거리(m)."""
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def _to_xy(p: LatLng, ref_lat: float) -> Tuple[float, float]:
    """기준 위도 주변의 로컬 평면 좌표(m). 짧은 거리의 점-선분 거리 계산용."""
    x = math.radians(p[1]) * EARTH_RADIUS_M * math.cos(math.radians(ref_lat))
    y = math.radians(p[0]) * EARTH_RADIUS_M
    return x, y


def point_to_segment_m(p: LatLng, a: LatLng, b: LatLng) -> float:
    """점 p에서 선분 a-b까지의 최단거리(m)."""
    ref = (a[0] + b[0]) / 2
    px, py = _to_xy(p, ref)
    ax, ay = _to_xy(a, ref)
    bx, by = _to_xy(b, ref)
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def point_to_polyline_m(p: LatLng, line: Sequence[LatLng]) -> float:
    """점 p에서 폴리라인까지의 최단거리(m). 점이 하나뿐이면 그 점까지의 거리."""
    if len(line) == 1:
        return haversine_m(p, line[0])
    return min(point_to_segment_m(p, line[i], line[i + 1]) for i in range(len(line) - 1))


def polyline_length_m(line: Sequence[LatLng]) -> float:
    return sum(haversine_m(line[i], line[i + 1]) for i in range(len(line) - 1))


def bbox_of(line: Sequence[LatLng], pad_m: float) -> Tuple[float, float, float, float]:
    """폴리라인을 pad_m 만큼 넓힌 경계 상자 (min_lat, min_lng, max_lat, max_lng). 근접 후보 거르기용."""
    lats = [p[0] for p in line]
    lngs = [p[1] for p in line]
    dlat = pad_m / 111_320.0
    dlng = pad_m / (111_320.0 * math.cos(math.radians(sum(lats) / len(lats))))
    return min(lats) - dlat, min(lngs) - dlng, max(lats) + dlat, max(lngs) + dlng


class GridIndex:
    """점 집합의 격자 색인. 반경 질의를 전체 스캔 없이 처리한다 (선분 6천 개 × 점 수천 개용)."""

    def __init__(self, points: Sequence[LatLng], cell_m: float = 100.0):
        self.points = list(points)
        self.cell_lat = cell_m / 111_320.0
        ref_lat = sum(p[0] for p in self.points) / len(self.points) if self.points else 37.5
        self.cell_lng = cell_m / (111_320.0 * math.cos(math.radians(ref_lat)))
        self.cells: dict = {}
        for i, (lat, lng) in enumerate(self.points):
            self.cells.setdefault(self._cell(lat, lng), []).append(i)

    def _cell(self, lat: float, lng: float) -> Tuple[int, int]:
        return int(math.floor(lat / self.cell_lat)), int(math.floor(lng / self.cell_lng))

    def query(self, p: LatLng, radius_m: float) -> List[int]:
        """p에서 radius_m 이내 점들의 인덱스."""
        if not self.points:
            return []
        span_lat = int(math.ceil(radius_m / 111_320.0 / self.cell_lat)) + 1
        span_lng = int(math.ceil(radius_m / (111_320.0 * math.cos(math.radians(p[0]))) / self.cell_lng)) + 1
        c0, c1 = self._cell(p[0], p[1])
        out: List[int] = []
        for a in range(c0 - span_lat, c0 + span_lat + 1):
            for b in range(c1 - span_lng, c1 + span_lng + 1):
                for i in self.cells.get((a, b), ()):
                    if haversine_m(p, self.points[i]) <= radius_m:
                        out.append(i)
        return out


def within_m(points: Iterable[LatLng], line: Sequence[LatLng], radius_m: float) -> List[int]:
    """폴리라인에서 radius_m 이내인 점들의 인덱스. bbox로 1차 필터 후 정확 계산."""
    min_lat, min_lng, max_lat, max_lng = bbox_of(line, radius_m)
    hits: List[int] = []
    for i, p in enumerate(points):
        if not (min_lat <= p[0] <= max_lat and min_lng <= p[1] <= max_lng):
            continue
        if point_to_polyline_m(p, line) <= radius_m:
            hits.append(i)
    return hits
