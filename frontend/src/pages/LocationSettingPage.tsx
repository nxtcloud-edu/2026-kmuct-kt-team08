import React, { useState, useEffect, useRef } from 'react';
import { MapCanvas } from '../components/MapCanvas';
import { MyWayLogo } from '../components/MyWayLogo';
import { Location } from '../types';
import { locationService, lookupKnownPlace } from '../services/locationService';

interface LocationSettingPageProps {
  origin: Location;
  destination: Location | null;
  recentLocations: Location[];
  errorMessage?: string | null;
  onSelectDestination: (dest: Location | null) => void;
  onUpdateOrigin?: (origin: Location) => void;
  onSwapLocations: () => void;
  onNext: () => void;
}

export const LocationSettingPage: React.FC<LocationSettingPageProps> = ({
  origin,
  destination,
  recentLocations,
  errorMessage,
  onSelectDestination,
  onUpdateOrigin,
  onSwapLocations,
  onNext,
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

  const [originInput, setOriginInput] = useState(origin?.name || '');
  const [searchInput, setSearchInput] = useState(destination?.name || '');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [destinationList, setDestinationList] = useState<Location[]>(recentLocations);

  // Sync state if origin or destination changes externally (e.g., swapping)
  useEffect(() => {
    if (origin) {
      setOriginInput(origin.name);
    }
  }, [origin?.id, origin?.name]);

  useEffect(() => {
    setSearchInput(destination ? destination.name : '');
  }, [destination?.id, destination?.name]);

  // Search destination candidates via locationService abstraction layer
  useEffect(() => {
    let isMounted = true;
    locationService.searchDestinations(searchInput).then((results) => {
      if (isMounted) {
        setDestinationList(results);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [searchInput, recentLocations]);

  /**
   * 입력한 텍스트를 좌표로 해석한다. 우선순위:
   *  1) 최근/추천 목록에 있는 장소 → 그 좌표
   *  2) 백엔드 지원 장소 사전(KNOWN_PLACES) → 그 좌표 (메인화면 지도 마커용)
   *  3) 둘 다 없으면 좌표를 비워(0) 백엔드 이름 지오코딩에 위임
   * 어떤 경우에도 하드코딩된 임의 좌표를 쓰지 않는다.
   */
  const resolveTypedLocation = (val: string, fallbackId: string): Location => {
    const q = val.trim().toLowerCase();
    if (!q) {
      return { id: fallbackId, name: val, address: val, lat: 0, lng: 0, isCurrent: false };
    }

    // 1) 최근/추천 목록 매칭
    const match = recentLocations.find(
      (loc) =>
        loc.name.toLowerCase() === q ||
        loc.name.toLowerCase().includes(q) ||
        q.includes(loc.name.toLowerCase()),
    );
    if (match) {
      return { ...match, name: val };
    }

    // 2) 백엔드 지원 장소 사전 매칭 → 실제 좌표로 지도에 마커 표시 가능
    const known = lookupKnownPlace(val);
    if (known) {
      return { id: fallbackId, name: val, address: val, lat: known.lat, lng: known.lng, isCurrent: false };
    }

    // 3) 알 수 없는 장소: 좌표 비워 백엔드 지오코딩에 위임
    return { id: fallbackId, name: val, address: val, lat: 0, lng: 0, isCurrent: false };
  };

  const handleOriginChange = (val: string) => {
    setOriginInput(val);
    if (onUpdateOrigin) {
      // 알려진 장소면 실제 좌표, 아니면 좌표 비워서 백엔드 지오코딩에 위임.
      onUpdateOrigin(resolveTypedLocation(val, 'custom-origin'));
    }
  };

  const handleClearOrigin = () => {
    setOriginInput('');
    if (onUpdateOrigin) {
      onUpdateOrigin({
        id: 'custom-origin',
        name: '',
        address: '',
        lat: 0,
        lng: 0,
      });
    }
  };

  // 실제 GPS 현재 위치로 출발지 갱신
  const [locating, setLocating] = useState(false);
  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const loc = await locationService.getCurrentLocation({ fallbackOnError: false });
      setOriginInput(loc.name);
      onUpdateOrigin?.(loc);
    } catch (err) {
      console.warn('[LocationSettingPage] 현재 위치 가져오기 실패', err);
      const insecure =
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';
      alert(
        insecure
          ? '현재 위치는 HTTPS(또는 localhost)에서만 사용할 수 있어요. 주소가 http:// 라 브라우저가 위치 접근을 막았습니다.'
          : '현재 위치를 가져오지 못했습니다. 브라우저 위치 권한을 허용했는지 확인해주세요.',
      );
    } finally {
      setLocating(false);
    }
  };

  const handleClearDestination = () => {
    setSearchInput('');
    onSelectDestination(null);
    setShowSearchDropdown(true);
  };

  const handleChooseLocation = (loc: Location) => {
    locationService.addRecentDestination(loc);
    onSelectDestination(loc);
    setSearchInput(loc.name);
    setShowSearchDropdown(false);
  };

  return (
    <div id="location-setting-screen" className="relative flex flex-col h-full bg-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <header className="absolute top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md px-5 py-3.5 flex items-center justify-between border-b border-slate-200/80 shadow-xs">
        <MyWayLogo size="sm" showSlogan={true} />
        {/* Notification Bell */}
        <button
          id="header-notification-btn"
          type="button"
          aria-label="알림"
          className="relative p-2 text-slate-700 hover:text-blue-600 transition-colors rounded-full hover:bg-slate-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white" />
        </button>
      </header>

      {/* Background Interactive Map Area */}
      <div className="absolute inset-0 pt-14 pb-20">
        <MapCanvas
          mode="home"
          className="h-full"
          originName={origin.name}
          destinationName={destination?.name || ''}
          originCoord={origin && (origin.lat || origin.lng) ? { lat: origin.lat, lng: origin.lng } : null}
          destinationCoord={destination && (destination.lat || destination.lng) ? { lat: destination.lat, lng: destination.lng } : null}
          currentLocationText="내 위치: 석촌역 8·9호선 부근"
        />
      </div>

      {/* Bottom Sheet Card with Expand/Collapse capability to clearly define sheet's role */}
      <div
        id="location-bottom-sheet"
        className={`absolute inset-x-0 bottom-0 z-20 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200/90 flex flex-col transition-all duration-300 ease-out ${
          sheetMode === 'expanded'
            ? 'top-14'
            : sheetMode === 'peek'
            ? 'top-[calc(100%-120px)]'
            : 'top-[36%]'
        }`}
      >
        {/* Interactive Drag Handle */}
        <div
          className="w-full flex justify-center pt-3 pb-2 cursor-pointer select-none bg-white rounded-t-3xl hover:bg-slate-50/80 transition-colors flex-shrink-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => {
            if (sheetMode === 'expanded') setSheetMode('half');
            else if (sheetMode === 'half') setSheetMode('expanded');
            else setSheetMode('half');
          }}
        >
          {/* Visual Drag Pill */}
          <div className="w-11 h-1.5 bg-slate-300 hover:bg-slate-400 rounded-full transition-colors" />
        </div>

        {/* Scrollable Container: Origin/Dest Inputs & Recent Destinations */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 pt-3 space-y-3 pb-2">
          {/* Expanded Mode Quick Return Banner */}
          {sheetMode === 'expanded' && (
            <div className="flex justify-center pb-1">
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

          {/* Title & Subtitle */}
          <div className="mb-2.5 flex-shrink-0">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              어디로 갈까요?
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              상황에 맞는 가장 좋은 경로를 찾아드릴게요.
            </p>
          </div>

          {/* 서비스 지역 밖 등 오류 안내 배너 */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold px-3 py-2.5 rounded-xl"
            >
              <span className="text-sm leading-none mt-0.5">⚠️</span>
              <span className="flex-1">{errorMessage}</span>
            </div>
          )}

          {/* Origin & Destination Input Box */}
          <div className="relative bg-slate-50/90 rounded-2xl p-3 border border-slate-200/80">
            {/* Origin Field */}
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-200/70 pr-10">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100 flex-shrink-0" />
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                출발
              </span>
              <input
                id="origin-search-input"
                type="text"
                value={originInput}
                placeholder="내 위치"
                onChange={(e) => handleOriginChange(e.target.value)}
                className="flex-1 text-xs font-semibold text-slate-900 bg-transparent placeholder-slate-400 focus:outline-none min-w-0"
              />
              <button
                type="button"
                id="use-current-location-btn"
                onClick={handleUseCurrentLocation}
                disabled={locating}
                title="현재 위치 사용 (GPS)"
                aria-label="현재 위치 사용"
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 px-2 py-1 rounded-full flex-shrink-0 transition-colors disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`}
                >
                  <circle cx="12" cy="12" r="7" />
                  <line x1="12" y1="1" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="23" />
                  <line x1="1" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="23" y2="12" />
                </svg>
                <span>{locating ? '찾는 중' : '현재 위치'}</span>
              </button>
              <button
                type="button"
                id="clear-origin-btn"
                onClick={handleClearOrigin}
                className={`w-6 h-6 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 active:text-slate-800 text-xs flex items-center justify-center cursor-pointer flex-shrink-0 transition-all ${
                  originInput ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                title="출발지 지우기"
                aria-label="출발지 지우기"
              >
                ✕
              </button>
            </div>

            {/* Destination Field */}
            <div className="flex items-center gap-2.5 pt-2.5 pr-10">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 flex-shrink-0" />
              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded flex-shrink-0">
                도착
              </span>
              <input
                id="destination-search-input"
                type="text"
                value={searchInput}
                placeholder="도착지를 입력해주세요"
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInput(val);
                  setShowSearchDropdown(true);
                  if (val.trim()) {
                    // 알려진 장소면 실제 좌표, 아니면 좌표 비워서 백엔드 지오코딩에 위임.
                    onSelectDestination(resolveTypedLocation(val, 'custom-dest'));
                  } else {
                    onSelectDestination(null);
                  }
                }}
                onFocus={() => setShowSearchDropdown(true)}
                className="flex-1 text-xs font-semibold text-slate-900 bg-transparent placeholder-slate-400 focus:outline-none min-w-0"
              />
              <button
                type="button"
                id="clear-destination-btn"
                onClick={handleClearDestination}
                className={`w-6 h-6 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 active:text-slate-800 text-xs flex items-center justify-center cursor-pointer flex-shrink-0 transition-all ${
                  searchInput ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                title="도착지 지우기"
                aria-label="도착지 지우기"
              >
                ✕
              </button>
            </div>

            {/* Swap Button on the right side */}
            <button
              id="swap-locations-btn"
              type="button"
              onClick={onSwapLocations}
              title="출발지 / 목적지 전환"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600 transition-transform active:rotate-180"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" />
              </svg>
            </button>
          </div>

          {/* Recent Destinations (최근 목적지 / 검색 결과) Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <span>{searchInput ? '🔍' : '🕒'}</span>
                <span>{searchInput ? '목적지 검색 결과' : '최근 목적지'}</span>
              </div>
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="text-[11px] text-slate-400 hover:text-slate-600 font-medium"
              >
                {searchInput ? '초기화' : '전체삭제'}
              </button>
            </div>

            {/* Location List Items */}
            <div className="space-y-1.5">
              {destinationList.length > 0 ? (
                destinationList.map((loc) => {
                  const isSelected = destination?.id === loc.id;
                  return (
                    <div
                      key={loc.id}
                      id={`recent-location-${loc.id}`}
                      onClick={() => handleChooseLocation(loc)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-200 ring-1 ring-blue-300'
                          : 'bg-white hover:bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0 text-xs">
                          📍
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {loc.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {loc.address} {loc.timeAgo ? `· ${loc.timeAgo}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className="text-slate-300 text-xs font-bold pl-2">›</span>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-xs text-slate-500 font-semibold">검색 결과가 없습니다.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    예: 잠실역, 국민대학교, 서울역, 광화문, 성신여대입구역, 혜화역
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pinned Bottom Action Button: ALWAYS inside the mobile screen! */}
        <div className="px-5 pt-2 pb-3 bg-white border-t border-slate-100 flex-shrink-0">
          <button
            id="location-next-button"
            type="button"
            onClick={() => {
              // 출발지를 비워두면 실제 현재 위치(GPS)로 채운다. 실패 시 getCurrentLocation 내부에서 Mock 폴백.
              if (!originInput.trim() && onUpdateOrigin) {
                void locationService
                  .getCurrentLocation()
                  .then((loc) => {
                    setOriginInput(loc.name);
                    onUpdateOrigin(loc);
                  })
                  .catch(() => {
                    /* getCurrentLocation 이 자체적으로 폴백 처리 */
                  });
              }
              if (searchInput.trim()) {
                // 알려진 장소면 실제 좌표, 아니면 좌표 비워 백엔드 지오코딩에 위임.
                onSelectDestination(resolveTypedLocation(searchInput.trim(), 'typed-dest'));
              } else if (!destination && destinationList.length > 0) {
                onSelectDestination(destinationList[0]);
              }
              onNext();
            }}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>다음으로</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
