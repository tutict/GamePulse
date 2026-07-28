---
task_id: TASK-002
parent_goal: PROJECT-EXP-010 fail-closed canonical project-package identity
status: integrated
previous_status: approved
status_changed_by: integrator
assigned_role: worker
assigned_to: exp010-storage-worker
objective: Enforce the reviewed shared identity assertion at every direct LocalStore import before mutation.
scope:
  allowed:
    - apps/desktop/src/main/sqliteStore.ts
    - apps/desktop/src/main/projectPackageStore.test.ts
    - apps/desktop/src/main/projectPackageCrossPlatform.test.ts
    - apps/desktop/src/main/localStore.contract.test.ts
    - apps/mobile/src/storage/capacitorSqliteStore.ts
    - apps/mobile/src/storage/memoryLocalStore.ts
    - apps/mobile/src/storage/localStore.contract.test.ts
    - apps/mobile/src/storage/memoryLocalStore.test.ts
    - packages/shared/test/localStoreContract.js
    - .looppilot/loops/LOOP-001/deliveries/DELIVERY-TASK-002.md
  forbidden:
    - packages/shared/src/**
    - .looppilot/** except the assigned DELIVERY-TASK-002.md
    - docs/**
    - package.json
    - package-lock.json
    - Git metadata, commits, remotes, releases, deployments, and external communication
deliverables:
  - Desktop, mobile SQLite, and memory LocalStore imports validate identity before mutation.
  - Shared adapter-contract fixtures prove rejection and zero mutation.
  - Focused memory-store coverage if not exercised by the shared adapter contract.
  - One deterministic cross-owner test fixture for valid bidirectional logical identity and correctly hashed contradictory-package rejection; Integrator owns final evaluation.
success_criteria:
  - Every direct LocalStore import rejects the contracted invalid snapshot before any project or child record changes.
  - Valid and duplicate imports retain existing behavior.
  - The pre-registered cross-owner test is executable without network, LLM, Android device, or real user data.
  - Actual changes stay inside allowed paths.
required_evidence:
  - Genuine focused RED against adapters after TASK-001 interface availability.
  - Focused GREEN for desktop, mobile SQLite, and memory stores.
  - Relevant typecheck evidence and owned-path diff.
  - Focused execution of the prepared cross-owner test, without claiming the Integration Barrier.
dependencies:
  - TASK-001 approved exported assertion
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
checklist_item: ITEM-002
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

# TASK-002 LocalStore Identity Enforcement

## Artifact Role

- Purpose: assign one bounded storage-contract outcome after TASK-001 readiness.
- Classification: Task responsibility Contract; `TASK-LEDGER.md` alone owns Task status.
- Downstream consumers: Worker Delivery, independent Task Review, Integration Record, and cross-owner tests.

## Before

- Desktop direct import trusts `CommentRecord.projectId`; mobile SQLite substitutes the enclosing project ID; memory store preserves the supplied record.
- Direct LocalStore callers bypass shared codec validation.
- Invalid input can therefore fail, cross-write, or persist different identity depending on adapter.

## After

- Every LocalStore import invokes the reviewed shared assertion before transaction or in-memory mutation.
- Invalid snapshots leave project and child-record state unchanged.
- Existing valid/duplicate import behavior remains unchanged.

## Allowed Reads

- TASK-001 approved Delivery/interface, Project/Loop Contracts, store implementations, tests, and shared types.

## Dependencies and Dispatch Rule

- Do not start implementation before TASK-001 is independently approved and the exported assertion is observed.
- The Worker may consume but must not modify `packages/shared/src/**`.

## Focused RED

Using the approved assertion interface, add real adapter-contract cases showing current direct imports accept or mutate on:

- mismatched comment project identity;
- mismatched report project identity;
- dangling label reference.

Assert zero mutation after rejection. Do not alter the fixture to create an unrelated failure.

## Focused GREEN and Verification

- Run desktop LocalStore contract tests.
- Run Android Capacitor SQLite LocalStore contract tests through the deterministic better-sqlite driver.
- Run memory LocalStore focused tests.
- Prepare and run the deterministic cross-owner test, while explicitly leaving final Integration judgment to the Integrator.
- Run desktop and mobile typechecks.
- Report exact commands, counts, failures, skips, and environment limits.

## Git Boundary

- TASK-001 reviewed shared files are read-only inputs.
- Existing governance/experiment docs are Supervisor-owned and must remain untouched.
- The sole exception is creation of the assigned `DELIVERY-TASK-002.md`; it owns evidence, not status.
- No commit or push authority.

## Verifiable Claims

- Each direct adapter rejects before mutation.
- Valid and duplicate imports retain current contract behavior.
- All writes stay within the allowed path list.

## Unverified Claims

- Package encode/decode correctness is TASK-001 evidence.
- Worker self-report does not satisfy combined Integration even when the prepared cross-owner test passes; the Integrator must re-run the reviewed boundary. Android device behavior, full regressions, Loop acceptance, and parent completion also remain unverified.

## Worker Submission

- Deliverables produced: pre-mutation enforcement in three adapters, shared contract identity/zero-mutation cases, memory contract runner, deterministic cross-owner fixture, and DELIVERY-TASK-002.md.
- Evidence observed: genuine desktop tracer RED; 3-file/12-test adapter GREEN; 1-file/4-test cross-owner GREEN; final 5-file/17-test focused GREEN; desktop and mobile typecheck PASS; owned diff check PASS.
- Risks/blockers: apply-patch required the recorded scoped approval; no product blocker remains at submission.
- Unfinished items: independent Task Review, combined Integration, full verification, Loop Review, and parent acceptance.
- Conflict notes: none.
