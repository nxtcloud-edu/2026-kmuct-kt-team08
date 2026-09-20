import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RouteCandidate } from '../types';
import { loadKakaoMaps, isKakaoConfigured } from '../services/kakaoMapLoader';
import { snapToRoads } from '../services/roadSnap';
import { MAP_BOUNDS } from '../mapProjection';

/** 배경 지도. public/ 에 있고 backend/scripts/export_map_svg.py 로 생성됩니다. */
const MAP_IMAGE = '/map-jamsil.svg';

/** 지도 중심 — 지도 범위(MAP_BOUNDS)의 정중앙에서 계산 (하드코딩 대신 단일 출처) */
const MAP_CENTER = {
  lat: (MAP_BOUNDS.south + MAP_BOUNDS.north) / 2,
  lng: (MAP_BOUNDS.west + MAP_BOUNDS.east) / 2,
} as const;

/** 후보 경로별 색상 (선택/미선택) */
const ROUTE_COLORS: Record<RouteCandidate['type'], string> = {
  recommended: '#2563EB',
  fastest: '#059669',
  alternative: '#94A3B8',
};

/**
 * pathPoints(0~100 퍼센트) → viewBox 400×500 의 path d.
 * 백엔드 위경도는 mapProjection.toPercentPoints() 로 이미 이 퍼센트 좌표가 되어 들어옵니다.
 */
const toD = (points?: { x: number; y: number }[]): string =>
  !points || points.length < 2
    ? ''
    : points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x * 4).toFixed(1)} ${(p.y * 5).toFixed(1)}`)
        .join(' ');

/** 경로의 시작·끝 점 (viewBox 좌표). 데이터가 없으면 null */
const endpointsOf = (points?: { x: number; y: number }[]) =>
  !points || points.length < 2
    ? null
    : {
        start: { x: points[0].x * 4, y: points[0].y * 5 },
        end: { x: points[points.length - 1].x * 4, y: points[points.length - 1].y * 5 },
      };

interface MapCanvasProps {
  mode?: 'home' | 'route' | 'detail' | 'navigation';
  selectedRoute?: RouteCandidate | null;
  allRoutes?: RouteCandidate[];
  onSelectRoute?: (routeId: string) => void;
  showSafetyLayer?: boolean;
  className?: string;
  zoomLevel?: number;
  interactive?: boolean;
  currentLocationText?: string;
  originName?: string;
  destinationName?: string;
  /** 출발지 좌표 (home 모드에서 카카오맵 마커로 표시) */
  originCoord?: { lat: number; lng: number } | null;
  /** 도착지 좌표 (home 모드에서 카카오맵 마커로 표시) */
  destinationCoord?: { lat: number; lng: number } | null;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mode = 'home',
  selectedRoute,
  allRoutes = [],
  onSelectRoute,
  showSafetyLayer = true,
  className = '',
  interactive = true,
  currentLocationText,
  originName,
  destinationName,
  originCoord,
  destinationCoord,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [safetyFilterActive, setSafetyFilterActive] = useState<boolean>(showSafetyLayer);
  const [, setSelectedHighlightId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 카카오맵 통합 상태
  const kakaoMountRef = useRef<HTMLDivElement | null>(null);
  const kakaoMapRef = useRef<any>(null);
  const kakaoOverlaysRef = useRef<any[]>([]);
  const [kakaoReady, setKakaoReady] = useState<boolean>(false);
  // routeId → 실제 도로로 스냅된 좌표. 준비되면 폴리라인이 이걸 쓴다.
  const [snappedByRoute, setSnappedByRoute] = useState<Record<string, { lat: number; lng: number }[]>>({});
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  // Zoom controls with expanded fluid range (0.6x to 3.5x)
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 3.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.6));
  }, []);

  const handleResetLocation = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom listener with non-passive preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !interactive || kakaoReady) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
      setZoom((prev) => {
        const next = prev * zoomFactor;
        return Math.min(Math.max(Number(next.toFixed(2)), 0.6), 3.5);
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [interactive]);

  // 카카오맵 초기화 (키가 있을 때만). 실패하면 정적 SVG로 폴백.
  useEffect(() => {
    if (!isKakaoConfigured()) return;
    let cancelled = false;

    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !kakaoMountRef.current || kakaoMapRef.current) return;
        const map = new kakao.maps.Map(kakaoMountRef.current, {
          center: new kakao.maps.LatLng(MAP_CENTER.lat, MAP_CENTER.lng),
          level: 4,
          draggable: interactive,
          zoomable: interactive,
        });
        kakaoMapRef.current = map;
        setKakaoReady(true);
      })
      .catch((err) => {
        // 키 미설정/도메인 미등록/로드 실패 → SVG 배경 유지
        console.warn('[MapCanvas] 카카오맵 로드 실패, SVG로 폴백합니다:', err?.message ?? err);
      });

    return () => {
      cancelled = true;
    };
  }, [interactive]);

  // 그릴 경로들을 실제 도로 지오메트리로 스냅해 둔다(비동기). 결과는 snappedByRoute 에 저장.
  useEffect(() => {
    if (!kakaoReady) return;
    const routesToSnap =
      mode === 'route' || mode === 'detail'
        ? allRoutes
        : selectedRoute
          ? [selectedRoute]
          : [];
    let cancelled = false;
    routesToSnap.forEach((route) => {
      if (!route?.coordinates || route.coordinates.length < 2) return;
      snapToRoads(route.coordinates).then((snapped) => {
        if (cancelled || snapped === route.coordinates) return; // 폴백(원본)이면 저장 불필요
        setSnappedByRoute((prev) => ({ ...prev, [route.id]: snapped }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [kakaoReady, mode, allRoutes, selectedRoute]);

  // 경로 → 카카오맵 Polyline + 출발/도착 마커 갱신
  useEffect(() => {
    const kakao = window.kakao;
    const map = kakaoMapRef.current;
    if (!kakaoReady || !kakao || !map) return;

    // 이전 오버레이 제거
    kakaoOverlaysRef.current.forEach((o) => o.setMap(null));
    kakaoOverlaysRef.current = [];

    const routesToDraw =
      mode === 'route' || mode === 'detail'
        ? allRoutes
        : selectedRoute
          ? [selectedRoute]
          : [];

    const bounds = new kakao.maps.LatLngBounds();
    let hasPoint = false;

    // 미선택 경로 먼저(아래 깔림), 선택 경로 나중(위로)
    const ordered = [...routesToDraw].sort((a, b) =>
      a.id === selectedRoute?.id ? 1 : b.id === selectedRoute?.id ? -1 : 0,
    );

    ordered.forEach((route) => {
      if (!route.coordinates || route.coordinates.length < 2) return;
      const isSelected = route.id === selectedRoute?.id || routesToDraw.length === 1;
      // 실제 도로로 스냅된 좌표가 있으면 그걸 그린다(도로 위에 놓임). 없으면 원본.
      const drawCoords = snappedByRoute[route.id] ?? route.coordinates;
      const path = drawCoords.map((c) => {
        const ll = new kakao.maps.LatLng(c.lat, c.lng);
        bounds.extend(ll);
        hasPoint = true;
        return ll;
      });

      const line = new kakao.maps.Polyline({
        path,
        strokeWeight: isSelected ? 6 : 4,
        strokeColor: ROUTE_COLORS[route.type] ?? '#2563EB',
        strokeOpacity: isSelected ? 0.95 : 0.5,
        strokeStyle: isSelected ? 'solid' : 'shortdash',
      });
      line.setMap(map);
      kakaoOverlaysRef.current.push(line);

      // 미선택 경로 클릭 시 선택 전환
      if (!isSelected && onSelectRoute) {
        kakao.maps.event.addListener(line, 'click', () => onSelectRoute(route.id));
      }

      // 선택 경로에만 출발/도착 마커
      if (isSelected) {
        const start = new kakao.maps.Marker({ position: path[0], map });
        const end = new kakao.maps.Marker({ position: path[path.length - 1], map });
        kakaoOverlaysRef.current.push(start, end);
      }
    });

    // home 모드: 출발/도착 장소 마커 표시 (경로 없이 위치만 볼 때)
    if (mode === 'home') {
      const makeLabelOverlay = (
        pos: any,
        text: string,
        color: string,
      ) => {
        const content = document.createElement('div');
        content.style.cssText = `
          transform: translateY(-100%);
          background: ${color};
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 9999px;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        `;
        content.textContent = text;
        return new kakao.maps.CustomOverlay({
          position: pos,
          content,
          yAnchor: 1,
          map,
        });
      };

      const hasOrigin = !!(originCoord && (originCoord.lat || originCoord.lng));
      const hasDest = !!(destinationCoord && (destinationCoord.lat || destinationCoord.lng));

      if (hasOrigin) {
        const pos = new kakao.maps.LatLng(originCoord!.lat, originCoord!.lng);
        bounds.extend(pos);
        hasPoint = true;
        const marker = new kakao.maps.Marker({ position: pos, map });
        const label = makeLabelOverlay(pos, originName ? `출발 · ${originName}` : '출발 · 내 위치', '#059669');
        kakaoOverlaysRef.current.push(marker, label);
      }
      if (hasDest) {
        const pos = new kakao.maps.LatLng(destinationCoord!.lat, destinationCoord!.lng);
        bounds.extend(pos);
        hasPoint = true;
        const marker = new kakao.maps.Marker({ position: pos, map });
        const label = makeLabelOverlay(pos, destinationName ? `도착 · ${destinationName}` : '도착', '#2563EB');
        kakaoOverlaysRef.current.push(marker, label);
      }
      // 좌표가 하나도 없으면 기본 중심 유지
      if (!hasPoint) {
        map.setCenter(new kakao.maps.LatLng(MAP_CENTER.lat, MAP_CENTER.lng));
      } else if (hasOrigin !== hasDest) {
        // 마커가 하나뿐이면 그 지점을 적당한 확대 수준으로 중앙에 둔다 (setBounds 는 너무 확대됨)
        const only = hasOrigin ? originCoord! : destinationCoord!;
        map.setCenter(new kakao.maps.LatLng(only.lat, only.lng));
        map.setLevel(4);
      }
    }

    // 마커가 2개 이상(경로 포함)일 때만 전체가 보이도록 범위 맞춤
    if (hasPoint && !(mode === 'home')) {
      map.setBounds(bounds, 40, 40, 40, 40);
    } else if (hasPoint && mode === 'home') {
      // home: 출발+도착 둘 다 있을 때만 범위 맞춤
      const both =
        originCoord && (originCoord.lat || originCoord.lng) &&
        destinationCoord && (destinationCoord.lat || destinationCoord.lng);
      if (both) map.setBounds(bounds, 40, 40, 40, 40);
    }
  }, [
    kakaoReady,
    mode,
    allRoutes,
    selectedRoute,
    onSelectRoute,
    snappedByRoute,
    originCoord?.lat,
    originCoord?.lng,
    destinationCoord?.lat,
    destinationCoord?.lng,
    originName,
    destinationName,
  ]);

  // 언마운트 시 오버레이 정리
  useEffect(() => {
    return () => {
      kakaoOverlaysRef.current.forEach((o) => o.setMap(null));
      kakaoOverlaysRef.current = [];
    };
  }, []);

  // Pointer drag/pan handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    // Only primary button
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !interactive) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Touch pinch-to-zoom multi-touch handling
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchDistanceRef.current;
      if (Math.abs(ratio - 1) > 0.02) {
        setZoom((prev) => Math.min(Math.max(Number((prev * (ratio > 1 ? 1.05 : 0.95)).toFixed(2)), 0.6), 3.5));
        touchDistanceRef.current = currentDist;
      }
    }
  };

  const handleTouchEnd = () => {
    touchDistanceRef.current = null;
  };

  // Double click to zoom in
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    e.preventDefault();
    handleZoomIn();
  };

  // 출발·도착 마커는 실제 경로의 양 끝에 찍는다 (경로가 없으면 실제 역 위치 기준 기본값)
  const ends =
    endpointsOf(selectedRoute?.pathPoints) ??
    endpointsOf(allRoutes.find((r) => r.pathPoints?.length)?.pathPoints) ??
    { start: { x: 322.8, y: 422.5 }, end: { x: 84.4, y: 77.5 } };

  return (
    <div
      ref={containerRef}
      id="myway-map-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      className={`relative w-full overflow-hidden select-none bg-[#eaf1f7] touch-none ${
        interactive ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      } ${className}`}
      data-map-api-ready="true"
      data-lat={MAP_CENTER.lat}
      data-lng={MAP_CENTER.lng}
      data-zoom={zoom}
    >
      {/* External Map API Mount Point (Kakao Maps SDK) */}
      <div
        id="external-map-api-mount"
        ref={kakaoMountRef}
        className={`absolute inset-0 ${kakaoReady ? 'z-0' : 'pointer-events-none -z-10'}`}
        aria-hidden={!kakaoReady}
      />

      {/* Interactive Map Visual Layer — 카카오맵이 뜨면 숨김(폴백용 SVG) */}
      <div
        className={`w-full h-full ${kakaoReady ? 'hidden' : ''} ${
          isDragging ? '' : 'transition-transform duration-200 ease-out'
        }`}
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: mode === 'navigation' ? '50% 80%' : '50% 50%',
        }}
      >
        <svg
          viewBox="0 0 400 500"
          className="w-full h-full preserve-3d"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* 실제 잠실역~석촌역 지도 — OSM 보행망 + 석촌호수·송파대로.
              경로 좌표와 같은 원본에서 그려서 선이 길 위에 정확히 얹힙니다. */}
          <image
            href={MAP_IMAGE}
            x="0"
            y="0"
            width="400"
            height="500"
            preserveAspectRatio="xMidYMid slice"
          />

          {/* 선택되지 않은 후보 경로 — 백엔드가 만든 실제 좌표 */}
          {(mode === 'route' || mode === 'detail') &&
            allRoutes
              .filter((r) => r.id !== selectedRoute?.id && toD(r.pathPoints))
              .map((r) => (
                <g
                  key={r.id}
                  className="cursor-pointer transition-opacity duration-300 opacity-70 hover:opacity-100"
                  onClick={() => onSelectRoute?.(r.id)}
                >
                  {/* 클릭 영역을 넓히는 투명 선 */}
                  <path
                    d={toD(r.pathPoints)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    d={toD(r.pathPoints)}
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="4.5"
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}

          {/* 선택된 경로 — 백엔드가 만든 실제 좌표 */}
          {(mode === 'route' || mode === 'detail') && selectedRoute && toD(selectedRoute.pathPoints) && (
            <g id="selected-route-path">
              <path
                d={toD(selectedRoute.pathPoints)}
                fill="none"
                stroke="#60A5FA"
                strokeWidth="11"
                strokeOpacity="0.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={toD(selectedRoute.pathPoints)}
                fill="none"
                stroke="#2563EB"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* Navigation Mode Specific Path & Walking Agent */}
          {mode === 'navigation' && (
            <g id="navigation-dynamic-view">
              {/* Perspective Guide Lane */}
              <path
                d="M 150 500 L 180 340 L 200 240 L 220 180 L 290 80"
                fill="none"
                stroke="#60A5FA"
                strokeWidth="18"
                strokeOpacity="0.3"
                strokeLinecap="round"
              />
              <path
                d="M 150 500 L 180 340 L 200 240 L 220 180 L 290 80"
                fill="none"
                stroke="#2563EB"
                strokeWidth="8"
                strokeLinecap="round"
              />
              {/* Walking Pedestrian Blue Indicator with Cone */}
              <g transform="translate(175, 360)">
                {/* Field of vision light cone */}
                <path
                  d="M 0 0 L -30 -70 L 30 -70 Z"
                  fill="#38BDF8"
                  fillOpacity="0.25"
                />
                {/* Pulsing ring */}
                <circle cx="0" cy="0" r="16" fill="#3B82F6" fillOpacity="0.2" className="animate-ping" />
                <circle cx="0" cy="0" r="10" fill="#2563EB" stroke="#FFFFFF" strokeWidth="3" />
                <circle cx="0" cy="0" r="4" fill="#FFFFFF" />
              </g>
            </g>
          )}

          {/* 출발 마커 — 경로 시작점 */}
          <g id="start-marker" transform={`translate(${ends.start.x.toFixed(1)}, ${ends.start.y.toFixed(1)})`}>
            <circle cx="0" cy="0" r="16" fill="#3B82F6" fillOpacity="0.2" />
            <circle cx="0" cy="0" r="9" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2.5" />
            <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
          </g>

          {/* 도착 마커 — 경로 끝점 */}
          {(mode === 'route' || mode === 'detail' || mode === 'navigation') && (
            <g id="destination-marker" transform={`translate(${ends.end.x.toFixed(1)}, ${ends.end.y.toFixed(1)})`}>
              <ellipse cx="0" cy="18" rx="8" ry="3" fill="#64748B" fillOpacity="0.3" />
              <path
                d="M 0 -22 C -9 -22 -14 -15 -14 -6 C -14 6 0 18 0 18 C 0 18 14 6 14 -6 C 14 -15 9 -22 0 -22 Z"
                fill="#EF4444"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
              <circle cx="0" cy="-9" r="4" fill="#FFFFFF" />
            </g>
          )}

          {/* Home Mode: My Location Floating Tag */}
          {mode === 'home' && (
            <g transform="translate(200, 245)">
              <rect
                x="-105"
                y="-38"
                width="210"
                height="32"
                rx="16"
                fill="#FFFFFF"
                filter="drop-shadow(0 4px 8px rgba(0,0,0,0.12))"
              />
              <circle cx="-85" cy="-22" r="4.5" fill="#2563EB" />
              <text x="-72" y="-18" fill="#1E293B" fontSize="12" fontWeight="700">
                {currentLocationText || '내 위치: 석촌역 8·9호선 부근'}
              </text>
            </g>
          )}
        </svg>

        {/* HTML Map Floating Callout Badges (Positioned accurately matching Stitch) */}
        {(mode === 'route' || mode === 'detail') && (
          <>
            {/* Start point text bubble — 석촌역(출발)은 지도 우하단 */}
            <div className="absolute right-6 top-[80%] -translate-y-full bg-slate-900/90 text-white text-[11px] font-medium px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
              <span>{originName ? `출발 (${originName})` : '출발 (내 위치)'}</span>
            </div>

            {/* Destination text bubble — 잠실역(도착)은 지도 좌상단 */}
            <div className="absolute left-6 top-[16%] bg-slate-900/90 text-white text-[11px] font-medium px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
              <span>{destinationName || '잠실역'}</span>
            </div>

            {/* Streetlight Safe Zone callout (matching Image 11 & 13) */}
            <div
              onClick={() => setSelectedHighlightId('light')}
              className="absolute left-[34%] top-[45%] bg-white/95 backdrop-blur-sm border border-amber-200 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1.5 cursor-pointer transform hover:scale-105 transition-transform"
            >
              <span className="text-amber-500">💡</span>
              <span>가로등 안심존 (조도 92%)</span>
            </div>

            {/* Main Road Sidewalk callout (matching Image 11 & 13) */}
            <div
              onClick={() => setSelectedHighlightId('sidewalk')}
              className="absolute left-[44%] top-[30%] bg-white/95 backdrop-blur-sm border border-blue-200 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1.5 cursor-pointer transform hover:scale-105 transition-transform"
            >
              <span className="text-blue-500">🛡️</span>
              <span>대로변 보행로 (820m)</span>
            </div>

            {/* Additional CCTV callout in detail mode (matching Image 13) */}
            {mode === 'detail' && (
              <div className="absolute right-[16%] top-[38%] bg-white/95 backdrop-blur-sm border border-emerald-200 text-slate-800 text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1.5 animate-fade-in">
                <span className="text-emerald-500">📷</span>
                <span>송파대로 CCTV 구역 (12대)</span>
              </div>
            )}
          </>
        )}

        {/* Navigation Mode Floating Cues */}
        {mode === 'navigation' && (
          <>
            {/* Realtime Safety Reroute Tag */}
            <div className="absolute top-20 left-4 right-4 bg-white/95 backdrop-blur-md border border-blue-100 px-3.5 py-2 rounded-xl shadow-md flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-xs font-semibold text-slate-800">
                골목 대신 <strong className="text-blue-600">가로등 집중 구역</strong>으로 우회 안내 중
              </span>
            </div>

            {/* Pedestrian walking speed badge */}
            <div className="absolute bottom-28 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5 border border-slate-200">
              <span className="text-blue-600 text-sm">🚶</span>
              <span className="text-xs font-semibold text-slate-800">보행 속도 4.2 km/h</span>
            </div>

            {/* Traffic Signal time remaining */}
            <div className="absolute top-36 left-4 bg-slate-900/90 text-white px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>신호 여유 28초</span>
            </div>

            {/* Streetlight Illuminance reading */}
            <div className="absolute top-52 left-4 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 text-xs font-medium">
              <span>💡 가로등 조도 95lx (안심)</span>
            </div>
          </>
        )}
      </div>

      {/* Floating Map Controls (Right edge, matching Stitch design) */}
      {interactive && (
        <div className="absolute top-4 right-3 flex flex-col gap-2 z-20">
          {/* Safety Layer Toggle */}
          <button
            id="map-safety-layer-toggle"
            type="button"
            onClick={() => setSafetyFilterActive(!safetyFilterActive)}
            title="안심 레이어 켜기/끄기"
            className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md border transition-all ${
              safetyFilterActive
                ? 'bg-blue-600 text-white border-blue-700 shadow-blue-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </button>

          {/* GPS Current Location Reset */}
          <button
            id="map-gps-locate-btn"
            type="button"
            onClick={handleResetLocation}
            title="내 위치로 이동"
            className="w-9 h-9 rounded-xl bg-white text-slate-700 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 active:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-600">
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="1" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="23" />
              <line x1="1" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="23" y2="12" />
            </svg>
          </button>

          {/* Zoom Buttons Container */}
          <div className="flex flex-col bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden items-center">
            <button
              id="map-zoom-in-btn"
              type="button"
              onClick={handleZoomIn}
              title="지도 확대 (+)"
              className="w-9 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:bg-slate-100 text-base font-bold border-b border-slate-100"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetLocation}
              title={`현재 배율 ${Math.round(zoom * 100)}% (클릭 시 100%로 리셋)`}
              className="text-[9px] font-bold text-slate-600 hover:text-blue-600 py-1 px-1 select-none text-center w-full border-b border-slate-100 bg-slate-50/80 hover:bg-slate-100 transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              id="map-zoom-out-btn"
              type="button"
              onClick={handleZoomOut}
              title="지도 축소 (−)"
              className="w-9 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:bg-slate-100 text-base font-bold"
            >
              −
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
