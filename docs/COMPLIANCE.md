# Compliance — read before every push

## Data license (the entry-killer)

The GRID data license forbids **redistribution**: no `.zst`, `.jsonl`,
`.parquet`, `.sqlite`, or data directories are ever committed — including
*derived* aggregates computed from the corpus. Enforcement is triple:

1. `.gitignore` patterns
2. `.githooks/pre-push` (install with `git config core.hooksPath .githooks`)
3. `scripts/audit_repo.py` in CI on every push

The repo ships **synthetic** fixtures only (labeled `SYNTHETIC`), generated
by `breachiq/fixtures.py`; the demo runs without a byte of licensed data.
Connect the official corpus locally outside the repo (e.g. a sibling
directory) and point the pipeline at it.

## Judge access

- The demo is **no-auth**: no login, no credentials, nothing to type.
  Access must remain free and unrestricted from submission through the end
  of judging (**Feb 3, 2027**); uptime monitoring runs the whole window.
- Docker fallback documented in the README for local runs.

## Eligibility (verified exclusion list)

Open worldwide **except** Brazil, Quebec, Russia, Crimea, Cuba, Iran, North
Korea, and other OFAC-sanctioned jurisdictions, and except employees,
contractors, and immediate family of Cloud9, JetBrains, GRID, and Devpost.
Every teammate completes docs/TEAM_ATTESTATION.md before registering.
Prizes require W-9/W-8BEN within 10 business days of notification.

## Materials

- All materials in **English** (or translated).
- Video: public YouTube, under 3 minutes, no unauthorized music or
  trademarks (see docs/VIDEO_STORYBOARD.md).
- Repository: public, MIT license displayed in the About section.

## Stacking

A project may win one category prize **and** at most one bonus prize; we
enter Category 1 plus the Best AI-Powered Workflow Story bonus.
