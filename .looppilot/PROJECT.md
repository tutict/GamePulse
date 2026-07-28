# EXP-010 Project Engineering Context

Status: blocked
Project ID: PROJECT-EXP-010
Updated: 2026-07-28
Supervisor: `/root`
Integrator: `/root`

## Artifact Role

- Purpose: own Project scope, engineering context, acceptance criteria, and Project status.
- Classification: authoritative for Project scope and status.
- Downstream consumers: Loop Map, Loop Contract, Task Contracts, Reviews, Closure, Checkpoint, and final experiment report.

## Problem

A correctly hashed v1 `.gamepulse` package can contain records whose relational project identity contradicts the enclosing project. Shared decode accepts it; desktop and mobile LocalStore adapters then persist different ownership. Cross-device exchange can therefore fail, cross-write, or appear successful with divergent logical data.

## Users and Actors

- User: explicitly exports and imports a GamePulse project between desktop and Android.
- Shared codec: produces and validates ProjectSnapshot package bytes.
- Desktop LocalStore: persists imported snapshots in better-sqlite3.
- Mobile LocalStore: persists imported snapshots through the Capacitor SQLite contract.
- Supervisor, Workers, Reviewers, and Integrator: execute and judge this bounded experiment.

## Core Use Cases

1. Export and import a valid project package without changing canonical record identity.
2. Reject a correctly hashed package whose comments, labels, or reports contradict the enclosing project identity.
3. Reject an invalid direct LocalStore snapshot before any project, comment, label, or report mutation.
4. Re-export a valid imported project on the other platform with stable logical identity.

## Included Scope

- Explicit relational identity validation for ProjectSnapshot project, comments, labels, and reports.
- Shared encode, buffered decode, and streamed decode enforcement.
- Desktop, mobile SQLite, and memory LocalStore direct-import enforcement.
- Deterministic focused, adapter-contract, integration, default-test, typecheck, and build verification.

## Excluded Scope

- Existing-project overwrite policy or merge-count redesign.
- New package version, migration system, ZIP implementation, or archive membership hardening beyond identity.
- Broader secret/URL sanitization policy.
- ResearchRecord packaging, UI, release, deployment, PR, tag, main merge, or production data.

## Domain Model

### Entities and Value Objects

- ProjectSnapshot: one enclosing Project plus comments, labels, and reports.
- Canonical Project Identity: `snapshot.project.id`.
- Comment identity: each comment belongs to the canonical project.
- Label reference: each label references a comment included in the same snapshot.
- Report identity: each report belongs to the canonical project.

### Business Invariants

- Every accepted snapshot has one canonical project ID.
- Every comment `projectId` and report `projectId` equals that canonical ID.
- Every label `commentId` refers to a comment present in the snapshot.
- Invalid identity is rejected before LocalStore mutation.
- Desktop and mobile imports interpret the same valid or invalid snapshot identically.
- Valid logical identity survives desktop-to-mobile and mobile-to-desktop package round trips.

## Data

- Sources: user-selected `.gamepulse` bytes or a direct ProjectSnapshot contract call.
- Ownership: shared codec owns package validity; each LocalStore owns durable adapter enforcement.
- Lifecycle: encode -> decode -> transaction -> export/re-export.
- Consistency: fail closed before mutation; valid writes use the existing transaction boundaries.
- Retention: unchanged.
- Migration: not required and excluded.

## Concurrency and Transactions

- Shared resources: per-client SQLite database and imported project ID.
- Race conditions: no new concurrency model; existing transactions remain authoritative.
- Idempotency: existing duplicate import behavior is preserved.
- Ordering: shared contract Delivery precedes storage Delivery; integration follows both Task Reviews.
- Locking: no new locking or optimistic concurrency.

## Identity and Permissions

- The identity concern is package relational ownership, not user authentication.
- File selection and existing trusted IPC checks remain unchanged.
- Workers may modify only contracted paths; no Worker may commit, push, delete, release, deploy, or contact external systems.

## Security

- Trust boundary: a user-selected package is untrusted structured input even when its manifest hashes are internally consistent.
- Sensitive data: existing sanitization behavior is preserved but not broadened.
- Input risks: cross-project references, dangling labels, and contradictory report ownership.
- Secret handling: no credentials or secrets are introduced.
- Abuse case: a crafted package assigns a comment to another existing local project.

## Observability

- Validation failures must produce deterministic errors identifying the contradictory relation.
- No new logs, metrics, traces, alerts, or telemetry are required.

## Delivery and Operations

- Deployment, release, gray release, and data migration are not required or authorized.
- Rollback is ordinary experiment-branch code reversion; no durable production data is touched.
- Native Android device behavior and remote CI remain explicit verification limits unless later observed.

## Evolution

- Package version remains 1.
- The change tightens acceptance of structurally contradictory v1 data; it does not add a compatibility migration.
- Existing valid v1 packages must remain accepted.

## Team Boundaries

- Shared Worker: package/snapshot identity contract under `packages/shared/**`.
- Storage Worker: direct adapter enforcement under specified desktop/mobile paths and the assigned LocalStore contract fixture.
- Task Reviewer: independent Spec and Standards readiness decision for each Delivery.
- Loop Reviewers: independent integrated-boundary Spec, Standards, Data, Compatibility, and Security judgment.
- Integrator: `/root`; records state and verifies integration but does not write Worker product fixes.
- Release responsibility: not applicable; no release authority exists.

## Architecture Profile

- Domain modeling: one pure, explicit snapshot identity assertion.
- Backend architecture: existing codec and LocalStore boundaries.
- Frontend architecture: unchanged.
- Dependency injection: existing codec/store test seams only; no framework.
- Performance strategy: no zero-copy or benchmark claim; validation is linear in snapshot records.
- Explicitly rejected: DDD aggregate framework, MVVM, migration framework, schema redesign, and UI work.

## Engineering Concern Matrix

| Concern | Impact | Required Work | Reviewer |
|---|---|---|---|
| Users | Cross-device data may be misattributed | Preserve valid round trips; reject invalid identity | Spec |
| Business Rules | One package must have one project identity | Shared assertion and integration invariant | Spec |
| Data | SQLite cross-project/partial mutation risk | Pre-transaction adapter enforcement and zero-mutation tests | Data |
| Concurrency | Existing transaction boundaries | No new mechanism; verify rejection precedes mutation | Data |
| Permissions | Untrusted file import | Preserve trusted IPC/file selection; no authority expansion | Standards |
| Security | Crafted internally consistent package | Fail closed on contradictory relations | Security |
| Rollback | Experiment branch only | Revert commits if needed; no production migration | Standards |
| Version Evolution | Tightened v1 validation | Valid v1 regression and compatibility review | Compatibility |
| Team Collaboration | Two owner boundaries and one dependency | Scoped Tasks, dual-axis Review, Integration Record | Standards |

## Project Acceptance Criteria

### Project Functional Acceptance

- Invalid relational identity is rejected by shared encode/decode and every direct LocalStore import before mutation.
- Valid packages preserve canonical project/comment/label/report identity in both cross-platform round-trip directions.

### Project Engineering Acceptance

- Both mandatory Task Deliveries pass independent Spec and Standards review.
- The integrated focused suite, default tests, typecheck, build, and diff checks pass.
- Data, Compatibility, and Security risks are independently reviewed; no unresolved blocker remains.

### Project Delivery Acceptance

- Required governance accurately records lifecycle, evidence, Findings, limitations, commit, push, and workspace state.
- The experiment branch is committed and pushed only after Closure evidence; no PR, merge, tag, release, or deploy occurs.

## Baseline Evidence

- Repository Baseline: `docs/experiments/looppilot-exp-010/BASELINE-AND-VERIFICATION-SURFACE.md`
- Environment-Corrected Baseline: default tests 33/33 files, 83/83 tests after local Electron cache correction.
- Scope-Focused Baseline: temporary probe 1 file, 2 genuine RED assertions.
- Pre-existing failures: none after environment correction.
- Environment incidents: EII-001 and EII-002 in baseline evidence; neither is a Product Finding.

## Mode Selection

- Mode: Full Loop
- Product Risk: medium-high data, transaction, compatibility, and import-boundary security risk.
- Coordination Necessity: high; two independent owners and cross-owner integration proof.
- Decision: `docs/experiments/looppilot-exp-010/MODE-SELECTION.md`
- Artifact guardrail: create only artifacts consumed by Task readiness, integration, Review, Closure, recovery, or experiment evaluation.

## Delivery Mode

- Commit required: yes.
- Commit authorized: yes, experiment branch only.
- Push authorized: yes, experiment branch only.
- Release required/authorized: no/no.
- Deployment required/authorized: no/no.

## Full Loop Relationships

- Project Identifier: PROJECT-EXP-010
- Loop Map: `.looppilot/LOOP-MAP.md`
- Mandatory Loop: LOOP-001
- Current authoritative files: `PROJECT.md`, `LOOP-MAP.md`, LOOP-001 `TASK-LEDGER.md`, LOOP-001 `FINDING-LEDGER.md`, and root `CHECKPOINT.md`.
- Project Closure: blocked because LOOP-001-STD-001 was reopened after the sole 1/1 governance correction.

## Terminal Project Decision

- Decision: `BLOCKED-WITH-VERIFIED-PARTIAL-DELIVERY`.
- Product boundary: integrated and freshly verified; default tests, typecheck, and build pass.
- Protocol boundary: not accepted; independent equivalent Standards reverification found same-class lifecycle drift after the only allowed correction.
- Next stage: Final Protocol Calibration, not another large implementation experiment or another EXP-010 correction.

## Project Status Authority

`.looppilot/PROJECT.md` is the only authority for Project status.
