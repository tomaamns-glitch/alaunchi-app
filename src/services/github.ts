export interface Modpack {
  id: string;
  name: string;
  description: string;
  minecraftVersion: string;
  loaderType: "forge" | "fabric" | "neoforge" | "vanilla";
  version: string;
  /** Small square logo/icon — catalog thumbnails, the detail page's icon badge. */
  imageUrl: string;
  /** Wide cover image — the home screen banner and the detail page's hero strip. */
  bannerUrl: string;
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
  fileCount: number;
  totalSizeMb: number;
  /** When on, clients filter/delete anything with "xray" in the filename for this pack. */
  antiXray?: boolean;
  /** Absent/"github" = published catalog pack. "custom" = created locally in the Hub, never touches GitHub. */
  source?: "github" | "custom";
  /** Only set for source === "custom" — the resolved Forge/NeoForge/Fabric build, e.g. "47.4.0". */
  loaderVersion?: string;
  /** Only set for source === "custom" — epoch ms from alaunchi-meta.json, for "recientes" sorting. */
  installedAt?: number;
}

export interface NewModpackData {
  id: string;
  name: string;
  description: string;
  minecraftVersion: string;
  loaderType: "forge" | "fabric" | "neoforge" | "vanilla";
  version: string;
  imageUrl: string;
  bannerUrl: string;
  antiXray?: boolean;
}

export interface SnapshotEntry {
  path: string;
  hash: string;
  size: number;
  /** SHA-1 of the file, used to look it up on Modrinth (their API only indexes sha1/sha512). */
  sha1?: string;
  /** false = the user can delete it from their instance. Absent/true = mandatory. */
  required?: boolean;
}

export interface ChangelogEntry {
  version: string;
  publishedAt: string;
  changelog: string;
  /** Short headline shown in the update announcement and the history list —
   *  absent on entries published before this field existed. */
  title?: string;
}

export interface OptionalGroup {
  id: string;
  name: string;
  description: string;
  /** Paths of optional files (required === false) that belong to this group. */
  paths: string[];
}

export interface SnapshotManifest {
  schemaVersion: 2;
  version: string;
  publishedAt: string;
  objectsTag: string;
  files: SnapshotEntry[];
  changelog?: string;
  /** Headline for the current version's changelog — shown in the update
   *  announcement and as the row label in the history list. */
  changelogTitle?: string;
  /** Every past publish's own changelog, oldest first — skips publishes that left
   *  the changelog blank. Powers the "ver actualizaciones anteriores" button. */
  changelogHistory?: ChangelogEntry[];
  /** Groupings of optional content (name/description + which files). Not consumed
   *  anywhere yet — data model laid down ahead of the feature that will use it. */
  optionalGroups?: OptionalGroup[];
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

interface MinimalResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  headers: { get(name: string): string | null };
}

/**
 * Uploads a release asset via XHR (not fetch) specifically so we get real upload
 * progress events — that's what lets the timeout below be an *inactivity* timeout
 * (no bytes moving for N seconds) instead of a total-duration one. A total-duration
 * timeout has to guess a minimum throughput, and guesses too low, a big-but-healthy
 * upload gets killed; too high, a genuinely stalled one hangs for ages. Progress
 * events sidestep the guess entirely: the timer only fires on true silence.
 */
function uploadAssetXhr(url: string, token: string, body: ArrayBuffer, inactivityMs = 25_000): Promise<MinimalResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => xhr.abort(), inactivityMs);
    };
    resetTimer();

    xhr.upload.onprogress = resetTimer;
    xhr.onload = () => {
      clearTimeout(timer);
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        text: async () => xhr.responseText,
        headers: { get: (name) => xhr.getResponseHeader(name) },
      });
    };
    xhr.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Error de red durante la subida."));
    };
    xhr.onabort = () => {
      clearTimeout(timer);
      const err = new Error("upload stalled");
      err.name = "AbortError";
      reject(err);
    };
    xhr.send(body);
  });
}

/**
 * GitHub's secondary rate limit (403, "You have exceeded a secondary rate limit")
 * fires when too many write requests land close together — exactly what our parallel
 * upload workers do on a big modpack. GitHub's own docs say to back off and retry, so
 * do that automatically instead of failing the whole publish over a transient limit.
 */
async function withRateLimitRetry<T extends MinimalResponse>(
  attempt: () => Promise<T>,
  onWaiting?: (waitSeconds: number, tryNum: number) => void
): Promise<T> {
  const MAX_ATTEMPTS = 6;
  for (let tryNum = 1; ; tryNum++) {
    const res = await attempt();
    if (res.status !== 403) return res;
    const text = await res.text();
    if (!/secondary rate limit/i.test(text) || tryNum >= MAX_ATTEMPTS) {
      throw new Error(`GitHub 403: ${text.slice(0, 300)}`);
    }
    const retryAfterHeader = res.headers.get("retry-after");
    const waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.min(20 * tryNum, 120);
    onWaiting?.(waitSeconds, tryNum);
    await new Promise((r) => setTimeout(r, waitSeconds * 1000));
  }
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

// Short-lived manifest cache, keyed by modpackId — lets a fresh code redeem
// pre-fetch the manifest in the background so the *first* install click
// (ModpackActionBar's handleInstall, home.tsx) can skip straight to
// downloading files instead of waiting on this fetch too. Never consulted by
// an update check (that always needs the truly latest manifest, in case the
// admin republished since the pack was unlocked) — only the never-installed
// "installing" path opts into reading it.
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;
const manifestCache = new Map<string, { manifest: SnapshotManifest; fetchedAt: number }>();

export function cacheSnapshot(modpackId: string, manifest: SnapshotManifest): void {
  manifestCache.set(modpackId, { manifest, fetchedAt: Date.now() });
}

export function getCachedSnapshot(modpackId: string): SnapshotManifest | null {
  const entry = manifestCache.get(modpackId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MANIFEST_CACHE_TTL_MS) {
    manifestCache.delete(modpackId);
    return null;
  }
  return entry.manifest;
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

const SYSTEM_FILE_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini", ".gitkeep", ".curseclient"]);
// logs/ and crash-reports/ are per-play-session runtime output, not modpack content —
// dragging in a whole instance folder (as opposed to hand-picking mods/config/etc.)
// would otherwise ship someone's old crash logs to every player.
const EXCLUDED_DIRS = new Set(["__macosx", ".git", "logs", "crash-reports"]);

export function shouldIncludeFile(relativePath: string, fileName: string): boolean {
  if (SYSTEM_FILE_NAMES.has(fileName.toLowerCase())) return false;
  const parts = relativePath.toLowerCase().split("/");
  return !parts.some((p) => EXCLUDED_DIRS.has(p));
}

export interface WalkedFile {
  file: File;
  relativePath: string;
  required?: boolean;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha1(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-1", buf);
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

export interface ModpackUpdatePlan {
  /** Existing manifest entries carried forward unchanged — not re-hashed or re-uploaded. */
  unchanged: SnapshotEntry[];
  /** Brand-new files, or replacement content for an existing path — the only ones hashed/uploaded. */
  files: WalkedFile[];
}

/**
 * Publishes a new version from an explicit add/remove/replace diff against what's
 * currently published, instead of re-hashing an entire folder every time. Only
 * `plan.files` (added or replaced content) is hashed and uploaded; `plan.unchanged`
 * entries are carried into the new manifest as-is.
 */
export async function publishModpackUpdate(
  token: string,
  repoUrl: string,
  modpackId: string,
  plan: ModpackUpdatePlan,
  newVersion: string,
  changelog: string | undefined,
  changelogTitle: string | undefined,
  optionalGroups: OptionalGroup[] | undefined,
  onProgress: (p: PublishProgress) => void
): Promise<{ uploaded: number; reused: number; totalFiles: number; totalBytes: number }> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error("URL de repositorio no válida.");
  if (!token) throw new Error("Necesitas un token de GitHub con permiso 'repo' en Ajustes.");
  if (!newVersion) throw new Error("Indica el número de versión a publicar.");
  const { files } = plan;
  const { owner, repo } = parsed;

  // 1. Hash the changed files in parallel (unchanged entries already carry their hash).
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
      const [hash, hash1] = await Promise.all([sha256(buf), sha1(buf)]);
      entries[i] = { path: w.relativePath, hash, size: w.file.size, sha1: hash1, required: w.required !== false };
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

  // 3. List existing assets (asset name = hash, so we know what's already uploaded).
  // A modpack's objects release can hold thousands of assets after a few publishes —
  // fetch page 1 first to read the total page count off the Link header, then fetch
  // the rest in parallel instead of one page at a time (which used to make even a
  // single-file update sit through the whole history before it could start uploading).
  const existingHashes = new Set<string>();
  async function fetchAssetsPage(pageNum: number): Promise<{ items: any[]; linkHeader: string | null }> {
    const res = await withRateLimitRetry(() =>
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?per_page=100&page=${pageNum}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      )
    );
    if (!res.ok) throw new Error(`Error listando assets del release (${res.status})`);
    return { items: await res.json(), linkHeader: res.headers.get("link") };
  }

  const first = await fetchAssetsPage(1);
  for (const a of first.items) existingHashes.add(a.name);
  let lastPage = 1;
  const lastMatch = first.linkHeader?.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  if (lastMatch) lastPage = parseInt(lastMatch[1], 10);

  if (lastPage > 1) {
    const remainingPages = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
    let pageIdx = 0;
    const LIST_CONC = 6;
    async function listWorker() {
      while (true) {
        const i = pageIdx++;
        if (i >= remainingPages.length) return;
        const { items } = await fetchAssetsPage(remainingPages[i]);
        for (const a of items) existingHashes.add(a.name);
      }
    }
    await Promise.all(Array.from({ length: LIST_CONC }, () => listWorker()));
  }

  // GitHub Releases rejects 0-byte assets with 422, and a zero-byte file has nothing to
  // transfer anyway — skip the upload entirely. The client reconstructs empty files from
  // the manifest (size:0) without needing to download anything.
  const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  // 3.5. Verify carried-forward ("unchanged") entries actually still exist on GitHub.
  // They're never re-uploaded here — we only have their old hash/path, not their bytes —
  // so if one went missing (e.g. from an upload that silently failed under an older,
  // less careful publish path) every future publish would otherwise keep carrying it
  // forward as "fine" forever, since nothing ever re-checks it. Catch that now instead
  // of letting installers discover it one 404 at a time.
  const missingUnchanged = plan.unchanged.filter(
    (e) => e.size > 0 && e.hash !== EMPTY_HASH && !existingHashes.has(e.hash)
  );
  if (missingUnchanged.length > 0) {
    throw new Error(
      `${missingUnchanged.length} archivo(s) ya publicados no tienen su objeto en GitHub y no se pueden ` +
        `reparar solos (este editor no tiene sus bytes, solo el hash antiguo). Vuelve a añadirlos arrastrando ` +
        `el archivo de nuevo, o elimínalos, antes de publicar:\n` +
        missingUnchanged.slice(0, 20).map((e) => `  ${e.path}`).join("\n") +
        (missingUnchanged.length > 20 ? `\n  ...y ${missingUnchanged.length - 20} más` : "")
    );
  }

  // 4. Dedupe by hash; upload only what's missing.
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

  // Uploads one file, retrying network-level failures (a stalled connection — 5s with
  // zero progress — or a dropped connection) in place instead of giving up on the whole
  // batch. Each retry reuses the same hash, so it's always safe: GitHub either accepts
  // it fresh or tells us (422) it's already there from an earlier attempt.
  async function uploadOneFile(u: { hash: string; file: File }): Promise<"uploaded" | "reused"> {
    const ab = await u.file.arrayBuffer();
    const url = `${uploadBase}?name=${encodeURIComponent(u.hash)}`;
    const MAX_FILE_RETRIES = 4;
    let res: MinimalResponse | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_FILE_RETRIES; attempt++) {
      try {
        res = await withRateLimitRetry(
          () => uploadAssetXhr(url, token, ab, 5_000),
          (waitSeconds, tryNum) =>
            onProgress({
              stage: "uploading",
              done: uploaded,
              total: toUpload.length,
              currentFile: `Límite de GitHub alcanzado, esperando ${waitSeconds}s antes de reintentar (${tryNum})...`,
              reusedFromGitHub: reused,
            })
        );
        break;
      } catch (e: any) {
        lastErr = e;
        if (attempt < MAX_FILE_RETRIES) {
          onProgress({
            stage: "uploading",
            done: uploaded,
            total: toUpload.length,
            currentFile: `${u.file.name}: sin respuesta, reconectando (intento ${attempt + 1}/${MAX_FILE_RETRIES})...`,
            reusedFromGitHub: reused,
          });
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
    if (!res) {
      throw lastErr ?? new Error(`No se pudo subir ${u.file.name} tras ${MAX_FILE_RETRIES} intentos.`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      // 422 on this endpoint: our asset name is always a valid SHA-256 hex string with a
      // real octet-stream body, so GitHub has no other plausible validation complaint here —
      // it means an asset with this name (i.e. this exact content) already exists, uploaded
      // between our listing call and now (a concurrent publish, or an earlier retried attempt).
      // Matching GitHub's exact wording is brittle; any 422 here means "already there".
      if (res.status === 422) return "reused";
      throw new Error(`Error subiendo objeto ${u.hash.slice(0, 8)} (${res.status}): ${txt.slice(0, 160)}`);
    }
    return "uploaded";
  }

  let upIdx = 0;
  // GitHub's own guidance for write endpoints is to avoid concurrent requests — 4 was
  // enough to trip the secondary rate limit on a big modpack's worth of uploads.
  const UP_CONC = 2;
  const failedFiles: string[] = [];
  // If one file fails for good, the next one starting fresh right after it is no
  // slower to detect a REAL outage — it just repeats the same ~25s of retries before
  // also giving up, making a dropped connection look like it's failing file after
  // file forever. Shared across workers: once several fail back-to-back, assume the
  // connection itself is down and pause for real instead of hammering it per file.
  let consecutiveFailures = 0;
  async function uploadWorker() {
    while (true) {
      const i = upIdx++;
      if (i >= toUpload.length) return;
      const u = toUpload[i];

      if (consecutiveFailures >= 3) {
        const cooldownSeconds = Math.min(30 * (consecutiveFailures - 2), 180);
        onProgress({
          stage: "uploading",
          done: uploaded,
          total: toUpload.length,
          currentFile: `Varios archivos seguidos sin respuesta — parece que se cortó la conexión. Esperando ${cooldownSeconds}s antes de seguir...`,
          reusedFromGitHub: reused,
        });
        await new Promise((r) => setTimeout(r, cooldownSeconds * 1000));
      }

      try {
        await uploadOneFile(u);
        uploaded++;
        consecutiveFailures = 0;
        onProgress({ stage: "uploading", done: uploaded, total: toUpload.length, currentFile: u.file.name, reusedFromGitHub: reused });
      } catch (e: any) {
        // One file failing for good (after retries) shouldn't throw away everything
        // else already in flight or already uploaded — keep this worker going and
        // report the failure at the end instead.
        consecutiveFailures++;
        failedFiles.push(u.file.name);
        onProgress({
          stage: "uploading",
          done: uploaded,
          total: toUpload.length,
          currentFile: `${u.file.name}: falló definitivamente (${e?.message ?? "error"})`,
          reusedFromGitHub: reused,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: UP_CONC }, () => uploadWorker()));

  if (failedFiles.length > 0) {
    throw new Error(
      `${failedFiles.length} archivo(s) no se pudieron subir tras varios intentos: ${failedFiles.slice(0, 5).join(", ")}` +
        (failedFiles.length > 5 ? "..." : "") +
        `. El resto sí se subió — vuelve a lanzar la actualización, se reintentará solo lo que falta.`
    );
  }

  // 5. Merge hashed adds/replacements with carried-forward entries, then write the manifest.
  const allEntries = [...plan.unchanged, ...entries].sort((a, b) => a.path.localeCompare(b.path));
  onProgress({ stage: "manifest", done: 0, total: 1 });
  const trimmedChangelog = changelog?.trim();
  const trimmedTitle = changelogTitle?.trim();
  const publishedAt = new Date().toISOString();
  const manifestPath = `modpacks/${modpackId}/manifest.json`;
  const existingManifest = await getFileContents(owner, repo, manifestPath, token);
  let priorHistory: ChangelogEntry[] = [];
  if (existingManifest) {
    try {
      priorHistory = (JSON.parse(existingManifest.content) as SnapshotManifest).changelogHistory || [];
    } catch {}
  }
  const changelogHistory = trimmedChangelog
    ? [...priorHistory, { version: newVersion, publishedAt, changelog: trimmedChangelog, ...(trimmedTitle ? { title: trimmedTitle } : {}) }]
    : priorHistory;
  const manifest: SnapshotManifest = {
    schemaVersion: 2,
    version: newVersion,
    publishedAt,
    objectsTag,
    files: allEntries,
    ...(trimmedChangelog ? { changelog: trimmedChangelog } : {}),
    ...(trimmedTitle ? { changelogTitle: trimmedTitle } : {}),
    ...(changelogHistory.length > 0 ? { changelogHistory } : {}),
    ...(optionalGroups && optionalGroups.length > 0 ? { optionalGroups } : {}),
  };
  await putFileContents(
    owner,
    repo,
    manifestPath,
    JSON.stringify(manifest, null, 2),
    `Publish ${modpackId} v${newVersion}` + (trimmedChangelog ? `\n\n${trimmedChangelog}` : ""),
    token,
    existingManifest?.sha
  );

  // 6. Update modpacks.json (version, fileCount, totalSizeMb)
  const totalBytes = allEntries.reduce((s, e) => s + e.size, 0);
  const totalSizeMb = parseFloat((totalBytes / 1_048_576).toFixed(2));
  const fileCount = allEntries.length;
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
  return { uploaded: toUpload.length, reused, totalFiles: allEntries.length, totalBytes };
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
    bannerUrl: data.bannerUrl,
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

export interface ErrorReport {
  context: string;
  message: string;
  stack?: string;
  appVersion?: string;
  platform?: string;
}

// Windows/Unix home-dir paths show up in stack traces (node_modules paths, temp
// files) and carry the real OS username — strip it before anything leaves the
// machine, even though the destination is a private repo only we can read.
function sanitizePaths(text: string): string {
  return text
    .replace(/([A-Za-z]:\\Users\\)[^\\]+/gi, "$1<usuario>")
    .replace(/(\/home\/)[^/]+/g, "$1<usuario>")
    .replace(/(\/Users\/)[^/]+/g, "$1<usuario>");
}

/**
 * Best-effort crash report: opens a GitHub Issue in the modpacks repo. Never throws —
 * a broken reporter must not turn one crash into a second, more confusing one.
 */
export async function reportError(repoUrl: string, token: string, report: ErrorReport): Promise<void> {
  const parsed = parseRepo(repoUrl);
  if (!parsed || !token) return;
  const { owner, repo } = parsed;

  const title = `[auto] ${report.context}: ${sanitizePaths(report.message)}`.slice(0, 200);
  const body = [
    `**Contexto:** ${report.context}`,
    report.appVersion ? `**Versión:** ${report.appVersion}` : null,
    report.platform ? `**Plataforma:** ${report.platform}` : null,
    "",
    "```",
    sanitizePaths(report.stack || report.message),
    "```",
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    await ghApiFetch(`/repos/${owner}/${repo}/issues`, token, {
      method: "POST",
      body: JSON.stringify({ title, body, labels: ["auto-reporte"] }),
    });
  } catch (e) {
    console.warn("[reportError] No se pudo crear el issue de reporte:", e);
  }
}

/** Patches an existing catalog entry (name/description/images/antiXray) — takes
 *  effect immediately, independent of the version-publish cycle in admin-modpack.tsx. */
export async function updateModpackMetadata(
  token: string,
  repoUrl: string,
  modpackId: string,
  updates: Partial<Pick<Modpack, "name" | "description" | "imageUrl" | "bannerUrl" | "antiXray">>
): Promise<void> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error("URL de repositorio no válida.");
  if (!token) throw new Error("Necesitas un token de GitHub con permiso 'repo' en Ajustes.");

  const { owner, repo } = parsed;
  const modpacksFile = await getFileContents(owner, repo, "modpacks.json", token);
  if (!modpacksFile) throw new Error("No se encontró modpacks.json en el repositorio.");

  let allPacks: any[];
  try {
    allPacks = JSON.parse(modpacksFile.content);
  } catch (e: any) {
    throw new Error(`modpacks.json contiene JSON inválido: ${e?.message ?? e}`);
  }
  if (!allPacks.find((p: any) => p.id === modpackId)) {
    throw new Error(`No existe un modpack con el ID "${modpackId}".`);
  }
  const updated = allPacks.map((p: any) => (p.id === modpackId ? { ...p, ...updates } : p));

  await putFileContents(
    owner,
    repo,
    "modpacks.json",
    JSON.stringify(updated, null, 2),
    `Update ${modpackId} metadata`,
    token,
    modpacksFile.sha
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
