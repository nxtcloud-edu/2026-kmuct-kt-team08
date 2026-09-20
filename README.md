# AI 개인화 보행 경로 에이전트 — 개발 규격 패키지

2026년 국민대학교 캠퍼스타운 키로톤 08팀 바이브 온 레포지토리입니다.

이 저장소는 5명이 하루 동안 GPT, Claude, Kiro 같은 AI 코딩 도구를 사용해 하나의 데모를 병렬 개발할 때 사용하는 **공통 계약(contract)**입니다.

## 하루짜리 MVP 범위

- 장소: 잠실역 → 석촌역 고정 또는 입력 가능
- 후보 경로: 실제 전체 길찾기 대신 3개 후보 비교
- 핵심 사례:
  1. 야간 보행: 밝기와 일정 수준의 유동인구 선호
  2. 혼잡 회피: 낮은 유동인구 선호
- AI 역할: 자연어를 `PreferenceProfile` JSON으로 변환
- Backend 역할: Hard Constraint를 먼저 적용하고 Preference 점수로 순위 결정
- Frontend 역할: 요청 → AI 해석 → 경로 비교의 3화면 구현

## 절대로 바꾸면 안 되는 공통 계약

1. `backend/app/schemas.py`의 필드명과 자료형
2. `docs/api-spec.md`의 URL과 HTTP 방식
3. `backend/app/contracts.py`의 공개 함수 이름
4. 거리 단위는 m, 시간 단위는 분, 점수는 0~100
5. 좌표는 WGS84 `lat/lng`
6. 유동인구는 `crowdDirection`과 `crowdWeight`을 분리
7. Hard Constraint는 선호 점수보다 먼저 적용
8. 선호 지표는 혼잡·조도·조용함·그늘 4개. 원본 데이터 7종은 역할 3이 이 4개 점수와 6개 개수로 집계

## 권장 기술

- Frontend: React + JavaScript 또는 TypeScript
- Backend: Python + FastAPI
- AI: LLM API의 JSON structured output
- 전달 형식: JSON
- 협업: GitHub 저장소 하나와 역할별 브랜치

## 시작 순서

1. 전원이 이 저장소를 clone합니다.
2. `schemas.py`, `api-spec.md`, `contracts.py`를 함께 확인합니다.
3. 각자 `docs/prompts/`의 담당 프롬프트를 AI 도구에 제공합니다.
4. 외부 기능이 완성되기 전에는 `mocks/` 데이터를 사용합니다.
5. Backend → Frontend → 데이터 → AI 순으로 main에 병합합니다.

## 파일 안내

- `backend/app/schemas.py`: Python/Pydantic 공통 데이터 규격
- `backend/app/contracts.py`: 역할 사이에서 호출하는 함수 규격
- `backend/app/data_models.py`: 원본 데이터 CSV 행 모델 (역할 3 소유)
- `backend/requirements.txt`: Python 의존성 (pydantic v2 고정)
- `backend/app/route_engine.py`, `routers/routes.py`, `main.py`: 역할 4 — 지도 그래프 위 선호 반영 길찾기, Hard Constraint, 점수, API
- `backend/app/data_service.py`, `backend/data/`: 역할 3 — 실데이터 CSV 와 경로·선분 단위 집계
- `backend/data/map/walk_graph.json`: OSM 보행망(잠실역~석촌역 일대). `scripts/build_walk_graph.py` 로 재생성
- `backend/scripts/try_prompt.py`: 서버 없이 문장 하나로 전체 파이프라인 확인. `python scripts/try_prompt.py "밝은 길, 5분 우회 허용"`
- 실행: `cd backend && python -m uvicorn app.main:app --reload` · 테스트: `python -m pytest -q tests`
- `frontend/src/types/contracts.ts`: Frontend용 동일 타입
- `docs/api-spec.md`: API 요청·응답과 오류 규격
- `docs/architecture.md`: 전체 연결 순서
- `docs/scoring-spec.md`: Hard Constraint와 점수 계산법
- `docs/data-spec.md`: 원본 데이터 7종(가로등·가로등 개수·그늘·소음·유동인구·행사·상권)의 CSV 컬럼과 점수 변환 공식
- `docs/team-rules.md`: 담당 파일과 AI 작업 규칙
- `docs/git-workflow.md`: Git 병합 방법
- `docs/day-plan.md`: 하루 개발 일정
- `docs/prompts/`: 역할별 AI 코딩 프롬프트
- `mocks/`: 연결 전 테스트용 요청·응답
  - `candidate-routes.json`: 두 사례가 공유하는 후보 경로 3개 (단일 출처)
  - `request-*.json` → `preference-*.json` → `response-*.json`: 사례별 요청, AI 해석, 최종 응답
  - `response-*.json`의 점수는 `docs/scoring-spec.md` 공식으로 재현됩니다. Backend 구현의 정답지로 사용하세요.

## 혼자 전 역할을 맡는 경우

역할 프롬프트의 "다른 파일을 수정하지 마라"는 병렬 개발 충돌 방지용입니다. 한 사람이 전부 구현할 때는 `docs/git-workflow.md`의 병합 순서대로 역할 4 → 5 → 3 → 2 프롬프트를 하나씩 실행하고, 각 단계가 끝날 때마다 결과가 `mocks/response-*.json`과 일치하는지 확인합니다.

## 중요한 한계

이 패키지는 Git에 바로 올릴 수 있는 규격·스캐폴드입니다. GitHub 저장소 생성, API 키 발급, 지도/유동인구 API 선정과 실제 배포 계정 연결은 팀이 별도로 해야 합니다.

