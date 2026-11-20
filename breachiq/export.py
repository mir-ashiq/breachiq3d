"""One-page PDF brief export - the take-away artifact for coaches.

Coaches work between scrim blocks, not in browsers; any filtered view can
be exported as a printable one-pager (see ROADMAP week 5). The PDF is a
pure rendering of the structured brief from features.tactical_brief -
the same dict GET /api/brief serves - so the printed page and the
dashboard panel can never disagree.
"""
from __future__ import annotations

import io

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

# severity -> (label color, chip fill): red/amber/slate, print-legible
_SEVERITY_STYLE = {
    "critical": ((0.55, 0.07, 0.09), (0.96, 0.26, 0.21)),
    "warning": ((0.42, 0.26, 0.01), (1.0, 0.72, 0.21)),
    "note": ((0.18, 0.22, 0.27), (0.56, 0.63, 0.71)),
}


def build_tactical_pdf(brief: dict) -> bytes:
    """Render the structured counter-brief (features.tactical_brief) to a
    single-page PDF: headline, severity-ranked insights, per-insight
    evidence, honesty footer. Never spills to a second page - overflowing
    insights are counted and referenced instead."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter
    margin = 0.75 * inch
    title, opponent = brief.get("map", "?"), str(brief.get("source", ""))

    # header band
    c.setFillColorRGB(0.08, 0.13, 0.19)
    c.rect(0, h - 1.1 * inch, w, 1.1 * inch, stroke=0, fill=1)
    c.setFillColorRGB(0.22, 0.86, 0.95)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, h - 0.55 * inch, "BreachIQ 3D")
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica", 11)
    sub = f"Counter-brief: {title} ({brief.get('side', 'all')}, " \
          f"{brief.get('rounds', 0)} rounds)"
    if opponent:
        sub += f" - {opponent}"
    c.drawString(margin, h - 0.8 * inch, sub)

    y = h - 1.35 * inch

    # headline: the what-to-do-first line
    headline = brief.get("headline", "")
    if headline:
        c.setFillColorRGB(0.05, 0.09, 0.14)
        c.setFont("Helvetica-Bold", 12)
        for line in _wrap(f"FIRST: {headline}", 92):
            c.drawString(margin, y, line)
            y -= 0.2 * inch
        y -= 0.12 * inch

    # severity-ranked insights
    insights = brief.get("insights", [])
    floor = 2.0 * inch  # scope panel + footer reserve
    shown = 0
    for ins in insights:
        block = _insight_height(ins)
        if y - block < floor:
            break
        y = _draw_insight(c, margin, y, ins)
        shown += 1

    hidden = len(insights) - shown
    if hidden > 0:
        c.setFillColorRGB(0.45, 0.45, 0.45)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(margin, y,
                     f"... {hidden} more insight{'s' if hidden > 1 else ''} "
                     f"in the dashboard (GET /api/brief)")

    # provenance panel anchored at the page foot: what this brief covers,
    # which endpoints fed it, and the standing honesty rules. Fills the
    # tail of the page with substance instead of blank space.
    _draw_scope_panel(c, margin, w, brief, insights)

    # honesty footer - the project's non-negotiable
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.drawString(margin, 0.72 * inch,
                 f"Evidence per insight: rounds seen / sample, detector "
                 f"confidence, source endpoint. {opponent or 'synthetic'}.")
    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_scope_panel(c: canvas.Canvas, margin: float, w: float,
                      brief: dict, insights: list[dict]) -> None:
    counts = {"critical": 0, "warning": 0, "note": 0}
    for i in insights:
        counts[i.get("severity", "note")] += 1
    top, bottom = 1.92 * inch, 0.98 * inch
    c.setFillColorRGB(0.93, 0.95, 0.97)
    c.rect(margin, bottom, w - 2 * margin, top - bottom, stroke=0, fill=1)
    c.setFillColorRGB(0.18, 0.22, 0.27)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(margin + 0.12 * inch, top - 0.2 * inch, "BRIEF SCOPE")
    src = str(brief.get("source") or "synthetic")
    lines = [
        f"map {brief.get('map', '?')} | side {brief.get('side', 'all')} | "
        f"{brief.get('rounds', 0)} rounds sampled | {src}",
        f"insights: {len(insights)} "
        f"(critical {counts['critical']} / warning {counts['warning']} / "
        f"note {counts['note']}) from atlas, lineups, operator, pacing",
        "Landing zones are raycast estimates (GRID provides no landing "
        "data); every insight quotes its evidence inline.",
    ]
    c.setFont("Helvetica", 8.5)
    for j, line in enumerate(lines):
        c.drawString(margin + 0.12 * inch,
                     top - (0.38 + j * 0.17) * inch, line)


def _draw_insight(c: canvas.Canvas, margin: float, y: float, ins: dict) -> float:
    """One insight block: severity chip + title, detail, action, evidence.
    Returns the y below the block."""
    sev = ins.get("severity", "note")
    dark, chip = _SEVERITY_STYLE.get(sev, _SEVERITY_STYLE["note"])
    label = sev.upper()

    # severity chip
    chip_w = 0.62 * inch
    c.setFillColorRGB(*chip)
    c.rect(margin, y - 0.045 * inch, chip_w, 0.19 * inch,
           stroke=0, fill=1)
    c.setFillColorRGB(*dark)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(margin + 0.06 * inch, y, label)

    # title beside the chip
    c.setFillColorRGB(0.05, 0.09, 0.14)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin + chip_w + 0.12 * inch, y, ins.get("title", ""))
    y -= 0.24 * inch

    c.setFont("Helvetica", 9.5)
    for line in _wrap(ins.get("detail", ""), 96):
        c.drawString(margin, y, line)
        y -= 0.16 * inch
    c.setFont("Helvetica-Oblique", 9.5)
    for line in _wrap(f"Action: {ins.get('action', '')}", 96):
        c.drawString(margin, y, line)
        y -= 0.16 * inch

    ev = ins.get("evidence", {})
    conf = ev.get("confidence")
    conf_s = f"{conf:.0%} confidence" if conf is not None else "no confidence score"
    ev_line = (f"evidence: {ev.get('rounds_seen', 0)}/"
               f"{ev.get('sample_rounds', 0)} rounds - {conf_s} - "
               f"source: {ev.get('source', '?')}")
    c.setFillColorRGB(0.35, 0.4, 0.46)
    c.setFont("Helvetica", 8)
    c.drawString(margin, y, ev_line)
    return y - 0.26 * inch


def _insight_height(ins: dict) -> float:
    lines = (len(_wrap(ins.get("detail", ""), 96))
             + len(_wrap(f"Action: {ins.get('action', '')}", 96)))
    return (0.24 + lines * 0.16 + 0.26) * inch


def _wrap(text: str, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for word in words:
        if len(cur) + len(word) + 1 > width:
            lines.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        lines.append(cur)
    return lines
