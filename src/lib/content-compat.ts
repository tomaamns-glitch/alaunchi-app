import type { Modpack } from "@/services/github";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { listVersions, type ModrinthUpdate } from "@/services/modrinth";
import type { ContentCategory } from "@/services/content-share";

export interface CompatibleInstance {
  pack: Modpack;
  /** The exact file to install into this instance — resolved fresh against
   *  Modrinth for THIS instance's own loader/version, not necessarily the
   *  same version the sender has. */
  resolvedVersion: ModrinthUpdate;
}

const COMPAT_CATEGORIES = new Set<ContentCategory>(["mods", "shaderpacks", "resourcepacks"]);

/** Every instance (published catalog, installed + local/custom) the current
 *  user owns — the candidate set both findCompatibleInstances and the
 *  "couldn't detect compatibility" manual fallback pick from. */
export async function listAllMyInstances(): Promise<Modpack[]> {
  await useCustomInstances.getState().loadInstances().catch(() => {});
  const catalog = useModpacks.getState().modpacks.filter((p) => p.installed);
  const custom = useCustomInstances.getState().instances;
  return [...catalog, ...custom];
}

/**
 * Which of the current user's own instances can receive this Modrinth
 * project, and which exact version to install into each — the check general-
 * mode content sharing relies on instead of assuming the sender's modpackId
 * means anything to the recipient. Not meaningful for emotes/schematics/
 * screenshots/skins (no Modrinth listing for those), so those always return [].
 */
export async function findCompatibleInstances(
  projectId: string,
  category: ContentCategory
): Promise<CompatibleInstance[]> {
  if (!COMPAT_CATEGORIES.has(category)) return [];
  const modrinthCategory = category as "mods" | "shaderpacks" | "resourcepacks";

  const candidates = await listAllMyInstances();
  const results = await Promise.all(
    candidates.map(async (pack) => {
      const versions = await listVersions(projectId, pack.loaderType, pack.minecraftVersion, modrinthCategory);
      return versions[0] ? { pack, resolvedVersion: versions[0] } : null;
    })
  );
  return results.filter((r): r is CompatibleInstance => r !== null);
}
