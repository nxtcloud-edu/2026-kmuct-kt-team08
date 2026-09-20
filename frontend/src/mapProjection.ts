/** 자동 생성 — backend/scripts/export_map_svg.py. 직접 수정하지 마세요. */

/** map-jamsil.svg 의 좌표계. MapCanvas 의 viewBox 와 동일합니다. */
export const MAP_VIEWBOX = { width: 400, height: 500 } as const;

/** 그 SVG 가 덮는 실제 위경도 범위 (가로 1007m × 세로 1259m) */
export const MAP_BOUNDS = {
  south: 37.503745,
  west: 127.097697,
  north: 37.515055,
  east: 127.109103,
} as const;

/** 백엔드 응답의 위경도 → SVG viewBox 좌표 */
export function latLngToXY(lat: number, lng: number): { x: number; y: number } {
  const { south, west, north, east } = MAP_BOUNDS;
  return {
    x: ((lng - west) / (east - west)) * MAP_VIEWBOX.width,
    y: ((north - lat) / (north - south)) * MAP_VIEWBOX.height,
  };
}

/** 경로 좌표 배열 → <path d="..."> 문자열 */
export function toSvgPath(coords: readonly { lat: number; lng: number }[]): string {
  return coords
    .map((c, i) => {
      const { x, y } = latLngToXY(c.lat, c.lng);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** 경로 좌표 배열 → 퍼센트 좌표 (pathPoints 형식이 필요할 때) */
export function toPercentPoints(
  coords: readonly { lat: number; lng: number }[],
): { x: number; y: number }[] {
  return coords.map((c) => {
    const { x, y } = latLngToXY(c.lat, c.lng);
    return { x: (x / MAP_VIEWBOX.width) * 100, y: (y / MAP_VIEWBOX.height) * 100 };
  });
}

/** 퍼센트 좌표(pathPoints) → 위경도 (mock 데이터에서 카카오맵 좌표를 만들 때) */
export function percentPointsToLatLng(
  points: readonly { x: number; y: number }[],
): { lat: number; lng: number }[] {
  const { south, west, north, east } = MAP_BOUNDS;
  return points.map((p) => ({
    lng: west + (p.x / 100) * (east - west),
    lat: north - (p.y / 100) * (north - south),
  }));
}
