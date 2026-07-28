import { runLocalStoreContract } from "../../../../packages/shared/test/localStoreContract.js";
import { MemoryLocalStore } from "./memoryLocalStore.js";

runLocalStoreContract("memory", async () => {
  const store = new MemoryLocalStore();
  await store.initialize();
  return store;
});
