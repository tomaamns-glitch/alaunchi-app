import { useState } from "react";
import { useParams } from "wouter";
import { AlertTriangle, ArrowUpCircle, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { useCarouselModpacks, useModpacks } from "@/hooks/use-modpacks";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";
import { DRAWER_EXAMPLE_HISTORY, DRAWER_EXAMPLE_PACK } from "@/lib/online-view-mode";
import { ChangelogSidePanel } from "@/components/changelog-side-panel";
import { LoaderIcon } from "@/components/loader-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BannerPlayButton } from "@/components/online-banner-tile";

/**
 * An online instance opened from Inicio's drawer view (/online/:id). For now
 * just the header — a card (banner as background) with logo, name, version,
 * description and badges — laid out like the instance manager's header
 * (modpack-detail.tsx).
 */
/** Card background → banner fade: a cosine ease over the first 80% of the
 *  card, sampled in many stops. Smooth at both ends, so there's no visible
 *  edge where the fade starts or ends (a two-stop gradient shows one). */
const BANNER_FADE = `linear-gradient(to right, ${Array.from({ length: 21 }, (_, i) => {
  const t = i / 20;
  const alpha = (1 + Math.cos(Math.PI * t)) / 2;
  return `hsl(var(--background) / ${alpha.toFixed(3)}) ${(t * 80).toFixed(1)}%`;
}).join(", ")})`;

export default function OnlineInstance() {
  const { id } = useParams<{ id: string }>();
  const modpacks = useCarouselModpacks();
  const catalogLoaded = useModpacks((s) => s.loaded);
  const pack =
    modpacks.find((m) => m.id === id) ??
    (import.meta.env.DEV && id === DRAWER_EXAMPLE_PACK.id ? DRAWER_EXAMPLE_PACK : undefined);
  const [brokenBanner, setBrokenBanner] = useState(false);
  const [brokenLogo, setBrokenLogo] = useState(false);

  useDynamicAccent(pack?.bannerUrl || pack?.imageUrl);

  if (!pack && !catalogLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Esta instancia ya no está disponible.
      </div>
    );
  }

  const hasBanner = !!pack.bannerUrl && !brokenBanner;

  return (
    <div className="h-full bg-background text-foreground">
      <div className="h-full w-full flex flex-col">
        <div className="shrink-0 px-4 pt-4 pb-2">
          {/* The banner is the card's own background (no strip across the page).
              Full width so the Play button fits on the right. */}
          <div className="relative w-full overflow-hidden bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md">
            {hasBanner && (
              <>
                <img
                  src={pack.bannerUrl}
                  alt=""
                  onError={() => setBrokenBanner(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Background color behind the logo, easing out into the banner
                    across most of the card (see BANNER_FADE); plus a light shade
                    so the text reads over any image. */}
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute inset-0" style={{ background: BANNER_FADE }} />
              </>
            )}
            <div className="relative flex items-center gap-4 p-4">
              <div className="h-20 w-20 rounded-md border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl">
                {pack.imageUrl && !brokenLogo ? (
                  <img src={pack.imageUrl} alt="" onError={() => setBrokenLogo(true)} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-black text-accent/60">
                    {pack.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h2 className="text-3xl font-bold text-white truncate">{pack.name}</h2>
                  {pack.version && <span className="text-sm font-normal text-muted-foreground shrink-0">{pack.version}v</span>}
                </div>
                {!!pack.description && <p className="text-sm text-gray-300 max-w-3xl">{pack.description}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{pack.minecraftVersion}</Badge>
                  <Badge variant="secondary" className="uppercase gap-1.5">
                    {pack.loaderType !== "vanilla" && <LoaderIcon loader={pack.loaderType} className="h-3.5 w-3.5" />}
                    {pack.loaderType}
                  </Badge>
                  {pack.fileCount > 0 && <Badge variant="outline">{pack.fileCount} archivos</Badge>}
                  {pack.totalSizeMb > 0 && <Badge variant="outline">{pack.totalSizeMb} MB</Badge>}
                  {pack.outOfNetwork ? (
                    <Badge variant="outline" className="gap-1 bg-destructive/15 text-destructive border-destructive/30">
                      <AlertTriangle className="h-3 w-3" /> Fuera de red
                    </Badge>
                  ) : pack.updateAvailable ? (
                    <Badge variant="outline" className="gap-1 bg-amber-500/15 text-amber-400 border-amber-500/30">
                      <ArrowUpCircle className="h-3 w-3" /> Actualización disponible
                    </Badge>
                  ) : (
                    pack.installed && (
                      <Badge variant="outline" className="bg-accent/15 text-accent border-accent/30">
                        Instalada{pack.installedVersion ? ` · ${pack.installedVersion}v` : ""}
                      </Badge>
                    )
                  )}
                </div>
              </div>
              <div className="shrink-0 self-center">
                {pack.id === DRAWER_EXAMPLE_PACK.id ? (
                  <Button size="sm" className="h-8 px-4 font-bold border-0" onClick={() => toast.info("Instancia de ejemplo — no se puede jugar.")}>
                    <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> JUGAR
                  </Button>
                ) : (
                  <BannerPlayButton pack={pack} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Below the header: the page's content (coming later) on the left,
            the update history in a vertical panel on the right. */}
        <div className="flex-1 min-h-0 flex gap-4 px-4 pt-2 pb-4">
          <div className="flex-1 min-w-0" />
          <div className="w-80 shrink-0">
            <ChangelogSidePanel
              pack={pack}
              history={pack.id === DRAWER_EXAMPLE_PACK.id ? DRAWER_EXAMPLE_HISTORY : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
