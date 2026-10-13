import { useState } from "react";
import { AlertTriangle, ArrowUpCircle, Download, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import type { Modpack } from "@/services/github";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useInstanceProgress } from "@/hooks/use-instance-progress";
import { runStateBusyLabel } from "@/hooks/use-instance-run-state";
import { InstanceProgressChip } from "@/components/instance-progress-chip";
import { installOnlineInstance } from "@/lib/install-online-instance";
import { Button } from "@/components/ui/button";

/** One online instance in Inicio's drawer view: a wide banner (the pack's
 *  cover image) instead of the Hub's square tiles. Name on top, Play button
 *  bottom-left, logo bottom-right hanging off the edge. */
export function OnlineBannerTile({
  pack,
  onClick,
  badge,
  preview = false,
  playingCount,
}: {
  pack: Modpack;
  onClick: () => void;
  /** Extra label on the top-right corner (e.g. "Ejemplo"). */
  badge?: string;
  /** A fake pack (dev example): the Play button only shows a toast. */
  preview?: boolean;
  /** People playing it right now (green dot + count); undefined = not shown. */
  playingCount?: number;
}) {
  const cover = pack.bannerUrl || pack.imageUrl;
  const [broken, setBroken] = useState(false);
  const [brokenLogo, setBrokenLogo] = useState(false);

  return (
    // A div, not a <button>: the Play button lives inside it.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onClick()}
      // mb-5: room for the logo hanging off the bottom edge.
      className="group relative block w-full mb-5 text-left cursor-pointer outline-none"
    >
      <div className="relative aspect-[3/1] rounded-xl border border-white/10 bg-card/40 overflow-hidden group-hover:border-accent/50 transition-colors">
        {cover && !broken ? (
          <img
            src={cover}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-black" />
        )}
        {/* Dark at the top so the name reads over any banner, and a little at
            the bottom under the Play button and the logo. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/20 to-black/50" />

        <div className="absolute inset-x-0 top-0 p-4 pr-28 space-y-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-lg font-bold leading-tight text-white truncate">{pack.name}</span>
            {pack.version && <span className="text-xs text-gray-400 shrink-0">{pack.version}v</span>}
          </div>
          {pack.description && <p className="text-xs text-gray-300 line-clamp-2 max-w-xl">{pack.description}</p>}
        </div>

        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {playingCount !== undefined && (
            <span
              title={playingCount === 1 ? "1 persona jugando" : `${playingCount} personas jugando`}
              className="flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur px-2 py-0.5 text-[11px] font-semibold text-white"
            >
              <span className={`h-2 w-2 rounded-full ${playingCount > 0 ? "bg-green-500" : "bg-gray-500"}`} />
              {playingCount}
            </span>
          )}
          {badge && (
            <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
              {badge}
            </span>
          )}
          {pack.outOfNetwork ? (
            <span className="flex items-center gap-1 rounded-md bg-destructive/90 px-2 py-0.5 text-[10px] font-bold text-white">
              <AlertTriangle className="h-3 w-3" /> Fuera de red
            </span>
          ) : (
            pack.updateAvailable && (
              <span className="flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-black">
                <ArrowUpCircle className="h-3 w-3" /> Actualización
              </span>
            )
          )}
        </div>

        <div className="absolute bottom-3 left-4" onClick={(e) => e.stopPropagation()}>
          {preview ? (
            <Button size="sm" className="h-8 px-4 font-bold border-0" onClick={() => toast.info("Instancia de ejemplo — no se puede jugar.")}>
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> JUGAR
            </Button>
          ) : (
            <BannerPlayButton pack={pack} />
          )}
        </div>
      </div>

      {/* Logo, framed like in the instance manager and hanging a bit off the
          bottom edge (outside the clipped banner box). */}
      <div className="absolute -bottom-5 right-4 z-10 h-16 w-16 rounded-md border border-white/10 bg-black/70 overflow-hidden shadow-2xl group-hover:border-accent/50 transition-colors">
        {pack.imageUrl && !brokenLogo ? (
          <img src={pack.imageUrl} alt="" draggable={false} onError={() => setBrokenLogo(true)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-black text-accent/60">
            {pack.name.charAt(0)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Instalar / Jugar / Actualizar y jugar / Cerrar — same flows as the
 *  carousel's button (install with the optional-groups picker, update before
 *  launching), shown as the shared progress chip while something runs. */
/** `large`: the online instance page's header (bigger button and chip). */
export function BannerPlayButton({ pack, large = false }: { pack: Modpack; large?: boolean }) {
  const sizeClass = large ? "h-11 px-6 text-base" : "h-8 px-4";
  const { busy, running, runState, toggle } = useLaunchModpack(pack);
  const progress = useInstanceProgress(pack.id);
  const [installing, setInstalling] = useState(false);

  if (progress.active) {
    return (
      <div className={large ? "w-60" : "w-56"}>
        <InstanceProgressChip
          entry={progress.entry}
          runState={progress.runState}
          status={progress.status}
          installed={!!pack.installed}
          online
          size={large ? 36 : 32}
        />
      </div>
    );
  }

  if (!pack.installed) {
    const install = async () => {
      setInstalling(true);
      try {
        if (await installOnlineInstance(pack)) toast.success(`${pack.name} instalado correctamente.`);
      } catch (e: any) {
        toast.error(e?.message || "Error al instalar.");
      } finally {
        setInstalling(false);
      }
    };
    return (
      <Button size="sm" className={`${sizeClass} font-bold border-0`} onClick={install} disabled={installing}>
        {installing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
        INSTALAR
      </Button>
    );
  }

  return (
    <Button size="sm" variant={running ? "destructive" : "default"} className={`${sizeClass} font-bold border-0`} onClick={toggle} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : running ? (
        <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
      ) : pack.updateAvailable ? (
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
      )}
      {busy ? runStateBusyLabel(runState) : running ? "CERRAR" : pack.updateAvailable ? "ACTUALIZAR Y JUGAR" : "JUGAR"}
    </Button>
  );
}
