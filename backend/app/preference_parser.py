"""AI Preference Agent — preference_parser.py

역할 2 담당 구현 파일.

공개 계약 함수 (contracts.py):
  - parse_preference(request: RouteRequest) -> PreferenceProfile
  - build_recommendation_summary(routes: List[ScoredRoute], profile: PreferenceProfile) -> str

전체 연결 흐름:
  preferenceText
    → parse_preference()           ← 이 파일
    → PreferenceProfile
    → apply_hard_constraints()     ← Backend 담당
    → score_and_rank_routes()      ← Backend 담당
    → rank가 부여된 List[ScoredRoute]
    → build_recommendation_summary()  ← 이 파일

설계 원칙:
  - LLM: 자연어 의미 해석, caseType, crowdDirection, 5개 priority(strong/normal/weak/none) 판단
  - 서버: priority→weight 변환, 야간 shadeWeight=0, Hard Constraint 상수 변환, weight 정규화
  - LLM이 weight 수치를 직접 생성하지 않는다
  - LLM 3회 실패 시 규칙 기반 fallback → HTTP 200 반환 (exception 없음)
  - LLMTimeoutError / LLMAuthError 만 exception 전파 → Backend가 HTTP 변환
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import List, Literal, Optional

from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, ValidationError

from .schemas import (
    CrowdDirection,
    HardConstraints,
    PreferenceProfile,
    PreferenceWeights,
    RouteRequest,
    ScoredRoute,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini API Key — 환경변수 GEMINI_API_KEY에서 읽습니다
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------

MAX_RETRIES = 2  # 총 3회 시도

# Hard Constraint 점수 상수 (LLM이 생성하지 않고 서버가 적용)
HARD_MIN_LIGHTING_SCORE: float = 70.0
HARD_MIN_QUIET_SCORE: float = 70.0

# priority → raw score 매핑
RAW_SCORE: dict[str, int] = {
    "strong": 3,
    "normal": 2,
    "weak": 1,
    "none": 0,
}

# 프롬프트 파일 경로 (preference_parser.py 기준 ../../prompts/)
_PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"


# ---------------------------------------------------------------------------
# Task 1-1: LLM 중간 모델
# ---------------------------------------------------------------------------

PriorityType = Literal["strong", "normal", "weak", "none"]


class LLMHardConstraints(BaseModel):
    maxExtraMinutes: Optional[int] = None
    lightingHardConstraint: bool = False
    quietHardConstraint: bool = False
    lightingScoreOverride: Optional[float] = None
    quietScoreOverride: Optional[float] = None
    avoidStairs: bool = False
    avoidActiveEvents: bool = False


class LLMPreferencePriorities(BaseModel):
    crowdDirection: CrowdDirection = CrowdDirection.NEUTRAL
    crowdPriority: PriorityType = "none"
    lightingPriority: PriorityType = "none"
    distancePriority: PriorityType = "none"
    quietPriority: PriorityType = "none"
    shadePriority: PriorityType = "none"


class LLMRawOutput(BaseModel):
    caseType: str
    summary: str
    hardConstraints: LLMHardConstraints
    preferences: LLMPreferencePriorities
    explanation: List[str]
    ambiguityWarning: Optional[str] = None


# ---------------------------------------------------------------------------
# Task 1-2: 커스텀 예외 클래스
# ---------------------------------------------------------------------------


class LLMOutputError(Exception):
    """LLM 응답 파싱 실패 또는 Schema 불일치."""


class LLMTimeoutError(Exception):
    """LLM API 30초 타임아웃."""


class LLMAuthError(Exception):
    """LLM API 인증 오류 (API 키 없음 / 만료)."""


# ---------------------------------------------------------------------------
# Task 2-1: Hard Constraint 변환 (bool → 고정 상수)
# ---------------------------------------------------------------------------


def _build_hard_constraints(llm_hc: LLMHardConstraints) -> HardConstraints:
    """LLM이 판단한 boolean 플래그를 실제 HardConstraints 수치로 변환.

    LLM은 hard constraint 존재 여부(bool)만 판단하고,
    실제 점수는 서버 고정 상수(HARD_MIN_*_SCORE)를 사용한다.
    사용자가 직접 수치를 명시한 경우에만 Override 값을 사용한다.
    """
    min_lighting: Optional[float] = None
    if llm_hc.lightingHardConstraint:
        min_lighting = llm_hc.lightingScoreOverride if llm_hc.lightingScoreOverride is not None else HARD_MIN_LIGHTING_SCORE

    min_quiet: Optional[float] = None
    if llm_hc.quietHardConstraint:
        min_quiet = llm_hc.quietScoreOverride if llm_hc.quietScoreOverride is not None else HARD_MIN_QUIET_SCORE

    return HardConstraints(
        maxExtraMinutes=llm_hc.maxExtraMinutes,
        minLightingScore=min_lighting,
        minQuietScore=min_quiet,
        avoidStairs=llm_hc.avoidStairs,
        avoidActiveEvents=llm_hc.avoidActiveEvents,
    )


# ---------------------------------------------------------------------------
# Task 2-2: PostProcessor (priority → weight, 야간 처리)
# ---------------------------------------------------------------------------


def _is_nighttime(departure_time: str) -> bool:
    """departureTime 문자열에서 야간(20~23시, 00~05시) 여부를 판단.

    지원 형식: "HH:MM", "HH:MM:SS", ISO 8601 (2026-09-19T21:30:00+09:00)
    파싱 실패 시 야간으로 간주하지 않는다.
    """
    try:
        match = re.search(r"T?(\d{1,2}):(\d{2})", departure_time)
        if not match:
            return False
        hour = int(match.group(1))
        return hour >= 20 or hour <= 5
    except (ValueError, AttributeError):
        return False


def _post_process(raw: LLMRawOutput, departure_time: str) -> PreferenceProfile:
    """LLMRawOutput을 받아 결정론적 후처리로 PreferenceProfile을 생성한다.

    처리 순서:
      1. 야간 판단 → shadePriority = "none" 강제
      2. LLMHardConstraints → HardConstraints 변환 (bool → 고정 상수)
      3. priority → raw score (strong=3, normal=2, weak=1, none=0)
      4. score>0인 항목만 정규화 (total==0 → distanceWeight=1.0)
      5. Pydantic PreferenceProfile 검증 (weight 합 1.0±0.001)
    """
    prefs = raw.preferences

    # 1. 야간 처리
    shade_priority: PriorityType = prefs.shadePriority
    if _is_nighttime(departure_time):
        shade_priority = "none"

    # 2. Hard Constraint 변환
    hard_constraints = _build_hard_constraints(raw.hardConstraints)

    # 3. priority → raw score
    scores = {
        "crowd": RAW_SCORE[prefs.crowdPriority],
        "lighting": RAW_SCORE[prefs.lightingPriority],
        "distance": RAW_SCORE[prefs.distancePriority],
        "quiet": RAW_SCORE[prefs.quietPriority],
        "shade": RAW_SCORE[shade_priority],
    }

    # 4. weight 정규화
    total = sum(s for s in scores.values() if s > 0)

    if total == 0:
        weights = {
            "crowdWeight": 0.0,
            "lightingWeight": 0.0,
            "distanceWeight": 1.0,
            "quietWeight": 0.0,
            "shadeWeight": 0.0,
        }
    else:
        weights = {
            "crowdWeight": scores["crowd"] / total,
            "lightingWeight": scores["lighting"] / total,
            "distanceWeight": scores["distance"] / total,
            "quietWeight": scores["quiet"] / total,
            "shadeWeight": scores["shade"] / total,
        }

    # 5. PreferenceProfile 생성 (Pydantic이 weight 합 검증)
    preference_weights = PreferenceWeights(
        crowdDirection=prefs.crowdDirection,
        **weights,
    )

    return PreferenceProfile(
        caseType=raw.caseType,
        summary=raw.summary,
        hardConstraints=hard_constraints,
        preferences=preference_weights,
        explanation=raw.explanation,
        ambiguityWarning=raw.ambiguityWarning,
    )


# ---------------------------------------------------------------------------
# Task 4-1: 프롬프트 로더
# ---------------------------------------------------------------------------


def _load_prompt(filename: str) -> str:
    """prompts/ 디렉토리에서 프롬프트 파일을 읽는다."""
    path = _PROMPTS_DIR / filename
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("프롬프트 파일을 찾을 수 없습니다: %s. 기본 프롬프트를 사용합니다.", path)
        return ""


# ---------------------------------------------------------------------------
# Task 4-3: 규칙 기반 Fallback
# ---------------------------------------------------------------------------


def _fallback_parse(request: RouteRequest) -> LLMRawOutput:
    """LLM 3회 실패 시 규칙 기반으로 LLMRawOutput을 생성한다.

    판단 기준:
      - departureTime이 야간(20~05시) → nighttime_walk
      - preferenceText에 "사람"/"혼잡"/"붐비" 포함 → crowd_avoidance
      - 그 외 → general
    """
    text = request.preferenceText
    is_night = _is_nighttime(request.departureTime)
    crowd_keywords = ("사람", "혼잡", "붐비")

    if is_night:
        return LLMRawOutput(
            caseType="nighttime_walk",
            summary="야간 보행을 위해 밝은 경로를 선호합니다.",
            hardConstraints=LLMHardConstraints(),
            preferences=LLMPreferencePriorities(
                lightingPriority="normal",
            ),
            explanation=["밝은 길"],
            ambiguityWarning=None,
        )

    if any(kw in text for kw in crowd_keywords):
        return LLMRawOutput(
            caseType="crowd_avoidance",
            summary="혼잡을 피하는 경로를 선호합니다.",
            hardConstraints=LLMHardConstraints(),
            preferences=LLMPreferencePriorities(
                crowdDirection=CrowdDirection.LESS,
                crowdPriority="normal",
            ),
            explanation=["혼잡 적게"],
            ambiguityWarning=None,
        )

    return LLMRawOutput(
        caseType="general",
        summary="일반 보행 경로를 탐색합니다.",
        hardConstraints=LLMHardConstraints(),
        preferences=LLMPreferencePriorities(
            distancePriority="normal",
        ),
        explanation=["최적 경로"],
        ambiguityWarning=None,
    )


# ---------------------------------------------------------------------------
# Task 4-2: LLM 단일 호출
# ---------------------------------------------------------------------------


def _build_llm_schema() -> dict:
    """LLMRawOutput의 JSON Schema를 반환한다 (Structured Output용)."""
    return LLMRawOutput.model_json_schema()


async def _call_llm(request: RouteRequest) -> LLMRawOutput:
    """Gemini API를 호출하여 LLMRawOutput을 반환한다.

    Raises:
        LLMAuthError: API 키 없음 / 인증 실패
        LLMTimeoutError: 30초 타임아웃
        LLMOutputError: 응답 파싱 실패 또는 Schema 불일치
    """
    if not GEMINI_API_KEY:
        raise LLMAuthError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

    system_prompt = _load_prompt("preference_system.txt")
    user_prompt = (
        f'출발지: "{request.start}"\n'
        f'목적지: "{request.end}"\n'
        f'출발 시간: "{request.departureTime}"\n'
        f'사용자 입력: "{request.preferenceText}"'
    )

    client = genai.Client(api_key=GEMINI_API_KEY)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=(system_prompt + "\n\n" + user_prompt) if system_prompt else user_prompt)],
                )
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=LLMRawOutput,
                temperature=0.0,
            ),
        )
    except Exception as e:
        err_str = str(e).lower()
        if "api_key" in err_str or "auth" in err_str or "permission" in err_str or "403" in err_str:
            raise LLMAuthError(f"LLM API 인증 오류: {e}") from e
        if "timeout" in err_str or "deadline" in err_str:
            raise LLMTimeoutError(f"LLM API 타임아웃 (30초 초과): {e}") from e
        raise LLMOutputError(f"LLM API 호출 오류: {e}") from e

    content = response.text
    if not content:
        raise LLMOutputError("LLM 응답이 비어 있습니다.")

    try:
        data = json.loads(content)
        return LLMRawOutput.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as e:
        raise LLMOutputError(f"LLM 응답 파싱 실패: {e}") from e


# ---------------------------------------------------------------------------
# Task 4-4: 재시도 로직
# ---------------------------------------------------------------------------


async def _extract_with_retry(request: RouteRequest) -> LLMRawOutput:
    """최대 3회 LLM 호출을 시도하고, 모두 실패하면 fallback을 반환한다.

    - LLMOutputError / ValidationError: 재시도
    - LLMTimeoutError: 즉시 raise (fallback 불가)
    - LLMAuthError: 즉시 raise (fallback 불가)
    """
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            return await _call_llm(request)
        except (LLMOutputError, ValidationError) as e:
            last_error = e
            logger.warning("LLM 호출 실패 (시도 %d/%d): %s", attempt + 1, MAX_RETRIES + 1, e)
            continue
        except LLMTimeoutError:
            raise  # 타임아웃 → Backend가 HTTP 504 처리
        except LLMAuthError:
            raise  # 인증 오류 → Backend가 HTTP 500 처리

    # 3회 모두 실패 → 규칙 기반 fallback (exception 없음, HTTP 200)
    logger.warning("LLM 3회 모두 실패. 규칙 기반 fallback 적용. 마지막 오류: %s", last_error)
    return _fallback_parse(request)


# ---------------------------------------------------------------------------
# Task 5-1: parse_preference (공개 계약 함수)
# ---------------------------------------------------------------------------


async def parse_preference(request: RouteRequest) -> PreferenceProfile:  # type: ignore[override]
    """자연어 preferenceText를 PreferenceProfile로 변환한다.

    contracts.py 공개 계약 구현.

    Args:
        request: RouteRequest (start, end, departureTime, preferenceText)

    Returns:
        PreferenceProfile — 5개 weight 합 = 1.0 보장

    Raises:
        LLMTimeoutError: LLM API 30초 타임아웃
        LLMAuthError: API 키 없음 / 인증 실패
        ValidationError: RouteRequest 입력 검증 실패 (preferenceText 범위 위반 등)
    """
    raw = await _extract_with_retry(request)
    return _post_process(raw, request.departureTime)


# ---------------------------------------------------------------------------
# Task 5-2: build_recommendation_summary (공개 계약 함수)
# ---------------------------------------------------------------------------


async def build_recommendation_summary(  # type: ignore[override]
    routes: List[ScoredRoute],
    profile: PreferenceProfile,
) -> str:
    """이미 순위가 결정된 ScoredRoute 목록을 받아 한국어 추천 이유를 생성한다.

    contracts.py 공개 계약 구현.

    - score_and_rank_routes()가 이미 순위를 결정한 routes를 받는다.
    - 이 함수는 순위를 변경하거나 재정렬하지 않는다.
    - routes[0] (rank=1 경로)를 기준으로 설명을 생성한다.
    - weight 상위 2개 항목을 최소 1개 이상 언급한다.
    - 3문장 이내 한국어 문자열을 반환한다.

    Raises:
        LLMTimeoutError: LLM API 30초 타임아웃
        LLMAuthError: API 키 없음 / 인증 실패
    """
    if not routes:
        return "추천 경로가 없습니다."

    # weight 기준 상위 2개 항목 파악
    prefs = profile.preferences
    weight_map = {
        "혼잡도": prefs.crowdWeight,
        "조명": prefs.lightingWeight,
        "거리": prefs.distanceWeight,
        "소음": prefs.quietWeight,
        "그늘": prefs.shadeWeight,
    }
    top_factors = sorted(weight_map.items(), key=lambda x: x[1], reverse=True)[:2]
    top_factor_names = [f[0] for f in top_factors if f[1] > 0]

    if not GEMINI_API_KEY:
        raise LLMAuthError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

    system_prompt = _load_prompt("explain_system.txt")

    preferences_json = profile.model_dump_json(indent=2)
    routes_json = json.dumps(
        [r.model_dump() for r in routes[:3]],  # 최대 3개
        ensure_ascii=False,
        indent=2,
    )

    user_prompt = system_prompt.replace("{preferences_json}", preferences_json).replace(
        "{routes_json}", routes_json
    )

    # system_prompt가 플레이스홀더 없이 단순 지침인 경우 별도 user message 구성
    if "{preferences_json}" not in system_prompt:
        user_prompt = (
            f"선호 정보:\n{preferences_json}\n\n"
            f"경로 후보 목록:\n{routes_json}\n\n"
            f"위 정보를 바탕으로 최상위 경로를 추천하는 이유를 한국어로 3문장 이내로 설명해주세요."
            + (f"\n\n핵심 선호 항목: {', '.join(top_factor_names)}" if top_factor_names else "")
        )

    client = genai.Client(api_key=GEMINI_API_KEY)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=(system_prompt + "\n\n" + user_prompt) if system_prompt else user_prompt)],
                )
            ],
            config=genai_types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=300,
            ),
        )
    except Exception as e:
        logger.error("추천 이유 생성 실패: %s", e)
        # 추천 이유는 실패해도 fallback 텍스트 반환 (경로 탐색 자체는 이미 완료)
        factor_str = " 및 ".join(top_factor_names) if top_factor_names else "선호 조건"
        return f"회원님의 {factor_str} 선호에 맞는 경로를 추천드립니다."

    return response.text or "추천 경로를 확인해주세요."


# ---------------------------------------------------------------------------
# 테스트 코드 (파일 직접 실행 시)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    # 1) pip install -U google-genai pydantic
    # 2) 환경변수 설정: $env:GEMINI_API_KEY = "실제_키"
    # 3) python -m app.preference_parser

    class _FakeRouteRequest:
        """schemas.RouteRequest 없이 테스트용 최소 객체."""
        start = "석촌역"
        end = "잠실역"
        departureTime = "21:00"
        preferenceText = ""

    async def _run_test() -> None:
        print("=" * 60)
        print("  출발지 : 석촌역  →  도착지 : 잠실역  |  출발시간 : 21:00")
        print("=" * 60)
        preference_text = input("선호하는 경로를 입력하세요:\n> ").strip()
        if not preference_text:
            print("[오류] 선호 문장을 입력해주세요.")
            return

        req = _FakeRouteRequest()
        req.preferenceText = preference_text  # type: ignore[assignment]

        print("-" * 60)
        print("Gemini 분석 중...")
        print("-" * 60)
        try:
            profile = await parse_preference(req)  # type: ignore[arg-type]
            print("\n[결과] PreferenceProfile JSON:")
            print(profile.model_dump_json(indent=2))
            print("\n[추출된 선호 키워드]")
            print(profile.explanation)
        except LLMAuthError as e:
            print(f"[인증 오류] {e}")
        except LLMTimeoutError as e:
            print(f"[타임아웃] {e}")
        except Exception as e:
            print(f"[예외] {type(e).__name__}: {e}")
        print("=" * 60)

    asyncio.run(_run_test())
