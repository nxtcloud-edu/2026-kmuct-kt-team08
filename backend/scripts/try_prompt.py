"""임의 자연어 문장으로 전체 파이프라인을 돌려 본다 (서버 없이).

사용법 (backend 디렉터리에서):
    python scripts/try_prompt.py "밤이라 밝은 길로 가고 싶어. 5분 이상 돌아가긴 싫어"
    python scripts/try_prompt.py "행사 하는 데는 피해줘" --at 2026-09-19T19:00:00+09:00
    python scripts/try_prompt.py "조용한 길" --from 잠실역 --to 롯데월드타워 --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from fastapi import HTTPException  # noqa: E402

from app.routers.routes import run_recommendation  # noqa: E402
from app.schemas import RouteRequest  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("text", help="preferenceText")
    ap.add_argument("--from", dest="start", default="잠실역")
    ap.add_argument("--to", dest="end", default="석촌역")
    ap.add_argument("--at", dest="departure", default="2026-09-19T23:00:00+09:00")
    ap.add_argument("--json", action="store_true", help="응답 JSON 전체 출력")
    args = ap.parse_args()

    req = RouteRequest(start=args.start, end=args.end, departureTime=args.departure, preferenceText=args.text)
    import asyncio
    try:
        resp = asyncio.run(run_recommendation(req))
    except HTTPException as exc:
        print(f"오류 {exc.status_code}: {json.dumps(exc.detail, ensure_ascii=False)}")
        sys.exit(1)

    if args.json:
        print(resp.model_dump_json(indent=2))
        return

    p = resp.interpretedPreference
    print(f"\n[해석] {p.caseType}  mock={resp.isMockData}")
    print(f"  Hard : {p.hardConstraints.model_dump()}")
    print(f"  Pref : {p.preferences.model_dump()}")
    for line in p.explanation:
        print(f"  - {line}")
    if p.ambiguityWarning:
        print(f"  ! {p.ambiguityWarning}")

    print(f"\n[경로] {args.start} → {args.end}  {args.departure}")
    print(f"  {'#':<2} {'이름':<10} {'분':>3} {'m':>5} {'+분':>3} {'점수':>6}  혼잡 조도 조용 그늘  가로등 행사 상가  상태")
    for r in resp.routes:
        m = r.metrics
        state = "제외: " + " ".join(r.rejectionReasons) if r.rejected else ""
        print(
            f"  {r.rank:<2} {r.name:<10} {r.durationMin:>3} {r.distanceM:>5} {r.extraMinutes:>3} {r.matchScore:>6.2f}  "
            f"{m.crowdScore:>4.0f} {m.lightingScore:>4.0f} {m.quietScore:>4.0f} {m.shadeScore:>4.0f}  "
            f"{m.streetlightCount:>5} {m.activeEventCount:>4} {m.storeCount:>4}  {state}"
        )
    print(f"\n[요약] {resp.recommendationSummary}")
    print(f"[출처] {resp.metricSources}\n")


if __name__ == "__main__":
    main()
