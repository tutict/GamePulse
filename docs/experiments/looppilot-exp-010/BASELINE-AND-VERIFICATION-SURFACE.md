# EXP-010 Baseline and Verification Surface

## Artifact Role

- Purpose: record the observed baseline and the exact validation surfaces available to EXP-010.
- Classification: supporting evidence; command success is not Project or Loop acceptance.
- Downstream consumers: candidate audit, Task Contracts, Integration Review, Closure, and final experiment evaluation.

## Repository Baseline

- Observed on 2026-07-27: original GamePulse workspace was clean on `main`, tracking `origin/main` at `70de26178db91e34b97210a3ebecb485ec2fce1e` with ahead/behind `0/0` after `git fetch origin main`.
- Observed: the experiment worktree started clean from that SHA on `experiment/looppilot-gamepulse-exp-010`.
- Observed: no GamePulse `AGENTS.md` exists in the repository.
- Observed toolchain: Node `v24.12.0`, npm `11.17.0`, Git `2.51.0.windows.1`.
- Observed lockfile: npm lockfile version 3; root engine requires Node `>=22`.
- Workspace packages: `@gamepulse/ui`, `@gamepulse/shared`, `@gamepulse/desktop`, `@gamepulse/mobile`, and `@gamepulse/userscript`.

## Default Commands

| Command | Observed result | Boundary |
| --- | --- | --- |
| `npm install` | PASS; 577 packages added, 583 audited in 20.3 s | Used the committed lockfile; no dependency version was intentionally changed. |
| `npm run test` | Initial EII, then PASS after environment correction; 33/33 files and 83/83 tests in 9.7 s | Vitest behavior only; no Android instrumentation, packaging, remote service, or CI claim. |
| `npm run typecheck` | PASS in 4.5 s | Shared, desktop, mobile, and userscript type surfaces; UI/shared are built first. |
| `npm run build` | PASS in 8.8 s | UI/shared TypeScript, Electron main/preload/renderer, mobile web Vite bundle, and userscript readiness command. |

No skipped tests were reported by the passing default run.

## Environment Correction and Incidents

- EII-001 (observed): the first default test run passed 32/33 files and 82 tests, but `apps/desktop/src/main/security.test.ts` failed during import because the isolated install lacked the Electron binary and sandboxed download returned `TypeError: fetch failed`.
- Correction (observed): the original clean workspace already contained the same `electron@43.0.0` binary. Its `dist` directory and `path.txt` were copied into the experiment worktree's untracked `node_modules`; no tracked product or lockfile changed.
- Corrected result (observed): the unchanged default test command passed 33/33 files and 83/83 tests.
- EII-002 (observed): the first focused probe invocation could not write Vitest's temporary config cache under the isolated dependency tree. Re-running with scoped worktree write permission entered the test body; this incident did not count as a product RED or Worker attempt.
- EII-003 (observed, coalesced): TASK-001's original Worker exhausted 2/2 attempts on Windows apply-patch sandbox/argument transport. Attempt 1 had zero output; attempt 2 created a malformed untracked no-op helper with stripped quotes. No product RED or Delivery existed, so no Delivery was invalidated. The Supervisor authorized a fallback Worker with a materially different quote-free small-patch strategy.
- EII-004 (observed): the first fallback Worker session remained running without filesystem changes and did not respond to two status requests; the Supervisor interrupted it after repeated observation. The malformed helper remained unchanged, no RED or Delivery existed, and no Delivery was invalidated. A short-context, single-tracer-bullet restart is the materially different recovery strategy.
- EII-005 (observed): the follow-up turn on the same fallback session also remained running without filesystem changes or a RED. Because the turn retained the stalled Agent context, the Supervisor interrupted it and reassigned TASK-001 to a fresh no-history recovery Worker. No Delivery was invalidated.
- EII-006 (observed): a sandboxed Supervisor focused Vitest run could not write the Vite temporary config under node_modules and exited with EPERM. The same command ran with the approved test prefix and produced the genuine RED, then later GREEN; no Delivery was invalidated.
- EII-007 (observed, coalesced): TASK-002 ordinary apply-patch failed on Windows sandbox refresh and the Codex patch runner initially received access denied before scoped approval. A content-equivalent Contract probe and later product patches succeeded after approval. No Product Finding or invalidated Delivery resulted.
- EII-008 (observed): the original Standards Reviewer reverification turn failed with model-service HTTP 503 before returning a judgment or changing files. No Delivery or Finding evidence was invalidated; an authorized equivalent read-only Reviewer is required with the substitution reason preserved.
- EII-009 (observed, coalesced): terminal governance editing hit the same Windows sandbox refresh/access boundary for the direct patch tool, and the batch wrapper then rejected multiline patch transport. Three patch invocations changed no files. The same scoped patches succeeded through the Codex apply-patch executable under approved worktree access; no product/test path or Delivery was invalidated.
- npm reported 1 moderate and 3 high audit findings plus deprecated-package/install-script warnings. `npm audit fix`, `npm update`, and dependency upgrades were not run.

## Test Discovery

- `scripts/run-tests.mjs` recursively discovers `*.test.*` and `*.spec.*` under `packages` and `apps`, excluding generated/cache/dependency directories, sorts the paths, and invokes Vitest with the explicit list.
- Root `vitest.config.ts` additionally excludes `.worktrees/**`.
- Package surfaces include shared codec/integrity tests, desktop `ProjectPackageService` and SQLite integration tests, and desktop/mobile LocalStore contract runs.
- Default discovery does not imply every native plugin or operating-system path is exercised.

## Build and Native Surfaces

- Desktop build surface (observed PASS): Electron Vite main, preload, and renderer bundles.
- Electron runtime surface (partially observed): security tests load Electron after local binary correction; installer/distribution packaging was not run.
- SQLite surface (observed in tests): `better-sqlite3` desktop tests and mocked/contract mobile storage behavior included by default discovery. A physical Android SQLite plugin runtime was not exercised.
- Mobile web surface (observed PASS): Vite production build.
- Android native surface (unverified): Gradle assemble/bundle, emulator/device behavior, Java/Kotlin bridge behavior, Android file picker/share, and on-device SQLite were not run.
- CI surface (unverified): no remote workflow was triggered or inspected.

## Network and External-Service Boundary

- No live LLM, Steam, Reddit, production endpoint, release, deployment, or real-user dataset is required for the selected experiment surface.
- Tests using model/network abstractions do not establish availability or correctness of real external services.
- Product verification for EXP-010 must use fixtures, temporary files/databases, and deterministic package bytes.

`npm run test PASS` is evidence for the discovered local test set only; it is not evidence that all desktop, mobile, Android-native, packaging, or remote behavior passed.
