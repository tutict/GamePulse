import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { runLocalStoreContract } from "../../../../packages/shared/test/localStoreContract.js";
import { SqliteLocalStore } from "./sqliteStore.js";

const directories: string[] = [];

afterAll(async () => {
  await Promise.all(directories.map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

runLocalStoreContract("desktop SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gamepulse-desktop-contract-"));
  directories.push(directory);
  const store = new SqliteLocalStore(join(directory, "store.db"));
  await store.initialize();
  return store;
});
