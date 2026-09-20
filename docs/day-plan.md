# 하루 개발 일정

## 09:00–10:00 계약 확정

- 전원이 README, 스키마, API 명세 확인
- 발표 사례와 Mock 수치 확정
- Git 브랜치 생성

## 10:00–12:00 병렬 구현

- Backend: Mock API 완성
- Frontend: 3화면 완성
- AI: 자연어 → JSON 테스트
- 데이터: 후보 3개의 지표 JSON 완성
- PM: 발표 구조와 문제 근거 작성

## 12:00 중간 통합 기준

실제 AI와 데이터가 없어도 Frontend → Backend → Mock 응답이 동작해야 합니다.

## 13:00–15:00 실제 모듈 교체

- Mock 선호를 AI 분석으로 교체
- Mock 후보 지표를 데이터 결과로 교체
- Hard Constraint와 점수 계산 연결

## 15:00–17:00 통합 테스트

- 야간 보행 문장 입력 시 crowdDirection=more
- 혼잡 회피 문장 입력 시 crowdDirection=less
- “5분 이상 우회 싫어”가 Hard Constraint로 처리
- AI 실패 시 fallback 동작
- 두 경로 비교 설명이 수치와 일치

## 17:00 이후 발표 고정

- 더 이상 기능 추가 금지
- 발표용 입력 문장과 결과를 고정
- 실제/Mock 데이터 표기 확인
- 7분 발표 리허설과 백업 영상 준비

