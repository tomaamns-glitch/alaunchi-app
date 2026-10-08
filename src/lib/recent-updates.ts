// When each piece of content of an instance was last updated (or switched to
// another version) from the content manager — drives the "Actualizaciones" sort,
// which sinks recently updated items to the bottom in update order. Keyed by
// Modrinth projectId, since updating changes the file name (the path).
// localStorage, per instance: it's a display convenience, losing it is harmless.

const KEY_PREFIX = "alaunchi_recent_updates:";
/** How long an update counts as "recent". */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export type RecentUpdates = Record<string, number>;

export function loadRecentUpdates(instanceId: string): RecentUpdates {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + instanceId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RecentUpdates;
    const cutoff = Date.now() - RECENT_MS;
    return Object.fromEntries(Object.entries(parsed).filter(([, t]) => typeof t === "number" && t >= cutoff));
  } catch {
    return {};
  }
}

export function recordRecentUpdate(instanceId: string, projectId: string): RecentUpdates {
  const next = { ...loadRecentUpdates(instanceId), [projectId]: Date.now() };
  try {
    localStorage.setItem(KEY_PREFIX + instanceId, JSON.stringify(next));
  } catch {}
  return next;
}
