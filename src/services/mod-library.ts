import { ref as dbRef, get, onValue, push, remove, set, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { uploadSharedContent } from "@/services/content-share";
import type { ModrinthMatch, ModrinthProjectDetail, ModrinthUpdate } from "@/services/modrinth";

// Our own mod library ("Biblioteca de mods"): mods made by the group, published
// by one person and installable by every ALaunchi user from the instance manager.
//
// Catalog: Realtime Database `modLibrary/{modId}`. Files: the same hash-deduped
// Firebase Storage object store chat sharing already uses
// (`content-objects/{sha1}` + `contentObjects/{sha1}`), so a jar never uploads
// twice and no new Storage rule is needed. Icons are small data URLs stored in
// the catalog itself, like instance icons in alaunchi-meta.json.
//
// Only MOD_LIBRARY_OWNER_EMAIL gets the editor. That check is client-side: there
// is no Firebase Auth in the app, so the RTDB rules can't tell who is writing.

export const MOD_LIBRARY_OWNER_EMAIL = "thereal_adriian@hotmail.com";

export function isModLibraryOwner(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === MOD_LIBRARY_OWNER_EMAIL;
}

export type LibraryLoader = "fabric" | "forge" | "neoforge";
export const LIBRARY_LOADERS: LibraryLoader[] = ["fabric", "forge", "neoforge"];
export const LIBRARY_LOADER_LABELS: Record<LibraryLoader, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

/** One uploaded jar: a mod for one Minecraft version + one loader. */
export interface LibraryBuild {
  mcVersion: string;
  loader: LibraryLoader;
  /** The mod's own version number, e.g. "1.2.0" (optional, free text). */
  modVersion: string;
  fileName: string;
  sha1: string;
  size: number;
  downloadUrl: string;
  uploadedAt: number;
}

export interface LibraryMod {
  id: string;
  name: string;
  description: string;
  /** Long-form details, Markdown. */
  details: string;
  /** data: URL (square PNG), or "" when none. */
  icon: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  /** Keyed by buildKey(mcVersion, loader). */
  builds: Record<string, LibraryBuild>;
}

export type LibraryModInfo = Pick<LibraryMod, "name" | "description" | "details" | "icon">;

const ROOT = "modLibrary";

/** RTDB keys can't contain "." — "1.21.1" + fabric → "1_21_1__fabric". */
export function buildKey(mcVersion: string, loader: LibraryLoader): string {
  return `${mcVersion.replace(/\./g, "_")}__${loader}`;
}

function normalize(id: string, raw: any): LibraryMod {
  return {
    id,
    name: String(raw?.name ?? ""),
    description: String(raw?.description ?? ""),
    details: String(raw?.details ?? ""),
    icon: String(raw?.icon ?? ""),
    author: String(raw?.author ?? ""),
    createdAt: Number(raw?.createdAt ?? 0),
    updatedAt: Number(raw?.updatedAt ?? 0),
    builds: (raw?.builds ?? {}) as Record<string, LibraryBuild>,
  };
}

function toList(value: any): LibraryMod[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .map(([id, raw]) => normalize(id, raw))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchLibraryMods(): Promise<LibraryMod[]> {
  return toList((await get(dbRef(rtdb, ROOT))).val());
}

/** Live listing — returns the unsubscribe function. */
export function subscribeLibraryMods(onChange: (mods: LibraryMod[]) => void, onError?: (e: Error) => void): () => void {
  return onValue(
    dbRef(rtdb, ROOT),
    (snap) => onChange(toList(snap.val())),
    (e) => onError?.(e)
  );
}

export async function createLibraryMod(info: LibraryModInfo, author: string): Promise<string> {
  const node = push(dbRef(rtdb, ROOT));
  const now = Date.now();
  await set(node, { ...info, author, createdAt: now, updatedAt: now });
  return node.key!;
}

export async function updateLibraryModInfo(id: string, info: LibraryModInfo): Promise<void> {
  await update(dbRef(rtdb, `${ROOT}/${id}`), { ...info, updatedAt: Date.now() });
}

/** Deletes child by child (builds first) — never a whole subtree in one write. */
export async function deleteLibraryMod(mod: LibraryMod): Promise<void> {
  for (const key of Object.keys(mod.builds)) {
    await remove(dbRef(rtdb, `${ROOT}/${mod.id}/builds/${key}`));
  }
  await remove(dbRef(rtdb, `${ROOT}/${mod.id}`));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sha1Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uploads a jar (deduped by sha1) and sets it as the build for mcVersion + loader,
 *  replacing whatever was there. */
export async function uploadLibraryBuild(
  modId: string,
  file: File,
  mcVersion: string,
  loader: LibraryLoader,
  modVersion: string
): Promise<LibraryBuild> {
  if (!file.name.toLowerCase().endsWith(".jar")) throw new Error("El archivo tiene que ser un .jar.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha1 = await sha1Hex(bytes);
  const downloadUrl = await uploadSharedContent(bytesToBase64(bytes), sha1);
  const build: LibraryBuild = {
    mcVersion,
    loader,
    modVersion: modVersion.trim(),
    fileName: file.name,
    sha1,
    size: bytes.length,
    downloadUrl,
    uploadedAt: Date.now(),
  };
  await set(dbRef(rtdb, `${ROOT}/${modId}/builds/${buildKey(mcVersion, loader)}`), build);
  await update(dbRef(rtdb, `${ROOT}/${modId}`), { updatedAt: Date.now() });
  return build;
}

export async function updateLibraryBuildVersion(modId: string, key: string, modVersion: string): Promise<void> {
  await update(dbRef(rtdb, `${ROOT}/${modId}/builds/${key}`), { modVersion: modVersion.trim() });
}

export async function deleteLibraryBuild(modId: string, key: string): Promise<void> {
  await remove(dbRef(rtdb, `${ROOT}/${modId}/builds/${key}`));
  await update(dbRef(rtdb, `${ROOT}/${modId}`), { updatedAt: Date.now() });
}

/** The build for an instance's exact Minecraft version + loader, if any. */
export function compatibleBuild(mod: LibraryMod, mcVersion: string, loader: string): LibraryBuild | null {
  if (!LIBRARY_LOADERS.includes(loader as LibraryLoader)) return null;
  return mod.builds[buildKey(mcVersion, loader as LibraryLoader)] ?? null;
}

const ICON_SIZE = 128;

/** Center-crops a picked image to a square PNG data URL small enough for the catalog. */
export function imageFileToIconDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imagen no válida."));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
      const side = Math.min(img.width, img.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
}

// ── Library mods dressed up as Modrinth data ───────────────────────────────
// The instance manager and the admin editor are built around Modrinth's shapes
// (ModrinthMatch / ModrinthUpdate / ModrinthProjectDetail). A library mod maps
// onto them 1:1 under a "lib:" projectId, so its row, detail page, versions tab
// and update button all work unchanged. Anything that talks to the Modrinth API
// must skip these ids (isLibraryProjectId / isLibraryVersionId).

const LIB_PREFIX = "lib:";

export function isLibraryProjectId(projectId: string | null | undefined): boolean {
  return !!projectId && projectId.startsWith(LIB_PREFIX);
}
export const isLibraryVersionId = isLibraryProjectId;

export function libraryProjectId(modId: string): string {
  return LIB_PREFIX + modId;
}

/** The library mod id behind a "lib:" projectId, or null. */
export function libraryModIdOf(projectId: string): string | null {
  return isLibraryProjectId(projectId) ? projectId.slice(LIB_PREFIX.length) : null;
}

function buildVersionId(modId: string, build: LibraryBuild): string {
  return `${LIB_PREFIX}${modId}:${buildKey(build.mcVersion, build.loader)}`;
}

export function libraryMatch(mod: LibraryMod, build: LibraryBuild): ModrinthMatch {
  return {
    title: mod.name,
    iconUrl: mod.icon || null,
    projectId: libraryProjectId(mod.id),
    versionId: buildVersionId(mod.id, build),
    versionNumber: build.modVersion || build.fileName.replace(/\.jar$/i, ""),
  };
}

export function libraryBuildAsUpdate(mod: LibraryMod, build: LibraryBuild): ModrinthUpdate {
  return {
    versionId: buildVersionId(mod.id, build),
    versionNumber: build.modVersion || build.fileName.replace(/\.jar$/i, ""),
    versionType: "release",
    filename: build.fileName,
    url: build.downloadUrl,
    sha1: build.sha1,
    size: build.size,
    datePublished: new Date(build.uploadedAt).toISOString(),
    downloads: 0,
    dependencies: [],
  };
}

export function libraryProjectDetail(mod: LibraryMod): ModrinthProjectDetail {
  return {
    description: mod.description,
    body: mod.details,
    categories: [],
    downloads: 0,
    followers: 0,
    gallery: [],
  };
}

/** sha1 → the library mod + build that file is. */
export function librarySha1Index(mods: LibraryMod[]): Map<string, { mod: LibraryMod; build: LibraryBuild }> {
  const out = new Map<string, { mod: LibraryMod; build: LibraryBuild }>();
  for (const mod of mods) for (const build of Object.values(mod.builds)) out.set(build.sha1, { mod, build });
  return out;
}

/** Identifies files that are library jars (by sha1). Never throws: a library
 *  that can't be read (offline, missing RTDB rule) just identifies nothing. */
export async function identifyLibraryFiles(
  files: { path: string; sha1?: string | null }[]
): Promise<Map<string, ModrinthMatch>> {
  const out = new Map<string, ModrinthMatch>();
  if (!files.some((f) => f.sha1)) return out;
  let mods: LibraryMod[];
  try {
    mods = await fetchLibraryMods();
  } catch {
    return out;
  }
  const index = librarySha1Index(mods);
  for (const f of files) {
    const hit = f.sha1 ? index.get(f.sha1) : undefined;
    if (hit) out.set(f.path, libraryMatch(hit.mod, hit.build));
  }
  return out;
}

export async function fetchLibraryMod(modId: string): Promise<LibraryMod | null> {
  const snap = await get(dbRef(rtdb, `${ROOT}/${modId}`));
  return snap.exists() ? normalize(modId, snap.val()) : null;
}

/** The library build for an instance (exact Minecraft version + loader), as a
 *  Modrinth-shaped version — what the update check and the versions tab use. */
export async function libraryVersionsFor(projectId: string, mcVersion: string, loader: string): Promise<ModrinthUpdate[]> {
  const modId = libraryModIdOf(projectId);
  if (!modId) return [];
  try {
    const mod = await fetchLibraryMod(modId);
    const build = mod ? compatibleBuild(mod, mcVersion, loader) : null;
    return mod && build ? [libraryBuildAsUpdate(mod, build)] : [];
  } catch {
    return [];
  }
}
