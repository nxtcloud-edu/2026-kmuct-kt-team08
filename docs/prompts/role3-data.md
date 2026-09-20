# 역할 3 — 데이터·센서용 AI 코딩 프롬프트

```text
너는 경로별 보행환경 데이터 담당자다.
README.md, backend/app/schemas.py, backend/app/contracts.py, backend/app/data_models.py, docs/data-spec.md, docs/scoring-spec.md를 읽어라.
backend/app/data_service.py와 backend/data/ 폴더만 구현하라. data_models.py와 docs/data-spec.md는 네 소유지만 컬럼을 바꾸려면 팀에 먼저 알려라.

원본 데이터는 7종이다: 가로등, 도로 구간별 가로등 개수, 그늘, 소음, 유동인구 격자, 행사, 상권.
각 CSV의 컬럼은 docs/data-spec.md 1절과 data_models.py의 행 모델을 그대로 따른다. 읽을 때 행 모델로 검증하라.

load_candidate_routes(request)는 후보 경로 3개에 RouteMetrics를 붙여 반환한다.
RouteMetrics의 4개 점수(crowdScore, lightingScore, quietScore, shadeScore)와 6개 개수는 docs/data-spec.md 2절 공식으로 계산한다.
경로 주변 판정은 폴리라인에서 30m(행사·격자는 100m), 거리는 haversine이다.
crowdScore는 출발 시각의 hour와 같은 time_slot 격자를 쓰고, 진행 중 행사 1건당 +20 보정한다.
파일이 없거나 비어 있으면 data-spec.md 3절대로 결측 처리하고 metricSources에 "missing"을 기록한다.
실제 데이터가 없으면 mocks/candidate-routes.json의 후보 3개를 그대로 반환하고 metricSources를 전부 "mock"으로 표시한다.
발표용 두 사례(야간 보행, 혼잡 회피)는 시간대와 무관하게 candidate-routes.json의 고정값을 사용해야 한다. 두 사례의 응답 차이가 오직 선호 해석에서만 나와야 하기 때문이다.
좌표는 WGS84 lat/lng, 거리 단위는 m다.
schemas.py의 필드명을 변경하지 말고 다른 역할 파일을 수정하지 마라.
완료 후 사용한 데이터 출처, 각 CSV의 행 수, 세 후보의 RouteMetrics 계산 결과를 표로 제시하라.
```
