# LoopPilot Phase 10 / EXP-010 Results

## Outcome

- Final product result: BLOCKED-WITH-VERIFIED-PARTIAL-DELIVERY.
- Final experiment closure: blocked.
- FINAL FULL LOOP BEHAVIORAL ACCEPTANCE: FAIL.
- Release-gate interpretation: READY FOR FINAL PROTOCOL CALIBRATION.
- Large-scale protocol experimentation stop decision: yes, evidence is sufficient to stop.
- Another large experiment: not justified; do not create EXP-011.

Functional product work passed. Full Loop acceptance failed because the sole bounded lifecycle correction did not remove all same-class stale values and independent Standards reverification reopened the Major Finding.

## Repository and Baselines

1. GamePulse base SHA: 70de26178db91e34b97210a3ebecb485ec2fce1e.
2. LoopPilot frozen SHA: 2275e747e73936ebb8f0b24e5fb901a619b6adf8.
3. Experiment branch: experiment/looppilot-gamepulse-exp-010.
4. Original workspace protection: original GamePulse main remained untouched and clean; all changes occurred in C:\tmp\GamePulse-exp-010.
5. Repository Baseline: npm install passed from lockfile; corrected baseline tests passed 33/33 files and 83/83 tests; baseline typecheck/build passed.
6. Environment-Corrected Baseline: local Electron runtime files were copied only into ignored node_modules after sandboxed download failure; no tracked dependency changed.
7. Verification Surface: root test discovery, workspace typecheck, Electron desktop build, mobile web build, shared/package/store tests observed; Android native/device, installer, remote CI, production services, release, and deploy unverified.

## Candidate Audit and Mode

8. Candidate A: selected. Correctly hashed contradictory project identity was accepted and persisted differently by desktop/mobile paths.
9. Candidate B: rejected. Shared sanitizer is one implementation owner and broader URL policy lacked sufficient contract evidence.
10. Candidate C: rejected. ResearchRecord/evidence-history packaging would broaden scope; the narrower identity issue belonged to Candidate A.
11. Candidate D: rejected. No historical migration contract existed; inventing one would be speculative and primarily one shared owner.
12. Selected candidate: fail-closed canonical ProjectSnapshot relational identity.
13. Rejected candidate reasons: decorative splitting, unsupported policy, or speculative migration.
14. Product Risk: medium-high data, compatibility, transaction, and import-boundary security risk.
15. Coordination Necessity: high; shared codec and direct LocalStore entry points have independent obligations.
16. Why Full Loop: two real owner boundaries plus a cross-platform invariant no Worker could prove alone.
17. Why Lightweight was insufficient: reviewed shared validation alone leaves direct stores unsafe; store validation alone leaves package consumers unsafe.

## Loop and Deliveries

18. Loop objective: reject contradictory comment/report project identity and dangling labels before package return or store mutation while preserving valid v1 round trips.
19. Before state: shared decode accepted contradictions; desktop trusted comment projectId while mobile rebound it.
20. After state: one shared assertion is enforced by encode, buffered/streamed decode, and all three LocalStore imports.
21. Worker count: 2 logical implementation owners; 6 assignment sessions across 4 Agent identities due natural infrastructure failures.
22. Worker ownership: TASK-001 shared codec/assertion; TASK-002 desktop/mobile/memory stores and assigned adapter/integration fixtures.
23. Task DAG: TASK-001 approved interface precedes TASK-002; Integration follows both independent Task Reviews.
24. Worker attempts: 6 assignment sessions.
25. Valid Deliveries: 2 implementation Deliveries, plus 1 governance Rework Delivery.
26. Unsuccessful attempts: 4, all before valid TASK-001 delivery.
27. Zero-output attempts: 3.
28. Worker Failure Budget: exercised naturally; original TASK-001 Worker reached 2/2 before fallback.
29. Ownership Collapse: NOT EXERCISED.
30. EII: 9 coalesced incidents; none invalidated a valid Delivery.

## Product and Verification

31. Product changes: shared identity assertion, codec enforcement, and pre-mutation desktop/mobile/memory store enforcement.
32. Test changes: shared codec boundary cases, LocalStore zero-mutation contracts, memory runner, and bidirectional cross-owner package fixture.
33. Worker focused tests: TASK-001 final 2 files/7 tests; TASK-002 final 5 files/17 tests.
34. Integration invariant: accepted logical identity remains canonical in both directions; correctly re-hashed contradictions are rejected identically before destination mutation.
35. Integration test: combined 7 files/24 tests passed during INTEGRATION-001.
36. Integration decision: GREEN.
37. Spec Review: pass.
38. Standards Review: fail after equivalent reverification.
39. Specialist Review: Data pass, Compatibility pass, Security pass.
40. Findings: LOOP-001-STD-001 Major reopened; CLOSURE-FACT-001 Major ready-for-review after one scoped accounting correction.
41. Rework cycles: 1 governance correction at revision 1/1.
42. Reverification: authorized equivalent Standards Reviewer returned reopened; closure factual Review failed on one byte total, and its scoped correction remains unverified.
43. Product full validation: fresh npm run test passed 35/35 files and 100/100 tests; typecheck and build passed.
44. Native validation: Android native/device not run because product change is TypeScript contract/store logic and deterministic fixtures cover the accepted local boundary.
45. Unverified surfaces: physical Android SQLite/plugin/file flow, Electron installer, remote CI, production data, release, deploy, and external services.

## Lifecycle and Closure

46. Lifecycle assertions: Project, Loop, all Task owner/status/revision values, Finding, Git, Integration, Review, Closure, Checkpoint, and Handoff were enumerated at required barriers.
47. Lifecycle mismatches: 4 Integration-era assertion rows plus 2 same-class reviewer/EII projection classes at reverification.
48. Governance correction count: 1/1.
49. Final lifecycle consistency: terminal blocked authorities/projections are synchronized, but the Major remains reopened and the failed correction evidence is preserved.
50. Closure decision: blocked-with-verified-partial-delivery.
51. Functional Acceptance: pass.
52. Engineering Acceptance: fail because Standards does not pass.
53. Delivery Acceptance: fail because lifecycle-value consistency does not pass.
54. Bounded Rework: respected; no second correction or revision spiral.
55. Worker failure/ownership fallback: exercised naturally; no manufactured failure or ownership collapse.

## Artifact Accounting

56. Product artifacts: 6 files, 39 changed lines.
57. Test artifacts: 4 files, 474 changed lines.
58. Governance artifacts: 30 files, 2,376 lines, 109,423 bytes. Factual-review input was 26 files, 2,117 lines, 99,296 bytes.
59. Evaluation artifacts: 7 files, 610 lines, 48,378 bytes.
60. Governance files actually used: every governance file feeds assignment, Delivery, Integration, Review, Finding/Rework, Closure, recovery, or final accounting.
61. Low-value artifacts: none identified; TASK-003-R1 and its Review artifacts are costly but necessary evidence of the blocking mechanism.
62. Stale artifacts: the failed-correction reviewer ownership wording remains evidence in TASK-003-R1 and Review history; terminal authorities/projections do not rely on it as a current action.
63. Duplicative artifacts: none identified; task, integration, specialist, and closure reviews own distinct decisions/evidence.
64. Recovery-critical files: PROJECT.md, LOOP-MAP.md, TASK-LEDGER.md, FINDING-LEDGER.md, and CHECKPOINT.md.

## Hypotheses

| Hypothesis | Classification | Evidence |
|---|---|---|
| H1 Full Loop Selection | supported | Real two-owner product gap and Integration requirement. |
| H2 Independent Worker Value | supported | Two independently useful approved Deliveries. |
| H3 Integration Value | supported | Bidirectional/zero-mutation invariant required both outputs. |
| H4 Normal Full Loop Completion | contradicted | Review and bounded correction did not reach accepted Closure. |
| H5 Governance Proportionality | tension | Smaller than EXP-008, but lifecycle correction/review still added material cost. |
| H6 Lifecycle-Value Consistency | contradicted | Same-class drift survived correction 1/1. |
| H7 Independent Review Stability | tension | Independent judgment was reproducible, but original-reviewer HTTP 503 and ownership projections required substitution. |
| H8 Honest Finalization | supported | Product success did not override blocked Standards/Closure. |

## Comparative Evidence

| Dimension | EXP-008 | EXP-010 |
|---|---:|---:|
| Workers | not restated as verified | 2 logical owners |
| Valid Deliveries | partial archive | 2 implementation |
| Unsuccessful attempts | not restated as verified | 4 |
| EII | 50 reported total, unreviewed | 9 observed/coalesced |
| Governance files | 71 current | 30 |
| Governance lines | 4,709 current | 2,376 |
| Rework cycles | iterative churn | 1 |
| Integration | partial/product valid | GREEN |
| Closure | blocked | blocked |
| Lifecycle drift | yes | yes |
| Final delivery | partial | verified partial product delivery |

65. EXP-009 comparison: fixed membership did not guarantee current lifecycle value; EXP-010 reproduced that distinction with a smaller assertion set.
66. Lifecycle drift repeated: yes, Repeated Pattern candidate. This is calibration evidence, not an automatically promoted Normative Invariant.

## Score and Research Decision

67. Scorecard: 108/120; conjunctive acceptance still fails.
68. Final product acceptance: functional product boundary accepted locally, but the Project is blocked.
69. Final experiment closure: blocked.
70. FINAL FULL LOOP BEHAVIORAL ACCEPTANCE: FAIL.
71. Remaining protocol tension: recovery projections can retain stale ownership/incident values even when exact Resume Point and artifact membership are correct.
72. Final calibration evidence: sufficient to stop large experiments and calibrate lifecycle authority/projection maintenance.

## Git and Authority

- Commits: product aaec68e0137b2b3ff0629bbd688c9d7c5ac06294; the final evidence commit cannot embed its own SHA.
- Report-generation HEAD: aaec68e0137b2b3ff0629bbd688c9d7c5ac06294.
- Final HEAD inside this self-referential artifact: not embeddable without changing the commit; the externally observed final SHA belongs in final Git verification and the completion response.
- Push status: pending at report generation; authorized only for the experiment branch.
- Local/remote sync: pending final archival push verification.
- Working tree at report generation: ten product/test paths plus EXP-010 governance/evaluation artifacts; index empty.
- Original workspace: clean and untouched at base SHA when last inspected.
- LoopPilot workspace: clean and unchanged at frozen SHA when last inspected.
- Commit authority: experiment branch only.
- Push authority: experiment branch only.
- Not authorized or performed: main push, merge, PR, tag, release, deploy, or force push.

## Governance Cost Interpretation

Governance remained materially smaller than EXP-008 and every added file had a downstream consumer. The failed correction nevertheless demonstrates that lower artifact membership alone does not solve lifecycle-value drift.

## Stop Rule

Do we have enough behavioral evidence to stop large-scale protocol experimentation? Yes.

The next step is Final Protocol Calibration, followed only by Cross-host Acceptance and Release Candidate when separately authorized. EXP-011 is not justified.

## Unverified Claims

- Android native/device and remote CI behavior.
- Installer/distribution behavior.
- Production or real-user data behavior.
- Release or deployment readiness.
- Final evidence commit SHA and remote 0/0 sync until observed after this file is committed and pushed.
- Universal host or protocol correctness.
