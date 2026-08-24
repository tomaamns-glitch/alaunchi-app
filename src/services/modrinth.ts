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
  gallery: Array<{ url: string; title?: string; featured: boolean }>;
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
    return versions
      .map((v) => {
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
      })
      .filter((v): v is ModrinthUpdate => v !== null);
  } catch {
    return [];
  }
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
  gallery: Array<{ url: string; title?: string }>;
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
      gallery: (p.gallery ?? []).map((g) => ({ url: g.url, title: g.title })),
    };
    projectDetailCache.set(projectId, detail);
    return detail;
  } catch {
    projectDetailCache.set(projectId, null);
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
  genreCategory?: string | null
): Promise<ModrinthSearchHit[]> {
  try {
    const facets = [[`project_type:${PROJECT_TYPE[category]}`], [`versions:${gameVersion}`]];
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
