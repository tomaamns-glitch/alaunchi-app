import type { SnapshotEntry } from "./github";

export interface ModrinthMatch {
  title: string;
  iconUrl: string | null;
  versionNumber: string;
}

interface ModrinthVersionFile {
  project_id: string;
  version_number: string;
}

interface ModrinthProject {
  id: string;
  title: string;
  icon_url: string | null;
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
 * Identifies which manifest files are recognized Modrinth projects, matched by
 * file hash. Returns a map keyed by file path — entries with no match (not on
 * Modrinth, or manifest published before sha1 was tracked) are simply absent.
 */
export async function identifyModrinthFiles(entries: SnapshotEntry[]): Promise<Map<string, ModrinthMatch>> {
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
      versionNumber: version.version_number,
    });
  }
  return result;
}
