"""Real-data pipeline over the official GRID starter corpus.

Points at a sibling clone of cloud9esports/stl-hackathon-2026-grid-starter
(never committed; see docs/COMPLIANCE.md). Locates it via $STL_DATA_DIR or
the conventional sibling directories.

Design (see docs/DATA_QUALITY.md):
  - Two streaming passes per series: feed first (round timeline, player
    snapshots, kills, wins), then the small supplement (casts + join).
  - Nothing raw is materialized: per-series output is aggregate-sized.
  - Rollback rule: events of games rolled back by `series-!started-game`
    are dropped (ingest.RollbackTracker).
  - Round attribution by timestamp: a cast belongs to the last round of
    its game that started at or before the cast time.
  - Economy classes from team loadout snapshots are ESTIMATES with
    documented thresholds (pistol = rounds 1/13 by rule).
"""
from __future__ import annotations

import csv
import os
from dataclasses import dataclass, field
from pathlib import Path

from . import ingest, spatial

# ---------------------------------------------------------------- locate
DEFAULT_CANDIDATES = ("../stl-hackathon-2026-grid-starter", "../grid-data")


def find_data_dir(explicit: str | os.PathLike | None = None) -> Path | None:
    """Locate the starter-data clone: $STL_DATA_DIR, explicit, or siblings."""
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    env = os.environ.get("STL_DATA_DIR")
    if env:
        candidates.append(Path(env))
    for rel in DEFAULT_CANDIDATES:
        candidates.append((Path(__file__).resolve().parent.parent / rel))
    for c in candidates:
        if (c / "val" / "series.csv").is_file():
            return c.resolve()
    return None


# ------------------------------------------------------- ability taxonomy
# Curated mapping: REAL GRID ability ids -> the brief's Category-1 classes,
# in the brief's order (placeable -> recon -> smoke -> stall -> flash).
# Abilities not listed (movement, damage, stim, ultimates we cannot place
# confidently) fall back to "other" and are still counted.
REAL_ABILITY_CLASS: dict[str, str] = {
    # placeable: trapwires, alarm bots, walls, trips, cameras, sensors
    "trapwire": "placeable", "alarmbot": "placeable", "turret": "placeable",
    "spycam": "placeable", "sonic-sensor": "placeable", "shear": "placeable",
    "trademark": "placeable", "cyber-cage": "placeable",
    "barrier-mesh": "placeable", "barrier-orb": "placeable", "stars": "placeable",
    # recon
    "recon-bolt": "recon", "owl-drone": "recon", "haunt": "recon",
    "prowler": "recon", "stealth-drone": "recon", "zero-point": "recon",
    # smoke
    "dark-cover": "smoke", "sky-smoke": "smoke", "poison-cloud": "smoke",
    "toxic-screen": "smoke", "cloudburst": "smoke", "nebula": "smoke",
    "cove": "smoke", "cascade": "smoke", "high-tide": "smoke",
    "ruse": "smoke", "fast-lane": "smoke", "nebula-dissipate": "smoke",
    # stall
    "fault-line": "stall", "aftershock": "stall", "gravnet": "stall",
    "seize": "stall", "razorvine": "stall", "nanoswarm": "stall",
    "snake-bite": "stall", "slow-orb": "stall", "mosh": "stall",
    "hot-hands": "stall", "incendiary": "stall",
    # flash
    "flashpoint": "flash", "guiding-light": "flash", "blindside": "flash",
    "fakeout": "flash", "curveball": "flash", "dizzy": "flash",
    "arc-rose": "flash", "paranoia": "flash", "leer": "flash",
    "flash-drive": "flash",
}

# Economy thresholds on TEAM loadout value (sum of 5 players' loadoutValue
# at round start). ESTIMATES, documented in docs/DATA_QUALITY.md.
ECO_THRESHOLD = 13000
FORCE_THRESHOLD = 23000
PISTOL_ROUNDS = (1, 13)


def ability_class(name: str | None) -> str:
    if not name:
        return "other"
    return REAL_ABILITY_CLASS.get(name, "other")


def economy_class(round_no: int, team_loadout: float | None) -> str:
    if round_no in PISTOL_ROUNDS:
        return "pistol"
    if team_loadout is None:
        return "unknown"
    if team_loadout < ECO_THRESHOLD:
        return "eco"
    if team_loadout < FORCE_THRESHOLD:
        return "force"
    return "full"


# ---------------------------------------------------------------- corpus
class Corpus:
    """Indexed access to the starter corpus (CSV first, .zst only on demand)."""

    def __init__(self, data_dir: str | os.PathLike | None = None):
        found = find_data_dir(data_dir)
        if found is None:
            raise FileNotFoundError(
                "GRID starter data not found; set STL_DATA_DIR or clone "
                "cloud9esports/stl-hackathon-2026-grid-starter next to this repo")
        self.dir = found
        self._series: list[dict] | None = None
        self._games: list[dict] | None = None

    # ---- indexes
    def val_series(self) -> list[dict]:
        if self._series is None:
            with open(self.dir / "val" / "series.csv", encoding="utf-8", newline="") as f:
                self._series = list(csv.DictReader(f))
        return self._series

    def games(self) -> list[dict]:
        if self._games is None:
            with open(self.dir / "meta" / "games.csv", encoding="utf-8", newline="") as f:
                self._games = [g for g in csv.DictReader(f) if g.get("title") == "val"]
        return self._games

    def team_series(self, team_substr: str) -> list[dict]:
        """Series where either team name contains the substring."""
        s = team_substr.lower()
        return [r for r in self.val_series() if s in r["teams"].lower()]

    def feed_path(self, series_id: str) -> Path:
        return self.dir / "val" / f"events_{series_id}_grid.jsonl.zst"

    def supplement_path(self, series_id: str) -> Path | None:
        p = self.dir / "val-ability-supplements" / f"{series_id}.jsonl.zst"
        return p if p.is_file() else None


# ---------------------------------------------------------------- scan
@dataclass
class RoundRecord:
    game_id: str
    map: str
    round_no: int
    start_iso: str
    winner_team: str | None = None
    winner_team_id: str | None = None
    win_type: str | None = None
    # per-side economy at round start: side -> team loadout value
    loadouts: dict = field(default_factory=dict)
    first_kill: dict | None = None          # {killer, victim, killer_team, ...}
    plant_iso: str | None = None
    first_utility_iso: str | None = None
    operator_holders: list = field(default_factory=list)  # player names
    # round-start positions of Operator holders: {player: {x, y}}
    operator_positions: dict = field(default_factory=dict)
    # team name -> attacker/defender for this round
    sides_by_team: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "game_id": self.game_id, "map": self.map, "round_no": self.round_no,
            "start_iso": self.start_iso, "winner_team": self.winner_team,
            "win_type": self.win_type, "loadouts": self.loadouts,
            "first_kill": self.first_kill, "plant_iso": self.plant_iso,
            "first_utility_iso": self.first_utility_iso,
            "operator_holders": self.operator_holders,
            "operator_positions": self.operator_positions,
            "sides_by_team": self.sides_by_team,
        }


@dataclass
class CastRecord:
    grid_event_id: str | None
    game_id: str
    map: str
    round_no: int | None
    player_id: str
    ability: str | None
    ability_class: str
    side: str | None
    in_grid: bool
    quality: str
    low_rate: bool
    position: dict | None   # interpolated 3D position (cm)
    view: dict | None       # unit aim vector
    velocity: dict | None
    occurred_at: str | None = None

    def as_dict(self) -> dict:
        return {
            "grid_event_id": self.grid_event_id, "game_id": self.game_id,
            "map": self.map, "round_no": self.round_no,
            "player_id": self.player_id, "ability": self.ability,
            "ability_class": self.ability_class, "side": self.side,
            "in_grid": self.in_grid, "quality": self.quality,
            "low_rate": self.low_rate, "position": self.position,
            "view": self.view, "velocity": self.velocity,
            "occurred_at": self.occurred_at,
        }


def _iso(ts: str) -> str:
    return ingest.to_utc(ts) or ""


def _parse_time(iso: str) -> float:
    from datetime import datetime
    try:
        return datetime.fromisoformat(_iso(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return float("nan")


class SeriesScanner:
    """Two-pass streaming scan of one series -> aggregates only."""

    def __init__(self, corpus: Corpus):
        self.corpus = corpus

    def scan(self, series_id: str) -> dict:
        sid = str(series_id)
        feed = self.corpus.feed_path(sid)
        supp = self.corpus.supplement_path(sid)
        rollback = ingest.RollbackTracker()
        games: dict[str, dict] = {}          # game_id -> {map, bounds, rounds}
        rounds: list[RoundRecord] = []
        ability_events: dict[str, dict] = {}  # event id -> {t, iso, player, side, game}
        players_seen: dict[str, dict] = {}    # player_id -> {name, agent, team}
        quality_mismatch = 0

        for env in ingest.iter_jsonl(feed):
            for e in env.get("events", []):
                rollback.feed(e)
                t = e.get("type", "")
                at = env.get("occurredAt", "")
                if t == "series-started-game":
                    g = e.get("target", {})
                    gid = str(g.get("id"))
                    mp = (g.get("state", {}).get("map") or {})
                    b = mp.get("bounds") or {}
                    games[gid] = {
                        "map": mp.get("name", "?"),
                        "bounds": b, "rounds": [], "rolled_back": False,
                    }
                elif t == "team-won-round":
                    gid = _current_game(e)
                    if gid is None or not rollback.is_valid(gid):
                        continue
                    tgt_state = e.get("target", {}).get("state", {}) or {}
                    rno = tgt_state.get("sequenceNumber")
                    if rno is None:  # fallback: parse "round-7" -> 7
                        rid = str(e.get("target", {}).get("id") or "")
                        rno = int(rid.rsplit("-", 1)[-1]) if rid.rsplit("-", 1)[-1].isdigit() else None
                    rec = _round_by_no(rounds, gid, rno)
                    if rec is not None:
                        actor = e.get("actor", {})
                        rec.winner_team = (actor.get("state", {}) or {}).get("name")
                        rec.winner_team_id = actor.get("id")
                        rec.win_type = ((actor.get("stateDelta", {}) or {})
                                        .get("round", {}) or {}).get("winType") \
                            or (tgt_state.get("teams") or [{}])[0].get("winType")
                elif t == "game-started-round":
                    gid = _current_game(e)
                    if gid is None or not rollback.is_valid(gid):
                        continue
                    g = games.setdefault(gid, {"map": "?", "bounds": {},
                                               "rounds": [], "rolled_back": False})
                    seq = (e.get("target", {}).get("state", {})
                           .get("sequenceNumber"))
                    rec = RoundRecord(game_id=gid, map=g["map"], round_no=seq,
                                      start_iso=_iso(at))
                    rounds.append(rec)
                    g["rounds"].append(rec)
                    # full-state snapshot: agents, loadouts, inventory
                    snap = _player_snapshot(e.get("seriesState"), gid)
                    for pid, p in snap.items():
                        players_seen.setdefault(pid, {
                            "name": p["name"], "agent": p["agent"],
                            "team": p["team"]})
                        rec.loadouts[p["side"]] = round(
                            rec.loadouts.get(p["side"], 0.0) + p["loadout"], 1)
                        if p["team"]:
                            rec.sides_by_team[p["team"]] = p["side"]
                        if p["has_operator"]:
                            rec.operator_holders.append(p["name"])
                            if p.get("position"):
                                rec.operator_positions[p["name"]] = p["position"]
                elif t == "player-used-ability":
                    pid = e.get("actor", {}).get("id")
                    if pid is None:
                        continue
                    ability_events[e.get("id")] = {
                        "t": _parse_time(at), "iso": _iso(at),
                        "player_id": str(pid),
                        "side": e.get("actor", {}).get("state", {}).get("side"),
                        "game_id": _current_game(e),
                    }
                elif t == "player-killed-player":
                    gid = _current_game(e)
                    rec = _round_at(rounds, gid, _parse_time(at))
                    if rec is not None and rec.first_kill is None:
                        rec.first_kill = {
                            "killer": e.get("actor", {}).get("state", {}).get("name"),
                            "victim": e.get("target", {}).get("state", {}).get("name"),
                            "killer_side": (e.get("actor", {}).get("state", {})
                                            or {}).get("side"),
                            "at": _iso(at),
                        }
                elif t == "player-completed-plantBomb":
                    gid = _current_game(e)
                    rec = _round_at(rounds, gid, _parse_time(at))
                    if rec is not None and rec.plant_iso is None:
                        rec.plant_iso = _iso(at)

        # mark rolled-back games and drop their rounds
        for gid in rollback.rolled_back_games:
            if gid in games:
                games[gid]["rolled_back"] = True
        rounds = [r for r in rounds
                  if str(r.game_id) not in rollback.rolled_back_games]

        # pass 2: supplement casts
        casts: list[CastRecord] = []
        if supp is not None:
            for cast in ingest.iter_supplement_casts(
                    ingest.iter_jsonl(supp), in_grid_only=True):
                gid = str(cast.get("game_id"))
                if gid in rollback.rolled_back_games:
                    continue
                g = games.get(gid, {})
                state = spatial.cast_state(cast)
                provided_q = cast.get("quality")
                q = state["quality"] if state else "missing_both"
                if provided_q is not None and provided_q != q:
                    quality_mismatch += 1
                # round attribution by time
                rno, rec = None, None
                geid = cast.get("grid_event_id")
                info = ability_events.get(geid) if geid else None
                if info is not None:
                    rec = _round_at(rounds, gid, info["t"])
                    rno = rec.round_no if rec else None
                interp = cast.get("interpolated") or {}
                casts.append(CastRecord(
                    grid_event_id=geid, game_id=gid, map=g.get("map", "?"),
                    round_no=rno, player_id=str(cast.get("player_id")),
                    ability=cast.get("ability"),
                    ability_class=ability_class(cast.get("ability")),
                    side=(info or {}).get("side"),
                    in_grid=bool(cast.get("in_grid")),
                    quality=provided_q or q,
                    low_rate=bool(state and state.get("low_rate")),
                    position=interp.get("position"),
                    view=interp.get("view"),
                    velocity=interp.get("velocity"),
                    occurred_at=cast.get("occurred_at"),
                ))

        return {
            "series_id": sid,
            "rounds": [r.as_dict() for r in rounds],
            "casts": [c.as_dict() for c in casts],
            "games": {gid: {"map": g["map"], "bounds": g["bounds"],
                            "rolled_back": g["rolled_back"]}
                      for gid, g in games.items()},
            "players": players_seen,
            "quality_mismatch": quality_mismatch,
            "rolled_back_games": sorted(rollback.rolled_back_games),
        }


# ---------------------------------------------------------------- helpers
def _current_game(event: dict) -> str | None:
    """Game id for an event.

    `seriesStateDelta.games[0].id` is present on player/team/round events
    and is the real game UUID (actor.state.game is actor-scoped and its id
    is the ACTOR's id, not the game's). Lifecycle events carry the game on
    their actor/target of type "game".
    """
    delta_games = (event.get("seriesStateDelta") or {}).get("games") or []
    if delta_games and delta_games[0].get("id"):
        return str(delta_games[0]["id"])
    for side in ("target", "actor"):
        node = event.get(side) or {}
        if node.get("type") == "game" and node.get("id"):
            return str(node["id"])
    return None


def _round_by_no(rounds: list[RoundRecord], game_id: str | None,
                 round_no: int | None) -> RoundRecord | None:
    if game_id is None or round_no is None:
        return None
    for r in rounds:
        if r.game_id == game_id and r.round_no == round_no:
            return r
    return None


def _round_at(rounds: list[RoundRecord], game_id: str | None,
              t: float) -> RoundRecord | None:
    """Round of `game_id` active at time t (last round started <= t)."""
    if game_id is None or t != t:  # NaN guard
        return None
    best: RoundRecord | None = None
    best_t = float("-inf")
    for r in rounds:
        if r.game_id != game_id:
            continue
        rt = _parse_time(r.start_iso)
        if rt <= t and rt >= best_t:
            best, best_t = r, rt
    return best


def _player_snapshot(series_state: dict | None, game_id: str) -> dict:
    """Flatten a full-state snapshot to {player_id: {name, agent, side,
    loadout, money, has_operator, position}} for the given game."""
    out: dict = {}
    if not series_state:
        return out
    for g in series_state.get("games", []):
        if str(g.get("id")) != str(game_id):
            continue
        for team in g.get("teams", []) or []:
            side = team.get("side") or None
            for p in (team.get("players") or []):
                items = ((p.get("inventory") or {}).get("items") or [])
                out[str(p.get("id"))] = {
                    "name": p.get("name"),
                    "agent": (p.get("character") or {}).get("name"),
                    "side": side,
                    "team": team.get("name"),
                    "team_id": str(team.get("id")),
                    "loadout": p.get("loadoutValue") or 0,
                    "money": p.get("money") or 0,
                    "has_operator": any(
                        str(it.get("id", "")).lower() in ("operator", "odin")
                        for it in items),
                    "position": p.get("position"),
                }
        break
    return out
