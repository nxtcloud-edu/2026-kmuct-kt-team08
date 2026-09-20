import React, { useState, useEffect } from 'react';
import { LocationSettingPage } from './pages/LocationSettingPage';
import { RoutePreferencePage } from './pages/RoutePreferencePage';
import { AiAnalysisPage } from './pages/AiAnalysisPage';
import { RouteRecommendationPage } from './pages/RouteRecommendationPage';
import { RouteDetailPage } from './pages/RouteDetailPage';
import { NavigationPage } from './pages/NavigationPage';
import { BottomNavBar } from './components/BottomNavBar';
import { routeService } from './services/routeService';
import { locationService } from './services/locationService';
import { ConditionCategory, Location, RouteCandidate } from './types';

export default function App() {
  // Navigation Routing Step
  type AppStep = 'location' | 'preference' | 'analysis' | 'recommendation' | 'detail' | 'navigation';
  const [currentStep, setCurrentStep] = useState<AppStep>('location');
  const [previousStep, setPreviousStep] = useState<AppStep>('detail');

  // Bottom Nav Bar active tab
  const [currentTab, setCurrentTab] = useState<'home' | 'saved' | 'mypage'>('home');

  // Persistent User Journey State initialized via locationService abstraction
  const [origin, setOrigin] = useState<Location>(() => locationService.getMockCurrentLocation());
  const [destination, setDestination] = useState<Location | null>(null);

  const [naturalLanguageRequest, setNaturalLanguageRequest] = useState<string>('');

  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-b');

  // 길찾기 요청 진행 여부 (분석 화면이 응답 완료를 기다리는 데 사용)
  const [routeLoading, setRouteLoading] = useState<boolean>(false);

  // 길찾기 오류 메시지 (서비스 지역 밖 등). 위치 화면에 배너로 표시.
  const [routeError, setRouteError] = useState<string | null>(null);

  // Service data loaded from service layer
  const [recentLocations, setRecentLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<ConditionCategory[]>([]);
  const [routes, setRoutes] = useState<RouteCandidate[]>([]);

  // Load initial data through LocationService and RouteService
  useEffect(() => {
    async function loadData() {
      const [currLoc, recents, cats] = await Promise.all([
        locationService.getCurrentLocation(),
        locationService.getRecentDestinations(),
        routeService.getConditionCategories(),
      ]);

      setOrigin(currLoc);
      setRecentLocations(recents);
      setCategories(cats);
    }
    loadData();
  }, []);

  /**
   * 최신 출발지/도착지/조건으로 실제 경로를 다시 계산한다.
   * 사용자가 길찾기를 실행하는 시점(analysis 진입)에 호출되어
   * 현재 위치·목적지 변경이 항상 결과에 반영되도록 한다.
   */
  const runRouteSearch = async (): Promise<void> => {
    const targetDest = destination || recentLocations[0];
    if (!targetDest) {
      setRouteLoading(false);
      return;
    }
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await routeService.fetchRouteRecommendations({
        origin,
        destination: targetDest,
        selectedConditions,
        naturalLanguageQuery: naturalLanguageRequest,
      });
      setRoutes(res.routes);
      setSelectedRouteId(res.defaultSelectedRouteId);
    } catch (error) {
      // 서비스 지역(잠실~석촌) 밖 등 백엔드가 명확히 거부한 경우: 안내 후 위치 화면으로 복귀
      const err = error as { code?: string };
      if (err?.code === 'OUT_OF_SERVICE_AREA') {
        setRouteError(
          '이 서비스는 잠실~석촌 일대만 지원해요. 잠실역, 석촌역, 롯데월드, 석촌호수 등 해당 지역 장소로 다시 시도해 주세요.',
        );
      } else {
        setRouteError('경로를 계산하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      setRoutes([]);
      setCurrentStep('location');
    } finally {
      setRouteLoading(false);
    }
  };

  // Handlers for state updates and step navigation
  const handleSwapLocations = () => {
    if (destination) {
      const prevOrigin = { ...origin };
      setOrigin({ ...destination, isCurrent: false });
      setDestination({ ...prevOrigin, isCurrent: false });
    }
  };

  const handleStartAnalysis = () => {
    setCurrentStep('analysis');
    // 사용자가 선택한 최신 출발지/도착지로 실제 경로를 다시 계산한다.
    void runRouteSearch();
  };

  const handleAnalysisFinished = () => {
    setCurrentStep('recommendation');
  };

  const currentRoute =
    routes.find((r) => r.id === selectedRouteId) || routes[0] || null;

  return (
    <div className="w-full h-[100dvh] bg-slate-900 flex items-center justify-center p-0 sm:p-2 overflow-hidden">
      {/* Mobile Device Frame Container */}
      <div className="w-full sm:max-w-[420px] h-full sm:h-[min(844px,96vh)] max-h-[100dvh] bg-slate-50 sm:rounded-[36px] sm:shadow-2xl overflow-hidden flex flex-col relative sm:border-[8px] sm:border-slate-800">
        {/* Dynamic Screen Flow View */}
        <div className="flex-1 overflow-hidden relative">
          {currentTab === 'home' && (
            <>
              {currentStep === 'location' && (
                <LocationSettingPage
                  origin={origin}
                  destination={destination}
                  recentLocations={recentLocations}
                  errorMessage={routeError}
                  onSelectDestination={(loc) => setDestination(loc)}
                  onUpdateOrigin={(loc) => setOrigin(loc)}
                  onSwapLocations={handleSwapLocations}
                  onNext={() => setCurrentStep('preference')}
                />
              )}

              {currentStep === 'preference' && (
                <RoutePreferencePage
                  origin={origin}
                  destination={destination}
                  categories={categories}
                  naturalLanguageRequest={naturalLanguageRequest}
                  selectedConditions={selectedConditions}
                  onChangeNaturalLanguage={(val) => setNaturalLanguageRequest(val)}
                  onUpdateConditions={(conds) => setSelectedConditions(conds)}
                  onBack={() => setCurrentStep('location')}
                  onSubmitFindRoute={handleStartAnalysis}
                />
              )}

              {currentStep === 'analysis' && (
                <AiAnalysisPage
                  origin={origin}
                  destination={destination}
                  selectedConditions={selectedConditions}
                  naturalLanguageRequest={naturalLanguageRequest}
                  routeReady={!routeLoading && routes.length > 0}
                  onAnalysisComplete={handleAnalysisFinished}
                  onCancel={() => setCurrentStep('preference')}
                />
              )}

              {currentStep === 'recommendation' && (
                <RouteRecommendationPage
                  origin={origin}
                  destination={destination}
                  routes={routes}
                  selectedRouteId={selectedRouteId}
                  selectedConditions={selectedConditions}
                  naturalLanguageRequest={naturalLanguageRequest}
                  onSelectRoute={(id) => setSelectedRouteId(id)}
                  onGoToDetail={() => setCurrentStep('detail')}
                  onReconfigureConditions={() => setCurrentStep('preference')}
                  onBack={() => setCurrentStep('preference')}
                />
              )}

              {currentStep === 'detail' && currentRoute && (
                <RouteDetailPage
                  route={currentRoute}
                  origin={origin}
                  destination={destination}
                  selectedConditions={selectedConditions}
                  naturalLanguageRequest={naturalLanguageRequest}
                  onClose={() => setCurrentStep('recommendation')}
                  onStartNavigation={() => {
                    setPreviousStep('detail');
                    setCurrentStep('navigation');
                  }}
                />
              )}

              {currentStep === 'navigation' && currentRoute && (
                <NavigationPage
                  route={currentRoute}
                  onFinishNavigation={() => setCurrentStep(previousStep || 'detail')}
                  onReroute={() => setCurrentStep('preference')}
                />
              )}

              {currentStep === 'navigation' && !currentRoute && (
                <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center bg-slate-50">
                  <p className="text-sm font-bold text-slate-700">
                    경로 정보를 불러오지 못해 안내를 시작할 수 없습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('recommendation')}
                    className="px-4 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl"
                  >
                    경로 다시 선택
                  </button>
                </div>
              )}
            </>
          )}

          {/* Saved Tab */}
          {currentTab === 'saved' && (
            <div className="h-full bg-slate-50 p-6 flex flex-col">
              <h2 className="text-xl font-black text-slate-900 mb-4">저장된 장소 & 경로</h2>
              <div className="space-y-3">
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
                    <span>🏠</span> <span>우리집 (역삼동)</span>
                  </div>
                  <p className="text-xs text-slate-500">서울 강남구 테헤란로 152</p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
                    <span>🏫</span> <span>국민대학교</span>
                  </div>
                  <p className="text-xs text-slate-500">서울 성북구 정릉로 77</p>
                </div>
              </div>
              <button
                onClick={() => setCurrentTab('home')}
                className="mt-auto w-full py-3 bg-blue-600 text-white font-bold text-xs rounded-xl"
              >
                홈으로 돌아가기
              </button>
            </div>
          )}

          {/* My Page Tab */}
          {currentTab === 'mypage' && (
            <div className="h-full bg-slate-50 p-6 flex flex-col">
              <h2 className="text-xl font-black text-slate-900 mb-4">마이페이지</h2>
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs mb-4">
                <div className="text-sm font-black text-slate-900">MYWAY 보행자 프로필</div>
                <p className="text-xs text-slate-500 mt-1">안심 보행 지수: 98점 (최상)</p>
              </div>
              <button
                onClick={() => setCurrentTab('home')}
                className="mt-auto w-full py-3 bg-blue-600 text-white font-bold text-xs rounded-xl"
              >
                홈으로 돌아가기
              </button>
            </div>
          )}
        </div>

        {/* Persistent Bottom Tab Bar (shown on Location & Preference & Tabs) */}
        {(currentStep === 'location' || currentTab !== 'home') && (
          <BottomNavBar
            currentTab={currentTab}
            onTabChange={(tab) => setCurrentTab(tab)}
          />
        )}
      </div>
    </div>
  );
}
