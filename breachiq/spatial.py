"""Spatial math over the VERIFIED ability-supplement schema.

Contract (from the starter-repo README, verified 2026-11-18):
  - position: x, y, z in centimeters; z is up; x/y share the GRID frame.
  - view: 3D unit aim vector (x, y, z).
  - velocity: 3D, cm/s.
  - frame_before / frame_after: movement samples around the cast, each with
    offset_ms (negative = before the cast) plus position/view/velocity.
  - interpolation (verbatim from the README):
      weight = (t_cast - t_before) / (t_after - t_before)
      value  = before * (1 - weight) + after * weight
    applied per component, then `view` is re-normalized to unit length.
  - quality: ok | gap_exceeded | missing_after | missing_before | missing_both
    (ok = both frames present within 500 ms; 1200 ms in low-rate series).
  - Landing locations are NOT provided anywhere: every landing zone we show is
    an ESTIMATE (raycast projection) and must be labeled as such.

Map bounds in BOUNDS are CALIBRATED from real GRID `map.bounds` (see
docs/DATA_QUALITY.md for the calibration procedure and date).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

# ---------------------------------------------------------------- quality
QUALITY_OK = "ok"
QUALITY_GAP_EXCEEDED = "gap_exceeded"
QUALITY_MISSING_AFTER = "missing_after"
QUALITY_MISSING_BEFORE = "missing_before"
QUALITY_MISSING_BOTH = "missing_both"
ALL_QUALITIES = (QUALITY_OK, QUALITY_GAP_EXCEEDED, QUALITY_MISSING_AFTER,
                 QUALITY_MISSING_BEFORE, QUALITY_MISSING_BOTH)

# Tolerances from the README: 500 ms normal series, 1200 ms low-rate series.
NORMAL_TOL_MS = 500.0
LOW_RATE_TOL_MS = 1200.0
LOW_RATE_GAP_MS = 1000.0  # a before/after gap near 1000 ms marks a 1 Hz series


# ---------------------------------------------------------------- bounds
@dataclass(frozen=True)
class MapBounds:
    """Playable-area bounds in centimeters (z unused for 2D projection)."""
    x_min: float
    x_max: float
    y_min: float
    y_max: float

    @property
    def width(self) -> float:
        return self.x_max - self.x_min

    @property
    def height(self) -> float:
        return self.y_max - self.y_min


# CALIBRATED from real `map.bounds` in the official GRID feeds
# (2026-11-19, scripts/build_findings.py output + a breeze series).
# Synthetic fixtures use these too, so demo coordinates match reality.
BOUNDS: dict[str, MapBounds] = {
    "abyss":   MapBounds(-6000.0, 6000.0, -6800.0, 5800.0),
    "ascent":  MapBounds(-4850.0, 7550.0, -11100.0, 2200.0),
    "bind":    MapBounds(100.0, 16100.0, -7300.0, 6050.0),
    "breeze":  MapBounds(-1650.0, 11450.0, -6200.0, 7200.0),
    "corrode": MapBounds(-6000.0, 6000.0, -7100.0, 6500.0),
    "fracture": MapBounds(3000.0, 13900.0, -6850.0, 4700.0),
    "haven":   MapBounds(-3700.0, 7450.0, -14100.0, -1800.0),
    "icebox":  MapBounds(-8300.0, 3100.0, -5200.0, 7200.0),
    "lotus":   MapBounds(300.0, 11000.0, -5500.0, 6550.0),
    "pearl":   MapBounds(-500.0, 11250.0, -6100.0, 6550.0),
    "split":   MapBounds(-3450.0, 8300.0, -10050.0, 950.0),
    "summit":  MapBounds(300.0, 12700.0, -50.0, 10250.0),
    "sunset":  MapBounds(-6000.0, 6450.0, -5800.0, 6000.0),
}


def normalize_position(pos: dict, bounds: MapBounds) -> tuple[float, float]:
    """Map a world position (cm) to minimap coordinates (u, v) in [0, 1].

    This is the calibration step the first edition's losers skipped: raw game
    units dumped onto a canvas render icons outside playable terrain.
    """
    u = (pos["x"] - bounds.x_min) / bounds.width
    v = 1.0 - (pos["y"] - bounds.y_min) / bounds.height  # canvas y grows downward
    return u, v


def azimuth_deg(view: dict) -> float:
    """Horizontal orientation of the aim vector, in compass-free degrees."""
    return math.degrees(math.atan2(view["y"], view["x"]))


def pitch_deg(view: dict) -> float:
    """Vertical launch angle of the (unit) aim vector."""
    return math.degrees(math.asin(max(-1.0, min(1.0, view["z"]))))


# ---------------------------------------------------------------- frames
def sample_weight(t_cast: float, t_before: float, t_after: float) -> float | None:
    """README-verbatim weight; None when the denominator is degenerate."""
    denom = t_after - t_before
    if denom == 0:
        return None
    return (t_cast - t_before) / denom


def _lerp(a: float, b: float, w: float) -> float:
    return a * (1.0 - w) + b * w


def interpolate(before: dict, after: dict, weight: float) -> dict:
    """README-verbatim per-component interpolation; view re-normalized."""
    out = {}
    for key in ("position", "velocity"):
        out[key] = {axis: _lerp(before[key][axis], after[key][axis], weight)
                    for axis in ("x", "y", "z")}
    view = {axis: _lerp(before["view"][axis], after["view"][axis], weight)
            for axis in ("x", "y", "z")}
    norm = math.sqrt(sum(v * v for v in view.values())) or 1.0
    out["view"] = {axis: view[axis] / norm for axis in view}
    return out


def is_low_rate(frame_before: dict | None, frame_after: dict | None) -> bool:
    """Detect 1 Hz (VCT Americas 2025) series by before/after gap ~1000 ms."""
    if frame_before is None or frame_after is None:
        return False
    gap = frame_after["offset_ms"] - frame_before["offset_ms"]
    return gap >= LOW_RATE_GAP_MS - 100.0


def classify_quality(event: dict) -> str:
    """Classify a supplement cast event into one of the five quality values."""
    fb, fa = event.get("frame_before"), event.get("frame_after")
    if fb is None and fa is None:
        return QUALITY_MISSING_BOTH
    if fa is None:
        return QUALITY_MISSING_AFTER
    if fb is None:
        return QUALITY_MISSING_BEFORE
    tol = LOW_RATE_TOL_MS if is_low_rate(fb, fa) else NORMAL_TOL_MS
    if abs(fb["offset_ms"]) > tol or abs(fa["offset_ms"]) > tol:
        return QUALITY_GAP_EXCEEDED
    return QUALITY_OK


def cast_state(event: dict) -> dict | None:
    """Best cast-time state honoring quality rules.

    ok -> interpolated; gap_exceeded -> the CLOSER frame (README rule);
    missing_after/missing_before -> the present frame; missing_both -> None.
    The result carries a low_rate flag so downstream views can down-weight.
    """
    quality = classify_quality(event)
    fb, fa = event.get("frame_before"), event.get("frame_after")
    state = {"quality": quality, "low_rate": is_low_rate(fb, fa)}
    if quality == QUALITY_MISSING_BOTH:
        return None
    if quality == QUALITY_OK:
        w = sample_weight(0.0, fb["offset_ms"], fa["offset_ms"])
        if w is None:
            interp = fb
        else:
            interp = interpolate(fb, fa, w)
        state.update(position=interp["position"], view=interp["view"],
                     velocity=interp["velocity"])
        return state
    closer = fb if (fb is not None and (fa is None or abs(fb["offset_ms"]) <= abs(fa["offset_ms"]))) else fa
    state.update(position=closer["position"], view=closer["view"],
                 velocity=closer["velocity"])
    return state


# ---------------------------------------------------------------- landing
# Cast distance heuristics per ability class (cm). These are ESTIMATE
# parameters, not measured facts; landing locations are not in the data.
ABILITY_RANGE = {
    "recon": 9000.0,      # Sova Recon Bolt style
    "placeable": 2200.0,  # trapwires / alarmbots / walls placed near the caster
    "smoke": 5500.0,
    "stall": 4000.0,
    "flash": 3500.0,
}
DEFAULT_RANGE = 4500.0


@dataclass
class LandingEstimate:
    """A labeled ESTIMATE - the data never contains landing locations."""
    u: float
    v: float
    method: str = "aim-ray projection"
    confidence: float = 1.0
    is_estimate: bool = True
    notes: list[str] = field(default_factory=list)


def estimate_landing(cast: dict, ability_class: str,
                     bounds: MapBounds) -> LandingEstimate | None:
    """Project the aim ray to a landing estimate on the minimap.

    Confidence is degraded by data quality (quality flags) and by low-rate
    sampling; the label 'estimate' is never removed.
    """
    state = cast_state(cast)
    if state is None:
        return None
    view = state["view"]
    reach = ABILITY_RANGE.get(ability_class, DEFAULT_RANGE)
    horiz = math.hypot(view["x"], view["y"])
    if horiz <= 1e-6:
        # Straight up/down: lands on the caster position.
        end = dict(state["position"])
        notes = ["vertical cast"]
    else:
        end = {"x": state["position"]["x"] + view["x"] / horiz * reach,
               "y": state["position"]["y"] + view["y"] / horiz * reach}
        notes = []
    u, v = normalize_position(end, bounds)
    # Clamp to playable bounds: a ray that exits the terrain lands at the
    # boundary (walls stop abilities); never render outside the map.
    if not (0.0 <= u <= 1.0 and 0.0 <= v <= 1.0):
        u, v = min(1.0, max(0.0, u)), min(1.0, max(0.0, v))
        notes.append("clamped to playable bounds")
    conf = 1.0
    if state["quality"] != QUALITY_OK:
        conf *= 0.6
        notes.append(f"quality={state['quality']} (closer-frame fallback)")
    if state["low_rate"]:
        conf *= 0.7
        notes.append("low-rate series (1 Hz): down-weighted")
    return LandingEstimate(u=u, v=v, confidence=round(conf, 3), notes=notes)
