# Game Sentiment Research Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current tool-oriented Windows and Android interfaces with a working local game-research flow that accepts a game name, runs a deterministic Agent pipeline, persists evidence and report history, supports evidence exclusion, and renders the approved conclusion-first report.

**Architecture:** Shared packages own research types, orchestration, deterministic fixture collection, report validation, and stateless React views. Desktop runs orchestration behind trusted Electron IPC; Android runs the same orchestration against its local store. Both SQLite adapters persist a JSON research aggregate in a versioned table, while existing projects, comments, RAG, model settings, imports, and project packages remain compatible as advanced capabilities.

**Tech Stack:** TypeScript, React 19, Electron 43, Capacitor 8, SQLite/FTS5, Tailwind CSS 4, Vitest, Testing Library, Playwright CLI.

---

## Scope Boundary

This plan implements the first independently testable vertical slice from the approved design. `FixtureResearchCollector` produces deterministic public-source-shaped evidence so the full product flow, persistence, report generation, corrections, and responsive UI can be validated without unstable network dependencies. Provider-specific search and live Steam, TapTap, Bilibili, Tieba, Reddit, media, and forum collectors belong to a separate implementation plan after this slice is accepted.

## File Structure

Create shared research modules with one responsibility per file:

- `packages/shared/src/research/types.ts`: research aggregate, source, evidence, report, progress, and request types.
- `packages/shared/src/research/contracts.ts`: collector, report generator, repository, and event callback interfaces.
- `packages/shared/src/research/memoryRepository.ts`: structured-clone in-memory repository for orchestration and controller tests.
- `packages/shared/src/research/fixtureCollector.ts`: deterministic fixture evidence keyed by the requested game name.
- `packages/shared/src/research/reportGenerator.ts`: conclusion-first report construction and citation validation.
- `packages/shared/src/research/followUp.ts`: current-research evidence ranking, context limits, citations, and grounded fallback answers.
- `packages/shared/src/research/orchestrator.ts`: cancellation-aware stage sequencing and persistence.
- `packages/shared/src/research/*.test.ts`: pure behavior and failure-state tests.

Create reusable view-only React modules:

- `packages/ui/src/features/research/types.ts`: serializable component view models and callback props.
- `packages/ui/src/features/research/research-start.tsx`: game name, optional focus, recent reports, and credential notice.
- `packages/ui/src/features/research/research-progress.tsx`: stage list, coverage, cancellation, partial failures.
- `packages/ui/src/features/research/sentiment-report.tsx`: verdict, metrics, themes, coverage note, follow-up form.
- `packages/ui/src/features/research/evidence-drawer.tsx`: inspect and exclude evidence with explicit reason.
- `packages/ui/src/features/research/research-history.tsx`: report versions and sentiment deltas.
- `packages/ui/src/features/research/research-workspace.tsx`: compose the approved three-entry navigation flow.
- `packages/ui/test/research-workspace.test.tsx`: interaction and accessibility tests.

Create platform adapters:

- `apps/desktop/src/main/researchIpc.ts`: trusted IPC handlers, running-job cancellation, and progress events.
- `apps/desktop/src/renderer/src/useDesktopResearch.ts`: renderer state reducer and bridge calls.
- `apps/mobile/src/research/useMobileResearch.ts`: local orchestration and state reducer.

Modify persistence and integration files:

- `packages/shared/src/contracts.ts`
- `packages/shared/src/index.ts`
- `packages/shared/test/localStoreContract.js`
- `apps/desktop/src/main/sqliteStore.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/src/types.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/mobile/src/storage/memoryLocalStore.ts`
- `apps/mobile/src/storage/capacitorSqliteStore.ts`
- `apps/mobile/src/App.tsx`
- `packages/ui/src/components/app-shell.tsx`
- `packages/ui/src/index.ts`
- `packages/ui/package.json`
- `package-lock.json`
- `README.md`

### Task 1: Define the Research Aggregate and Contracts

**Files:**
- Create: `packages/shared/src/research/types.ts`
- Create: `packages/shared/src/research/contracts.ts`
- Create: `packages/shared/src/research/memoryRepository.ts`
- Create: `packages/shared/src/research/types.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing type/behavior test**

```ts
import { describe, expect, it } from "vitest";
import { createResearch } from "./types.js";

describe("research aggregate", () => {
  it("normalizes a request into a pending 90-day research record", () => {
    const research = createResearch({ gameName: "  幻兽帕鲁  ", focus: "  联机稳定性  " }, "2026-07-13T00:00:00.000Z", "research-1");
    expect(research).toMatchObject({
      id: "research-1",
      request: { gameName: "幻兽帕鲁", focus: "联机稳定性", periodDays: 90 },
      status: "pending",
      sources: [],
      evidence: [],
      reports: [],
      exclusions: []
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm exec vitest -- run packages/shared/src/research/types.test.ts`

Expected: FAIL because `packages/shared/src/research/types.ts` does not exist.

- [ ] **Step 3: Add the aggregate types and constructor**

```ts
export type ResearchStatus = "pending" | "running" | "needs_input" | "completed" | "failed" | "cancelled";
export type ResearchStage = "identity" | "discovery" | "collection" | "cleaning" | "report";
export type ResearchSentiment = "positive" | "neutral" | "negative" | "mixed";

export interface ResearchRequest {
  gameName: string;
  focus?: string;
  periodDays: number;
}

export interface ResearchSource {
  id: string;
  platform: string;
  title: string;
  url: string;
  status: "covered" | "failed" | "excluded";
  itemCount: number;
  error?: string;
}

export interface ResearchEvidence {
  id: string;
  sourceId: string;
  platform: string;
  sourceUrl: string;
  sourceTitle: string;
  body: string;
  excerpt: string;
  postedAt: string;
  sentiment: Exclude<ResearchSentiment, "mixed">;
  relevance: number;
}

export interface EvidenceExclusion {
  evidenceId: string;
  reason: string;
  excludedAt: string;
  actor: "agent" | "user";
}

export interface ResearchTopic {
  id: string;
  label: string;
  sentiment: ResearchSentiment;
  summary: string;
  evidenceIds: string[];
}

export interface ResearchCoverage {
  coveredSources: number;
  failedSources: number;
  excludedSources: number;
  evidenceCount: number;
}

export interface SentimentReportVersion {
  id: string;
  version: number;
  verdict: string;
  summary: string;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  historicalDelta?: number;
  topics: ResearchTopic[];
  strengths: string[];
  risks: string[];
  controversies: string[];
  coverage: ResearchCoverage;
  createdAt: string;
}

export interface ResearchRecord {
  id: string;
  request: ResearchRequest;
  status: ResearchStatus;
  stage?: ResearchStage;
  progressMessage?: string;
  sources: ResearchSource[];
  evidence: ResearchEvidence[];
  exclusions: EvidenceExclusion[];
  reports: SentimentReportVersion[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function createResearch(
  request: { gameName: string; focus?: string },
  now = new Date().toISOString(),
  id = globalThis.crypto.randomUUID()
): ResearchRecord {
  const gameName = request.gameName.trim();
  if (!gameName) throw new Error("Game name is required");
  const focus = request.focus?.trim() || undefined;
  return {
    id,
    request: { gameName, focus, periodDays: 90 },
    status: "pending",
    sources: [], evidence: [], exclusions: [], reports: [],
    createdAt: now, updatedAt: now
  };
}
```

Define `ResearchCollector`, `ResearchReportGenerator`, and `ResearchRepository` in `contracts.ts` with these signatures:

```ts
export interface ResearchRepository {
  listResearches(): Promise<ResearchRecord[]>;
  getResearch(researchId: string): Promise<ResearchRecord | undefined>;
  saveResearch(research: ResearchRecord): Promise<void>;
}

export interface ResearchCollector {
  collect(request: ResearchRequest, signal?: AbortSignal): Promise<{
    sources: ResearchSource[];
    evidence: ResearchEvidence[];
  }>;
}

export interface ResearchReportGenerator {
  generate(research: ResearchRecord): Promise<SentimentReportVersion>;
}

export type ResearchProgressCallback = (research: ResearchRecord) => void;
```

Implement `MemoryResearchRepository` with structured clones on every read and write so tests cannot mutate persisted state by reference. Export `./research/types.js`, `./research/contracts.js`, and `./research/memoryRepository.js` from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run shared tests and type checks**

Run: `npm exec vitest -- run packages/shared/src/research/types.test.ts`

Run: `npm.cmd run typecheck -w @gamepulse/shared`

Expected: PASS.

- [ ] **Step 5: Commit the research domain**

```bash
git add packages/shared/src/research packages/shared/src/index.ts
git commit -m "feat: add game research domain"
```

### Task 2: Persist Research Aggregates in Every Local Store

**Files:**
- Modify: `packages/shared/src/contracts.ts`
- Modify: `packages/shared/test/localStoreContract.js`
- Modify: `apps/desktop/src/main/sqliteStore.ts`
- Modify: `apps/mobile/src/storage/capacitorSqliteStore.ts`
- Modify: `apps/mobile/src/storage/memoryLocalStore.ts`
- Test: `apps/desktop/src/main/localStore.contract.test.ts`
- Test: `apps/mobile/src/storage/localStore.contract.test.ts`

- [ ] **Step 1: Extend the contract test with research persistence**

Add this assertion to the shared contract after project persistence:

```js
const research = {
  id: `research-${crypto.randomUUID()}`,
  request: { gameName: "幻兽帕鲁", focus: "联机稳定性", periodDays: 90 },
  status: "completed",
  sources: [], evidence: [], exclusions: [], reports: [],
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:01:00.000Z"
};
await source.saveResearch(research);
expect(await source.getResearch(research.id)).toEqual(research);
expect(await source.listResearches()).toEqual([research]);
```

- [ ] **Step 2: Run both adapter contracts and verify the missing-method failures**

Run: `npm exec vitest -- run apps/desktop/src/main/localStore.contract.test.ts apps/mobile/src/storage/localStore.contract.test.ts`

Expected: FAIL because the adapters do not implement `saveResearch`, `getResearch`, or `listResearches`.

- [ ] **Step 3: Extend `LocalStore` and add SQLite migration version 2**

Add to `LocalStore`:

```ts
listResearches(): Promise<ResearchRecord[]>;
getResearch(researchId: string): Promise<ResearchRecord | undefined>;
saveResearch(research: ResearchRecord): Promise<void>;
```

Desktop migration:

```sql
CREATE TABLE IF NOT EXISTS researches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  research_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS researches_updated_idx ON researches(updated_at DESC);
```

Implement all three methods with parameterized statements and JSON parsing. Add the same table to the Capacitor schema and methods using `MobileSqlDriver`. Add a `Map<string, ResearchRecord>` plus structured clones to `MemoryLocalStore`.

- [ ] **Step 4: Run contracts, SQLite tests, and type checks**

Run: `npm exec vitest -- run apps/desktop/src/main/localStore.contract.test.ts apps/mobile/src/storage/localStore.contract.test.ts apps/desktop/src/main/sqliteStore.test.ts`

Run: `npm.cmd run typecheck`

Expected: all PASS.

- [ ] **Step 5: Commit research persistence**

```bash
git add packages/shared/src/contracts.ts packages/shared/test/localStoreContract.js apps/desktop/src/main/sqliteStore.ts apps/mobile/src/storage/capacitorSqliteStore.ts apps/mobile/src/storage/memoryLocalStore.ts
git commit -m "feat: persist local research history"
```

### Task 3: Implement the Deterministic Agent Pipeline

**Files:**
- Create: `packages/shared/src/research/fixtureCollector.ts`
- Create: `packages/shared/src/research/reportGenerator.ts`
- Create: `packages/shared/src/research/followUp.ts`
- Create: `packages/shared/src/research/orchestrator.ts`
- Create: `packages/shared/src/research/orchestrator.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write orchestration tests for success, partial failure, exclusion, and cancellation**

```ts
it("persists stage progress and a cited report", async () => {
  const repository = new MemoryResearchRepository();
  const record = createResearch({ gameName: "幻兽帕鲁", focus: "联机稳定性" }, now, "r1");
  const completed = await runResearch({
    research: record,
    collector: new FixtureResearchCollector(),
    reportGenerator: new DeterministicReportGenerator(),
    repository
  });
  expect(completed.status).toBe("completed");
  expect(completed.sources.some((source) => source.status === "failed")).toBe(true);
  expect(completed.reports[0]?.topics.every((topic) => topic.evidenceIds.length > 0)).toBe(true);
  expect(await repository.getResearch("r1")).toEqual(completed);
});

it("marks a run cancelled without creating a report", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = await runResearch({
    research: createResearch({ gameName: "测试游戏" }, now, "r2"),
    collector: new FixtureResearchCollector(),
    reportGenerator: new DeterministicReportGenerator(),
    repository: new MemoryResearchRepository(),
    signal: controller.signal
  });
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.reports).toEqual([]);
});
```

- [ ] **Step 2: Run the tests and verify missing implementations**

Run: `npm exec vitest -- run packages/shared/src/research/orchestrator.test.ts`

Expected: FAIL because collector, generator, and orchestrator modules do not exist.

- [ ] **Step 3: Implement stage sequencing and deterministic evidence**

`runResearch` must persist after each stage and call `onProgress` with an immutable record. Use this exact stage sequence:

```ts
const stages: ResearchStage[] = ["identity", "discovery", "collection", "cleaning", "report"];
```

`FixtureResearchCollector` returns at least six evidence rows across Steam, Bilibili, Reddit, and a public forum; interpolates only the requested game name into source titles; includes one failed source; and never claims that fixture evidence came from a live request. `DeterministicReportGenerator` calculates sentiment rates from non-excluded evidence, groups evidence into stability, content cadence, and core-play themes, and throws if any topic has no evidence IDs. `runResearch` catches `ResearchIdentityAmbiguousError`, persists `needs_input` with candidates, retries invalid report output once, and preserves collected evidence if the second report attempt fails. `buildResearchFollowUp` excludes user/Agent exclusions, selects at most eight evidence rows and two per source, limits context to 12,000 characters, and emits stable `[E1]` citations.

Export:

```ts
export async function regenerateResearchReport(input: {
  research: ResearchRecord;
  reportGenerator: ResearchReportGenerator;
  repository: ResearchRepository;
  now?: () => string;
}): Promise<ResearchRecord>;

export async function excludeResearchEvidence(input: {
  research: ResearchRecord;
  evidenceId: string;
  reason: string;
  repository: ResearchRepository;
  reportGenerator: ResearchReportGenerator;
  now?: () => string;
}): Promise<ResearchRecord>;
```

- [ ] **Step 4: Run all shared research tests**

Run: `npm exec vitest -- run packages/shared/src/research`

Expected: PASS for success, partial failure, identity selection, cancellation, report retry, refresh versioning, local follow-up, citation validation, and exclusion regeneration.

- [ ] **Step 5: Commit the Agent vertical slice**

```bash
git add packages/shared/src/research packages/shared/src/index.ts
git commit -m "feat: add deterministic research agent"
```

### Task 4: Build Shared Responsive Research Views

**Files:**
- Create: `packages/ui/src/features/research/types.ts`
- Create: `packages/ui/src/features/research/research-start.tsx`
- Create: `packages/ui/src/features/research/research-progress.tsx`
- Create: `packages/ui/src/features/research/sentiment-report.tsx`
- Create: `packages/ui/src/features/research/evidence-drawer.tsx`
- Create: `packages/ui/src/features/research/research-history.tsx`
- Create: `packages/ui/src/features/research/research-workspace.tsx`
- Create: `packages/ui/test/research-workspace.test.tsx`
- Modify: `packages/ui/src/components/app-shell.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add UI runtime and browser test dependencies**

Run: `npm.cmd install -w @gamepulse/ui lucide-react`

Run: `npm.cmd install -D -w @gamepulse/ui @testing-library/react @testing-library/user-event jsdom`

Expected: `packages/ui/package.json` contains `lucide-react` plus the three dev dependencies, and `package-lock.json` is updated.

- [ ] **Step 2: Write failing interaction tests**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "../src/features/research/research-workspace.js";

it("starts a research from game name and optional focus", async () => {
  const onStart = vi.fn();
  render(<ResearchWorkspace model={startModel} onStart={onStart} />);
  await userEvent.type(screen.getByLabelText("游戏名称"), "幻兽帕鲁");
  await userEvent.type(screen.getByLabelText("重点关注的问题（可选）"), "联机稳定性");
  await userEvent.click(screen.getByRole("button", { name: "开始研究" }));
  expect(onStart).toHaveBeenCalledWith({ gameName: "幻兽帕鲁", focus: "联机稳定性" });
});

it("opens evidence and requests an explicit exclusion reason", async () => {
  const onExcludeEvidence = vi.fn();
  render(<ResearchWorkspace model={reportModel} onExcludeEvidence={onExcludeEvidence} />);
  await userEvent.click(screen.getByRole("button", { name: "查看来源与证据" }));
  await userEvent.click(screen.getByRole("button", { name: "排除证据 E1" }));
  await userEvent.type(screen.getByLabelText("排除原因"), "与目标游戏无关");
  await userEvent.click(screen.getByRole("button", { name: "排除并重新生成" }));
  expect(onExcludeEvidence).toHaveBeenCalledWith("e1", "与目标游戏无关");
});
```

- [ ] **Step 3: Run UI tests and verify the missing component failure**

Run: `npm exec vitest -- run packages/ui/test/research-workspace.test.tsx`

Expected: FAIL because the research feature components do not exist.

- [ ] **Step 4: Implement the approved visual hierarchy**

`ResearchWorkspace` accepts a discriminated view model:

```ts
export type ResearchWorkspaceModel =
  | { screen: "start"; recent: ResearchHistoryItem[]; mode: "fixture" | "live"; credentialsReady: boolean }
  | { screen: "progress"; gameName: string; stage: ResearchStageView; sources: SourceStatusView[]; canCancel: boolean; identityCandidates?: IdentityCandidateView[] }
  | { screen: "report"; report: SentimentReportView; evidence: EvidenceView[]; followUpAnswer?: string }
  | { screen: "history"; items: ResearchHistoryItem[] }
  | { screen: "settings"; settings: ResearchSettingsView };

export interface ResearchWorkspaceProps {
  model: ResearchWorkspaceModel;
  onNavigate?: (view: "research" | "history" | "settings") => void;
  onStart?: (request: { gameName: string; focus?: string }) => void;
  onCancel?: () => void;
  onChooseIdentity?: (candidateId: string) => void;
  onOpenResearch?: (researchId: string) => void;
  onUpdateResearch?: () => void;
  onAskFollowUp?: (question: string) => void;
  onExcludeEvidence?: (evidenceId: string, reason: string) => void;
  onSaveSettings?: (settings: ResearchSettingsInput) => void;
}
```

The start screen contains one literal H1, one game-name input, one optional focus textarea, and one primary action. The report renders verdict first, then three sample metrics, ranked topics, strengths/risks/controversies, coverage, evidence drawer, and follow-up form. Use buttons with Lucide icons supplied through `lucide-react`; use `aria-expanded`, `aria-controls`, labelled dialogs, and focus restoration for the evidence drawer.

Update `AppShell` so desktop navigation starts at `lg`, mobile navigation uses a dynamic column count, and three items do not reserve six columns:

```tsx
style={{ gridTemplateColumns: `repeat(${Math.max(1, props.navigation.length)}, minmax(0, 1fr))` }}
```

- [ ] **Step 5: Run component tests, UI type check, and UI build**

Run: `npm exec vitest -- run packages/ui/test/research-workspace.test.tsx`

Run: `npm.cmd run typecheck -w @gamepulse/ui`

Run: `npm.cmd run build -w @gamepulse/ui`

Expected: PASS with no React act warnings.

- [ ] **Step 6: Commit shared research UI**

```bash
git add packages/ui package-lock.json
git commit -m "feat: add responsive research workspace"
```

### Task 5: Connect the Electron Desktop App Through Trusted IPC

**Files:**
- Create: `apps/desktop/src/main/researchIpc.ts`
- Create: `apps/desktop/src/main/researchIpc.test.ts`
- Create: `apps/desktop/src/renderer/src/useDesktopResearch.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/types.ts`
- Replace: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: Write failing IPC service tests without booting Electron**

Extract a `DesktopResearchService` class and test it with a memory repository:

```ts
it("starts, lists, and excludes evidence through the desktop service", async () => {
  const service = new DesktopResearchService({
    repository: new MemoryResearchRepository(),
    collector: new FixtureResearchCollector(),
    reportGenerator: new DeterministicReportGenerator()
  });
  const events: ResearchRecord[] = [];
  const completed = await service.start({ gameName: "幻兽帕鲁", focus: "联机" }, (event) => events.push(event));
  expect(completed.status).toBe("completed");
  expect(events.map((event) => event.stage)).toContain("collection");
  const evidenceId = completed.evidence[0]!.id;
  const corrected = await service.excludeEvidence(completed.id, evidenceId, "与目标游戏无关");
  expect(corrected.exclusions).toContainEqual(expect.objectContaining({ evidenceId }));
  expect(await service.list()).toHaveLength(1);
});
```

- [ ] **Step 2: Run the desktop research test and verify failure**

Run: `npm exec vitest -- run apps/desktop/src/main/researchIpc.test.ts`

Expected: FAIL because `DesktopResearchService` does not exist.

- [ ] **Step 3: Implement IPC handlers and bridge types**

Expose only these methods:

```ts
research: {
  list(): Promise<ResearchRecord[]>;
  get(researchId: string): Promise<ResearchRecord | undefined>;
  start(request: { gameName: string; focus?: string }): Promise<ResearchRecord>;
  cancel(researchId: string): Promise<{ cancelled: boolean }>;
  excludeEvidence(researchId: string, evidenceId: string, reason: string): Promise<ResearchRecord>;
  regenerate(researchId: string): Promise<ResearchRecord>;
  onEvent(callback: (record: ResearchRecord) => void): () => void;
}
```

Every IPC handler calls `assertTrustedIpcSender`. Keep an `AbortController` per running research and delete it in `finally`. Validate strings with explicit length limits before passing them to shared code.

- [ ] **Step 4: Replace the desktop dashboard with `ResearchWorkspace`**

`useDesktopResearch` owns one reducer with `activeView`, `current`, `history`, `busy`, and `error`. It handles start, identity selection, refresh, cancellation, evidence exclusion, and report regeneration through IPC. For follow-up questions it calls shared `buildResearchFollowUp`; when a model is configured it streams the generated prompt through the existing model bridge, otherwise it displays the grounded fallback answer and a Settings CTA. `App.tsx` renders only the shared workspace and maps existing model and project-package operations into Settings > Advanced Data. Remove collector URL, raw SQLite stats, standalone RAG, and project package cards from the first viewport.

- [ ] **Step 5: Run desktop tests, type check, and build**

Run: `npm exec vitest -- run apps/desktop/src/main/researchIpc.test.ts apps/desktop/src/main/sqliteStore.test.ts`

Run: `npm.cmd run typecheck -w @gamepulse/desktop`

Run: `npm.cmd run build -w @gamepulse/desktop`

Expected: PASS.

- [ ] **Step 6: Commit desktop integration**

```bash
git add apps/desktop/src/main apps/desktop/src/preload apps/desktop/src/renderer
git commit -m "feat: focus desktop on game research reports"
```

### Task 6: Connect the Android App to the Same Workflow

**Files:**
- Create: `apps/mobile/src/research/useMobileResearch.ts`
- Create: `apps/mobile/src/research/useMobileResearch.test.ts`
- Replace: `apps/mobile/src/App.tsx`

- [ ] **Step 1: Write the mobile controller test**

```ts
it("runs and persists research without Electron APIs", async () => {
  const store = new MemoryLocalStore();
  await store.initialize();
  const controller = createMobileResearchController(store);
  const completed = await controller.start({ gameName: "幻兽帕鲁", focus: "联机稳定性" });
  expect(completed.status).toBe("completed");
  expect((await store.listResearches())[0]?.id).toBe(completed.id);
});
```

- [ ] **Step 2: Run the test and verify the missing controller failure**

Run: `npm exec vitest -- run apps/mobile/src/research/useMobileResearch.test.ts`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the local controller and replace six-tab navigation**

The controller calls shared `runResearch`, `continueResearchWithIdentity`, `refreshResearch`, `excludeResearchEvidence`, and `regenerateResearchReport` directly against `getLocalStore()`. Follow-up calls `buildResearchFollowUp`; when remote model credentials exist it streams the prompt through `RemoteModelGateway`, otherwise it returns the grounded fallback and exposes the Settings CTA. `App.tsx` uses only three navigation IDs: `research`, `history`, and `settings`. Keep file import/export under Settings > Advanced Data and keep model credential storage unchanged.

The mobile empty state must contain a primary “开始一次游戏研究” action. During progress, preserve game name and focus while allowing cancellation. The report and evidence drawer use the same shared components as desktop.

- [ ] **Step 4: Run mobile tests, type check, and production build**

Run: `npm exec vitest -- run apps/mobile/src/research/useMobileResearch.test.ts apps/mobile/src/storage/localStore.contract.test.ts`

Run: `npm.cmd run typecheck -w @gamepulse/mobile`

Run: `npm.cmd run build -w @gamepulse/mobile`

Expected: PASS.

- [ ] **Step 5: Commit mobile integration**

```bash
git add apps/mobile/src
git commit -m "feat: focus mobile on game research reports"
```

### Task 7: Verify Responsive UX and Document the Vertical Slice

**Files:**
- Modify: `README.md`
- Test: all existing and new test files

- [ ] **Step 1: Run the full automated baseline**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run build`

Expected: all commands exit 0.

- [ ] **Step 2: Start both previews**

Run desktop: `npm.cmd run desktop:dev`

Run mobile web preview on a separate port: `npm.cmd run dev -w @gamepulse/mobile -- --host 127.0.0.1 --port 5174 --strictPort`

Expected: Electron opens the desktop workspace; mobile preview is available at `http://127.0.0.1:5174/`.

- [ ] **Step 3: Perform Playwright responsive checks**

Check at 1440x960, 1024x768, 768x1024, and 390x844:

- Only three primary navigation items are visible.
- Tablet widths retain mobile navigation until the `lg` breakpoint.
- Game name, optional focus, and primary CTA never overlap.
- Progress rows remain stable as counts and error text change.
- Report verdict is visible before detailed metrics.
- Long Chinese game names and source titles wrap or truncate without expanding controls.
- Evidence drawer traps focus, closes with Escape, and restores focus to its trigger.
- Browser console contains no errors or warnings caused by the app.

- [ ] **Step 4: Update README with the new product flow and explicit fixture boundary**

Document:

```md
GamePulse 的默认流程是：填写游戏名称和可选研究问题，运行本地研究 Agent，查看带来源的风评报告，并基于当前证据继续追问。

当前研究纵向切片使用固定采集样本验证完整流程；真实搜索服务与平台采集器通过 `ResearchCollector` contract 逐个平台接入。界面会明确标识样本来源，不把固定样本描述为实时网络结果。
```

- [ ] **Step 5: Review the final diff for stale tool-oriented language**

Run: `rg -n "项目|全文搜索|本地 RAG|SQLite 已就绪|采集 URL|六个|grid-cols-6" apps/desktop/src/renderer apps/mobile/src packages/ui/src README.md`

Expected: matches remain only in Settings > Advanced Data, compatibility documentation, or internal implementation names.

- [ ] **Step 6: Commit verification and documentation**

```bash
git add README.md
git commit -m "docs: describe game research workflow"
```

## Final Verification Gate

Before declaring this plan complete:

1. Confirm `git diff --check` is clean.
2. Confirm the full test, type-check, and build commands pass after the last commit.
3. Confirm desktop and mobile both persist a completed report across reload.
4. Confirm excluding one evidence row creates a new report version without changing the original evidence body.
5. Confirm cancelled research has no report.
6. Confirm all fixture-derived screens visibly identify their data as a fixed validation sample.
7. Confirm unrelated user changes present before execution were preserved.
