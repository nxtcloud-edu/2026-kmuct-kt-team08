/**
 * 백엔드(FastAPI) 연결 + 응답 → 프론트 RouteCandidate 변환.
 *
 * 백엔드 계약: POST /api/v1/routes/recommend
 * 응답 스키마는 backend/app/schemas.py 의 RouteRecommendationResponse 와 동일합니다.
 */
import { RouteCandidate } from '../types';
import { toPercentPoints } from '../mapProjection';

// 기본은 같은 origin('') — Vite proxy(/api)로 백엔드에 전달되어 mixed content/CORS 없음.
// 절대 URL 이 꼭 필요하면 VITE_API_BASE 로 덮어쓸 수 있음.
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

// ---------------------------------------------------------------- 백엔드 타입

export interface BackendCoordinate {
  lat: number;
  lng: number;
}

export interface BackendMetrics {
  crowdScore: number;
  lightingScore: number;
  quietScore: number;
  shadeScore: number;
  streetlightCount: number;
  shadeSpotCount: number;
  noiseSourceCount: number;
  crowdCellCount: number;
  activeEventCount: number;
  storeCount: number;
}

export interface BackendRoute {
  routeId: string;
  name: string;
  durationMin: number;
  distanceM: number;
  hasStairs: boolean;
  coordinates: BackendCoordinate[];
  metrics: BackendMetrics;
  rank: number;
  extraMinutes: number;
  matchScore: number;
  rejected: boolean;
  rejectionReasons: string[];
  recommendationReasons: string[];
}

export interface BackendPreference {
  caseType: string;
  summary: string;
  hardConstraints: {
    maxExtraMinutes: number | null;
    minLightingScore: number | null;
    minQuietScore: number | null;
    avoidStairs: boolean;
    avoidActiveEvents: boolean;
  };
  preferences: {
    crowdDirection: 'more' | 'less' | 'neutral';
    crowdWeight: number;
    lightingWeight: number;
    distanceWeight: number;
    quietWeight: number;
    shadeWeight: number;
  };
  explanation: string[];
  ambiguityWarning: string | null;
}

export interface BackendResponse {
  requestId: string;
  interpretedPreference: BackendPreference;
  routes: BackendRoute[];
  recommendationSummary: string;
  dataTimestamp: string;
  isMockData: boolean;
  metricSources: Record<string, string> | null;
}

export interface BackendRequest {
  start: string;
  end: string;
  departureTime: string;
  preferenceText: string;
}

// ---------------------------------------------------------------- 호출

/** 백엔드가 반환한 구조화된 오류 (code 로 분기 가능) */
export class BackendError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(`${code}: ${message}${detail ? ` (${detail})` : ''}`);
    this.name = 'BackendError';
    this.code = code;
    this.detail = detail;
  }
}

export async function fetchRecommendation(req: BackendRequest): Promise<BackendResponse> {
  const res = await fetch(`${BASE}/api/v1/routes/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ code: String(res.status), message: res.statusText }));
    throw new BackendError(err.code ?? String(res.status), err.message ?? res.statusText, err.detail);
  }
  return res.json();
}

export async function isBackendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 변환

function grade(score: number): string {
  if (score >= 80) return '매우 안전';
  if (score >= 60) return '안전';
  if (score >= 40) return '보통';
  return '주의';
}

function arrivalTime(departureISO: string, durationMin: number): string {
  const t = new Date(departureISO);
  t.setMinutes(t.getMinutes() + durationMin);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

function routeType(r: BackendRoute): RouteCandidate['type'] {
  if (r.rank === 1 && !r.rejected) return 'recommended';
  if (r.extraMinutes === 0) return 'fastest';
  return 'alternative';
}

/**
 * 백엔드 ScoredRoute → 프론트 RouteCandidate.
 *
 * 백엔드에 없는 지표는 0 / '데이터 없음' 으로 둡니다 (지어내지 않음):
 *   mainRoadPercent, cctvCoveragePercent, analytics.averageLux, analytics.sidewalkWidth,
 *   analytics.cctvDensity, slope
 * 실제로 있는 지표는 metrics[] 에 전부 넣습니다: 혼잡 · 조도 · 조용함 · 그늘
 */
export function toRouteCandidate(r: BackendRoute, departureISO: string): RouteCandidate {
  const m = r.metrics;
  const km = r.distanceM / 1000;
  return {
    id: r.routeId,
    type: routeType(r),
    typeBadge: r.name,
    duration: r.durationMin,
    durationText: `${r.durationMin}분`,
    distance: Number(km.toFixed(2)),
    distanceText: `${km.toFixed(1)}km`,
    matchScore: Math.round(r.matchScore),
    matchScoreText: r.rejected ? '조건 미달' : `${Math.round(r.matchScore)}%`,
    subDescription: r.rejected
      ? r.rejectionReasons.join(' ')
      : r.recommendationReasons[0] ?? `${r.extraMinutes}분 추가`,
    arrivalTime: arrivalTime(departureISO, r.durationMin),

    streetLightPercent: Math.round(m.lightingScore),
    mainRoadPercent: 0, // 백엔드에 없음
    slope: r.hasStairs ? '보통' : '낮음', // 경사 데이터 없음 — 계단 유무만 반영
    darkAlleyAvoidancePercent: Math.round(m.lightingScore),
    cctvCoveragePercent: 0, // 백엔드에 없음
    safetyScore: Math.round(m.lightingScore),
    safetyGrade: grade(m.lightingScore),

    metrics: [
      { label: '혼잡도', value: `${Math.round(m.crowdScore)}점`, icon: 'users' },
      { label: '밝기', value: `${Math.round(m.lightingScore)}점`, icon: 'lightbulb' },
      { label: '조용함', value: `${Math.round(m.quietScore)}점`, icon: 'volume-x' },
      { label: '그늘', value: `${Math.round(m.shadeScore)}점`, icon: 'tree-pine' },
      { label: '가로등', value: `${m.streetlightCount}개`, icon: 'lamp' },
      { label: '주변 상가', value: `${m.storeCount}곳`, icon: 'store' },
    ],

    waysChoice: {
      title: r.rejected ? '조건에 맞지 않아요' : `${r.name}을 고른 이유`,
      comment: r.rejected ? r.rejectionReasons.join(' ') : r.recommendationReasons.join(' '),
      tradeoffNote:
        r.extraMinutes > 0 ? `최단 경로보다 ${r.extraMinutes}분 더 걸려요` : '최단 경로예요',
    },

    analytics: { averageLux: 0, sidewalkWidth: 0, cctvDensity: '데이터 없음' },
    sections: [],
    highlights: [],

    // 위경도 → 지도 SVG 퍼센트 좌표
    pathPoints: toPercentPoints(r.coordinates),
    // 카카오맵 Polyline 등에 쓰는 원본 위경도
    coordinates: r.coordinates.map((c) => ({ lat: c.lat, lng: c.lng })),
  };
}

export function toRouteCandidates(resp: BackendResponse, departureISO: string): RouteCandidate[] {
  return resp.routes.map((r) => toRouteCandidate(r, departureISO));
}
