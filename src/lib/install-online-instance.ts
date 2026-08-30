import { useModpacks } from "@/hooks/use-modpacks";
import { fetchSnapshot, snapshotBaseUrl, type Modpack } from "@/services/github";
import { installSnapshot } from "@/services/electron";
import { getGithubRepo, getModpacksToken } from "@/lib/app-config";
import { reportCaughtError } from "@/services/error-reporter";

/**
 * Installs a catalog modpack the viewer doesn't have yet, spotted on a
 * friend's public profile. Same install path as the home carousel's own
 * "Instalar" button (fetch the live manifest, download the snapshot) — this
 * is just a standalone, reusable version of it, since home.tsx's version is
 * a closure scoped to that page's own per-pack state.
 */
export async function installOnlineInstance(pack: Modpack): Promise<void> {
  const repoUrl = getGithubRepo();
  const token = getModpacksToken();
  try {
    const manifest = await fetchSnapshot(repoUrl, pack.id, token || undefined);
    if (!manifest) throw new Error("No hay manifiesto publicado para este modpack todavía.");
    const baseUrl = snapshotBaseUrl(repoUrl, manifest);
    await installSnapshot(
      pack.id,
      manifest,
      baseUrl,
      { name: pack.name, minecraftVersion: pack.minecraftVersion, loaderType: pack.loaderType },
      token || undefined
    );
    useModpacks.getState().updateModpackStatus(pack.id, {
      installed: true,
      installedVersion: manifest.version,
      updateAvailable: false,
    });
  } catch (e) {
    reportCaughtError(`modpack:installing:${pack.id}`, e);
    throw e;
  }
}
