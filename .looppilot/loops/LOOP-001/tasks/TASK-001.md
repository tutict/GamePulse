---
task_id: TASK-001
parent_goal: PROJECT-EXP-010 fail-closed canonical project-package identity
status: integrated
previous_status: approved
status_changed_by: integrator
assigned_role: worker
assigned_to: exp010-shared-recovery
objective: Define and enforce canonical ProjectSnapshot relational identity at shared encode and decode boundaries.
scope:
  allowed:
    - packages/shared/src/projectPackage.ts
    - packages/shared/src/projectPackage-integrity.test.ts
    - packages/shared/src/projectPackage.test.ts
    - packages/shared/src/projectSnapshotIdentity.ts
    - packages/shared/src/index.ts
    - .looppilot/loops/LOOP-001/deliveries/DELIVERY-TASK-001.md
  forbidden:
    - apps/**
    - packages/shared/test/localStoreContract.js
    - .looppilot/** except the assigned DELIVERY-TASK-001.md
    - docs/**
    - package.json
    - package-lock.json
    - Git metadata, commits, remotes, releases, deployments, and external communication
deliverables:
  - One reusable exported ProjectSnapshot identity assertion.
  - Shared encode, buffered decode, and streamed decode enforcement.
  - Focused tests for mismatched comment/report project identity and dangling label references.
success_criteria:
  - Invalid identity fails with deterministic relation-specific errors at all shared boundaries.
  - Valid v1 snapshots and existing integrity/sanitization behavior remain green.
  - Actual changes stay inside allowed paths.
required_evidence:
  - Genuine focused RED before implementation.
  - Focused GREEN after implementation.
  - Shared build and typecheck evidence.
  - Git diff limited to owned paths.
dependencies:
  - none
research_inputs: []
skill_assignment:
  required: []
  optional: []
  forbidden:
    - installing or inventing additional Skills
  fallback:
    - strategy: Use host base coding and test capabilities within this Contract.
skill_selection:
  considered: []
  selected: []
  verified_available: []
  selected_by: supervisor
checklist_item: ITEM-001
authority:
  read: true
  modify: true
  delete: false
  commit: false
  push: false
  release: false
  deploy: false
  external_communication: false
reviewer: exp010-task-reviewer
integration_owner: /root
revision_count: 0
revision_budget: 1
created: 2026-07-27
updated: 2026-07-27
---

# TASK-001 Shared Snapshot Identity Contract

## Artifact Role

- Purpose: assign one bounded shared-contract implementation outcome.
- Classification: Task responsibility Contract; `TASK-LEDGER.md` alone owns Task status.
- Downstream consumers: Worker Delivery, independent Task Review, TASK-002 interface dependency, and Integration Record.

## Before

- Shared encode/decode accepts a correctly hashed snapshot where a comment or report names another project.
- Labels can reference a comment absent from the snapshot.
- The focused candidate probe observed contradictory comment identity surviving decode.
- Two natural attempts by the original Worker exhausted the failure budget due apply-patch transport; the second left an untracked malformed no-op `projectSnapshotIdentity.ts` and no Delivery. The fallback must inspect and replace it within this Contract.

## After

- A pure exported assertion defines canonical relational identity.
- Encode, buffered decode, and streamed decode reject contradictions before returning bytes/snapshots.
- Valid v1 snapshots remain behaviorally compatible.

## Allowed Reads

- Project/Loop Contracts, candidate evidence, shared domain/contracts, and platform store code for interface understanding.

## Dependencies and Interface

- No Task dependency.
- Required output interface for TASK-002: an exported assertion accepting `ProjectSnapshot` and throwing deterministic errors without mutation.

## Focused RED

Add real failing cases before implementation for:

- comment `projectId` different from `snapshot.project.id`;
- report `projectId` different from the canonical project;
- label `commentId` absent from `snapshot.comments`;
- encode, buffered decode, and streamed decode as applicable.

Do not manufacture a failure unrelated to current behavior.

## Focused GREEN and Verification

- Run only the relevant project-package tests for the TDD cycle.
- Run `npm run build -w @gamepulse/shared`.
- Run `npm run typecheck -w @gamepulse/shared`.
- Report exact commands, counts, failures, and skips.

## Git Boundary

- Starting product HEAD: `70de26178db91e34b97210a3ebecb485ec2fce1e`.
- Existing `.looppilot/**` and EXP-010 docs are Supervisor-owned and must remain untouched.
- The sole exception is creation of the assigned `DELIVERY-TASK-001.md`; it owns evidence, not status.
- No commit or push authority.

## Verifiable Claims

- Each shared boundary rejects the contracted invalid fixtures.
- The exported assertion is available to TASK-002.
- Valid existing package tests remain green.

## Unverified Claims

- Platform persistence, cross-platform round trips, Android-native behavior, full repository regressions, Loop acceptance, and parent completion remain unverified by this Task.

## Worker Submission

- Deliverables produced: shared identity assertion, three codec call sites, shared export, public behavior tests, and DELIVERY-TASK-001.md.
- Evidence observed: genuine encode RED; expanded boundary RED; final focused 2-file/7-test GREEN; shared build and typecheck PASS; owned diff check PASS.
- Risks/blockers: ordinary sandbox apply-patch and Vite temp writes required the recorded elevated fallback; no product blocker remains at submission.
- Reassignment note: original Worker attempts 2/2 and two fallback sessions were unsuccessful; a fresh no-history recovery Worker is the final authorized fallback without changing Task ID or revision count.
- Unfinished items: independent Task Review, integration, platform enforcement, and parent validation.
- Conflict notes: none.
