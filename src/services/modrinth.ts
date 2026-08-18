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

interface ModrinthVersionFull {
  id: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  date_published: string;
  files: Array<{ primary: boolean; filename: string; url: string; hashes: { sha1: string } }>;
}

interface ModrinthProjectFull {
  description: string;
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

export interface ModrinthUpdate {
  versionId: string;
  versionNumber: string;
  versionType: "release" | "beta" | "alpha";
  filename: string;
  url: string;
  sha1: string;
}

/** All versions of a project for a given loader + Minecraft version, newest first. */
export async function listVersions(
  projectId: string,
  loader: string,
  gameVersion: string
): Promise<ModrinthUpdate[]> {
  try {
    const params = new URLSearchParams({
      loaders: JSON.stringify([loader]),
      game_versions: JSON.stringify([gameVersion]),
    });
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
  gameVersion: string
): Promise<ModrinthUpdate | null> {
  const versions = await listVersions(projectId, loader, gameVersion);
  return versions[0] ?? null;
}

export interface ModrinthProjectDetail {
  description: string;
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
      gallery: (p.gallery ?? []).map((g) => ({ url: g.url, title: g.title })),
    };
    projectDetailCache.set(projectId, detail);
    return detail;
  } catch {
    projectDetailCache.set(projectId, null);
    return null;
  }
}
