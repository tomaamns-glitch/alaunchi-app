// Favorite mods/shaders/resourcepacks — a bookmark list independent of any one
// instance (a mod stays favorited regardless of which pack you found it in).
// localStorage is still the source of truth for your OWN reads (fast,
// synchronous, works offline) — toggleFavorite additionally mirrors the
// updated list to Firebase (fire-and-forget) so friends can see it on your
// public profile. See services/public-profile.ts.

import { useAuth } from "@/hooks/use-auth";
import { publishFavorites } from "./public-profile";

export type FavoriteCategory = "mods" | "shaderpacks" | "resourcepacks";

export interface FavoriteEntry {
  projectId: string;
  title: string;
  iconUrl?: string;
  category: FavoriteCategory;
  addedAt: number;
}

const STORAGE_KEY = "alaunchi_favorites";

function readAll(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(list: FavoriteEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getFavorites(category?: FavoriteCategory): FavoriteEntry[] {
  const all = readAll();
  return category ? all.filter((f) => f.category === category) : all;
}

export function isFavorite(projectId: string): boolean {
  return readAll().some((f) => f.projectId === projectId);
}

/** Adds the entry if it wasn't favorited, removes it if it was. Returns the
 *  new state (true = now favorited) so the caller can update its own toggle
 *  without a second read. */
export function toggleFavorite(entry: Omit<FavoriteEntry, "addedAt">): boolean {
  const all = readAll();
  const idx = all.findIndex((f) => f.projectId === entry.projectId);
  let result: boolean;
  if (idx >= 0) {
    all.splice(idx, 1);
    writeAll(all);
    result = false;
  } else {
    all.push({ ...entry, addedAt: Date.now() });
    writeAll(all);
    result = true;
  }

  const uuid = useAuth.getState().uuid;
  if (uuid) publishFavorites(uuid, all).catch(() => {});

  return result;
}
