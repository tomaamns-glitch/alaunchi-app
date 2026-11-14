export interface ModrinthMatch {
  title: string;
  iconUrl: string | null;
  versionId: string;
  versionNumber: string;
  projectId: string;
}

interface HashableFile {
  path: string;
  sha1?: string | null;
}

interface ModrinthVersionFile {
  id: string;
  project_id: string;
  version_number: string;
}

interface ModrinthProject {
  id: string;
  title: string;
  icon_url: string | null;
}

interface ModrinthVersionDependencyRaw {
  project_id: string | null;
  version_id: string | null;
  dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

interface ModrinthVersionFull {
  id: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  date_published: string;
  downloads: number;
  dependencies: ModrinthVersionDependencyRaw[];
  files: Array<{ primary: boolean; filename: string; url: string; size: number; hashes: { sha1: string } }>;
}

interface ModrinthProjectFull {
  description: string;
  body: string;
  categories: string[];
  downloads: number;
  followers: number;
  gallery: Array<{ url: string; raw_url?: string; title?: string; featured: boolean }>;
  organization?: string | null;
  raw_icon_url?: string | null;
}

const API = "https://api.modrinth.com/v2";

// In-memory cache — Modrinth data barely changes and this can get called every
// time the detail page opens, so avoid re-querying the same hashes/projects.
const versionCache = new Map<string, ModrinthVersionFile | null>();
const projectCache = new Map<string, ModrinthProject | null>();

async function lookupVersionsByHash(hashes: string[]): Promise<Record<string, ModrinthVersionFile>> {
  const uncached = hashes.filter((h) => !versionCache.has(h));
  if (uncached.length > 0) {
    try {
      const res = await fetch(`${API}/version_files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes: uncached, algorithm: "sha1" }),
      });
      const data = res.ok ? await res.json() : {};
      for (const h of uncached) versionCache.set(h, data[h] ?? null);
    } catch {
      for (const h of uncached) versionCache.set(h, null);
    }
  }
  const out: Record<string, ModrinthVersionFile> = {};
  for (const h of hashes) {
    const v = versionCache.get(h);
    if (v) out[h] = v;
  }
  return out;
}

async function lookupProjects(ids: string[]): Promise<Record<string, ModrinthProject>> {
  const unique = Array.from(new Set(ids));
  const uncached = unique.filter((id) => !projectCache.has(id));
  if (uncached.length > 0) {
    try {
      const res = await fetch(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(uncached))}`);
      const data: ModrinthProject[] = res.ok ? await res.json() : [];
      const byId = new Map(data.map((p) => [p.id, p]));
      for (const id of uncached) projectCache.set(id, byId.get(id) ?? null);
    } catch {
      for (const id of uncached) projectCache.set(id, null);
    }
  }
  const out: Record<string, ModrinthProject> = {};
  for (const id of unique) {
    const p = projectCache.get(id);
    if (p) out[id] = p;
  }
  return out;
}

/** The exact Modrinth file behind a sha1: where any player can download it. */
export interface ModrinthFileRef {
  projectId: string;
  versionId: string;
  /** Always https://cdn.modrinth.com/… */
  url: string;
  fileName: string;
}

export class ModrinthLookupError extends Error {
  constructor() {
    super("No se pudo consultar Modrinth para saber si el archivo es suyo. Revisa la conexión e inténtalo de nuevo.");
    this.name = "ModrinthLookupError";
  }
}

/**
 * sha1 → the Modrinth file with exactly that hash. Third-party content is
 * shared by reference, never re-uploaded, so this is the gate every share and
 * publish goes through. Unlike identifyModrinthFiles it THROWS
 * (ModrinthLookupError) when Modrinth can't be asked: "couldn't ask" must
 * never be read as "not on Modrinth", or the jar would get uploaded.
 */
export async function resolveModrinthFiles(sha1s: string[]): Promise<Map<string, ModrinthFileRef>> {
  const unique = Array.from(new Set(sha1s.filter((h) => /^[0-9a-f]{40}$/i.test(h)).map((h) => h.toLowerCase())));
  const out = new Map<string, ModrinthFileRef>();
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    let data: Record<string, ModrinthVersionFull & { project_id: string }>;
    try {
      const res = await fetch(`${API}/version_files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes: chunk, algorithm: "sha1" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch {
      throw new ModrinthLookupError();
    }
    for (const h of chunk) {
      const v = data[h];
      const file = v?.files?.find((f) => f.hashes?.sha1?.toLowerCase() === h);
      if (!v || !file || !file.url?.startsWith("https://cdn.modrinth.com/")) continue;
      out.set(h, { projectId: v.project_id, versionId: v.id, url: file.url, fileName: file.filename });
    }
  }
  return out;
}

/**
 * Identifies which files are recognized Modrinth projects, matched by file
 * hash (sha1). Returns a map keyed by file path — entries with no match (not
 * on Modrinth, or missing a tracked sha1) are simply absent.
 */
export async function identifyModrinthFiles(entries: HashableFile[]): Promise<Map<string, ModrinthMatch>> {
  const hashes = entries.map((e) => e.sha1).filter((h): h is string => !!h);
  if (hashes.length === 0) return new Map();

  const versionsByHash = await lookupVersionsByHash(hashes);
  const projectIds = Object.values(versionsByHash).map((v) => v.project_id);
  const projects = await lookupProjects(projectIds);

  const result = new Map<string, ModrinthMatch>();
  for (const entry of entries) {
    if (!entry.sha1) continue;
    const version = versionsByHash[entry.sha1];
    if (!version) continue;
    const project = projects[version.project_id];
    if (!project) continue;
    result.set(entry.path, {
      title: project.title,
      iconUrl: project.icon_url,
      versionId: version.id,
      versionNumber: version.version_number,
      projectId: version.project_id,
    });
  }
  return result;
}

export type InstallableCategory = "mods" | "shaderpacks" | "resourcepacks";

/** Which installable category a manifest/instance file path belongs to, from
 *  its top-level folder — null for anything outside mods/shaderpacks/resourcepacks. */
export function categoryOf(path: string): InstallableCategory | null {
  const top = path.split("/")[0]?.toLowerCase();
  if (top === "mods") return "mods";
  if (top === "shaderpacks" || top === "shaders") return "shaderpacks";
  if (top === "resourcepacks") return "resourcepacks";
  return null;
}

export function categorize<T extends { path: string }>(files: T[]): Record<InstallableCategory, T[]> {
  const out: Record<InstallableCategory, T[]> = { mods: [], shaderpacks: [], resourcepacks: [] };
  for (const f of files) {
    const cat = categoryOf(f.path);
    if (cat) out[cat].push(f);
  }
  return out;
}

export function fileName(path: string): string {
  return path.split("/").pop() || path;
}

/** Best-effort mod name from a filename: everything before the first "-" or "_", capitalized. */
export function guessTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const stop = base.search(/[-_]/);
  const raw = (stop === -1 ? base : base.slice(0, stop)).trim();
  if (!raw) return filename;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface ModrinthVersionDependency {
  projectId: string | null;
  versionId: string | null;
  dependencyType: "required" | "optional" | "incompatible" | "embedded";
}

export interface ModrinthUpdate {
  versionId: string;
  versionNumber: string;
  versionType: "release" | "beta" | "alpha";
  filename: string;
  url: string;
  sha1: string;
  size: number;
  datePublished: string;
  downloads: number;
  dependencies: ModrinthVersionDependency[];
}

/**
 * All versions of a project for a given loader + Minecraft version, newest first.
 * Shaders/resourcepacks use loader facets Modrinth doesn't tag consistently
 * (iris/optifine/canvas) — like searchProjects, skip the loader filter for them
 * rather than risk finding zero compatible versions for a real shader/pack.
 */
export async function listVersions(
  projectId: string,
  loader: string,
  gameVersion: string,
  category: "mods" | "shaderpacks" | "resourcepacks" = "mods"
): Promise<ModrinthUpdate[]> {
  try {
    const params = new URLSearchParams({
      game_versions: JSON.stringify([gameVersion]),
    });
    if (category === "mods") params.set("loaders", JSON.stringify([loader]));
    const res = await fetch(`${API}/project/${projectId}/version?${params}`);
    if (!res.ok) return [];
    const versions: ModrinthVersionFull[] = await res.json();
    return versions.map(mapVersionFull).filter((v): v is ModrinthUpdate => v !== null);
  } catch {
    return [];
  }
}

function mapVersionFull(v: ModrinthVersionFull): ModrinthUpdate | null {
  const file = v.files.find((f) => f.primary) ?? v.files[0];
  if (!file) return null;
  return {
    versionId: v.id,
    versionNumber: v.version_number,
    versionType: v.version_type,
    filename: file.filename,
    url: file.url,
    sha1: file.hashes.sha1,
    size: file.size,
    datePublished: v.date_published,
    downloads: v.downloads,
    dependencies: (v.dependencies ?? []).map((d) => ({
      projectId: d.project_id,
      versionId: d.version_id,
      dependencyType: d.dependency_type,
    })),
  };
}

/**
 * Fetches full version data (including dependencies) for an explicit list of
 * version ids in one request — used to check every installed mod's current
 * dependencies at once instead of one listVersions() call per mod. Verified
 * against Modrinth's live API (GET /v2/versions?ids=[...]) — same batching
 * shape as lookupProjects' /projects?ids=.
 */
export async function getVersionsByIds(versionIds: string[]): Promise<ModrinthUpdate[]> {
  const unique = Array.from(new Set(versionIds));
  if (unique.length === 0) return [];
  try {
    const res = await fetch(`${API}/versions?ids=${encodeURIComponent(JSON.stringify(unique))}`);
    if (!res.ok) return [];
    const versions: ModrinthVersionFull[] = await res.json();
    return versions.map(mapVersionFull).filter((v): v is ModrinthUpdate => v !== null);
  } catch {
    return [];
  }
}

/** A dependency's project title/icon, for an auto-installed mod that wasn't
 *  already in the picture (reuses the same cached lookup identifyModrinthFiles
 *  and getRequiredDependencies use internally). */
export async function getProjectInfo(projectId: string): Promise<{ title: string; iconUrl: string | null } | null> {
  const projects = await lookupProjects([projectId]);
  const p = projects[projectId];
  return p ? { title: p.title, iconUrl: p.icon_url } : null;
}

/** Batch form of getProjectInfo — one request for every id not cached yet.
 *  Ids Modrinth doesn't know are simply absent from the result. */
export async function getProjectsInfo(
  projectIds: string[]
): Promise<Record<string, { title: string; iconUrl: string | null }>> {
  const projects = await lookupProjects(projectIds);
  return Object.fromEntries(
    Object.entries(projects).map(([id, p]) => [id, { title: p.title, iconUrl: p.icon_url }])
  );
}

/**
 * Latest available version of a project for a given loader + Minecraft version,
 * used to offer updates for optionally-installed (non-manifest) files.
 */
export async function getLatestVersion(
  projectId: string,
  loader: string,
  gameVersion: string,
  category: "mods" | "shaderpacks" | "resourcepacks" = "mods"
): Promise<ModrinthUpdate | null> {
  const versions = await listVersions(projectId, loader, gameVersion, category);
  return versions[0] ?? null;
}

export interface ModrinthProjectDetail {
  description: string;
  body: string;
  categories: string[];
  downloads: number;
  followers: number;
  /** `url` is often a 350px thumbnail; `rawUrl` is the original upload. */
  gallery: Array<{ url: string; rawUrl?: string; title?: string; featured?: boolean }>;
  organizationId?: string;
  /** The icon as uploaded (`icon_url` is a 96px thumbnail). */
  rawIconUrl?: string;
}

const projectDetailCache = new Map<string, ModrinthProjectDetail | null>();

/** Full project info (description + gallery) for the mod-detail view. */
export async function getProjectDetail(projectId: string): Promise<ModrinthProjectDetail | null> {
  if (projectDetailCache.has(projectId)) return projectDetailCache.get(projectId)!;
  try {
    const res = await fetch(`${API}/project/${projectId}`);
    if (!res.ok) {
      projectDetailCache.set(projectId, null);
      return null;
    }
    const p: ModrinthProjectFull = await res.json();
    const detail: ModrinthProjectDetail = {
      description: p.description,
      body: p.body,
      categories: p.categories ?? [],
      downloads: p.downloads ?? 0,
      followers: p.followers ?? 0,
      gallery: (p.gallery ?? []).map((g) => ({ url: g.url, rawUrl: g.raw_url, title: g.title, featured: g.featured })),
      organizationId: p.organization ?? undefined,
      rawIconUrl: p.raw_icon_url ?? undefined,
    };
    projectDetailCache.set(projectId, detail);
    return detail;
  } catch {
    projectDetailCache.set(projectId, null);
    return null;
  }
}

/** Who publishes a project: its organization if it has one (only in the v3 API),
 *  otherwise the owner of its team. null = couldn't find out. */
export async function getProjectAuthor(projectId: string, hasOrganization: boolean): Promise<string | null> {
  try {
    if (hasOrganization) {
      const res = await fetch(`https://api.modrinth.com/v3/project/${projectId}/organization`);
      if (res.ok) {
        const org = await res.json();
        if (org?.name) return org.name;
      }
    }
    const res = await fetch(`${API}/project/${projectId}/members`);
    if (!res.ok) return null;
    const members: Array<{ role?: string; user?: { username?: string } }> = await res.json();
    const owner = members.find((m) => m.role === "Owner") ?? members[0];
    return owner?.user?.username ?? null;
  } catch {
    return null;
  }
}

export interface ModrinthDependency {
  projectId: string;
  title: string;
  iconUrl: string | null;
}

/** Resolves a version's "required" dependencies into displayable project info. */
export async function getRequiredDependencies(
  dependencies: ModrinthVersionDependency[] | undefined
): Promise<ModrinthDependency[]> {
  if (!dependencies || dependencies.length === 0) return [];
  const requiredIds = Array.from(
    new Set(
      dependencies
        .filter((d) => d.dependencyType === "required" && d.projectId)
        .map((d) => d.projectId as string)
    )
  );
  if (requiredIds.length === 0) return [];
  const projects = await lookupProjects(requiredIds);
  return requiredIds
    .map((id) => projects[id])
    .filter((p): p is ModrinthProject => !!p)
    .map((p) => ({ projectId: p.id, title: p.title, iconUrl: p.icon_url }));
}

export interface ModrinthSearchHit {
  projectId: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
}

interface ModrinthSearchResponse {
  hits: Array<{
    project_id: string;
    title: string;
    description: string;
    icon_url: string | null;
    downloads: number;
    follows: number;
  }>;
}

export type ModrinthSort = "relevance" | "downloads" | "follows" | "newest";

const PROJECT_TYPE: Record<"mods" | "shaderpacks" | "resourcepacks", string> = {
  mods: "mod",
  shaderpacks: "shader",
  resourcepacks: "resourcepack",
};

/**
 * Searches (or, with an empty query, browses currently-popular) Modrinth
 * projects for a category, filtered to what's compatible with the pack.
 * Only mods are filtered by loader — shaders/resourcepacks use different,
 * inconsistent loader facets on Modrinth (iris/optifine/canvas), so we skip
 * that filter for them rather than risk silently excluding valid results.
 */
export const SEARCH_PAGE_SIZE = 20;

export async function searchProjects(
  category: "mods" | "shaderpacks" | "resourcepacks",
  query: string,
  loader: string,
  gameVersion: string,
  offset = 0,
  limit = SEARCH_PAGE_SIZE,
  sort: ModrinthSort = "relevance",
  genreCategory?: string | null,
  /** Only mods that run on a server (client-only ones are left out). */
  serverSide = false
): Promise<ModrinthSearchHit[]> {
  try {
    const facets = [[`project_type:${PROJECT_TYPE[category]}`], [`versions:${gameVersion}`]];
    if (serverSide) facets.push(["server_side:required", "server_side:optional"]);
    if (category === "mods") facets.push([`categories:${loader}`]);
    if (genreCategory) facets.push([`categories:${genreCategory}`]);
    const params = new URLSearchParams({
      query,
      facets: JSON.stringify(facets),
      index: sort,
      offset: String(offset),
      limit: String(limit),
    });
    const res = await fetch(`${API}/search?${params}`);
    if (!res.ok) return [];
    const data: ModrinthSearchResponse = await res.json();
    return data.hits.map((h) => ({
      projectId: h.project_id,
      title: h.title,
      description: h.description,
      iconUrl: h.icon_url,
      downloads: h.downloads,
      follows: h.follows,
    }));
  } catch {
    return [];
  }
}

interface ModrinthCategoryTag {
  name: string;
  project_type: string;
  header: string;
}

const categoryTagsCache = new Map<string, string[]>();

/**
 * The genre/theme category tags Modrinth offers for a project type (e.g.
 * "adventure", "magic", "technology"...) — excludes the other tag groups the
 * same endpoint returns (loaders, shader performance impact, pack resolutions).
 */
export async function fetchCategoryTags(category: "mods" | "shaderpacks" | "resourcepacks"): Promise<string[]> {
  const projectType = PROJECT_TYPE[category];
  const cached = categoryTagsCache.get(projectType);
  if (cached) return cached;
  try {
    const res = await fetch(`${API}/tag/category`);
    if (!res.ok) return [];
    const tags: ModrinthCategoryTag[] = await res.json();
    const names = tags.filter((t) => t.project_type === projectType && t.header === "categories").map((t) => t.name);
    categoryTagsCache.set(projectType, names);
    return names;
  } catch {
    return [];
  }
}

// ─── Public modpacks (Hub → Modrinth) ─────────────────────────────────────────

export interface ModpackHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  /** Genre categories only (no loaders). */
  categories: string[];
  /** Loaders it supports, from its categories (fabric, forge, neoforge, quilt…). */
  loaders: string[];
  gameVersions: string[];
  gallery: string[];
  dateModified: string;
}

export interface ModpackSearch {
  query: string;
  /** Genre categories — all must match. */
  categories: string[];
  loader: "fabric" | "forge" | "neoforge" | null;
  gameVersion: string | null;
  sort: ModrinthSort | "updated";
  offset: number;
}

const LOADER_TAGS = new Set(["fabric", "forge", "neoforge", "quilt"]);

export async function searchModpacks(s: ModpackSearch): Promise<{ hits: ModpackHit[]; total: number }> {
  try {
    const facets: string[][] = [["project_type:modpack"]];
    for (const c of s.categories) facets.push([`categories:${c}`]);
    if (s.loader) facets.push([`categories:${s.loader}`]);
    if (s.gameVersion) facets.push([`versions:${s.gameVersion}`]);
    const params = new URLSearchParams({
      query: s.query,
      facets: JSON.stringify(facets),
      index: s.sort,
      offset: String(s.offset),
      limit: String(SEARCH_PAGE_SIZE),
    });
    const res = await fetch(`${API}/search?${params}`);
    if (!res.ok) return { hits: [], total: 0 };
    const data = await res.json();
    return {
      total: data.total_hits ?? 0,
      hits: (data.hits ?? []).map((h: any) => ({
        projectId: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        author: h.author,
        iconUrl: h.icon_url || null,
        downloads: h.downloads ?? 0,
        follows: h.follows ?? 0,
        categories: (h.display_categories ?? h.categories ?? []).filter((c: string) => !LOADER_TAGS.has(c)),
        loaders: (h.categories ?? []).filter((c: string) => LOADER_TAGS.has(c)),
        gameVersions: h.versions ?? [],
        gallery: h.gallery ?? [],
        dateModified: h.date_modified,
      })),
    };
  } catch {
    return { hits: [], total: 0 };
  }
}

export interface ModpackVersion {
  versionId: string;
  versionNumber: string;
  name: string;
  versionType: "release" | "beta" | "alpha";
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
  /** The .mrpack. */
  url: string;
  sha1: string;
  size: number;
  changelog: string;
}

export const SUPPORTED_MODPACK_LOADERS = new Set(["fabric", "forge", "neoforge"]);

/** Whether ALaunchi can install this version (Quilt-only packs, for one, it can't). */
export function isSupportedModpackVersion(v: ModpackVersion): boolean {
  return v.loaders.length === 0 || v.loaders.some((l) => SUPPORTED_MODPACK_LOADERS.has(l)) || v.loaders.includes("minecraft");
}

/** Every version of a modpack that ships an .mrpack, newest first. */
export async function listModpackVersions(projectId: string): Promise<ModpackVersion[]> {
  try {
    const res = await fetch(`${API}/project/${projectId}/version`);
    if (!res.ok) return [];
    const versions: any[] = await res.json();
    return versions
      .map((v) => {
        const file = (v.files ?? []).find((f: any) => f.filename?.endsWith(".mrpack") && f.primary) ?? (v.files ?? []).find((f: any) => f.filename?.endsWith(".mrpack"));
        if (!file) return null;
        return {
          versionId: v.id,
          versionNumber: v.version_number,
          name: v.name,
          versionType: v.version_type,
          gameVersions: v.game_versions ?? [],
          loaders: v.loaders ?? [],
          datePublished: v.date_published,
          downloads: v.downloads ?? 0,
          url: file.url,
          sha1: file.hashes?.sha1 ?? "",
          size: file.size ?? 0,
          changelog: v.changelog ?? "",
        } as ModpackVersion;
      })
      .filter((v): v is ModpackVersion => v !== null);
  } catch {
    return [];
  }
}

/**
 * A mod a crash diagnosis says is missing (by mod id, plus the slug it guessed):
 * the newest version on Modrinth for this loader + Minecraft. Tries the known
 * slugs first, then a search whose hit looks like the same mod. main.js still
 * checks the downloaded jar really declares `modId` before installing it.
 */
export async function findModForMissingId(
  modId: string,
  slugs: string[],
  loader: string,
  gameVersion: string
): Promise<{ projectId: string; title: string; version: ModrinthUpdate } | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pick = (versions: ModrinthUpdate[]) => versions.find((v) => v.versionType === "release") ?? versions[0] ?? null;
  const tried = new Set<string>();
  for (const slug of [...slugs, modId, modId.replace(/_/g, "-")]) {
    if (!slug || tried.has(slug)) continue;
    tried.add(slug);
    try {
      const res = await fetch(`${API}/project/${encodeURIComponent(slug)}`);
      if (!res.ok) continue;
      const p: { id: string; title: string; project_type: string } = await res.json();
      if (p.project_type !== "mod") continue;
      tried.add(p.id);
      const version = pick(await listVersions(p.id, loader, gameVersion));
      if (version) return { projectId: p.id, title: p.title, version };
    } catch {}
  }
  try {
    const facets = JSON.stringify([["project_type:mod"], [`categories:${loader}`], [`versions:${gameVersion}`]]);
    const res = await fetch(`${API}/search?${new URLSearchParams({ query: modId, facets, limit: "5" })}`);
    const hits: Array<{ project_id: string; slug: string; title: string }> = res.ok ? (await res.json()).hits ?? [] : [];
    for (const h of hits) {
      if (tried.has(h.project_id)) continue;
      if (norm(h.slug) !== norm(modId) && norm(h.title) !== norm(modId) && !norm(h.slug).startsWith(norm(modId))) continue;
      const version = pick(await listVersions(h.project_id, loader, gameVersion));
      if (version) return { projectId: h.project_id, title: h.title, version };
    }
  } catch {}
  return null;
}
