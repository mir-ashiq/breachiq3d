"""Feature layer: the things coaches actually score us on.

Every output carries an EvidenceBar: hard counts ("38/60 rounds"), sample
sizes, patch recency, coverage, and data-quality mix. A number without its
evidence is exactly the passive-aggregator pattern the brief warns about.
"""
from __future__ import annotations

import re
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
                "rounds": sorted(cl["rounds"]),
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


# ------------------------------------------------------------ evidence math
def wilson_interval(k: int, n: int, z: float = 1.96) -> dict | None:
    """Wilson score interval (default 95%) for a binomial share k/n.

    The honest way to say "63%": with small samples a raw share pretends
    a precision the data does not have. Used on lineup conversion,
    Operator buy share and every win-rate share the brief quotes.
    Returns {"low": .., "high": ..} rounded to 3dp, or None when n <= 0.
    """
    if n <= 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = (z * (p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / denom
    return {"low": round(max(0.0, centre - half), 3),
            "high": round(min(1.0, centre + half), 3)}


def lineup_effectiveness(rounds_won: list[bool],
                         baseline_won: list[bool] | None) -> dict:
    """Does the lineup actually win rounds?

    The one question rival scouts cannot answer: they map where utility
    is thrown, we tie each detected lineup to round outcomes - win rate
    WITH the lineup vs the team's win rate on the same map+side WITHOUT
    it. rounds_won carries one bool per round where the lineup appeared;
    baseline_won one bool per same-scope comparison round (None or empty
    means no comparison rounds exist - reported as null, never guessed).
    Observational by construction: association, not cause.
    """
    n = len(rounds_won)
    k = sum(1 for w in rounds_won if w)
    base = lift = None
    if baseline_won:
        base = round(sum(1 for w in baseline_won if w) / len(baseline_won), 3)
        lift = round(((k / n) if n else 0.0) - base, 3)
    return {
        "rounds_won": k, "sample_rounds": n,
        "win_rate_when_cast": round(k / n, 3) if n else None,
        "wilson_95": wilson_interval(k, n),
        "baseline_win_rate": base,
        "baseline_sample_rounds": len(baseline_won or []),
        "lift_pp": None if lift is None else round(lift * 100, 1),
        "note": ("observational: win rate with the lineup vs without it "
                 "on the same map+side; association, not cause"),
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


# severity ranking of brief insights: a coach reads top-down, so the
# order itself is a claim about what matters most - it must be derived
# from the evidence, never hard-coded per insight.
_SEVERITY_ORDER = {"critical": 0, "warning": 1, "note": 2}


def _hard_count_split(hard_count: str) -> tuple[int, int]:
    """"34/231 rounds" -> (34, 231); (0, 0) when unparseable."""
    m = re.search(r"(\d+)\s*/\s*(\d+)", hard_count or "")
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def tactical_brief(atlas: dict, operator: dict, lineups: list[dict],
                   pacing: dict, map_name: str, side: str = "all") -> dict:
    """Structured, severity-ranked counter-brief - the anti-strat core.

    Returns headline + insights[], every insight carrying:
      severity  critical | warning | note   (ranked, deterministic rules)
      kind      lineup | operator | tempo | utility | method
      title     short label for chips/lists
      detail    what the data shows (numbers, never adjectives alone)
      action    what to do about it on the server
      evidence  {rounds_seen, sample_rounds, confidence, source}
                - every number traces to a committed aggregate; source names
                  the endpoint it came from. No evidence, no insight.

    One builder feeds GET /api/brief (JSON) and /api/brief.pdf, so the
    dashboard panel and the coach's printed one-pager can never drift.
    """
    rounds = int(atlas.get("rounds") or 0)
    insights: list[dict] = []

    def cov_score(rounds_seen: int, confidence: float | None) -> float:
        """Deterministic within-severity ordering: coverage first, then
        detector confidence (unknown confidence counts as neutral)."""
        coverage = min(1.0, rounds_seen / rounds) if rounds else 0.0
        conf = 1.0 if confidence is None else max(0.0, min(1.0, confidence))
        return round(coverage * (0.5 + 0.5 * conf), 4)

    # 1) repeated lineups - the exploit targets (detector floor: 3 rounds).
    # Effectiveness (with-vs-without round outcomes, same map+side) can
    # FLIP the coaching call: a repeated lineup that does not convert is
    # bait to let live, not a threat to spend utility denying.
    for l in sorted((x for x in lineups
                     if x.get("map", map_name) == map_name),
                    key=lambda x: (-int(x.get("repeats") or 0),
                                   str(x.get("ability"))))[:3]:
        reps = int(l.get("repeats") or 0)
        if reps < 3:
            continue
        conf = float(l.get("avg_confidence") or 0.0)
        severity = "critical" if (reps >= 10 and conf >= 0.9) else "warning"
        detail = (f"{l['ability']} is cast from the same spot in "
                  f"{reps} rounds (aim "
                  f"{(l.get('aim_azimuth_deg') or 0):.0f} deg).")
        action = ("Pre-aim the landing spot and deny the line with "
                  "your own utility before the execute hits.")
        eff = l.get("effectiveness") or {}
        wr = eff.get("win_rate_when_cast")
        if wr is not None:
            k, n = eff.get("rounds_won"), eff.get("sample_rounds")
            wil = eff.get("wilson_95") or {}
            rng = (f", 95% range {wil['low']:.0%}-{wil['high']:.0%}"
                   if wil else "")
            lift, base = eff.get("lift_pp"), eff.get("baseline_win_rate")
            if lift is not None and base is not None and lift <= -8:
                severity = "warning"
                detail += (f" It does NOT convert: {wr:.0%} ({k}/{n}{rng}) "
                           f"vs {base:.0%} without it ({lift:+.0f}pp).")
                action = ("Let them have this lineup - it does not win "
                          "their rounds; save the deny utility for the "
                          "threats that actually convert.")
            elif lift is not None and base is not None and lift >= 8:
                detail += (f" It converts: {wr:.0%} ({k}/{n}{rng}) vs "
                           f"{base:.0%} without it ({lift:+.0f}pp) - "
                           f"denying it removes a winning pattern.")
            else:
                detail += f" Converts at {wr:.0%} ({k}/{n}{rng})."
        insights.append({
            "severity": severity, "kind": "lineup",
            "title": f"Repeated lineup: {l['ability']} x{reps}",
            "detail": detail,
            "action": action,
            "evidence": {"rounds_seen": reps, "sample_rounds": rounds,
                         "confidence": round(conf, 2), "source": "lineups",
                         "scope": "map"},
            "effectiveness": eff or None,
            "score": cov_score(reps, conf),
        })

    # 2) operator buy concentration - the trade pattern. buy_rate is a
    # SERIES-wide fraction ("40/962 rounds"): quote that denominator, not
    # the map rounds, or the evidence mixes scopes.
    buyers = [p for p in operator.get("players", [])
              if int(p.get("operator_buys") or 0) > 0]
    if buyers:
        top = max(buyers, key=lambda p: int(p.get("operator_buys") or 0))
        buys = int(top["operator_buys"])
        _, series_rounds = _hard_count_split(top.get("buy_rate", ""))
        sample = series_rounds or rounds
        if sample:
            share = buys / sample
            wil = wilson_interval(buys, sample) or {}
            rng = (f" (95% range {wil['low']:.0%}-{wil['high']:.0%})"
                   if wil else "")
            insights.append({
                "severity": "warning" if share >= 0.15 else "note",
                "kind": "operator",
                "title": f"{top['player']} buys the Operator ({top['buy_rate']})",
                "detail": (f"{top['player']} on {top['agent']} buys the Operator "
                           f"in {buys} of {sample} series rounds{rng}."),
                "action": ("Bait the first shot into your prepared hold window "
                           "and trade immediately - the angle is a habit, not "
                           "an accident."),
                "evidence": {"rounds_seen": buys, "sample_rounds": sample,
                             "confidence": None, "source": "operator",
                             "scope": "series"},
                "score": cov_score(buys, sample),
            })

    # 3) execute tempo. The real snapshot paces per MAP (the lotus entry
    # is the lotus median); synthetic fixtures pace per SITE across the
    # series. Quote whichever scope the payload actually carries - never
    # rebrand one as the other.
    sites = pacing.get("sites") or {}
    tempo = None
    map_entry = sites.get(map_name)
    if isinstance(map_entry, dict) and map_entry.get("median_utility_to_plant_s"):
        tempo = (map_name, map_entry, "map")
    else:
        timed = [(n, s) for n, s in sites.items()
                 if isinstance(s, dict) and s.get("median_utility_to_plant_s")]
        if timed:
            tempo = (*min(timed, key=lambda kv: float(
                kv[1]["median_utility_to_plant_s"])), "series")
    if tempo:
        name, s, scope = tempo
        median = float(s["median_utility_to_plant_s"])
        site_rounds = int(s.get("rounds") or 0)
        label = (f"Execute tempo on {name.upper()}"
                 if scope == "map"
                 else f"Fastest execute: {name.upper()} site")
        insights.append({
            "severity": "warning" if median <= 60.0 else "note",
            "kind": "tempo",
            "title": f"{label} ({median:.1f}s median)",
            "detail": (f"Utility-to-plant median on {name.upper()} is "
                       f"{median:.1f}s across {site_rounds} rounds."),
            "action": ("Stack early rotations for the fast hit; the window "
                       "before their utility lands is your only prep time."),
            "evidence": {"rounds_seen": site_rounds,
                         "sample_rounds": site_rounds,
                         "confidence": None, "source": "pacing",
                         "scope": scope},
            "score": cov_score(site_rounds, None),
        })

    # 4) utility focus - the ability the map plan is built around
    abilities = atlas.get("abilities") or []
    if abilities:
        top = abilities[0]
        zone = max(top["zones"], key=top["zones"].get) if top["zones"] else "?"
        seen, _ = _hard_count_split(top.get("hard_count", ""))
        zone_share = (top["zones"][zone] / sum(top["zones"].values())
                      if top["zones"] else 0.0)
        coverage = seen / rounds if rounds else 0.0
        severity = ("critical" if coverage >= 0.4 and zone_share >= 0.5
                    else "warning" if coverage >= 0.2 else "note")
        insights.append({
            "severity": severity, "kind": "utility",
            "title": f"Utility focus: {top['ability']} on {zone.upper()}",
            "detail": (f"{top['ability']} appears in {seen} of {rounds} "
                       f"rounds with {zone_share:.0%} of its casts on "
                       f"{zone.upper()} ({top.get('hard_count')})."),
            "action": (f"Prepare a clear-site plan that denies the "
                       f"{top.get('class', 'utility')} line on "
                       f"{zone.upper()}."),
            "evidence": {"rounds_seen": seen, "sample_rounds": rounds,
                         "confidence": None, "source": "atlas",
                         "scope": "map"},
            "score": cov_score(seen, None),
        })

    # 5) the self-scout reminder - methodology, not telemetry
    insights.append({
        "severity": "note", "kind": "method",
        "title": "Self-scout before the match",
        "detail": ("Your own top zone is what their coaching staff will "
                   "prepare against."),
        "action": ("Run the Self-Scout view on your own recent series and "
                   "rotate the habits it exposes."),
        "evidence": {"rounds_seen": 0, "sample_rounds": rounds,
                     "confidence": None, "source": "method",
                     "scope": "method"},
        "score": 0.0,
    })

    insights.sort(key=lambda i: (_SEVERITY_ORDER[i["severity"]],
                                 -i["score"], i["kind"], i["title"]))
    headline = ""
    if insights:
        headline = f"{insights[0]['title']} - {insights[0]['action']}"
    return {"map": map_name, "side": side, "rounds": rounds,
            "headline": headline, "insights": insights}


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
                     confidence: float | None, patch: str = "",
                     agent: str = "", won: bool | None = None) -> dict:
    """One per-cast trajectory record in the exact shape docs/GUIDE.md §3A
    defines for GET /api/atlas points. Single source of truth shared by
    the synthetic API path (breachiq/api.py) and the real-corpus snapshot
    builder (scripts/build_findings.py), so the two modes can never drift.

    u0/v0 are the caster's normalized position; u/v the landing ESTIMATE
    (GRID records no landing coordinates, so is_estimate is always True —
    never removed, per the project's honesty rules). All four coordinates
    are clamped into the minimap frame [0, 1]: a few casts sit just outside
    the recorded playable bounds and render at the boundary — the same
    walls-stop-abilities rule the landing projection applies. azimuth is
    normalized to [0, 360) and pitch clamped to [-90, 90] as the contract
    demands; both are None when no aim vector survived quality
    classification. agent carries the caster's agent id for the roster
    filter rail and the hover tooltip ("" when unknown). won carries the
    round outcome from the caster's team's perspective (True/False), or
    None when the outcome is unknown - never fabricated.
    """
    clamp01 = lambda x: min(1.0, max(0.0, x))  # noqa: E731 - local for clarity
    return {
        "u": round(clamp01(u), 4), "v": round(clamp01(v), 4),
        "u0": round(clamp01(u0), 4), "v0": round(clamp01(v0), 4),
        "azimuth": (None if azimuth is None
                    else (0.0 if round((azimuth % 360.0 + 360.0) % 360.0, 1) >= 360.0
                          else round((azimuth % 360.0 + 360.0) % 360.0, 1))),
        "pitch": (None if pitch is None
                  else round(max(-90.0, min(90.0, pitch)), 1)),
        "ability": ability, "class": ability_class,
        "player": player, "agent": agent, "round": round_no,
        "quality": quality,
        "confidence": None if confidence is None else round(confidence, 3),
        "is_estimate": True,
        "patch": patch,
        "won": won,
    }
