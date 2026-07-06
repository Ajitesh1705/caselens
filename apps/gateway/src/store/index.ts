import { config } from "../config.js";
import type { Store } from "./types.js";
import { MongoStore } from "./mongoStore.js";
import { MemoryStore } from "./memoryStore.js";

export type { Store } from "./types.js";

// Selects MongoDB when reachable; otherwise falls back to in-memory so the app
// always boots. Set DEGRADE_GRACEFULLY=false to make Mongo mandatory.
export async function createStore(): Promise<Store> {
  try {
    const store = await MongoStore.connect(config.mongoUrl, config.mongoDb);
    await store.init();
    console.log(`[store] connected to MongoDB at ${config.mongoUrl}`);
    return store;
  } catch (err) {
    if (!config.degradeGracefully) {
      throw new Error(
        `MongoDB unreachable at ${config.mongoUrl}: ${(err as Error).message}`,
      );
    }
    console.warn(
      `[store] MongoDB unreachable (${(err as Error).message}); using in-memory store`,
    );
    const store = new MemoryStore();
    await store.init();
    return store;
  }
}
