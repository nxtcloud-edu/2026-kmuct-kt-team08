"""서울 S-DoT 실시간 환경정보(sDoTEnv) → noise.csv / lighting.csv 갱신 (역할 3 소유).

- 잠실역 반경 3km 안의 센서만 사용한다. 센서 좌표는 API에 없으므로
  backend/data/sdot_sensors.csv (sensor_id, lat, lng) 로 조인한다.
- 평균 소음(AVG_NOISE) → noise.csv 의 noise_level_db
- 평균 조도(AVG_INTE_ILLU) → lighting.csv 의 illuminance_lux
- 같은 센서·같은 시각에 DATA_NO=1, 2 가 모두 있으면 DATA_NO=2 를 쓴다.
- 기본은 기존 CSV 에 병합(같은 id 는 새 값으로 교체). --replace 면 새로 쓴다.

API 키는 SEOUL_OPENAPI_KEY 환경변수(.env)에서 읽는다. 코드나 Git 에 넣지 않는다.

사용법 (backend 디렉터리에서):
    python scripts/fetch_sdot_env.py                 # 최근 48시간, 최대 80페이지(8만 행)
    python scripts/fetch_sdot_env.py --hours 6 --max-pages 20
    python scripts/fetch_sdot_env.py --replace       # 기존 CSV 를 버리고 새로 생성
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
SENSORS_CSV = DATA_DIR / "sdot_sensors.csv"
NOISE_CSV = DATA_DIR / "noise.csv"
LIGHTING_CSV = DATA_DIR / "lighting.csv"

SERVICE = "sDoTEnv"
BASE_URL = "http://openapi.seoul.go.kr:8088"
PAGE_SIZE = 1000
KST = timezone(timedelta(hours=9))
CENTER = (37.5133, 127.1002)  # 잠실역
RADIUS_KM = 3.0


def haversine_km(a, b):
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def load_env_key() -> str:
    key = os.getenv("SEOUL_OPENAPI_KEY", "").strip()
    if not key:
        # backend/.env 또는 저장소 루트 .env
        for env_path in (BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"):
            if env_path.exists():
                for line in env_path.read_text(encoding="utf-8").splitlines():
                    if line.startswith("SEOUL_OPENAPI_KEY="):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("SEOUL_OPENAPI_KEY 환경변수가 없습니다. .env 에 SEOUL_OPENAPI_KEY=... 를 넣어 주세요.")
    return key


def load_sensors() -> dict[str, tuple[float, float]]:
    if not SENSORS_CSV.exists():
        sys.exit(f"{SENSORS_CSV} 가 없습니다. 센서 좌표표가 필요합니다.")
    out = {}
    with SENSORS_CSV.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            p = (float(row["lat"]), float(row["lng"]))
            if haversine_km(p, CENTER) <= RADIUS_KM:
                out[row["sensor_id"]] = p
    return out


def parse_sensing_time(text: str) -> datetime | None:
    # "2026-09-20_13:07:00"
    try:
        return datetime.strptime(text, "%Y-%m-%d_%H:%M:%S").replace(tzinfo=KST)
    except ValueError:
        return None


def fetch_rows(key: str, hours: float, max_pages: int, sensors: dict) -> dict[tuple[str, str], dict]:
    """(SERIAL, SENSING_TIME) → row. DATA_NO 가 큰 것을 남긴다. 오래된 페이지에 닿으면 멈춘다."""
    cutoff = datetime.now(KST) - timedelta(hours=hours)
    picked: dict[tuple[str, str], dict] = {}
    stale_pages = 0
    with httpx.Client(timeout=60) as client:
        for page in range(max_pages):
            start, end = page * PAGE_SIZE + 1, (page + 1) * PAGE_SIZE
            url = f"{BASE_URL}/{key}/json/{SERVICE}/{start}/{end}/"
            body = client.get(url).json()
            if SERVICE not in body:
                sys.exit(f"API 오류: {body}")
            rows = body[SERVICE].get("row", [])
            if not rows:
                break
            newest_in_page = None
            for r in rows:
                t = parse_sensing_time(r.get("SENSING_TIME", ""))
                if t is None:
                    continue
                newest_in_page = t if newest_in_page is None else max(newest_in_page, t)
                if t < cutoff or r.get("SERIAL") not in sensors:
                    continue
                k = (r["SERIAL"], r["SENSING_TIME"])
                data_no = int(r.get("DATA_NO") or 1)
                if k not in picked or data_no > int(picked[k].get("DATA_NO") or 1):
                    picked[k] = r
            print(f"  page {page + 1}: {len(rows)}행, 누적 {len(picked)}건 (페이지 최신 {newest_in_page})", flush=True)
            # 응답이 최신순이므로 한 페이지 전체가 기준 시각보다 오래되면 두 페이지 더 보고 멈춘다
            if newest_in_page is not None and newest_in_page < cutoff:
                stale_pages += 1
                if stale_pages >= 2:
                    break
    return picked


def read_existing(path: Path, id_field: str) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return {row[id_field]: row for row in csv.DictReader(fh)}


def write_csv(path: Path, header: list[str], rows: dict[str, dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        for row in rows.values():
            w.writerow(row)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=48, help="이 시간 이내 측정치만")
    ap.add_argument("--max-pages", type=int, default=80, help="최대 페이지 수 (1000행/페이지)")
    ap.add_argument("--replace", action="store_true", help="기존 noise.csv/lighting.csv 를 버리고 새로 생성")
    args = ap.parse_args()

    key = load_env_key()
    sensors = load_sensors()
    print(f"센서 좌표표: 반경 {RADIUS_KM}km 안 {len(sensors)}개")
    print("S-DoT 환경정보 수집 중…")
    picked = fetch_rows(key, args.hours, args.max_pages, sensors)
    print(f"수집: {len(picked)}건 (센서·시각 기준, DATA_NO 큰 값 우선)")

    noise = {} if args.replace else read_existing(NOISE_CSV, "noise_id")
    lighting = {} if args.replace else read_existing(LIGHTING_CSV, "sensor_id")
    # lighting.csv 의 sensor_id 는 센서 ID 만이라 시각별로 여러 행이 같은 id 를 갖는다.
    # 병합 키는 (sensor_id, measured_at) 로 잡는다.
    lighting_keyed = {(r["sensor_id"], r["measured_at"]): r for r in lighting.values()} if lighting else {}
    if not args.replace and LIGHTING_CSV.exists():
        with LIGHTING_CSV.open(encoding="utf-8-sig", newline="") as fh:
            lighting_keyed = {(r["sensor_id"], r["measured_at"]): r for r in csv.DictReader(fh)}

    added_noise = added_light = 0
    for (serial, sensing), r in picked.items():
        lat, lng = sensors[serial]
        iso = parse_sensing_time(sensing).isoformat()
        if r.get("AVG_NOISE") not in (None, ""):
            nid = f"{serial}_{iso}"
            if nid not in noise:
                added_noise += 1
            noise[nid] = {"noise_id": nid, "lat": lat, "lng": lng, "noise_level_db": float(r["AVG_NOISE"]),
                          "occurred_at": iso, "noise_type": "environment"}
        if r.get("AVG_INTE_ILLU") not in (None, ""):
            lk = (serial, iso)
            if lk not in lighting_keyed:
                added_light += 1
            lighting_keyed[lk] = {"sensor_id": serial, "lat": lat, "lng": lng,
                                  "illuminance_lux": float(r["AVG_INTE_ILLU"]), "measured_at": iso}

    write_csv(NOISE_CSV, ["noise_id", "lat", "lng", "noise_level_db", "occurred_at", "noise_type"], noise)
    write_csv(LIGHTING_CSV, ["sensor_id", "lat", "lng", "illuminance_lux", "measured_at"],
              {f"{k[0]}|{k[1]}": v for k, v in lighting_keyed.items()})
    print(f"noise.csv: {len(noise)}행 (+{added_noise})   lighting.csv: {len(lighting_keyed)}행 (+{added_light})")


if __name__ == "__main__":
    main()
