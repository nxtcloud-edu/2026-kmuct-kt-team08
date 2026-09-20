import React, { useState, useEffect, useMemo } from 'react';
import { MapCanvas } from '../components/MapCanvas';
import { RouteCandidate } from '../types';
import { buildNavSteps, turnArrow } from '../navigation';

interface NavigationPageProps {
  route: RouteCandidate;
  onFinishNavigation: () => void;
  onReroute?: () => void;
}

export const NavigationPage: React.FC<NavigationPageProps> = ({
  route,
  onFinishNavigation,
  onReroute: _onReroute,
}) => {
  const [signalSeconds, setSignalSeconds] = useState(28);
  const [isVoiceOn, setIsVoiceOn] = useState(true);

  // 실제 경로 좌표로 턴바이턴 스텝을 계산한다 (하드코딩 아님).
  const steps = useMemo(() => buildNavSteps(route.coordinates ?? []), [route.coordinates]);

  // 현재 안내 중인 스텝 인덱스
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx];
  const nextStep = steps[stepIdx + 1];

  // 이번 스텝까지 남은 거리 (초기값 = 스텝 거리)
  const [distanceMeters, setDistanceMeters] = useState(() =>
    Math.max(10, Math.round(steps[0]?.distanceM ?? 120)),
  );

  // 경로가 바뀌면 안내를 처음부터
  useEffect(() => {
    setStepIdx(0);
    setDistanceMeters(Math.max(10, Math.round(steps[0]?.distanceM ?? 120)));
  }, [steps]);

  // 거리 카운트다운 → 0에 가까워지면 다음 스텝으로 진행
  useEffect(() => {
    const timer = setInterval(() => {
      setSignalSeconds((prev) => (prev > 1 ? prev - 1 : 35));
      setDistanceMeters((prev) => {
        if (prev > 10) return prev - 2;
        // 다음 스텝으로 전환
        setStepIdx((idx) => {
          const next = idx + 1 < steps.length ? idx + 1 : idx;
          return next;
        });
        return prev; // 다음 effect 실행에서 새 스텝 거리로 재설정됨
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [steps.length]);

  // 스텝이 바뀌면 남은 거리를 새 스텝 거리로 리셋
  useEffect(() => {
    if (currentStep && currentStep.kind !== 'arrive') {
      setDistanceMeters(Math.max(10, Math.round(currentStep.distanceM)));
    }
  }, [stepIdx]);

  // 표시용 문구
  const mainInstruction =
    currentStep?.kind === 'arrive'
      ? '목적지 도착'
      : `${distanceMeters}m 앞 ${currentStep?.instruction ?? '직진'}`;
  const mainArrow = turnArrow(currentStep?.kind ?? 'straight');
  const nextInstruction = nextStep
    ? nextStep.kind === 'arrive'
      ? '잠시 후 목적지 도착'
      : `${Math.round(nextStep.distanceM)}m 후 ${nextStep.instruction}`
    : '경로를 따라 계속 이동';

  return (
    <div id="navigation-screen" className="flex flex-col h-full bg-slate-900 overflow-hidden relative select-none">
      {/* Top Dark HUD Box */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md px-5 pt-3 pb-4 border-b border-slate-800 shadow-xl text-white">
        {/* Top Status Bar Indicators */}
        <div className="flex items-center justify-between text-xs text-slate-300 font-medium mb-3">
          <div className="flex items-center gap-1.5">
            <button
              id="nav-back-btn"
              type="button"
              onClick={onFinishNavigation}
              className="p-1 -ml-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer text-sm"
              title="이전 화면으로 돌아가기"
            >
              ‹
            </button>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">안내 중</span>
            <span className="text-slate-500">·</span>
            <span>신호 여유 {signalSeconds}초</span>
          </div>
          <button
            id="nav-voice-toggle"
            type="button"
            onClick={() => setIsVoiceOn(!isVoiceOn)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <span>{isVoiceOn ? '🔊' : '🔇'}</span>
            <span>{isVoiceOn ? '음성 안내 중' : '음성 음소거'}</span>
          </button>
        </div>

        {/* Current Turn Instruction — 실제 경로 기반 */}
        <div className="flex items-start gap-4">
          {/* Turn Arrow Badge */}
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-md flex-shrink-0">
            {mainArrow}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-2xl font-black text-white tracking-tight leading-none">
              {mainInstruction}
            </div>
            <p className="text-xs text-slate-300 font-medium mt-1 truncate">
              {route.subDescription || '경로를 따라 이동 중'}
            </p>
          </div>
        </div>

        {/* Next Subsequent Action Line — 실제 다음 스텝 */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span className="text-[11px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-bold">
            그다음
          </span>
          <span className="text-white font-medium flex items-center gap-1">
            <span>{nextStep ? turnArrow(nextStep.kind) : '↑'}</span>
            <span>{nextInstruction}</span>
          </span>
        </div>
      </div>

      {/* Map View Port */}
      <div className="w-full h-full pt-36 pb-36 relative">
        <MapCanvas
          mode="navigation"
          selectedRoute={route}
          className="h-full"
          interactive={true}
        />
      </div>

      {/* Bottom Navigation HUD Panel */}
      <div
        id="navigation-bottom-hud"
        className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200/90 px-5 pt-3 pb-5 flex flex-col gap-3"
      >
        {/* Drag handle */}
        <div className="w-full flex justify-center pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* ETA & Distance Summary — 실제 경로 값 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {route.durationText}
              </span>
              <span className="text-sm font-bold text-blue-600">
                {route.arrivalTime || '도착 예정'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
              <span>남은 거리 {route.distanceText}</span>
              <span>·</span>
              <span className="text-emerald-600 font-bold">쾌적</span>
            </div>
          </div>

          {/* Route details miniature icon */}
          <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
            <span className="text-sm">🌱</span>
            <span className="text-[10px] font-bold mt-0.5">경로</span>
          </div>
        </div>

        {/* Control Button: 안내 종료 */}
        <div className="pt-1">
          <button
            id="nav-end-navigation-btn"
            type="button"
            onClick={onFinishNavigation}
            className="w-full py-3.5 px-4 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-1.5 border border-rose-100 cursor-pointer active:scale-95 shadow-2xs"
          >
            <span>✕</span>
            <span>안내 종료</span>
          </button>
        </div>
      </div>
    </div>
  );
};
