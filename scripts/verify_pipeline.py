#!/usr/bin/env python3
"""Pipeline verification: benchmark, coverage, and a render smoke check.

Run this whenever ingest or spatial code changes. It regenerates the
SYNTHETIC fixtures, streams them through the full pipeline, times the
ingest (benchmark), and renders a projection smoke check to catch
miscalibrated bounds before they reach the map canvas.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from breachiq import features, fixtures, spatial  # noqa: E402

REPO = Path(__file__).resolve().parent.parent


def benchmark_ingest(fixtures_dir: Path) -> dict:
    """Time the streaming ingest; numbers we publish must come from runs."""
    t0 = time.perf_counter()
    data = fixtures.load_fixtures(fixtures_dir)
    rounds, casts = data["rounds"], data["casts"]
    elapsed = time.perf_counter() - t0
    return {"seconds": round(elapsed, 3), "rounds": len(rounds),
            "casts": len(casts),
            "casts_per_second": round(len(casts) / max(elapsed, 1e-6), 0)}


def coverage_report(data: dict) -> dict:
    """Honest coverage: how many casts yield usable estimates, and why not."""
    ok = missing = 0
    for cast in data["casts"]:
        if spatial.cast_state(cast) is None:
            missing += 1
        else:
            ok += 1
    return {"usable": ok, "unusable_quality": missing,
            "coverage_pct": round(100 * ok / max(1, ok + missing), 1)}


def render_smoke_check(data: dict, map_name: str) -> dict:
    """Every landing estimate must land INSIDE the minimap unit square."""
    inside = outside = 0
    bounds = spatial.BOUNDS[map_name]
    for cast in data["casts"]:
        est = spatial.estimate_landing(
            cast, features.ABILITY_CLASS.get(cast.get("ability"), "recon"), bounds)
        if est is None:
            continue
        if 0.0 <= est.u <= 1.0 and 0.0 <= est.v <= 1.0:
            inside += 1
        else:
            outside += 1  # should be impossible since estimate_landing clamps
    return {"inside": inside, "outside": outside}


def main() -> int:
    fixtures_dir = REPO / "fixtures"
    print("regenerating SYNTHETIC fixtures…")
    meta = fixtures.write_fixtures(fixtures_dir)
    assert meta["SYNTHETIC"] is True
    data = fixtures.load_fixtures(fixtures_dir)

    bench = benchmark_ingest(fixtures_dir)
    print(f"benchmark: {bench}")
    cov = coverage_report(data)
    print(f"coverage: {cov}")
    for m in ("split", "ascent", "bind", "haven"):
        smoke = render_smoke_check(data, m)
        status = "OK" if smoke["outside"] == 0 else "FAIL"
        print(f"render smoke check [{m}]: {smoke} -> {status}")
        if smoke["outside"]:
            return 1
    if cov["coverage_pct"] < 60:
        print("FAIL: usable coverage below 60% - quality handling regressed?")
        return 1
    print("PIPELINE VERIFICATION OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
