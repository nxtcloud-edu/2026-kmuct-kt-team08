# 팀 담당 범위와 AI 개발 규칙

## 역할별 파일 소유권

| 역할 | 수정 가능 파일 |
|---|---|
| 1 PM·발표 | docs/presentation-outline.md 및 PPT |
| 2 AI Agent | backend/app/preference_parser.py |
| 3 데이터 | backend/app/data_service.py, backend/app/data_models.py, backend/data/, docs/data-spec.md |
| 4 Backend | backend/app/main.py, routers/routes.py, route_engine.py |
| 5 Frontend | frontend/src/components/, App.*, styles |

`schemas.py`, `contracts.py`, `api-spec.md`는 공용 계약입니다. 변경하려면 팀 전원이 합의해야 합니다.

## 모든 AI 도구에 붙일 공통 규칙

```text
이 프로젝트는 여러 명이 동시에 개발한다.
1. 요청받은 담당 파일만 수정한다.
2. schemas.py와 contracts.ts의 필드명·자료형을 변경하지 않는다.
3. api-spec.md의 API 주소를 변경하지 않는다.
4. contracts.py의 공개 함수 이름과 반환형을 변경하지 않는다.
5. 다른 기능이 미완성이면 mocks/의 데이터로 연결한다.
6. API 키는 환경변수에서 읽고 코드나 Git에 저장하지 않는다.
7. 거리=m, 시간=분, 점수=0~100, 좌표=WGS84 lat/lng를 사용한다.
8. 새 패키지가 필요하면 이름과 이유를 먼저 설명한다.
9. 구현 후 변경 파일, 호출 방법, 남은 Mock을 보고한다.
10. 전체 프로젝트를 새로 생성하거나 기존 파일을 삭제하지 않는다.
```

## 완료 기준

- 입력과 출력이 스키마 검증을 통과
- Mock 요청 하나로 실행 가능
- 실패 시 사용자에게 보여줄 오류 반환
- 실제 데이터와 Mock 데이터 구분
- 다른 역할의 파일을 수정하지 않음

