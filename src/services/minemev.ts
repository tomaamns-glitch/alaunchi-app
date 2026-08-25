// Client for an aggregator that unifies several third-party schematic-sharing
// sites (minemev, RedenMC, Choculaterie, MCodex) behind one search/details/files
// API — reverse-engineered from the open-source LitematicDownloader Minecraft
// mod's client code, not an officially documented public API for third parties.
// It can change or go down without notice; every call here swallows network
// errors into an empty/null result rather than throwing into the render path.
//
// Unlike Modrinth (src/services/modrinth.ts, called with plain fetch() since it
// sends proper CORS headers), this API does not send Access-Control-Allow-Origin
// (confirmed live) — the renderer's browser would block a direct fetch(), so
// every call here goes through window.electronAPI instead.

const eAPI = (window as any).electronAPI;
const isElectron = !!eAPI;

interface MinemevSearchHitRaw {
  post_name: string;
  uuid: string;
  vendor: string;
  images: string[];
  description: string | null;
  tags: string[];
  versions: string[];
  User: string;
  user_picture: string | null;
  downloads: number;
  published_at: string;
  thumbnail_url: string | null;
}
interface MinemevSearchResponseRaw {
  posts: MinemevSearchHitRaw[];
  total_pages: number;
  total_items: number;
  page: number;
}

export interface MinemevSearchHit {
  postName: string;
  uuid: string;
  vendor: string;
  thumbnailUrl: string | null;
  description: string;
  tags: string[];
  versions: string[];
  author: string;
  downloads: number;
  publishedAt: string;
}

export interface MinemevPostDetail {
  uuid: string;
  vendor: string;
  title: string;
  description: string;
  descriptionMd: string;
  author: string;
  downloads: number;
  publishedAt: string;
  tags: string[];
  versions: string[];
  images: string[];
}

interface MinemevFileRaw {
  id: number;
  default_file_name: string;
  file: string;
  file_size: number;
  versions: string[];
  downloads: number;
  file_type: string;
  is_verified: boolean;
}
export interface MinemevFile {
  id: number;
  fileName: string;
  downloadUrl: string;
  fileSize: number;
  versions: string[];
  fileType: string;
  isVerified: boolean;
  /** Whether the schematic viewer's parser understands this file's extension. */
  supported: boolean;
}

const SUPPORTED_EXTS = new Set([".litematic", ".schem", ".schematic", ".nbt"]);
// Kept in sync by hand with SCHEMATIC_EXTS in electron/main.js — main and renderer
// don't share modules, same precedent as SchematicFile mirroring SCHEMATIC_ROOTS.
function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

/** Empty query returns a general "browse latest" feed rather than an error or
 *  empty result (confirmed live), so this is safe to call as soon as the online
 *  tab opens, before the user types anything. */
export async function searchSchematicsOnline(
  query: string,
  page = 1,
  pageSize = 20
): Promise<{ hits: MinemevSearchHit[]; hasMore: boolean; ok: boolean }> {
  if (!isElectron) return { hits: [], hasMore: false, ok: false };
  try {
    const raw: MinemevSearchResponseRaw = await eAPI.searchSchematicsOnline({ query, page, pageSize });
    return {
      hits: (raw.posts ?? []).map((p) => ({
        postName: p.post_name,
        uuid: p.uuid,
        vendor: p.vendor,
        thumbnailUrl: p.thumbnail_url,
        description: p.description ?? "",
        tags: p.tags ?? [],
        versions: p.versions ?? [],
        author: p.User,
        downloads: p.downloads,
        publishedAt: p.published_at,
      })),
      hasMore: (raw.page ?? page) < (raw.total_pages ?? 1),
      ok: true,
    };
  } catch {
    return { hits: [], hasMore: false, ok: false };
  }
}

export async function getSchematicPostDetail(vendor: string, uuid: string): Promise<MinemevPostDetail | null> {
  if (!isElectron) return null;
  try {
    const raw = await eAPI.getSchematicPost({ vendor, uuid });
    return {
      uuid: raw.uuid,
      vendor,
      title: raw.post_name,
      description: raw.description ?? "",
      descriptionMd: raw.description_md ?? raw.description ?? "",
      author: raw.User,
      downloads: raw.downloads,
      publishedAt: raw.published_at,
      tags: raw.tags ?? [],
      versions: raw.versions ?? [],
      images: raw.images ?? [],
    };
  } catch {
    return null;
  }
}

export async function listSchematicFiles(vendor: string, uuid: string): Promise<MinemevFile[]> {
  if (!isElectron) return [];
  try {
    const raw: MinemevFileRaw[] = await eAPI.getSchematicFiles({ vendor, uuid });
    return raw.map((f) => ({
      id: f.id,
      fileName: f.default_file_name,
      downloadUrl: f.file,
      fileSize: f.file_size,
      versions: f.versions ?? [],
      fileType: f.file_type,
      isVerified: f.is_verified,
      supported: SUPPORTED_EXTS.has(extOf(f.default_file_name)),
    }));
  } catch {
    return [];
  }
}

/** Destination path under schematics/ — suffixed with the post's uuid on a name
 *  collision against files already known locally, rather than silently
 *  overwriting a different post's same-named file. */
export function targetPathForSchematicFile(file: MinemevFile, uuid: string, existingPaths: Set<string>): string {
  const base = file.fileName.replace(/[\\/]/g, "_");
  const candidate = `schematics/${base}`;
  if (!existingPaths.has(candidate)) return candidate;
  const dot = base.lastIndexOf(".");
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? "" : base.slice(dot);
  return `schematics/${stem}-${uuid.slice(0, 8)}${ext}`;
}
