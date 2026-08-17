export interface Modpack {
  id: string;
  name: string;
  description: string;
  minecraftVersion: string;
  loaderType: "forge" | "fabric" | "neoforge" | "vanilla";
  version: string;
  imageUrl: string;
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
  fileCount: number;
  totalSizeMb: number;
}

export interface NewModpackData {
  id: string;
  name: string;
  description: string;
  minecraftVersion: string;
  loaderType: "forge" | "fabric" | "neoforge" | "vanilla";
  version: string;
  imageUrl: string;
}

export interface SnapshotEntry {
  path: string;
  hash: string;
  size: number;
}

export interface SnapshotManifest {
  schemaVersion: 2;
  version: string;
  publishedAt: string;
  objectsTag: string;
  files: SnapshotEntry[];
}

export interface ParsedRepo {
  owner: string;
  repo: string;
}

export function parseRepo(repoUrl: string): ParsedRepo | null {
  if (!repoUrl) return null;
  const ghMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (ghMatch) return { owner: ghMatch[1], repo: ghMatch[2].replace(/\.git$/, "") };
  const slashMatch = repoUrl.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };
  return null;
}

function rawUrl(owner: string, repo: string, filePath: string, branch = "main"): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

async function ghApiFetch(
  path: string,
  token: string,
  opts: RequestInit = {}
): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getFileContents(
  owner: string,
  repo: string,
  filePath: string,
  token: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const data = await ghApiFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token);
    return { content: atob(data.content.replace(/\n/g, "")), sha: data.sha };
  } catch {
    return null;
  }
}

async function putFileContents(
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  token: string,
  sha?: string
): Promise<void> {
  const body: any = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) body.sha = sha;

  await ghApiFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function deleteFileContents(
  owner: string,
  repo: string,
  filePath: string,
  message: string,
  token: string,
  sha: string
): Promise<void> {
  await ghApiFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token, {
    method: "DELETE",
    body: JSON.stringify({ message, sha }),
  });
}

export async function fetchModpacks(repoUrl: string, token?: string): Promise<Modpack[]> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return [];

  const { owner, repo } = parsed;

  try {
    let data: Omit<Modpack, "installed" | "installedVersion" | "updateAvailable">[];

    if (token) {
      const file = await getFileContents(owner, repo, "modpacks.json", token);
      if (!file) return [];
      data = JSON.parse(file.content);
    } else {
      const res = await fetch(rawUrl(owner, repo, "modpacks.json"), { cache: "no-store" });
      if (!res.ok) throw new Error("Not found");
      data = await res.json();
    }

    return data.map((mp) => ({
      ...mp,
      installed: false,
      updateAvailable: false,
    }));
  } catch {
    return [];
  }
}

export async function fetchSnapshot(
  repoUrl: string,
  modpackId: string,
  token?: string
): Promise<SnapshotManifest | null> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return null;
  const { owner, repo } = parsed;
  const p = `modpacks/${modpackId}/manifest.json`;
  try {
    let raw: string;
    if (token) {
      const f = await getFileContents(owner, repo, p, token);
      if (!f) return null;
      raw = f.content;
    } else {
      const res = await fetch(rawUrl(owner, repo, p), { cache: "no-store" });
      if (!res.ok) return null;
      raw = await res.text();
    }
    const data = JSON.parse(raw);
    if (data.schemaVersion !== 2) return null;
    return data as SnapshotManifest;
  } catch {
    return null;
  }
}

export function snapshotBaseUrl(repoUrl: string, manifest: SnapshotManifest): string {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error("URL de repositorio no válida.");
  return `https://github.com/${parsed.owner}/${parsed.repo}/releases/download/${manifest.objectsTag}/`;
}

const SYSTEM_FILE_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini", ".gitkeep"]);
const EXCLUDED_DIRS = new Set(["__macosx", ".git"]);

export function shouldIncludeFile(relativePath: string, fileName: string): boolean {
  if (SYSTEM_FILE_NAMES.has(fileName.toLowerCase())) return false;
  const parts = relativePath.toLowerCase().split("/");
  return !parts.some((p) => EXCLUDED_DIRS.has(p));
}

export interface WalkedFile {
  file: File;
  relativePath: string;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type PublishStage = "hashing" | "uploading" | "manifest" | "done";

export interface PublishProgress {
  stage: PublishStage;
  done: number;
  total: number;
  currentFile?: string;
  reusedFromGitHub?: number;
}

export async function publishSnapshot(
  token: string,
  repoUrl: string,
  modpackId: string,
  files: WalkedFile[],
  newVersion: string,
  onProgress: (p: PublishProgress) => void
): Promise<{ uploaded: number; reused: number; totalFiles: number; totalBytes: number }> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error("URL de repositorio no válida.");
  if (!token) throw new Error("Necesitas un token de GitHub con permiso 'repo' en Ajustes.");
  if (!newVersion) throw new Error("Indica el número de versión a publicar.");
  if (files.length === 0) throw new Error("La carpeta seleccionada está vacía.");
  const { owner, repo } = parsed;

  // 1. Hash all files in parallel
  const entries: SnapshotEntry[] = new Array(files.length);
  let hashed = 0;
  onProgress({ stage: "hashing", done: 0, total: files.length });

  let hashIdx = 0;
  const HASH_CONC = 4;
  async function hashWorker() {
    while (true) {
      const i = hashIdx++;
      if (i >= files.length) return;
      const w = files[i];
      const buf = await w.file.arrayBuffer();
      const hash = await sha256(buf);
      entries[i] = { path: w.relativePath, hash, size: w.file.size };
      hashed++;
      onProgress({
        stage: "hashing",
        done: hashed,
        total: files.length,
        currentFile: w.relativePath,
      });
    }
  }
  await Promise.all(Array.from({ length: HASH_CONC }, () => hashWorker()));

  // 2. Ensure objects release exists (handle create race: another client may create it concurrently)
  const objectsTag = `${modpackId}-objects`;
  let release: any;
  try {
    release = await ghApiFetch(`/repos/${owner}/${repo}/releases/tags/${objectsTag}`, token);
  } catch {
    try {
      release = await ghApiFetch(`/repos/${owner}/${repo}/releases`, token, {
        method: "POST",
        body: JSON.stringify({
          tag_name: objectsTag,
          name: `${modpackId} — files (no borrar)`,
          body: "Almacén de archivos del modpack. Gestionado automáticamente por ALaunchi. No borrar manualmente o romperás versiones anteriores.",
          draft: false,
          prerelease: true,
        }),
      });
    } catch (createErr: any) {
      // Likely 422 already_exists from a concurrent publish — refetch the existing release
      release = await ghApiFetch(`/repos/${owner}/${repo}/releases/tags/${objectsTag}`, token);
      if (!release) throw createErr;
    }
  }
  const uploadBase = (release.upload_url as string).replace("{?name,label}", "");

  // 3. List existing assets (asset name = hash, so we know what's already uploaded)
  const existingHashes = new Set<string>();
  for (let page = 1; ; page++) {
    const batch: any[] = await ghApiFetch(
      `/repos/${owner}/${repo}/releases/${release.id}/assets?per_page=100&page=${page}`,
      token
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const a of batch) existingHashes.add(a.name);
    if (batch.length < 100) break;
  }

  // 4. Dedupe by hash; upload only what's missing.
  // GitHub Releases rejects 0-byte assets with 422, and a zero-byte file has nothing to
  // transfer anyway — skip the upload entirely. The client reconstructs empty files from
  // the manifest (size:0) without needing to download anything.
  const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const uniqueByHash = new Map<string, File>();
  files.forEach((w, i) => {
    const e = entries[i];
    if (e.size === 0) return; // empty files aren't uploaded
    if (!uniqueByHash.has(e.hash)) uniqueByHash.set(e.hash, w.file);
  });

  const toUpload: Array<{ hash: string; file: File }> = [];
  for (const [hash, file] of uniqueByHash) {
    if (hash === EMPTY_HASH) continue; // belt-and-suspenders
    if (!existingHashes.has(hash)) toUpload.push({ hash, file });
  }
  const reused = uniqueByHash.size - toUpload.length;

  let uploaded = 0;
  onProgress({
    stage: "uploading",
    done: 0,
    total: toUpload.length,
    reusedFromGitHub: reused,
  });

  let upIdx = 0;
  const UP_CONC = 4;
  async function uploadWorker() {
    while (true) {
      const i = upIdx++;
      if (i >= toUpload.length) return;
      const u = toUpload[i];
      const ab = await u.file.arrayBuffer();
      const res = await fetch(`${uploadBase}?name=${encodeURIComponent(u.hash)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: ab,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        // 422 already_exists: another publisher uploaded the same hash between listing and now.
        // Since the asset name IS the content hash, an existing asset with this name is correct by definition.
        if (res.status === 422 && /already_exists/i.test(txt)) {
          uploaded++;
          onProgress({
            stage: "uploading",
            done: uploaded,
            total: toUpload.length,
            currentFile: u.file.name,
            reusedFromGitHub: reused,
          });
          continue;
        }
        throw new Error(
          `Error subiendo objeto ${u.hash.slice(0, 8)} (${res.status}): ${txt.slice(0, 160)}`
        );
      }
      uploaded++;
      onProgress({
        stage: "uploading",
        done: uploaded,
        total: toUpload.length,
        currentFile: u.file.name,
        reusedFromGitHub: reused,
      });
    }
  }
  await Promise.all(Array.from({ length: UP_CONC }, () => uploadWorker()));

  // 5. Write manifest
  onProgress({ stage: "manifest", done: 0, total: 1 });
  const manifest: SnapshotManifest = {
    schemaVersion: 2,
    version: newVersion,
    publishedAt: new Date().toISOString(),
    objectsTag,
    files: entries.sort((a, b) => a.path.localeCompare(b.path)),
  };
  const manifestPath = `modpacks/${modpackId}/manifest.json`;
  const existingManifest = await getFileContents(owner, repo, manifestPath, token);
  await putFileContents(
    owner,
    repo,
    manifestPath,
    JSON.stringify(manifest, null, 2),
    `Publish ${modpackId} v${newVersion}`,
    token,
    existingManifest?.sha
  );

  // 6. Update modpacks.json (version, fileCount, totalSizeMb)
  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  const totalSizeMb = parseFloat((totalBytes / 1_048_576).toFixed(2));
  const fileCount = entries.length;
  const modpacksFile = await getFileContents(owner, repo, "modpacks.json", token);
  if (!modpacksFile) {
    throw new Error(
      "Archivos subidos y manifiesto escrito, pero modpacks.json no existe en el repo. Los clientes no detectarán la nueva versión hasta que lo crees."
    );
  }
  let allPacks: any[];
  try {
    allPacks = JSON.parse(modpacksFile.content);
  } catch (e: any) {
    throw new Error(
      `Archivos subidos y manifiesto escrito, pero modpacks.json contiene JSON inválido: ${e?.message ?? e}. Arréglalo manualmente en el repo.`
    );
  }
  const updated = allPacks.map((p: any) =>
    p.id === modpackId ? { ...p, version: newVersion, fileCount, totalSizeMb } : p
  );
  await putFileContents(
    owner,
    repo,
    "modpacks.json",
    JSON.stringify(updated, null, 2),
    `Bump ${modpackId} to v${newVersion}`,
    token,
    modpacksFile.sha
  );

  onProgress({ stage: "done", done: 1, total: 1, reusedFromGitHub: reused });
  return { uploaded: toUpload.length, reused, totalFiles: entries.length, totalBytes };
}

export async function createModpack(
  token: string,
  repoUrl: string,
  data: NewModpackData
): Promise<void> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error("URL de repositorio no válida.");
  if (!token) throw new Error("Necesitas un token de GitHub con permiso 'repo' en Ajustes.");

  const { owner, repo } = parsed;

  const modpacksFile = await getFileContents(owner, repo, "modpacks.json", token);
  let allPacks: any[] = [];
  if (modpacksFile) {
    try {
      allPacks = JSON.parse(modpacksFile.content);
    } catch {}
  }

  if (allPacks.find((p: any) => p.id === data.id)) {
    throw new Error(`Ya existe un modpack con el ID "${data.id}".`);
  }

  const newEntry = {
    id: data.id,
    name: data.name,
    description: data.description,
    minecraftVersion: data.minecraftVersion,
    loaderType: data.loaderType,
    version: data.version,
    imageUrl: data.imageUrl,
    fileCount: 0,
    totalSizeMb: 0,
  };

  allPacks.push(newEntry);

  await putFileContents(
    owner,
    repo,
    "modpacks.json",
    JSON.stringify(allPacks, null, 2),
    `Add modpack: ${data.name}`,
    token,
    modpacksFile?.sha
  );

  const emptyManifest: SnapshotManifest = {
    schemaVersion: 2,
    version: data.version,
    publishedAt: new Date().toISOString(),
    objectsTag: `${data.id}-objects`,
    files: [],
  };
  await putFileContents(
    owner,
    repo,
    `modpacks/${data.id}/manifest.json`,
    JSON.stringify(emptyManifest, null, 2),
    `Init manifest for ${data.id}`,
    token
  );
}

export async function deleteModpack(
  token: string,
  repoUrl: string,
  modpackId: string
): Promise<void> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error("URL de repositorio no válida.");
  if (!token) throw new Error("Necesitas un token de GitHub con permiso 'repo' en Ajustes.");

  const { owner, repo } = parsed;

  const modpacksFile = await getFileContents(owner, repo, "modpacks.json", token);
  if (modpacksFile) {
    try {
      const allPacks: any[] = JSON.parse(modpacksFile.content);
      const updated = allPacks.filter((p: any) => p.id !== modpackId);
      await putFileContents(
        owner, repo, "modpacks.json",
        JSON.stringify(updated, null, 2),
        `Remove modpack: ${modpackId}`,
        token,
        modpacksFile.sha
      );
    } catch {}
  }

  const manifestPath = `modpacks/${modpackId}/manifest.json`;
  const manifestFile = await getFileContents(owner, repo, manifestPath, token);
  if (manifestFile) {
    await deleteFileContents(owner, repo, manifestPath, `Delete manifest for ${modpackId}`, token, manifestFile.sha);
  }
}
