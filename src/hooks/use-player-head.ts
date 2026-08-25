import { useEffect, useState } from "react";
import { getSkinUrlForUuid, fetchTextureAsDataUrl, renderHeadIcon } from "@/services/skin";

const cache = new Map<string, string>();
const fullSkinCache = new Map<string, string>();
const listeners = new Set<() => void>();

/** Call after successfully changing your own equipped skin, so every head icon
 *  showing your account (own avatar, presence list) picks up the new one right
 *  away instead of keeping whatever was cached from before the change. */
export function invalidatePlayerHead(uuid: string) {
  cache.delete(uuid);
  fullSkinCache.delete(uuid);
  listeners.forEach((fn) => fn());
}

/** Non-hook version of usePlayerHeadUrl, for call sites that aren't React
 *  components — namely, building a Windows notification's icon from outside
 *  the render tree. Shares the same cache, so it's free once the hook (or a
 *  previous call here) has already resolved this uuid. */
export async function getPlayerHeadDataUrl(uuid: string): Promise<string | null> {
  const cached = cache.get(uuid);
  if (cached) return cached;
  const resolved = await getSkinUrlForUuid(uuid);
  if (!resolved) return null;
  const skinDataUrl = await fetchTextureAsDataUrl(resolved.skinUrl);
  const head = await renderHeadIcon(skinDataUrl, 48);
  cache.set(uuid, head);
  listeners.forEach((fn) => fn());
  return head;
}

/** Resolves a player's real head icon (face + hat layer) via the Mojang session
 *  server and the app's own texture proxy — no third-party mirror involved, so
 *  it neither goes stale after a skin change nor falls back to a generic Steve
 *  on a mirror's own lookup failure. Returns null while loading/unresolved;
 *  callers should keep their existing initials fallback for that case. */
export function usePlayerHeadUrl(uuid: string | null | undefined): string | null {
  const [headUrl, setHeadUrl] = useState<string | null>(() => (uuid ? (cache.get(uuid) ?? null) : null));

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (!uuid) {
        setHeadUrl(null);
        return;
      }
      const cached = cache.get(uuid);
      if (cached) {
        setHeadUrl(cached);
        return;
      }
      (async () => {
        const resolved = await getSkinUrlForUuid(uuid);
        if (!resolved || cancelled) return;
        const skinDataUrl = await fetchTextureAsDataUrl(resolved.skinUrl);
        if (cancelled) return;
        const head = await renderHeadIcon(skinDataUrl, 48);
        if (cancelled) return;
        cache.set(uuid, head);
        setHeadUrl(head);
      })().catch(() => {});
    };

    load();
    listeners.add(load);
    return () => {
      cancelled = true;
      listeners.delete(load);
    };
  }, [uuid]);

  return headUrl;
}

/** Resolves a player's full equipped skin texture (for the 3D viewer, which
 *  needs the whole body, not just the head crop) — same source and caching
 *  story as usePlayerHeadUrl. Returns null while loading/unresolved. */
export function usePlayerSkinUrl(uuid: string | null | undefined): string | null {
  const [skinUrl, setSkinUrl] = useState<string | null>(() => (uuid ? (fullSkinCache.get(uuid) ?? null) : null));

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (!uuid) {
        setSkinUrl(null);
        return;
      }
      const cached = fullSkinCache.get(uuid);
      if (cached) {
        setSkinUrl(cached);
        return;
      }
      (async () => {
        const resolved = await getSkinUrlForUuid(uuid);
        if (!resolved || cancelled) return;
        const skinDataUrl = await fetchTextureAsDataUrl(resolved.skinUrl);
        if (cancelled) return;
        fullSkinCache.set(uuid, skinDataUrl);
        setSkinUrl(skinDataUrl);
      })().catch(() => {});
    };

    load();
    listeners.add(load);
    return () => {
      cancelled = true;
      listeners.delete(load);
    };
  }, [uuid]);

  return skinUrl;
}
