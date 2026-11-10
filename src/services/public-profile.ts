import { ref, set, update, get, runTransaction, onValue, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { FavoriteEntry } from "./favorites";
import type { Modpack } from "./github";
import { sameRepo } from "@/lib/sources";

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
  /** Short line shown under the username on the profile card. */
  bio?: string;
  /** Cosmetic id from decoration-catalog.ts — maps to SkinViewerAnimated's
   *  `effect` prop. "none" / absent = no particles. */
  avatarDecoration?: string;
  /** Cosmetic id from decoration-catalog.ts for the card's animated border.
   *  "none" / absent = plain border. */
  frame?: string;
  /** Colour of the "electric" frame (hex); absent = the default orange. */
  frameColor?: string;
  /** The frame is also drawn round the character's card. */
  frameOnCharacter?: boolean;
  /** Hidden from everyone else (on top of `visibility`). */
  hideInstances?: boolean;
  hideFavorites?: boolean;
  /** Cosmetic id from decoration-catalog.ts drawn around the player's head
   *  icon. "none" / absent = plain head. */
  iconDecoration?: string;
  /** Banner URLs this profile has used before (newest first, capped) — offered
   *  as quick re-picks in the edit dialog. */
  recentBanners?: string[];
  totalPlaytimeMs: number;
  /** Ids into the shared GitHub catalog — the viewer's own useModpacks store
   *  already has the full objects, same catalog for everyone. */
  onlineInstanceIds: string[];
  /** Same instances with the repo they come from. Ids alone aren't unique
   *  across creators (older ones have no random suffix), so matching by id only
   *  could show the viewer an unrelated pack of theirs. Absent on profiles
   *  published by older versions. */
  onlineInstanceRefs?: { id: string; repoUrl: string }[];
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
  // `data.totalPlaytimeMs` is only what THIS PC knows for the account: it must
  // never lower what is published (new PC, reinstall, other device's hours).
  let totalPlaytimeMs = data.totalPlaytimeMs;
  try {
    const remote = (await get(ref(rtdb, `profiles/${uuid}/totalPlaytimeMs`))).val();
    if (typeof remote === "number" && remote > totalPlaytimeMs) totalPlaytimeMs = remote;
  } catch {
    // Can't tell what is published: better not to write a possibly lower number.
    const { totalPlaytimeMs: _skip, ...rest } = data;
    await update(ref(rtdb, `profiles/${uuid}`), { ...rest, updatedAt: Date.now() });
    return;
  }
  await update(ref(rtdb, `profiles/${uuid}`), { ...data, totalPlaytimeMs, updatedAt: Date.now() });
}

/** The total published for this account (0 when none yet). */
export async function getPublishedPlaytime(uuid: string): Promise<number> {
  const v = (await get(ref(rtdb, `profiles/${uuid}/totalPlaytimeMs`))).val();
  return typeof v === "number" ? v : 0;
}

/** Adds a finished session to the published total (atomic; see addPlaytime). */
export async function addProfilePlaytime(uuid: string, sessionMs: number): Promise<void> {
  if (!(sessionMs > 0)) return;
  await runTransaction(ref(rtdb, `profiles/${uuid}/totalPlaytimeMs`), (cur) =>
    typeof cur === "number" ? cur + sessionMs : sessionMs
  );
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

/** Just what a list row needs to look like someone's profile card: banner,
 *  frame and icon decoration (three small reads, not the whole profile node). */
export async function getProfileLook(
  uuid: string
): Promise<{ bannerUrl: string | null; frame: string; frameColor: string | null; iconDecoration: string; iconColors: string | null; frameOnCharacter: boolean }> {
  const [banner, frame, icon, frameColor, iconColors, onCharacter] = await Promise.all([
    get(ref(rtdb, `profiles/${uuid}/bannerUrl`)),
    get(ref(rtdb, `profiles/${uuid}/frame`)),
    get(ref(rtdb, `profiles/${uuid}/iconDecoration`)),
    get(ref(rtdb, `profiles/${uuid}/frameColor`)),
    get(ref(rtdb, `profiles/${uuid}/iconColors`)),
    get(ref(rtdb, `profiles/${uuid}/frameOnCharacter`)),
  ]);
  return {
    bannerUrl: banner.val() ?? null,
    frame: frame.val() ?? "none",
    frameColor: frameColor.val() ?? null,
    iconDecoration: icon.val() ?? "none",
    iconColors: iconColors.val() ?? null,
    frameOnCharacter: onCharacter.val() === true,
  };
}

const RECENT_BANNERS_CAP = 6;

/** Sets the current banner and folds it into the "recently used" list (newest
 *  first, deduped, capped). Preset/default banners aren't remembered. */
export async function setProfileBannerRemembered(
  uuid: string,
  bannerUrl: string,
  remember: boolean
): Promise<string[]> {
  const patch: Record<string, unknown> = { bannerUrl };
  let recent: string[] = [];
  if (remember) {
    const snap = await get(ref(rtdb, `profiles/${uuid}/recentBanners`));
    const prev: string[] = Array.isArray(snap.val()) ? snap.val() : [];
    recent = [bannerUrl, ...prev.filter((u) => u !== bannerUrl)].slice(0, RECENT_BANNERS_CAP);
    patch.recentBanners = recent;
  }
  await update(ref(rtdb, `profiles/${uuid}`), patch);
  return recent;
}

/** Takes one of your own (uploaded / recent) banners out of the list. If it's
 *  the one in use, the profile goes back to the default banner. Returns the
 *  new list and whether the current banner was cleared. */
export async function removeRecentBanner(
  uuid: string,
  bannerUrl: string
): Promise<{ recent: string[]; clearedCurrent: boolean }> {
  const [recentSnap, currentSnap] = await Promise.all([
    get(ref(rtdb, `profiles/${uuid}/recentBanners`)),
    get(ref(rtdb, `profiles/${uuid}/bannerUrl`)),
  ]);
  const prev: string[] = Array.isArray(recentSnap.val()) ? recentSnap.val() : [];
  const recent = prev.filter((u) => u !== bannerUrl);
  const clearedCurrent = currentSnap.val() === bannerUrl;
  const patch: Record<string, unknown> = { recentBanners: recent.length ? recent : null };
  if (clearedCurrent) patch.bannerUrl = null;
  await update(ref(rtdb, `profiles/${uuid}`), patch);
  return { recent, clearedCurrent };
}

export interface ProfileCustomization {
  bio: string;
  avatarDecoration: string;
  frame: string;
  frameColor: string | null;
  frameOnCharacter: boolean;
  hideInstances: boolean;
  hideFavorites: boolean;
  iconDecoration: string;
  bannerUrl: string | null;
  recentBanners: string[];
  visibility: ProfileVisibility;
}

/** One read of everything the Editar / Personalizar dialogs need. */
export async function getProfileCustomization(uuid: string): Promise<ProfileCustomization> {
  const snap = await get(ref(rtdb, `profiles/${uuid}`));
  const v = snap.val() ?? {};
  return {
    bio: typeof v.bio === "string" ? v.bio : "",
    avatarDecoration: v.avatarDecoration ?? "none",
    frame: v.frame ?? "none",
    frameColor: typeof v.frameColor === "string" ? v.frameColor : null,
    frameOnCharacter: v.frameOnCharacter === true,
    hideInstances: v.hideInstances === true,
    hideFavorites: v.hideFavorites === true,
    iconDecoration: v.iconDecoration ?? "none",
    bannerUrl: v.bannerUrl ?? null,
    recentBanners: Array.isArray(v.recentBanners) ? v.recentBanners : [],
    visibility: (v.visibility as ProfileVisibility) ?? "everyone",
  };
}

export async function setProfileBio(uuid: string, bio: string): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { bio: bio.trim() || null });
}

export async function setProfileAvatarDecoration(uuid: string, id: string): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { avatarDecoration: id });
}

/** Live avatar-decoration id ("none" when unset) — only that one field, so
 *  the account menu / skin editor can follow changes made in Personalizar
 *  without pulling the whole profile snapshot. */
export function subscribeAvatarDecoration(uuid: string, callback: (id: string) => void): Unsubscribe {
  const r = ref(rtdb, `profiles/${uuid}/avatarDecoration`);
  const handler = onValue(r, (snap) => callback((snap.val() as string | null) ?? "none"));
  return () => off(r, "value", handler);
}

export async function setProfileFrame(uuid: string, id: string): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { frame: id });
}

/** Hides your instances / favorites from everyone viewing your profile. */
export async function setProfileHidden(uuid: string, patch: { hideInstances?: boolean; hideFavorites?: boolean }): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), patch);
}

/** Whether the frame is also drawn round the character's card. */
export async function setProfileFrameOnCharacter(uuid: string, on: boolean): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { frameOnCharacter: on });
}

/** Colours of the frames (see components/profile-frame parseFrameColors). */
export async function setProfileFrameColor(uuid: string, color: string): Promise<void> {
  if (!/^[a-z#0-9:,|]{1,120}$/i.test(color)) throw new Error("Color no válido.");
  await update(ref(rtdb, `profiles/${uuid}`), { frameColor: color });
}

export async function setProfileIconDecoration(uuid: string, id: string): Promise<void> {
  await update(ref(rtdb, `profiles/${uuid}`), { iconDecoration: id });
}

/** Live icon-decoration id ("none" when unset) — for your own head in the
 *  account menu, so a pick in Personalizar shows up right away. */
/** Colours of the recolourable icon decorations (lib/icon-colors.ts). */
export async function setProfileIconColors(uuid: string, value: string): Promise<void> {
  if (!/^[a-z#0-9:,|-]{1,200}$/i.test(value)) throw new Error("Color no válido.");
  await update(ref(rtdb, `profiles/${uuid}`), { iconColors: value });
}

/** Live profiles/{uuid}/iconColors (null when unset). */
export function subscribeIconColors(uuid: string, callback: (value: string | null) => void): Unsubscribe {
  const r = ref(rtdb, `profiles/${uuid}/iconColors`);
  const handler = onValue(r, (snap) => callback((snap.val() as string | null) ?? null));
  return () => off(r, "value", handler);
}

export function subscribeIconDecoration(uuid: string, callback: (id: string) => void): Unsubscribe {
  const r = ref(rtdb, `profiles/${uuid}/iconDecoration`);
  const handler = onValue(r, (snap) => callback((snap.val() as string | null) ?? "none"));
  return () => off(r, "value", handler);
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
        onlineInstanceRefs: val.onlineInstanceRefs ?? undefined,
        privateInstances: val.privateInstances ?? [],
        favorites: val.favorites ?? [],
        avatarDecoration: val.avatarDecoration ?? "none",
        frame: val.frame ?? "none",
        iconDecoration: val.iconDecoration ?? "none",
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

/** The profile owner's online instances that the VIEWER can also see — i.e.
 *  present in their own catalog (useModpacks only holds instances they have
 *  access to). The rest are left out entirely: someone without access to an
 *  instance must not learn its name or image from someone else's profile. */
export function visibleOnlineInstances(profile: PublicProfileSnapshot, viewerModpacks: Modpack[]): Modpack[] {
  const refs = profile.onlineInstanceRefs?.length
    ? profile.onlineInstanceRefs
    : profile.onlineInstanceIds.map((id) => ({ id, repoUrl: "" }));
  const out: Modpack[] = [];
  for (const r of refs) {
    const pack = viewerModpacks.find((mp) => mp.id === r.id && (!r.repoUrl || sameRepo(mp.repoUrl, r.repoUrl)));
    if (pack && !out.includes(pack)) out.push(pack);
  }
  return out;
}
