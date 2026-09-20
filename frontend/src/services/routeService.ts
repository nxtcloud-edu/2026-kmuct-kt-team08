import {
  MOCK_CONDITION_CATEGORIES,
  MOCK_ROUTES,
} from '../mocks/routeMockData';
import { ConditionCategory, Location, RouteCandidate } from '../types';
import { locationService } from './locationService';
import {
  BackendError,
  BackendPreference,
  fetchRecommendation,
  toRouteCandidates,
} from './backendApi';

export interface RouteSearchParams {
  origin: Location;
  destination: Location;
  selectedConditions: string[];
  naturalLanguageQuery?: string;
  /** 미지정 시 현재 시각 */
  departureTime?: string;
}

export interface RouteSearchResponse {
  routes: RouteCandidate[];
  defaultSelectedRouteId: string;
  recommendedRoute: RouteCandidate;
  aiExplanation: string;
  /** 백엔드가 해석한 선호 (AI 분석 화면용). 백엔드 연결 실패 시 undefined */
  interpreted?: BackendPreference;
  /** 지표별 데이터 출처. mock/missing 이 있으면 "데모 데이터" 배지 */
  metricSources?: Record<string, string> | null;
  /** 백엔드가 아니라 mock 으로 응답했는지 */
  usedFallback?: boolean;
}

/** 백엔드는 장소명 사전 13곳 또는 "lat,lng" 를 받는다. 좌표가 있으면 좌표를 쓴다. */
function toPlace(loc: Location): string {
  if (typeof loc.lat === 'number' && typeof loc.lng === 'number' && (loc.lat || loc.lng)) {
    return `${loc.lat},${loc.lng}`;
  }
  return loc.name;
}

/** 선택한 조건 칩 + 자연어 입력을 백엔드가 읽는 한 문장으로 */
function toPreferenceText(params: RouteSearchParams): string {
  const parts = [...params.selectedConditions];
  if (params.naturalLanguageQuery?.trim()) parts.push(params.naturalLanguageQuery.trim());
  return parts.join(', ') || '빠른 길';
}

/** ISO 8601 + KST 오프셋 */
function nowKstIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${kst.getFullYear()}-${p(kst.getMonth() + 1)}-${p(kst.getDate())}` +
    `T${p(kst.getHours())}:${p(kst.getMinutes())}:00+09:00`
  );
}

export class RouteService {
  /**
   * Fetch recent/favorite search locations via locationService
   */
  async getRecentLocations(): Promise<Location[]> {
    return locationService.getRecentDestinations();
  }

  /**
   * Search locations by query string via locationService
   */
  async searchLocations(query: string): Promise<Location[]> {
    return locationService.searchDestinations(query);
  }

  /**
   * Retrieve all selectable condition categories
   */
  async getConditionCategories(): Promise<ConditionCategory[]> {
    return new Promise((resolve) => {
      resolve([...MOCK_CONDITION_CATEGORIES]);
    });
  }

  /**
   * Parse natural language input into detected tags / keywords
   */
  detectKeywordsFromNaturalText(text: string): string[] {
    const keywords: string[] = [];
    if (!text || !text.trim()) return keywords;

    const lower = text.toLowerCase();

    // 1. 혼잡 / 사람 적은 길 ("혼잡 적게")
    if (
      lower.includes('붐비지') ||
      lower.includes('혼잡') ||
      lower.includes('복잡하지') ||
      lower.includes('사람 적') ||
      lower.includes('사람이 적') ||
      lower.includes('한산') ||
      lower.includes('사람 없는')
    ) {
      keywords.push('혼잡 적게');
    }

    // 2. 밝은 길 / 조명 ("밝은 길")
    if (
      lower.includes('밝은') ||
      lower.includes('밝고') ||
      lower.includes('가로등') ||
      lower.includes('조명') ||
      lower.includes('환한') ||
      lower.includes('야간 조명')
    ) {
      keywords.push('밝은 길');
    }

    // 3. 조용한 길 / 번화가 피하기 ("조용한 길")
    if (
      lower.includes('조용') ||
      lower.includes('한적') ||
      lower.includes('시끄러') ||
      lower.includes('번화가') ||
      lower.includes('소음') ||
      lower.includes('상권 피')
    ) {
      keywords.push('조용한 길');
    }

    // 4. 시간 우회 허용 ("5분 우회 허용" or "{N}분 우회 허용")
    const timeDetourMatch = text.match(/(\d+)\s*분(?:\s*정도)?\s*(?:더\s*걸|돌아|우회|걸려|소요|추가)/);
    if (timeDetourMatch) {
      keywords.push(`${timeDetourMatch[1]}분 우회 허용`);
    } else if (
      lower.includes('우회 허용') ||
      lower.includes('우회') ||
      lower.includes('돌아가도') ||
      lower.includes('더 걸려도') ||
      lower.includes('더 걸리는')
    ) {
      keywords.push('우회 허용');
    }

    // 5. 골목 피하기
    if (lower.includes('골목') || lower.includes('어두운')) {
      keywords.push('골목 회피');
    }

    // 6. 큰길 / 대로
    if (lower.includes('큰길') || lower.includes('대로')) {
      keywords.push('큰길 위주');
    }

    // 7. 경사 / 계단
    if (lower.includes('경사') || lower.includes('완만') || lower.includes('계단')) {
      keywords.push('경사 낮은 길');
    }

    // 8. 최단시간
    if (lower.includes('빠른') || lower.includes('급해') || lower.includes('최단')) {
      keywords.push('최단시간');
    }

    return Array.from(new Set(keywords));
  }

  /**
   * Request AI route recommendations
   */
  async fetchRouteRecommendations(params: RouteSearchParams): Promise<RouteSearchResponse> {
    const departureTime = params.departureTime ?? nowKstIso();
    const requestBody = {
      start: toPlace(params.origin),
      end: toPlace(params.destination),
      departureTime,
      preferenceText: toPreferenceText(params),
    };
    // 디버그: 실제로 백엔드에 전송하는 출발/도착 값 (브라우저 콘솔에서 확인)
    console.debug('[routeService] 길찾기 요청', {
      origin: { name: params.origin.name, lat: params.origin.lat, lng: params.origin.lng, isCurrent: params.origin.isCurrent },
      destination: { name: params.destination.name, lat: params.destination.lat, lng: params.destination.lng },
      sent: requestBody,
    });
    try {
      const resp = await fetchRecommendation(requestBody);

      const routes = toRouteCandidates(resp, departureTime);
      const firstPassing = resp.routes.find((b) => !b.rejected);
      const recommended =
        routes.find((r) => r.id === firstPassing?.routeId) ?? routes[0];

      return {
        routes,
        defaultSelectedRouteId: recommended.id,
        recommendedRoute: recommended,
        aiExplanation: resp.recommendationSummary,
        interpreted: resp.interpretedPreference,
        metricSources: resp.metricSources,
        usedFallback: false,
      };
    } catch (error) {
      // 서비스 지역(잠실~석촌) 밖 입력은 mock 으로 감추지 않고 사용자에게 명확히 알린다.
      if (error instanceof BackendError && error.code === 'OUT_OF_SERVICE_AREA') {
        throw error;
      }
      console.warn('[routeService] 백엔드 호출 실패 — mock 으로 대체합니다.', error);
      const routes = [...MOCK_ROUTES];
      const recommended = routes.find((r) => r.id === 'route-b') || routes[0];
      return {
        routes,
        defaultSelectedRouteId: recommended.id,
        recommendedRoute: recommended,
        aiExplanation:
          '최단 경로보다 4분 더 걸리지만, 요청하신 야간 안심 조건(가로등 94%, 큰길 82%)을 가장 완벽하게 만족합니다.',
        usedFallback: true,
      };
    }
  }

  /**
   * Get single route detail by ID
   */
  async getRouteById(routeId: string): Promise<RouteCandidate | null> {
    const route = MOCK_ROUTES.find((r) => r.id === routeId);
    return route ? { ...route } : null;
  }
}

// Singleton instance export for easy consumption in components and pages
export const routeService = new RouteService();
