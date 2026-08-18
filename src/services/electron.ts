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
