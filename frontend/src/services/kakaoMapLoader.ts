/**
 * 카카오맵 JavaScript SDK 동적 로더.
 *
 * - 키는 .env 의 VITE_MAP_API_KEY 에서 읽습니다 (Vite는 VITE_ 접두어 필수).
 * - autoload=false 로 로드한 뒤 kakao.maps.load() 콜백에서 준비 완료를 보장합니다.
 * - 여러 컴포넌트가 동시에 호출해도 스크립트는 한 번만 로드되도록 Promise를 캐시합니다.
 * - 키가 없거나 로드 실패 시 reject → 호출부에서 정적 SVG로 폴백합니다.
 */

const MAP_API_KEY = (import.meta as any).env?.VITE_MAP_API_KEY as string | undefined;

declare global {
  interface Window {
    kakao?: any;
  }
}

let loaderPromise: Promise<any> | null = null;

export function isKakaoConfigured(): boolean {
  return typeof MAP_API_KEY === 'string' && MAP_API_KEY.length > 0;
}

export function loadKakaoMaps(): Promise<any> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    if (!isKakaoConfigured()) {
      reject(new Error('VITE_MAP_API_KEY 가 설정되지 않았습니다.'));
      return;
    }

    // 이미 로드되어 있으면 재사용
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao));
      return;
    }

    const existing = document.getElementById('kakao-maps-sdk') as HTMLScriptElement | null;
    const onReady = () => {
      if (!window.kakao?.maps) {
        reject(new Error('카카오맵 SDK 로드 후에도 kakao.maps 를 찾을 수 없습니다.'));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('카카오맵 SDK 스크립트 로드 실패')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'kakao-maps-sdk';
    // autoload=false → kakao.maps.load() 로 명시적 초기화
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${MAP_API_KEY}&autoload=false`;
    script.async = true;
    script.addEventListener('load', onReady, { once: true });
    script.addEventListener('error', () => reject(new Error('카카오맵 SDK 스크립트 로드 실패')), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return loaderPromise;
}
