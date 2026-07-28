# EXP-010 Closure Factual Review Contract

## Artifact Role

- Purpose: constrain the final independent factual Review assignment.
- Classification: read-only Review Contract; owns no Project, Loop, Task, Finding, Closure, or recovery status.
- Downstream consumers: factual Review report, Finding/Rework if required, Closure, Results, and final accounting.

## Identity

- Review assignment: REVIEW-EXP-010-CLOSURE-FACTUAL
- Project: PROJECT-EXP-010
- Loop: LOOP-001
- Assigned role: independent read-only factual-accuracy Reviewer
- Reviewer: exp010-closure-factual
- Revision: 0
- Revision budget: 0; report a Finding or limitation rather than editing

## Objective

Independently determine whether blocked Closure, Results, scorecard, lifecycle table, and artifact accounting accurately reflect current product, governance, Review, test, Git, attempt, EII, and authority evidence.

## Allowed Reads

- Current user EXP-010 brief.
- Entire tracked/untracked EXP-010 worktree.
- LoopPilot frozen protocol files needed to check status vocabulary and authority.
- Local command output from read-only Git, file-count, and test-discovery inspection.

## Forbidden Writes and Actions

- No product, test, governance, evaluation, Ledger, index, commit, remote, external message, release, deploy, deletion, or authority change.
- No network command and no parent-completion claim.

## Deliverables

- Spec decision for required Results coverage.
- Standards decision for role, authority, lifecycle, and honesty.
- Evidence/Factual Accuracy decision covering product boundary, fresh tests/typecheck/build claims, artifact counts, Worker attempts, EII, Task/Finding/revision/owner/Review/Closure states, comparisons, and unverified claims.
- Exact Finding list with severity, path/section, correction required, and Closure impact.

## Verification

- Compare authorities before supporting projections.
- Inspect current Git boundary and exact ten product/test paths.
- Recalculate governance/evaluation file counts, lines, and bytes.
- Confirm no placeholder, fabricated PASS, unsupported native/CI/release claim, or hidden unresolved Finding.

## Git Boundary

- Base HEAD: 70de26178db91e34b97210a3ebecb485ec2fce1e.
- Index must remain empty.
- Review occurs before archival commits; self-referential final commit SHA and remote sync must remain explicitly unverified in RESULTS.

## Verifiable Claims

- The Reviewer may claim only directly inspected file, Git, count, and command-evidence consistency.

## Unverified Claims

- Native Android/device, remote CI, installer, production, release, deploy, and post-review commit/push state remain unverified unless separately observed.

## Consumer

- Integrator records the independent judgment in REVIEW-CLOSURE-FACTUAL.md.
- RESULTS and blocked Closure consume the decision; this Contract owns no status or acceptance.
