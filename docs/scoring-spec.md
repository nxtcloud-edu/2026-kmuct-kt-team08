# 경로 선택 규격

원본 데이터(가로등·그늘·소음·유동인구·행사·상권)를 `RouteMetrics`로 바꾸는 규칙은 `docs/data-spec.md`에 있습니다. 이 문서는 `RouteMetrics`가 만들어진 다음의 규칙입니다.

## 0. 용어

- **최단 경로**: 전체 후보 중 `durationMin`이 가장 작은 경로
- `extraMinutes = durationMin − 최단 경로의 durationMin`

`extraMinutes`는 **Hard Constraint 적용 전**, 전체 후보 기준으로 계산합니다. 그래야 `maxExtraMinutes`를 평가할 수 있습니다.

## 1. Hard Constraint

점수 계산 전에 적용합니다.

- `maxExtraMinutes`: `extraMinutes`가 이 값보다 크면 제외
- `minLightingScore`: `lightingScore`가 기준 미만이면 제외
- `minQuietScore`: `quietScore`가 기준 미만이면 제외
- `avoidStairs`: true인데 `hasStairs`가 true면 제외
- `avoidActiveEvents`: true인데 `activeEventCount ≥ 1`이면 제외

제외된 경로의 처리:

- `rejected = true`, `rejectionReasons`에 위반 항목을 사람이 읽을 문장으로 기록합니다. 여러 항목을 위반하면 모두 기록합니다.
- `matchScore = 0`
- 응답에서 빼지 않고 통과 경로 뒤에 배치합니다 (3절 참고).
- 모든 후보가 제외될 경우에도 Backend는 제약을 몰래 완화하지 않습니다. 세 경로를 모두 `rejected=true`로 반환하고 화면에 이유를 표시합니다. 이때 가장 가까운 대안(`extraMinutes`가 가장 작은 경로)이 rank 1이 됩니다.

## 2. Preference 점수

통과 경로에만 적용합니다. 모든 지표는 0~100입니다.

유동인구 효용:

- crowdDirection=more: `crowdUtility = crowdScore`
- crowdDirection=less: `crowdUtility = 100 - crowdScore`
- crowdDirection=neutral: `crowdUtility = 50`

거리 효용:

```text
distanceUtility = 100 × (최대 거리 - 해당 거리) / (최대 거리 - 최소 거리)
```

- 최대·최소 거리의 모수는 **Hard Constraint를 통과한 경로만**입니다. 제외된 경로는 포함하지 않습니다.
- 통과 경로가 1개이거나 통과 경로의 거리가 모두 같으면(분모 0) `distanceUtility = 50`으로 둡니다.

최종 점수:

```text
matchScore =
  crowdUtility × crowdWeight
  + lightingScore × lightingWeight
  + distanceUtility × distanceWeight
  + quietScore × quietWeight
  + shadeScore × shadeWeight
```

소수 둘째 자리까지 반올림합니다 (예: `63.25`).

## 3. 순위

1. 통과 경로를 `matchScore` 내림차순으로 정렬합니다. 동점이면 `durationMin` 오름차순.
2. 제외 경로를 그 뒤에 `extraMinutes` 오름차순으로 붙입니다.
3. 전체에 1부터 `rank`를 부여합니다. 응답의 `routes` 배열은 이 순서입니다.

## 4. 사례별 기본 fallback

AI 해석이 실패했을 때 사용하는 값입니다. 가중치 합은 1.0이어야 합니다.

### 야간 보행

```json
{
  "hardConstraints": {"maxExtraMinutes": 10, "minLightingScore": 50, "minQuietScore": null, "avoidStairs": false, "avoidActiveEvents": false},
  "preferences": {"crowdDirection": "more", "crowdWeight": 0.25, "lightingWeight": 0.50, "distanceWeight": 0.10, "quietWeight": 0.15, "shadeWeight": 0.00}
}
```

### 혼잡 회피

```json
{
  "hardConstraints": {"maxExtraMinutes": 10, "minLightingScore": 40, "minQuietScore": null, "avoidStairs": false, "avoidActiveEvents": false},
  "preferences": {"crowdDirection": "less", "crowdWeight": 0.45, "lightingWeight": 0.15, "distanceWeight": 0.15, "quietWeight": 0.15, "shadeWeight": 0.10}
}
```

핵심 시연 포인트는 동일한 `crowdScore`를 Case A에서는 높게, Case B에서는 낮게 평가한다는 점입니다.

역할 2가 자연어에서 뽑을 수 있는 추가 신호 (선택):

- "행사 하는 데는 피해줘" → `avoidActiveEvents = true`
- "시끄러운 데 싫어" → `minQuietScore` 또는 `quietWeight` 상향
- "더워서 그늘로" → `shadeWeight` 상향 (낮에만 의미 있음)

## 5. 시연 고정 데이터

`mocks/candidate-routes.json`의 후보 3개는 두 사례가 **동일하게** 공유합니다. 두 응답(`mocks/response-night.json`, `mocks/response-crowd-avoidance.json`)의 차이는 오직 `PreferenceProfile`에서만 나옵니다. 이 mock 은 점수·순위 함수의 정답지입니다.

실제 그래프 기반 경로 생성(`USE_MOCK_DATA=false`)에서는 선호가 **길찾기 비용에도** 들어갑니다. 선분마다 조도·혼잡·조용함·그늘을 미리 계산해 두고 `비용 = 길이 × (1 + λ × Σ 가중치 × (1 − 효용/100))`으로 Dijkstra 를 돌리므로, 밝기를 원하면 가로등 많은 길이 **만들어집니다**. `avoidStairs`·`avoidActiveEvents`는 해당 선분을 아예 막고, `maxExtraMinutes`를 넘으면 λ를 줄여 다시 찾습니다. 후보는 최단 경로 · 맞춤 경로 · 대안 경로이며, 그 뒤 1~3절은 동일하게 적용됩니다.

실데이터에서는 `crowdScore`(시간대별 격자)와 `lightingScore`(야간 상권 보정)가 출발 시각에 따라 달라집니다. 발표용 두 사례는 시간대와 무관하게 이 고정값으로 시연합니다. 고정값은 `data-spec.md` 공식으로 **정확히** 재현되는 값이 아니라 그럴듯한 수준으로 맞춘 값입니다.

위 규칙으로 계산한 결과:

| 경로 | 거리 | extraMinutes | 야간 보행 | 혼잡 회피 |
|---|---|---|---|---|
| route-a 최단 경로 | 1200m | 0 | 63.55 (2위) | 36.2 (3위) |
| route-b 골목 우회 경로 | 1500m | 4 | 제외 — 조도 41 < 50 | **63.25 (1위)** |
| route-c 상가 골목 경로 | 1350m | 2 | **68.75 (1위)** | 49.75 (2위) |

Backend 구현이 이 표와 다른 값을 내면 구현이 규격을 벗어난 것입니다.

계산 예 — 야간 보행의 route-c. route-b가 제외되어 통과 경로는 a(1200m)·c(1350m)이고, c가 최대 거리이므로 `distanceUtility = 0`:

```text
64×0.25 + 92×0.50 + 0×0.10 + 45×0.15 + 55×0.00 = 68.75
```

계산 예 — 혼잡 회피의 route-b. 세 경로 모두 통과, b가 최대 거리이므로 `distanceUtility = 0`, `crowdUtility = 100 - 18 = 82`:

```text
82×0.45 + 41×0.15 + 0×0.15 + 88×0.15 + 70×0.10 = 63.25
```

## 6. MVP에서 하지 않는 것

- 구간별 점수("이 200m가 어둡다"): 경로 전체 집계만 합니다.
- 가로등·그늘 등 개별 지점 좌표를 응답에 싣는 것: 개수만 보냅니다. 지도에 점을 찍는 기능은 범위 밖입니다.
- 새 지표 추가: 지표는 혼잡·조도·조용함·그늘 4개로 고정합니다. 행사는 `crowdScore`와 `avoidActiveEvents`로, 상권은 `storeCount`와 야간 조도 보정으로 흡수합니다.
