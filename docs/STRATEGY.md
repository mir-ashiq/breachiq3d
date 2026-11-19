# Strategy

BreachIQ 3D competes in **Category 1 (VALORANT Tactical Scouting)** of the
Cloud9 × JetBrains Sky's The Limit Hackathon 2026. This document records the
decisions that position the entry to win, and the reasoning behind each.

## Product decision: visual-first, never a chat-bot

The brief says it outright: outputs must be visual, not a chat interface.
BreachIQ is a console — canvas minimap, evidence bar, prescriptive cue cards,
PDF export. Natural-language output exists only as *counter-brief cues*
rendered from computed numbers, never as a free-form LLM chat.

## The moat stack (why this is hard to copy in 8 weeks)

1. **Both official blueprints**, not one: the Utility Placement & Ability
   Analysis Engine *and* the Operator Tendency & Sniper Profiler.
2. **The 3D ability supplements**: position (x, y, z), 3D aim vector, 3D
   velocity per cast — verified schema, quality flags handled, landing zones
   labeled as raycast estimates. Most entries will never parse these files.
3. **Evidence-first UX**: every insight carries hard counts ("38/60 rounds"),
   sample sizes, patch recency, and data-quality mix — the brief's explicit
   demand and the passive-aggregator anti-pattern.
4. **Self-Scout mode** (next-level option): the same engine pointed at
   Cloud9's own habits.
5. **Coach validation** at the Dec 9 office hours and via the Discord.

A rival who copies one layer still loses on the other four; that is the
point of a stack, not a feature list.

## Public repo tradeoff

The rules require a public open-source repo from submission; hiding the
project until the deadline is not an option. We accept copycats: depth
(supplement quality handling, evidence bar, both blueprints) is what cannot
be replicated quickly, and we audit rivals weekly (see ROADMAP).

## Differentiation vs the first-edition winners

| Winner | What it did | BreachIQ delta |
|---|---|---|
| C9 StratOS | round trends, defense collapse points | 3D trajectory engine + evidence bar + both 2026 blueprints |
| Spector | 1-click scouting reports, 2D minimap | placeable-first taxonomy, operator/odin profiling, hard counts |
| C9 Draft Assistant | predictive draft simulation | different category; our pacing curves cover the timing gap |

## Contingency: what if Category 1 floods?

If the viable field doubles (data barrier weaker than modeled), the win
condition shifts from "only supplement miner" to "best-executed brief fit":
evidence-first UX, both blueprints, and coach validation still rank us first
among a weaker-per-entry field. No scope change is needed — only execution.

## Data alignment: offline corpus, not live API

The brief's basis is the provided GRID corpus (857 VALORANT series + 856
supplement files). We build on exactly that asset, offline, reproducibly —
not on the live GRID Open Access API, whose delayed feed is a different
product than the hackathon's dumps.

## API-first integration

The FastAPI app publishes its **OpenAPI** schema at `/openapi.json` from
day one; the frontend consumes fixed routes from week 3. Frontend and
backend never integrate "at the end" — the contract is the integration.

## Cold-start protocol

The dashboard must pass the **cold-start test**: a coach who has never seen
it extracts a usable insight in under 60 seconds. Protocol: three testers,
timed, no documentation; iterate until all three pass. The onboarding tour
(60-second cold start) is the first-run UI.

## Validation log

Every coach interaction is logged: who, when, what they tried, what they
said, what changed in the product as a result. This log is the evidence
behind our Potential Impact claims — an attested user story, not a
hypothetical one.
