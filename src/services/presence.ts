import { ref, update, runTransaction, onValue, onDisconnect, serverTimestamp, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export interface PresenceEntry {
  username: string;
  online: boolean;
  /** Server-assigned ms timestamp of the last known state change. */
  lastSeen: number;
  /** Total time played on this modpack — only present once a session has ended
   *  at least once; see updatePlaytime. */
  playtimeMs?: number;
  /** Only meaningful for entries synthesized from user-activity.ts (the
   *  friends section of the players panel) — true when online because
   *  they're actively playing something, not just because the app is open.
   *  Per-modpack presence entries never set this (online there already only
   *  ever means "playing this one instance"). */
  playing?: boolean;
  /** Same entries: the instance they're playing, when `playing`. */
  playingName?: string;
}

/** Marks a player online for a modpack, and arms a server-side fallback (via
 *  onDisconnect) that flips them back offline if the app dies without a clean
 *  exit — a network drop, a crash, or the whole PC losing power. */
export async function markOnline(modpackId: string, uuid: string, username: string): Promise<void> {
  const presenceRef = ref(rtdb, `presence/${modpackId}/${uuid}`);
  // update, not set: a set would erase the playtimeMs kept in the same node
  // (on every launch, and on a crash/disconnect for good).
  await onDisconnect(presenceRef).update({ username, online: false, lastSeen: serverTimestamp() });
  await update(presenceRef, { username, online: true, lastSeen: serverTimestamp() });
}

/** Marks a player offline for a modpack (clean exit — the game process ended
 *  while the launcher was still around to notice, via the same watcher that
 *  powers playtime tracking). */
export async function markOffline(modpackId: string, uuid: string, username: string): Promise<void> {
  const presenceRef = ref(rtdb, `presence/${modpackId}/${uuid}`);
  await update(presenceRef, { username, online: false, lastSeen: serverTimestamp() });
}

/** Adds a finished session to this player's published playtime for one modpack
 *  (atomic, so two PCs ending sessions at once don't lose either). Never
 *  lowers it: a PC that doesn't have the old hours (new PC, reinstall) only
 *  adds what it played. With nothing published yet it starts from this PC's
 *  total, which is the history it has. */
export async function addPlaytime(modpackId: string, uuid: string, sessionMs: number, localTotalMs: number): Promise<void> {
  await runTransaction(ref(rtdb, `presence/${modpackId}/${uuid}/playtimeMs`), (cur) => {
    if (typeof cur !== "number") return Math.max(localTotalMs, sessionMs);
    return cur + Math.max(0, sessionMs);
  });
}

/** Live-subscribes to one player's total playtime on one modpack (undefined
 *  until they've finished a session there). */
export function subscribePlayerPlaytime(
  modpackId: string,
  uuid: string,
  callback: (playtimeMs: number | undefined) => void
): Unsubscribe {
  const playtimeRef = ref(rtdb, `presence/${modpackId}/${uuid}/playtimeMs`);
  const handler = onValue(playtimeRef, (snap) => callback(snap.val() ?? undefined));
  return () => off(playtimeRef, "value", handler);
}

/** Live-subscribes to every player's presence for one modpack. Returns an
 *  unsubscribe function. */
export function subscribePresence(
  modpackId: string,
  callback: (entries: Record<string, PresenceEntry>) => void
): Unsubscribe {
  const presenceRef = ref(rtdb, `presence/${modpackId}`);
  const handler = onValue(presenceRef, (snap) => callback(snap.val() || {}));
  return () => off(presenceRef, "value", handler);
}

export const PRESENCE_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function byOnlineThenRecency(a: PresenceEntry, b: PresenceEntry): number {
  if (a.online !== b.online) return a.online ? -1 : 1;
  return (b.lastSeen || 0) - (a.lastSeen || 0);
}

/** Online players first, then anyone seen within the last 7 days — older
 *  entries just age out of view instead of growing the list forever. Used for
 *  the quick popup; the "Todos" dialog shows everyone via sortAllPresence. */
export function sortAndFilterPresence(entries: Record<string, PresenceEntry>): [string, PresenceEntry][] {
  const cutoff = Date.now() - PRESENCE_RECENT_WINDOW_MS;
  return Object.entries(entries)
    .filter(([, e]) => e.online || (e.lastSeen && e.lastSeen >= cutoff))
    .sort(([, a], [, b]) => byOnlineThenRecency(a, b));
}

/** Everyone who has ever had a presence entry for this modpack, online first. */
export function sortAllPresence(entries: Record<string, PresenceEntry>): [string, PresenceEntry][] {
  return Object.entries(entries).sort(([, a], [, b]) => byOnlineThenRecency(a, b));
}
