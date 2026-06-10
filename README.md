# GamePulse

GamePulse is a local-first game community intelligence workspace for product and operations teams. It ingests visible community comments, reviews, and thread titles from Steam, Reddit, Bilibili, NGA, TapTap, Heybox, and CSV/JSON imports, then produces evidence-backed Chinese sentiment reports around game versions.

## Quick Start

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Start Postgres/pgvector and Redis:

   ```powershell
   docker compose up postgres redis
   ```

3. Run database migrations:

   ```powershell
   npm.cmd run db:migrate
   ```

4. Start the local app:

   ```powershell
   npm.cmd run dev
   ```

5. Open the dashboard at `http://localhost:5173`.

The API runs on `http://localhost:4317`. The userscript lives at `packages/userscript/src/gamepulse.user.js`.

## What Is Implemented

- TypeScript monorepo with shared domain types.
- Local Fastify API with Postgres persistence and Redis/BullMQ analysis queue.
- Docker Compose for Postgres/pgvector, Redis, API, Worker, and Web.
- CSV/JSON import, batch ingestion, comment search, project setup, reports, and analysis runs.
- Heuristic analysis pipeline with cached labels, topic and BUG clustering, evidence refs, version-window comparison, and churn-risk indexing.
- Configurable model-provider interfaces for OpenAI-compatible APIs and Ollama.
- React/Vite dashboard for project configuration, imports, analysis runs, report review, and evidence search.
- Tampermonkey/Violentmonkey userscript that captures current visible page comments into the local API without storing cookies.

## Scale Posture

The database and queue are designed for million-row local history. The first analysis implementation uses chunked reads, cached labels, SQL aggregation, and representative evidence sampling instead of sending every comment to an LLM.

