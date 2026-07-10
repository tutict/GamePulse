import { Capacitor } from "@capacitor/core";
import type { LocalStore } from "@gamepulse/shared";
import { CapacitorSqliteLocalStore } from "./capacitorSqliteStore.js";
import { MemoryLocalStore } from "./memoryLocalStore.js";

let storePromise: Promise<LocalStore> | undefined;

export function getLocalStore(): Promise<LocalStore> {
  storePromise ??= createLocalStore();
  return storePromise;
}

async function createLocalStore(): Promise<LocalStore> {
  const store = Capacitor.getPlatform() === "web"
    ? new MemoryLocalStore()
    : new CapacitorSqliteLocalStore();
  await store.initialize();
  return store;
}
