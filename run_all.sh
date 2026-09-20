#!/usr/bin/env bash
# 백엔드(8000) + 프론트엔드(3000)를 함께 실행합니다.
# 프론트엔드는 http://18.207.175.239:8000 을 API 주소로 직접 호출합니다(.env의 VITE_API_BASE).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[1/3] 기존 서버 정리..."
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "node .*vite" 2>/dev/null || true
sleep 1

echo "[2/3] 백엔드 시작 (포트 8000)..."
cd "$ROOT/backend"
export FRONTEND_ORIGIN="http://localhost:3000,http://18.207.175.239:3000"
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$ROOT/backend.log" 2>&1 &
BACKEND_PID=$!
echo "    backend pid: $BACKEND_PID (로그: $ROOT/backend.log)"

# 백엔드 헬스 대기
for i in $(seq 1 15); do
  if curl -s --max-time 2 http://localhost:8000/api/v1/health >/dev/null 2>&1; then
    echo "    backend healthy."
    break
  fi
  sleep 1
done

echo "[3/3] 프론트엔드 시작 (포트 3000, 포그라운드)..."
cd "$ROOT/frontend"
exec npm run dev
