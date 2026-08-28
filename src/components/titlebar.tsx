import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, GalleryHorizontal, Home, KeyRound, Minus, Square, Copy, X } from "lucide-react";
import { isElectron } from "@/services/electron";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useModpacks } from "@/hooks/use-modpacks";
import { RedeemCodeDialog } from "@/components/redeem-code-dialog";

const api = (window as any).electronAPI;

const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const [, setLocation] = useLocation();
  const [onModpackDetail] = useRoute("/modpack/:id");
  const [onHub] = useRoute("/hub");
  const [onProfile] = useRoute("/profile");
  const [onHome] = useRoute("/");
  const showBack = onModpackDetail || onHub || onProfile;
  const isAdmin = useIsAdmin();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const { loadModpacks } = useModpacks();

  useEffect(() => {
    if (!isElectron) return;
    api.isMaximized().then(setMaximized);
    const off = api.onMaximizedChange(setMaximized);
    return off;
  }, []);

  if (!isElectron) return null;

  return (
    <>
      <div
        style={dragStyle}
        className="h-11 shrink-0 flex items-center justify-between bg-black/40 border-b border-white/5 select-none"
      >
        <div className="flex items-center gap-1 px-2">
          <button
            style={noDragStyle}
            onClick={() => setLocation(showBack ? "/" : "/hub")}
            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={onHub ? "Ir al carrusel" : showBack ? "Volver" : "Panel"}
          >
            {onHub ? (
              <GalleryHorizontal className="h-4 w-4" />
            ) : showBack ? (
              <ArrowLeft className="h-4 w-4" />
            ) : (
              <Home className="h-4 w-4" />
            )}
          </button>
          <span className="font-bold tracking-tight text-white text-sm">
            <span className="text-accent">AL</span>aunchi
          </span>
        </div>
        <div style={noDragStyle} className="flex items-center h-full">
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
