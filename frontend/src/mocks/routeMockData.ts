import { ConditionCategory, Location, RouteCandidate } from '../types';
import { percentPointsToLatLng } from '../mapProjection';

export const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc-seokchon-my',
    name: '내 위치',
    address: '서울 송파구 송파대로 지하 439 (석촌역 8·9호선 부근)',
    subText: '석촌역 8호선/9호선 부근',
    timeAgo: '현재 위치',
    isCurrent: true,
    lat: 37.5055,
    lng: 127.1069,
  },
  {
    id: 'loc-jamsil',
    name: '잠실역',
    address: '서울 송파구 올림픽로 지하 265',
    subText: '2호선·8호선 환승역',
    timeAgo: '방금 전',
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
    subText: 'KTX 경부선 · 1·4호선',
    timeAgo: '어제',
    lat: 37.5559,
    lng: 126.9723,
  },
  {
    id: 'loc-gwanghwamun',
    name: '광화문',
    address: '서울 종로구 세종대로 172',
    subText: '광화문광장 및 5호선',
    timeAgo: '3일 전',
    lat: 37.5759,
    lng: 126.9768,
  },
  {
    id: 'loc-sungshin',
    name: '성신여대입구역',
    address: '서울 성북구 동소문로 지하 102',
    subText: '4호선 및 우이신설선',
    timeAgo: '5일 전',
    lat: 37.5928,
    lng: 127.0167,
  },
  {
    id: 'loc-hyehwa',
    name: '혜화역',
    address: '서울 종로구 대학로 지하 120',
    subText: '4호선 마로니에공원',
    timeAgo: '1주일 전',
    lat: 37.5822,
    lng: 127.0019,
  },
  {
    id: 'loc-seokchon-lake',
    name: '석촌호수',
    address: '서울 송파구 잠실동 47',
    subText: '송파나루공원 수변 산책로',
    timeAgo: '2주일 전',
    lat: 37.5098,
    lng: 127.1045,
  },
];

export const MOCK_CONDITION_CATEGORIES: ConditionCategory[] = [
  {
    id: 'safety',
    title: '안전하게 걷기',
    subtitle: '치안·야간 조명',
    iconName: 'shield',
    conditions: [
      { id: 'cond-light-many', categoryId: 'safety', label: '가로등 많은 길', icon: 'lightbulb' },
      { id: 'cond-wide-road', categoryId: 'safety', label: '큰길 위주', icon: 'road' },
      { id: 'cond-bright', categoryId: 'safety', label: '밝은 길', icon: 'sun' },
      { id: 'cond-crowded', categoryId: 'safety', label: '사람 있는 길', icon: 'users' },
    ],
  },
  {
    id: 'pleasant',
    title: '쾌적하게 걷기',
    subtitle: '자연·휴식',
    iconName: 'trees',
    conditions: [
      { id: 'cond-shade', categoryId: 'pleasant', label: '그늘 많은 길', icon: 'umbrella' },
      { id: 'cond-green', categoryId: 'pleasant', label: '녹지 많은 길', icon: 'leaf' },
      { id: 'cond-quiet', categoryId: 'pleasant', label: '조용한 길', icon: 'volume-x' },
      { id: 'cond-less-people', categoryId: 'pleasant', label: '사람 적은 길', icon: 'user' },
    ],
  },
  {
    id: 'comfort',
    title: '편하게 걷기',
    subtitle: '경사·보행약자',
    iconName: 'accessibility',
    conditions: [
      { id: 'cond-low-slope', categoryId: 'comfort', label: '경사 낮은 길', icon: 'mountain' },
      { id: 'cond-no-stairs', categoryId: 'comfort', label: '계단 없는 길', icon: 'footprints' },
      { id: 'cond-wide-sidewalk', categoryId: 'comfort', label: '보행로 넓은 길', icon: 'columns' },
    ],
  },
  {
    id: 'movement',
    title: '이동하기 좋게',
    subtitle: '시설물·자전거',
    iconName: 'bike',
    conditions: [
      { id: 'cond-bike-road', categoryId: 'movement', label: '자전거도로 위주', icon: 'bike' },
      { id: 'cond-crosswalk', categoryId: 'movement', label: '횡단보도 위주', icon: 'hash' },
      { id: 'cond-overpass', categoryId: 'movement', label: '육교 위주', icon: 'bridge' },
    ],
  },
  {
    id: 'efficient',
    title: '효율적으로',
    subtitle: '시간·동선',
    iconName: 'zap',
    conditions: [
      { id: 'cond-fastest', categoryId: 'efficient', label: '최단시간', icon: 'clock' },
      { id: 'cond-short-dist', categoryId: 'efficient', label: '짧은 거리', icon: 'ruler' },
      { id: 'cond-low-signals', categoryId: 'efficient', label: '신호 적은 길', icon: 'traffic-cone' },
    ],
  },
];

const MOCK_ROUTES_BASE: Omit<RouteCandidate, 'coordinates'>[] = [
  {
    id: 'route-b',
    type: 'recommended',
    typeBadge: 'AI 추천★',
    duration: 18,
    durationText: '18분',
    distance: 1.2,
    distanceText: '1.2km',
    matchScore: 94,
    matchScoreText: '조건 94% 만족',
    subDescription: '가로등이 촘촘하고 넓은 송파대로 대로변 위주 안심 코스',
    arrivalTime: '오후 11:42 도착 예정',
    streetLightPercent: 94,
    mainRoadPercent: 82,
    slope: '완만',
    darkAlleyAvoidancePercent: 100,
    cctvCoveragePercent: 88,
    safetyScore: 98,
    safetyGrade: '안심도 최상',
    metrics: [
      { label: '가로등 많음', value: '94%', icon: '💡' },
      { label: '큰길 위주', value: '82%', icon: '🚦' },
      { label: '완만한 경사', value: '1.8°', icon: '⛰️' },
      { label: '어두운 골목 회피', value: '100%', icon: '🛡️' },
    ],
    waysChoice: {
      title: "이 길을 추천해요! Way's Choice",
      comment:
        '가로등이 촘촘하고 넓은 송파대로 대로변 위주로 구성되어 늦은 밤에도 밝고 보행 안전도가 가장 높은 경로예요.',
      tradeoffNote:
        '최단 경로보다 4분 더 걸리지만, 회원님이 설정하신 야간 안심 조건을 가장 완벽하게 만족해요.',
    },
    analytics: {
      averageLux: 94,
      sidewalkWidth: 3.8,
      cctvDensity: '매우 높음',
    },
    highlights: [
      {
        id: 'hl-light',
        title: '송파대로 스마트 안심존',
        subTitle: '평균 94lx · 가로등 18개',
        type: 'light',
        x: 48,
        y: 42,
      },
      {
        id: 'hl-cctv',
        title: '송파대로 CCTV 구역',
        subTitle: '사각지대 없음 · 12대 감시 중',
        type: 'cctv',
        x: 62,
        y: 35,
      },
      {
        id: 'hl-sidewalk',
        title: '대로변 보행로 (820m)',
        subTitle: '보행자 전용도로 폭 3.8m',
        type: 'sidewalk',
        x: 52,
        y: 22,
      },
    ],
    pathPoints: [
      { x: 80.7, y: 84.5 }, // 출발지 (석촌역) — 실제 위경도 기준 지도상 위치
      { x: 80.7, y: 64 },
      { x: 55, y: 64 },
      { x: 55, y: 30 },
      { x: 21.1, y: 30 },
      { x: 21.1, y: 15.5 }, // 목적지 (잠실역)
    ],
    sections: [
      {
        id: 'sec-1',
        stepNumber: 1,
        range: '출발 ~ 350m (약 5분)',
        title: '석촌역 1번 출구 송파대로 보행로 진입',
        description:
          '넓은 8차선 대로 보행로를 따라 직진합니다. 보행자 스마트 가로등 18개가 연동되어 시야가 매우 선명합니다.',
        badge: { text: '조도 95lx', variant: 'blue' },
        featureBadge: { text: '보행자 횡단보도 (음향신호기 구비)', icon: 'traffic-light' },
      },
      {
        id: 'sec-2',
        stepNumber: 2,
        range: '350m ~ 850m (약 7분)',
        title: '송파대로 스마트 안심 가로등 보행존',
        description:
          '가장 높은 조도를 유지하는 모범 안심 구역입니다. 늦은 밤에도 버스정류장과 석촌호수 인근 24시간 편의시설이 인접해 있습니다.',
        badge: { text: 'CCTV 12대 집중', variant: 'green' },
        featureBadge: { text: '안심 비상벨 기동 3개소 위치', icon: 'shield' },
      },
      {
        id: 'sec-3',
        stepNumber: 3,
        range: '850m ~ 1.2km (약 6분)',
        title: '잠실역 3번 출구 방면 평탄 보행로',
        description:
          '가파른 골목길 대신, 유모차와 보행자 모두 편안하게 통행 가능한 턱 없는 무장애 송파대로 보도블록 구간입니다.',
        badge: { text: '경사도 1.8° (평탄)', variant: 'blue' },
        featureBadge: { text: '계단 0개 · 턱 없는 무장애 보도블록', icon: 'stairs' },
      },
    ],
  },
  {
    id: 'route-c',
    type: 'alternative',
    typeBadge: '대안 경로',
    duration: 16,
    durationText: '16분',
    distance: 1.1,
    distanceText: '1.1km',
    matchScore: 72,
    matchScoreText: '조건 72% 만족',
    subDescription: '소공원 및 완만한 주택가 둘레길 경유',
    arrivalTime: '오후 11:40 도착 예정',
    streetLightPercent: 68,
    mainRoadPercent: 64,
    slope: '보통',
    darkAlleyAvoidancePercent: 82,
    cctvCoveragePercent: 72,
    safetyScore: 84,
    safetyGrade: '안심도 보통',
    metrics: [
      { label: '가로등 보통', value: '68%', icon: '💡' },
      { label: '대로+골목', value: '64%', icon: '🚦' },
      { label: '일반 경사', value: '4.8°', icon: '⛰️' },
      { label: '골목 부분 통과', value: '82%', icon: '🛡️' },
    ],
    waysChoice: {
      title: '시간을 2분 절약하는 대안 경로',
      comment:
        '시간을 단축할 수 있지만 주택가 초입 120m 구간은 조도가 다소 낮아 큰길 위주 보행을 원하시면 추천 경로가 더 적합해요.',
      tradeoffNote:
        '최단 경로보다 2분 더 걸리며 안전도는 적절하지만 일부 완만한 오르막이 있습니다.',
    },
    analytics: {
      averageLux: 68,
      sidewalkWidth: 2.4,
      cctvDensity: '보통',
    },
    highlights: [
      {
        id: 'hl-alt-1',
        title: '공원 산책로 조명 구간',
        subTitle: '조도 72lx',
        type: 'light',
        x: 35,
        y: 46,
      },
    ],
    pathPoints: [
      { x: 80.7, y: 84.5 }, // 출발지 (석촌역)
      { x: 66, y: 84.5 },
      { x: 66, y: 46 },
      { x: 38, y: 46 },
      { x: 21.1, y: 15.5 }, // 목적지 (잠실역)
    ],
    sections: [
      {
        id: 'sec-c1',
        stepNumber: 1,
        range: '출발 ~ 400m (약 6분)',
        title: '이면도로 및 소공원 진입',
        description: '공원 가장자리 보행로를 이용합니다. 가로등 조도가 중간 수준으로 유지됩니다.',
        badge: { text: '조도 72lx', variant: 'blue' },
      },
      {
        id: 'sec-c2',
        stepNumber: 2,
        range: '400m ~ 1.1km (약 10분)',
        title: '완만한 주택가 도로 통과',
        description: '보차 혼용 도로이며 보행 시 주의가 필요합니다.',
        badge: { text: 'CCTV 5대', variant: 'amber' },
      },
    ],
  },
  {
    id: 'route-a',
    type: 'fastest',
    typeBadge: '최단 경로',
    duration: 14,
    durationText: '14분',
    distance: 1.0,
    distanceText: '1.0km',
    matchScore: 42,
    matchScoreText: '골목길 다수 포함',
    subDescription: '골목 지름길 및 계단 구간 포함',
    arrivalTime: '오후 11:38 도착 예정',
    streetLightPercent: 42,
    mainRoadPercent: 38,
    slope: '높음',
    darkAlleyAvoidancePercent: 38,
    cctvCoveragePercent: 46,
    safetyScore: 62,
    safetyGrade: '보행 주의',
    metrics: [
      { label: '가로등 적음', value: '42%', icon: '💡' },
      { label: '골목길 다수', value: '38%', icon: '🚦' },
      { label: '가파른 경사', value: '8.2°', icon: '⛰️' },
      { label: '골목길 통과', value: '38%', icon: '⚠️' },
    ],
    waysChoice: {
      title: '가장 빠르지만 어두운 지름길',
      comment:
        '직선거리 지름길이라 14분 만에 도착하지만, 좁은 비탈 골목과 야간 가로등이 드문 구간이 350m 포함되어 있어요.',
      tradeoffNote: '가장 빠르지만 설정하신 밝은 길 및 안심 기준에는 부합하지 않습니다.',
    },
    analytics: {
      averageLux: 42,
      sidewalkWidth: 1.5,
      cctvDensity: '낮음',
    },
    highlights: [
      {
        id: 'hl-fast-1',
        title: '골목길 주의 구간',
        subTitle: '가로등 3개소 간격 멂',
        type: 'slope',
        x: 42,
        y: 50,
      },
    ],
    pathPoints: [
      { x: 80.7, y: 84.5 }, // 출발지 (석촌역)
      { x: 50, y: 50 },
      { x: 21.1, y: 15.5 }, // 목적지 (잠실역)
    ],
    sections: [
      {
        id: 'sec-a1',
        stepNumber: 1,
        range: '출발 ~ 500m (약 7분)',
        title: '골목 지름길 및 비탈로 통과',
        description: '조도가 어둡고 경사가 있는 골목길을 통과합니다.',
        badge: { text: '조도 38lx (어두움)', variant: 'amber' },
      },
      {
        id: 'sec-a2',
        stepNumber: 2,
        range: '500m ~ 1.0km (약 7분)',
        title: '계단길 및 뒷골목 통과',
        description: '계단 45개 및 좁은 골목을 통과하여 정문에 도달합니다.',
        badge: { text: '계단 45개', variant: 'amber' },
      },
    ],
  },
];

/**
 * 카카오맵 Polyline용 위경도(coordinates)를 pathPoints(퍼센트)에서 역산해 채웁니다.
 * 백엔드 연동 전 오프라인/폴백 상황에서도 실제 지도 위에 경로가 그려지도록 합니다.
 */
export const MOCK_ROUTES: RouteCandidate[] = MOCK_ROUTES_BASE.map((r) => ({
  ...r,
  coordinates: percentPointsToLatLng(r.pathPoints),
}));
