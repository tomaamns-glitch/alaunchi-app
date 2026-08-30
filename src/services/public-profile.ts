import { ref, set, update, get, onValue, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { FavoriteEntry } from "./favorites";

/**
 * The public half of a player's Perfil — republished by the owner's own
 * Profile page whenever it loads, since none of this (playtime, which
 * instances they have, their favorites) lives anywhere but their own disk
 * otherwise. Same trust model as chat/presence/friends: written in the open;
 * "solo amigos" is enforced by the VIEWER's client choosing not to render it
 * (see areFriends in friends.ts), not by a database rule checking identity —
 * there's no real auth in this app to check against.
 */

export type ProfileVisibility = "everyone" | "friends";

/** One piece of content resolved to its Modrinth identity — the unit a
 *  private instance's "recipe" is made of. Never the file itself: whoever
 *  downloads it re-resolves versionId through Modrinth's own API. */
export interface RecipeEntry {
  category: "mods" | "shaderpacks" | "resourcepacks";
  projectId: string;
  versionId: string;
}

export interface PublicInstanceSummary {
  id: string;
  name: string;
  minecraftVersion: string;
  loaderType: "vanilla" | "forge" | "neoforge" | "fabric";
  imageUrl?: string;
  /** Only for private instances — everything in it Modrinth could identify,
   *  so a friend's launcher can redownload an equivalent copy from scratch.
   *  Absent for online (catalog) instances, which don't need one. */
  recipe?: RecipeEntry[];
  /** Files present that DIDN'T resolve to a Modrinth identity (a manually
   *  dropped-in jar, a hand-edited config, a world save) — these never
   *  travel. Shown so a friend downloading it knows the copy won't be 100%
   *  identical, not silently. */
  unresolvedCount?: number;
}

export interface PublicProfileSnapshot {
  username: string;
  visibility: ProfileVisibility;
  /** Firebase Storage download URL for a custom banner — absent means "use
   *  the bundled default" (see DEFAULT_PROFILE_BANNER in services/banner.ts). */
  bannerUrl?: string;
  totalPlaytimeMs: number;
  /** Ids into the shared GitHub catalog — the viewer's own useModpacks store
   *  already has the full objects, same catalog for everyone. */
  onlineInstanceIds: string[];
  /** Only instances the owner starred in the Hub — private instances are
   *  otherwise never published anywhere. */
  privateInstances: PublicInstanceSummary[];
  favorites: FavoriteEntry[];
  updatedAt: number;
}

/** Republishes everything EXCEPT visibility (a partial `update`, not `set`)
 *  and favorites (mirrored separately, live, by favorites.ts on every
 *  toggle) — so this can be called freely from Profile.tsx without racing or
 *  clobbering either of those. */
export async function publishProfile(
  uuid: string,
  data: Omit<PublicProfileSnapshot, "updatedAt" | "visibility" | "favorites">
): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { ...data, updatedAt: Date.now() });
}

export async function setProfileVisibility(uuid: string, visibility: ProfileVisibility): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { visibility });
}

export async function getProfileVisibility(uuid: string): Promise<ProfileVisibility> {
  const snap = await get(ref(rtdb, `profiles/${uuid}/visibility`));
  return (snap.val() as ProfileVisibility) ?? "everyone";
}

export async function setProfileBanner(uuid: string, bannerUrl: string): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { bannerUrl });
}

export async function getProfileBanner(uuid: string): Promise<string | null> {
  const snap = await get(ref(rtdb, `profiles/${uuid}/bannerUrl`));
  return snap.val() ?? null;
}

export function subscribeProfile(
  uuid: string,
  callback: (profile: PublicProfileSnapshot | null) => void
): Unsubscribe {
  const r = ref(rtdb, `profiles/${uuid}`);
  const handler = onValue(r, (snap) => {
    const val = snap.val();
    // Firebase RTDB drops empty arrays entirely rather than storing `[]` —
    // an owner with zero online instances (or zero favorites) reads back
    // `undefined` for that field, not an empty array. Normalize here, once,
    // instead of every render site needing its own `?? []`.
    callback(
      val && {
        ...val,
        onlineInstanceIds: val.onlineInstanceIds ?? [],
        privateInstances: val.privateInstances ?? [],
        favorites: val.favorites ?? [],
      }
    );
  });
  return () => off(r, "value", handler);
}

/** Live mirror target for favorites.ts — kept here (not there) since it's
 *  conceptually part of the public profile, not of the local favorites store. */
export async function publishFavorites(uuid: string, favorites: FavoriteEntry[]): Promise<void> {
  await set(ref(rtdb, `profiles/${uuid}/favorites`), favorites);
}
