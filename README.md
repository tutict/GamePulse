# GamePulse

GamePulse is a local-first game community intelligence workspace for product and operations teams. It ingests public community comments, reviews, and thread titles from Steam, Reddit, Bilibili, NGA, TapTap, Heybox, and CSV/JSON imports, then produces evidence-backed Chinese sentiment reports around game versions.

The project is being migrated into an Electron desktop app. The desktop shell already uses React 19, Vite, Electron, and TypeScript `7.0.1-rc`; the existing Fastify/Postgres/Redis stack is still available while the data layer is moved into the desktop runtime.

## Quick Start

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Build the Electron desktop app:

   ```powershell
   npm.cmd run desktop:build
   ```

3. Start the Electron desktop app in development mode:

   ```powershell
   npm.cmd run desktop:dev
   ```

4. Build distributable desktop packages:

   ```powershell
   npm.cmd run desktop:dist
   ```

## Legacy Local Stack

The original local web/API stack is still present for development and comparison while the desktop migration is in progress.

1. Start Postgres/pgvector and Redis:

   ```powershell
   docker compose up postgres redis
   ```

2. Run database migrations:

   ```powershell
   npm.cmd run db:migrate
   ```

3. Start the local web/API/worker stack:

   ```powershell
   npm.cmd run dev
   ```

4. Open the dashboard at `http://localhost:5173`.

The API runs on `http://localhost:4317`. The legacy userscript lives at `packages/userscript/src/gamepulse.user.js`.

## What Is Implemented

- TypeScript monorepo pinned to `typescript@7.0.1-rc`.
- Electron desktop workspace at `apps/desktop` with main, preload, and React renderer processes.
- React/Vite dashboard foundation for project configuration, imports, analysis runs, report review, and evidence search.
- Local Fastify API with Postgres persistence and Redis/BullMQ analysis queue.
- Docker Compose for Postgres/pgvector, Redis, API, Worker, and Web.
- CSV/JSON import, batch ingestion, comment search, project setup, reports, and analysis runs.
- Heuristic analysis pipeline with cached labels, topic and BUG clustering, evidence refs, version-window comparison, and churn-risk indexing.
- Configurable model-provider interfaces for OpenAI-compatible APIs and Ollama.
- Tampermonkey/Violentmonkey userscript that captures current visible page comments into the local API without storing cookies.

## Desktop Migration Direction

The target desktop architecture is Electron + React renderer + preload IPC + local services. The current desktop app is the first migration step: it starts, builds, and exposes runtime information through preload. Next steps are to move the existing dashboard into the desktop renderer, replace HTTP calls with IPC, migrate storage from Postgres/Redis to SQLite/FTS5, and replace the userscript workflow with an in-app browser collector.

## Validation

Use these commands before pushing changes:

```powershell
npm.cmd run desktop:build
npm.cmd run typecheck
npm.cmd test
```

## Scale Posture

The legacy database and queue are designed for million-row local history. The first analysis implementation uses chunked reads, cached labels, SQL aggregation, and representative evidence sampling instead of sending every comment to an LLM. The desktop migration should preserve this posture while reducing external runtime dependencies.
