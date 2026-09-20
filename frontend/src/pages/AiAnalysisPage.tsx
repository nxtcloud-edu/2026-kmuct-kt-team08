import React, { useEffect, useState } from 'react';
import { WayCharacter } from '../components/WayCharacter';
import { Location } from '../types';

interface AiAnalysisPageProps {
  origin: Location;
  destination: Location | null;
  selectedConditions: string[];
  naturalLanguageRequest: string;
  /** 백엔드 경로 응답이 준비됐는지. true 가 되어야 결과 화면으로 넘어간다. */
  routeReady?: boolean;
  onAnalysisComplete: () => void;
  onCancel: () => void;
}

export const AiAnalysisPage: React.FC<AiAnalysisPageProps> = ({
  origin,
  destination,
  selectedConditions,
  routeReady = true,
  onAnalysisComplete,
  onCancel,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(2); // Start at step 3 (0-indexed: 0, 1, 2, 3)
  const [percentProgress, setPercentProgress] = useState(85);

  // 최소 애니메이션 시간이 지났는지 (너무 빨리 넘어가 깜빡이지 않도록)
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    // Step progression animation
    const timer1 = setTimeout(() => {
      setPercentProgress(95);
      setCurrentStepIndex(3);
    }, 1100);

    const timer2 = setTimeout(() => {
      setMinTimePassed(true);
    }, 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // 최소 시간이 지났고 + 백엔드 응답이 준비되면 결과 화면으로 넘어간다.
  useEffect(() => {
    if (minTimePassed && routeReady) {
      setPercentProgress(100);
      onAnalysisComplete();
    }
  }, [minTimePassed, routeReady, onAnalysisComplete]);

  // 안전장치: 응답이 지나치게 오래 걸려도 8초 후에는 결과 화면으로 넘긴다.
  // (fetchRouteRecommendations 는 실패 시 mock 으로 폴백하므로 routes 는 결국 채워진다)
  useEffect(() => {
    const failSafe = setTimeout(() => {
      onAnalysisComplete();
    }, 8000);
    return () => clearTimeout(failSafe);
  }, [onAnalysisComplete]);

  // Derive dynamic comment based on conditions
  const getDynamicWayComment = () => {
    if (selectedConditions.includes('가로등 많은 길') || selectedConditions.includes('큰길 위주')) {
      return '“가로등이 많고 큰길 위주인 안심 경로를 먼저 찾고 있어요!”';
    }
    if (selectedConditions.includes('경사 낮은 길')) {
      return '“가파른 언덕길과 계단을 피해 평탄하고 쾌적한 안심길을 계산 중이에요!”';
    }
    return '“회원님의 선호에 가장 잘 맞는 최적의 안심 경로 3가지를 정밀 조합하고 있어요!”';
  };

  const steps = [
    {
      title: '사용자의 요청을 이해했어요',
      desc: '야간 보행 안전도 및 경사도 가중치 설정 완료',
    },
    {
      title: '지도 데이터를 확인하고 있어요',
      desc: 'CCTV 142개, 스마트 가로등 380개 조도 데이터 연동',
    },
    {
      title: '여러 경로를 비교하고 있어요',
      desc: '후보 경로 3개 도출 및 조건 충족률 정밀 계산 중',
    },
    {
      title: '적합한 경로를 선택하고 있어요',
      desc: '추천 사유 및 최단 경로 대비 Trade-off 요약 준비',
    },
  ];

  return (
    <div id="ai-analysis-screen" className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <button
          id="analysis-back-btn"
          type="button"
          onClick={onCancel}
          className="p-1.5 -ml-1 text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          title="취소하고 돌아가기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-5 h-5">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" />
          </svg>
        </button>
        <h1 className="text-base font-extrabold text-slate-900">
          경로 분석
        </h1>
        <div className="w-8" />
      </header>

      {/* Main Content */}
      <main className="flex-1 px-5 py-5 space-y-5 pb-28">
        {/* Title Header */}
        <div className="space-y-1">
          <span className="inline-block px-2.5 py-1 bg-blue-100/80 text-blue-700 rounded-full text-[11px] font-extrabold tracking-tight">
            실시간 AI 맞춤 분석
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-snug">
            당신에게 맞는 길을<br />분석하고 있어요
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            입력하신 조건과 실시간 보행·조도 빅데이터를 비교 분석 중입니다.
          </p>
        </div>

        {/* Mascot Thinking Stage */}
        <div className="relative flex flex-col items-center justify-center py-4">
          {/* Glowing Circular Backdrop */}
          <div className="w-36 h-36 rounded-full bg-gradient-to-tr from-blue-200/40 via-sky-100/60 to-indigo-100/40 blur-lg absolute -z-0 animate-pulse" />
          
          <WayCharacter
            size="lg"
            variant="thinking"
            showSpeech={true}
            speechText="생각 중"
          />

          {/* Way's Comment Speech Box (Matching Stitch Image 9) */}
          <div className="mt-4 w-full bg-white rounded-2xl p-3.5 border border-indigo-100/80 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
              <span>Way의 코멘트</span>
            </div>
            <p className="text-xs font-bold text-slate-800 leading-relaxed">
              {getDynamicWayComment()}
            </p>
          </div>
        </div>

        {/* Origin / Destination & Selected Conditions Bar */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>{origin.name}</span>
            <span className="text-slate-400">→</span>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>{destination?.name || '잠실역'}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedConditions.length > 0 ? (
              selectedConditions.map((cond) => (
                <span
                  key={cond}
                  className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold flex items-center gap-1"
                >
                  <span>
                    {cond.includes('밝은') || cond.includes('가로등')
                      ? '💡'
                      : cond.includes('혼잡') || cond.includes('사람')
                      ? '👥'
                      : cond.includes('조용') || cond.includes('번화가')
                      ? '🤫'
                      : cond.includes('우회') || cond.includes('분')
                      ? '⏱️'
                      : cond.includes('큰길') || cond.includes('대로')
                      ? '🚦'
                      : cond.includes('경사') || cond.includes('계단')
                      ? '⛰️'
                      : '✨'}
                  </span>
                  <span>{cond}</span>
                </span>
              ))
            ) : (
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-medium">
                기본 안전 추천 경로
              </span>
            )}
          </div>
        </div>

        {/* Step Progress Checklist Card (Matching Stitch Image 9) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-900">
              분석 진행 단계
            </span>
            <span className="text-xs font-bold text-blue-600">
              {currentStepIndex + 1} / 4 단계
            </span>
          </div>

          <div className="space-y-3">
            {steps.map((step, idx) => {
              const isFinished = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={step.title}
                  className={`flex items-start gap-3 transition-opacity ${
                    idx > currentStepIndex ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  {/* Step Icon */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      isFinished
                        ? 'bg-blue-100 text-blue-600'
                        : isCurrent
                        ? 'bg-blue-600 text-white animate-pulse'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isFinished ? '✓' : isCurrent ? '🔄' : '⏳'}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4
                        className={`text-xs font-bold truncate ${
                          isCurrent ? 'text-blue-700' : 'text-slate-800'
                        }`}
                      >
                        {step.title}
                      </h4>
                      {isCurrent && (
                        <span className="text-[11px] font-extrabold text-blue-600 ml-2">
                          {percentProgress}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hint banner */}
        <div className="flex items-center justify-between px-2 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1">
            <span className="text-blue-500">💡</span>
            <span>잠시 후 맞춤 추천 경로 3개가 표시됩니다.</span>
          </div>
          <span className="text-slate-400 font-semibold">예상 2초</span>
        </div>
      </main>

      {/* Footer Status & Cancel Link */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 flex flex-col items-center gap-2">
        <button
          disabled
          className="w-full py-3.5 px-4 bg-blue-600/90 text-white font-bold text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-wait"
        >
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>최적 경로 조합 중...</span>
        </button>

        <button
          id="cancel-analysis-btn"
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-700 font-medium py-1"
        >
          취소하고 조건 다시 설정
        </button>
      </footer>
    </div>
  );
};
