"""역할 4 — health, 경로 추천 엔드포인트.

선호 해석은 역할 2의 preference_parser.parse_preference 가 있으면 그것을, 없으면
이 파일의 규칙 기반 fallback 을 쓴다. 두 시연 문장(mocks/request-*.json)은 항상
mocks/preference-*.json 과 동일한 해석을 돌려준다 (발표 고정).
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException

from ..route_engine import (
    MOCKS_DIR,
    DataUnavailableError,
    OutOfServiceAreaError,
    UnknownPlaceError,
    apply_hard_constraints,
    build_recommendation_summary,
    candidate_sources,
    candidates_are_mock,
    load_candidate_routes,
    score_and_rank_routes,
)
from ..data_service import is_mock, parse_departure
from ..schemas import (
    CrowdDirection,
    ErrorResponse,
    HardConstraints,
    PreferenceProfile,
    PreferenceWeights,
    RouteRecommendationResponse,
    RouteRequest,
)

router = APIRouter(prefix="/api/v1")

try:  # 역할 2 모듈이 병합되면 자동으로 사용
    from ..preference_parser import parse_preference as _llm_parse_preference  # type: ignore
except ImportError:  # pragma: no cover
    _llm_parse_preference = None


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _error(status: int, code: str, message: str, detail: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status,
        detail=ErrorResponse(code=code, message=message, detail=detail).model_dump(),
    )


# ---------------------------------------------------------------- 선호 해석 fallback

_NIGHT_FALLBACK = {
    "hardConstraints": {"maxExtraMinutes": 10, "minLightingScore": 50, "minQuietScore": None, "avoidStairs": False, "avoidActiveEvents": False},
    "preferences": {"crowdDirection": "more", "crowdWeight": 0.25, "lightingWeight": 0.50, "distanceWeight": 0.10, "quietWeight": 0.15, "shadeWeight": 0.00},
}
_CROWD_FALLBACK = {
    "hardConstraints": {"maxExtraMinutes": 10, "minLightingScore": 40, "minQuietScore": None, "avoidStairs": False, "avoidActiveEvents": False},
    "preferences": {"crowdDirection": "less", "crowdWeight": 0.45, "lightingWeight": 0.15, "distanceWeight": 0.15, "quietWeight": 0.15, "shadeWeight": 0.10},
}
_NEUTRAL = {
    "hardConstraints": {"maxExtraMinutes": 10, "minLightingScore": None, "minQuietScore": None, "avoidStairs": False, "avoidActiveEvents": False},
    "preferences": {"crowdDirection": "neutral", "crowdWeight": 0.20, "lightingWeight": 0.20, "distanceWeight": 0.30, "quietWeight": 0.20, "shadeWeight": 0.10},
}

_MINUTES_RE = re.compile(r"(\d{1,2})\s*분")


def _fixed_demo_profile(text: str) -> Optional[PreferenceProfile]:
    """시연 문장과 정확히 같으면 mocks/preference-*.json 을 그대로 반환."""
    for case in ("night", "crowd-avoidance"):
        req = MOCKS_DIR / f"request-{case}.json"
        pref = MOCKS_DIR / f"preference-{case}.json"
        if not (req.exists() and pref.exists()):
            continue
        if json.loads(req.read_text(encoding="utf-8")).get("preferenceText", "").strip() == text.strip():
            return PreferenceProfile.model_validate_json(pref.read_text(encoding="utf-8"))
    return None


def _normalize(weights: Dict[str, float]) -> Dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        return dict(_NEUTRAL["preferences"])  # type: ignore[arg-type]
    out = {k: round(v / total, 2) for k, v in weights.items()}
    # 반올림 잔차는 가장 큰 항목에 흡수
    residual = round(1.0 - sum(out.values()), 2)
    if residual:
        biggest = max(out, key=out.get)  # type: ignore[arg-type]
        out[biggest] = round(out[biggest] + residual, 2)
    return out


def _rule_based_profile(request: RouteRequest) -> PreferenceProfile:
    """키워드 규칙으로 자연어 → PreferenceProfile. LLM 없이 임의 문장을 시험할 때 쓴다."""
    text = request.preferenceText
    hour = parse_departure(request.departureTime).hour
    is_night = hour >= 20 or hour <= 5
    explanation: List[str] = []
    warnings: List[str] = []

    # 문장과 단어 목록("혼잡 적게, 밝은 길, 조용한 길, 5분 우회 허용") 둘 다 받는다
    wants_less = bool(re.search(r"(사람\s*많|붐비|북적|혼잡|복잡).{0,6}(피|싫|말|없|적|덜|낮|회피)|한적|사람\s*(적|없|덜)", text))
    wants_more = bool(re.search(r"사람\s*(있|많은\s*(데|곳|길)로|많게)|혼잡\s*(많|높|선호)|무서|외진|밝고\s*사람", text))
    night_words = bool(re.search(r"밤|야간|어두|밝은|밝게|밝기|가로등|조명", text))
    lighting_tag = bool(re.search(r"밝은\s*길|밝기|가로등|조명|안전한\s*길", text))

    if wants_less and not wants_more:
        base, case = _CROWD_FALLBACK, "crowd_avoidance"
        explanation.append("사람 많은 곳을 피하고 싶다는 표현을 혼잡 회피로 해석했습니다.")
    elif is_night or night_words or wants_more:
        base, case = _NIGHT_FALLBACK, "night_walk"
        explanation.append("야간/밝기 관련 표현 또는 출발 시각을 반영해 야간 보행으로 해석했습니다.")
    else:
        base, case = _NEUTRAL, "custom"
        explanation.append("뚜렷한 선호가 없어 균형 잡힌 기본값을 사용했습니다.")
    if wants_less and wants_more:
        warnings.append("사람이 많은 길과 적은 길을 동시에 원하는 표현이 있어 혼잡 방향을 확신할 수 없습니다.")

    hc = dict(base["hardConstraints"])  # type: ignore[arg-type]
    w = dict(base["preferences"])  # type: ignore[arg-type]
    direction = w.pop("crowdDirection")

    if lighting_tag:
        w["lightingWeight"] += 0.25
        explanation.append("밝기 가중치를 높였습니다.")

    m = _MINUTES_RE.search(text)
    if m:
        minutes = int(m.group(1))
        if (
            re.search(r"(이상|넘|초과).{0,8}(싫|안|말)", text)
            or re.search(r"(까지|정도|이내|안에).{0,8}(괜찮|돼|가능|좋)", text)
            or re.search(r"\d+\s*분\s*(우회|돌아|이내|까지|안|정도)?\s*(허용|가능|괜찮|OK|ok|돼)", text)
            or re.search(r"\d+\s*분\s*(이내|까지|안)\s*$", text.strip())
        ):
            hc["maxExtraMinutes"] = min(60, minutes)
            explanation.append(f"'{minutes}분'을 최대 우회 시간 Hard Constraint로 해석했습니다.")
    if re.search(r"행사.{0,10}(피|싫|말|없|회피|금지)", text):
        hc["avoidActiveEvents"] = True
        explanation.append("행사 회피를 Hard Constraint로 해석했습니다.")
    if re.search(r"계단.{0,10}(싫|피|없|힘들|회피|금지)", text):
        hc["avoidStairs"] = True
        explanation.append("계단 회피를 Hard Constraint로 해석했습니다.")
    if re.search(r"절대.{0,6}시끄|시끄.{0,6}절대", text):
        hc["minQuietScore"] = 50
        explanation.append("'절대 시끄러우면 안 된다'를 최소 조용함 50점 Hard Constraint로 해석했습니다.")
    elif re.search(r"시끄|조용", text):
        w["quietWeight"] += 0.15
        explanation.append("조용함 가중치를 높였습니다.")
    if re.search(r"그늘|더워|덥|햇볕|햇빛", text):
        if is_night:
            warnings.append("그늘을 원했지만 야간 출발이라 그늘 가중치를 두지 않았습니다.")
        else:
            w["shadeWeight"] += 0.20
            explanation.append("그늘 가중치를 높였습니다.")
    if re.search(r"빨리|빠른|최단|짧은|급해|서둘", text):
        w["distanceWeight"] += 0.20
        explanation.append("빠른 도착을 원해 거리 가중치를 높였습니다.")
    if re.search(r"돌아가도\s*(괜찮|돼)|우회.{0,4}(괜찮|돼)", text) and not m:
        explanation.append("우회를 허용한다고 보고 기본 최대 우회 시간을 유지했습니다.")

    weights = _normalize(w)
    return PreferenceProfile(
        caseType=case,
        summary=text if len(text) <= 60 else text[:57] + "…",
        hardConstraints=HardConstraints(**hc),
        preferences=PreferenceWeights(crowdDirection=CrowdDirection(direction), **weights),
        explanation=explanation,
        ambiguityWarning=" ".join(warnings) or None,
    )


async def resolve_preference(request: RouteRequest) -> Tuple[PreferenceProfile, bool]:
    """(profile, used_fallback)."""
    fixed = _fixed_demo_profile(request.preferenceText)
    if fixed is not None:
        return fixed, True
    if _llm_parse_preference is not None:
        try:
            return await _llm_parse_preference(request), False
        except Exception:  # noqa: BLE001 — LLM 실패 시 규칙 기반으로
            pass
    try:
        return _rule_based_profile(request), True
    except Exception as exc:  # noqa: BLE001
        raise _error(502, "AI_PARSE_FAILED", "선호 해석에 실패했습니다.", str(exc)) from exc


# ---------------------------------------------------------------- 파이프라인


async def run_recommendation(request: RouteRequest) -> RouteRecommendationResponse:
    """엔드포인트와 CLI(scripts/try_prompt.py)가 같이 쓰는 처리 순서."""
    try:
        parse_departure(request.departureTime)
    except ValueError as exc:
        raise _error(400, "INVALID_REQUEST", "요청을 확인해 주세요.", f"departureTime: {exc}") from exc

    profile, preference_is_fallback = await resolve_preference(request)

    try:
        candidates = load_candidate_routes(request, profile)  # 선호가 길찾기 비용에 반영된다
    except OutOfServiceAreaError as exc:
        raise _error(400, "OUT_OF_SERVICE_AREA", "서비스 지역을 벗어났습니다.", str(exc)) from exc
    except UnknownPlaceError as exc:
        raise _error(400, "INVALID_REQUEST", "요청을 확인해 주세요.", str(exc)) from exc
    except DataUnavailableError as exc:
        raise _error(503, "DATA_UNAVAILABLE", "경로 데이터를 불러오지 못했습니다.", str(exc)) from exc

    constrained = apply_hard_constraints(candidates, profile)
    ranked = score_and_rank_routes(constrained, profile)
    sources = candidate_sources()
    return RouteRecommendationResponse(
        requestId=f"req-{uuid.uuid4().hex[:12]}",
        interpretedPreference=profile,
        routes=ranked,
        recommendationSummary=build_recommendation_summary(ranked, profile),
        dataTimestamp=request.departureTime,
        isMockData=candidates_are_mock() or is_mock(sources) or preference_is_fallback,
        metricSources=sources,
    )


@router.post("/routes/recommend", response_model=RouteRecommendationResponse)
async def recommend(request: RouteRequest) -> RouteRecommendationResponse:
    return await run_recommendation(request)
