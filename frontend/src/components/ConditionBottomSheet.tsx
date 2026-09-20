import React, { useState, useEffect } from 'react';
import { ConditionCategory } from '../types';

interface ConditionBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ConditionCategory[];
  selectedConditionLabels: string[];
  onApply: (selectedLabels: string[]) => void;
}

export const ConditionBottomSheet: React.FC<ConditionBottomSheetProps> = ({
  isOpen,
  onClose,
  categories,
  selectedConditionLabels,
  onApply,
}) => {
  const [localSelected, setLocalSelected] = useState<string[]>([]);

  // Sync state when bottom sheet opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected([...selectedConditionLabels]);
    }
  }, [isOpen, selectedConditionLabels]);

  if (!isOpen) return null;

  const handleToggleCondition = (label: string) => {
    setLocalSelected((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const handleReset = () => {
    setLocalSelected([]);
  };

  const handleConfirm = () => {
    onApply(localSelected);
    onClose();
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'shield':
        return '🛡️';
      case 'trees':
        return '🌲';
      case 'accessibility':
        return '♿';
      case 'bike':
        return '🚲';
      case 'zap':
        return '⚡';
      default:
        return '✨';
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300">
      {/* Backdrop Click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div
        id="condition-bottom-sheet-modal"
        className="relative w-full max-w-md max-h-[85vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
      >
        {/* Drag Handle Bar */}
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              어떤 길을 원하세요?
            </h2>
            {localSelected.length > 0 && (
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                {localSelected.length}
              </span>
            )}
          </div>
          <button
            id="condition-sheet-reset-btn"
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <span>🔄</span>
            <span>초기화</span>
          </button>
        </div>

        {/* Subtitle */}
        <div className="px-5 pt-2">
          <p className="text-xs text-slate-500 font-medium">
            원하는 보행 환경 조건을 여러 개 선택할 수 있어요.
          </p>
        </div>

        {/* Scrollable Condition Categories */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {categories.map((cat) => (
            <div key={cat.id} className="space-y-2.5">
              {/* Category Header */}
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <span>{getCategoryIcon(cat.iconName)}</span>
                <span>{cat.title}</span>
                <span className="text-xs font-normal text-slate-400">({cat.subtitle})</span>
              </div>

              {/* Condition Chips */}
              <div className="flex flex-wrap gap-2">
                {cat.conditions.map((cond) => {
                  const isSelected = localSelected.includes(cond.label);
                  return (
                    <button
                      key={cond.id}
                      type="button"
                      onClick={() => handleToggleCondition(cond.label)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{cond.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Realtime AI synchronization callout */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl text-[11px] text-blue-900 leading-relaxed">
            선택하신 조건은 자연어 질의 입력 내용과 함께 실시간 AI 맞춤 경로 분석에 즉시 반영됩니다.
          </div>
        </div>

        {/* Footer Action Button */}
        <div className="p-4 bg-white border-t border-slate-100">
          <button
            id="condition-sheet-confirm-btn"
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>선택 완료 ({localSelected.length}개)</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
