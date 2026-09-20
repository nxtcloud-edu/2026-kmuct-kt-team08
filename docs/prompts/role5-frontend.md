# 역할 5 — Frontend·UX용 AI 코딩 프롬프트

```text
너는 React Frontend와 UX 담당자다.
README.md, frontend/src/types/contracts.ts, docs/api-spec.md, mocks/response-crowd-avoidance.json, mocks/response-night.json을 읽어라.
frontend/src/types/contracts.ts가 이미 있으므로 Vite 등으로 스캐폴드할 때 덮어쓰거나 삭제하지 마라.

3단계 화면을 구현하라.
1. 출발/도착/자연어 입력 화면
2. AI가 해석한 Hard Constraint와 Preference를 보여주는 화면
3. 최단 경로와 맞춤 추천 경로를 비교하는 화면

Frontend는 POST /api/v1/routes/recommend 하나만 호출한다.
AI API나 공공데이터 API를 브라우저에서 직접 호출하지 않는다.
응답의 routes, interpretedPreference, recommendationSummary를 사용한다.
경로 카드에는 시간, 거리, 혼잡도, 밝기, 조용함, 그늘 점수와 근거 개수(가로등·그늘·소음원·행사·상가), 추천 이유를 표시한다.
isMockData=true이면 “데모 데이터” 배지를 표시한다. metricSources의 값이 "mock" 또는 "missing"인 지표에는 지표 옆에 작은 배지를 따로 표시한다.
rejected=true인 경로는 비활성 스타일로 표시하고 rejectionReasons를 함께 보여준다. 응답의 routes 순서(rank 오름차순)를 그대로 유지한다.
로딩, 입력 오류, 서버 오류 상태를 구현한다.
필드명과 타입을 변경하지 말고 Backend 파일을 수정하지 마라.
지도 API가 준비되지 않았으면 단순 경로 도식으로 대체한다.
완료 후 실행 명령과 변경한 파일 목록을 제공하라.
```

