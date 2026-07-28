# Loop Contract: Canonical Project-Package Identity

## Artifact Role

- Purpose: define the stable LOOP-001 scope, invariants, Task DAG, Reviews, Barriers, budget, and authority.
- Classification: authoritative Contract content; `LOOP-MAP.md` alone owns Loop status.
- Downstream consumers: Task Contracts, Worker Deliveries, Task Reviews, Integration Record, Loop Reviews, and Closure.

## Identity

- Loop ID: LOOP-001
- Contract Status: approved
- Loop status source: `.looppilot/LOOP-MAP.md`
- Title: Canonical project-package identity
- Parent Project: PROJECT-EXP-010
- Supervisor: `/root`
- Integrator: `/root`
- Created: 2026-07-27
- Updated: 2026-07-27

## Objective

Ensure that shared `.gamepulse` encode/decode and every direct LocalStore import enforce one canonical ProjectSnapshot identity, reject contradictions before mutation, and preserve valid cross-platform logical identity.

## User and System Outcomes

- Users can exchange valid v1 project packages between desktop and mobile without record misattribution.
- Crafted but correctly hashed contradictory packages fail closed.
- Direct store callers cannot bypass the same identity invariant.
- Existing valid package, duplicate-import, and transaction behavior remains intact.

## Included Changes

- Shared ProjectSnapshot identity assertion and encode/buffered/streamed decode enforcement.
- Comment project, report project, and label-to-comment reference validation.
- Desktop, mobile SQLite, and mobile memory LocalStore direct-import enforcement.
- Deterministic unit, adapter contract, and integrated bidirectional verification.

## Excluded Changes

- Overwrite/merge semantics, update counts, ZIP extra-entry hardening, package versioning/migration, secret URL policy, ResearchRecord packaging, UI, dependencies, release, or deployment.

## Grouping Rationale

The shared producer/consumer contract and durable store contract are cohesive because one accepted package identity must survive both boundaries. Each Task is independently useful, yet neither can prove the cross-device outcome alone. One Loop provides the correct acceptance, commit, and recovery boundary.

## Mode Decision Context

- Candidate mode: Full Loop
- Why Full Loop: two implementation owners, SQLite/partial-mutation risk, explicit dependency, specialist review, and correctness only provable after integration.
- Rejected Lightweight rationale: one owner plus review would leave either package or direct-store entry unprotected and would not independently verify the combined outcome.
- Expected protocol cost: two Tasks, two Deliveries, two Task Reviews, one Integration Record, bounded Loop Reviews, and one Closure.
- Product Risk: medium-high.
- Coordination Necessity: high.
- Supervisor decision and Integrator record: `docs/experiments/looppilot-exp-010/MODE-SELECTION.md`.
- Active specialist Reviewers: Data, Compatibility, and Security at integrated boundary.
- Recovery implications: root Checkpoint tracks the one active Task and uncommitted branch boundary.

## Coordination Necessity

- Work ownership boundaries: TASK-001 shared package contract; TASK-002 platform storage adapters.
- Independent Delivery value: shared package validity and direct LocalStore safety are separately testable public boundaries.
- Integration dependency: TASK-002 consumes the reviewed TASK-001 assertion.
- Dedicated Integration Record required: yes.
- Active recovery required: yes, one root Checkpoint.
- Formal Rework likely: no; created only for an observed Finding.
- Fallback Worker: Supervisor selects only after two natural unsuccessful attempts or a material strategy change.
- Worker failure budget: 2.
- Ownership-collapse condition: only after budget evidence shows separate ownership no longer yields value or is blocked.

## Engineering Context References

- Project context: `.looppilot/PROJECT.md`
- Candidate evidence: `docs/experiments/looppilot-exp-010/CANDIDATE-AUDIT.md`
- Verification surface: `docs/experiments/looppilot-exp-010/BASELINE-AND-VERIFICATION-SURFACE.md`
- External research/ADR: none required.

## Business Rules and Invariants

1. Canonical project identity is `snapshot.project.id`.
2. Every comment/report project ID equals the canonical ID.
3. Every label references a comment included in the same snapshot.
4. Shared encode and both decode modes reject invalid identity.
5. Every LocalStore rejects invalid direct input before transaction mutation.
6. Valid v1 packages and duplicate imports retain existing behavior.
7. Integrated desktop/mobile round trips preserve the same logical identity.

## Engineering Concern Matrix

| Concern | Impact | Required Work | Reviewer |
|---|---|---|---|
| Data | Cross-project or dangling durable records | Pre-transaction assertion and zero-mutation tests | Data |
| Security | Crafted internally consistent import | Deterministic fail-closed errors | Security |
| Version Evolution | Tightened v1 acceptance | Valid v1 regression, no migration invention | Compatibility |
| Team Collaboration | Shared interface precedes adapters | Explicit DAG and disjoint write ownership | Standards |
| Operations | No production execution | Disclose native/CI limits | Standards |

## Architecture Profile

- OOP: existing codec/store classes only.
- Dependency Injection: existing adapter/test seams only.
- Domain Modeling: one pure snapshot identity assertion.
- Frontend Architecture: unchanged.
- Performance Strategy: linear validation; no benchmark or zero-copy claim.
- Rejected Patterns: DDD framework, DI container, MVVM, migration framework, UI changes.

## Task DAG

| Task ID | Outcome | Depends On | Contract |
|---|---|---|---|
| TASK-001 | Shared identity contract rejects contradictory snapshots | none | `tasks/TASK-001.md` |
| TASK-002 | Every LocalStore enforces the reviewed contract and the pre-registered cross-owner test is prepared | TASK-001 approved interface | `tasks/TASK-002.md` |

## Worker Plan

- Worker 1 completes TASK-001 and submits evidence; an independent Task Reviewer performs both axes.
- After TASK-001 is approved and recorded, Worker 2 completes TASK-002 against that interface.
- Workers do not edit governance, Ledgers, other-owner files, commits, or remotes.
- Integrator records reviewed lifecycle transitions and runs combined verification without writing product fixes.

## Reviewer Matrix

### Mandatory Axes

- Task-level Spec and Standards Review for each Delivery.
- Loop-level independent Spec and Standards Review of the integrated boundary.

### Conditional Reviewers

- Data: transaction ordering, foreign-key identity, zero mutation.
- Compatibility: valid v1 behavior and cross-platform contract parity.
- Security: crafted package and direct-import fail-closed behavior.

## Integration Strategy

- Branch/worktree: `experiment/looppilot-gamepulse-exp-010` / `C:\tmp\GamePulse-exp-010`.
- Merge order: TASK-001 reviewed output, then TASK-002 reviewed output, then integration tests.
- File ownership: exact Task Contracts; no overlapping Worker write path.
- Conflict ownership: Supervisor for semantic conflicts; Integrator for mechanical verification only.
- Shared interface: exported identity assertion from TASK-001.
- Cross-owner test owner: TASK-002 prepares `projectPackageCrossPlatform.test.ts`; the Integrator independently re-runs it after both Deliveries are reviewed.
- Integration owner: `/root`.

## Acceptance Criteria

### Functional Acceptance

- [ ] Invalid comments, reports, and dangling labels fail at shared and direct-store boundaries.
- [ ] Invalid inputs cause zero durable mutation.
- [ ] Valid desktop/mobile package round trips preserve canonical logical identity.

### Engineering Acceptance

- [ ] Both mandatory Tasks are independently approved and integrated.
- [ ] Focused integration, default tests, typecheck, build, and diff checks pass.
- [ ] Data, Compatibility, Security, Spec, and Standards review requirements pass.

### Delivery Acceptance

- [ ] Evidence, lifecycle, Findings, limits, commit/push, and workspace state are recorded honestly.
- [ ] No excluded action or authority expansion occurs.

## Barriers

### Contract Barrier

- [x] Real gap and focused RED observed.
- [x] Full Loop mode selected before product work.
- [x] Project/Loop scope, invariants, DAG, owner paths, Reviews, budgets, and authority approved.

### Implementation Barrier

- [ ] Both Task Deliveries exist and pass Task-level readiness.

### Integration Barrier

- [ ] Reviewed Deliveries coexist and executable cross-owner invariant passes.

### Review Barrier

- [ ] Integrated outcome passes mandatory and selected specialist Reviews.

### Closure Barrier

- [ ] Three-layer acceptance, Findings disposition, commit, Checkpoint, and workspace evidence are complete.

## Lifecycle-Value Assertion: Contract Barrier

| Value | Authority | Contract-time value |
|---|---|---|
| Project status | `.looppilot/PROJECT.md` | in-progress |
| Loop status | `.looppilot/LOOP-MAP.md` | contracted |
| TASK-001 / TASK-002 | `TASK-LEDGER.md` | assigned / proposed |
| Finding state | `FINDING-LEDGER.md` | no findings |
| Review / Closure | detailed artifacts | not started / not started |
| Git boundary | observed Git | HEAD `70de2617`, experiment/governance changes only |

Assertion result: consistent at Contract Barrier.

## Budget

- Context budget: bounded, normal pressure.
- Revision budget: 1 per Task/Rework.
- Maximum active Workers: 1 at a time; 2 distinct Workers total.
- Maximum concurrent conflict groups: 0.
- Stop conditions: scope drift, policy ambiguity, major/blocker, missing independent review, two natural unsuccessful attempts, exhausted revision budget, or unverifiable zero mutation.
- Budget-stop persistence: update authorities and one exact Checkpoint Resume Point, then stop.

## Authority

- Modify: yes, Task-contracted paths only.
- Delete: no.
- Commit required/authorized: yes/yes, Integrator only on experiment branch.
- Push authorized: yes, Integrator only on experiment branch.
- Release/deploy authorized: no/no.

## Risks and Open Decisions

- No open product-policy decision. Existing-project overwrite behavior is explicitly preserved and excluded.
