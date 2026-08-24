const STORAGE_KEY = "skinShowcaseUsernames";

// A few well-known Mojang accounts as a starter showcase — easy to extend from
// the UI, this list is just what a fresh install ships with.
const DEFAULT_SHOWCASE = ["Notch", "jeb_", "Dinnerbone", "Grumm"];

export function getShowcaseUsernames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SHOWCASE;
}

export function addShowcaseUsername(username: string): string[] {
  const trimmed = username.trim();
  const current = getShowcaseUsernames();
  if (!trimmed || current.some((u) => u.toLowerCase() === trimmed.toLowerCase())) return current;
  const next = [...current, trimmed];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeShowcaseUsername(username: string): string[] {
  const next = getShowcaseUsernames().filter((u) => u !== username);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
