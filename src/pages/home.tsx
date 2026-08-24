import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useLocation } from "wouter";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Coffee,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { installSnapshot, launchMinecraft } from "@/services/electron";
import { markOnline } from "@/services/presence";
import { touchUserDirectory } from "@/services/chat";
import { getAzureClientId } from "@/services/auth";
import { toast } from "sonner";
import { Modpack, SnapshotManifest, fetchSnapshot, snapshotBaseUrl } from "@/services/github";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SkinManagerPanel } from "@/components/skin-manager-panel";
import { ChangelogHistoryButton } from "@/components/changelog-history-button";
import { ChangelogViewerDialog } from "@/components/changelog-viewer-dialog";
import { PresenceButton } from "@/components/presence-button";
import { ChatWindow } from "@/components/chat-window";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { getGithubRepo, getModpacksToken } from "@/lib/app-config";
import { reportCaughtError } from "@/services/error-reporter";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";

const api = (window as any).electronAPI;

const LAUNCH_STAGE_PROGRESS: Record<string, number> = {
  preparing: 5,
  downloading_client: 20,
  downloading_assets: 50,
  downloading_libraries: 70,
  installing_loader: 85,
  extracting_natives: 92,
  installing_java: 94,
  launching: 97,
  launched: 100,
};

// Deliberately coarse — every underlying stage (fetching a JRE, downloading the
// client jar, downloading assets/libraries...) collapses into one of a handful
// of generic words instead of a different message per stage.
const LAUNCH_STAGE_LABEL: Record<string, string> = {
  preparing: "Preparando",
  downloading_client: "Descargando",
  downloading_assets: "Descargando",
  downloading_libraries: "Descargando",
  installing_loader: "Instalando",
  extracting_natives: "Extrayendo",
  installing_java: "Descargando",
  launching: "Iniciando",
  launched: "¡Listo!",
};

const INSTALL_STAGE_LABEL: Record<string, string> = {
  downloading: "Descargando",
  updating: "Descargando",
  extracting: "Extrayendo",
  done: "Completado",
};

interface ModpackActionBarProps {
  pack: Modpack;
}

function ModpackActionBar({ pack }: ModpackActionBarProps) {
  const [status, setStatus] = useState<"idle" | "installing" | "updating" | "launching">("idle");
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const { updateModpackStatus } = useModpacks();
  const { getValidTokenForLaunch } = useAuth();

  // Update announcement — shown once per arrival at this pack in the carousel
  // (this component remounts fresh each time via `key={currentPack.id}` below,
  // so a plain on-mount fetch is exactly "once per visit", no dismiss-tracking
  // needed). Silently skipped if the publish left no title/changelog to show.
  const [updateManifest, setUpdateManifest] = useState<SnapshotManifest | null>(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [showChangelogViewer, setShowChangelogViewer] = useState(false);

  useEffect(() => {
    if (!pack.updateAvailable) return;
    let cancelled = false;
    const repoUrl = getGithubRepo();
    const token = getModpacksToken();
    fetchSnapshot(repoUrl, pack.id, token || undefined).then((manifest) => {
      if (!cancelled) setUpdateManifest(manifest);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAnnouncement = !!(updateManifest?.changelogTitle || updateManifest?.changelog);
  const showAnnouncement = pack.updateAvailable && hasAnnouncement && !announcementDismissed && !showChangelogViewer;

  // Geometry of the loading trail: a single line that starts at the button's
  // top-center, traces its border out to a bottom corner, then runs straight
  // to that side's screen edge. Measured from the DOM so it always matches
  // the button's real on-screen position/size.
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const [trailGeo, setTrailGeo] = useState<{
    top: number; bottom: number; left: number; right: number; centerX: number;
    extendY: number; screenW: number;
  } | null>(null);

  useEffect(() => {
    if (!api) return;
    const offLaunch = api.onLaunchStatus((data: any) => {
      if (data.modpackId !== pack.id) return;
      if (data.stage === "error") {
        setStageLabel("Error");
        toast.error(data.message || "Fallo al lanzar.");
        setTimeout(() => setStatus("idle"), 4000);
        return;
      }
      setStageLabel(LAUNCH_STAGE_LABEL[data.stage] ?? data.stage);
      setProgress(LAUNCH_STAGE_PROGRESS[data.stage] ?? progress);
      if (data.stage === "launched") {
        setTimeout(() => setStatus("idle"), 2500);
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

  useEffect(() => {
    if (status === "idle") return;
    const el = btnWrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      setTrailGeo({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        centerX: r.left + r.width / 2,
        extendY: window.innerHeight - 80, // matches the bottom-20 row
        screenW: window.innerWidth,
      });
    };
    measure();
    // ResizeObserver fires as soon as the element's layout is actually committed
    // (including immediately on observe(), with the real settled size) — far more
    // reliable than requestAnimationFrame guessing when layout/paint has settled,
    // which could miss the button's first-ever mount on a fast fully-cached install.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [status]);

  // The update announcement (shown when this pack was selected in the carousel)
  // already tells the player what's new before they ever reach this — no more
  // confirmation gate here, it just gets on with the update.
  const installFromSnapshot = async (mode: "installing" | "updating") => {
    setStatus(mode);
    setProgress(0);
    setStageLabel("Obteniendo manifiesto...");
    try {
      const repoUrl = getGithubRepo();
      const token = getModpacksToken();
      const manifest = await fetchSnapshot(repoUrl, pack.id, token || undefined);
      if (!manifest) throw new Error("No hay manifiesto publicado para este modpack todavía.");

      if (mode === "updating") setStageLabel("Descargando...");

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
    } catch (e) {
      reportCaughtError(`modpack:${mode}:${pack.id}`, e);
      throw e;
    }
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

  const handleUpdateOnly = async () => {
    try {
      const manifest = await installFromSnapshot("updating");
      toast.success(`${pack.name} actualizado a v${manifest.version}.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar.");
    } finally {
      setStatus("idle");
      setStageLabel("");
    }
  };

  const handlePlay = async () => {
    try {
      if (pack.updateAvailable) {
        const manifest = await installFromSnapshot("updating");
        toast.success(`${pack.name} actualizado a v${manifest.version}.`);
      }
      setStatus("launching");
      setProgress(5);
      setStageLabel("Preparando...");

      // Refresh the MC token right before launching — this is what CurseForge and other
      // launchers do to avoid "Invalid session" errors on online servers. The token stored
      // in the auth state may be hours old; silently get a fresh one if needed.
      const auth = await getValidTokenForLaunch();
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
        setStatus("idle");
        setStageLabel("");
        return;
      }
      if (!auth.xuid) {
        toast.error("Falta el XUID de Xbox. Cierra sesión y vuelve a iniciar sesión para activar servidores online.");
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
      markOnline(pack.id, auth.uuid, auth.username).catch(() => {});
      toast.success(`¡${pack.name} iniciado!`);
    } catch (e: any) {
      toast.error(e?.message || "Error al iniciar.");
      setStatus("idle");
      setStageLabel("");
    }
  };

  const isActing = status !== "idle";

  // One continuous line per side, from the button's top-center, around its
  // border to a bottom corner, then straight out to that side's screen edge.
  // Drawn with the SVG dash-offset trick (pathLength=100 normalizes it so the
  // dash offset IS the percentage) so the reveal is directly proportional to
  // the real `progress` value the whole way — no separate phases/rates.
  const g = trailGeo;
  const leftPath = g
    ? `M ${g.centerX} ${g.top} L ${g.left} ${g.top} L ${g.left} ${g.bottom} L ${g.left} ${g.extendY} L 0 ${g.extendY}`
    : "";
  const rightPath = g
    ? `M ${g.centerX} ${g.top} L ${g.right} ${g.top} L ${g.right} ${g.bottom} L ${g.right} ${g.extendY} L ${g.screenW} ${g.extendY}`
    : "";
  const dashOffset = 100 - progress;

  return (
    <div className="w-64">
      <div ref={btnWrapRef}>
        <Button
          data-testid={pack.installed ? `button-play-${pack.id}` : `button-install-${pack.id}`}
          className={`w-full font-bold h-14 text-base tracking-wide transition-all border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${
            pack.installed
              ? "bg-accent hover:bg-accent/90 text-accent-foreground shadow-[0_0_15px_hsl(var(--accent)/0.25)]"
              : "bg-white/10 hover:bg-white/20 text-white"
          }`}
          onClick={pack.installed ? handlePlay : handleInstall}
          disabled={isActing}
        >
          {isActing ? (
            <span className="flex items-center gap-2 min-w-0">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="truncate text-sm">{stageLabel}</span>
            </span>
          ) : (
            <>
              {!pack.installed && <Download className="mr-2 h-4 w-4" />}
              {pack.installed && pack.updateAvailable && <RefreshCw className="mr-2 h-4 w-4" />}
              {pack.installed ? (pack.updateAvailable ? "ACTUALIZAR Y JUGAR" : "JUGAR") : "INSTALAR"}
            </>
          )}
        </Button>
      </div>

      {!isActing && pack.installed && pack.updateAvailable && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleUpdateOnly}
        >
          Solo actualizar
        </Button>
      )}

      {isActing && g && (
        <svg
          className="fixed inset-0 w-screen h-screen pointer-events-none z-20"
          viewBox={`0 0 ${g.screenW} ${window.innerHeight}`}
        >
          <path
            d={leftPath}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
            style={{ stroke: "hsl(var(--accent))" }}
          />
          <path
            d={rightPath}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
            style={{ stroke: "hsl(var(--accent))" }}
          />
        </svg>
      )}

      <Dialog open={showAnnouncement} onOpenChange={(open) => !open && setAnnouncementDismissed(true)}>
        <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-md text-center">
          <DialogHeader className="items-center">
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              ¡Actualización {updateManifest?.version}!
            </DialogTitle>
          </DialogHeader>
          {updateManifest?.changelogTitle && (
            <p className="text-base font-medium text-gray-100">{updateManifest.changelogTitle}</p>
          )}
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={() => setShowChangelogViewer(true)}>
              Leer cambios
            </Button>
            <Button
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
              onClick={() => setAnnouncementDismissed(true)}
            >
              Vale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showChangelogViewer && updateManifest && (
        <ChangelogViewerDialog
          title={updateManifest.changelogTitle ?? ""}
          version={updateManifest.version}
          changelog={updateManifest.changelog ?? ""}
          onClose={() => {
            setShowChangelogViewer(false);
            setAnnouncementDismissed(true);
          }}
        />
      )}
    </div>
  );
}

type JavaStatus = "checking" | "ok" | "missing";
type JavaInstallStage = "idle" | "fetching" | "downloading" | "extracting" | "done";

export default function Home() {
  const { isAuthenticated, username, uuid } = useAuth();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks, loading } = useModpacks();
  const isAdmin = useIsAdmin();
  const myHeadUrl = usePlayerHeadUrl(uuid);

  const [currentIndex, setCurrentIndex] = useState(0);
  // Skin panel and presence popup are mutually exclusive — opening one closes the other.
  const [activePopup, setActivePopup] = useState<"profile" | "presence" | null>(null);
  const profileOpen = activePopup === "profile";
  const setProfileOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setActivePopup((prev) => {
      const wasOpen = prev === "profile";
      const nextOpen = typeof next === "function" ? next(wasOpen) : next;
      return nextOpen ? "profile" : null;
    });
  };

  const [javaStatus, setJavaStatus] = useState<JavaStatus>("checking");
  const [javaInstalling, setJavaInstalling] = useState(false);
  const [javaStage, setJavaStage] = useState<JavaInstallStage>("idle");
  const [javaProgress, setJavaProgress] = useState(0);

  // Registers you in the shared player directory (chat's "who can I message")
  // once per session, as soon as we know who's logged in.
  useEffect(() => {
    if (!uuid) return;
    useChatHeads.getState().init(uuid);
  }, [uuid]);

  useEffect(() => {
    if (!uuid || !username) return;
    touchUserDirectory(uuid, username).catch(() => {});
  }, [uuid, username]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else {
      loadModpacks();
      checkJava();
    }
  }, [isAuthenticated, setLocation, loadModpacks]);

  useEffect(() => {
    if (currentIndex >= modpacks.length) setCurrentIndex(0);
  }, [modpacks.length, currentIndex]);

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

  const currentPack = modpacks[currentIndex];

  const [showDots, setShowDots] = useState(false);
  const dotsHideTimer = useRef<number | undefined>(undefined);

  const flashDots = () => {
    setShowDots(true);
    if (dotsHideTimer.current) window.clearTimeout(dotsHideTimer.current);
    dotsHideTimer.current = window.setTimeout(() => setShowDots(false), 4000);
  };

  useEffect(() => {
    return () => {
      if (dotsHideTimer.current) window.clearTimeout(dotsHideTimer.current);
    };
  }, []);

  const goToIndex = (i: number) => {
    setCurrentIndex(i);
    flashDots();
  };
  const goPrev = () => goToIndex((currentIndex - 1 + modpacks.length) % modpacks.length);
  const goNext = () => goToIndex((currentIndex + 1) % modpacks.length);

  useDynamicAccent(currentPack?.bannerUrl || currentPack?.imageUrl);

  if (!isAuthenticated) return null;

  const javaStageLabel: Record<JavaInstallStage, string> = {
    idle: "",
    fetching: "Buscando JRE 21...",
    downloading: `Descargando Java... ${javaProgress}%`,
    extracting: "Extrayendo...",
    done: "¡Listo!",
  };

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">

      <AnimatePresence>
        {javaStatus === "missing" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-950/60 border-b border-amber-500/30 px-6 py-3 flex items-center justify-between gap-4 shrink-0"
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

      <main className="flex-1 relative overflow-hidden min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : modpacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
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
          currentPack && (
            <div className="absolute inset-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentPack.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  drag={modpacks.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.15}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -100) goNext();
                    else if (info.offset.x > 100) goPrev();
                  }}
                  className={`absolute inset-0 ${modpacks.length > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  {currentPack.bannerUrl || currentPack.imageUrl ? (
                    <img
                      src={currentPack.bannerUrl || currentPack.imageUrl}
                      alt={currentPack.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-accent/20 to-black flex items-center justify-center">
                      <span className="text-8xl font-black text-accent/30">{currentPack.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40" />
                </motion.div>
              </AnimatePresence>

              {modpacks.length > 1 && (
                <>
                  <div
                    onClick={(e) => { if (profileOpen) return; e.stopPropagation(); goPrev(); }}
                    className={`group absolute inset-y-0 left-0 w-24 flex items-center justify-start pl-4 z-10 ${
                      profileOpen ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <div className="h-11 w-11 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronLeft className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <div
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    className="group absolute inset-y-0 right-0 w-24 flex items-center justify-end pr-4 cursor-pointer z-10"
                  >
                    <div className="h-11 w-11 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="h-5 w-5 text-white" />
                    </div>
                  </div>

                  <AnimatePresence>
                    {showDots && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"
                      >
                        {modpacks.map((m, i) => (
                          <button
                            key={m.id}
                            onClick={(e) => { e.stopPropagation(); goToIndex(i); }}
                            className={`h-1.5 rounded-full transition-all ${
                              i === currentIndex ? "w-6 bg-accent" : "w-1.5 bg-white/30 hover:bg-white/50"
                            }`}
                            aria-label={`Ir a ${m.name}`}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          )
        )}
      </main>

      {!loading && currentPack && (
        <footer className="relative h-20 border-t border-white/5 bg-card/50 backdrop-blur flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-1">
            <div className="relative">
              {profileOpen && (
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setProfileOpen(false)}
                  className="fixed inset-0 z-30 cursor-default"
                />
              )}
              <AnimatePresence>
                {profileOpen && uuid && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute bottom-full left-0 mb-2 z-40 p-4 rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto"
                  >
                    <SkinManagerPanel uuid={uuid} username={username} />
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="relative z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
              >
                <Avatar className="h-6 w-6 border border-white/10">
                  {myHeadUrl && <AvatarImage src={myHeadUrl} alt={username ?? ""} />}
                  <AvatarFallback className="bg-accent/20 text-accent text-xs font-bold">
                    {username?.charAt(0)?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-gray-200" data-testid="text-username">
                  {username}
                </span>
              </button>
            </div>
            <PresenceButton
              modpackId={currentPack.id}
              packName={currentPack.name}
              open={activePopup === "presence"}
              onOpenChange={(next) => setActivePopup(next ? "presence" : null)}
            />
            {uuid && (
              <div className="relative">
                <ChatBubbleRow />
                <ChatWindow myUuid={uuid} myUsername={username ?? ""} currentPackId={currentPack.id} />
              </div>
            )}
          </div>

          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <ModpackActionBar key={currentPack.id} pack={currentPack} />
          </div>

          <div className="flex items-center gap-1">
            <ChangelogHistoryButton modpackId={currentPack.id} />
            <button
              type="button"
              onClick={() => setLocation(`/modpack/${currentPack.id}`)}
              data-testid="button-instance-manager"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-gray-200"
            >
              <Package className="h-4 w-4" />
              <span className="text-sm font-medium">Contenido</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
