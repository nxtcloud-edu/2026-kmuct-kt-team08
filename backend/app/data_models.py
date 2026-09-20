"""원본 데이터 행 모델.

backend/data/*.csv 의 한 행 = 아래 모델 하나.
현재 수집된 잠실역 반경 3km 데이터에 맞춰 S-DoT 실측 조도와
환경소음 타입을 추가하고, 생활인구 population을 float로 허용합니다.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ShadeType(str, Enum):
    TREE = "tree"
    BUILDING = "building"
    CANOPY = "canopy"


class NoiseType(str, Enum):
    ENVIRONMENT = "environment"
    TRAFFIC = "traffic"
    CONSTRUCTION = "construction"
    COMMERCIAL = "commercial"


class ZoneType(str, Enum):
    RESTAURANT = "restaurant"
    RETAIL = "retail"
    ENTERTAINMENT = "entertainment"
    MIXED = "mixed"


class StreetlightRow(BaseModel):
    """가로등 — streetlights.csv"""

    streetlight_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class StreetlightSegmentRow(BaseModel):
    """도로 구간별 가로등 개수 — streetlight_segments.csv"""

    segment_id: str
    start_lat: float = Field(ge=-90, le=90)
    start_lng: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    end_lng: float = Field(ge=-180, le=180)
    streetlight_count: int = Field(ge=0)


class ShadeRow(BaseModel):
    """그늘 정보 — shade.csv"""

    shade_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    shade_type: ShadeType
    shade_score: float = Field(ge=0, le=100)


class NoiseRow(BaseModel):
    """환경·교통·공사·상권 소음 — noise.csv"""

    noise_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    noise_level_db: float = Field(ge=0, le=140)
    occurred_at: str  # ISO 8601, 시간대 오프셋 포함
    noise_type: NoiseType


class LightingRow(BaseModel):
    """S-DoT 실측 조도 — lighting.csv"""

    sensor_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    illuminance_lux: float = Field(ge=0)
    measured_at: str  # ISO 8601, 시간대 오프셋 포함


class CrowdGridRow(BaseModel):
    """유동인구(혼잡도) — crowd_grid.csv. 격자 하나 × 시간대 하나 = 한 행"""

    grid_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    time_slot: int = Field(ge=0, le=23)
    population: float = Field(ge=0)
    crowd_score: float = Field(ge=0, le=100)


class EventRow(BaseModel):
    """행사 — events.csv"""

    event_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    start_time: str  # ISO 8601
    end_time: str  # ISO 8601
    is_active: bool
    expected_attendance: Optional[int] = Field(default=None, ge=0)


class StoreZoneRow(BaseModel):
    """상권 위치 — store_zones.csv"""

    zone_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    zone_type: ZoneType
    store_count: int = Field(ge=0)
