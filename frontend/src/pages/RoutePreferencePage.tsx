import React, { useState, useEffect, useRef } from 'react';
import { WayCharacter } from '../components/WayCharacter';
import { ConditionBottomSheet } from '../components/ConditionBottomSheet';
import { ConditionCategory, Location } from '../types';
import { routeService } from '../services/routeService';

interface RoutePreferencePageProps {
  origin: Location;
  destination: Location | null;
  categories: ConditionCategory[];
  naturalLanguageRequest: string;
  selectedConditions: string[];
  onChangeNaturalLanguage: (text: string) => void;
  onUpdateConditions: (conditions: string[]) => void;
  onBack: () => void;
  onSubmitFindRoute: () => void;
}

export const RoutePreferencePage: React.FC<RoutePreferencePageProps> = ({
  origin,
  destination,
  categories,
  naturalLanguageRequest,
  selectedConditions,
  onChangeNaturalLanguage,
  onUpdateConditions,
  onBack,
  onSubmitFindRoute,
}) => {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [inputText, setInputText] = useState(naturalLanguageRequest);

  // Track previous detected keywords to smoothly auto-sync
  const prevDetectedRef = useRef<string[]>([]);
  const manuallyDismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setInputText(naturalLanguageRequest);
  }, [naturalLanguageRequest]);

  // Compute detected keywords from natural language input
  const detectedKeywords = routeService.detectKeywordsFromNaturalText(inputText);

  // Automatically reflect detected keywords into selectedConditions without requiring manual user selection
  useEffect(() => {
    const currentDetected = routeService.detectKeywordsFromNaturalText(inputText);
    const prevDetected = prevDetectedRef.current;

    // Check if detected keywords changed
    const hasChanged =
      currentDetected.length !== prevDetected.length ||
      !currentDetected.every((k, idx) => k === prevDetected[idx]);

    if (hasChanged) {
      prevDetectedRef.current = currentDetected;

      // Base: keep manually selected conditions that were not part of the previous detected set
      const manualConditions = selectedConditions.filter(
        (cond) => !prevDetected.includes(cond)
      );

      // Add detected keywords that haven't been explicitly dismissed
      const newKeywordsToAdd = currentDetected.filter(
        (k) => !manuallyDismissedRef.current.has(k)
      );

      const merged = Array.from(new Set([...manualConditions, ...newKeywordsToAdd]));

      // Only invoke onUpdateConditions if there is an actual difference with selectedConditions
      const isIdentical =
        merged.length === selectedConditions.length &&
        merged.every((c) => selectedConditions.includes(c));

      if (!isIdentical) {
        onUpdateConditions(merged);
      }
    }
  }, [inputText, selectedConditions, onUpdateConditions]);

  const handleRemoveCondition = (labelToRemove: string) => {
    manuallyDismissedRef.current.add(labelToRemove);
    onUpdateConditions(selectedConditions.filter((c) => c !== labelToRemove));
  };

  const handleResetConditions = () => {
    detectedKeywords.forEach((k) => manuallyDismissedRef.current.add(k));
    onUpdateConditions([]);
  };

  const handleApplyNaturalText = () => {
    onChangeNaturalLanguage(inputText);
    if (detectedKeywords.length > 0) {
      // Un-dismiss any detected keywords and auto-reflect
      detectedKeywords.forEach((k) => manuallyDismissedRef.current.delete(k));
      const updated = Array.from(new Set([...selectedConditions, ...detectedKeywords]));
      onUpdateConditions(updated);
    }
  };

  const getConditionEmoji = (label: string) => {
    if (label.includes('가로등') || label.includes('밝은') || label.includes('밝고')) return '💡';
    if (label.includes('큰길') || label.includes('대로')) return '🚦';
    if (label.includes('경사') || label.includes('계단')) return '⛰️';
    if (label.includes('그늘') || label.includes('녹지')) return '🌲';
    if (label.includes('자전거')) return '🚲';
    if (label.includes('혼잡') || label.includes('사람')) return '👥';
    if (label.includes('조용') || label.includes('번화가')) return '🤫';
    if (label.includes('우회') || label.includes('분')) return '⏱️';
    if (label.includes('골목')) return '🛡️';
    return '✨';
  };

  return (
    <div id="route-preference-screen" className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <button
          id="preference-back-btn"
          type="button"
          onClick={onBack}
          className="p-1.5 -ml-1 text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          title="뒤로 가기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-5 h-5">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" />
          </svg>
        </button>
        <h1 className="text-base font-extrabold text-slate-900">
          경로 조건 설정
        </h1>
        <div className="w-8" />
      </header>

      {/* Main Content */}
      <main className="flex-1 px-5 py-4 space-y-5 pb-32">
        {/* Selected Journey Summary Card */}
        <section className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-400">선택된 여정</span>
            <button
              id="change-route-locations-btn"
              type="button"
              onClick={onBack}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>경로 변경</span>
              <span>⇄</span>
            </button>
          </div>

          <div className="space-y-2 text-xs font-semibold text-slate-800">
            {/* Origin Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 flex-shrink-0" />
                <span className="truncate">{origin.name}</span>
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                출발
              </span>
            </div>
            {/* Destination Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                <span className="truncate">{destination?.name || '잠실역'}</span>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                약 18분
              </span>
            </div>
          </div>
        </section>

        {/* Customized Guide Header + Way Avatar */}
        <section className="flex items-start justify-between gap-3 pt-1">
          <div>
            <span className="text-xs font-bold text-blue-600 tracking-tight">
              맞춤 여정 가이드
            </span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              어떤 길로 가고 싶나요?
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
              가장 빠른 길 대신, 지금 내 기분과 상황에 꼭 맞는 길을 안내해 드려요.
            </p>
          </div>
          {/* Way Mascot Avatar badge */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-blue-100/70 to-indigo-100/50 p-1 flex items-center justify-center flex-shrink-0 shadow-xs border border-blue-200/60">
            <WayCharacter size="sm" variant="avatar" />
          </div>
        </section>

        {/* Method A: Natural Language Input Card */}
        <section className="bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/40 rounded-2xl p-4 border border-indigo-100 shadow-xs space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
            <span>‹</span>
            <span>원하는 길을 말해주세요</span>
          </div>

          <div className="relative bg-white rounded-xl p-3 border border-slate-200 focus-within:border-blue-500 shadow-2xs">
            <textarea
              id="natural-language-query-input"
              rows={2}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                onChangeNaturalLanguage(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleApplyNaturalText();
                }
              }}
              placeholder="ex) 밤이라 골목은 피하고, 조금 돌아가도 밝고 큰길 위주로 가고 싶어"
              className="w-full text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none resize-none pr-10 leading-relaxed"
            />
            <button
              id="submit-natural-text-btn"
              type="button"
              onClick={handleApplyNaturalText}
              className="absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center text-xs shadow-xs transition-transform active:scale-95"
              title="조건 반영"
            >
              →
            </button>
          </div>

          {/* Detected Keywords Banner */}
          {detectedKeywords.length > 0 && (
            <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-xl border border-indigo-100 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-indigo-950 flex items-center gap-1">
                  <span className="text-amber-500">💡</span>
                  <span>감지된 맞춤 키워드</span>
                </span>
                <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  맞춤 조건에 자동 반영됨
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {detectedKeywords.map((keyword) => {
                  const isSelected = selectedConditions.includes(keyword);
                  return (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => {
                        if (!isSelected) {
                          manuallyDismissedRef.current.delete(keyword);
                          onUpdateConditions([...selectedConditions, keyword]);
                        } else {
                          manuallyDismissedRef.current.add(keyword);
                          onUpdateConditions(selectedConditions.filter((c) => c !== keyword));
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-indigo-50/80 hover:bg-indigo-100 text-indigo-800 border border-indigo-200/70'
                      }`}
                      title={isSelected ? '클릭 시 조건 해제' : '맞춤 조건에 다시 추가'}
                    >
                      <span>"{keyword}"</span>
                      <span className="text-[10px] opacity-90">{isSelected ? '✓ 반영됨' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Method B: Direct Condition Picker Button */}
        <section>
          <button
            id="open-condition-bottom-sheet-btn"
            type="button"
            onClick={() => setIsBottomSheetOpen(true)}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between text-xs font-bold text-slate-800 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 text-blue-600">
              <span>🎛️</span>
              <span className="text-slate-900 font-bold">+ 원하는 길 직접 선택하기</span>
            </div>
            <span className="text-slate-400 text-sm">›</span>
          </button>
        </section>

        {/* Selected Conditions Management Area */}
        <section className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-900">선택된 맞춤 조건</span>
              {selectedConditions.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {selectedConditions.length}
                </span>
              )}
            </div>
            {selectedConditions.length > 0 && (
              <button
                id="reset-selected-conditions-btn"
                type="button"
                onClick={handleResetConditions}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>

          {/* Condition Chips */}
          {selectedConditions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedConditions.map((label) => {
                const isAutoDetected = detectedKeywords.includes(label);
                return (
                  <div
                    key={label}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/90 border border-blue-200 text-blue-800 rounded-full text-xs font-semibold shadow-2xs"
                  >
                    <span>{getConditionEmoji(label)}</span>
                    <span>{label}</span>
                    {isAutoDetected && (
                      <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                        자동 반영
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveCondition(label)}
                      className="text-blue-400 hover:text-blue-700 ml-0.5 text-xs font-bold cursor-pointer"
                      title={`${label} 삭제`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-1 font-medium">
              선택된 조건이 없습니다. 원하는 조건을 직접 선택하거나 자연어로 입력해보세요.
            </p>
          )}

          {/* Synthesis Note */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
            <span className="text-blue-500 font-bold">ℹ️</span>
            <span>
              자연어에서 감지된 맞춤 키워드는 조건에 즉시 자동 반영되며, 종합 분석을 통해 도로 안전도 점수가 가장 높은 최적 경로를 계산합니다.
            </span>
          </div>
        </section>
      </main>

      {/* Floating Bottom Action Bar */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4">
        <button
          id="find-route-btn"
          type="button"
          onClick={onSubmitFindRoute}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>이 조건으로 길 찾기</span>
          <span>→</span>
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center justify-center gap-1">
          <span>🛡️</span>
          <span>AI가 실시간 CCTV·가로등·경사도 및 교통 빅데이터를 종합 분석합니다</span>
        </p>
      </footer>

      {/* Condition Bottom Sheet Component */}
      <ConditionBottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        categories={categories}
        selectedConditionLabels={selectedConditions}
        onApply={(newLabels) => onUpdateConditions(newLabels)}
      />
    </div>
  );
};
