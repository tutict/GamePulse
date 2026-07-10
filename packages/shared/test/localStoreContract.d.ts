import type { LocalStore } from "@gamepulse/shared";

export declare function runLocalStoreContract(
  name: string,
  createStore: () => Promise<LocalStore>
): void;
