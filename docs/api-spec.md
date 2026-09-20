# API 명세

## GET /api/v1/health

응답:

```json
{"status":"ok"}
```

## POST /api/v1/routes/recommend

### 요청

```json
{
  "start": "잠실역",
  "end": "석촌역",
  "departureTime": "2026-09-19T23:00:00+09:00",
  "preferenceText": "오늘 사람 많은 곳은 피하고 싶어. 조금 돌아가도 괜찮아."
}
```

- `departureTime`은 ISO 8601 문자열이며 시간대 오프셋을 포함합니다. 예: `2026-09-19T23:00:00+09:00`
- 응답의 `dataTimestamp`도 같은 형식을 사용합니다.

### 성공 응답

- HTTP 200
- 응답 모델은 `RouteRecommendationResponse`
- 전체 예시: `mocks/response-crowd-avoidance.json`(혼잡 회피), `mocks/response-night.json`(야간 보행)
- `routes`는 `rank` 오름차순이며, Hard Constraint에 걸린 경로도 `rejected=true`로 포함합니다
- 점수·순위 규칙은 `docs/scoring-spec.md`를 따릅니다
- `metricSources`는 지표별 데이터 출처입니다. 키 `crowd`/`lighting`/`quiet`/`shade`/`event`/`store`, 값은 `"mock"`/`"missing"`/실데이터 출처명. 하나라도 mock 또는 missing이면 `isMockData=true`. Frontend는 이 값으로 지표별 "데모 데이터" 배지를 표시합니다.

### 오류 응답

```json
{
  "code": "INVALID_REQUEST",
  "message": "요청을 확인해 주세요.",
  "detail": "preferenceText is required"
}
```

| HTTP | code | 상황 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력 누락 또는 잘못된 값 |
| 422 | SCHEMA_VALIDATION_ERROR | 스키마 검증 실패 |
| 502 | AI_PARSE_FAILED | AI와 fallback 모두 실패 |
| 503 | DATA_UNAVAILABLE | 경로 데이터 생성 실패 |
| 500 | INTERNAL_ERROR | 예상하지 못한 서버 오류 |

## Backend 처리 순서

```text
RouteRequest
→ PreferenceProfile
→ CandidateRoute 3개
→ Hard Constraint 적용
→ Preference 점수 계산
→ 순위 및 추천 이유 생성
→ RouteRecommendationResponse
```

## 변경 금지 규칙

- API 경로를 `/recommend` 등으로 임의 변경하지 않습니다.
- JSON은 camelCase를 사용합니다.
- Frontend는 직접 AI/데이터 API를 호출하지 않고 Backend만 호출합니다.
- AI API 키는 Frontend에 두지 않습니다.

