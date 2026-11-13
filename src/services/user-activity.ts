import { ref, set, update, onValue, onDisconnect, serverTimestamp, off, type Unsubscribe } from "firebase/database";
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
  /** The player set themselves "Ausente" (account menu → En línea / Ausente).
   *  Orthogonal to `status`: an away player is still connected (online or
   *  playing); everyone else shows them as away until they switch back. Gone
   *  once they disconnect (the onDisconnect write replaces the whole node). */
  away?: boolean;
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
  await reapplyAway(uuid);
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
  await reapplyAway(uuid);
}

// ── "Ausente" ───────────────────────────────────────────────────────────────
// The choice is kept on this PC per account (so it survives restarts) and
// mirrored into userActivity/{uuid}/away for everyone else. The writes above
// replace the whole node, so they put `away` back right after. A separate
// update (not part of those sets) on purpose: if the database rules ever
// rejected the field, only "Ausente" would fail — never being shown online.

const AWAY_KEY = (uuid: string) => `alaunchi_away:${uuid}`;

/** Whether this account chose "Ausente" on this PC. */
export function isAwayStored(uuid: string): boolean {
  try {
    return localStorage.getItem(AWAY_KEY(uuid)) === "1";
  } catch {
    return false;
  }
}

async function reapplyAway(uuid: string): Promise<void> {
  if (isAwayStored(uuid)) await update(ref(rtdb, `userActivity/${uuid}`), { away: true });
}

/** Sets or clears "Ausente": remembered here and published straight away. */
export async function setAwayStatus(uuid: string, away: boolean): Promise<void> {
  // Published first: if it fails, the choice isn't kept either (the button
  // would otherwise say "Ausente" while everyone sees "En línea").
  await update(ref(rtdb, `userActivity/${uuid}`), { away: away ? true : null });
  try {
    if (away) localStorage.setItem(AWAY_KEY(uuid), "1");
    else localStorage.removeItem(AWAY_KEY(uuid));
  } catch {
    /* no storage: still away for this session */
  }
}

/** What a player's status reads as, for the places that show it. */
export type ShownStatus = "playing" | "online" | "away" | "offline";

export function shownStatus(a: UserActivity | null | undefined): ShownStatus {
  if (!a || a.status === "offline") return "offline";
  if (a.away) return "away";
  return a.status === "playing" ? "playing" : "online";
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

/** Live-subscribes to everyone's current activity at once — for a friends
 *  list (online-now / seen-recently), where checking one uuid at a time isn't
 *  practical. Callers filter down to their own friends client-side, same as
 *  presence.ts's per-modpack subscribePresence already reads a whole node and
 *  lets the caller pick out who matters. */
export function subscribeAllActivity(
  callback: (all: Record<string, UserActivity>) => void
): Unsubscribe {
  const activityRef = ref(rtdb, "userActivity");
  const handler = onValue(activityRef, (snap) => callback(snap.val() || {}));
  return () => off(activityRef, "value", handler);
}
