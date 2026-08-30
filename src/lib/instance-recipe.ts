import {
  listInstanceFiles,
  downloadInstanceFile,
  createInstance,
  listForgeVersions,
  listNeoforgeVersions,
  listFabricVersions,
} from "@/services/electron";
import { identifyModrinthFiles, categoryOf, getVersionsByIds } from "@/services/modrinth";
import type { PublicInstanceSummary, RecipeEntry } from "@/services/public-profile";

/**
 * Computes the shareable "recipe" for one of the owner's own private
 * instances — everything in it Modrinth can identify by project+version id,
 * so a friend's launcher can redownload an equivalent copy from scratch
 * without either side ever uploading a .jar anywhere. Anything that doesn't
 * resolve (a manually-added file, a hand-edited config, a world save) simply
 * never travels — see unresolvedCount.
 */
export async function buildInstanceRecipe(instanceId: string): Promise<{ recipe: RecipeEntry[]; unresolvedCount: number }> {
  const files = await listInstanceFiles(instanceId);
  const contentFiles = files.filter((f) => categoryOf(f.path) !== null);
  const matches = await identifyModrinthFiles(contentFiles.map((f) => ({ path: f.path, sha1: f.sha1 })));

  const recipe: RecipeEntry[] = [];
  let unresolvedCount = 0;
  for (const f of contentFiles) {
    const match = matches.get(f.path);
    const category = categoryOf(f.path);
    if (match && category) {
      recipe.push({ category, projectId: match.projectId, versionId: match.versionId });
    } else {
      unresolvedCount++;
    }
  }
  return { recipe, unresolvedCount };
}

/** Same "pick the best build" logic as the loader-install verification —
 *  recommended Forge build, newest NeoForge release, stable Fabric loader. */
async function resolveLoaderVersion(
  loaderType: "forge" | "neoforge" | "fabric",
  mcVersion: string
): Promise<string | undefined> {
  if (loaderType === "forge") {
    const list = await listForgeVersions(mcVersion);
    return (list.find((v) => v.recommended) || list.find((v) => v.latest) || list[0])?.version;
  }
  if (loaderType === "neoforge") {
    const list = await listNeoforgeVersions(mcVersion);
    return list[0]?.version;
  }
  const list = await listFabricVersions(mcVersion);
  return (list.find((v) => v.stable) || list[0])?.version;
}

export interface RecipeInstallResult {
  instanceId: string;
  installedCount: number;
  failedCount: number;
}

/** Recreates a friend's shared private instance on this machine: a fresh
 *  local instance with the same loader + Minecraft version, then every
 *  recipe entry redownloaded straight from Modrinth by its own project's
 *  current version id — never from the friend's machine or any storage of
 *  ours. A version that's since been removed from Modrinth is simply skipped
 *  (see failedCount) rather than failing the whole install. */
export async function installFromRecipe(
  name: string,
  source: Pick<PublicInstanceSummary, "minecraftVersion" | "loaderType" | "recipe">
): Promise<RecipeInstallResult> {
  const loaderVersion =
    source.loaderType === "vanilla" ? undefined : await resolveLoaderVersion(source.loaderType, source.minecraftVersion);

  const meta = await createInstance({
    name,
    loaderType: source.loaderType,
    minecraftVersion: source.minecraftVersion,
    loaderVersion,
  });

  const recipe = source.recipe ?? [];
  const versions = await getVersionsByIds(recipe.map((r) => r.versionId));
  const versionById = new Map(versions.map((v) => [v.versionId, v]));

  let installedCount = 0;
  let failedCount = 0;
  for (const entry of recipe) {
    const version = versionById.get(entry.versionId);
    if (!version) {
      failedCount++;
      continue;
    }
    try {
      await downloadInstanceFile(meta.id, `${entry.category}/${version.filename}`, version.url, version.sha1);
      installedCount++;
    } catch {
      failedCount++;
    }
  }

  return { instanceId: meta.id, installedCount, failedCount };
}
