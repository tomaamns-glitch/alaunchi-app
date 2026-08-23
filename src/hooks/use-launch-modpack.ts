import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { installSnapshot, launchMinecraft } from "@/services/electron";
import { markOnline } from "@/services/presence";
import { getAzureClientId } from "@/services/auth";
import { Modpack, fetchSnapshot, snapshotBaseUrl } from "@/services/github";
import { getGithubRepo } from "@/lib/app-config";
import { toast } from "sonner";

export type LaunchStage = "idle" | "updating" | "launching";

/**
 * "Update-if-needed, then launch" flow shared by every play button in the app.
 * Kept separate from the home carousel's own play button, which drives a richer
 * per-stage progress trail — this is the plain spinner-and-toast version for
 * places (like the instance manager) that just need a working play button.
 */
export function useLaunchModpack(pack: Modpack | undefined) {
  const [stage, setStage] = useState<LaunchStage>("idle");
  const { getValidTokenForLaunch } = useAuth();
  const { updateModpackStatus } = useModpacks();

  const launch = useCallback(async () => {
    if (!pack) return;
    try {
      if (pack.updateAvailable) {
        setStage("updating");
        const repoUrl = getGithubRepo();
        const token = localStorage.getItem("githubToken") ?? "";
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
        updateModpackStatus(pack.id, { installed: true, installedVersion: manifest.version, updateAvailable: false });
        toast.success(`${pack.name} actualizado a v${manifest.version}.`);
      }

      setStage("launching");

      // Refresh the MC token right before launching, same as the home carousel —
      // avoids "Invalid session" errors on online servers with a stale token.
      const auth = await getValidTokenForLaunch();
      if (!auth) {
        toast.error("Tu sesión de Microsoft ha caducado. Por favor, inicia sesión de nuevo.");
        return;
      }
      if (!auth.mcToken || !auth.username || !auth.uuid) {
        toast.error("Sesión de Microsoft incompleta. Cierra sesión y vuelve a iniciar sesión.");
        return;
      }
      if (!auth.xuid) {
        toast.error("Falta el XUID de Xbox. Cierra sesión y vuelve a iniciar sesión para activar servidores online.");
        return;
      }

      await launchMinecraft({
        modpackId: pack.id,
        mcVersion: pack.minecraftVersion,
        loaderType: pack.loaderType,
        authToken: auth.mcToken,
        username: auth.username,
        uuid: auth.uuid,
        xuid: auth.xuid,
        clientId: getAzureClientId(),
      });
      markOnline(pack.id, auth.uuid, auth.username).catch(() => {});
      toast.success(`¡${pack.name} iniciado!`);
    } catch (e: any) {
      toast.error(e?.message || "Error al iniciar.");
    } finally {
      setStage("idle");
    }
  }, [pack, getValidTokenForLaunch, updateModpackStatus]);

  return {
    stage,
    launching: stage !== "idle",
    launch,
  };
}
