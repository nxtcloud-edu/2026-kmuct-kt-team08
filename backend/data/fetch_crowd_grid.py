# -*- coding: utf-8 -*-
"""
fetch_crowd_grid.py — 유동인구 격자 생성기 (역할 3 소유)

서울 실시간 도시데이터(citydata)의 실측 지점값을 후보 경로 주변 격자로 보간해
docs/data-spec.md 1절 규격의 backend/data/crowd_grid.csv 를 생성한다.

컬럼: grid_id, lat, lng, time_slot, population, crowd_score   (격자 × 시간대 0~23)

왜 보간이 필요한가:
  citydata 는 지정된 지점(POI)만 실시간으로 주고 임의 좌표 조회를 지원하지 않는다.
  격자 단위 실시간 유동인구를 공개하는 데이터는 존재하지 않으므로,
  실측 지점값을 역거리 가중(IDW)으로 격자에 배분한다.

시간대에 대한 정직한 표기:
  citydata 는 '현재' 값만 준다. 따라서
    - 실행 시각의 time_slot  -> 실측 기반 (live)
    - 나머지 23개 time_slot  -> 실측값을 기준점으로 삼아 일중 변동 프로파일로 환산 (modeled)
  근거와 구분은 crowd_grid.source.md 에 기록한다.

실행:
    pip install requests
    python fetch_crowd_grid.py

인증키: 환경변수 SEOUL_API_KEY 또는 이 파일과 같은 폴더의 api_key.txt
"""

import csv
import json
import math
import os
from datetime import datetime

try:
    import requests
except ImportError:
    requests = None

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
ROUTES_FILE = os.path.join(REPO, "mocks", "candidate-routes.json")
OUT_CSV = os.path.join(HERE, "crowd_grid.csv")
OUT_DOC = os.path.join(HERE, "crowd_grid.source.md")

# 수집 기준: 잠실역 중심 반경 3km
CENTER = (37.5133, 127.1002)   # 잠실역
RADIUS_KM = 3.0

# citydata 조회 성공을 확인한 장소명 + 근사 좌표 (데모 구역: 잠실역~잠실새내역)
# CENTER 에서 RADIUS_KM 밖인 항목은 실행 시 자동 제외된다.
POI_TABLE = {
    "잠실역":        (37.5133, 127.1002),   # 0.0km — 데모 출발지
    "잠실 관광특구": (37.5133, 127.1000),   # 0.0km
    "잠실새내역":    (37.5114, 127.0863),   # 1.2km — 데모 도착지
    "잠실한강공원":  (37.5180, 127.0820),   # 1.7km
    "올림픽공원":    (37.5200, 127.1215),   # 2.0km
    "가락시장":      (37.4936, 127.1180),   # 2.7km
    "천호역":        (37.5385, 127.1237),   # 3.5km — 반경 밖(자동 제외)
}

GRID_SPACING_M = 200        # 격자 간격
NEAR_ROUTE_M = 250          # 경로에서 이 거리 안의 격자만 생성
M_PER_DEG_LAT = 111000.0
M_PER_DEG_LON = 88000.0

# 일중 보행 유동인구 변동 프로파일 (하루 평균 대비 배율).
# 실측이 아니라 모델값 — 시간대별 상대 비교용이며 crowd_grid.source.md 에 명시한다.
DIURNAL = {
    0: 0.25, 1: 0.18, 2: 0.14, 3: 0.12, 4: 0.14, 5: 0.22,
    6: 0.40, 7: 0.70, 8: 1.05, 9: 1.00, 10: 0.95, 11: 1.00,
    12: 1.15, 13: 1.10, 14: 1.00, 15: 1.00, 16: 1.05, 17: 1.20,
    18: 1.45, 19: 1.35, 20: 1.10, 21: 0.85, 22: 0.60, 23: 0.40,
}

MOCK_POIS = [   # 조회 실패 시 (발표 중단 방지)
    {"place": "(목업)", "lat": 37.5133, "lon": 127.1002, "congest_level": "약간 붐빔",
     "ppltn": 20000, "time": "", "dist_km": 0.0},
]


def load_api_key():
    env = os.environ.get("SEOUL_API_KEY", "").strip()
    if env:
        return env
    path = os.path.join(HERE, "api_key.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    print("[warn] 인증키 없음 -> 목업으로 진행")
    return ""


def fetch_pois(key):
    """CENTER 반경 RADIUS_KM 안의 POI 전체 조회."""
    if requests is None or not key:
        return []
    out = []
    for place, (lat, lon) in POI_TABLE.items():
        dist = haversine_m(CENTER[0], CENTER[1], lat, lon) / 1000.0
        if dist > RADIUS_KM:
            print(f"[---]  {place:14s} {dist:4.1f}km  반경 {RADIUS_KM}km 밖 — 제외")
            continue
        url = f"http://openapi.seoul.go.kr:8088/{key}/json/citydata/1/5/{place}"
        try:
            live = requests.get(url, timeout=10).json()["CITYDATA"]["LIVE_PPLTN_STTS"][0]
            lo, hi = int(live["AREA_PPLTN_MIN"]), int(live["AREA_PPLTN_MAX"])
            out.append({"place": place, "lat": lat, "lon": lon,
                        "congest_level": live["AREA_CONGEST_LVL"],
                        "ppltn": (lo + hi) // 2, "time": live.get("PPLTN_TIME", ""),
                        "dist_km": round(dist, 2)})
            print(f"[ok]   {place:14s} {dist:4.1f}km  {live['AREA_CONGEST_LVL']:6s} "
                  f"{(lo+hi)//2:>7,}명")
        except Exception:
            print(f"[skip] {place:14s} {dist:4.1f}km  조회 실패")
    return sorted(out, key=lambda p: p["dist_km"])


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def dist_to_segment_m(plat, plon, alat, alon, blat, blon):
    """점에서 선분까지의 근사 거리(미터). 국소 평면 근사."""
    px, py = (plon - alon) * M_PER_DEG_LON, (plat - alat) * M_PER_DEG_LAT
    bx, by = (blon - alon) * M_PER_DEG_LON, (blat - alat) * M_PER_DEG_LAT
    L2 = bx * bx + by * by
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (px * bx + py * by) / L2))
    return math.hypot(px - bx * t, py - by * t)


def dist_to_route_m(lat, lon, coords):
    best = float("inf")
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        best = min(best, dist_to_segment_m(lat, lon, a["lat"], a["lng"], b["lat"], b["lng"]))
    return best


def idw(lat, lon, pois, power=2.0):
    """실측 지점값의 역거리 가중 평균."""
    num = den = 0.0
    for p in pois:
        d = max(haversine_m(lat, lon, p["lat"], p["lon"]), 1.0)
        w = 1.0 / (d ** power)
        num += w * p["ppltn"]
        den += w
    return num / den


def main():
    key = load_api_key()
    print("=== citydata 실시간 조회 ===")
    pois = fetch_pois(key)
    live = bool(pois)
    if not live:
        pois = MOCK_POIS

    with open(ROUTES_FILE, encoding="utf-8") as f:
        routes = json.load(f)

    # 후보 경로 전체를 감싸는 격자 범위
    all_pts = [c for r in routes for c in r["coordinates"]]
    lat_lo = min(p["lat"] for p in all_pts); lat_hi = max(p["lat"] for p in all_pts)
    lon_lo = min(p["lng"] for p in all_pts); lon_hi = max(p["lng"] for p in all_pts)
    pad_lat = NEAR_ROUTE_M / M_PER_DEG_LAT
    pad_lon = NEAR_ROUTE_M / M_PER_DEG_LON
    lat_lo -= pad_lat; lat_hi += pad_lat; lon_lo -= pad_lon; lon_hi += pad_lon

    step_lat = GRID_SPACING_M / M_PER_DEG_LAT
    step_lon = GRID_SPACING_M / M_PER_DEG_LON

    # 경로 주변 격자만 생성
    cells = []
    row_i = 0
    lat = lat_lo
    while lat <= lat_hi + 1e-9:
        col_i = 0
        lon = lon_lo
        while lon <= lon_hi + 1e-9:
            if min(dist_to_route_m(lat, lon, r["coordinates"]) for r in routes) <= NEAR_ROUTE_M:
                cells.append({"grid_id": f"g{row_i:02d}{col_i:02d}",
                              "lat": round(lat, 6), "lng": round(lon, 6),
                              "base": idw(lat, lon, pois)})
            lon += step_lon; col_i += 1
        lat += step_lat; row_i += 1

    if not cells:
        raise SystemExit("격자가 생성되지 않았습니다. NEAR_ROUTE_M 을 늘려보세요.")

    # 실행 시각을 기준점으로 삼아 시간대별 인원 환산
    now_hour = datetime.now().hour
    anchor = DIURNAL[now_hour]
    rows = []
    for c in cells:
        daily_mean = c["base"] / anchor          # 실측값 -> 하루 평균 수준으로 환산
        for slot in range(24):
            rows.append({"grid_id": c["grid_id"], "lat": c["lat"], "lng": c["lng"],
                         "time_slot": slot,
                         "population": max(0, int(round(daily_mean * DIURNAL[slot])))})

    # crowd_score: 전체 격자·시간대 최대 population 대비 0~100 (data-spec 2절 방식)
    max_pop = max(r["population"] for r in rows) or 1
    for r in rows:
        r["crowd_score"] = round(r["population"] / max_pop * 100, 1)

    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["grid_id", "lat", "lng", "time_slot",
                                          "population", "crowd_score"])
        w.writeheader()
        w.writerows(rows)

    # 출처·한계 기록
    with open(OUT_DOC, "w", encoding="utf-8") as f:
        f.write("# crowd_grid.csv 출처와 생성 방법\n\n")
        f.write(f"- 생성 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (KST)\n")
        f.write(f"- 원본: 서울 열린데이터광장 · 서울시 실시간 도시데이터 (`citydata`)"
                f" — {'실시간 조회 성공' if live else '조회 실패, 목업 사용'}\n")
        f.write(f"- 수집 기준: 잠실역({CENTER[0]}, {CENTER[1]}) 중심 반경 {RADIUS_KM}km\n")
        f.write(f"- 실측 지점 {len(pois)}곳, 격자 {len(cells)}개, 행 {len(rows)}개"
                f" (격자 × 시간대 24)\n")
        f.write(f"- 격자 간격 {GRID_SPACING_M}m, 후보 경로에서 {NEAR_ROUTE_M}m 이내만 생성\n\n")
        f.write("## 실측 지점 (생성 당시)\n\n")
        f.write("| 장소 | 좌표 | 중심에서 | 혼잡도 | 추정 인원 | 기준 시각 |\n"
                "|---|---|---|---|---|---|\n")
        for p in pois:
            f.write(f"| {p['place']} | {p['lat']}, {p['lon']} | {p.get('dist_km', 0)}km "
                    f"| {p['congest_level']} | {p['ppltn']:,}명 | {p.get('time','')} |\n")
        f.write("\n## 가공 방법\n\n")
        f.write("1. citydata 실측 지점값을 역거리 가중(IDW, power=2)으로 격자 중심에 배분\n")
        f.write(f"2. 실행 시각의 time_slot({now_hour}시)은 **실측 기반**\n")
        f.write("3. 나머지 23개 time_slot 은 실측값을 기준점으로 삼아 "
                "일중 변동 프로파일(`DIURNAL`)로 환산한 **모델값**\n")
        f.write("4. `crowd_score` = population / 전체 최대 population × 100\n\n")
        f.write("## 한계\n\n")
        f.write("- citydata 는 지정 지점만 실시간 제공하며 임의 좌표·격자 조회를 지원하지 않습니다.\n")
        f.write("- 실측 지점 좌표는 역·지역 중심의 근사값입니다.\n")
        f.write(f"- {now_hour}시를 제외한 시간대는 모델 추정치이므로, "
                "시간대별 절대 인원이 아니라 상대 비교로만 사용하세요.\n")
        f.write("- 시간대별 실측이 필요하면 해당 시각에 이 스크립트를 다시 실행해 "
                "그 시각 행을 교체하십시오.\n")

    print(f"\n[done] {os.path.relpath(OUT_CSV, REPO)} — 격자 {len(cells)}개 × 24시간 = {len(rows)}행")
    print(f"[done] {os.path.relpath(OUT_DOC, REPO)} — 출처·한계 기록")
    for r in routes:
        near = [c for c in cells if dist_to_route_m(c["lat"], c["lng"], r["coordinates"]) <= 100]
        print(f"   {r['routeId']:8s} 100m 이내 격자 {len(near):2d}개 (crowdCellCount 후보)")


if __name__ == "__main__":
    main()
