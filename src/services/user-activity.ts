import { ref, set, onValue, onDisconnect, serverTimestamp, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";

// Unlike presence.ts (strictly per-modpack: "is this player in THIS pack right
// now") this is one node per user answering "what are they doing at all, right
// now" — the single status the chat header needs instead of juggling a
// per-modpack online flag plus a separate "last connection" timestamp. Also
// the only place custom/local instance activity becomes visible to anyone but
// the player themselves — presence.ts's markOnline writes to a path keyed by
// the instance's locally-generated id, which no other user could ever guess
// to subscribe to.

export type ActivityStatus = "online" | "offline" | "playing";

export interface UserActivity {
  username: string;
  status: ActivityStatus;
  /** Server-assigned ms timestamp of the last known state change. */
  lastSeen: number;
  /** Only present while status === "playing". */
  instanceId?: string;
  instanceName?: string;
  instanceSource?: "github" | "custom";
}

/**
 * Marks the player online but not currently playing anything — call once at
 * startup as soon as we know who's logged in, and again whenever a play
 * session ends (dropping back from "playing" to plain "online"). Arms a
 * server-side onDisconnect fallback so a crash/power-loss/force-quit flips
 * this to offline even if the app never gets to clean up after itself — same
 * pattern presence.ts's markOnline already uses. Closing to tray doesn't
 * disconnect the underlying connection (the app keeps running in the
 * background), so this correctly stays "online" in that case, not "offline".
 */
export async function markAppOnline(uuid: string, username: string): Promise<void> {
  const activityRef = ref(rtdb, `userActivity/${uuid}`);
  await onDisconnect(activityRef).set({ username, status: "offline", lastSeen: serverTimestamp() });
  await set(activityRef, { username, status: "online", lastSeen: serverTimestamp() });
}

/** Marks the player as actively playing one instance (catalog or custom),
 *  overwriting the plain "online" state written by markAppOnline. */
export async function markPlayingInstance(
  uuid: string,
  username: string,
  instanceId: string,
  instanceName: string,
  instanceSource: "github" | "custom"
): Promise<void> {
  const activityRef = ref(rtdb, `userActivity/${uuid}`);
  await onDisconnect(activityRef).set({ username, status: "offline", lastSeen: serverTimestamp() });
  await set(activityRef, {
    username,
    status: "playing",
    instanceId,
    instanceName,
    instanceSource,
    lastSeen: serverTimestamp(),
  });
}

/** Live-subscribes to one player's current activity. */
export function subscribePlayingStatus(
  uuid: string,
  callback: (activity: UserActivity | null) => void
): Unsubscribe {
  const activityRef = ref(rtdb, `userActivity/${uuid}`);
  const handler = onValue(activityRef, (snap) => callback(snap.val() ?? null));
  return () => off(activityRef, "value", handler);
}
