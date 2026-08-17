import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useLocation } from "wouter";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut, Download, Play, RefreshCw, Loader2, AlertTriangle, Coffee, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { installSnapshot, launchMinecraft } from "@/services/electron";
import { getAzureClientId } from "@/services/auth";
import { toast } from "sonner";
import { Modpack, fetchSnapshot, snapshotBaseUrl } from "@/services/github";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getGithubRepo } from "@/lib/app-config";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { ModpackDetailDialog } from "@/components/modpack-detail-dialog";

const api = (window as any).electronAPI;

interface ModpackCardProps {
  pack: Modpack;
  index: number;
}

const LAUNCH_STAGE_PROGRESS: Record<string, number> = {
  preparing: 5,
  downloading_client: 20,
  downloading_assets: 50,
  downloading_libraries: 70,
  installing_loader: 85,
  extracting_natives: 92,
  launching: 97,
  launched: 100,
};

const LAUNCH_STAGE_LABEL: Record<string, string> = {
  preparing: "Preparando...",
  downloading_client: "Descargando cliente Minecraft...",
  downloading_assets: "Descargando assets...",
  downloading_libraries: "Descargando librerías...",
  installing_loader: "Instalando modloader...",
  extracting_natives: "Extrayendo librerías nativas...",
  launching: "Iniciando Minecraft...",
  launched: "¡Lanzado!",
};

const INSTALL_STAGE_LABEL: Record<string, string> = {
  downloading: "Descargando archivos...",
  updating: "Actualizando archivos...",
  extracting: "Extrayendo...",
  done: "Completado",
};

function ModpackCard({ pack, index }: ModpackCardProps) {
  const [status, setStatus] = useState<"idle" | "installing" | "updating" | "launching">("idle");
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const { updateModpackStatus } = useModpacks();
  const { getValidTokenForLaunch } = useAuth();

  useEffect(() => {
    if (!api) return;
    const offLaunch = api.onLaunchStatus((data: any) => {
      if (data.modpackId !== pack.id) return;
      const label = data.stage === "installing_loader" && data.msg
        ? data.msg
        : (LAUNCH_STAGE_LABEL[data.stage] ?? data.stage);
      setStageLabel(label);
      setProgress(LAUNCH_STAGE_PROGRESS[data.stage] ?? progress);
      if (data.stage === "launched" || data.stage === "error") {
        if (data.stage === "error") setStageLabel(`Error: ${data.message || "fallo al lanzar"}`);
        setTimeout(() => setStatus("idle"), data.stage === "error" ? 6000 : 2500);
      }
    });
    const offInstall = api.onInstallProgress((data: any) => {
      if (data.modpackId !== pack.id) return;
      if (data.stage === "done") {
        setProgress(100);
        setStageLabel("Completado");
      } else {
        setProgress(data.progress ?? 0);
        setStageLabel(INSTALL_STAGE_LABEL[data.stage] ?? "Descargando...");
      }
    });
    return () => { offLaunch(); offInstall(); };
  }, [pack.id]);

  const installFromSnapshot = async (mode: "installing" | "updating") => {
    setStatus(mode);
    setProgress(0);
    setStageLabel("Obteniendo manifiesto...");
    const repoUrl = getGithubRepo();
    const token = localStorage.getItem("githubToken") ?? "";
    const manifest = await fetchSnapshot(repoUrl, pack.id, token || undefined);
    if (!manifest) throw new Error("No hay manifiesto publicado para este modpack todavía.");
    const baseUrl = snapshotBaseUrl(repoUrl, manifest);
    await installSnapshot(pack.id, manifest, baseUrl, {
      name: pack.name,
      minecraftVersion: pack.minecraftVersion,
      loaderType: pack.loaderType,
    }, token || undefined);
    updateModpackStatus(pack.id, {
      installed: true,
      installedVersion: manifest.version,
      updateAvailable: false,
    });
    return manifest;
  };

  const handleInstall = async () => {
    try {
      await installFromSnapshot("installing");
      toast.success(`${pack.name} instalado correctamente.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setStatus("idle");
      setStageLabel("");
    }
  };

  const handlePlay = async () => {
    try {
      if (pack.updateAvailable) {
        await installFromSnapshot("updating");
        toast.success(`${pack.name} actualizado a v${pack.version}.`);
      }
      setStatus("launching");
      setProgress(5);
      setStageLabel("Preparando...");

      // Refresh the MC token right before launching — this is what CurseForge and other
      // launchers do to avoid "Invalid session" errors on online servers. The token stored
      // in the auth state may be hours old; silently get a fresh one if needed.
      const auth = await getValidTokenForLaunch();
      console.log("[handlePlay] auth from getValidTokenForLaunch:", {
        hasAuth: !!auth,
        hasMcToken: !!auth?.mcToken,
        mcTokenLen: auth?.mcToken?.length ?? 0,
        username: auth?.username,
        uuid: auth?.uuid,
        hasXuid: !!auth?.xuid,
        xuidLen: auth?.xuid?.length ?? 0,
      });
      if (!auth) {
        toast.error("Tu sesión de Microsoft ha caducado. Por favor, inicia sesión de nuevo.");
        setStatus("idle");
        setStageLabel("");
        return;
      }
      // Hard guard: refuse to launch if critical fields are empty. Without these,
      // the game launches in offline mode and online servers reject with "Sesión
      // no válida". This catches stale/corrupted auth.json that somehow slipped
      // past getValidTokenForLaunch.
      if (!auth.mcToken || !auth.username || !auth.uuid) {
        toast.error("Sesión de Microsoft incompleta. Cierra sesión y vuelve a iniciar sesión.");
        console.error("[handlePlay] BLOCKED launch: missing fields", {
          mcTokenEmpty: !auth.mcToken,
          usernameEmpty: !auth.username,
          uuidEmpty: !auth.uuid,
        });
        setStatus("idle");
        setStageLabel("");
        return;
      }
      if (!auth.xuid) {
        toast.error("Falta el XUID de Xbox. Cierra sesión y vuelve a iniciar sesión para activar servidores online.");
        console.error("[handlePlay] BLOCKED launch: missing xuid");
        setStatus("idle");
        setStageLabel("");
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
      toast.success(`¡${pack.name} iniciado!`);
    } catch (e: any) {
      toast.error(e?.message || "Error al iniciar.");
      setStatus("idle");
      setStageLabel("");
    }
  };

  const isActing = status !== "idle";
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      data-testid={`card-modpack-${pack.id}`}
      onClick={() => setDetailOpen(true)}
      className="group relative flex flex-col bg-card rounded-xl overflow-hidden border border-white/5 shadow-lg hover:border-accent/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
    >
      {pack.updateAvailable && status === "idle" && (
        <div className="absolute top-3 right-3 z-10 bg-accent text-accent-foreground text-[10px] font-bold px-2 py-1 rounded-full animate-pulse shadow-lg">
          UPDATE
        </div>
      )}

      <div className="aspect-[3/4] relative overflow-hidden bg-black/50">
        {pack.imageUrl ? (
          <img
            src={pack.imageUrl}
            alt={pack.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 group-hover:brightness-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/20 to-black flex items-center justify-center">
            <span className="text-4xl font-black text-accent/40">{pack.name.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent opacity-80" />
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="px-2 py-1 text-xs font-bold bg-black/60 backdrop-blur-md rounded border border-white/10 text-white">
            {pack.minecraftVersion}
          </span>
          <span className="px-2 py-1 text-xs font-bold bg-black/60 backdrop-blur-md rounded border border-white/10 text-gray-300 uppercase">
            {pack.loaderType}
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1 relative z-10 -mt-12">
        <h3 className="text-xl font-bold tracking-tight text-white mb-1 drop-shadow-md">{pack.name}</h3>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 h-10">{pack.description}</p>

        <div className="mt-auto pt-2">
          {status !== "idle" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="truncate">{stageLabel}</span>
                </div>
                <span className="shrink-0 tabular-nums">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          ) : (
            <Button
              data-testid={pack.installed ? `button-play-${pack.id}` : `button-install-${pack.id}`}
              className={`w-full font-bold h-12 tracking-wide transition-all ${
                pack.installed
                  ? "bg-accent hover:bg-accent/90 text-accent-foreground shadow-[0_0_15px_rgba(245,166,35,0.25)]"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                pack.installed ? handlePlay() : handleInstall();
              }}
              disabled={isActing}
            >
              {!pack.installed && <Download className="mr-2 h-4 w-4" />}
              {pack.installed && pack.updateAvailable && <RefreshCw className="mr-2 h-4 w-4" />}
              {pack.installed && !pack.updateAvailable && <Play className="mr-2 h-4 w-4 fill-current" />}
              {pack.installed ? (pack.updateAvailable ? "ACTUALIZAR Y JUGAR" : "JUGAR") : "INSTALAR"}
            </Button>
          )}
        </div>
      </div>

      <ModpackDetailDialog pack={pack} open={detailOpen} onOpenChange={setDetailOpen} />
    </motion.div>
  );
}

type JavaStatus = "checking" | "ok" | "missing";
type JavaInstallStage = "idle" | "fetching" | "downloading" | "extracting" | "done";

type UpdateState = "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";

export default function Home() {
  const { isAuthenticated, username, uuid, mcToken, logout, loadPersistedAuth } = useAuth();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks, loading } = useModpacks();
  const isAdmin = useIsAdmin();

  const [javaStatus, setJavaStatus] = useState<JavaStatus>("checking");
  const [javaInstalling, setJavaInstalling] = useState(false);
  const [javaStage, setJavaStage] = useState<JavaInstallStage>("idle");
  const [javaProgress, setJavaProgress] = useState(0);

  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updatePercent, setUpdatePercent] = useState(0);

  useEffect(() => {
    loadPersistedAuth();
  }, [loadPersistedAuth]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else {
      loadModpacks();
      checkJava();
    }
  }, [isAuthenticated, setLocation, loadModpacks]);

  useEffect(() => {
    if (!api) return;
    const off = api.onJavaInstallProgress((data: any) => {
      setJavaStage(data.stage);
      if (data.progress !== undefined) setJavaProgress(data.progress);
      if (data.stage === "done") {
        setJavaInstalling(false);
        setJavaStatus("ok");
        toast.success("Java instalado correctamente.");
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (!api?.onUpdateStatus) return;
    const off = api.onUpdateStatus((data: any) => {
      if (data.state === "available") {
        setUpdateVersion(data.version ?? "");
        setUpdateState("available");
      } else if (data.state === "downloading") {
        setUpdateState("downloading");
        setUpdatePercent(data.percent ?? 0);
      } else if (data.state === "downloaded") {
        setUpdateVersion(data.version ?? updateVersion);
        setUpdateState("downloaded");
      } else if (data.state === "error") {
        setUpdateState("idle");
      } else if (data.state === "not-available") {
        setUpdateState("idle");
      }
    });
    api.checkForUpdate?.();
    return off;
  }, []);

  const handleDownloadUpdate = async () => {
    if (!api) return;
    setUpdateState("downloading");
    setUpdatePercent(0);
    try {
      await api.downloadUpdate();
    } catch (e: any) {
      toast.error("Error descargando la actualización: " + (e?.message || "desconocido"));
      setUpdateState("available");
    }
  };

  const handleInstallUpdate = () => {
    api?.installUpdate?.();
  };

  const checkJava = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.checkJava();
      setJavaStatus(result.available ? "ok" : "missing");
    } catch {
      setJavaStatus("missing");
    }
  }, []);

  const handleInstallJava = async () => {
    if (!api) return;
    setJavaInstalling(true);
    setJavaStage("fetching");
    setJavaProgress(0);
    try {
      await api.installJava();
    } catch (e: any) {
      toast.error("Error instalando Java: " + (e?.message || "desconocido"));
      setJavaInstalling(false);
      setJavaStage("idle");
    }
  };

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const javaStageLabel: Record<JavaInstallStage, string> = {
    idle: "",
    fetching: "Buscando JRE 21...",
    downloading: `Descargando Java... ${javaProgress}%`,
    extracting: "Extrayendo...",
    done: "¡Listo!",
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/5 bg-card/50 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="ALaunchi"
            className="h-8 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
              sibling?.classList.remove("hidden");
            }}
          />
          <span className="hidden font-bold tracking-tight text-white text-lg">
            <span className="text-accent">AL</span>aunchi
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-3 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
            <Avatar className="h-6 w-6 border border-white/10">
              <AvatarFallback className="bg-accent/20 text-accent text-xs font-bold">
                {username?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-gray-200" data-testid="text-username">
              {username}
            </span>
          </div>

          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin")}
              data-testid="button-admin"
              className="text-xs text-gray-400 hover:text-white font-mono border border-white/10 hover:bg-white/5 px-3"
            >
              ADMIN
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/settings")}
            data-testid="button-settings"
            className="text-gray-400 hover:text-white"
          >
            <Settings className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout"
            className="text-gray-400 hover:text-red-400"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {(updateState === "available" || updateState === "downloading" || updateState === "downloaded") && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-accent/10 border-b border-accent/30 px-6 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-accent shrink-0" />
              <span className="text-sm text-accent-foreground/90">
                {updateState === "downloaded"
                  ? `Actualización ${updateVersion} lista para instalar.`
                  : `Nueva versión ${updateVersion} disponible.`}
              </span>
            </div>
            {updateState === "available" && (
              <Button
                size="sm"
                onClick={handleDownloadUpdate}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shrink-0"
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                Descargar actualización
              </Button>
            )}
            {updateState === "downloading" && (
              <div className="flex items-center gap-3 min-w-[180px]">
                <Loader2 className="h-4 w-4 animate-spin text-accent shrink-0" />
                <Progress value={updatePercent} className="h-1.5 flex-1" />
                <span className="text-xs text-accent tabular-nums shrink-0">{Math.round(updatePercent)}%</span>
              </div>
            )}
            {updateState === "downloaded" && (
              <Button
                size="sm"
                onClick={handleInstallUpdate}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shrink-0"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Reiniciar y actualizar
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {javaStatus === "missing" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-950/60 border-b border-amber-500/30 px-6 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-sm text-amber-200">
                Java no detectado — necesario para lanzar Minecraft.
              </span>
            </div>
            {javaInstalling ? (
              <div className="flex items-center gap-3 min-w-[200px]">
                <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-amber-300 mb-1">{javaStageLabel[javaStage]}</p>
                  {javaStage === "downloading" && (
                    <Progress value={javaProgress} className="h-1.5" />
                  )}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={handleInstallJava}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold shrink-0"
              >
                <Coffee className="mr-2 h-3.5 w-3.5" />
                Instalar Java automáticamente
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : modpacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <p className="text-lg font-medium">No hay modpacks disponibles</p>
            {isAdmin ? (
              <>
                <p className="text-sm">Configura el repositorio de GitHub en Ajustes</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/settings")}>
                  Ir a Ajustes
                </Button>
              </>
            ) : (
              <p className="text-sm">Vuelve a intentarlo más tarde</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {modpacks.map((pack, i) => (
              <ModpackCard
                key={pack.id}
                pack={pack}
                index={i}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
