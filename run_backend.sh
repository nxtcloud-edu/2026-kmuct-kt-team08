y#!/usr/bin/env bash
# 백엔드 실행 스크립트 (포트 8000)
cd "$(dirname "$0")/backend" || exit 1
export FRONTEND_ORIGIN="http://localhost:3000,http://18.207.175.239:3000"
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
