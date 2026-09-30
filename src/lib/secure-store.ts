/**
 * Credentials the renderer needs (creator's GitHub tokens, granted read
 * tokens) — kept out of localStorage, which is a plain file on disk anyone
 * can read. In Electron they live in secrets.json, encrypted by main.js with
 * safeStorage (DPAPI); here they're cached in memory so callers like
 * lib/sources.ts can stay synchronous.
 *
 * initSecureStore() must resolve before anything reads a secret — main.tsx
 * awaits it before rendering. Outside Electron (plain browser dev) it falls
 * back to localStorage.
 */

const eAPI = (window as any).electronAPI;
const hasSecureBackend = typeof eAPI?.readSecrets === "function";

/** localStorage keys that hold secrets and get migrated into the store on
 *  first run. Same names as before so existing values carry over. */
export const SECRET_KEYS = {
  githubAdminToken: "githubToken",
  githubReadToken: "githubReadToken",
  grantedSources: "alaunchi_granted_sources",
} as const;

type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

let cache: Record<string, string> = {};
let ready = false;
let readyResolve: () => void;
const readyPromise = new Promise<void>((r) => (readyResolve = r));
let writeChain: Promise<unknown> = Promise.resolve();

export async function initSecureStore(): Promise<void> {
  if (ready) return;
  try {
    if (hasSecureBackend) {
      cache = (await eAPI.readSecrets()) || {};
      // One-time migration of values saved in localStorage by older versions.
      let migrated = false;
      for (const key of Object.values(SECRET_KEYS)) {
        const legacy = localStorage.getItem(key);
        if (legacy == null) continue;
        if (cache[key] == null) cache[key] = legacy;
        migrated = true;
      }
      if (migrated) {
        await eAPI.writeSecrets(cache);
        Object.values(SECRET_KEYS).forEach((k) => localStorage.removeItem(k));
      }
    }
  } catch (e) {
    console.error("[secure-store] No se pudieron cargar los secretos:", e);
  } finally {
    ready = true;
    readyResolve();
  }
}

/** Resolves once initSecureStore has finished (successfully or not). */
export function whenSecureStoreReady(): Promise<void> {
  return readyPromise;
}

export function getSecret(key: SecretKey): string | null {
  if (!hasSecureBackend) return localStorage.getItem(key);
  return cache[key] ?? null;
}

export function setSecret(key: SecretKey, value: string): void {
  if (!hasSecureBackend) return localStorage.setItem(key, value);
  cache = { ...cache, [key]: value };
  persist();
}

export function removeSecret(key: SecretKey): void {
  if (!hasSecureBackend) return localStorage.removeItem(key);
  if (!(key in cache)) return;
  const { [key]: _removed, ...rest } = cache;
  cache = rest;
  persist();
}

/** Writes are serialized so an older snapshot can never land after a newer one. */
function persist(): void {
  const snapshot = cache;
  writeChain = writeChain
    .then(() => eAPI.writeSecrets(snapshot))
    .catch((e) => console.error("[secure-store] No se pudieron guardar los secretos:", e));
}
