import { stableHash } from "@gamepulse/shared";
import { query } from "./db.js";

export function embeddingCacheId(provider: string, model: string, input: string): string {
  return stableHash(`${provider}:${model}:${input}`);
}

export async function readCachedText(provider: string, model: string, kind: string, inputHash: string): Promise<string | undefined> {
  const result = await query<{ output_text?: string }>(
    "SELECT output_text FROM model_cache WHERE provider = $1 AND model = $2 AND kind = $3 AND input_hash = $4",
    [provider, model, kind, inputHash]
  );
  return result.rows[0]?.output_text;
}

export async function writeCachedText(provider: string, model: string, kind: string, inputHash: string, outputText: string): Promise<void> {
  await query(
    `INSERT INTO model_cache (id, provider, model, kind, input_hash, output_text)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (provider, model, kind, input_hash)
     DO UPDATE SET output_text = EXCLUDED.output_text`,
    [stableHash(`${provider}:${model}:${kind}:${inputHash}`), provider, model, kind, inputHash, outputText]
  );
}

export async function readCachedJson<T>(provider: string, model: string, kind: string, inputHash: string): Promise<T | undefined> {
  const result = await query<{ output_json?: T }>(
    "SELECT output_json FROM model_cache WHERE provider = $1 AND model = $2 AND kind = $3 AND input_hash = $4",
    [provider, model, kind, inputHash]
  );
  return result.rows[0]?.output_json;
}

export async function writeCachedJson(provider: string, model: string, kind: string, inputHash: string, outputJson: unknown): Promise<void> {
  await query(
    `INSERT INTO model_cache (id, provider, model, kind, input_hash, output_json)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (provider, model, kind, input_hash)
     DO UPDATE SET output_json = EXCLUDED.output_json`,
    [stableHash(`${provider}:${model}:${kind}:${inputHash}`), provider, model, kind, inputHash, JSON.stringify(outputJson)]
  );
}
