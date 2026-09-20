import React, { useState, useRef } from 'react';
import { MapCanvas } from '../components/MapCanvas';
import { WayCharacter } from '../components/WayCharacter';
import { Location, RouteCandidate } from '../types';
import { routeService } from '../services/routeService';

interface RouteRecommendationPageProps {
  origin: Location;
  destination: Location | null;
  routes: RouteCandidate[];
  selectedRouteId: string;
  selectedConditions?: string[];
  naturalLanguageRequest?: string;
  onSelectRoute: (routeId: string) => void;
  onGoToDetail: () => void;
  onReconfigureConditions: () => void;
  onBack: () => void;
}

export const RouteRecommendationPage: React.FC<RouteRecommendationPageProps> = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  selectedConditions = [],
  naturalLanguageRequest = '',
  onSelectRoute,
  onGoToDetail,
  onReconfigureConditions,
  onBack,
}) => {
  // Bottom sheet display mode: 'peek' (minimal sheet, maximum map), 'half' (default split), 'expanded' (full sheet covering map)
  const [sheetMode, setSheetMode] = useState<'peek' | 'half' | 'expanded'>('half');
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    // Upward drag: expand sheet
    if (deltaY < -35) {
      if (sheetMode === 'peek') setSheetMode('half');
      else if (sheetMode === 'half') setSheetMode('expanded');
    }
    // Downward drag: collapse sheet
    else if (deltaY > 35) {
      if (sheetMode === 'expanded') setSheetMode('half');
      else if (sheetMode === 'half') setSheetMode('peek');
    }
    touchStartY.current = null;
  };

  // Find currently active route
  const currentRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  // 경로가 아직 없으면(백엔드 응답 대기/실패) 크래시 대신 로딩/안내 화면을 보여준다.
  if (!currentRoute) {
    return (
      <div
        id="route-recommendation-loading"
        className="flex flex-col items-center justify-center h-full bg-slate-100 px-8 text-center"
      >
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-700">경로를 불러오고 있어요…</p>
        <p className="text-xs text-slate-500 mt-1">
          잠시 후에도 표시되지 않으면 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          조건 다시 설정
        </button>
      </div>
    );
  }

  // Derive congestion metric based on current route
  const getCongestionMetric = (routeId: string) => {
    if (routeId === 'route-b') {
      return {
        label: '혼잡도',
        value: '매우 여유 (한산)',
        icon: '👥',
        highlightColor: 'text-emerald-600',
      };
    }
    if (routeId === 'route-a') {
      return {
        label: '혼잡도',
        value: '보통 (일부 번화가)',
        icon: '👥',
        highlightColor: 'text-amber-600',
      };
    }
    return {
      label: '혼잡도',
      value: '여유',
      icon: '👥',
      highlightColor: 'text-blue-600',
    };
  };

  // Extract detected keywords from natural language request
  const promptKeywords = routeService.detectKeywordsFromNaturalText(naturalLanguageRequest);
  const allActiveConditions = Array.from(new Set([...selectedConditions, ...promptKeywords]));

  // Build dynamic metric cards starting with 혼잡도, followed by the user's prompt/selected conditions
  const displayMetrics: Array<{
    label: string;
    value: string;
    icon: string;
    highlightColor?: string;
  }> = [];

  // 1. 혼잡도 (항상 첫 번째 필수 지표로 표시)
  displayMetrics.push(getCongestionMetric(currentRoute.id));

  // 2. 사용자가 입력한 조건별 맞춤 지표
  allActiveConditions.forEach((cond) => {
    if (cond.includes('혼잡') || cond.includes('사람 적')) {
      // 이미 첫 번째 혼잡도 지표에서 커버됨
      return;
    }
    if (cond.includes('밝은') || cond.includes('가로등') || cond.includes('밝고')) {
      displayMetrics.push({
        label: '밝은 길',
        value:
          currentRoute.id === 'route-b'
            ? '평균 94lx (밝음)'
            : currentRoute.id === 'route-a'
            ? '65lx'
            : '88lx',
        icon: '💡',
        highlightColor: 'text-blue-600',
      });
    } else if (cond.includes('조용') || cond.includes('번화가')) {
      displayMetrics.push({
        label: '조용한 길',
        value:
          currentRoute.id === 'route-b'
            ? '번화가 100% 회피'
            : currentRoute.id === 'route-a'
            ? '번화가 인접'
            : '번화가 85% 회피',
        icon: '🤫',
        highlightColor: currentRoute.id === 'route-b' ? 'text-emerald-600' : 'text-slate-600',
      });
    } else if (cond.includes('우회') || cond.includes('분')) {
      displayMetrics.push({
        label: '우회 시간',
        value:
          currentRoute.id === 'route-b'
            ? '+4분 (허용 범위 내)'
            : currentRoute.id === 'route-a'
            ? '0분 (최단 경로)'
            : '+6분',
        icon: '⏱️',
        highlightColor: 'text-indigo-600',
      });
    } else if (cond.includes('큰길') || cond.includes('대로')) {
      displayMetrics.push({
        label: '큰길 위주',
        value: `${currentRoute.mainRoadPercent}%`,
        icon: '🚦',
        highlightColor: 'text-blue-600',
      });
    } else if (cond.includes('골목')) {
      displayMetrics.push({
        label: '골목 회피',
        value: `${currentRoute.darkAlleyAvoidancePercent}% 회피`,
        icon: '🛡️',
        highlightColor: 'text-emerald-600',
      });
    } else if (cond.includes('경사') || cond.includes('계단')) {
      displayMetrics.push({
        label: '경사도',
        value: currentRoute.slope === '완만' ? '완만 (1.8°)' : `${currentRoute.slope}`,
        icon: '⛰️',
        highlightColor: 'text-blue-600',
      });
    } else if (cond.includes('그늘') || cond.includes('녹지')) {
      displayMetrics.push({
        label: '녹지·그늘',
        value: '산책로 68%',
        icon: '🌲',
        highlightColor: 'text-emerald-600',
      });
    } else if (cond.includes('최단')) {
      displayMetrics.push({
        label: '최단 시간',
        value: currentRoute.durationText,
        icon: '⚡',
        highlightColor: 'text-amber-600',
      });
    } else {
      displayMetrics.push({
        label: cond,
        value: '조건 만족',
        icon: '✨',
        highlightColor: 'text-blue-600',
      });
    }
  });

  // 조건이 없거나 부족할 때 기본 안전 지표 보강
  if (displayMetrics.length === 1) {
    displayMetrics.push(
      {
        label: '가로등 많음',
        value: `${currentRoute.streetLightPercent}%`,
        icon: '💡',
        highlightColor: 'text-blue-600',
      },
      {
        label: '큰길 위주',
        value: `${currentRoute.mainRoadPercent}%`,
        icon: '🚦',
        highlightColor: 'text-blue-600',
      },
      {
        label: '어두운 골목 회피',
        value: `${currentRoute.darkAlleyAvoidancePercent}%`,
        icon: '🛡️',
        highlightColor: 'text-emerald-600',
      }
    );
  }

  // Dynamic Way's Choice comment tailored to user conditions
  const isCustomConditions = allActiveConditions.length > 0;
  const waysChoiceTitle =
    isCustomConditions && currentRoute.id === 'route-b'
      ? "맞춤 조건을 반영한 추천! Way's Choice"
      : currentRoute.waysChoice.title;

  const waysChoiceComment =
    isCustomConditions && currentRoute.id === 'route-b'
      ? `입력하신 "${allActiveConditions.slice(0, 3).join('", "')}" 조건을 바탕으로 번화가를 우회하여 조용하고 조명이 밝은 보행로로 경로를 최적화했어요.`
      : currentRoute.waysChoice.comment;

  const waysChoiceTradeoff =
    isCustomConditions && currentRoute.id === 'route-b'
      ? '최단 경로보다 4분 더 소요되지만(5분 우회 허용 범위 내), 복잡한 인파와 소음을 피해 쾌적하고 안전하게 이동할 수 있어요.'
      : currentRoute.waysChoice.tradeoffNote;

  return (
    <div id="route-recommendation-screen" className="flex flex-col h-full bg-slate-100 overflow-hidden relative">
      {/* Top Floating Header */}
      <header className="absolute top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200/80 shadow-xs">
        <button
          id="recommendation-back-btn"
          type="button"
          onClick={onBack}
          className="p-1.5 -ml-1 text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          title="뒤로 가기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-5 h-5">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" />
          </svg>
        </button>

        {/* Route Summary Pill */}
        <div className="flex items-center gap-2 bg-slate-100/90 py-1.5 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-800">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="truncate max-w-[90px]">{origin.name}</span>
          <span className="text-slate-400">→</span>
          <span className="truncate max-w-[90px]">{destination?.name || '잠실역'}</span>
          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-extrabold">
            3개 비교
          </span>
        </div>

        {/* Spacer for symmetrical header balance */}
        <div className="w-8" aria-hidden="true" />
      </header>

      {/* Interactive Map Visual Area (Background Canvas Layer) */}
      <div className="absolute inset-0 pt-14 pb-20">
        <MapCanvas
          mode="route"
          selectedRoute={currentRoute}
          allRoutes={routes}
          onSelectRoute={onSelectRoute}
          originName={origin.name}
          destinationName={destination?.name || '잠실역'}
          currentLocationText="내 위치: 석촌역 8·9호선 부근"
          className="h-full"
        />
      </div>

      {/* Bottom Scrollable Sheet (Matching Stitch Image 11 with Expand/Collapse capability to cover map) */}
      <div
        id="recommendation-content-sheet"
        className={`absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200/90 z-20 flex flex-col transition-all duration-300 ease-out ${
          sheetMode === 'expanded'
            ? 'top-14'
            : sheetMode === 'peek'
            ? 'top-[calc(100%-195px)]'
            : 'top-[38%]'
        }`}
      >
        {/* Interactive Drag Handle & Role Header Bar */}
        <div
          className="w-full flex flex-col items-center pt-2.5 pb-2 px-5 cursor-pointer select-none bg-white rounded-t-3xl border-b border-slate-100 hover:bg-slate-50/80 transition-colors flex-shrink-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => {
            if (sheetMode === 'expanded') setSheetMode('half');
            else if (sheetMode === 'half') setSheetMode('expanded');
            else setSheetMode('half');
          }}
        >
          {/* Visual Drag Pill */}
          <div className="w-11 h-1.5 bg-slate-300 hover:bg-slate-400 rounded-full transition-colors mb-2" />

          {/* Role & Mode Switcher Row */}
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800">
                {sheetMode === 'expanded' ? '📋 경로 종합 비교 (전체)' : '📋 추천 경로 분석'}
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {sheetMode === 'expanded' ? '지도 가림' : sheetMode === 'half' ? '화면 분할' : '지도 확대'}
              </span>
            </div>

            {/* Quick Segmented Mode Switcher */}
            <div
              className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-semibold text-slate-600"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSheetMode('peek')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  sheetMode === 'peek'
                    ? 'bg-white text-blue-600 font-bold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
                title="지도를 넓게 보기 위해 바텀시트를 내립니다"
              >
                🗺️ 지도
              </button>
              <button
                type="button"
                onClick={() => setSheetMode('half')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  sheetMode === 'half'
                    ? 'bg-white text-blue-600 font-bold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
                title="지도와 바텀시트를 함께 봅니다"
              >
                기본
              </button>
              <button
                type="button"
                onClick={() => setSheetMode('expanded')}
                className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-0.5 cursor-pointer ${
                  sheetMode === 'expanded'
                    ? 'bg-white text-blue-600 font-bold shadow-2xs'
                    : 'hover:text-slate-900'
                }`}
                title="지도를 가리고 상세 경로 분석을 전체화면으로 봅니다"
              >
                <span>▲ 전체 펼치기</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content inside Sheet */}
        <div className="flex-1 overflow-y-auto px-5 pt-3.5 pb-28">
          {/* Expanded Mode Quick Return Banner */}
          {sheetMode === 'expanded' && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => setSheetMode('half')}
                className="py-1 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200 flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
              >
                <span>▼</span>
                <span>지도 다시 보기 (기본 분할로 축소)</span>
              </button>
            </div>
          )}

        {/* 3 Route Comparison Cards Selector */}
        <div className="grid grid-cols-3 gap-2 pb-3.5">
          {routes.map((route) => {
            const isSelected = route.id === selectedRouteId;
            return (
              <button
                key={route.id}
                id={`route-card-tab-${route.id}`}
                type="button"
                onClick={() => onSelectRoute(route.id)}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/30 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                {/* Header Tag */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                      route.type === 'recommended'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {route.typeBadge}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                  )}
                </div>

                {/* Duration & Distance */}
                <div className="my-0.5">
                  <div className="text-sm font-black text-slate-900 leading-tight">
                    {route.durationText}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-400">
                    {route.distanceText}
                  </div>
                </div>

                {/* Match Condition Text */}
                <div
                  className={`text-[10px] font-bold truncate mt-1 ${
                    route.type === 'recommended'
                      ? 'text-blue-600'
                      : route.type === 'fastest'
                      ? 'text-amber-600'
                      : 'text-slate-500'
                  }`}
                >
                  {route.matchScoreText}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detailed Info for Selected Route */}
        <div className="space-y-3.5 pt-1">
          {/* Main Title & Time Block */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-blue-600 text-xs">✨</span>
                <span className="text-xs font-black text-blue-700">AI 맞춤 추천</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500 font-medium">실시간 안심 분석 완료</span>
              </div>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[11px] font-extrabold border border-blue-200">
                {currentRoute.safetyGrade}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {currentRoute.durationText}
                </span>
                <span className="text-sm font-bold text-slate-500">
                  {currentRoute.distanceText}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <span>🕒</span>
                <span>{currentRoute.arrivalTime}</span>
              </span>
            </div>
          </div>

          {/* Metric Badges Grid (혼잡도 + 프롬프트 입력 조건들) */}
          <div className="flex flex-wrap gap-2">
            {displayMetrics.map((m) => (
              <div
                key={m.label}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs"
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
                <strong className={`font-bold ${m.highlightColor || 'text-blue-600'}`}>{m.value}</strong>
              </div>
            ))}
          </div>

          {/* Way's Recommendation Speech Box (Matching Stitch Image 11) */}
          <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white rounded-2xl p-4 border border-blue-100 shadow-2xs space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white p-0.5 shadow-xs border border-blue-100 flex items-center justify-center">
                <WayCharacter size="xs" variant="avatar" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  {waysChoiceTitle}
                </h4>
                <span className="text-[10px] text-blue-600 font-bold">
                  Way's Choice
                </span>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-700 leading-relaxed">
              {waysChoiceComment}
            </p>

            <div className="pt-1.5 border-t border-blue-100/70 flex items-start gap-1.5 text-[11px] text-slate-600 leading-relaxed font-medium">
              <span className="text-amber-500 font-bold">ℹ️</span>
              <span>{waysChoiceTradeoff}</span>
            </div>
          </div>

          {/* CCTV Coverage Bar */}
          <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">
                📷
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  CCTV 감시 구역 연계율
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  보행 경로의 {currentRoute.cctvCoveragePercent}%가 안심벨/CCTV 커버
                </div>
              </div>
            </div>
            <span className="text-base font-black text-emerald-600">
              {currentRoute.cctvCoveragePercent}%
            </span>
          </div>
        </div>
      </div>
    </div>

      {/* Floating Bottom Primary Action Button */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-5 py-3 flex flex-col items-center gap-1.5">
        <button
          id="start-with-selected-route-btn"
          type="button"
          onClick={onGoToDetail}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>이 경로로 출발하기</span>
          <span>→</span>
        </button>

        <button
          id="reconfigure-conditions-btn"
          type="button"
          onClick={onReconfigureConditions}
          className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 py-0.5"
        >
          <span>🎛️</span>
          <span>다른 조건으로 다시 탐색하기</span>
        </button>
      </footer>
    </div>
  );
};
