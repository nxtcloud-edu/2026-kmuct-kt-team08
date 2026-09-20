"""mocks/response-*.json 은 scoring-spec.md 의 정답지다. 점수·순위 함수가 그대로 재현해야 한다."""

import json
from pathlib import Path

import pytest

from app.route_engine import apply_hard_constraints, score_and_rank_routes
from app.schemas import CandidateRoute, PreferenceProfile, RouteRecommendationResponse

MOCKS = Path(__file__).resolve().parents[2] / "mocks"


def _load(name):
    return json.loads((MOCKS / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", ["night", "crowd-avoidance"])
def test_scores_match_mock_response(case):
    candidates = [CandidateRoute.model_validate(c) for c in _load("candidate-routes.json")]
    profile = PreferenceProfile.model_validate(_load(f"preference-{case}.json"))
    expected = RouteRecommendationResponse.model_validate(_load(f"response-{case}.json"))

    ranked = score_and_rank_routes(apply_hard_constraints(candidates, profile), profile)

    got = [(r.routeId, r.rank, r.extraMinutes, r.matchScore, r.rejected) for r in ranked]
    want = [(r.routeId, r.rank, r.extraMinutes, r.matchScore, r.rejected) for r in expected.routes]
    assert got == want
