import type { Modpack } from "@/services/github";
import { groupKeyFor } from "@/services/group-chat";

/** What mc:launch needs so the in-game overlay looks like this instance: its
 *  picture (icon + accent color) and, for online instances, the group chat
 *  room that also turns on Participantes. Every Play button must pass it —
 *  the home carousel launches on its own (home.tsx), not via useLaunchModpack. */
export function overlayLaunchInfo(pack: Modpack): { imageUrl?: string; groupKey?: string } {
  const online = !!pack.repoUrl && !pack.outOfNetwork && pack.source !== "custom";
  return {
    imageUrl: pack.imageUrl || undefined,
    groupKey: online ? groupKeyFor(pack) : undefined,
  };
}
