import { useEffect, useState } from "react";
import { getProfileLook } from "@/services/public-profile";

export interface ProfileLook {
  /** null = never set one (callers fall back to DEFAULT_PROFILE_BANNER). */
  bannerUrl: string | null;
  /** FRAME_DECORATIONS id, "none" when unset. */
  frame: string;
  /** ICON_DECORATIONS id, "none" when unset. */
  iconDecoration: string;
}

// One read per uuid for the whole session (lists re-render a lot and the
// banner/frame rarely change; a new one shows up on the next app start —
// except your own, which Personalizar refreshes, see refreshProfileLook).
const cache = new Map<string, Promise<ProfileLook>>();
const listeners = new Map<string, Set<(look: ProfileLook) => void>>();

const fetchLook = (uuid: string) =>
  getProfileLook(uuid).catch(() => ({ bannerUrl: null, frame: "none", iconDecoration: "none" }));

/** Re-reads one profile's look and updates every row showing it (used after
 *  you change your own banner/frame/icon decoration). */
export function refreshProfileLook(uuid: string): void {
  const p = fetchLook(uuid);
  cache.set(uuid, p);
  p.then((l) => listeners.get(uuid)?.forEach((fn) => fn(l)));
}

/** Someone's profile banner + frame + icon decoration, for list rows styled
 *  like their profile card. undefined while loading. */
export function useProfileLook(uuid: string): ProfileLook | undefined {
  const [look, setLook] = useState<ProfileLook | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let p = cache.get(uuid);
    if (!p) {
      p = fetchLook(uuid);
      cache.set(uuid, p);
    }
    p.then((l) => !cancelled && setLook(l));
    const set = listeners.get(uuid) ?? new Set();
    set.add(setLook);
    listeners.set(uuid, set);
    return () => {
      cancelled = true;
      set.delete(setLook);
    };
  }, [uuid]);
  return look;
}
