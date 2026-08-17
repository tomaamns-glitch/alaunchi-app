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
  modpack?: Record<string, any>
): Promise<{ totalFiles: number }> {
  if (isElectron) {
    return eAPI.installSnapshot({ modpackId, manifest, baseUrl, modpack });
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
