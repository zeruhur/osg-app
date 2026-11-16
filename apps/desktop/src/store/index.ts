import { isTauri } from "@tauri-apps/api/core";
import { IndexedDbStore } from "./indexeddb";
import type { CampaignStore } from "./types";

export * from "./types";
export { MemoryStore } from "./memory";
export { IndexedDbStore } from "./indexeddb";

/** SQLite on the desktop; IndexedDB in a plain browser (`vite dev`). The SQLite module is loaded
 * only inside Tauri, so the browser build never touches the plugin. */
export async function defaultStore(): Promise<CampaignStore> {
  if (isTauri()) {
    const { SqliteStore } = await import("./sqlite");
    return new SqliteStore();
  }
  return new IndexedDbStore();
}
