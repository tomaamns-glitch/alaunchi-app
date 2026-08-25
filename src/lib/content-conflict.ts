import type { ModrinthMatch } from "@/services/modrinth";

export type ConflictResolution =
  | { kind: "block"; reason: string }
  | { kind: "skip"; reason: string }
  | { kind: "prompt"; existingPath: string; existingLabel: string }
  | { kind: "write"; targetPath: string };

/** Minimal shape of an existing content row this needs — deliberately not the
 *  page's own ContentRow (unexported, and this module has no business depending
 *  on a page component). */
export interface ExistingContentRow {
  path: string;
  mandatory: boolean;
}

export interface ResolveConflictInput {
  /** Proposed destination, e.g. "mods/foo.jar". */
  targetPath: string;
  /** Modrinth identity of the incoming file, if it resolved to one. */
  modrinthProjectId: string | null;
  modrinthVersionId: string | null;
  /** rowsFor(category) for a mods/shaderpacks/resourcepacks category. */
  existingRows: ExistingContentRow[];
  /** path -> Modrinth match, for the same rows. */
  existingModrinthMatches: Map<string, ModrinthMatch>;
}

/** Decides what should happen to an incoming mod/shaderpack/resourcepack file
 *  given what's already installed. Pure — no IPC, no React — and shared by both
 *  the drag-and-drop and file-picker entry points, since there's no reason the
 *  outcome should depend on how the file was added.
 *
 *  Only for categories with a mandatory/optional distinction and Modrinth
 *  identity (mods/shaderpacks/resourcepacks) — see resolveNoIdentityConflict
 *  for emotes/schematics, which have neither concept. */
export function resolveContentConflict(input: ResolveConflictInput): ConflictResolution {
  const { targetPath, modrinthProjectId, modrinthVersionId, existingRows, existingModrinthMatches } = input;

  if (modrinthProjectId) {
    for (const row of existingRows) {
      const match = existingModrinthMatches.get(row.path);
      if (!match || match.projectId !== modrinthProjectId) continue;

      const sameVersion = match.versionId === modrinthVersionId;
      if (row.mandatory) {
        return sameVersion
          ? { kind: "skip", reason: "Ya está instalado (obligatorio)." }
          : { kind: "block", reason: `${match.title} es obligatorio en este modpack — no se puede reemplazar por otra versión.` };
      }
      return sameVersion
        ? { kind: "skip", reason: "Ya está instalado." }
        : { kind: "prompt", existingPath: row.path, existingLabel: `${match.title} (v${match.versionNumber})` };
    }
    // Resolved on Modrinth but no existing row matches that project — fresh install.
    return { kind: "write", targetPath };
  }

  // No Modrinth identity (private jar, or a resourcepack/shaderpack Modrinth
  // doesn't resolve) — filename-at-target is the only signal left. Still must
  // check mandatory here: a colliding row could be a mandatory file with no
  // Modrinth match of its own (e.g. a privately-hosted required mod), and that
  // must block exactly like the identified case above, not fall through to a
  // prompt that could let "use the new one" overwrite it.
  const collidingRow = existingRows.find((r) => r.path === targetPath);
  if (!collidingRow) return { kind: "write", targetPath };
  if (collidingRow.mandatory) {
    return { kind: "block", reason: "Este archivo es obligatorio en este modpack — no se puede reemplazar." };
  }
  return { kind: "prompt", existingPath: targetPath, existingLabel: targetPath.slice(targetPath.lastIndexOf("/") + 1) };
}

/** For emotes/schematics (no mandatory/version concept at all): if targetPath is
 *  free, use it as-is; if it's taken by a file with the SAME hash, it's a pure
 *  duplicate (skip); if taken by a file with a DIFFERENT (or unknown — schematics
 *  don't compute existing files' hashes today, see mc:list-schematics) hash,
 *  auto-suffix rather than prompting — there's no "version" to ask the user to
 *  choose between, just two differently-named copies. `existingPaths` is the
 *  authoritative existence check; `existingPathToSha1` may only cover a subset
 *  (or none) of it — an unknown hash is treated as "assume different," never as
 *  "assume free," so this can never silently overwrite an existing file. Same
 *  stem/ext-splitting shape as targetPathForSchematicFile (src/services/minemev.ts),
 *  kept separate since that one's scoped to its own caller (uuid-based suffix)
 *  and this one needs a hash-based suffix instead. */
export function resolveNoIdentityConflict(
  targetPath: string,
  sha1: string,
  existingPaths: Set<string>,
  existingPathToSha1: Map<string, string>
): ConflictResolution {
  if (!existingPaths.has(targetPath)) return { kind: "write", targetPath };
  if (existingPathToSha1.get(targetPath) === sha1) return { kind: "skip", reason: "Ya está instalado (copia idéntica)." };

  const dot = targetPath.lastIndexOf(".");
  const stem = dot === -1 ? targetPath : targetPath.slice(0, dot);
  const ext = dot === -1 ? "" : targetPath.slice(dot);
  let suffixed = `${stem}-${sha1.slice(0, 8)}${ext}`;
  // Extremely unlikely, but don't silently drop a file if even the hash-suffixed
  // name collides (e.g. same content re-added under two different filenames).
  let n = 2;
  while (existingPaths.has(suffixed)) {
    suffixed = `${stem}-${sha1.slice(0, 8)}-${n}${ext}`;
    n++;
  }
  return { kind: "write", targetPath: suffixed };
}
