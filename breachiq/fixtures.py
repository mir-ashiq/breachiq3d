"""SYNTHETIC fixtures - no GRID, Riot, or Cloud9 data anywhere in this repo.

The official corpus (~160 GB VALORANT + supplements) is licensed for
competition use only and may never be committed (see docs/COMPLIANCE.md).
To develop, test, and demo before touching the real data, this module
generates a small deterministic SYNTHETIC corpus that obeys the verified
supplement schema (position x/y/z, 3D view, 3D velocity, frames, quality
flags). Everything it writes is labeled SYNTHETIC.
"""
from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

import numpy as np

SYNTHETIC = True  # label carried into every artifact this module writes

AGENTS = ["cypher", "sova", "killjoy", "brimstone", "sage", "omen", "chamber"]
PLAYERS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]
MAPS = ["split", "ascent", "bind", "haven"]


def _frame(rng, offset_ms, pos, view, vel):
    return {"offset_ms": offset_ms, "position": pos, "view": view, "velocity": vel}


def _unit(theta, pitch):
    x, y = math.cos(theta), math.sin(theta)
    z = math.sin(pitch)
    n = math.sqrt(x * x + y * y + z * z)
    return {"x": x / n, "y": y / n, "z": z / n}


def generate_series(seed: int = 7, n_rounds: int = 40) -> dict:
    """One synthetic series in the verified schema shape."""
    rng = np.random.default_rng(seed)
    rounds, casts = [], []
    op_bias = {p: float(rng.uniform(0.05, 0.6)) for p in PLAYERS}
    for r in range(n_rounds):
        site = str(rng.choice(["a", "b", "mid"]))
        economy = str(rng.choice(["full", "full", "eco", "eco", "force"]))
        quality = "ok"
        # deterministic Operator purchases: seeded per-player bias, so the
        # API's operator view is stable across calls (no live randomness)
        operator_buyers = [p for p in PLAYERS if rng.random() < op_bias[p]]
        operator_holds = {p: round(float(rng.uniform(4, 40)), 1)
                          for p in operator_buyers}
        for i in range(int(rng.integers(1, 5))):
            pos = {"x": float(rng.uniform(-3800, 3800)),
                   "y": float(rng.uniform(-3800, 3800)),
                   "z": float(rng.uniform(0, 400))}
            view = _unit(float(rng.uniform(0, 2 * math.pi)), float(rng.uniform(-0.2, 0.5)))
            vel = {"x": 0.0, "y": 0.0, "z": 0.0}
            # ~1 in 6 casts gets a degraded-quality frame pattern (synthetic mix)
            roll = rng.random()
            if roll < 0.06:
                fb, fa, quality = None, None, "missing_both"
            elif roll < 0.14:
                fb = _frame(rng, -int(rng.integers(900, 1600)), pos, view, vel)
                fa = None
                quality = "missing_after"
            elif roll < 0.22:
                fb = _frame(rng, -int(rng.integers(200, 480)), pos, view, vel)
                fa = _frame(rng, int(rng.integers(200, 480)), pos, view, vel)
                quality = "ok"
            elif roll < 0.28:  # low-rate series: ~1 Hz gap
                fb = _frame(rng, -1000, pos, view, vel)
                fa = _frame(rng, 1000, pos, view, vel)
                quality = "ok"
            else:
                fb = _frame(rng, -int(rng.integers(60, 450)), pos, view, vel)
                fa = _frame(rng, int(rng.integers(60, 450)), pos, view, vel)
                quality = "ok"
            casts.append({
                "grid_event_id": f"synthetic-evt-{r:03d}-{i:02d}",
                "in_grid": roll >= 0.10,
                "occurred_at": f"2026-11-{(r % 28) + 1:02d}T12:00:{i:02d}Z",
                "player_id": str(rng.choice(PLAYERS)), "ability": str(rng.choice(
                    ["cypher-trapwire", "killjoy-alarmbot", "sova-reconbolt",
                     "brimstone-smoke", "sage-wall", "chamber-trap", "omen-smoke"])),
                "map": MAPS[r % len(MAPS)], "site": site, "round": r,
                "frame_before": fb, "frame_after": fa, "quality": quality,
            })
        # deliberate set play: every 4th round Echo casts sage-wall from
        # the same spot with the same aim (a practiced lineup). Exercises
        # the LineupDetector on the demo corpus with honest, labeled data.
        # Position sits inside split's REAL calibrated bounds.
        if r % 4 == 0:
            pos = {"x": -1500.0, "y": -500.0, "z": 0.0}
            view = _unit(math.radians(35.0), 0.1)
            vel = {"x": 0.0, "y": 0.0, "z": 0.0}
            casts.append({
                "grid_event_id": f"synthetic-evt-{r:03d}-setplay",
                "in_grid": True,
                "occurred_at": f"2026-11-{(r % 28) + 1:02d}T12:05:00Z",
                "player_id": "Echo", "ability": "sage-wall",
                "map": "split", "site": site, "round": r,
                "frame_before": _frame(rng, -180, pos, view, vel),
                "frame_after": _frame(rng, 180, pos, view, vel),
                "quality": "ok",
            })
        rounds.append({
            "round": r, "site": site, "economy": economy,
            "first_utility_s": round(float(rng.uniform(3, 15)), 1),
            "plant_s": round(float(rng.uniform(20, 45)), 1),
            "first_death_zone": str(rng.choice(["b-heaven", "a-main", "mid-vents", ""])),
            "attacker": str(rng.choice(["TSM", "SEN"])), "patch": "11.08",
            "operator_buyers": operator_buyers,
            "operator_holds": operator_holds,
        })
    return {"rounds": rounds, "casts": casts}


def write_fixtures(out_dir: str | Path, seed: int = 7) -> dict:
    """Write the SYNTHETIC fixture files used by tests, the API, and the demo."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    data = generate_series(seed)
    meta = {"SYNTHETIC": True, "generator": "breachiq.fixtures",
            "note": "synthetic data only - no GRID/Riot/Cloud9 data in this repo",
            "seed": seed, "patch": "11.08",
            "maps": MAPS, "generated": "2026-11-18"}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    with gzip.open(out / "rounds.json.gz", "wt") as f:
        f.write("\n".join(json.dumps(r) for r in data["rounds"]))
    with gzip.open(out / "casts.json.gz", "wt") as f:
        f.write("\n".join(json.dumps(c) for c in data["casts"]))
    return meta


def load_fixtures(fixtures_dir: str | Path) -> dict:
    """Load SYNTHETIC fixtures (gzip JSONL), streaming line by line."""
    d = Path(fixtures_dir)
    meta = json.loads((d / "meta.json").read_text())
    if not meta.get("SYNTHETIC"):
        raise ValueError("fixtures must be SYNTHETIC; refusing to load anything else")
    rounds = [json.loads(l) for l in gzip.open(d / "rounds.json.gz", "rt")]
    casts = [json.loads(l) for l in gzip.open(d / "casts.json.gz", "rt")]
    return {"meta": meta, "rounds": rounds, "casts": casts}


if __name__ == "__main__":
    print(json.dumps(write_fixtures(Path(__file__).resolve().parent.parent / "fixtures"), indent=2))
