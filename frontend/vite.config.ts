import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

// HTTPS는 환경별로 생성한 Git 미추적 인증서/개인키를 명시한 경우에만 사용합니다.
const keyFile = process.env.DEV_TLS_KEY_FILE;
const certFile = process.env.DEV_TLS_CERT_FILE;
if (Boolean(keyFile) !== Boolean(certFile)) {
  throw new Error('DEV_TLS_KEY_FILE and DEV_TLS_CERT_FILE must be set together');
}
const httpsOptions = keyFile && certFile
  ? {
      key: fs.readFileSync(path.resolve(__dirname, keyFile)),
      cert: fs.readFileSync(path.resolve(__dirname, certFile)),
    }
  : undefined;

// 백엔드 주소 (프록시 대상). 기본 localhost:8000.
const backendTarget = process.env.BACKEND_ORIGIN ?? 'http://localhost:8000';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // self-signed 인증서가 있으면 HTTPS 로 서빙 (브라우저 위치/보안 컨텍스트 요구사항 충족)
      https: httpsOptions,
      // /api 요청을 백엔드로 프록시 -> mixed content / CORS 없이 같은 origin 사용
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
