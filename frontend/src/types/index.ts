export interface Location {
  id: string;
  name: string;
  address: string;
  subText?: string;
  timeAgo?: string;
  lat: number;
  lng: number;
  isCurrent?: boolean;
}

export interface Condition {
  id: string;
  categoryId: string;
  label: string;
  icon?: string;
}

export interface ConditionCategory {
  id: string;
  title: string;
  subtitle: string;
  iconName: string;
  conditions: Condition[];
}

export interface RouteSection {
  id: string;
  stepNumber: number;
  range: string;
  title: string;
  description: string;
  badge: {
    text: string;
    variant?: 'blue' | 'green' | 'amber';
  };
  featureBadge?: {
    text: string;
    icon: string;
  };
}

export interface MapHighlight {
  id: string;
  title: string;
  subTitle?: string;
  type: 'light' | 'cctv' | 'sidewalk' | 'slope';
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
}

export interface RouteCandidate {
  id: string;
  type: 'fastest' | 'recommended' | 'alternative';
  typeBadge: string;
  duration: number; // minutes
  durationText: string;
  distance: number; // km
  distanceText: string;
  matchScore: number; // percentage
  matchScoreText: string;
  subDescription: string;
  arrivalTime: string;
  streetLightPercent: number;
  mainRoadPercent: number;
  slope: '낮음' | '완만' | '보통' | '높음';
  darkAlleyAvoidancePercent: number;
  cctvCoveragePercent: number;
  safetyScore: number;
  safetyGrade: string;
  metrics: {
    label: string;
    value: string;
    icon: string;
  }[];
  waysChoice: {
    title: string;
    comment: string;
    tradeoffNote: string;
  };
  analytics: {
    averageLux: number;
    sidewalkWidth: number;
    cctvDensity: string;
  };
  sections: RouteSection[];
  highlights: MapHighlight[];
  // SVG path coordinates for simulation
  pathPoints: { x: number; y: number }[];
  // 백엔드 원본 위경도(WGS84) — 카카오맵 Polyline 등 실제 지도 오버레이용
  coordinates: { lat: number; lng: number }[];
}

export interface NavigationStep {
  distanceRemaining: string;
  action: string;
  streetName: string;
  nextActionPrompt: string;
  statusNotes: string[];
  signalTimeRemaining?: number;
  lightLux?: number;
}
