# DELIVERY-TASK-001

## Claim

- Replaced the malformed untracked helper with the exported, non-mutating `assertProjectSnapshotIdentity` assertion.
- The assertion rejects comment and report `projectId` values that differ from `snapshot.project.id`, and label `commentId` values absent from `snapshot.comments`, using deterministic relation-specific errors.
- `GamePulseProjectPackageCodec` enforces the assertion at encode, buffered decode, and streamed decode boundaries.
- The assertion is exported from the shared package entry point for TASK-002.
- This is a Worker submission only. It does not claim approval, integration, Loop acceptance, or parent completion.

## Evidence

- Observed RED (Worker): `npm.cmd exec vitest -- run packages/shared/src/projectPackage.test.ts` exited 1. One file ran two tests: one failed and one passed, with no skips reported. The new comment-identity test failed because encode resolved to bytes instead of rejecting.
- Observed RED (Supervisor, independently reported): an elevated filtered `npx.cmd vitest run` of the same comment test produced one failed and one skipped test; encode again resolved instead of rejecting at `projectPackage.test.ts:29`.
- Observed minimal GREEN (Worker): `npx.cmd vitest run packages/shared/src/projectPackage.test.ts` exited 0 with one file and two tests passed.
- Observed expanded RED (Worker): `npx.cmd vitest run packages/shared/src/projectPackage.test.ts` exited 1 with one file, three failed tests, and one passed test. Comment identity survived buffered decode; report identity and dangling-label identity survived encode.
- Observed final focused GREEN (Worker): the project-package and integrity files passed together with two files and seven tests.
- Observed final focused GREEN (Supervisor, independently reported): the same two-file command passed two files and seven tests.

## Verification

- `npx.cmd vitest run packages/shared/src/projectPackage.test.ts packages/shared/src/projectPackage-integrity.test.ts` -> exit 0; 2 files passed, 7 tests passed, 0 failed, 0 skipped.
- `npm.cmd run build -w @gamepulse/shared` -> exit 0; `tsc -p tsconfig.json` completed without diagnostics.
- `npm.cmd run typecheck -w @gamepulse/shared` -> exit 0; `tsc -p tsconfig.json --noEmit` completed without diagnostics.
- `git diff --check -- packages/shared/src/projectPackage.ts packages/shared/src/projectPackage-integrity.test.ts packages/shared/src/projectPackage.test.ts packages/shared/src/index.ts` -> exit 0; only Git line-ending conversion warnings were emitted.
- `git rev-parse HEAD` -> `70de26178db91e34b97210a3ebecb485ec2fce1e`, matching the Contract starting product HEAD.

## Git Boundary and limits

- Worker product changes are limited to allowed paths: `packages/shared/src/projectPackage.ts`, `packages/shared/src/projectPackage.test.ts`, `packages/shared/src/projectSnapshotIdentity.ts`, and `packages/shared/src/index.ts`. The allowed integrity test was read and verified but not modified.
- This Delivery is the sole Worker-created shared-state artifact: `.looppilot/loops/LOOP-001/deliveries/DELIVERY-TASK-001.md`.
- Final status also contains pre-existing Supervisor-owned untracked `.looppilot/` and `docs/experiments/` trees. The Worker did not modify them outside this Delivery.
- No deletion, commit, push, network access, external communication, release, deployment, Ledger edit, Contract edit, documentation edit, app edit, package manifest edit, or lockfile edit was performed.
- Platform persistence, cross-platform round trips, Android-native behavior, full-repository regressions, Loop acceptance, integration, and parent completion remain unverified by this Task.
