# LoopPilot EXP-010 Experiment Plan

## Artifact Role

- Purpose: preregister the hypotheses, boundaries, and acceptance logic for final Full Loop behavioral acceptance.
- Classification: supporting experiment evidence; it owns no Project, Loop, Task, Finding, Review, or Closure status.
- Downstream consumers: candidate selection, mode selection, experiment evaluation, and the final report.

## Fixed Boundary

- Product repository: `tutict/GamePulse`.
- Baseline: observed `origin/main` at `70de26178db91e34b97210a3ebecb485ec2fce1e` on 2026-07-27.
- Branch: `experiment/looppilot-gamepulse-exp-010`.
- Worktree: `C:\tmp\GamePulse-exp-010`.
- LoopPilot repository is read-only and was observed clean at `2275e747e73936ebb8f0b24e5fb901a619b6adf8`.
- Product work must be bounded, deterministic, network-independent, and require no real user data, LLM, deployment, release, or live Steam/Reddit access.
- Full Loop is permitted only after a real gap, at least two real implementation owners, and a non-trivial cross-owner invariant are demonstrated.
- If that gate fails, the required outcome is `NO SUITABLE FULL-LOOP CANDIDATE` without manufactured work.

## Preregistered Hypotheses

| ID | Hypothesis | Initial state |
| --- | --- | --- |
| H1 | Real multi-owner work plus formal integration requirements can justify Full Loop. | pending |
| H2 | At least two Workers can produce independent, verifiable, non-decorative deliveries. | pending |
| H3 | At least one cross-owner invariant exists that no individual Worker can prove alone. | pending |
| H4 | Contract through Closure can complete without manufactured failure; correction is bounded and used only if naturally required. | pending |
| H5 | Governance growth remains proportional and avoids EXP-008-style iteration churn. | pending |
| H6 | Status, owner, revision, Git boundary, Finding, Review, and Closure values stay consistent between authorities and projections. | pending |
| H7 | Independent Review can issue a reproducible decision against a frozen boundary. | pending |
| H8 | An unmet acceptance condition ends honestly as blocked rather than being forced to success. | pending |

Final hypothesis classifications are restricted to `supported`, `contradicted`, `tension`, `inconclusive`, and `not exercised`.

## Execution Outline

1. Establish repository, environment-corrected, and scope-focused baselines.
2. Audit all four required candidates and apply the selection gate.
3. If selected, record Product Risk and Coordination Necessity before initializing Full Loop state.
4. Use two Workers unless observed scope proves a third is necessary; each Task receives disjoint primary write ownership and independent Spec and Standards review.
5. Require executable cross-owner integration evidence, then independent integrated-outcome Review.
6. Register Findings before any Rework; do not manufacture RED, failure, EII, or correction.
7. Close only after functional, engineering, and delivery acceptance, then evaluate the experiment and protocol calibration gate.

## Stop Conditions

- Stop before Full Loop initialization if the candidate gate fails.
- Stop as blocked when no safe, authorized, non-duplicative action remains.
- Do not interpret commit or push authority as release, PR, merge, tag, deployment, or main-branch authority.
