"""역할 4 — FastAPI 애플리케이션 진입점.

CORS는 FRONTEND_ORIGIN 환경변수를 사용한다.
실행 (backend 디렉터리에서): uvicorn app.main:app --reload
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .routers.routes import router as api_router
from .schemas import ErrorResponse

load_dotenv()  # backend/.env 또는 저장소 루트 .env (있을 때만)

app = FastAPI(title="AI 개인화 보행 경로 에이전트 — Backend", version="1.1.0")

_frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173,http://localhost:3000")
_allow_origins = [o.strip() for o in _frontend_origin.split(",") if o.strip()]

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


# 오류 본문을 api-spec.md 의 {code, message, detail} 로 통일한다.


@app.exception_handler(HTTPException)
async def _http_error(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        body = detail
    else:
        body = ErrorResponse(code="INTERNAL_ERROR", message="요청을 처리하지 못했습니다.", detail=str(detail)).model_dump()
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
    body = ErrorResponse(
        code="SCHEMA_VALIDATION_ERROR",
        message="요청 본문이 스키마와 맞지 않습니다.",
        detail=f"{loc}: {first.get('msg', '')}".strip(": "),
    ).model_dump()
    return JSONResponse(status_code=422, content=body)


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
    body = ErrorResponse(code="INTERNAL_ERROR", message="예상하지 못한 서버 오류입니다.", detail=str(exc)).model_dump()
    return JSONResponse(status_code=500, content=body)


@app.get("/")
def root():
    return {"service": "walking-route-agent-backend", "docs": "/docs"}
