# GamePulse Architecture

## Runtime

GamePulse runs as a local Docker stack:

- `postgres`: Postgres 16 with pgvector for durable storage and future vector search.
- `redis`: BullMQ queue backing analysis jobs.
- `api`: Fastify service exposing local HTTP APIs.
- `worker`: background analysis runner.
- `web`: Vite dashboard.
- `userscript`: optional Tampermonkey/Violentmonkey page collector that posts visible comments to `localhost`.

## Data Flow

1. A project defines platform links, version windows, and entity aliases for roles, systems, modes, and versions.
2. Data arrives through CSV/JSON import, Steam/Reddit connectors, or userscript batch ingestion.
3. The API normalizes text, hashes author identity by default, de-duplicates by project/platform/content hash, and stores raw evidence.
4. Analysis runs classify comments in chunks, cache labels, aggregate clusters in SQL, and generate a Chinese markdown report with evidence refs.
5. The dashboard reads reports and lets users search original evidence.

## Boundaries

The first version does not store cookies, automate hidden account data, or claim true retention prediction. Player-loss risk is a public-opinion risk index derived from text signals.

