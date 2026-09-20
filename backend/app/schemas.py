from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class CrowdDirection(str, Enum):
    MORE = "more"
    LESS = "less"
    NEUTRAL = "neutral"


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    start: str = Field(min_length=1)
    end: str = Field(min_length=1)
    departureTime: str
    preferenceText: str = Field(min_length=1, max_length=500)


class HardConstraints(BaseModel):
    maxExtraMinutes: Optional[int] = Field(default=None, ge=0, le=60)
    minLightingScore: Optional[float] = Field(default=None, ge=0, le=100)
    minQuietScore: Optional[float] = Field(default=None, ge=0, le=100)
    avoidStairs: bool = False
    avoidActiveEvents: bool = False


class PreferenceWeights(BaseModel):
    crowdDirection: CrowdDirection = CrowdDirection.NEUTRAL
    crowdWeight: float = Field(ge=0, le=1)
    lightingWeight: float = Field(ge=0, le=1)
    distanceWeight: float = Field(ge=0, le=1)
    quietWeight: float = Field(ge=0, le=1)
    shadeWeight: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def weights_must_sum_to_one(self):
        total = (
            self.crowdWeight
            + self.lightingWeight
            + self.distanceWeight
            + self.quietWeight
            + self.shadeWeight
        )
        if abs(total - 1.0) > 0.001:
            raise ValueError("Preference weights must sum to 1.0")
        return self


class PreferenceProfile(BaseModel):
    caseType: str
    summary: str
    hardConstraints: HardConstraints
    preferences: PreferenceWeights
    explanation: List[str]
    ambiguityWarning: Optional[str] = None


class RouteMetrics(BaseModel):
    """경로당 집계 지표. 원본 데이터 → 점수 변환 규칙은 docs/data-spec.md 참고."""

    # 0~100 정규화 점수 — Preference 가중치와 1:1 대응
    crowdScore: float = Field(ge=0, le=100)
    lightingScore: float = Field(ge=0, le=100)
    quietScore: float = Field(ge=0, le=100)
    shadeScore: float = Field(ge=0, le=100)

    # 화면 근거용 개수 — 데이터 종류별 1개
    streetlightCount: int = Field(ge=0)
    shadeSpotCount: int = Field(ge=0)
    noiseSourceCount: int = Field(ge=0)
    crowdCellCount: int = Field(ge=0)
    activeEventCount: int = Field(ge=0)
    storeCount: int = Field(ge=0)


class CandidateRoute(BaseModel):
    routeId: str
    name: str
    durationMin: int = Field(gt=0)
    distanceM: int = Field(gt=0)
    hasStairs: bool = False
    coordinates: List[Coordinate]
    metrics: RouteMetrics


class ScoredRoute(CandidateRoute):
    rank: int = Field(ge=1)
    extraMinutes: int = Field(ge=0)
    matchScore: float = Field(ge=0, le=100)
    rejected: bool = False
    rejectionReasons: List[str] = []
    recommendationReasons: List[str] = []


class RouteRecommendationResponse(BaseModel):
    requestId: str
    interpretedPreference: PreferenceProfile
    routes: List[ScoredRoute]
    recommendationSummary: str
    dataTimestamp: str
    isMockData: bool
    # 지표별 데이터 출처. 키는 "crowd" | "lighting" | "quiet" | "shade" | "event" | "store",
    # 값은 "mock" | "missing" | 실데이터 출처명. 하나라도 mock/missing이면 isMockData=true.
    metricSources: Optional[Dict[str, str]] = None


class ErrorResponse(BaseModel):
    code: str
    message: str
    detail: Optional[str] = None
