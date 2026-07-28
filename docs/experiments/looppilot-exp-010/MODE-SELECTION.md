# EXP-010 Mode Selection

## Artifact Role

- Purpose: record the Supervisor's pre-implementation mode decision and the Integrator's projection.
- Classification: supporting decision record; it owns neither Project nor Loop status.
- Downstream consumers: Project context, Loop Contract, Task Contracts, Reviewer scope, and final experiment evaluation.

## Decision

- Candidate: fail-closed canonical relational identity across the shared `.gamepulse` contract and direct LocalStore imports.
- Mode: Full Loop.
- Decision by Supervisor: `/root` on 2026-07-27.
- Recorded by Integrator: `/root` on 2026-07-27.
- Evidence: [Candidate Audit](CANDIDATE-AUDIT.md) focused probe observed shared acceptance of contradictory identity and different desktop/mobile persisted ownership.

## Product Risk

Product Risk is medium-high:

- `.gamepulse` is an untrusted import boundary.
- A correctly hashed package can violate relational identity without detection.
- Desktop and mobile SQLite implementations currently assign imported comment ownership differently.
- The gap can cause failed import, cross-project persistence, evidence misattribution, or an apparently successful but semantically different round trip.
- Normal file paths decode before mutation, but direct public LocalStore imports bypass the codec boundary.

Required depth: deterministic adversarial fixtures, temporary SQLite stores, zero-mutation checks, reverse round-trip checks, full default tests, typecheck, build, and independent Data, Compatibility, and import-boundary Security contributions in addition to mandatory Spec and Standards axes.

## Coordination Necessity

Coordination Necessity is high:

- Shared owner: defines and verifies canonical ProjectSnapshot relational identity at encode/decode boundaries.
- Storage owner: enforces the same contract at desktop, mobile SQLite, and memory LocalStore direct-import boundaries.
- Each Delivery is independently useful: the shared Delivery protects package producers/consumers; the storage Delivery protects direct contract callers and transaction boundaries.
- The storage task depends on the shared assertion interface, so implementation order is explicit rather than artificially parallel.
- A dedicated Integration Record must prove that both deliveries coexist and that invalid identity is rejected before mutation on both platforms.

## Full Loop Questions

1. One Worker is insufficient because package acceptance and durable adapter semantics have different direct entry points, test seams, and failure modes; accepting only one leaves the other boundary unsafe.
2. Worker 1 owns `packages/shared/**` package/snapshot identity code. Worker 2 owns LocalStore adapter enforcement in `apps/desktop/**`, `apps/mobile/**`, plus the shared adapter contract fixture explicitly assigned to that task.
3. Worker 1 can prove encode, buffered decode, and streamed decode rejection. Worker 2 can prove direct LocalStore rejection and unchanged durable state per adapter.
4. Only the Integrator can prove the pre-registered end-to-end invariant: one correctly hashed contradictory package is rejected identically before mutation by desktop and mobile paths, while valid desktop/mobile round trips preserve canonical identity.
5. Lightweight plus specialist review is insufficient because the change has two implementation owners, a real dependency edge, SQLite transaction/foreign-key risk, and correctness that exists only at the integrated boundary.

## Architecture and Research

- External research is not required; current repository contracts and executable fixtures determine behavior.
- No additional Skill is required; Workers use base coding and test capabilities.
- Domain modeling is limited to explicit ProjectSnapshot identity invariants.
- A pure assertion helper plus existing adapter injection seams is preferred.
- Rejected: new migration framework, schema version, DI framework, DDD aggregate layer, MVVM changes, zero-copy work, UI changes, or overwrite-policy invention.

## Cost and Escalation

- Planned Workers: 2; maximum 2 unless a real unresolved owner boundary is observed.
- Per-Task revision budget: 1.
- Worker failure budget: 2 unsuccessful attempts before fallback, ownership collapse, or block is considered.
- Expected governance: one Project, one Loop Map, one Checkpoint, one Handoff, one Checklist, one Delegation summary, one Loop Contract, two Ledgers, two Task Contracts, one Delivery per Task, one Task Review per Task, one Integration Record, only necessary Loop Reviews, and one Closure.
- Rework/Finding artifacts are created only for naturally observed Findings.
- Stop or replan on scope drift, contradictory product policy, inability to prove zero mutation, major/blocker Finding, exhausted revision budget, or loss of independent review.
