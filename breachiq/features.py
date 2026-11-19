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

    def __init__(self):
        self.zone_counts: dict[tuple[str, str], int] = {}  # (zone, ability) -> casts
        self.total_rounds = 0
        self.matches = 0
        self.patches: set[str] = set()
        self.quality: dict[str, int] = {}

    def add_round(self, casts: list[dict], patch: str = "") -> None:
        self.total_rounds += 1
        self.patches.add(patch)
        for cast in casts:
            zone = zone_of(cast["u"], cast["v"])
            if zone is None:
                continue
            ability = cast.get("ability", "unknown")
            self.zone_counts[(zone, ability)] = self.zone_counts.get((zone, ability), 0) + 1
            q = cast.get("quality", "ok")
            self.quality[q] = self.quality.get(q, 0) + 1

    def result(self, matches: int = 0, coverage: str = "") -> dict:
        ordered = []
        for cls, abilities in UTILITY_TAXONOMY:  # brief order, never alphabetical
            for ability in abilities:
                per_zone = {z: c for (z, a), c in self.zone_counts.items() if a == ability}
                if per_zone:
                    freq = sum(per_zone.values())
                    ev = EvidenceBar(
                        rounds=self.total_rounds, matches=matches or self.matches,
                        frequency=freq, patch=','.join(sorted(p for p in self.patches if p)),
                        coverage=coverage, quality_mix=dict(self.quality))
                    ordered.append({"ability": ability, "class": cls,
                                    "zones": per_zone, "hard_count": ev.hard_count,
                                    "evidence": ev.as_dict()})
        return {"taxonomy_order": [c for c, _ in UTILITY_TAXONOMY],
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
        self.rotation: dict[str, set[str]] = {}            # agent -> players seen

    def add_round(self, *, player: str, agent: str, bought_operator: bool,
                  hold_start_s: float | None = None) -> None:
        self.rounds_by_player[player] = self.rounds_by_player.get(player, 0) + 1
        if bought_operator:
            self.purchases[(player, agent)] = self.purchases.get((player, agent), 0) + 1
        self.rotation.setdefault(agent, set()).add(player)
        if hold_start_s is not None:
            self.holds.setdefault(player, []).append(hold_start_s)

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
