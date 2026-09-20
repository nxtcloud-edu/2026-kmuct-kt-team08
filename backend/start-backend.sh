#!/usr/bin/env bash
# 백엔드(FastAPI) 실행 스크립트. 로그: /tmp/backend.log
cd "$(dirname "$0")"
PY="$(command -v python3 || echo /home/ec2-user/.pyenv/versions/3.12.12/bin/python3)"
exec "$PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
