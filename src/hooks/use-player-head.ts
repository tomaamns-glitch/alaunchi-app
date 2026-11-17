import { useEffect, useState } from "react";
import { getCachedPlayerSkin, renderHeadIcon } from "@/services/skin";

// Players' skins and head icons, shared by every place that shows them (account
// menu, friends, chat, Actividad, members…).
//
// Why it's built like this — heads used to take seconds or even minutes:
//  · ONE request per player: every component asking for the same uuid shares
//    the same in-flight promise (before, ten components = ten queries to
//    Mojang at once, which got the app rate limited);
//  · main keeps a disk cache (`mc:get-player-skin`), so on launch heads come
//    straight from disk; once per session each cached skin is refreshed in the
//    background if it's older than STALE_MS, and updated in place if it changed;
//  · a failed load is retried with growing pauses instead of leaving the head
//    blank until the component happens to remount.

const STALE_MS = 30 * 60 * 1000;
const RETRY_DELAYS_MS = [4000, 12000, 30000, 60000];

interface Skin {
  /** data: URL of the full 64×64 texture. */
  dataUrl: string;
  variant: "SLIM" | "CLASSIC";
}

/** uuid → skin (null = default skin, nothing to draw). */
const skins = new Map<string, Skin | null>();
const heads = new Map<string, string>();
const inflight = new Map<string, Promise<Skin | null>>();
const refreshed = new Set<string>();
const failures = new Map<string, number>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function toSkin(entry: { base64: string | null; variant: "SLIM" | "CLASSIC" | null } | null): Skin | null {
  return entry?.base64 ? { dataUrl: `data:image/png;base64,${entry.base64}`, variant: entry.variant ?? "CLASSIC" } : null;
}

/** Asks Mojang again (through main) and updates every head of that player if the skin changed. */
async function refreshInBackground(uuid: string) {
  if (refreshed.has(uuid)) return;
  refreshed.add(uuid);
  try {
    const fresh = await getCachedPlayerSkin(uuid, true);
    if (!fresh) return;
    const next = toSkin(fresh);
    if (next?.dataUrl === skins.get(uuid)?.dataUrl) return;
    skins.set(uuid, next);
    heads.delete(uuid);
    notify();
  } catch {}
}

/** The player's skin: memory → in-flight request → main (disk cache, then Mojang). Throws when unreachable. */
function loadSkin(uuid: string): Promise<Skin | null> {
  if (skins.has(uuid)) return Promise.resolve(skins.get(uuid)!);
  const pending = inflight.get(uuid);
  if (pending) return pending;
  const p = (async () => {
    const entry = await getCachedPlayerSkin(uuid);
    if (!entry) throw new Error("skin no disponible");
    const skin = toSkin(entry);
    skins.set(uuid, skin);
    failures.delete(uuid);
    if (Date.now() - entry.fetchedAt > STALE_MS) void refreshInBackground(uuid);
    else refreshed.add(uuid);
    return skin;
  })().finally(() => inflight.delete(uuid));
  inflight.set(uuid, p);
  return p;
}

async function loadHead(uuid: string): Promise<string | null> {
  const cached = heads.get(uuid);
  if (cached) return cached;
  const skin = await loadSkin(uuid);
  if (!skin) return null;
  const head = await renderHeadIcon(skin.dataUrl, 48);
  heads.set(uuid, head);
  return head;
}

/** How long to wait before retrying a uuid that just failed (null = give up). */
function nextRetryDelay(uuid: string): number | null {
  const n = failures.get(uuid) ?? 0;
  failures.set(uuid, n + 1);
  if (n < RETRY_DELAYS_MS.length) return RETRY_DELAYS_MS[n];
  // Out of retries: forget the count after a while, so a later remount tries again.
  window.setTimeout(() => failures.delete(uuid), 5 * 60 * 1000);
  return null;
}

/** Call after successfully changing your own equipped skin, so every head icon
 *  showing your account picks up the new one right away (and the disk cache too). */
export function invalidatePlayerHead(uuid: string) {
  skins.delete(uuid);
  heads.delete(uuid);
  refreshed.delete(uuid);
  failures.delete(uuid);
  void refreshInBackground(uuid);
  notify();
}

/** Non-hook version of usePlayerHeadUrl (e.g. a Windows notification's icon).
 *  Shares the same caches and in-flight requests. */
export async function getPlayerHeadDataUrl(uuid: string): Promise<string | null> {
  return loadHead(uuid);
}

/** Shared loader behind both hooks: resolves, retries on failure, and re-runs
 *  when a skin changes (background refresh, invalidatePlayerHead). */
function usePlayerAsset(uuid: string | null | undefined, read: (uuid: string) => string | null | undefined, load: (uuid: string) => Promise<string | null>) {
  const [value, setValue] = useState<string | null>(() => (uuid ? (read(uuid) ?? null) : null));

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const run = () => {
      if (!uuid) {
        setValue(null);
        return;
      }
      const cached = read(uuid);
      if (cached !== undefined) setValue(cached ?? null);
      load(uuid)
        .then((v) => {
          if (!cancelled) setValue(v);
        })
        .catch(() => {
          if (cancelled) return;
          const delay = nextRetryDelay(uuid);
          if (delay !== null) retryTimer = window.setTimeout(run, delay);
        });
    };

    run();
    listeners.add(run);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      listeners.delete(run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  return value;
}

/** A player's head icon (face + hat layer), drawn locally from their real skin.
 *  Null while loading or for players with the default skin — callers keep their
 *  initials fallback for that. */
export function usePlayerHeadUrl(uuid: string | null | undefined): string | null {
  return usePlayerAsset(
    uuid,
    (id) => heads.get(id) ?? (skins.has(id) && skins.get(id) === null ? null : undefined),
    loadHead
  );
}

/** A player's full skin texture (data: URL) for the 3D viewer. Null while
 *  loading or for players with the default skin. */
export function usePlayerSkinUrl(uuid: string | null | undefined): string | null {
  return usePlayerAsset(
    uuid,
    (id) => (skins.has(id) ? (skins.get(id)?.dataUrl ?? null) : undefined),
    async (id) => (await loadSkin(id))?.dataUrl ?? null
  );
}
