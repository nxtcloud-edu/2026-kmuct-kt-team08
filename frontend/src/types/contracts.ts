export type CrowdDirection = "more" | "less" | "neutral";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteRequest {
  start: string;
  end: string;
  departureTime: string;
  preferenceText: string;
}

export interface HardConstraints {
  maxExtraMinutes: number | null;
  minLightingScore: number | null;
  minQuietScore: number | null;
  avoidStairs: boolean;
  avoidActiveEvents: boolean;
}

export interface PreferenceWeights {
  crowdDirection: CrowdDirection;
  crowdWeight: number;
  lightingWeight: number;
  distanceWeight: number;
  quietWeight: number;
  shadeWeight: number;
}

export interface PreferenceProfile {
  caseType: string;
  summary: string;
  hardConstraints: HardConstraints;
  preferences: PreferenceWeights;
  explanation: string[];
  ambiguityWarning: string | null;
}

export interface RouteMetrics {
  // 0~100 정규화 점수
  crowdScore: number;
  lightingScore: number;
  quietScore: number;
  shadeScore: number;
  // 화면 근거용 개수
  streetlightCount: number;
  shadeSpotCount: number;
  noiseSourceCount: number;
  crowdCellCount: number;
  activeEventCount: number;
  storeCount: number;
}

export interface ScoredRoute {
  routeId: string;
  name: string;
  durationMin: number;
  distanceM: number;
  hasStairs: boolean;
  coordinates: Coordinate[];
  metrics: RouteMetrics;
  rank: number;
  extraMinutes: number;
  matchScore: number;
  rejected: boolean;
  rejectionReasons: string[];
  recommendationReasons: string[];
}

/** 키: "crowd" | "lighting" | "quiet" | "shade" | "event" | "store". 값: "mock" | "missing" | 실데이터 출처명 */
export type MetricSources = Record<string, string>;

export interface RouteRecommendationResponse {
  requestId: string;
  interpretedPreference: PreferenceProfile;
  routes: ScoredRoute[];
  recommendationSummary: string;
  dataTimestamp: string;
  isMockData: boolean;
  metricSources: MetricSources | null;
}
