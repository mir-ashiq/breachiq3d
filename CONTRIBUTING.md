# Contributing

## Ground rules

1. **Never commit GRID data or derivatives** — the pre-push hook and CI
   audit block it, but review is the real guard (see docs/COMPLIANCE.md).
2. **Zero-disk, generator-based ingest** — any PR that materializes a
   series into a list is rejected; the corpus is ~160 GB.
3. **Tests pin the schema** — if the supplement contract changes,
   `tests/test_spatial.py` must fail loudly, not silently adapt.
4. **Every user-facing number carries its evidence bar** (rounds, matches,
   patch recency, quality mix) — no naked percentages.

## Workflow

- Branch per feature: `feat/<name>`, `fix/<name>`.
- CI must pass (tests + data-leak audit + pipeline verification).
- Conventional commits; squash-merge to main.

## Feature freeze (week 6, per ROADMAP)

After the freeze, only bugfixes and polish merge. Exceptions require BOTH
members' explicit sign-off recorded in the PR description — this rule
exists because scope creep after the freeze is how hackathon projects die.

## The red-team loop

`scripts/redteam_100.py` (kept in the team workspace) audits the repo
weekly; any open finding becomes the top of the backlog until cleared.
The audit is adversarial by design — treat findings as attacks to fix,
not opinions to debate.
