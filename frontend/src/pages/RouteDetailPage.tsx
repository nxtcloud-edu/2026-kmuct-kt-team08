import React, { useState } from 'react';
import { MapCanvas } from '../components/MapCanvas';
import { WayCharacter } from '../components/WayCharacter';
import { Location, RouteCandidate } from '../types';
import { routeService } from '../services/routeService';

interface RouteDetailPageProps {
  route: RouteCandidate;
  origin?: Location;
  destination?: Location | null;
  selectedConditions?: string[];
  naturalLanguageRequest?: string;
  onClose: () => void;
  onStartNavigation: () => void;
}

export const RouteDetailPage: React.FC<RouteDetailPageProps> = ({
  route,
  origin,
  destination,
  selectedConditions = [],
  naturalLanguageRequest = '',
  onClose,
  onStartNavigation,
}) => {
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  // Extract all active conditions from selectedConditions and natural prompt keywords
  const promptKeywords = routeService.detectKeywordsFromNaturalText(naturalLanguageRequest);
  const allActiveConditions = Array.from(new Set([...selectedConditions, ...promptKeywords]));

  // Helper to calculate percentage and pill styling for each condition
  const getConditionPercentage = (cond: string) => {
    if (cond.includes('혼잡') || cond.includes('사람')) {
      const pct = route.id === 'route-b' ? 92 : route.id === 'route-a' ? 58 : 85;
      return {
        icon: '👥',
        label: '혼잡 적게',
        percent: pct,
        colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        badgeColor: 'text-emerald-700',
      };
    }
    if (cond.includes('밝은') || cond.includes('가로등') || cond.includes('밝고')) {
      return {
        icon: '💡',
        label: '밝은 길',
        percent: route.streetLightPercent,
        colorClass: 'bg-amber-50 border-amber-200 text-amber-900',
        badgeColor: 'text-amber-700',
      };
    }
    if (cond.includes('조용') || cond.includes('번화가')) {
      const pct = route.id === 'route-b' ? 100 : route.id === 'route-a' ? 42 : 85;
      return {
        icon: '🤫',
        label: '조용한 길',
        percent: pct,
        colorClass: 'bg-teal-50 border-teal-200 text-teal-900',
        badgeColor: 'text-teal-700',
      };
    }
    if (cond.includes('우회') || cond.includes('분')) {
      const pct = route.id === 'route-b' ? 95 : route.id === 'route-a' ? 100 : 80;
      return {
        icon: '⏱️',
        label: '우회 허용',
        percent: pct,
        colorClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
        badgeColor: 'text-indigo-700',
      };
    }
    if (cond.includes('큰길') || cond.includes('대로')) {
      return {
        icon: '🚦',
        label: '큰길 위주',
        percent: route.mainRoadPercent,
        colorClass: 'bg-blue-50 border-blue-200 text-blue-900',
        badgeColor: 'text-blue-700',
      };
    }
    if (cond.includes('골목')) {
      return {
        icon: '🛡️',
        label: '골목 회피',
        percent: route.darkAlleyAvoidancePercent,
        colorClass: 'bg-purple-50 border-purple-200 text-purple-900',
        badgeColor: 'text-purple-700',
      };
    }
    if (cond.includes('경사') || cond.includes('계단')) {
      const pct = route.slope === '완만' ? 96 : route.slope === '낮음' ? 98 : 78;
      return {
        icon: '⛰️',
        label: '완만한 경사',
        percent: pct,
        colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        badgeColor: 'text-emerald-700',
      };
    }
    if (cond.includes('그늘') || cond.includes('녹지')) {
      return {
        icon: '🌲',
        label: '녹지·그늘',
        percent: 68,
        colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        badgeColor: 'text-emerald-700',
      };
    }
    if (cond.includes('최단')) {
      const pct = route.id === 'route-a' ? 100 : 82;
      return {
        icon: '⚡',
        label: '최단시간',
        percent: pct,
        colorClass: 'bg-amber-50 border-amber-200 text-amber-900',
        badgeColor: 'text-amber-700',
      };
    }
    return {
      icon: '✨',
      label: cond,
      percent: 90,
      colorClass: 'bg-blue-50 border-blue-200 text-blue-900',
      badgeColor: 'text-blue-700',
    };
  };

  // Build the list of condition items with percentages
  const conditionPills = allActiveConditions.map(getConditionPercentage);

  // If no conditions were selected, fallback to core safety metrics with percentages
  const displayPills =
    conditionPills.length > 0
      ? conditionPills
      : [
          {
            icon: '👥',
            label: '혼잡 적게',
            percent: route.id === 'route-b' ? 92 : 60,
            colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
            badgeColor: 'text-emerald-700',
          },
          {
            icon: '💡',
            label: '가로등 집중',
            percent: route.streetLightPercent,
            colorClass: 'bg-amber-50 border-amber-200 text-amber-900',
            badgeColor: 'text-amber-700',
          },
          {
            icon: '🚦',
            label: '큰길 위주',
            percent: route.mainRoadPercent,
            colorClass: 'bg-blue-50 border-blue-200 text-blue-900',
            badgeColor: 'text-blue-700',
          },
          {
            icon: '🛡️',
            label: '골목 회피',
            percent: route.darkAlleyAvoidancePercent,
            colorClass: 'bg-purple-50 border-purple-200 text-purple-900',
            badgeColor: 'text-purple-700',
          },
        ];

  return (
    <div id="route-detail-screen" className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-5 py-3.5 flex items-center justify-between border-b border-slate-200 flex-shrink-0">
        <h1 className="text-base font-black text-slate-900">
          AI 추천 안심 경로 상세
        </h1>
        <button
          id="detail-close-btn"
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
          title="닫기"
        >
          ✕
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-28">
        {/* Top Summary Banner */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {route.durationText}
              </span>
              <span className="text-sm font-bold text-slate-500">
                {route.distanceText} · 도보
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{route.arrivalTime} (실시간 보행 속도 기준)</span>
            </p>
          </div>

          {/* Safety Score Badge Box */}
          <div className="bg-blue-50/90 border border-blue-200 rounded-2xl px-3 py-2 text-center flex flex-col items-center">
            <span className="text-[10px] font-bold text-blue-600">안심 지수</span>
            <span className="text-xl font-black text-blue-700 tracking-tight">
              {route.safetyScore}점
            </span>
          </div>
        </div>

        {/* Feature Pills Row (앞쪽에서 선택된 조건들의 충족 퍼센트) */}
        <div className="flex flex-wrap gap-2">
          {displayPills.map((item) => (
            <span
              key={item.label}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 shadow-2xs ${item.colorClass}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              <strong className={`font-black ${item.badgeColor}`}>{item.percent}%</strong>
            </span>
          ))}
        </div>

        {/* Map Snapshot View with Safe Callouts */}
        <div className="w-full h-56 rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative">
          <MapCanvas
            mode="detail"
            selectedRoute={route}
            allRoutes={[route]}
            originName={origin?.name}
            destinationName={destination?.name || '잠실역'}
            currentLocationText="내 위치: 석촌역 8·9호선 부근"
            className="h-full"
            interactive={true}
          />
        </div>

        {/* Way's Safe Briefing Card (Matching Stitch Image 13) */}
        <div className="bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/70 rounded-2xl p-4 border border-indigo-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white shadow-xs border border-blue-100 flex items-center justify-center">
                <WayCharacter size="xs" variant="avatar" />
              </div>
              <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1">
                <span>Way의 안심 브리핑</span>
                <span className="text-blue-600">🛡️</span>
              </h4>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              야간 보행 추천
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-800 leading-relaxed pl-1">
            “늦은 밤이라 어두운 골목 대신 조도 94lx 이상의 송파대로 대로변을 우선 매칭했어요. 전체 경로의 91%가 밝은 가로등과 CCTV 밀집 구역입니다!”
          </p>
        </div>

        {/* Section Breakdown Guide (구간별 안심 상세 가이드) */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900">
                구간별 안심 상세 가이드
              </h3>
              <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                총 {route.sections.length}개 구간
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">거리순 정렬</span>
          </div>

          <div className="space-y-3">
            {route.sections.map((sec, idx) => (
              <div
                key={sec.id}
                className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs relative pl-12"
              >
                {/* Step Number Circle */}
                <div className="absolute left-3.5 top-4 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shadow-xs">
                  {sec.stepNumber}
                </div>

                {/* Vertical connecting dash line if not last */}
                {idx < route.sections.length - 1 && (
                  <div className="absolute left-6 top-11 bottom-0 w-0.5 bg-blue-200" />
                )}

                {/* Header: Range & Badge */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-blue-600">
                    {sec.range}
                  </span>
                  {sec.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        sec.badge.variant === 'green'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : sec.badge.variant === 'amber'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {sec.badge.text}
                    </span>
                  )}
                </div>

                {/* Section Title */}
                <h4 className="text-sm font-black text-slate-900 mb-1">
                  {sec.title}
                </h4>

                {/* Section Description */}
                <p className="text-xs text-slate-600 font-medium leading-relaxed mb-2.5">
                  {sec.description}
                </p>

                {/* Feature Badge */}
                {sec.featureBadge && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700">
                    <span>{sec.featureBadge.icon === 'traffic-light' ? '🚦' : sec.featureBadge.icon === 'shield' ? '🛡️' : '🪜'}</span>
                    <span>{sec.featureBadge.text}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Safety Metric Analytics Section (Matching Stitch Image 13) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 tracking-wider">
              SAFETY METRIC ANALYTICS
            </span>
            <h4 className="text-xs font-black text-slate-900 mt-0.5">
              구간 정밀 안전 지표
            </h4>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-2.5">
              <span className="text-amber-500 text-sm">🔅</span>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">
                평균 야간 조도
              </div>
              <div className="text-sm font-black text-slate-900 mt-0.5">
                {route.analytics.averageLux} lx
              </div>
            </div>

            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5">
              <span className="text-blue-500 text-sm">📏</span>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">
                평균 보도 폭
              </div>
              <div className="text-sm font-black text-slate-900 mt-0.5">
                {route.analytics.sidewalkWidth} m
              </div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5">
              <span className="text-emerald-500 text-sm">🛡️</span>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">
                CCTV 감시밀도
              </div>
              <div className="text-sm font-black text-slate-900 mt-0.5">
                {route.analytics.cctvDensity}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Bottom Action Bar (Preview & Start Navigation) */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 flex items-center gap-3">
        {/* Preview Button */}
        <button
          id="route-preview-btn"
          type="button"
          onClick={() => setIsPreviewActive(!isPreviewActive)}
          className={`px-4 py-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center transition-colors cursor-pointer ${
            isPreviewActive
              ? 'bg-blue-50 border-blue-300 text-blue-600'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="text-sm">▶</span>
          <span className="text-[10px]">미리보기</span>
        </button>

        {/* Start Navigation Primary Button */}
        <button
          id="start-navigation-primary-btn"
          type="button"
          onClick={onStartNavigation}
          className="flex-1 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>▲</span>
          <span>길 안내 시작</span>
        </button>
      </footer>
    </div>
  );
};
