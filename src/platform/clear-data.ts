/** Drops every browser store this app owns (IndexedDB + localStorage) and reloads. */

/** IndexedDB databases created across the app. */
const IDB_NAMES = ["aozora-web", "aozora-reader", "aozora-fonts"];

/** localStorage keys we own. */
const LOCAL_STORAGE_KEYS = ["aozora-reader-settings", "aozora-library-prefs", "aozora-stats-prefs", "aozora-language"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    // Resolve on every outcome so a blocked/errored delete can't stall the wipe.
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Wipe all app data, then reload. */
export async function clearAllData(): Promise<void> {
  for (const key of LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
  await Promise.all(IDB_NAMES.map(deleteDatabase));
  window.location.reload();
}
