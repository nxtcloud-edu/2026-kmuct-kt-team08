import React from 'react';

interface BottomNavBarProps {
  currentTab: 'home' | 'saved' | 'mypage';
  onTabChange: (tab: 'home' | 'saved' | 'mypage') => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentTab, onTabChange }) => {
  return (
    <nav
      id="myway-bottom-navigation-bar"
      className="w-full bg-white border-t border-slate-200 py-2 px-8 flex items-center justify-around z-30 select-none shadow-sm"
    >
      {/* Home Tab */}
      <button
        id="nav-tab-home"
        type="button"
        onClick={() => onTabChange('home')}
        className={`flex flex-col items-center gap-1 transition-colors ${
          currentTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
          <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z" />
          <path d="M9 21V12H15V21" />
        </svg>
        <span className="text-[11px] font-semibold">홈</span>
      </button>

      {/* Saved / Bookmarks Tab */}
      <button
        id="nav-tab-saved"
        type="button"
        onClick={() => onTabChange('saved')}
        className={`flex flex-col items-center gap-1 transition-colors ${
          currentTab === 'saved' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
          <path d="M19 21L12 16L5 21V5C5 3.89543 5.89543 3 7 3H17C18.1046 3 19 3.89543 19 5V21Z" />
        </svg>
        <span className="text-[11px] font-semibold">저장</span>
      </button>

      {/* My Page Tab */}
      <button
        id="nav-tab-mypage"
        type="button"
        onClick={() => onTabChange('mypage')}
        className={`flex flex-col items-center gap-1 transition-colors ${
          currentTab === 'mypage' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
          <path d="M20 21V19C20 16.7909 18.2091 15 16 15H8C5.79086 15 4 16.7909 4 19V21" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="text-[11px] font-semibold">마이페이지</span>
      </button>
    </nav>
  );
};
