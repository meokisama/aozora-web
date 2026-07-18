/**
 * Web reimplementation of the desktop app's `system.clearAllData()`. There is no
 * main process to wipe SQLite/dictionaries here — instead we drop every browser
 * store this app owns and reload:
 *   - IndexedDB: library + reading state (`aozora-web`), the parsed-book cache
 *     (`aozora-reader`), and imported custom fonts (`aozora-fonts`).
 *   - localStorage: the Zustand-persisted preference stores and the saved locale.
 */

/** IndexedDB databases created across the app (see each module's `DB_NAME`). */
const IDB_NAMES = ["aozora-web", "aozora-reader", "aozora-fonts"];

/** localStorage keys we own — persisted stores + the i18n language choice. */
const LOCAL_STORAGE_KEYS = ["aozora-reader-settings", "aozora-library-prefs", "aozora-stats-prefs", "aozora-language"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    // Resolve on every outcome — a blocked/errored delete must not stall the wipe.
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Wipe all app data, then reload so every in-memory store re-initialises. */
export async function clearAllData(): Promise<void> {
  for (const key of LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
  await Promise.all(IDB_NAMES.map(deleteDatabase));
  window.location.reload();
}
