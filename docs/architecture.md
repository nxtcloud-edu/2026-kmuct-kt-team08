# 시스템 구조와 호출 순서

## 한 요청의 흐름

1. Frontend가 `RouteRequest`를 `POST /api/v1/routes/recommend`로 전송합니다.
2. Backend가 AI 모듈의 `parse_preference()`를 호출합니다.
3. AI 모듈이 `PreferenceProfile`을 반환합니다.
4. 경로 모듈이 `load_candidate_routes(request, profile)`로 후보 3개를 반환합니다. 선호가 길찾기 비용에 들어가므로 후보는 **최단 경로 · 맞춤 경로 · 대안 경로**입니다 (지도 앱의 "큰길 우선"처럼, 밝기를 원하면 가로등 많은 길이 만들어집니다).
5. Backend가 `apply_hard_constraints()`를 먼저 실행합니다.
6. 남은 경로에 `score_and_rank_routes()`를 실행합니다.
7. Backend가 `RouteRecommendationResponse`를 반환합니다.
8. Frontend가 AI 해석 화면과 경로 비교 화면을 표시합니다.

## 역할 연결

| 역할 | 입력 | 출력 | 담당 코드 |
|---|---|---|---|
| 2 AI Agent | RouteRequest | PreferenceProfile | preference_parser.py |
| 3 데이터 | 경로 좌표, 출발 시각, backend/data/*.csv (가로등·그늘·소음·유동인구·행사·상권) | RouteMetrics, metricSources | data_service.py, data_models.py |
| 4 Backend | 선호, 후보 경로 | ScoredRoute[] | route_engine.py, routes.py |
| 5 Frontend | 사용자 입력, API 응답 | 3개 화면 | React components |

## 하루 데모에서 허용하는 Mock

- 후보 경로 좌표 3개는 고정 가능
- 실시간 유동인구는 현재 시각에 따른 고정 시나리오 가능
- 가로등·그늘·소음·행사·상권은 `docs/data-spec.md` 규격의 CSV로 정리
- 실제 데이터가 아니면 화면에 반드시 “데모 데이터”라고 표시. 지표 단위 구분은 응답의 `metricSources`로 함
- 실제 LLM 연결이 실패하면 규칙 기반 fallback을 사용하되 `isMockData`를 true로 표시

## 실행 환경

- Frontend 개발 주소: `http://localhost:5173`
- Backend 개발 주소: `http://localhost:8000`
- API base URL: `http://localhost:8000/api/v1`

