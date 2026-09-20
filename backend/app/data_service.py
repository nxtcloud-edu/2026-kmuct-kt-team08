"""역할 3 — 원본 CSV를 경로별 RouteMetrics 로 집계한다.

규칙은 docs/data-spec.md 2~3절을 따르되, 실데이터 밀도에 맞춰 반경을 조정했다:
  - 유동인구 격자(생활인구, 250m 간격) → 반경 180m
  - S-DoT 센서(소음·조도, 범위 안 18개) → 반경 400m, 거리 역가중 평균
  - 가로등 점 데이터는 30m, 그늘(가로수)은 30m 그대로
조도는 가로등 밀도와 S-DoT 실측 lux 중 큰 값을 쓴다.

데이터 위치: backend/data/*.csv      출처 표기: backend/data/sources.json
파일이 없으면 "missing", 헤더만 있으면 "데이터 없음"(정상)으로 본다.
"""

from __future__ import annotations

import csv
import json
import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from statistics import mean
from typing import Dict, List, Optional, Sequence, Tuple, Type, TypeVar

from pydantic import BaseModel, ValidationError

from .data_models import (
    CrowdGridRow,
    EventRow,
    LightingRow,
    NoiseRow,
    ShadeRow,
    StoreZoneRow,
    StreetlightRow,
    StreetlightSegmentRow,
)
from .geo import GridIndex, LatLng, haversine_m, point_to_polyline_m, within_m
from .schemas import Coordinate, RouteMetrics

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

NEAR_M = 30.0  # 점 데이터(가로등·그늘) 판정 반경
AREA_M = 100.0  # 행사·상권 판정 반경
CROWD_RADIUS_M = 180.0  # 생활인구 격자(250m 간격)를 최소 1개는 잡는 반경
# 상권은 "구역" 단위 데이터라 점포 수천 개짜리 상권이 중심점 하나로만 들어온다.
# 실제 구역은 수백 m 에 걸쳐 있으므로 중심점 기준 반경을 넓게 잡는다.
STORE_RADIUS_M = 300.0
SENSOR_RADIUS_M = 400.0  # S-DoT 센서 탐색 반경 (역가중 평균)
LIGHTS_PER_100M_FULL = 4.0  # 100m당 가로등 4개 = 100점
LUX_FULL = 50.0  # 야간 실측 조도 50 lux = 100점 (log 스케일)
SHADE_SPACING_M = 15.0  # 가로수 presence 데이터(점수 100 고정)라 15m마다 한 그루를 완전 커버로 본다
MISSING_SCORE = 50.0
QUIET_DEFAULT = 80.0  # 주변 소음원이 없을 때
NIGHT_HOURS = set(range(20, 24)) | set(range(0, 6))
KST = timezone(timedelta(hours=9))

FILES = {
    "streetlights": ("streetlights.csv", StreetlightRow),
    "streetlight_segments": ("streetlight_segments.csv", StreetlightSegmentRow),
    "lighting": ("lighting.csv", LightingRow),
    "shade": ("shade.csv", ShadeRow),
    "noise": ("noise.csv", NoiseRow),
    "crowd_grid": ("crowd_grid.csv", CrowdGridRow),
    "events": ("events.csv", EventRow),
    "store_zones": ("store_zones.csv", StoreZoneRow),
}

RowT = TypeVar("RowT", bound=BaseModel)


# ---------------------------------------------------------------- 로딩


@lru_cache(maxsize=1)
def _manifest() -> Dict[str, str]:
    path = DATA_DIR / "sources.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _load_rows(name: str, model: Type[RowT]) -> Optional[List[RowT]]:
    """CSV → 행 모델 목록. 파일이 없으면 None(결측), 헤더만 있으면 [] (데이터 없음)."""
    path = DATA_DIR / name
    if not path.exists():
        return None
    rows: List[RowT] = []
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for raw in csv.DictReader(fh):
            try:
                rows.append(model.model_validate(raw))
            except ValidationError:
                continue
    return rows


@lru_cache(maxsize=1)
def _dataset() -> Dict[str, Optional[list]]:
    return {key: _load_rows(fname, model) for key, (fname, model) in FILES.items()}


@lru_cache(maxsize=1)
def _indexes() -> Dict[str, Optional[GridIndex]]:
    d = _dataset()
    return {key: GridIndex([(r.lat, r.lng) for r in d[key]]) if d[key] else None for key in FILES}


SENSOR_FILES = {"noise": ("occurred_at", "noise_level_db"), "lighting": ("measured_at", "illuminance_lux")}


@lru_cache(maxsize=1)
def _sensor_tables() -> Dict[str, Tuple[List[LatLng], List[Dict[int, float]], Optional[GridIndex]]]:
    """S-DoT 센서를 (위치 × 시간대) 평균표로 집계. 7천 행 → 센서 18개 × 24시간.

    반환: key → (센서 위치 목록, 위치별 {hour: 평균값}, 위치 색인)
    """
    d = _dataset()
    out = {}
    for key, (time_attr, value_attr) in SENSOR_FILES.items():
        acc: Dict[LatLng, Dict[int, List[float]]] = {}
        for r in d[key] or []:
            try:
                h = parse_departure(getattr(r, time_attr)).hour
            except ValueError:
                continue
            acc.setdefault((r.lat, r.lng), {}).setdefault(h, []).append(getattr(r, value_attr))
        points = list(acc)
        table = [{h: mean(v) for h, v in acc[p].items()} for p in points]
        out[key] = (points, table, GridIndex(points) if points else None)
    return out


def _sensor_at(key: str, hour: int, p: LatLng, radius: float) -> Optional[float]:
    """p 주변 radius 안 센서들의 hour±1 평균값을 거리 역가중으로 합친다."""
    points, table, index = _sensor_tables()[key]
    if index is None:
        return None
    vals = []
    for i in index.query(p, radius):
        vs = [table[i][h] for h in ((hour - 1) % 24, hour, (hour + 1) % 24) if h in table[i]]
        if vs:
            vals.append((mean(vs), haversine_m(p, points[i])))
    return _idw(vals)


def _sensor_along(key: str, hour: int, line: List[LatLng], radius: float) -> Tuple[Optional[float], int]:
    """폴리라인에서 radius 안 센서들 (값, 센서 수)."""
    points, table, _ = _sensor_tables()[key]
    vals = []
    for i, pt in enumerate(points):
        dd = point_to_polyline_m(pt, line)
        if dd > radius:
            continue
        vs = [table[i][h] for h in ((hour - 1) % 24, hour, (hour + 1) % 24) if h in table[i]]
        if vs:
            vals.append((mean(vs), dd))
    return _idw(vals), len(vals)


def reload() -> None:
    """CSV를 바꾼 뒤 서버 재시작 없이 다시 읽고 싶을 때."""
    for f in (_manifest, _dataset, _indexes, _sensor_tables):
        f.cache_clear()


def source_of(key: str) -> str:
    if _dataset().get(key) is None:
        return "missing"
    return _manifest().get(key, "unknown")


def metric_sources() -> Dict[str, str]:
    """응답의 metricSources. 키는 api-spec.md 규격(crowd/lighting/quiet/shade/event/store)."""
    lighting = [s for s in (source_of("streetlights"), source_of("lighting")) if s != "missing"]
    return {
        "crowd": source_of("crowd_grid"),
        "lighting": "+".join(lighting) if lighting else source_of("streetlight_segments"),
        "quiet": source_of("noise"),
        "shade": source_of("shade"),
        "event": source_of("events"),
        "store": source_of("store_zones"),
    }


def is_mock(sources: Dict[str, str]) -> bool:
    return any(v in ("mock", "missing") for v in sources.values())


def data_status() -> Dict[str, dict]:
    return {key: {"rows": len(rows) if rows else 0, "source": source_of(key)} for key, rows in _dataset().items()}


# ---------------------------------------------------------------- 시각


def parse_departure(text: str) -> datetime:
    """ISO 8601(+오프셋). 오프셋이 없으면 KST로 간주."""
    dt = datetime.fromisoformat(text)
    return dt if dt.tzinfo else dt.replace(tzinfo=KST)


def _hour_diff(a: int, b: int) -> int:
    d = abs(a - b) % 24
    return min(d, 24 - d)


# ---------------------------------------------------------------- 공통 계산


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _line(coords: Sequence[Coordinate]) -> List[LatLng]:
    return [(c.lat, c.lng) for c in coords]


def _near(rows: Optional[list], line: List[LatLng], radius: float) -> list:
    if not rows:
        return []
    return [rows[i] for i in within_m([(r.lat, r.lng) for r in rows], line, radius)]


def _idw(values: List[Tuple[float, float]]) -> Optional[float]:
    """[(값, 거리m)] 의 거리 역가중 평균."""
    if not values:
        return None
    ws = [(v, 1.0 / (d + 20.0)) for v, d in values]
    return sum(v * w for v, w in ws) / sum(w for _, w in ws)


def _lux_score(lux: float) -> float:
    return _clamp(100.0 * math.log10(1 + max(0.0, lux)) / math.log10(1 + LUX_FULL))


def _density_score(count: int, length_m: float) -> float:
    per100 = count / (length_m / 100.0) if length_m > 0 else 0.0
    return min(100.0, per100 / LIGHTS_PER_100M_FULL * 100.0)


def _active_events(departure: datetime) -> List[LatLng]:
    out = []
    for ev in _dataset()["events"] or []:
        ok = ev.is_active
        if not ok:
            try:
                ok = parse_departure(ev.start_time) <= departure <= parse_departure(ev.end_time)
            except ValueError:
                ok = False
        if ok:
            out.append((ev.lat, ev.lng))
    return out


# ---------------------------------------------------------------- 경로 단위 집계


def _lighting(line: List[LatLng], distance_m: float, departure: datetime, store_total: int) -> Tuple[float, int]:
    d = _dataset()
    count = 0
    density = None
    if d["streetlights"] is not None:
        count = len(_near(d["streetlights"], line, NEAR_M))
        density = _density_score(count, distance_m)
    elif d["streetlight_segments"]:
        count = sum(
            seg.streetlight_count
            for seg in d["streetlight_segments"]
            if point_to_polyline_m((seg.start_lat, seg.start_lng), line) <= NEAR_M
            and point_to_polyline_m((seg.end_lat, seg.end_lng), line) <= NEAR_M
        )
        density = _density_score(count, distance_m)

    lux, _ = _sensor_along("lighting", departure.hour, line, SENSOR_RADIUS_M)
    candidates = [s for s in (density, _lux_score(lux) if lux is not None else None) if s is not None]
    if not candidates:
        return MISSING_SCORE, 0
    score = max(candidates)
    if departure.hour in NIGHT_HOURS and store_total >= 30:
        score = min(100.0, score + 10.0)
    return round(score, 1), count


def _crowd(line: List[LatLng], departure: datetime) -> Tuple[float, int, int]:
    d = _dataset()
    active = sum(1 for e in _active_events(departure) if point_to_polyline_m(e, line) <= AREA_M)
    if d["crowd_grid"] is None:
        return MISSING_SCORE, 0, active
    cells = [r for r in _near(d["crowd_grid"], line, CROWD_RADIUS_M) if r.time_slot == departure.hour]
    if not cells:
        return MISSING_SCORE, 0, active
    return round(_clamp(mean(r.crowd_score for r in cells) + 20.0 * active), 1), len(cells), active


def _quiet(line: List[LatLng], departure: datetime) -> Tuple[float, int]:
    if _dataset()["noise"] is None:
        return MISSING_SCORE, 0
    db, n_sensors = _sensor_along("noise", departure.hour, line, SENSOR_RADIUS_M)
    if db is None:
        return QUIET_DEFAULT, 0
    return round(_clamp(100.0 - (db - 40.0) * 2.5), 1), n_sensors


def _shade(line: List[LatLng], distance_m: float) -> Tuple[float, int]:
    d = _dataset()
    if d["shade"] is None:
        return MISSING_SCORE, 0
    spots = _near(d["shade"], line, NEAR_M)
    if not spots:
        return 0.0, 0
    coverage = min(1.0, len(spots) / max(1.0, distance_m / SHADE_SPACING_M))
    return round(coverage * mean(s.shade_score for s in spots), 1), len(spots)


def _stores(line: List[LatLng]) -> int:
    return sum(z.store_count for z in _near(_dataset()["store_zones"], line, STORE_RADIUS_M))


def compute_metrics(coords: Sequence[Coordinate], distance_m: float, departure: datetime) -> RouteMetrics:
    line = _line(coords)
    store_total = _stores(line)
    lighting, light_count = _lighting(line, distance_m, departure, store_total)
    crowd, cell_count, active_events = _crowd(line, departure)
    quiet, noise_count = _quiet(line, departure)
    shade, shade_count = _shade(line, distance_m)
    return RouteMetrics(
        crowdScore=crowd,
        lightingScore=lighting,
        quietScore=quiet,
        shadeScore=shade,
        streetlightCount=light_count,
        shadeSpotCount=shade_count,
        noiseSourceCount=noise_count,
        crowdCellCount=cell_count,
        activeEventCount=active_events,
        storeCount=store_total,
    )


# ---------------------------------------------------------------- 점 단위 특징 (경로·선분 공용)
#
# 길찾기 비용(선분)과 경로 점수가 같은 공식을 쓰도록 여기 하나로 모았다.
# 따로 계산하면 "밝은 길을 골랐는데 경로 조도 점수는 더 낮다" 같은 모순이 생긴다.

EDGE_RADIUS_M = 50.0
SAMPLE_SPACING_M = 50.0  # 경로를 이 간격으로 샘플링해 평균낸다


class EdgeFeatures:
    __slots__ = ("lighting", "crowd", "quiet", "shade", "event_near")

    def __init__(self, lighting: float, crowd: float, quiet: float, shade: float, event_near: bool):
        self.lighting, self.crowd, self.quiet, self.shade, self.event_near = lighting, crowd, quiet, shade, event_near


class _Ctx:
    """한 시각에 대해 한 번만 준비하는 조회 맥락."""

    __slots__ = ("d", "ix", "hour", "night", "events")

    def __init__(self, departure: datetime):
        self.d = _dataset()
        self.ix = _indexes()
        self.hour = departure.hour
        self.night = self.hour in NIGHT_HOURS
        self.events = _active_events(departure)


def _features_at(p: LatLng, c: _Ctx) -> EdgeFeatures:
    """한 점 주변의 0~100 지표. docs/data-spec.md 2절을 원형 반경으로 적용."""
    d, ix = c.d, c.ix
    circle_100m = (2 * EDGE_RADIUS_M) / 100.0

    # 조도 = max(가로등 밀도, 실측 lux), 야간 상권 보정 +10
    scores = []
    if ix["streetlights"] is not None:
        n = len(ix["streetlights"].query(p, EDGE_RADIUS_M))
        scores.append(min(100.0, n / circle_100m / LIGHTS_PER_100M_FULL * 100.0))
    lux = _sensor_at("lighting", c.hour, p, SENSOR_RADIUS_M)
    if lux is not None:
        scores.append(_lux_score(lux))
    lighting = max(scores) if scores else MISSING_SCORE
    if scores and c.night and ix["store_zones"] is not None:
        if sum(d["store_zones"][i].store_count for i in ix["store_zones"].query(p, STORE_RADIUS_M)) >= 30:
            lighting = min(100.0, lighting + 10.0)

    # 혼잡 = 해당 시간대 격자 평균, 진행 중 행사 +20
    event_near = any(haversine_m(p, e) <= AREA_M for e in c.events)
    if ix["crowd_grid"] is not None:
        cells = [d["crowd_grid"][i] for i in ix["crowd_grid"].query(p, CROWD_RADIUS_M)
                 if d["crowd_grid"][i].time_slot == c.hour]
        crowd = _clamp(mean(x.crowd_score for x in cells) + (20.0 if event_near else 0.0)) if cells else MISSING_SCORE
    else:
        crowd = MISSING_SCORE

    # 조용함 = 40dB→100점, 80dB→0점
    db = _sensor_at("noise", c.hour, p, SENSOR_RADIUS_M)
    quiet = _clamp(100.0 - (db - 40.0) * 2.5) if db is not None else (
        QUIET_DEFAULT if d["noise"] is not None else MISSING_SCORE)

    # 그늘 = 커버리지 × 평균 그늘 점수
    if ix["shade"] is not None:
        spots = [d["shade"][i] for i in ix["shade"].query(p, EDGE_RADIUS_M)]
        shade = (min(1.0, len(spots) / (2 * EDGE_RADIUS_M / SHADE_SPACING_M))
                 * mean(s.shade_score for s in spots)) if spots else 0.0
    else:
        shade = MISSING_SCORE

    return EdgeFeatures(lighting, crowd, quiet, shade, event_near)


def edge_features(midpoints: Sequence[LatLng], departure: datetime) -> List[EdgeFeatures]:
    """선분 중점 목록 → 선분별 특징 (길찾기 비용용)."""
    c = _Ctx(departure)
    return [_features_at(p, c) for p in midpoints]


def _sample_along(line: Sequence[LatLng], spacing: float) -> List[LatLng]:
    """폴리라인을 일정 간격으로 찍은 점들. 시작·끝은 항상 포함."""
    if len(line) < 2:
        return list(line)
    pts = [line[0]]
    carry = 0.0
    for a, b in zip(line, line[1:]):
        seg = haversine_m(a, b)
        if seg <= 0:
            continue
        t = spacing - carry
        while t < seg:
            f = t / seg
            pts.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            t += spacing
        carry = (carry + seg) % spacing
    pts.append(line[-1])
    return pts


__all__ = ["compute_metrics", "edge_features", "EdgeFeatures", "metric_sources", "is_mock", "data_status", "parse_departure", "reload", "DATA_DIR"]
