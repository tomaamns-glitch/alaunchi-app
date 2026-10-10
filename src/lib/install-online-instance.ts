import { requirePackSource, useModpacks } from "@/hooks/use-modpacks";
import { fetchSnapshot, snapshotBaseUrl, type Modpack } from "@/services/github";
import { installSnapshot } from "@/services/electron";
import { reportCaughtError } from "@/services/error-reporter";
import { askOptionalGroups } from "@/components/optional-groups-dialog";

/**
 * Installs a catalog modpack the viewer doesn't have yet, spotted on a
 * friend's public profile. Same install path as the home carousel's own
 * "Instalar" button (fetch the live manifest, pick optional groups, download
 * the snapshot) — this is just a standalone, reusable version of it, since
 * home.tsx's version is a closure scoped to that page's own per-pack state.
 *
 * Returns false if the player cancelled the optional-groups picker.
 */
export async function installOnlineInstance(pack: Modpack): Promise<boolean> {
  try {
    const { repoUrl, token } = requirePackSource(pack);
    const manifest = await fetchSnapshot(repoUrl, pack.id, token || undefined);
    if (!manifest) throw new Error("No hay manifiesto publicado para este modpack todavía.");
    const groupChoice = await askOptionalGroups(manifest, pack.name);
    if (groupChoice === null) return false;
    const baseUrl = snapshotBaseUrl(repoUrl, manifest);
    await installSnapshot(
      pack.id,
      manifest,
      baseUrl,
      { name: pack.name, minecraftVersion: pack.minecraftVersion, loaderType: pack.loaderType },
      token || undefined,
      groupChoice
    );
    useModpacks.getState().updateModpackStatus(pack.id, {
      installed: true,
      installedVersion: manifest.version,
      updateAvailable: false,
    });
    return true;
  } catch (e) {
    reportCaughtError(`modpack:installing:${pack.id}`, e);
    throw e;
  }
}
