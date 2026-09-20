# 원본 데이터 규격과 정규화

역할 3이 소유합니다. 원본 데이터는 `backend/data/` 아래 CSV로 두고, 한 행은 `backend/app/data_models.py`의 모델 하나에 대응합니다. `data_service.py`는 이 CSV들을 읽어 후보 경로마다 `RouteMetrics`를 만듭니다.

Frontend·AI·Backend 담당은 이 문서를 몰라도 됩니다. 이들이 보는 것은 `RouteMetrics`뿐입니다.

## 1. 파일과 컬럼

| 데이터 종류 | 파일 | 컬럼 | 행 모델 |
|---|---|---|---|
| 가로등 | `streetlights.csv` | `streetlight_id, lat, lng` | `StreetlightRow` |
| 가로등 개수 | `streetlight_segments.csv` | `segment_id, start_lat, start_lng, end_lat, end_lng, streetlight_count` | `StreetlightSegmentRow` |
| 그늘 정보 | `shade.csv` | `shade_id, lat, lng, shade_type, shade_score` | `ShadeRow` |
| 교통·공사·상권 소음 | `noise.csv` | `noise_id, lat, lng, noise_level_db, occurred_at, noise_type` | `NoiseRow` |
| 유동인구(혼잡도) | `crowd_grid.csv` | `grid_id, lat, lng, time_slot, population, crowd_score` | `CrowdGridRow` |
| 행사 | `events.csv` | `event_id, lat, lng, start_time, end_time, is_active, expected_attendance` | `EventRow` |
| 상권 위치 | `store_zones.csv` | `zone_id, lat, lng, zone_type, store_count` | `StoreZoneRow` |

실데이터 추가 파일 (역할 3):

| 파일 | 내용 | 갱신 방법 |
|---|---|---|
| `lighting.csv` | S-DoT 실측 조도 `sensor_id, lat, lng, illuminance_lux, measured_at` | `python scripts/fetch_sdot_env.py` |
| `sdot_sensors.csv` | S-DoT 센서 좌표표 `sensor_id, lat, lng` (API 에 좌표가 없어 조인용) | 수동 |
| `sources.json` | 파일별 출처명. `"mock"`/파일 없음이면 응답 `isMockData=true` | 수동 |
| `crowd_grid.source.md`, `fetch_crowd_grid.py`, `poi_catalog.csv` | 유동인구 격자 출처와 생성기 | `python data/fetch_crowd_grid.py` |

`fetch_sdot_env.py` 는 `SEOUL_OPENAPI_KEY` 환경변수(.env)를 쓰며 잠실역 3km 안 센서만 남기고, 같은 센서·시각의 `DATA_NO=1,2` 중 2를 택해 `noise.csv`(평균 소음)와 `lighting.csv`(평균 조도)에 병합한다.

집계 반경은 실데이터 밀도에 맞춰 `data_service.py` 에서 조정했다: 생활인구 격자(250m 간격) 180m, S-DoT 센서(범위 안 18개) 400m 거리 역가중, 조도 = max(가로등 밀도, 실측 lux·log 스케일 50 lux=100점).

공통 규칙:

- 인코딩 UTF-8, 헤더 1행, 좌표 WGS84
- 시각은 ISO 8601 + 시간대 오프셋 (`2026-09-19T18:30:00+09:00`)
- `shade_type`: `tree` / `building` / `canopy`
- `noise_type`: `traffic` / `construction` / `commercial`
- `zone_type`: `restaurant` / `retail` / `entertainment` / `mixed`
- `crowd_grid.csv`는 격자 × 시간대(0~23)마다 한 행. 원본에 `crowd_score`가 없으면 역할 3이 아래 2절 방식으로 채워 넣습니다.
- 파일이 없거나 비어 있으면 그 지표는 결측 처리(3절)하고 `metricSources`에 `"missing"`을 기록합니다.

## 2. 경로 지표 집계

### 공통: 경로 주변 판정

경로 폴리라인에서 **30m 이내**에 있는 점을 그 경로의 데이터로 봅니다. 행사·유동인구 격자는 면적이 있으므로 **100m 이내**로 넓힙니다. 거리는 haversine으로 계산합니다.

`per100m(n) = n / (distanceM / 100)` — 경로 길이 100m당 개수.

### lightingScore — 가로등

1. `streetlights.csv`가 있으면 30m 이내 가로등 수를 셉니다 → `streetlightCount`
2. 없으면 `streetlight_segments.csv`에서 경로와 겹치는 구간의 `streetlight_count` 합
3. `lightingScore = min(100, per100m(streetlightCount) / 4 × 100)` — 100m당 4개를 만점으로 봅니다. 상한 4는 실데이터 분포를 보고 역할 3이 조정할 수 있으나 세 후보에 같은 값을 써야 합니다.
4. 야간 보정: 출발 시각이 20시~05시이고 100m 이내 상권의 `store_count` 합이 30 이상이면 `+10` (상가 조명). 상한 100.

### crowdScore — 유동인구 + 행사

1. 출발 시각의 `hour`와 같은 `time_slot`인 격자 중 100m 이내 → `crowdCellCount`
2. 그 격자들의 `crowd_score` 평균이 기본값. 원본에 `crowd_score`가 없으면 `population`을 **세 후보 전체 격자의 최대 population** 대비 비율로 0~100 변환
3. 행사 보정: 100m 이내에 진행 중인 행사(`is_active` 또는 `start_time ≤ 출발 시각 ≤ end_time`)가 있으면 행사 1건당 `+20`, 상한 100 → `activeEventCount`
4. 해당 시간대 격자가 하나도 없으면 결측

### quietScore — 소음

1. 30m 이내 소음원 중 `occurred_at`의 hour가 출발 시각 ±1시간인 것 → `noiseSourceCount`
2. 그 소음원들의 `noise_level_db` 평균을 40dB→100점, 80dB→0점으로 선형 변환
   `quietScore = clamp(100 − (mean_db − 40) × 2.5, 0, 100)`
3. 해당 소음원이 없으면 `80` (기본적으로 조용함). 결측이 아니라 정상값입니다.

### shadeScore — 그늘

1. 30m 이내 그늘 지점 → `shadeSpotCount`
2. `coverage = min(1, shadeSpotCount / (distanceM / 50))` — 50m마다 그늘 하나면 완전 커버
3. `shadeScore = coverage × mean(shade_score)`
4. 그늘 지점이 없으면 `0` (결측이 아니라 "그늘 없음")

### storeCount — 상권

100m 이내 상권의 `store_count` 합. 점수에는 lightingScore 야간 보정으로만 반영하고, 카드에는 근거 문구("상가 63곳")로 표시합니다.

## 3. 결측 처리

| 상황 | 값 | `metricSources` |
|---|---|---|
| 파일 없음 / 빈 파일 | 점수 `50`, 개수 `0` | `"missing"` |
| 파일은 있으나 경로 주변에 데이터 없음 | 위 2절의 지표별 기본값 | 실데이터 출처명 그대로 |
| mock JSON 사용 | mock 값 | `"mock"` |

`metricSources` 예:

```json
{
  "crowd": "mock",
  "lighting": "seoul-open-data-streetlight-2025",
  "quiet": "missing",
  "shade": "kmu-survey-2026",
  "event": "seoul-event-api",
  "store": "seoul-commercial-2025"
}
```

하나라도 `"mock"` 또는 `"missing"`이면 응답의 `isMockData = true`.

## 4. Hard Constraint에 쓰이는 데이터

- `avoidActiveEvents = true` → `activeEventCount ≥ 1`인 경로 제외
- `minLightingScore`, `minQuietScore` → 위 점수와 직접 비교
- `avoidStairs` → 후보 경로의 `hasStairs` (역할 3이 경로 정의 시 지정)

## 5. 하루 프로젝트에서의 우선순위

1. `crowd_grid.csv` + `streetlights.csv` — 두 시연 사례가 이 둘로 결정됩니다
2. `noise.csv` — quietScore
3. `events.csv` — avoidActiveEvents 시연용. 최단 경로 위에 진행 중 행사 1건만 있으면 충분
4. `shade.csv`, `store_zones.csv` — 있으면 반영, 없으면 결측 처리로 진행
5. `streetlight_segments.csv` — `streetlights.csv`가 있으면 불필요
