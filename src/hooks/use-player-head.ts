import { useEffect, useState } from "react";
import { getSkinUrlForUuid, fetchTextureAsDataUrl, renderHeadIcon } from "@/services/skin";

const cache = new Map<string, string>();
const listeners = new Set<() => void>();

/** Call after successfully changing your own equipped skin, so every head icon
 *  showing your account (own avatar, presence list) picks up the new one right
 *  away instead of keeping whatever was cached from before the change. */
export function invalidatePlayerHead(uuid: string) {
  cache.delete(uuid);
  listeners.forEach((fn) => fn());
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
