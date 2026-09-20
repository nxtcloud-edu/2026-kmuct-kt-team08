#!/usr/bin/env bash
# HTTPS dev 서버 백그라운드 실행 스크립트.
# 사용: ./start-dev.sh  (로그: /tmp/vite-dev.log)
set -e
cd "$(dirname "$0")"
export DISABLE_HMR=true
exec npm run dev
