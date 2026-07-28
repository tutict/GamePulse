# EXP-010 Lifecycle Consistency

## Artifact Role

- Purpose: evaluate lifecycle-value consistency at four required barriers.
- Classification: evaluation evidence only; it owns no Project, Loop, Task, Finding, Review, Closure, Git, or Recovery state.
- Downstream consumers: pre-Closure gate, Closure Review, scorecard, and final Results.

Authoritative files always override this table. A mismatch is recorded as an experiment Process Finding and corrected in the actual authority/projection; this file never changes authority.

## Mandatory Assertions

| Assertion | Authority |
|---|---|
| Project status | `.looppilot/PROJECT.md` |
| Loop status | `.looppilot/LOOP-MAP.md` |
| Every mandatory Task status, owner, revision | `LOOP-001/TASK-LEDGER.md` plus Contract revision projection |
| Finding status and severity | `LOOP-001/FINDING-LEDGER.md` |
| Current Git boundary | observed Git |
| Integration decision | `integration/INTEGRATION-RECORD.md` when created |
| Review decision | LOOP-001 Review Reports when created |
| Closure decision | `LOOP-CLOSURE.md` when created |
| Checkpoint next action | root `CHECKPOINT.md` |
| Handoff next action | root `HANDOFF.md` supporting projection |

## After Contract Barrier

Observed on 2026-07-27.

| Assertion | Authority | Expected | Observed | Consistent |
|---|---|---|---|---|
| Project status | PROJECT.md | in-progress | in-progress | yes |
| Loop status | LOOP-MAP.md | contracted | contracted | yes |
| TASK-001 status/owner/revision | TASK-LEDGER / Contract | assigned / exp010-shared-worker / 0 | assigned / exp010-shared-worker / 0 | yes |
| TASK-002 status/owner/revision | TASK-LEDGER / Contract | proposed / exp010-storage-worker / 0 | proposed / exp010-storage-worker / 0 | yes |
| Findings | FINDING-LEDGER | none / no severity | none / no severity | yes |
| Git boundary | observed Git | product unchanged; experiment/governance only | product diff empty; only `.looppilot/**` and EXP-010 docs untracked | yes |
| Integration decision | Integration Record | not started | artifact not created | yes |
| Review decision | Review Reports | not started | artifacts not created | yes |
| Closure decision | Loop Closure | not started | artifact not created | yes |
| Checkpoint next action | CHECKPOINT.md | dispatch TASK-001 | dispatch TASK-001 | yes |
| Handoff next action | HANDOFF.md | dispatch TASK-001 | dispatch TASK-001 | yes |

Contract Barrier result: all mandatory assertions consistent.

## After Worker Delivery Wave

Observed on 2026-07-27 after both mandatory Deliveries existed and before TASK-002 Review.

| Assertion | Authority | Expected | Observed | Consistent |
|---|---|---|---|---|
| Project status | PROJECT.md | in-progress | in-progress | yes |
| Loop status | LOOP-MAP.md | contracted | contracted | yes |
| TASK-001 status/owner/revision | TASK-LEDGER / Contract | integrated / exp010-shared-recovery / 0 | integrated / exp010-shared-recovery / 0 | yes |
| TASK-002 status/owner/revision | TASK-LEDGER / Contract | under-review / exp010-storage-worker / 0 | under-review / exp010-storage-worker / 0 | yes |
| Findings | FINDING-LEDGER | none / no severity | none / no severity | yes |
| Git boundary | observed Git | HEAD 70de2617; ten uncommitted product/test paths plus experiment governance | observed HEAD 70de2617 and exactly ten product/test paths changed or untracked | yes |
| Integration decision | Integration Record | not started | artifact not created | yes |
| Review decision | Task Reviews | TASK-001 approved; TASK-002 pending | REVIEW-TASK-001 approved; TASK-002 review absent | yes |
| Closure decision | Loop Closure | not started | artifact not created | yes |
| Checkpoint next action | CHECKPOINT.md | conduct TASK-002 Review | conduct TASK-002 Review | yes |
| Handoff next action | HANDOFF.md | conduct TASK-002 Review | conduct TASK-002 Review | yes |

Worker Delivery Wave result: all mandatory assertions consistent.

## After Integration

Observed on 2026-07-27 after INTEGRATION-001 passed.

| Assertion | Authority | Expected | Observed | Consistent |
|---|---|---|---|---|
| Project status | PROJECT.md | in-progress | in-progress | yes |
| Loop status | LOOP-MAP.md plus projections | integrated | authority integrated; CHECKPOINT-002 said contracted | no |
| TASK-001 status/owner/revision | TASK-LEDGER / Contract | integrated / exp010-shared-recovery / 0 | integrated / exp010-shared-recovery / 0 | yes |
| TASK-002 status/owner/revision | TASK-LEDGER / Contract | integrated / exp010-storage-worker / 0 | integrated / exp010-storage-worker / 0 | yes |
| Findings | FINDING-LEDGER | none / no severity | none / no severity | yes |
| Git boundary | observed Git plus projections | HEAD 70de2617; ten unified product/test paths plus governance | Git showed ten paths; CHECKPOINT-002 said no product implementation | no |
| Integration decision | Integration Record plus projections | GREEN / integrated | authority GREEN; HANDOFF repeated integration as remaining work | no |
| Review decision | Review Reports | Task Reviews approved; Loop Review pending | two approved Task Reviews; Loop reports absent | yes |
| Closure decision | Loop Closure | not started | artifact not created | yes |
| Checkpoint next action | CHECKPOINT.md | conduct integrated-outcome Reviews | conduct integrated-outcome Reviews | yes |
| Handoff next action | HANDOFF.md | conduct integrated-outcome Reviews only | exact action was current but Remaining Work also repeated Integration | no |

Integration self-check result: four supporting-projection mismatches were missed initially and later registered as LOOP-001-STD-001.

## After Final Review / Before Closure

Observed on 2026-07-28 after the equivalent Standards reverification.

| Assertion | Authority | Expected | Observed | Consistent |
|---|---|---|---|---|
| Project status | PROJECT.md | blocked | blocked | yes |
| Loop status | LOOP-MAP.md | blocked | blocked | yes |
| TASK-001 status/owner/revision | TASK-LEDGER / Contract | integrated / exp010-shared-recovery / 0 | integrated / exp010-shared-recovery / 0 | yes |
| TASK-002 status/owner/revision | TASK-LEDGER / Contract | integrated / exp010-storage-worker / 0 | integrated / exp010-storage-worker / 0 | yes |
| TASK-003-R1 status/owner/revision | TASK-LEDGER / Contract | integrated / /root Integrator / 1 | integrated / /root Integrator / 1 | yes |
| Finding status/severity | FINDING-LEDGER | reopened / major | reopened / major | yes |
| Git boundary | observed Git | HEAD 70de2617; ten product/test paths plus governance | observed HEAD and ten-path product/test boundary | yes |
| Integration decision | INTEGRATION-RECORD | GREEN | GREEN | yes |
| Review decision | Review Reports | Spec/Data/Security/Compatibility pass; Standards fail | observed | yes |
| Closure decision | LOOP-CLOSURE | blocked | blocked | yes |
| Checkpoint next action | CHECKPOINT.md | archival finalization only | archival finalization only | yes |
| Handoff next action | HANDOFF.md | Final Protocol Calibration after archival finalization | observed | yes |

Final-review result: authority and terminal projections are synchronized, but the underlying Major remains reopened. Synchronizing the terminal block is lifecycle recording, not a second correction and not evidence that TASK-003-R1 passed reverification.

## Mismatches and Corrections

- Lifecycle mismatches: 4 Integration-era assertion rows plus 2 same-class reviewer/EII projection classes found at reverification, consolidated in LOOP-001-STD-001.
- Governance correction count: 1/1; TASK-003-R1 integrated and failed reverification.
- Reverification result: reopened; correction budget exhausted and Closure blocked.
- Repeated stale-value pattern: observed in EXP-010 after prior EXP-008/EXP-009 evidence; this is a Repeated Pattern for calibration, not a new Normative Invariant.
- Terminal projections: CHECKPOINT-004, CHECKLIST, HANDOFF, PROJECT, LOOP-MAP, and this evaluation record the blocked result. They do not erase or repair the failed 1/1 correction.
