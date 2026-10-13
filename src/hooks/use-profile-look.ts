import { useEffect, useState } from "react";
import { getProfileLook } from "@/services/public-profile";

export interface ProfileLook {
  /** null = never set one (callers fall back to DEFAULT_PROFILE_BANNER). */
  bannerUrl: string | null;
  /** FRAME_DECORATIONS id, "none" when unset. */
  frame: string;
}

// One read per uuid for the whole session (lists re-render a lot and the
// banner/frame rarely change; a new one shows up on the next app start).
const cache = new Map<string, Promise<ProfileLook>>();

/** Someone's profile banner + frame, for list rows styled like their profile
 *  card. undefined while loading. */
export function useProfileLook(uuid: string): ProfileLook | undefined {
  const [look, setLook] = useState<ProfileLook | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let p = cache.get(uuid);
    if (!p) {
      p = getProfileLook(uuid).catch(() => ({ bannerUrl: null, frame: "none" }));
      cache.set(uuid, p);
    }
    p.then((l) => !cancelled && setLook(l));
    return () => {
      cancelled = true;
    };
  }, [uuid]);
  return look;
}
