import type { SnapshotManifest } from "./github";

const eAPI = (window as any).electronAPI;
export const isElectron = !!eAPI;

export interface LaunchOptions {
  modpackId: string;
  mcVersion: string;
  loaderType: string;
  authToken: string;
  username: string;
  uuid: string;
  xuid: string;
  clientId: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function installSnapshot(
  modpackId: string,
  manifest: SnapshotManifest,
  baseUrl: string,
  modpack?: Record<string, any>,
  token?: string
): Promise<{ totalFiles: number }> {
  if (isElectron) {
    return eAPI.installSnapshot({ modpackId, manifest, baseUrl, modpack, token });
  }
  await delay(500);
  return { totalFiles: manifest.files.length };
}

export async function launchMinecraft(opts: LaunchOptions): Promise<void> {
  if (isElectron) {
    return eAPI.launchMinecraft(opts);
  }
  await delay(1500);
}

export async function checkForUpdates(
  _modpackId: string,
  latestVersion: string,
  installedVersion?: string
): Promise<boolean> {
  return latestVersion !== installedVersion;
}

export async function readSettings(): Promise<Record<string, any>> {
  if (isElectron) return eAPI.readSettings();
  return {};
}

export async function writeSettings(settings: Record<string, any>): Promise<void> {
  if (isElectron) await eAPI.writeSettings(settings);
}

export async function getDataDir(): Promise<{ dataDir: string; isCustom: boolean } | null> {
  if (!isElectron) return null;
  return eAPI.getDataDir();
}

export async function chooseDataDir(): Promise<{ canceled: boolean; path?: string; restartRequired?: boolean }> {
  if (!isElectron) return { canceled: true };
  return eAPI.chooseDataDir();
}

export async function openDataDir(): Promise<void> {
  if (isElectron) await eAPI.openDataDir();
}

export interface InstanceFile {
  path: string;
  size: number;
  sha1: string | null;
}

/** Lists actual files under mods/shaderpacks/resourcepacks in an installed instance. */
export async function listInstanceFiles(modpackId: string): Promise<InstanceFile[]> {
  if (!isElectron) return [];
  return eAPI.listInstanceFiles({ modpackId });
}

export async function deleteInstanceFile(modpackId: string, path: string): Promise<void> {
  if (isElectron) await eAPI.deleteInstanceFile({ modpackId, path });
}

export async function updateInstanceFile(
  modpackId: string,
  oldPath: string,
  newPath: string,
  url: string,
  sha1?: string
): Promise<{ newPath: string }> {
  if (!isElectron) return { newPath };
  return eAPI.updateInstanceFile({ modpackId, oldPath, newPath, url, sha1 });
}

/** Downloads a brand-new file into the instance (no existing file to replace). */
export async function downloadInstanceFile(modpackId: string, path: string, url: string, sha1?: string): Promise<void> {
  if (isElectron) await eAPI.downloadInstanceFile({ modpackId, path, url, sha1 });
}

/** Reads a file already inside an instance as base64 — used to upload the
 *  sender's own copy when sharing content in chat. */
export async function readInstanceFile(modpackId: string, path: string): Promise<string> {
  if (!isElectron) throw new Error("Solo disponible en la app de escritorio.");
  const { base64 } = await eAPI.readInstanceFile({ modpackId, path });
  return base64;
}

/** Opens an installed instance's folder in the OS file explorer. */
export async function openInstanceFolder(modpackId: string): Promise<void> {
  if (isElectron) await eAPI.openInstanceFolder({ modpackId });
}

export interface CreateInstanceInput {
  name: string;
  loaderType: "vanilla" | "forge" | "neoforge" | "fabric";
  minecraftVersion: string;
  loaderVersion?: string;
  iconDataUrl?: string;
}

/** Creates a brand-new local instance (not backed by any GitHub catalog) and
 *  writes its alaunchi-meta.json — mirrors the shape mc:get-installed-modpacks reads. */
export async function createInstance(input: CreateInstanceInput): Promise<Record<string, any>> {
  if (!isElectron) throw new Error("Solo disponible en la app de escritorio.");
  return eAPI.createInstance(input);
}

/** Removes a locally-created instance. Refuses (in main.js) if the instance
 *  isn't source:"custom", so this can never touch a GitHub pack. With
 *  `keepFiles`, only the alaunchi-meta.json marker is removed — the instance
 *  stops appearing anywhere in the app but its folder (mods, saves, config)
 *  stays on disk untouched; without it, the whole folder is deleted. */
export async function deleteInstance(id: string, keepFiles?: boolean): Promise<void> {
  if (!isElectron) throw new Error("Solo disponible en la app de escritorio.");
  await eAPI.deleteInstance({ id, keepFiles });
}

export interface MinecraftVersionEntry {
  id: string;
  releaseTime: string;
}

/** Every released Minecraft version (no snapshots/betas), newest first. */
export async function listMinecraftVersions(): Promise<MinecraftVersionEntry[]> {
  if (!isElectron) return [];
  return eAPI.listMinecraftVersions();
}

export interface ForgeVersionEntry {
  version: string;
  recommended: boolean;
  latest: boolean;
}

/** Every Forge build for a given MC version, newest first — no stable/beta split
 *  exists in Forge's own metadata, so nothing is filtered out. */
export async function listForgeVersions(minecraftVersion: string): Promise<ForgeVersionEntry[]> {
  if (!isElectron) return [];
  return eAPI.listForgeVersions({ minecraftVersion });
}

/** Every NeoForge build for a given MC version, newest first. */
export async function listNeoforgeVersions(minecraftVersion: string): Promise<{ version: string }[]> {
  if (!isElectron) return [];
  return eAPI.listNeoforgeVersions({ minecraftVersion });
}

export interface FabricVersionEntry {
  version: string;
  stable: boolean;
}

/** Every Fabric loader build for a given MC version, newest first, with a real stable flag. */
export async function listFabricVersions(minecraftVersion: string): Promise<FabricVersionEntry[]> {
  if (!isElectron) return [];
  return eAPI.listFabricVersions({ minecraftVersion });
}

export type ContentCategory = "mods" | "shaderpacks" | "resourcepacks" | "emotes" | "schematics";
export interface ContentClassification {
  category: ContentCategory;
  /** Only set when category === "schematics" — which of the two destination folders. */
  schematicRoot?: "litematica" | "worldedit";
}

/** Identifies a dropped file's content type (by extension, and for .zip by
 *  content) and its sha1 — classification only, doesn't write anything. */
export async function classifyDroppedFile(
  fileBase64: string,
  fileName: string
): Promise<{ classification: ContentClassification | null; sha1: string }> {
  if (!isElectron) return { classification: null, sha1: "" };
  return eAPI.classifyDroppedFile({ fileBase64, fileName });
}

/** Writes a dropped file's raw bytes into an instance. */
export async function writeInstanceFile(
  modpackId: string,
  targetPath: string,
  source: { fileBase64: string }
): Promise<void> {
  if (!isElectron) return;
  await eAPI.writeInstanceFile({ modpackId, targetPath, ...source });
}

export interface EmoteFile {
  fileName: string;
  displayName: string;
  /** Base64 PNG thumbnail extracted from the .emotecraft file, if it embeds one. */
  thumbnailBase64: string | null;
  sha1: string | null;
}

/** Lists the Emotecraft (.emotecraft) files in an installed instance's emotes/ folder. */
export async function listEmotes(modpackId: string): Promise<EmoteFile[]> {
  if (!isElectron) return [];
  return eAPI.listEmotes({ modpackId });
}

export interface SchematicFile {
  path: string;
  size: number;
  source: "litematica" | "worldedit";
  sha1: string | null;
}

/** Recursively lists .litematic/.schem/.schematic/.nbt files under an installed
 *  instance's schematics/ and config/worldedit/schematics/ folders. */
export async function listSchematics(modpackId: string): Promise<SchematicFile[]> {
  if (!isElectron) return [];
  return eAPI.listSchematics({ modpackId });
}

export interface ScreenshotFile {
  fileName: string;
  size: number;
  sha1: string | null;
  /** Small resized preview data URL — the lightbox fetches full-res bytes on
   *  demand via readInstanceFile instead of loading every screenshot upfront. */
  thumbnailDataUrl: string | null;
}

/** Lists the vanilla F2 screenshots (screenshots/*.png) in an installed instance. */
export async function listScreenshots(modpackId: string): Promise<ScreenshotFile[]> {
  if (!isElectron) return [];
  return eAPI.listScreenshots({ modpackId });
}

export interface SchematicAssetsBundle {
  /** "minecraft:<block>" -> blockstates JSON */
  blockstates: Record<string, unknown>;
  /** "minecraft:block/<model>" -> block model JSON */
  models: Record<string, unknown>;
  /** "minecraft:block/<texture>" -> base64 PNG */
  textures: Record<string, string>;
}

/** Extracts (and disk-caches, per MC version) the blockstates/models/textures the
 *  schematic viewer needs from that version's vanilla client jar. First call for a
 *  given version may download the jar and take a while — see onSchematicAssetsProgress. */
export async function getSchematicAssets(mcVersion: string): Promise<SchematicAssetsBundle> {
  if (!isElectron) return { blockstates: {}, models: {}, textures: {} };
  return eAPI.getSchematicAssets({ mcVersion });
}

export interface SchematicAssetsProgress {
  mcVersion: string;
  stage: "downloading_client" | "extracting" | "ready";
  progress: number;
}

export function onSchematicAssetsProgress(callback: (data: SchematicAssetsProgress) => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onSchematicAssetsProgress(callback);
}

/** Deletes any "xray"-named file from an installed instance's content folders.
 *  Returns the relative paths actually removed, for a toast. */
export async function purgeXrayFiles(modpackId: string): Promise<string[]> {
  if (!isElectron) return [];
  const result = await eAPI.purgeXrayFiles({ modpackId });
  return result?.deletedFiles ?? [];
}

/** Raw per-instance metadata (installed version, playtime, etc.), keyed by modpack id. */
export async function getInstalledModpacksMeta(): Promise<Record<string, any>> {
  if (!isElectron) return {};
  return eAPI.getInstalledModpacks();
}

/** Brings the window back to the front — used when a background presence
 *  notification is clicked while the app is hidden in the tray. */
export function focusWindow(): void {
  if (isElectron) eAPI.focusWindow();
}

export async function getAppVersion(): Promise<string> {
  if (!isElectron) return "";
  return eAPI.getAppVersion();
}

let cachedAppIconDataUrl: string | null | undefined;

/** The app icon as a data: URL — for contexts like native OS notifications that
 *  need a real image source, unlike the app's own UI which just points <img> at
 *  /logo.png directly. Cached after the first call (the icon file never changes
 *  mid-session). */
export async function getAppIconDataUrl(): Promise<string | null> {
  if (!isElectron) return null;
  if (cachedAppIconDataUrl === undefined) cachedAppIconDataUrl = await eAPI.getAppIconDataUrl();
  return cachedAppIconDataUrl ?? null;
}

/** Errors caught in the main process (it has no GitHub token, so it can't report them itself). */
export function onAppError(callback: (data: { context: string; message: string; stack: string | null }) => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onAppError(callback);
}

/** Fired once, right as the main window shows, when this launch is the silent
 *  auto-update's relaunch into the now-updated app — see main.js's
 *  UPDATE_READY_FLAG. Never fires on a normal cold start. */
export function onUpdateInstalled(callback: () => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onUpdateInstalled(callback);
}

/** Fired every time the launcher window is closed to the tray (the custom
 *  titlebar's X, or Alt+F4) — see main.js's "close" handler. The renderer's
 *  cue to refresh "última conexión" for the chat header. */
export function onClosedToTray(callback: () => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onClosedToTray(callback);
}

/** Fired when the playtime watcher in the main process detects a tracked Minecraft
 *  process has exited — the renderer's cue to mark itself offline in presence. */
export function onPlaytimeSessionEnded(callback: (data: { modpackId: string; totalPlaytimeMs: number }) => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onPlaytimeSessionEnded(callback);
}
