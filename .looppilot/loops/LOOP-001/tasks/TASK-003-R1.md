# TASK-003-R1 Governance Rework

## Identity

- Rework Task ID: TASK-003-R1
- Parent Task: LOOP-001 recovery projection correction
- Loop ID: LOOP-001
- Assigned Worker: /root as Integrator
- Status: integrated, awaiting Finding reverification
- Revision: 1
- Revision Budget: 1
- Created: 2026-07-27
- Created by: /root as Supervisor

## Originating Findings

- LOOP-001-STD-001, Major standards/recovery lifecycle drift.

## Required Outcome

Reconcile current recovery and supporting projections with integrated authorities and record the mismatch honestly.

## Allowed Scope

- .looppilot/CHECKPOINT.md
- .looppilot/CHECKLIST.md
- .looppilot/HANDOFF.md
- docs/experiments/looppilot-exp-010/LIFECYCLE-CONSISTENCY.md
- .looppilot/loops/LOOP-001/deliveries/DELIVERY-TASK-003-R1.md

## Forbidden Scope

- Product and test code, Integration Record facts, original Reviewer judgment, Finding severity, Scope, risk acceptance, commit, push, release, and deploy.

## Required Changes

- Replace stale product, Loop, barrier, owner, Review, Finding, context, and evidence-revalidation values.
- Remove duplicate completed actions from Checklist and Handoff.
- Record the observed mismatches and one governance correction.

## Required Verification

- Targeted stale-value scan.
- Direct comparison with PROJECT, LOOP-MAP, TASK-LEDGER, FINDING-LEDGER, INTEGRATION-RECORD, and current Git.

## Reviewer Reverification

- Required Reviewer: exp010-loop-spec-standards.
- Verification method: independent read-only comparison.
- Evidence required: no same-class stale value and preserved original Review.
- Authorized equivalent: exp010-standards-reverify-equivalent.
- Substitute Reviewer reason: original Reviewer reverification turn failed with model-service HTTP 503 before judgment.

## Strategy Change

- Previous approach: update only next-action fields at each barrier.
- Why it failed: older recovery fields outside the small assertion rows remained stale.
- New approach: compare the full recovery artifact and every relevant projection against each authority.
- Material change: full value reconciliation instead of Resume Point-only maintenance.

## Authority

- Modify: yes, allowed governance scope only.
- Delete: no.
- Commit: no.
- Push: no.
- Release: no.
- Deploy: no.

## Completion Boundary

Integrated Rework does not close the Finding or Loop; original Reviewer reverification remains mandatory.
