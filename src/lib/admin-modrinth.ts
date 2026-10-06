import { listVersions, getProjectInfo, type ModrinthUpdate, type ModrinthMatch } from "@/services/modrinth";

/**
 * Modrinth helpers for the admin file manager (pages/admin-modpack.tsx):
 * picking the right version for the pack, downloading it as a File ready to be
 * staged like any hand-uploaded file, and working out which required
 * dependencies are still missing.
 */

export type AdminContentCategory = "mods" | "shaderpacks" | "resourcepacks";

export interface PackTarget {
  loader: string;
  minecraftVersion: string;
}

/** A file downloaded from Modrinth, ready to stage at `path`. */
export interface ModrinthDownload {
  path: string;
  file: File;
  sha1: string;
  match: ModrinthMatch;
}

/** "v1.2.3" for plain numbers, as-is for labels that already carry their own
 *  prefix ("mc1.21.1-0.9.4+fabric", "fabric-1.21.1-1.0.8"…). */
export function versionLabel(versionNumber: string): string {
  return /^\d/.test(versionNumber) ? `v${versionNumber}` : versionNumber;
}

/** Releases first; Modrinth already returns versions newest-first. */
export function pickDefaultVersion(versions: ModrinthUpdate[]): ModrinthUpdate | null {
  return versions.find((v) => v.versionType === "release") ?? versions[0] ?? null;
}

export async function sha1Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Downloads one version's primary file and checks it against Modrinth's sha1. */
export async function downloadVersion(
  version: ModrinthUpdate,
  category: AdminContentCategory,
  project: { projectId: string; title: string; iconUrl: string | null }
): Promise<ModrinthDownload> {
  const res = await fetch(version.url);
  if (!res.ok) throw new Error(`No se pudo descargar ${version.filename} (HTTP ${res.status}).`);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const sha1 = await sha1Hex(buf);
  if (version.sha1 && sha1 !== version.sha1.toLowerCase()) {
    throw new Error(`${version.filename} llegó dañado (el hash no coincide). Vuelve a intentarlo.`);
  }
  return {
    path: `${category}/${version.filename}`,
    file: new File([blob], version.filename, { type: blob.type || "application/java-archive" }),
    sha1,
    match: {
      title: project.title,
      iconUrl: project.iconUrl,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      projectId: project.projectId,
    },
  };
}

/** The version of a dependency to add: the one the parent pins, if it pins
 *  one AND that one is for this loader/Minecraft version (pins often point at
 *  a build for another Minecraft version), otherwise the newest compatible
 *  release. */
async function resolveDependencyVersion(
  projectId: string,
  pinnedVersionId: string | null,
  target: PackTarget
): Promise<ModrinthUpdate | null> {
  const compatible = await listVersions(projectId, target.loader, target.minecraftVersion, "mods");
  const pinned = pinnedVersionId ? compatible.find((v) => v.versionId === pinnedVersionId) : undefined;
  return pinned ?? pickDefaultVersion(compatible);
}

export interface PlannedDependency {
  projectId: string;
  title: string;
  iconUrl: string | null;
  version: ModrinthUpdate | null;
  /** Titles of the mods that need it (for the UI). */
  requiredBy: string[];
}

interface Need {
  projectId: string;
  pinnedVersionId: string | null;
  requiredBy: string;
}

/** Breadth-first: resolves each needed project, then what IT requires, skipping
 *  anything in `seen` (already in the update, or already planned). */
async function expandNeeds(initial: Need[], seen: Set<string>, target: PackTarget): Promise<PlannedDependency[]> {
  const planned = new Map<string, PlannedDependency>();
  const queue = [...initial];
  while (queue.length > 0) {
    const need = queue.shift()!;
    const existing = planned.get(need.projectId);
    if (existing) {
      if (!existing.requiredBy.includes(need.requiredBy)) existing.requiredBy.push(need.requiredBy);
      continue;
    }
    if (seen.has(need.projectId)) continue;
    seen.add(need.projectId);
    const [info, version] = await Promise.all([
      getProjectInfo(need.projectId),
      resolveDependencyVersion(need.projectId, need.pinnedVersionId, target),
    ]);
    const entry: PlannedDependency = {
      projectId: need.projectId,
      title: info?.title ?? need.projectId,
      iconUrl: info?.iconUrl ?? null,
      version,
      requiredBy: [need.requiredBy],
    };
    planned.set(need.projectId, entry);
    if (version) queue.push(...requiredNeeds(entry.title, version));
  }
  return Array.from(planned.values());
}

function requiredNeeds(parentTitle: string, version: ModrinthUpdate): Need[] {
  return version.dependencies
    .filter((d) => d.dependencyType === "required" && d.projectId)
    .map((d) => ({ projectId: d.projectId!, pinnedVersionId: d.versionId, requiredBy: parentTitle }));
}

/**
 * Every required dependency (recursively — a dependency's own dependencies
 * too) of `roots` that isn't already among `presentProjectIds`. A dependency
 * with no version for this loader/Minecraft version comes back with
 * `version: null` so the UI can say so instead of silently skipping it.
 */
export async function planMissingDependencies(
  roots: { title: string; version: ModrinthUpdate }[],
  presentProjectIds: Set<string>,
  target: PackTarget
): Promise<PlannedDependency[]> {
  return expandNeeds(roots.flatMap((r) => requiredNeeds(r.title, r.version)), new Set(presentProjectIds), target);
}

/** Same, starting from projects already known to be missing (the file
 *  manager's "faltan dependencias" warning) — includes their own dependencies. */
export async function planProjects(
  needs: { projectId: string; requiredBy: string[] }[],
  presentProjectIds: Set<string>,
  target: PackTarget
): Promise<PlannedDependency[]> {
  const initial = needs.flatMap((n) => n.requiredBy.map((by) => ({ projectId: n.projectId, pinnedVersionId: null, requiredBy: by })));
  return expandNeeds(initial, new Set(presentProjectIds), target);
}

/** Downloads a planned set of dependencies (the ones that have a version). */
export async function downloadDependencies(deps: PlannedDependency[]): Promise<ModrinthDownload[]> {
  const out: ModrinthDownload[] = [];
  for (const d of deps) {
    if (!d.version) continue;
    out.push(await downloadVersion(d.version, "mods", { projectId: d.projectId, title: d.title, iconUrl: d.iconUrl }));
  }
  return out;
}
