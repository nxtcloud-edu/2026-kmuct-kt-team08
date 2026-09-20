/**
 * 경로 좌표(위경도 배열)로부터 턴바이턴 안내를 계산한다.
 * 하드코딩된 "우회전" 대신 실제 경로 기하로 방향을 판정한다.
 */

export interface Coord {
  lat: number;
  lng: number;
}

export type TurnKind = 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'uturn' | 'arrive';

export interface NavStep {
  /** 이 스텝이 시작되는 좌표 인덱스 */
  index: number;
  /** 회전 종류 */
  kind: TurnKind;
  /** 사람이 읽는 안내 문구 (예: "우회전", "직진") */
  instruction: string;
  /** 이 스텝 구간의 거리(m) */
  distanceM: number;
}

const R = 6371000; // 지구 반지름(m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** 두 좌표 사이 거리(m) — Haversine */
export function distanceM(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** a에서 b로 향하는 방위각(0~360°, 북=0, 동=90) */
export function bearing(a: Coord, b: Coord): number {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** 두 방위각 차이를 -180~180°로 정규화 (양수=우회전 방향) */
function angleDelta(from: number, to: number): number {
  let d = (to - from + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** 회전 각도(deg)를 회전 종류/문구로 변환 */
function classifyTurn(delta: number): { kind: TurnKind; instruction: string } {
  const a = Math.abs(delta);
  // 25° 미만은 직진으로 본다 (보행망 노드 흔들림으로 인한 잔회전 무시)
  if (a < 25) return { kind: 'straight', instruction: '직진' };
  if (a > 160) return { kind: 'uturn', instruction: 'U턴' };
  const right = delta > 0;
  if (a < 45) {
    return right
      ? { kind: 'slight-right', instruction: '오른쪽 방향' }
      : { kind: 'slight-left', instruction: '왼쪽 방향' };
  }
  return right
    ? { kind: 'right', instruction: '우회전' }
    : { kind: 'left', instruction: '좌회전' };
}

/**
 * 경로 좌표 배열 → 턴바이턴 스텝 목록.
 * 너무 촘촘한 점은 무시하고(최소 세그먼트 길이), 의미 있는 회전만 스텝으로 만든다.
 */
export function buildNavSteps(coords: Coord[], minSegM = 40): NavStep[] {
  const pts = (coords ?? []).filter(
    (c) => c && (c.lat || c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180,
  );
  if (pts.length < 2) return [];

  // 방위각을 계산할 수 있을 만큼 떨어진 지점만 남긴다.
  const simplified: Coord[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (distanceM(simplified[simplified.length - 1], pts[i]) >= minSegM) {
      simplified.push(pts[i]);
    }
  }
  if (simplified[simplified.length - 1] !== pts[pts.length - 1]) {
    simplified.push(pts[pts.length - 1]);
  }
  if (simplified.length < 2) return [];

  const steps: NavStep[] = [];
  // 출발 스텝(첫 세그먼트 방향으로 직진)
  steps.push({
    index: 0,
    kind: 'straight',
    instruction: '직진',
    distanceM: distanceM(simplified[0], simplified[1]),
  });

  for (let i = 1; i < simplified.length - 1; i++) {
    const inB = bearing(simplified[i - 1], simplified[i]);
    const outB = bearing(simplified[i], simplified[i + 1]);
    const delta = angleDelta(inB, outB);
    const { kind, instruction } = classifyTurn(delta);
    const segLen = distanceM(simplified[i], simplified[i + 1]);
    if (kind === 'straight') {
      // 직진이면 이전 스텝 거리에 합쳐 스텝 수를 줄인다.
      steps[steps.length - 1].distanceM += segLen;
    } else {
      steps.push({ index: i, kind, instruction, distanceM: segLen });
    }
  }

  steps.push({
    index: simplified.length - 1,
    kind: 'arrive',
    instruction: '목적지 도착',
    distanceM: 0,
  });
  return steps;
}

/** 회전 종류 → 화살표 기호 */
export function turnArrow(kind: TurnKind): string {
  switch (kind) {
    case 'left':
      return '↰';
    case 'slight-left':
      return '↖';
    case 'right':
      return '↱';
    case 'slight-right':
      return '↗';
    case 'uturn':
      return '↩';
    case 'arrive':
      return '⚑';
    default:
      return '↑';
  }
}
