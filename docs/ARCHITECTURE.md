# Architecture

GamePulse is a local-first monorepo with two independent clients:

- `apps/desktop`: Electron application for Windows, including browser collection, SQLite, local search, RAG, OpenAI-compatible models, and Ollama.
- `apps/mobile`: standalone React and Capacitor Android application with SQLite, import/export, local search, evidence views, and remote RAG.
- `packages/shared`: domain types, local-store contracts, RAG functions, and `.gamepulse` codec.
- `packages/ui`: shared React components and application shell.
- `packages/userscript`: visible-page NDJSON exporter.

Each client owns its SQLite database and implements the same `LocalStore` contract. Project exchange uses an unencrypted `.gamepulse` ZIP with a versioned manifest and SHA-256 hashes.

The retrieval pipeline normalizes comments, builds safe FTS5 queries, applies Chinese token fallback, reranks evidence, limits duplicate sources, trims context, and generates citations. No embedding or device-side LLM is required in version 1.

Credentials are platform-owned: Electron `safeStorage` on Windows and Android Keystore-backed secure storage on Android. Renderer code receives only redacted configuration state.
