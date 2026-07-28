# EXP-010 Full Loop Candidate Audit

## Artifact Role

- Purpose: audit the four required product surfaces and decide whether a genuine Full Loop candidate exists.
- Classification: supporting gate evidence; the later Mode Selection records the Supervisor decision if this gate passes.
- Downstream consumers: Mode Selection or the honest no-candidate stop, Task Contracts, and final experiment evaluation.

## Audit Method

The audit used current source, tests, configuration, default baseline results, and focused deterministic probes. `Observed` means directly read or executed; `inferred` identifies a conclusion from the observed code until a focused probe confirms it.

## Candidate A: Cross-Device Package Integrity

Observed architecture:

- `GamePulseProjectPackageCodec` owns a v1 ZIP containing `manifest.json` plus five exact payload names: metadata, project, comments, labels, and reports.
- Manifest validation rejects missing, duplicate, or unexpected manifest entries and verifies byte length and SHA-256 for every listed payload.
- Desktop uses streamed decode before `SqliteLocalStore.importProject`; mobile uses buffered decode before its store import. This ordering makes hash/version failures fail before persistence on the normal file paths.
- The desktop store writes `CommentRecord.projectId` from package data, while the mobile SQLite store writes the enclosing `snapshot.project.id`. The shared codec does not validate that these identities match.
- Both stores write reports under the enclosing project row while preserving each serialized `Report.projectId`; labels are not checked against the package comment identity set.
- Both stores upsert an existing project and report `updated: 0`; no written policy was found that establishes the desired conflict count or overwrite policy.

Integrity matrix:

| Concern | Current evidence |
| --- | --- |
| Manifest coverage and hashes | Observed checks cover all declared payloads and detect missing/corrupt bytes. |
| Entry order | No semantic dependence observed; lookup/stream dispatch is path-based. |
| Duplicate archive names | Stream decoder rejects duplicates; buffered `unzipSync` representation cannot retain duplicate keys for a comparable check. |
| Case/separator/traversal names | Manifest entries must match exact canonical paths, but extra unmanifested ZIP entries are currently ignored by both decoders (observed source; focused runtime proof pending). |
| Schema/version | Package and snapshot version 1 are checked; deep runtime field schemas are not validated. |
| Unknown fields | Structural cleaning drops keys not copied for project/comment but preserves non-sensitive unknown nested report/label fields. |
| Fail-closed/partial import | Normal desktop/mobile file paths decode before store mutation; adapter-direct calls remain outside codec validation. |
| Existing project overwrite | Upsert occurs on both production stores; intended conflict policy is undocumented, so no new policy will be invented in this experiment. |
| Project identity | Real divergence observed in source: desktop trusts comment identity, mobile rebinds it; reports can retain a contradictory serialized identity. |
| Round-trip stability | Canonical payload order is fixed; creation/export timestamps make byte identity intentionally unstable, while logical identity should remain stable. |

Observed bounded gap: a correctly hashed v1 package can carry contradictory relational identities. Shared decode accepts it, then desktop and mobile adapters interpret it differently. The candidate has distinct shared-contract and platform-persistence ownership, and only integration can prove that accepted package identity remains canonical across both directions and that rejected identity causes zero mutation.

Focused executable evidence on 2026-07-27:

- A temporary, uncommitted Vitest probe encoded `project-a` with a `comment-1` whose `projectId` was `project-b`, then decoded the correctly hashed package.
- Expected canonical identity; observed `project-b` survived decode while the enclosing project remained `project-a`.
- The same decoded snapshot was imported into the real desktop `SqliteLocalStore` and mobile `CapacitorSqliteLocalStore` using deterministic temporary SQLite drivers with both projects present.
- Expected identical `project-a` comment identity; observed desktop exported `[]` while mobile exported `['comment-1']`.
- Focused result: 1 file, 2 tests, 2 genuine assertion failures. The probe file was then removed and is not a product delivery.

## Candidate B: Cross-Device Secret Sanitization

Observed:

- Both platform exporters use the same shared codec; platform adapters add no independent sanitization layer.
- Shared cleaning recursively filters sensitive key variants in project-package objects and metadata, including nested objects and arrays. Existing tests cover nested API token, credential, device/cache path, and API key keys.
- Source URL values are copied verbatim; URL userinfo or query-token values are not removed by key filtering. The privacy documents promise no API keys and describe exported URLs as public, so this may be a privacy gap, but its exact product policy needs care.

Decision: not selected for EXP-010. Any bounded sanitizer correction is primarily one shared implementation owner; splitting desktop and mobile work would be decorative because both call the same codec. Broader URL policy would also exceed the evidence without a separate product decision.

## Candidate C: Evidence Identity Across Package Round Trip

Observed:

- Project packages contain comments, analysis labels, and legacy reports, but do not contain `ResearchRecord` history as a first-class payload.
- Evidence references in reports and research are nested data; the current package contract has no independently documented `[E#]` round-trip contract.
- The relational project/comment/report mismatch found in Candidate A can affect evidence ownership, but that is already the narrower package-integrity candidate.

Decision: not selected separately. Adding research-history packaging or inventing a new evidence-version policy would broaden the product contract beyond a bounded observed requirement. Identity consistency remains an acceptance consequence of Candidate A.

## Candidate D: Package Version Compatibility

Observed:

- Package manifest and snapshot metadata have an explicit version 1 contract.
- Unknown future manifest or snapshot versions fail closed; an existing test covers unknown manifest version.
- No older `.gamepulse` schema or migration implementation exists in current history/configuration evidence examined for this audit.

Decision: not selected. A speculative migration system would invent unsupported policy and is mainly a shared codec owner concern.

## Selection Gate

| Requirement | Current evidence | State |
| --- | --- | --- |
| Real product gap | Contradictory package identity was accepted and produced different desktop/mobile persisted ownership in the focused runtime probe. | pass |
| At least two real implementation owners | Shared producer/decoder contract and platform persistence contract have independent safety obligations and direct entry points. | pass |
| Non-trivial integration invariant | No Worker alone can prove canonical identity, identical rejection, zero partial mutation, and reverse round-trip parity across shared, desktop, and mobile boundaries. | pass |
| Bounded and deterministic | Fixture ZIPs and temporary SQLite/fake-driver stores require no network, LLM, real user data, release, or deployment. | pass |

## Candidate Outcome

`FULL-LOOP CANDIDATE SELECTED`

Selected scope: fail-closed canonical relational identity for `.gamepulse` packages and direct LocalStore snapshot imports. The scope does not invent an overwrite policy, add package migrations, broaden secret policy, or redesign research-history packaging.
