import type { PresenceEntry } from "@/services/presence";
import type { FriendEntry } from "@/services/friends";
import type { UserActivity } from "@/services/user-activity";

/** Combines a friends list with everyone's live activity into the same
 *  PresenceEntry shape presence.ts already uses, so PresenceList/sortAllPresence
 *  (and anything else built for per-modpack presence) work unchanged for
 *  friends too. A friend with no activity record yet (never opened the app
 *  since this feature shipped) just reads as offline, last seen when the
 *  friendship itself started. Shared by presence-button.tsx (the friends
 *  section) and chat-contact-rail.tsx (the "nuevo chat" roster in general mode). */
export function toPresenceEntries(
  friends: Record<string, FriendEntry>,
  activity: Record<string, UserActivity>
): Record<string, PresenceEntry> {
  const out: Record<string, PresenceEntry> = {};
  for (const [uuid, friend] of Object.entries(friends)) {
    const a = activity[uuid];
    out[uuid] = {
      username: friend.username,
      online: a ? a.status !== "offline" : false,
      lastSeen: a?.lastSeen ?? friend.since,
      playing: a?.status === "playing",
    };
  }
  return out;
}
