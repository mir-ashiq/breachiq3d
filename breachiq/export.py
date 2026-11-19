"""One-page PDF brief export - the take-away artifact for coaches.

Coaches work between scrim blocks, not in browsers; any filtered view can
be exported as a printable one-pager (see ROADMAP week 5).
"""
from __future__ import annotations

import io

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


def build_brief_pdf(title: str, cues: list[str], evidence: dict) -> bytes:
    """Render a one-page tactical brief to PDF bytes."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter
    margin = 0.75 * inch

    c.setFillColorRGB(0.08, 0.13, 0.19)
    c.rect(0, h - 1.1 * inch, w, 1.1 * inch, stroke=0, fill=1)
    c.setFillColorRGB(0.22, 0.86, 0.95)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, h - 0.7 * inch, "BreachIQ 3D")
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica", 11)
    c.drawString(margin, h - 0.95 * inch, f"Counter-brief: {title}")

    y = h - 1.5 * inch
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "Prescriptive cues")
    y -= 0.28 * inch
    c.setFont("Helvetica", 10)
    for cue in cues:
        for line in _wrap(cue, 88):
            c.drawString(margin, y, f"-  {line}")
            y -= 0.19 * inch
        y -= 0.05 * inch

    y -= 0.2 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "Evidence")
    y -= 0.28 * inch
    c.setFont("Helvetica", 9)
    for key, value in evidence.items():
        c.drawString(margin, y, f"{key}: {value}")
        y -= 0.18 * inch

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.drawString(margin, 0.5 * inch,
                 "Landing zones are raycast estimates (GRID provides no landing data). "
                 "Synthetic demo data unless connected to the official corpus.")
    c.showPage()
    c.save()
    return buf.getvalue()


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
