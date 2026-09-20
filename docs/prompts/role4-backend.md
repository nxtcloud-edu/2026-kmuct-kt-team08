# 역할 4 — 경로 알고리즘·Backend용 AI 코딩 프롬프트

```text
너는 FastAPI Backend와 경로 점수 알고리즘 담당자다.
README.md, backend/app/schemas.py, backend/app/contracts.py, docs/api-spec.md, docs/scoring-spec.md를 읽어라.

다음 파일만 구현하라:
- backend/app/main.py
- backend/app/routers/routes.py
- backend/app/route_engine.py

GET /api/v1/health와 POST /api/v1/routes/recommend를 구현하라.
처리 순서는 parse_preference → load_candidate_routes → apply_hard_constraints → score_and_rank_routes다.
Hard Constraint를 점수보다 먼저 적용하라.
crowdDirection=more이면 crowdScore가 높을수록 유리하고, less이면 100-crowdScore를 사용하라.
외부 모듈이 미완성이면 mocks JSON을 사용하라. 후보 경로는 mocks/candidate-routes.json, 선호 해석은 mocks/preference-*.json이다.
extraMinutes 기준, distanceUtility 정규화 모수, 분모 0 처리, rejected 경로의 rank·matchScore, 정렬 규칙은 docs/scoring-spec.md 0~3절을 그대로 따르라.
응답은 반드시 RouteRecommendationResponse 검증을 통과해야 한다.
완료 기준: mocks/request-night.json과 mocks/request-crowd-avoidance.json을 넣었을 때 matchScore와 rank가 mocks/response-night.json, mocks/response-crowd-avoidance.json과 일치해야 한다.
CORS는 FRONTEND_ORIGIN 환경변수를 사용하라.
다른 역할 파일을 수정하지 마라.
완료 후 curl 테스트 예시와 오류 처리 결과를 제공하라.
```

