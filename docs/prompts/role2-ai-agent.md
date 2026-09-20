# 역할 2 — AI Agent용 AI 코딩 프롬프트

```text
너는 FastAPI 프로젝트의 AI 선호 분석 모듈 담당자다.
먼저 README.md, backend/app/schemas.py, backend/app/contracts.py, docs/api-spec.md를 읽어라.
backend/app/preference_parser.py만 구현하라.

공개 함수는 parse_preference(request: RouteRequest) -> PreferenceProfile이다.
LLM structured output으로 사용자의 자연어를 PreferenceProfile JSON으로 변환하라.
crowdDirection은 more/less/neutral 중 하나다.
가중치 합은 반드시 1.0이어야 한다.
“5분 이상 돌아가기 싫다”는 maxExtraMinutes=5인 Hard Constraint다.
“사람 적은 길이 좋다”는 crowdDirection=less인 Preference다.
“행사 하는 데는 피해줘”는 avoidActiveEvents=true인 Hard Constraint다.
“시끄러운 데 싫어”는 quietWeight 상향, “절대 시끄러우면 안 돼”는 minQuietScore Hard Constraint다.
“더워서 그늘로”는 shadeWeight 상향이며 야간(20시~05시)에는 shadeWeight를 0으로 둔다.
가중치 5개는 crowdWeight, lightingWeight, distanceWeight, quietWeight, shadeWeight다. safetyWeight는 없다.
상충하는 요구가 있으면 임의로 삭제하지 말고 ambiguityWarning에 기록하라.
LLM 실패 시 mocks의 두 사례와 동일한 규칙 기반 fallback을 적용하라.
API 키는 OPENAI_API_KEY 환경변수에서 읽어라.
다른 파일을 수정하지 마라.
완료 후 테스트 입력 5개와 예상 JSON을 제시하라.
```

