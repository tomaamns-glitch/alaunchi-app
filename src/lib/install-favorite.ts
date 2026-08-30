import { getLatestVersion, identifyModrinthFiles, categoryOf } from "@/services/modrinth";
import { listInstanceFiles, downloadInstanceFile, deleteInstanceFile } from "@/services/electron";
import { fetchSnapshot, type Modpack } from "@/services/github";
import { getGithubRepo, getModpacksToken } from "@/lib/app-config";
import { resolveContentConflict } from "@/lib/content-conflict";
import type { FavoriteEntry } from "@/services/favorites";

export type InstallOutcome =
  | { kind: "installed" }
  | { kind: "skipped"; reason: string }
  | { kind: "blocked"; reason: string }
  | { kind: "incompatible" }
  /** Same mod, different version already installed and it's not mandatory —
   *  the caller must ask the user before this proceeds. */
  | { kind: "needsChoice"; existingLabel: string; proceed: () => Promise<InstallOutcome> };

/**
 * Installs a favorited mod/shaderpack/resourcepack (identified only by its
 * Modrinth project id — no specific version, unlike a shared-content chat
 * message) into one of the viewer's OWN instances. Resolves the best version
 * for that instance's loader + Minecraft version live via Modrinth, then
 * reuses the exact same conflict logic the drag-and-drop / file-picker
 * install paths already use (content-conflict.ts) so a mandatory file, or a
 * different version of something already installed, is handled identically
 * everywhere in the app.
 */
export async function installFavoriteInto(target: Modpack, favorite: FavoriteEntry): Promise<InstallOutcome> {
  const update = await getLatestVersion(favorite.projectId, target.loaderType, target.minecraftVersion, favorite.category);
  if (!update) return { kind: "incompatible" };

  const targetPath = `${favorite.category}/${update.filename}`;

  const allFiles = await listInstanceFiles(target.id);
  const categoryFiles = allFiles.filter((f) => categoryOf(f.path) === favorite.category);
  const matches = await identifyModrinthFiles(categoryFiles.map((f) => ({ path: f.path, sha1: f.sha1 })));

  // Custom/private instances have no manifest — nothing in them is ever
  // "mandatory". Published catalog packs do: re-fetch the live manifest so a
  // mandatory file still hard-blocks here exactly like it does inside the
  // instance's own page, instead of silently treating it as replaceable.
  const mandatoryPaths = new Set<string>();
  if (target.source !== "custom") {
    try {
      const manifest = await fetchSnapshot(getGithubRepo(), target.id, getModpacksToken() || undefined);
      for (const f of manifest?.files ?? []) {
        if (f.required !== false) mandatoryPaths.add(f.path);
      }
    } catch {
      // Best-effort — an unreachable manifest just means nothing here is
      // treated as mandatory, same as a custom instance.
    }
  }

  const existingRows = categoryFiles.map((f) => ({ path: f.path, mandatory: mandatoryPaths.has(f.path) }));

  const resolution = resolveContentConflict({
    targetPath,
    modrinthProjectId: favorite.projectId,
    modrinthVersionId: update.versionId,
    existingRows,
    existingModrinthMatches: matches,
  });

  const write = async (existingPath?: string): Promise<InstallOutcome> => {
    await downloadInstanceFile(target.id, targetPath, update.url, update.sha1);
    if (existingPath && existingPath !== targetPath) {
      await deleteInstanceFile(target.id, existingPath).catch(() => {});
    }
    return { kind: "installed" };
  };

  if (resolution.kind === "block") return { kind: "blocked", reason: resolution.reason };
  if (resolution.kind === "skip") return { kind: "skipped", reason: resolution.reason };
  if (resolution.kind === "prompt") {
    return { kind: "needsChoice", existingLabel: resolution.existingLabel, proceed: () => write(resolution.existingPath) };
  }
  return write();
}
