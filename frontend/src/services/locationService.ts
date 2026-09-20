import { Location } from '../types';

/**
 * 백엔드(route_engine.py PLACES)와 동일한 지원 장소 사전.
 * 메인화면에서 텍스트 입력 시 실제 좌표로 지도에 마커를 찍기 위해 사용한다.
 * 백엔드가 실제 길찾기를 지원하는 잠실~석촌 일대 장소들이다.
 */
export const KNOWN_PLACES: Record<string, { lat: number; lng: number }> = {
  잠실역: { lat: 37.5133, lng: 127.1001 },
  잠실: { lat: 37.5133, lng: 127.1001 },
  석촌역: { lat: 37.5055, lng: 127.1067 },
  석촌: { lat: 37.5055, lng: 127.1067 },
  롯데월드타워: { lat: 37.5126, lng: 127.1026 },
  롯데월드몰: { lat: 37.5126, lng: 127.1026 },
  롯데월드: { lat: 37.5111, lng: 127.0982 },
  석촌호수: { lat: 37.5089, lng: 127.1035 },
  석촌호수동호: { lat: 37.5093, lng: 127.1063 },
  석촌호수서호: { lat: 37.5085, lng: 127.1003 },
  잠실새내역: { lat: 37.5116, lng: 127.0863 },
  송파나루역: { lat: 37.5107, lng: 127.1123 },
  삼전역: { lat: 37.5045, lng: 127.0912 },
};

/**
 * 입력 텍스트를 지원 장소 사전과 매칭해 좌표를 찾는다.
 * 정확히 일치하거나 부분 일치하면 좌표를 반환, 없으면 null.
 */
export function lookupKnownPlace(text: string): { lat: number; lng: number } | null {
  const key = text.replace(/\s+/g, '');
  if (!key) return null;
  if (KNOWN_PLACES[key]) return KNOWN_PLACES[key];
  for (const [name, coord] of Object.entries(KNOWN_PLACES)) {
    if (name.includes(key) || key.includes(name)) return coord;
  }
  return null;
}

/**
 * ============================================================================
 * MYWAY Location Service (개발용 Mock Location 및 위치 추상화 레이어)
 * ============================================================================
 * 
 * [아키텍처 가이드]
 * 현재 구조:
 *   UI Component -> locationService -> Mock Location Data
 * 
 * 추후 Kiro 다운로드 후 구조:
 *   UI Component -> locationService -> Browser Geolocation API / 실제 지도 위치 API
 * 
 * * 중요: 브라우저의 실제 Geolocation API 및 권한 팝업을 호출하지 않으며,
 *         UI Component와 위치 데이터 소스를 완전히 디커플링합니다.
 */

// 1. 개발용 Mock 출발지 (석촌역 / 화면상 "내 위치"로 표시)
export const MOCK_CURRENT_LOCATION: Location = {
  id: 'loc-seokchon-my',
  name: '내 위치',
  address: '서울 송파구 송파대로 지하 439 (석촌역 8·9호선 부근)',
  subText: '석촌역 8호선/9호선 부근',
  timeAgo: '현재 위치',
  lat: 37.5055,
  lng: 127.1069,
  isCurrent: true,
};

// 2. 개발용 Mock 기본 목적지 (잠실역 / 사용자가 선택한 장소)
export const MOCK_DEFAULT_DESTINATION: Location = {
  id: 'loc-jamsil',
  name: '잠실역',
  address: '서울 송파구 올림픽로 지하 265 (2호선·8호선)',
  subText: '2호선·8호선 환승역',
  timeAgo: '방금 전',
  lat: 37.5133,
  lng: 127.1001,
};

// 3. 목적지 검색 및 최근 목적지용 Mock 데이터 (사용자 요청 예시 목적지 포함)
export const MOCK_DESTINATION_LIST: Location[] = [
  {
    id: 'loc-jamsil',
    name: '잠실역',
    address: '서울 송파구 올림픽로 지하 265',
    subText: '2호선·8호선 환승역',
    timeAgo: '최근 방문',
    lat: 37.5133,
    lng: 127.1001,
  },
  {
    id: 'loc-kookmin',
    name: '국민대학교',
    address: '서울 성북구 정릉로 77',
    subText: '국민대학교 정문 및 북악관',
    timeAgo: '35분 전',
    lat: 37.6108,
    lng: 126.9972,
  },
  {
    id: 'loc-seoul-station',
    name: '서울역',
    address: '서울 용산구 한강대로 405',
    subText: 'KTX 경부선 · 1호선 · 4호선 · 공항철도',
    timeAgo: '어제',
    lat: 37.5559,
    lng: 126.9723,
  },
  {
    id: 'loc-gwanghwamun',
    name: '광화문',
    address: '서울 종로구 세종대로 172',
    subText: '광화문광장 · 5호선 광화문역',
    timeAgo: '3일 전',
    lat: 37.5759,
    lng: 126.9768,
  },
  {
    id: 'loc-sungshin',
    name: '성신여대입구역',
    address: '서울 성북구 동소문로 지하 102',
    subText: '4호선 · 우이신설선 환승역',
    timeAgo: '5일 전',
    lat: 37.5928,
    lng: 127.0167,
  },
  {
    id: 'loc-hyehwa',
    name: '혜화역',
    address: '서울 종로구 대학로 지하 120',
    subText: '4호선 · 대학로 마로니에 공원',
    timeAgo: '1주일 전',
    lat: 37.5822,
    lng: 127.0019,
  },
  {
    id: 'loc-seokchon-lake',
    name: '석촌호수',
    address: '서울 송파구 잠실동 47',
    subText: '송파나루공원 동호/서호 수변 산책로',
    timeAgo: '2주일 전',
    lat: 37.5098,
    lng: 127.1045,
  },
];

export class LocationService {
  private recentDestinations: Location[] = [...MOCK_DESTINATION_LIST];

  /**
   * 현재 위치 가져오기 (동기형 기본값)
   * UI 초기 렌더링 시 깜빡임 없이 Mock 위치를 즉시 바인딩하기 위해 사용
   */
  getMockCurrentLocation(): Location {
    return { ...MOCK_CURRENT_LOCATION };
  }

  /**
   * 기본 목적지 가져오기 (동기형 기본값: 잠실역)
   */
  getMockDefaultDestination(): Location {
    return { ...MOCK_DEFAULT_DESTINATION };
  }

  /**
   * 현재 위치 가져오기 (비동기 인터페이스)
   *
   * 브라우저 Geolocation API로 실제 현재 위치를 추적합니다.
   * - HTTPS 또는 localhost(보안 컨텍스트)에서만 동작합니다.
   * - 권한 거부/타임아웃/미지원/비보안 컨텍스트일 때는 Mock 위치(석촌역)로 폴백합니다.
   *
   * @param options.fallbackOnError false 로 주면 실패 시 예외를 던집니다(기본 true: Mock 폴백).
   */
  async getCurrentLocation(options?: { fallbackOnError?: boolean }): Promise<Location> {
    const fallbackOnError = options?.fallbackOnError ?? true;

    const geo =
      typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    const isSecure =
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');

    // Geolocation 미지원 또는 비보안 컨텍스트(예: http://공인IP:3000)
    if (!geo || !isSecure) {
      if (!isSecure) {
        console.warn(
          '[locationService] 비보안 컨텍스트(HTTP)에서는 위치 추적이 차단됩니다. ' +
            'HTTPS 또는 localhost 로 접속하세요. Mock 위치로 대체합니다.',
        );
      }
      if (fallbackOnError) return { ...MOCK_CURRENT_LOCATION };
      throw new Error('GEOLOCATION_UNAVAILABLE');
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        geo.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 30_000,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      console.debug('[locationService] GPS 현재 위치 획득', { latitude, longitude, accuracy });
      return {
        id: 'loc-current-gps',
        name: '내 위치',
        address: await this.reverseGeocode(latitude, longitude),
        subText: `GPS 실시간 위치 (정확도 약 ${Math.round(accuracy)}m)`,
        timeAgo: '현재 위치',
        lat: latitude,
        lng: longitude,
        isCurrent: true,
      };
    } catch (err) {
      console.warn('[locationService] 위치 가져오기 실패 — Mock 위치로 대체합니다.', err);
      if (fallbackOnError) return { ...MOCK_CURRENT_LOCATION };
      throw err;
    }
  }

  /**
   * 좌표 → 주소 문자열 (카카오 지도 SDK가 로드된 경우에만 역지오코딩).
   * SDK가 없으면 좌표를 그대로 표기합니다.
   */
  private async reverseGeocode(lat: number, lng: number): Promise<string> {
    const kakao = typeof window !== 'undefined' ? (window as any).kakao : undefined;
    const geocoder =
      kakao?.maps?.services && new kakao.maps.services.Geocoder();
    if (!geocoder) {
      return `현재 좌표 (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }
    return new Promise<string>((resolve) => {
      geocoder.coord2Address(lng, lat, (result: any[], status: string) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const road = result[0].road_address?.address_name;
          const jibun = result[0].address?.address_name;
          resolve(road || jibun || `현재 좌표 (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        } else {
          resolve(`현재 좌표 (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        }
      });
    });
  }

  /**
   * 최근/추천 목적지 목록 조회
   */
  async getRecentDestinations(): Promise<Location[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([...this.recentDestinations]);
      }, 30);
    });
  }

  /**
   * 목적지 검색 (Mock Data 기반 검색 지원)
   * - 국민대학교, 서울역, 광화문, 성신여대입구역, 혜화역, 잠실역 등 검색 지원
   */
  async searchDestinations(query: string): Promise<Location[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return this.getRecentDestinations();
    }

    const matches = this.recentDestinations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(trimmed) ||
        loc.address.toLowerCase().includes(trimmed) ||
        (loc.subText && loc.subText.toLowerCase().includes(trimmed))
    );

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(matches);
      }, 30);
    });
  }

  /**
   * 새 목적지 선택 시 최근 목록 상단에 추가/업데이트
   */
  addRecentDestination(location: Location): void {
    const filtered = this.recentDestinations.filter((loc) => loc.id !== location.id);
    this.recentDestinations = [{ ...location, timeAgo: '방금 전' }, ...filtered];
  }
}

// 싱글톤 인스턴스 export
export const locationService = new LocationService();
