import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Download, GalleryHorizontal, Home, KeyRound, Loader2, Minus, Server, Square, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { getAppUpdateState, installAppUpdate, isElectron, onAppUpdateReady } from "@/services/electron";
import { getLastViewPath } from "@/lib/last-view";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useCarouselModpacks, useModpacks } from "@/hooks/use-modpacks";
import { useAuth } from "@/hooks/use-auth";
import { RedeemCodeDialog } from "@/components/redeem-code-dialog";

const api = (window as any).electronAPI;

const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

/** "Nueva actualización" + Instalar, once a new ALaunchi version finished
 *  downloading in the background while the launcher is open. Without the
 *  click it still installs on the next full quit (or idle in the tray). */
function AppUpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    getAppUpdateState()
      .then((s) => {
        if (s.ready) {
          setReady(true);
          setVersion(s.version);
        }
      })
      .catch(() => {});
    return onAppUpdateReady((info) => {
      setReady(true);
      setVersion(info.version);
    });
  }, []);

  if (!ready) return null;

  const install = async () => {
    setInstalling(true);
    const result = await installAppUpdate().catch(() => ({ ok: false, reason: "No se pudo iniciar la instalación." }));
    if (!result.ok) {
      toast.error(result.reason || "No se pudo iniciar la instalación.");
      setInstalling(false);
    }
    // ok: the launcher closes and reopens on its own — nothing else to do.
  };

  return (
    <>
      <div className="h-full flex items-center gap-2 px-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-[11px] font-semibold text-gray-100 whitespace-nowrap">Nueva actualización</span>
        {version && <span className="text-[10px] font-mono text-muted-foreground">v{version}</span>}
        <button
          type="button"
          onClick={install}
          disabled={installing}
          className="h-6 px-2.5 flex items-center gap-1 rounded bg-accent text-accent-foreground text-[11px] font-bold hover:bg-accent/90 transition-colors disabled:opacity-70"
        >
          {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {installing ? "Instalando…" : "Instalar"}
        </button>
      </div>
      <div className="w-px h-4 bg-white/10" />
    </>
  );
}

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const [location, setLocation] = useLocation();
  const [onModpackDetail] = useRoute("/modpack/:id");
  const [onHub] = useRoute("/hub");
  const [onProfile] = useRoute("/profile");
  const [onPublicProfile] = useRoute("/profile/:uuid");
  const [onFriends] = useRoute("/friends");
  const [onServers] = useRoute("/servers");
  const [onSettings] = useRoute("/settings");
  const [onAdmin] = useRoute("/admin");
  // The admin's sub-pages (a modpack, the mod library) go back to the panel,
  // not all the way out.
  const onAdminSubpage = location.startsWith("/admin/");
  const [onHome] = useRoute("/");
  const showBack =
    onModpackDetail || onHub || onProfile || onPublicProfile || onFriends || onServers || onSettings || onAdmin || onAdminSubpage;
  const backTarget = onAdminSubpage ? "/admin" : getLastViewPath();
  const isAdmin = useIsAdmin();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const { loadModpacks } = useModpacks();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  // The Hub's "go to the carousel" button only exists when the carousel has
  // something to show — otherwise that spot is just the app's logo.
  const hasCarousel = useCarouselModpacks().length > 0;

  useEffect(() => {
    if (!isElectron) return;
    api.isMaximized().then(setMaximized);
    const off = api.onMaximizedChange(setMaximized);
    return off;
  }, []);

  // Starting on the Hub never loads the catalog (only Home does) — load it
  // once here so hasCarousel is known wherever the app opens.
  useEffect(() => {
    if (!isAuthenticated) return;
    const { loaded, loading } = useModpacks.getState();
    if (!loaded && !loading) loadModpacks();
  }, [isAuthenticated, loadModpacks]);

  if (!isElectron) return null;

  return (
    <>
      <div
        style={dragStyle}
        className="h-11 shrink-0 flex items-center justify-between bg-black/40 border-b border-white/5 select-none"
      >
        <div className="flex items-center gap-1 px-2">
          {onHub && !hasCarousel ? (
            <div className="h-7 w-7 flex items-center justify-center" data-tour="titlebar-carousel">
              <img src="./logo.png" alt="ALaunchi" className="h-5 w-5 object-contain" draggable={false} />
            </div>
          ) : (
            <button
              style={noDragStyle}
              data-tour="titlebar-carousel"
              onClick={() => setLocation(onHub ? "/" : showBack ? backTarget : "/hub")}
              className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={onHub ? "Ir a las instancias online" : showBack ? "Volver" : "Panel"}
            >
              {onHub ? (
                <GalleryHorizontal className="h-4 w-4" />
              ) : showBack ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <Home className="h-4 w-4" />
              )}
            </button>
          )}
          <span className="font-bold tracking-tight text-white text-sm">
            <span className="text-accent">AL</span>aunchi
          </span>
        </div>
        <div style={noDragStyle} className="flex items-center h-full">
          <AppUpdateBanner />
          {/* SERVER: always in dev builds (it's being reworked), creators only in releases. */}
          {(isAdmin || import.meta.env.DEV) && (
            <>
              <button
                onClick={() => setLocation("/servers")}
                className={`h-full px-3 flex items-center gap-1.5 text-[10px] font-mono font-bold transition-colors ${
                  onServers ? "text-accent bg-white/5" : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Server className="h-3 w-3" />
                SERVER
              </button>
              <div className="w-px h-4 bg-white/10" />
            </>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => setLocation("/admin")}
                className="h-full px-3 flex items-center justify-center text-[10px] font-mono font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                ADMIN
              </button>
              <div className="w-px h-4 bg-white/10" />
            </>
          )}
          {onHome && (
            <>
              <button
                onClick={() => setRedeemOpen(true)}
                className="h-full px-3 flex items-center gap-1.5 text-[10px] font-mono font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <KeyRound className="h-3 w-3" />
                AÑADIR
              </button>
              <div className="w-px h-4 bg-white/10" />
            </>
          )}
          <button
            onClick={() => api.minimize()}
            className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Minimizar"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => api.maximize()}
            className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={maximized ? "Restaurar" : "Pantalla completa"}
          >
            {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
          </button>
          <button
            onClick={() => api.close()}
            className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <RedeemCodeDialog open={redeemOpen} onOpenChange={setRedeemOpen} onRedeemed={() => loadModpacks()} />
    </>
  );
}
