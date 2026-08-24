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

/** Errors caught in the main process (it has no GitHub token, so it can't report them itself). */
export function onAppError(callback: (data: { context: string; message: string; stack: string | null }) => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onAppError(callback);
}

/** Fired when the playtime watcher in the main process detects a tracked Minecraft
 *  process has exited — the renderer's cue to mark itself offline in presence. */
export function onPlaytimeSessionEnded(callback: (data: { modpackId: string; totalPlaytimeMs: number }) => void): () => void {
  if (!isElectron) return () => {};
  return eAPI.onPlaytimeSessionEnded(callback);
}
