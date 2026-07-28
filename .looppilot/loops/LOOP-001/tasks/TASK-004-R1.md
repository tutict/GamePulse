# TASK-004-R1 Evidence Accounting Rework

## Artifact Role

- Purpose: authorize one bounded correction of CLOSURE-FACT-001.
- Classification: Task responsibility Contract; TASK-LEDGER alone owns Task status.
- Downstream consumers: Rework Delivery, original Reviewer reverification, Finding disposition, Closure, and Results.

## Identity

- Rework Task ID: TASK-004-R1
- Loop ID: LOOP-001
- Finding: CLOSURE-FACT-001
- Assigned Worker: `/root` as evidence Integrator
- Status: integrated, awaiting reverification
- Revision: 1
- Revision Budget: 1
- Created: 2026-07-28
- Reviewer: `/root/exp010_closure_factual`

## Objective

Correct the single independently observed evaluation byte total without altering any product, lifecycle, Review, or blocked-Closure fact.

## Before

- RESULTS item 59 records 48,113 evaluation bytes.
- Independent recount records 48,178 bytes.

## After

- RESULTS item 59 records 48,178 review-input evaluation bytes.
- Scorecard artifact-accounting score remains defensible only if the corrected count is present.

## Owned Paths

- docs/experiments/looppilot-exp-010/RESULTS.md
- docs/experiments/looppilot-exp-010/EVALUATION-SCORECARD.md only if score changes
- .looppilot/loops/LOOP-001/deliveries/DELIVERY-TASK-004-R1.md

## Allowed Reads

- Factual Review, Finding detail, current evaluation files, and Git status.

## Forbidden Writes

- Product/tests, other governance, authorities, Review judgment, Scope, severity, Integration, commit, push, release, and deploy.

## Dependencies

- CLOSURE-FACT-001 triaged by Supervisor for one closure/evidence correction.

## Deliverables

- Exact Results byte correction and a concise evidence Delivery.

## Focused RED

- Independent factual Review observed 48,113 != 48,178.

## Focused GREEN

- Recount returns 48,178 and RESULTS contains 48,178.

## Verification

- Mechanical seven-file line/byte recount.
- Targeted diff limited to Results plus assigned Delivery; scorecard unchanged if its score remains supported.

## Git Boundary

- Pre-commit HEAD 70de26178db91e34b97210a3ebecb485ec2fce1e; index empty.

## Verifiable Claims

- The review-input evaluation byte total is corrected exactly.

## Unverified Claims

- Final governance counts after Review report output, commits, push, native/CI/release/deploy.

## Authority

- Modify: owned paths only.
- Delete, commit, push, release, deploy: no.
