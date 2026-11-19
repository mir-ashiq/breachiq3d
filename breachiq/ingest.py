"""Zero-disk streaming ingest for the GRID corpus.

Design rules (see docs/DATA_QUALITY.md):
  - NEVER materialize a series: everything is a generator. The corpus is
    ~160 GB uncompressed for VALORANT alone; any list-building ingest dies.
  - NEVER decompress to disk: zstandard streams are read in memory.
  - Defensive parsing: a malformed envelope is skipped and counted, never
    allowed to crash a 45-minute ingest run.
  - Rollback invariants: restarted maps void earlier rounds; rolled-back
    game ids are discarded.
  - Exclusion manifest: series/maps the supplements officially do not cover
    are known up front, so views can show honest coverage.
  - Timestamps are normalized to UTC the moment they are read.
"""
from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

# ---------------------------------------------------------------- reader
def iter_jsonl(path: str | Path) -> Iterator[dict]:
    """Stream a .jsonl / .jsonl.zst / .jsonl.gz file, one record at a time.

    Zero-disk: zstd and gzip streams are decompressed in memory only.
    Malformed lines are skipped and counted in iter_stats['malformed'].
    """
    path = Path(path)
    if path.suffix == ".zst":
        import zstandard  # lazy: tests and fixtures run without it
        reader = zstandard.open(path, "rt", encoding="utf-8", errors="replace")
    elif path.suffix == ".gz":
        reader = gzip.open(path, "rt", encoding="utf-8", errors="replace")
    else:
        reader = open(path, "rt", encoding="utf-8", errors="replace")
    with reader:
        for line in reader:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                _STATS["malformed"] = _STATS.get("malformed", 0) + 1
                continue
            if isinstance(rec, dict):
                yield rec


_STATS = {"malformed": 0, "skipped_null": 0}


def iter_stats() -> dict:
    """Counters for defensive parsing (malformed / null-field skips)."""
    return _STATS


def reset_stats() -> None:
    _STATS["malformed"] = 0
    _STATS["skipped_null"] = 0


# ---------------------------------------------------------------- time
def to_utc(ts: str | int | float | None) -> str | None:
    """Normalize timestamps to ISO-8601 UTC strings (no local time, ever)."""
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc).isoformat()
    text = str(ts).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------- rollbacks
class RollbackTracker:
    """Discard rounds from restarted maps.

    A restart is announced by a 'series-!started-game' style envelope: the
    game restarts, earlier rounds of that game id are void. The tracker
    marks the game id as rolled back so downstream aggregation can drop
    everything scored against it.
    """

    def __init__(self, restart_event_types: tuple[str, ...] = ("series-!started-game",)):
        self.restart_event_types = restart_event_types
        self.rolled_back_games: set[str] = set()

    def feed(self, event: dict) -> None:
        etype = str(event.get("type") or event.get("eventType") or "")
        if etype in self.restart_event_types:
            game_id = (event.get("gameId") or event.get("game_id")
                       or self._nested_game_id(event))
            if game_id:
                self.rolled_back_games.add(str(game_id))

    @staticmethod
    def _nested_game_id(event: dict) -> str | None:
        """GRID feeds carry the game id on the actor/target of the event."""
        for side in ("actor", "target"):
            node = event.get(side) or {}
            if node.get("type") == "game" and node.get("id"):
                return str(node["id"])
        # some restart events put the game in the seriesStateDelta
        for g in (event.get("seriesStateDelta") or {}).get("games", []):
            if g.get("id"):
                return str(g["id"])
        return None

    def is_valid(self, game_id: str | None) -> bool:
        return game_id is not None and str(game_id) not in self.rolled_back_games

    @property
    def stats(self) -> dict:
        return {"rolled_back_games": sorted(self.rolled_back_games)}


# ---------------------------------------------------------------- exclusions
# Verified against the val-ability-supplements README (2026-11-18).
EXCLUSION_MANIFEST: dict[str, dict] = {
    "2855902": {"reason": "no supplement: none of its maps matched a GRID game"},
    "2855906": {"excluded_maps": ["bind"], "reason": "map GRID lacks"},
    "2877148": {"excluded_maps": ["split"], "reason": "map GRID lacks"},
    "2890334": {"excluded_maps": ["abyss"], "reason": "map merged into a prior game by GRID"},
    "2890361": {"excluded_maps": ["split"], "reason": "map merged into a prior game by GRID"},
}


def series_excluded(series_id: str) -> bool:
    return series_id in EXCLUSION_MANIFEST


def map_excluded(series_id: str, map_name: str) -> bool:
    entry = EXCLUSION_MANIFEST.get(str(series_id), {})
    return map_name.lower() in [m.lower() for m in entry.get("excluded_maps", [])]


# ---------------------------------------------------------------- joins
def join_key(supplement_event: dict) -> str | None:
    """grid_event_id equals events[].id of the matching GRID player-used-ability."""
    return supplement_event.get("grid_event_id")


def iter_supplement_casts(events: Iterator[dict], *, in_grid_only: bool = True,
                          ) -> Iterator[dict]:
    """Stream supplement casts with join/dedup/in-grid hygiene.

    - in_grid=False casts (mostly signature abilities between rounds or in
      the buy phase) are excluded from round analytics by default and can be
      counted separately.
    - Duplicate grid_event_ids are dropped (dedup invariant): a cast joined
      twice would double-count utility usage.
    """
    seen: set[str] = set()
    for ev in events:
        if in_grid_only and not ev.get("in_grid", False):
            continue
        key = join_key(ev)
        if key is not None:
            if key in seen:
                continue
            seen.add(key)
        if ev.get("interpolated") is None and ev.get("frame_before") is None \
                and ev.get("frame_after") is None:
            _STATS["skipped_null"] += 1
            continue
        yield ev
