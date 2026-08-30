// Real Minecraft SERVER management via FTP/SFTP — entirely separate from the
// local client instances (services/electron.ts's mc:* / instances:* calls).
// Every call here is a thin wrapper over the IPC channels in electron/main.js's
// "Servers" section; the actual FTP/SFTP session and the encrypted password
// both live in the main process and never reach this file.

const eAPI = (window as any).electronAPI;
const isElectron = !!eAPI;

export type ServerProtocol = "sftp" | "ftp";

export interface ServerEntry {
  id: string;
  name: string;
  protocol: ServerProtocol;
  host: string;
  port: number;
  username: string;
  rootPath: string;
  /** Never the password itself — just whether one is saved. */
  hasPassword: boolean;
}

export interface ServerInput {
  name: string;
  protocol: ServerProtocol;
  host: string;
  port: number;
  username: string;
  /** Omit when editing a server without changing its saved password. */
  password?: string;
  rootPath?: string;
}

export interface ServerFileEntry {
  name: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: number | null;
}

function requireElectron() {
  if (!isElectron) throw new Error("Solo disponible en la app de escritorio.");
}

export async function listServers(): Promise<ServerEntry[]> {
  if (!isElectron) return [];
  return eAPI.listServers();
}

export async function addServer(input: ServerInput): Promise<ServerEntry> {
  requireElectron();
  return eAPI.addServer(input);
}

export async function updateServer(id: string, input: ServerInput): Promise<ServerEntry> {
  requireElectron();
  return eAPI.updateServer({ id, ...input });
}

export async function deleteServer(id: string): Promise<void> {
  requireElectron();
  await eAPI.deleteServer({ id });
}

export async function connectServer(id: string): Promise<void> {
  requireElectron();
  await eAPI.connectServer({ id });
}

export async function disconnectServer(id: string): Promise<void> {
  requireElectron();
  await eAPI.disconnectServer({ id });
}

export async function listServerDirectory(id: string, remotePath: string): Promise<ServerFileEntry[]> {
  requireElectron();
  return eAPI.listServerDirectory({ id, remotePath });
}

/** Opens a native save dialog — resolves to null if the user cancels it. */
export async function downloadServerFile(id: string, remotePath: string): Promise<string | null> {
  requireElectron();
  const result = await eAPI.downloadServerFile({ id, remotePath });
  return result.canceled ? null : result.path;
}

/** Opens a native open-file dialog to pick what to upload — resolves to the
 *  uploaded file's name, or null if the user cancels it. */
export async function uploadServerFile(id: string, remoteDir: string): Promise<string | null> {
  requireElectron();
  const result = await eAPI.uploadServerFile({ id, remoteDir });
  return result.canceled ? null : result.name;
}

export async function readServerTextFile(id: string, remotePath: string): Promise<string> {
  requireElectron();
  return eAPI.readServerTextFile({ id, remotePath });
}

export async function writeServerTextFile(id: string, remotePath: string, content: string): Promise<void> {
  requireElectron();
  await eAPI.writeServerTextFile({ id, remotePath, content });
}

export async function deleteServerFile(id: string, remotePath: string): Promise<void> {
  requireElectron();
  await eAPI.deleteServerFile({ id, remotePath });
}

export async function deleteServerDirectory(id: string, remotePath: string): Promise<void> {
  requireElectron();
  await eAPI.deleteServerDirectory({ id, remotePath });
}

export async function createServerDirectory(id: string, remotePath: string): Promise<void> {
  requireElectron();
  await eAPI.createServerDirectory({ id, remotePath });
}

export async function renameServerPath(id: string, fromPath: string, toPath: string): Promise<void> {
  requireElectron();
  await eAPI.renameServerPath({ id, fromPath, toPath });
}

/** Extensions treated as plain text — clicking one opens the in-app editor
 *  instead of offering a download. Deliberately conservative: anything not
 *  recognized here still works fine via Descargar. */
const TEXT_EXTENSIONS = new Set([
  "properties", "txt", "yml", "yaml", "json", "cfg", "conf", "toml",
  "log", "ini", "sh", "bat", "md", "csv", "env",
]);

export function isTextFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

export function joinRemotePath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

export function parentPath(current: string): string {
  const trimmed = current.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}
