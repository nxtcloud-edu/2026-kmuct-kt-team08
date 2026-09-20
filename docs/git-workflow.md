# Git 협업과 배포 순서

## 브랜치

```text
main
├─ feature/ai-agent
├─ feature/data
├─ feature/backend
├─ feature/frontend
└─ docs/presentation
```

각 담당자는 자신의 브랜치에만 commit하고 Pull Request로 main에 병합합니다.

## 권장 병합 순서

1. `feature/backend`: FastAPI 뼈대와 Mock 응답
2. `feature/frontend`: Mock API와 화면 연결
3. `feature/data`: 후보 경로 지표 연결
4. `feature/ai-agent`: 실제 자연어 분석 연결
5. 통합 테스트와 발표용 데이터 고정

## 충돌을 줄이는 규칙

- `schemas.py` 변경은 한 명만 담당
- `App.*` 변경은 Frontend 담당만 수행
- 패키지 파일 변경 전 팀 채팅에 알림
- AI가 전체 리팩터링을 제안해도 하루 프로젝트에서는 거절
- PR 하나에는 한 역할의 변경만 포함

## Git으로 배포할 수 있는가?

가능합니다. 이 폴더 전체를 GitHub 저장소에 올릴 수 있습니다. 다만 배포 서비스에 따라 추가 설정이 필요합니다.

- Frontend와 Backend를 분리 배포할 수 있음
- 또는 하나의 서버에서 Frontend 정적 파일과 FastAPI를 함께 제공할 수 있음
- 실제 API 키는 GitHub에 올리지 않고 배포 환경변수에 등록
- `.env`는 commit 금지, `.env.example`만 commit

Kiro, Claude, GPT에는 저장소 전체 또는 관련 파일들을 컨텍스트로 제공하고 담당 프롬프트를 실행하면 됩니다.

