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
- Conventional commits; **rebase-merge** to main — squash-merge is
  disabled in repo settings because it collapses PRs into single
  commits and erases per-member attribution (the 50/50 contribution
  plan in docs/TEAM_ROADMAP.md requires every commit to land with its
  true author). Never push directly to main.
- The other track's lead reviews every PR before merge.

## Branch protection: enforced, not conventional — applies to the AI agent too

`main` is protected on GitHub: a pull request is required, the `test`
CI job (tests + data-leak audit + pipeline verification) must pass,
the PR branch must be up to date with main, linear history is required,
administrators are included, and force pushes and branch deletions are
disabled. Nobody — neither member nor the AI agent — can land a commit
on `main` any other way.

The flow for every change, no exceptions:

1. Branch from `main`: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
2. Push the branch and open a PR (draft PRs for work in progress).
3. CI runs on the PR and must be green before merging.
4. Rebase-merge only (squash is disabled; see the attribution rule above).
5. Delete the branch after merge.

AI-agent contributions follow exactly the same path: the agent works on
branches, opens PRs, waits for green CI, and merges through the same
gate — with AI assistance recorded per feature in `AI_SHOWCASE.md`.
Cross-track review remains the team convention for human PRs; it is
requested in practice but not hard-required by the protection rule, so
one available member is never blocked from landing a fix.

Recovery note: if the gate ever blocks legitimate recovery work (e.g.
an emergency revert), a repo admin can lift protection in Settings →
Branches — do it deliberately, restore it immediately after, and say
so in the PR that used the window.

## Feature freeze (week 6, per ROADMAP)

After the freeze, only bugfixes and polish merge. Exceptions require BOTH
members' explicit sign-off recorded in the PR description — this rule
exists because scope creep after the freeze is how hackathon projects die.

## The red-team loop

`scripts/redteam_100.py` (kept in the team workspace) audits the repo
weekly; any open finding becomes the top of the backlog until cleared.
The audit is adversarial by design — treat findings as attacks to fix,
not opinions to debate.
