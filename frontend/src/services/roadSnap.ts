/**
 * 경로 좌표를 실제 도로 지오메트리로 스냅한다.
 *
 * 백엔드 좌표(로컬 보행망)나 mock 좌표(손으로 찍은 점)는 카카오맵 실제 도로와
 * 어긋날 수 있다. 이 모듈은 경로의 경유점을 OSRM 도보 라우팅에 넘겨 실제 도로를
 * 따라가는 좌표열을 받아, 지도에 그리는 선이 도로 위에 놓이게 한다.
 *
 * - 결과는 좌표 서명 기준으로 메모리 캐시(같은 경로 재요청 시 네트워크 생략).
 * - 실패하면 원본 좌표를 그대로 돌려준다(그레이스풀 폴백).
 */

export interface LL {
  lat: number;
  lng: number;
}

const OSRM_FOOT_URL =
  (import.meta as any).env?.VITE_OSRM_FOOT_URL ?? 'https://routing.openstreetmap.de/routed-foot';

// corridor 를 유지할 정도로만 경유점을 뽑는다(URL 길이·속도 제한).
const WAYPOINT_SPACING_M = 220;
const MAX_WAYPOINTS = 12;

const cache = new Map<string, LL[]>();

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function distM(a: LL, b: LL): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** corridor 유지용 경유점 선택. 시작·끝은 항상 포함. */
function selectWaypoints(coords: LL[]): LL[] {
  if (coords.length <= 2) return coords.slice();
  const picked: LL[] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += distM(coords[i - 1], coords[i]);
    if (acc >= WAYPOINT_SPACING_M) {
      picked.push(coords[i]);
      acc = 0;
    }
  }
  const last = coords[coords.length - 1];
  if (picked[picked.length - 1] !== last) picked.push(last);

  if (picked.length > MAX_WAYPOINTS) {
    const step = (picked.length - 1) / (MAX_WAYPOINTS - 1);
    const idxSet = new Set<number>([0, picked.length - 1]);
    for (let i = 0; i < MAX_WAYPOINTS; i++) idxSet.add(Math.round(i * step));
    const idx = Array.from(idxSet).sort((a, b) => a - b);
    return idx.map((i) => picked[i]);
  }
  return picked;
}

function signature(coords: LL[]): string {
  const f = coords[0];
  const l = coords[coords.length - 1];
  return `${coords.length}:${f.lat.toFixed(5)},${f.lng.toFixed(5)}->${l.lat.toFixed(5)},${l.lng.toFixed(5)}`;
}

/**
 * 좌표열을 실제 도로 지오메트리로 스냅한다.
 * 실패 시 원본 반환. 2점 미만이면 원본 반환.
 */
export async function snapToRoads(coords: LL[]): Promise<LL[]> {
  if (!coords || coords.length < 2) return coords ?? [];
  const key = signature(coords);
  const cached = cache.get(key);
  if (cached) return cached;

  const waypoints = selectWaypoints(coords);
  const coordParam = waypoints.map((c) => `${c.lng},${c.lat}`).join(';');
  const url =
    `${OSRM_FOOT_URL}/route/v1/foot/${coordParam}` +
    `?overview=full&geometries=geojson&continue_straight=true`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`OSRM code ${data.code}`);
    const line: [number, number][] = data.routes[0].geometry.coordinates; // [lng, lat]
    const snapped: LL[] = line.map(([lng, lat]) => ({ lat, lng }));
    if (snapped.length < 2) return coords;
    cache.set(key, snapped);
    return snapped;
  } catch {
    return coords; // 네트워크/파싱 실패 → 원본 그대로
  }
}
