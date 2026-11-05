// Modrinth for the Explorar page (pages/explore.tsx): search across every
// project type, a project's full page, its team, and creator profiles (users
// and organizations). Public API, no key — same as services/modrinth.ts.

const API = "https://api.modrinth.com/v2";
const API3 = "https://api.modrinth.com/v3";

export type ExploreType = "modpack" | "mod" | "shader" | "resourcepack" | "datapack";
export type ExploreSort = "relevance" | "downloads" | "follows" | "newest" | "updated";

export const EXPLORE_PAGE_SIZE = 24;

const LOADER_TAGS = new Set(["fabric", "forge", "neoforge", "quilt"]);

export interface ExploreHit {
  projectId: string;
  slug: string;
  projectType: ExploreType;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  /** Genre categories only (no loaders). */
  categories: string[];
  loaders: string[];
  gameVersions: string[];
  gallery: string[];
  featuredGallery: string | null;
  dateModified: string;
  color: number | null;
}

function mapHit(h: any): ExploreHit {
  return {
    projectId: h.project_id,
    slug: h.slug,
    projectType: h.project_type,
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
    featuredGallery: h.featured_gallery || null,
    dateModified: h.date_modified,
    color: typeof h.color === "number" ? h.color : null,
  };
}

export async function exploreSearch(s: {
  type: ExploreType;
  query: string;
  sort: ExploreSort;
  gameVersion: string | null;
  /** Mods and modpacks only — shaders/packs tag loaders inconsistently. */
  loader: string | null;
  category: string | null;
  offset: number;
}): Promise<{ hits: ExploreHit[]; total: number }> {
  const facets: string[][] = [[`project_type:${s.type}`]];
  if (s.gameVersion) facets.push([`versions:${s.gameVersion}`]);
  if (s.loader && (s.type === "mod" || s.type === "modpack")) facets.push([`categories:${s.loader}`]);
  if (s.category) facets.push([`categories:${s.category}`]);
  const params = new URLSearchParams({
    query: s.query,
    facets: JSON.stringify(facets),
    index: s.sort,
    offset: String(s.offset),
    limit: String(EXPLORE_PAGE_SIZE),
  });
  const res = await fetch(`${API}/search?${params}`);
  if (!res.ok) throw new Error(`Modrinth respondió ${res.status}`);
  const data = await res.json();
  return { total: data.total_hits ?? 0, hits: (data.hits ?? []).map(mapHit) };
}

const categoriesCache = new Map<string, string[]>();
/** Genre tags Modrinth offers for a project type ("adventure", "magic"…). */
export async function exploreCategories(type: ExploreType): Promise<string[]> {
  if (categoriesCache.has(type)) return categoriesCache.get(type)!;
  try {
    const res = await fetch(`${API}/tag/category`);
    const tags: { name: string; project_type: string; header: string }[] = await res.json();
    const names = tags.filter((t) => t.project_type === type && t.header === "categories").map((t) => t.name);
    categoriesCache.set(type, names);
    return names;
  } catch {
    return [];
  }
}

let releasesCache: string[] | null = null;
/** Minecraft release versions, newest first. */
export async function exploreGameVersions(): Promise<string[]> {
  if (releasesCache) return releasesCache;
  try {
    const res = await fetch(`${API}/tag/game_version`);
    const tags: { version: string; version_type: string }[] = await res.json();
    releasesCache = tags.filter((t) => t.version_type === "release").map((t) => t.version);
  } catch {
    releasesCache = [];
  }
  return releasesCache;
}

export interface ExploreProject {
  id: string;
  slug: string;
  projectType: ExploreType;
  title: string;
  description: string;
  body: string;
  iconUrl: string | null;
  downloads: number;
  followers: number;
  categories: string[];
  loaders: string[];
  gameVersions: string[];
  gallery: { url: string; title?: string }[];
  published: string;
  updated: string;
  license: string | null;
  links: { label: string; url: string }[];
  /** Organization id, when an organization owns it. */
  organization: string | null;
  team: string;
  color: number | null;
}

const projectCache = new Map<string, ExploreProject>();
export async function exploreProject(idOrSlug: string): Promise<ExploreProject> {
  const hit = projectCache.get(idOrSlug);
  if (hit) return hit;
  const res = await fetch(`${API}/project/${encodeURIComponent(idOrSlug)}`);
  if (!res.ok) throw new Error(res.status === 404 ? "Ese proyecto ya no existe en Modrinth." : `Modrinth respondió ${res.status}`);
  const p = await res.json();
  const links: { label: string; url: string }[] = [];
  const add = (label: string, url?: string | null) => url && links.push({ label, url });
  add("Web del proyecto", `https://modrinth.com/${p.project_type}/${p.slug}`);
  add("Código fuente", p.source_url);
  add("Incidencias", p.issues_url);
  add("Wiki", p.wiki_url);
  add("Discord", p.discord_url);
  const project: ExploreProject = {
    id: p.id,
    slug: p.slug,
    projectType: p.project_type,
    title: p.title,
    description: p.description,
    body: p.body ?? "",
    iconUrl: p.icon_url || null,
    downloads: p.downloads ?? 0,
    followers: p.followers ?? 0,
    categories: (p.categories ?? []).filter((c: string) => !LOADER_TAGS.has(c)),
    loaders: p.loaders ?? [],
    gameVersions: p.game_versions ?? [],
    gallery: (p.gallery ?? []).map((g: any) => ({ url: g.url, title: g.title })),
    published: p.published,
    updated: p.updated,
    license: p.license?.name || p.license?.id || null,
    links,
    organization: p.organization || null,
    team: p.team,
    color: typeof p.color === "number" ? p.color : null,
  };
  projectCache.set(p.id, project);
  projectCache.set(p.slug, project);
  return project;
}

export interface ExploreMember {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: string;
}

/** Who makes a project (owner first). */
export async function exploreMembers(projectId: string): Promise<ExploreMember[]> {
  try {
    const res = await fetch(`${API}/project/${projectId}/members`);
    if (!res.ok) return [];
    const members: any[] = await res.json();
    return members
      .filter((m) => m.accepted !== false)
      .sort((a, b) => (b.role === "Owner" ? 1 : 0) - (a.role === "Owner" ? 1 : 0))
      .map((m) => ({ id: m.user.id, username: m.user.username, avatarUrl: m.user.avatar_url || null, role: m.role }));
  } catch {
    return [];
  }
}

export interface ExploreCreator {
  kind: "user" | "organization";
  id: string;
  /** What links to them (username or org slug). */
  handle: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  joined: string | null;
  projects: ExploreHit[];
  /** Sum of their projects' downloads. */
  downloads: number;
}

function projectToHit(p: any): ExploreHit {
  return {
    projectId: p.id,
    slug: p.slug,
    projectType: (Array.isArray(p.project_types) ? p.project_types[0] : p.project_type) as ExploreType,
    title: p.title ?? p.name,
    description: p.description ?? p.summary ?? "",
    author: "",
    iconUrl: p.icon_url || null,
    downloads: p.downloads ?? 0,
    follows: p.followers ?? 0,
    categories: (p.categories ?? []).filter((c: string) => !LOADER_TAGS.has(c)),
    loaders: p.loaders ?? [],
    gameVersions: p.game_versions ?? [],
    gallery: [],
    featuredGallery: null,
    dateModified: p.updated,
    color: typeof p.color === "number" ? p.color : null,
  };
}

const creatorCache = new Map<string, ExploreCreator | null>();

/**
 * A creator's profile: a user (by username or id) or, failing that, an
 * organization (by slug or id). null if neither exists. Modrinth has no
 * search for people, so the Creadores tab looks up the exact name.
 */
export async function exploreCreator(handle: string, prefer: "user" | "organization" = "user"): Promise<ExploreCreator | null> {
  const key = `${prefer}:${handle.toLowerCase()}`;
  if (creatorCache.has(key)) return creatorCache.get(key)!;
  const tryUser = async (): Promise<ExploreCreator | null> => {
    const res = await fetch(`${API}/user/${encodeURIComponent(handle)}`);
    if (!res.ok) return null;
    const u = await res.json();
    const pr = await fetch(`${API}/user/${u.id}/projects`);
    const projects = pr.ok ? ((await pr.json()) as any[]).map(projectToHit) : [];
    for (const p of projects) p.author = u.username;
    return {
      kind: "user",
      id: u.id,
      handle: u.username,
      name: u.name || u.username,
      bio: u.bio || "",
      avatarUrl: u.avatar_url || null,
      joined: u.created || null,
      projects: projects.sort((a, b) => b.downloads - a.downloads),
      downloads: projects.reduce((s, p) => s + p.downloads, 0),
    };
  };
  const tryOrg = async (): Promise<ExploreCreator | null> => {
    const res = await fetch(`${API3}/organization/${encodeURIComponent(handle)}`);
    if (!res.ok) return null;
    const o = await res.json();
    const pr = await fetch(`${API3}/organization/${o.id}/projects`);
    const projects = pr.ok ? ((await pr.json()) as any[]).map(projectToHit) : [];
    for (const p of projects) p.author = o.name;
    return {
      kind: "organization",
      id: o.id,
      handle: o.slug,
      name: o.name,
      bio: o.description || "",
      avatarUrl: o.icon_url || null,
      joined: null,
      projects: projects.sort((a, b) => b.downloads - a.downloads),
      downloads: projects.reduce((s, p) => s + p.downloads, 0),
    };
  };
  let creator: ExploreCreator | null = null;
  try {
    creator = prefer === "user" ? (await tryUser()) ?? (await tryOrg()) : (await tryOrg()) ?? (await tryUser());
  } catch {
    creator = null;
  }
  creatorCache.set(key, creator);
  return creator;
}

export interface ExploreVersion {
  versionId: string;
  versionNumber: string;
  name: string;
  versionType: "release" | "beta" | "alpha";
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
  filename: string;
  url: string;
  sha1: string;
  size: number;
  requiredProjectIds: string[];
}

/** Versions of a project, optionally only those for a loader + Minecraft version. Newest first. */
export async function exploreVersions(projectId: string, filter?: { loader?: string | null; gameVersion?: string | null }): Promise<ExploreVersion[]> {
  const params = new URLSearchParams();
  if (filter?.gameVersion) params.set("game_versions", JSON.stringify([filter.gameVersion]));
  if (filter?.loader) params.set("loaders", JSON.stringify([filter.loader]));
  const res = await fetch(`${API}/project/${projectId}/version${params.toString() ? `?${params}` : ""}`);
  if (!res.ok) return [];
  const versions: any[] = await res.json();
  return versions
    .map((v) => {
      const file = (v.files ?? []).find((f: any) => f.primary) ?? (v.files ?? [])[0];
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
        filename: file.filename,
        url: file.url,
        sha1: file.hashes?.sha1 ?? "",
        size: file.size ?? 0,
        requiredProjectIds: (v.dependencies ?? [])
          .filter((d: any) => d.dependency_type === "required" && d.project_id)
          .map((d: any) => d.project_id as string),
      } as ExploreVersion;
    })
    .filter((v): v is ExploreVersion => v !== null);
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)} k`;
  return String(n);
}
