"""Feature layer: the things coaches actually score us on.

Every output carries an EvidenceBar: hard counts ("38/60 rounds"), sample
sizes, patch recency, coverage, and data-quality mix. A number without its
evidence is exactly the passive-aggregator pattern the brief warns about.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------- taxonomy
# Ordered EXACTLY as the official Category 1 brief: placeable utility first
# (trapwires, alarm bots, walls, trips), then recon, smokes, stalls, flashes.
UTILITY_TAXONOMY: list[tuple[str, tuple[str, ...]]] = [
    ("placeable", ("cypher-trapwire", "killjoy-alarmbot", "vyse-wall", "chamber-trap")),
    ("recon", ("sova-reconbolt", "fade-haunt", "gekko-wingman")),
    ("smoke", ("brimstone-smoke", "omen-smoke", "astra-nova", "clove-smoke", "viper-toxicscreen")),
    ("stall", ("sage-wall", "viper-pit", "harbor-cove", "deadlock-barrier")),
    ("flash", ("phoenix-flash", "breach-flash", "skye-flash", "gekko-flash", "yoru-flash")),
]

ABILITY_CLASS: dict[str, str] = {
    ability: cls for cls, abilities in UTILITY_TAXONOMY for ability in abilities
}

# The brief's full filter rail, verbatim.
FILTERS = ("team", "map", "player", "agent", "composition", "patch",
           "side", "weapon", "ability")

# Site zones per map (synthetic placeholders; calibrate with bounds).
ZONES = {"a": [0.05, 0.05, 0.45, 0.45], "b": [0.55, 0.05, 0.95, 0.45],
         "c": [0.3, 0.55, 0.7, 0.95], "mid": [0.45, 0.35, 0.6, 0.65]}


def zone_of(u: float, v: float) -> str | None:
    for name, (x0, y0, x1, y1) in ZONES.items():
        if x0 <= u <= x1 and y0 <= v <= y1:
            return name
    return None


# ---------------------------------------------------------------- evidence
@dataclass
class EvidenceBar:
    """Sample sizes and data quality surfaced with every insight."""
    rounds: int = 0
    matches: int = 0
    frequency: int = 0
    patch: str = ""
    patch_recency_days: int | None = None
    coverage: str = ""          # e.g. "excluded: series 2855902; Bind in 2855906"
    quality_mix: dict = field(default_factory=dict)  # quality flag -> count

    def as_dict(self) -> dict:
        return {"rounds": self.rounds, "matches": self.matches,
                "frequency": self.frequency, "patch": self.patch,
                "patch_recency_days": self.patch_recency_days,
                "coverage": self.coverage, "quality_mix": self.quality_mix}

    @property
    def hard_count(self) -> str:
        """The brief's demanded format: counts out of observable rounds."""
        return f"{self.frequency}/{self.rounds} rounds"


# ---------------------------------------------------------------- atlas
class UtilityAtlas:
    """Utility placement atlas with placeable-first taxonomy ordering."""

    def __init__(self, class_resolver=None):
        # resolver maps an ability id -> taxonomy class; defaults to the
        # synthetic-fixture names, real GRID ids use corpus.ability_class
        self._resolver = class_resolver or (
            lambda a: ABILITY_CLASS.get(a, "other"))
        self.zone_counts: dict[tuple[str, str], int] = {}  # (zone, ability) -> casts
        self.total_rounds = 0
        self.matches = 0
        self.patches: set[str] = set()
        self.quality: dict[str, int] = {}

    def add_round(self, casts: list[dict], patch: str = "") -> None:
        self.total_rounds += 1
        self.patches.add(patch)
        for cast in casts:
            zone = zone_of(cast["u"], cast["v"]) or "wide"
            ability = cast.get("ability", "unknown")
            self.zone_counts[(zone, ability)] = self.zone_counts.get((zone, ability), 0) + 1
            q = cast.get("quality", "ok")
            self.quality[q] = self.quality.get(q, 0) + 1

    def result(self, matches: int = 0, coverage: str = "") -> dict:
        # group real ability ids by class, then emit in the brief's order
        by_class: dict[str, dict[str, dict[str, int]]] = {}
        for (zone, ability), count in self.zone_counts.items():
            cls = self._resolver(ability)
            by_class.setdefault(cls, {}).setdefault(ability, {})[zone] = count
        order = [c for c, _ in UTILITY_TAXONOMY] + ["other"]
        ordered = []
        for cls in order:
            for ability in sorted(by_class.get(cls, {}),
                                  key=lambda a: -sum(by_class[cls][a].values())):
                per_zone = by_class[cls][ability]
                freq = sum(per_zone.values())
                ev = EvidenceBar(
                    rounds=self.total_rounds, matches=matches or self.matches,
                    frequency=freq, patch=','.join(sorted(p for p in self.patches if p)),
                    coverage=coverage, quality_mix=dict(self.quality))
                ordered.append({"ability": ability, "class": cls,
                                "zones": per_zone, "hard_count": ev.hard_count,
                                "evidence": ev.as_dict()})
        return {"taxonomy_order": order,
                "abilities": ordered, "rounds": self.total_rounds}


# ---------------------------------------------------------------- operator
class OperatorFingerprint:
    """The brief's second blueprint: Operator/Odin tendency profiling.

    Tracks purchase frequency by player and agent, defensive hold positions
    split into 0-20s vs 20-40s timing histograms, and rotation between
    players - the exact dimensions the brief lists.
    """

    def __init__(self):
        self.purchases: dict[tuple[str, str], int] = {}   # (player, agent) -> ops bought
        self.rounds_by_player: dict[str, int] = {}
        self.holds: dict[str, list[float]] = {}            # player -> hold start (s)
        self.hold_positions: dict[str, list] = {}          # player -> [(u, v)]
        self.rotation: dict[str, set[str]] = {}            # agent -> players seen

    def add_round(self, *, player: str, agent: str, bought_operator: bool,
                  hold_start_s: float | None = None,
                  hold_position: tuple[float, float] | None = None,
                  hold_map: str | None = None) -> None:
        self.rounds_by_player[player] = self.rounds_by_player.get(player, 0) + 1
        if bought_operator:
            self.purchases[(player, agent)] = self.purchases.get((player, agent), 0) + 1
        self.rotation.setdefault(agent, set()).add(player)
        if hold_start_s is not None:
            self.holds.setdefault(player, []).append(hold_start_s)
        if hold_position is not None:
            self.hold_positions.setdefault(player, []).append(
                (hold_position[0], hold_position[1], hold_map))

    @staticmethod
    def _timing_bucket(t: float) -> str:
        return "0-20s" if t <= 20.0 else "20-40s"

    def result(self) -> dict:
        players = []
        # Fingerprint EVERY player seen - who declines the Operator is as
        # telling as who buys it.
        for player in sorted(self.rounds_by_player):
            rounds = self.rounds_by_player[player]
            count = sum(c for (p, _a), c in self.purchases.items() if p == player)
            agent = next((a for a, ps in self.rotation.items() if player in ps),
                         "unknown")
            histogram = {"0-20s": 0, "20-40s": 0}
            for t in self.holds.get(player, []):
                histogram[self._timing_bucket(t)] += 1
            players.append({
                "player": player, "agent": agent,
                "operator_buys": count,
                "buy_rate": f"{count}/{rounds} rounds",
                "hold_timing": histogram,
                "hold_positions": [
                    {"u": round(u, 3), "v": round(v, 3), "map": m}
                    for u, v, m in self.hold_positions.get(player, [])],
            })
        players.sort(key=lambda p: -p["operator_buys"])
        return {"players": players,
                "rotation": {a: sorted(p) for a, p in self.rotation.items()}}


# ---------------------------------------------------------------- pacing
class ExecutePacing:
    """Site-execute timing: freezetime end -> first utility -> spike plant."""

    def __init__(self):
        self.deltas: list[dict] = []

    def add_round(self, *, site: str, first_utility_s: float | None,
                  plant_s: float | None, economy: str = "full",
                  first_death_zone: str | None = None) -> None:
        self.deltas.append({
            "site": site,
            "first_utility_s": first_utility_s,
            "plant_s": plant_s,
            "utility_to_plant_s": (plant_s - first_utility_s)
            if first_utility_s is not None and plant_s is not None else None,
            "economy": economy, "first_death_zone": first_death_zone,
        })

    def result(self) -> dict:
        out = {}
        for site in sorted({d["site"] for d in self.deltas}):
            rows = [d for d in self.deltas if d["site"] == site and d["utility_to_plant_s"] is not None]
            if not rows:
                continue
            vals = sorted(d["utility_to_plant_s"] for d in rows)
            med = vals[len(vals) // 2]
            eco_rows = [d for d in rows if d["economy"] == "eco"]
            collapse = {}
            for d in eco_rows:
                if d["first_death_zone"]:
                    collapse[d["first_death_zone"]] = collapse.get(d["first_death_zone"], 0) + 1
            out[site] = {
                "rounds": len(rows),
                "median_utility_to_plant_s": round(med, 2),
                "eco_first_death_zones": collapse,
            }
        return {"sites": out}


# ---------------------------------------------------------------- lineups
class LineupDetector:
    """Detect repeated utility lineups: same ability, cast from ~the same
    spot with ~the same aim, across different rounds/matches.

    A lineup is coaching gold ("they always flash over this box from
    lineup X"). Parameters are estimates: 200 cm positional tolerance and
    10 degrees aim tolerance, counted only when seen in >= min_repeats
    DISTINCT rounds.
    """

    POS_TOL_CM = 200.0
    AIM_TOL_DEG = 10.0
    MIN_REPEATS = 3

    def __init__(self, pos_tol_cm: float | None = None,
                 aim_tol_deg: float | None = None, min_repeats: int | None = None):
        self.pos_tol = pos_tol_cm or self.POS_TOL_CM
        self.aim_tol = aim_tol_deg or self.AIM_TOL_DEG
        self.min_repeats = min_repeats or self.MIN_REPEATS
        self._clusters: list[dict] = []

    def add(self, *, ability: str, map: str, position: dict, view: dict,
            round_key: str, confidence: float = 1.0) -> None:
        """Register one cast. round_key identifies the round (series+game+no)."""
        import math
        az = math.degrees(math.atan2(view["y"], view["x"]))
        for cl in self._clusters:
            if cl["ability"] != ability or cl["map"] != map:
                continue
            d = math.hypot(position["x"] - cl["x"], position["y"] - cl["y"])
            da = (az - cl["az"] + 180.0) % 360.0 - 180.0
            if d <= self.pos_tol and abs(da) <= self.aim_tol:
                cl["rounds"].add(round_key)
                cl["n"] += 1
                cl["conf_sum"] += confidence
                cl["z_sum"] += float(position.get("z", 0.0))
                cl["vx_sum"] += view["x"]
                cl["vy_sum"] += view["y"]
                cl["vz_sum"] += view.get("z", 0.0)
                return
        self._clusters.append({
            "ability": ability, "map": map,
            "x": position["x"], "y": position["y"], "az": az,
            "z_sum": float(position.get("z", 0.0)),
            "vx_sum": view["x"], "vy_sum": view["y"], "vz_sum": view.get("z", 0.0),
            "view": dict(view),
            "rounds": {round_key}, "n": 1, "conf_sum": confidence,
        })

    def result(self) -> list[dict]:
        import math
        out = []
        for cl in self._clusters:
            if len(cl["rounds"]) < self.min_repeats:
                continue
            n = cl["n"]
            # averaged cast altitude + aim pitch for the 3D trajectory view
            vlen = math.sqrt(cl["vx_sum"] ** 2 + cl["vy_sum"] ** 2
                             + cl["vz_sum"] ** 2)
            pitch = (math.degrees(math.asin(max(-1.0, min(1.0, cl["vz_sum"] / vlen))))
                     if vlen > 1e-6 else 0.0)
            out.append({
                "ability": cl["ability"], "map": cl["map"],
                "repeats": len(cl["rounds"]),
                "total_casts": cl["n"],
                "position": {"x": round(cl["x"], 1), "y": round(cl["y"], 1)},
                "position_z": round(cl["z_sum"] / n, 1),
                "aim_azimuth_deg": round(cl["az"], 1),
                "aim_pitch_deg": round(pitch, 1),
                "avg_confidence": round(cl["conf_sum"] / cl["n"], 3),
                "is_estimate": True,
                "note": "repeated cast cluster (position/aim tolerance)",
            })
        out.sort(key=lambda r: (-r["repeats"], r["ability"]))
        return out


# ---------------------------------------------------------------- outcomes
class RoundOutcomes:
    """How a team wins and loses rounds: sides, win types, pistol
    conversion, and attack rounds that never planted."""

    def __init__(self):
        self.rounds: list[dict] = []

    def add_round(self, *, round_no: int, side: str, won: bool,
                  win_type: str | None, planted: bool,
                  economy: str = "unknown") -> None:
        self.rounds.append({"round_no": round_no, "side": side, "won": won,
                            "win_type": win_type, "planted": planted,
                            "economy": economy})

    def result(self) -> dict:
        by_side = {}
        for side in sorted({r["side"] for r in self.rounds}):
            rows = [r for r in self.rounds if r["side"] == side]
            wins = [r for r in rows if r["won"]]
            win_types: dict[str, int] = {}
            for r in wins:
                win_types[r["win_type"] or "unknown"] = \
                    win_types.get(r["win_type"] or "unknown", 0) + 1
            atk = [r for r in rows if r["side"] == "attacker"]
            no_plant = [r for r in atk if not r["planted"]]
            by_side[side] = {
                "rounds": len(rows),
                "won": len(wins),
                "win_rate": f"{len(wins)}/{len(rows)}",
                "win_types": win_types,
                "attack_no_plant": f"{len(no_plant)}/{len(atk)}" if atk else None,
            }
        # pistol conversion: won the round right after a won pistol
        pistol_won_next = pistol_next = 0
        by_no = sorted(self.rounds, key=lambda r: r["round_no"])
        for prev, cur in zip(by_no, by_no[1:]):
            if prev["round_no"] in (1, 13) and prev["won"]:
                pistol_next += 1
                pistol_won_next += 1 if cur["won"] else 0
        return {
            "sides": by_side,
            "pistol_conversion": (f"{pistol_won_next}/{pistol_next}"
                                  if pistol_next else None),
            "rounds": len(self.rounds),
        }


# ---------------------------------------------------------------- briefs
def counter_brief(atlas: dict, operator: dict) -> list[str]:
    """Prescriptive coaching cues - the anti-strat output, not a stat dump."""
    cues: list[str] = []
    top = atlas["abilities"][0] if atlas.get("abilities") else None
    if top:
        zone = max(top["zones"], key=top["zones"].get)
        cues.append(
            f"Expect {top['ability']} focus on {zone.upper()} site "
            f"({top['hard_count']}); prepare a clear-site utility plan that "
            f"denies the {top['class']} line.")
    for p in operator.get("players", [])[:2]:
        cues.append(
            f"{p['player']} buys Operator on {p['agent']} in {p['buy_rate']}; "
            f"bait the first shot into your {max(p['hold_timing'], key=p['hold_timing'].get)} "
            f"hold window and trade immediately.")
    cues.append("Run the Self-Scout view before the match: your own top zone "
                "is what their coaching staff will prepare against.")
    return cues


# ---------------------------------------------------------------- filtering
def apply_filters(query: dict, record: dict) -> bool:
    """Filter engine over the brief's full filter rail."""
    for key in FILTERS:
        want = query.get(key)
        if want in (None, "", "all"):
            continue
        have = record.get(key)
        if isinstance(want, list):
            if have not in want:
                return False
        elif have != want:
            return False
    return True


# ------------------------------------------------------- frontend contract
def trajectory_point(*, u: float, v: float, u0: float, v0: float,
                     azimuth: float | None, pitch: float | None,
                     ability: str, ability_class: str, player: str,
                     round_no: int | None, quality: str,
                     confidence: float | None, patch: str = "") -> dict:
    """One per-cast trajectory record in the exact shape docs/GUIDE.md §3A
    defines for GET /api/atlas points. Single source of truth shared by the
    synthetic API path (breachiq/api.py) and the real-corpus snapshot
    builder (scripts/build_findings.py), so the two modes can never drift.

    u0/v0 are the caster's normalized position; u/v the landing ESTIMATE
    (GRID records no landing coordinates, so is_estimate is always True —
    never removed, per the project's honesty rules). All four coordinates
    are clamped into the minimap frame [0, 1]: a few casts sit just outside
    the recorded playable bounds and render at the boundary — the same
    walls-stop-abilities rule the landing projection applies. azimuth is
    normalized to [0, 360) and pitch clamped to [-90, 90] as the contract
    demands; both are None when no aim vector survived quality
    classification.
    """
    clamp01 = lambda x: min(1.0, max(0.0, x))  # noqa: E731 - local for clarity
    return {
        "u": round(clamp01(u), 4), "v": round(clamp01(v), 4),
        "u0": round(clamp01(u0), 4), "v0": round(clamp01(v0), 4),
        "azimuth": (None if azimuth is None
                    else round((azimuth % 360.0 + 360.0) % 360.0, 1)),
        "pitch": (None if pitch is None
                  else round(max(-90.0, min(90.0, pitch)), 1)),
        "ability": ability, "class": ability_class,
        "player": player, "round": round_no,
        "quality": quality,
        "confidence": None if confidence is None else round(confidence, 3),
        "is_estimate": True,
        "patch": patch,
    }
