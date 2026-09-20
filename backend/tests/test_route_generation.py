"""그래프 기반 후보 생성과 API 계약 검증."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import route_engine
from app.main import app
from app.schemas import PreferenceProfile, RouteRecommendationResponse, RouteRequest

MOCKS = Path(__file__).resolve().parents[2] / "mocks"
needs_graph = pytest.mark.skipif(not route_engine.graph_available(), reason="walk_graph.json 없음")


def _request(name):
    return RouteRequest.model_validate_json((MOCKS / name).read_text(encoding="utf-8"))


@needs_graph
def test_generates_distinct_candidates(monkeypatch):
    monkeypatch.delenv("USE_MOCK_DATA", raising=False)
    routes = route_engine.load_candidate_routes(_request("request-night.json"))

    assert 2 <= len(routes) <= route_engine.CANDIDATE_COUNT
    assert routes[0].name.startswith("최단")
    assert len({r.routeId for r in routes}) == len(routes)
    shortest = min(r.distanceM for r in routes)
    assert routes[0].distanceM == shortest
    for r in routes:
        assert r.distanceM <= shortest * route_engine.MAX_DETOUR_RATIO + 1
        assert len(r.coordinates) >= 2
        assert r.coordinates[0].lat == pytest.approx(routes[0].coordinates[0].lat, abs=1e-6)
        assert r.coordinates[-1].lat == pytest.approx(routes[0].coordinates[-1].lat, abs=1e-6)
        assert 0 <= r.metrics.crowdScore <= 100


def _profile(**overrides):
    base = json.loads((MOCKS / "preference-night.json").read_text(encoding="utf-8"))
    base["preferences"].update(overrides.pop("preferences", {}))
    base["hardConstraints"].update(overrides.pop("hardConstraints", {}))
    return PreferenceProfile.model_validate(base)


@needs_graph
def test_personalized_route_follows_preference(monkeypatch):
    """선호가 길찾기 비용에 들어가야 한다: 밝기만 원하면 맞춤 경로가 최단보다 밝다."""
    monkeypatch.delenv("USE_MOCK_DATA", raising=False)
    req = _request("request-night.json")
    bright = _profile(
        preferences={"crowdWeight": 0.0, "lightingWeight": 0.9, "distanceWeight": 0.1, "quietWeight": 0.0, "shadeWeight": 0.0},
        hardConstraints={"maxExtraMinutes": 15, "minLightingScore": None},
    )
    routes = route_engine.load_candidate_routes(req, bright)
    by_name = {r.name: r for r in routes}
    if "맞춤 경로" not in by_name:
        pytest.skip("최단 경로가 이미 가장 밝아 맞춤 경로가 최단과 같음")
    assert by_name["맞춤 경로"].metrics.lightingScore >= by_name["최단 경로"].metrics.lightingScore


@needs_graph
def test_personalized_route_respects_max_extra_minutes(monkeypatch):
    monkeypatch.delenv("USE_MOCK_DATA", raising=False)
    req = _request("request-night.json")
    strict = _profile(hardConstraints={"maxExtraMinutes": 2})
    routes = route_engine.load_candidate_routes(req, strict)
    shortest = min(r.durationMin for r in routes)
    custom = next((r for r in routes if r.name.startswith("맞춤") or r.name.startswith("최단·맞춤")), None)
    assert custom is not None
    assert custom.durationMin - shortest <= 2


@needs_graph
def test_avoid_stairs_blocks_step_edges(monkeypatch):
    monkeypatch.delenv("USE_MOCK_DATA", raising=False)
    req = _request("request-night.json")
    routes = route_engine.load_candidate_routes(req, _profile(hardConstraints={"avoidStairs": True}))
    custom = next(r for r in routes if "맞춤" in r.name)
    assert custom.hasStairs is False


def test_mock_mode(monkeypatch):
    monkeypatch.setenv("USE_MOCK_DATA", "true")
    routes = route_engine.load_candidate_routes(_request("request-night.json"))
    assert [r.routeId for r in routes] == ["route-a", "route-b", "route-c"]
    assert route_engine.candidate_sources()["crowd"] == "mock"


def test_geocode():
    assert route_engine.geocode("잠실역") == route_engine.PLACES["잠실역"]
    assert route_engine.geocode("37.61, 127.0") == (37.61, 127.0)
    with pytest.raises(route_engine.UnknownPlaceError):
        route_engine.geocode("광화문")


client = TestClient(app, raise_server_exceptions=False)


def test_health():
    assert client.get("/api/v1/health").json() == {"status": "ok"}


@pytest.mark.parametrize("name", ["request-night.json", "request-crowd-avoidance.json"])
def test_recommend_demo_requests(name):
    resp = client.post("/api/v1/routes/recommend", json=json.loads((MOCKS / name).read_text(encoding="utf-8")))
    assert resp.status_code == 200, resp.text
    body = RouteRecommendationResponse.model_validate(resp.json())
    assert [r.rank for r in body.routes] == list(range(1, len(body.routes) + 1))
    assert body.metricSources is not None
    case = "night_walk" if "night" in name else "crowd_avoidance"
    assert body.interpretedPreference.caseType == case


def test_free_text_prompt_is_interpreted():
    resp = client.post(
        "/api/v1/routes/recommend",
        json={"start": "잠실역", "end": "석촌역", "departureTime": "2026-09-19T19:00:00+09:00",
              "preferenceText": "행사 하는 데는 피해줘. 5분 이상 돌아가긴 싫어"},
    )
    assert resp.status_code == 200, resp.text
    hc = resp.json()["interpretedPreference"]["hardConstraints"]
    assert hc["avoidActiveEvents"] is True
    assert hc["maxExtraMinutes"] == 5


def test_unknown_place_is_400():
    resp = client.post(
        "/api/v1/routes/recommend",
        json={"start": "광화문", "end": "석촌역", "departureTime": "2026-09-19T19:00:00+09:00", "preferenceText": "아무거나"},
    )
    if route_engine.candidates_are_mock():
        pytest.skip("mock 모드에서는 장소를 해석하지 않는다")
    assert resp.status_code == 400
    assert resp.json()["code"] == "INVALID_REQUEST"


def test_bad_departure_is_400():
    resp = client.post(
        "/api/v1/routes/recommend",
        json={"start": "잠실역", "end": "석촌역", "departureTime": "어제", "preferenceText": "아무거나"},
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "INVALID_REQUEST"


def test_schema_error_is_422():
    resp = client.post("/api/v1/routes/recommend", json={"start": "잠실역"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "SCHEMA_VALIDATION_ERROR"
