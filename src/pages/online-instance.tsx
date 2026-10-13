import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { AlertTriangle, ArrowUpCircle, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { findPackSource, useCarouselModpacks, useModpacks } from "@/hooks/use-modpacks";
import { fetchSnapshot, type SnapshotManifest } from "@/services/github";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";
import {
  DRAWER_EXAMPLE_HISTORY,
  DRAWER_EXAMPLE_MEMBERS,
  DRAWER_EXAMPLE_PACK,
} from "@/lib/online-view-mode";
import { ModpackManager } from "@/pages/modpack-detail";
import { InstanceMembersPanel } from "@/components/instance-members-panel";
import { ChangelogSidePanel } from "@/components/changelog-side-panel";
import { LoaderIcon } from "@/components/loader-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BannerPlayButton } from "@/components/online-banner-tile";
import { AccountMenuButton } from "@/components/account-menu-button";
import { PresenceButton } from "@/components/presence-button";
import { InstanceGroupChatPanel } from "@/components/instance-group-chat";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { ChatWindow } from "@/components/chat-window";
import { useAuth } from "@/hooks/use-auth";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";
import type { ChatMode } from "@/lib/instance-context";

/**
 * An online instance opened from Inicio's drawer view (/online/:id). For now
 * just the header — a card (banner as background) with logo, name, version,
 * description and badges — laid out like the instance manager's header
 * (modpack-detail.tsx).
 */
/** Cosine-eased fade from the background color (alpha `peak`) to fully
 *  transparent across `span`% of the card, sampled in many stops — smooth at
 *  both ends, so no visible edge where it starts or ends. */
function easedFade(direction: "right" | "top", peak: number, span: number): string {
  const stops = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const alpha = (peak * (1 + Math.cos(Math.PI * t))) / 2;
    return `hsl(var(--background) / ${alpha.toFixed(3)}) ${(t * span).toFixed(1)}%`;
  });
  return `linear-gradient(to ${direction}, ${stops.join(", ")})`;
}

// Shaded behind the logo and text (left) plus a little from the bottom; the
// right part of the banner shows as is.
const BANNER_SHADE = [easedFade("right", 0.9, 60), easedFade("top", 0.45, 70)].join(", ");

export default function OnlineInstance() {
  const { id } = useParams<{ id: string }>();
  const modpacks = useCarouselModpacks();
  const catalogLoaded = useModpacks((s) => s.loaded);
  const pack =
    modpacks.find((m) => m.id === id) ??
    (import.meta.env.DEV && id === DRAWER_EXAMPLE_PACK.id ? DRAWER_EXAMPLE_PACK : undefined);
  const [brokenBanner, setBrokenBanner] = useState(false);
  const { username, uuid } = useAuth();
  const activePopup = useHeaderOverlay((s) => s.active);
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);
  const [brokenLogo, setBrokenLogo] = useState(false);

  useDynamicAccent(pack?.bannerUrl || pack?.imageUrl);

  // The published manifest (for Novedades; the embedded manager reads its own).
  // undefined = loading, null = none published / no source.
  const isExample = pack?.id === DRAWER_EXAMPLE_PACK.id;
  const [manifest, setManifest] = useState<SnapshotManifest | null | undefined>(undefined);
  const [manifestError, setManifestError] = useState(false);
  useEffect(() => {
    if (!pack || isExample) return;
    let cancelled = false;
    setManifest(undefined);
    setManifestError(false);
    const source = findPackSource(pack);
    if (!source) {
      setManifest(null);
      return;
    }
    fetchSnapshot(source.repoUrl, pack.id, source.token)
      .then((m) => !cancelled && setManifest(m))
      .catch(() => !cancelled && setManifestError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack?.id, pack?.version, pack?.repoUrl, isExample]);

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
  // Same footer as Inicio's carousel: players and chats framed in this instance
  // (the dev example and past instances have none → general).
  const viewContext: ChatMode =
    !isExample && !pack.outOfNetwork ? { type: "carousel", pack } : { type: "general" };

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* Header card across the whole width; below it three columns starting
          at the same height: Participantes, content, Novedades. */}
      <div className="flex-1 min-h-0 w-full flex flex-col gap-4 p-4">
        <div className="shrink-0">
          {/* The banner is the card's own background (no strip across the page);
              the card is as tall as its content, Play button on the right. */}
          <div className="relative w-full overflow-hidden bg-gradient-to-br from-accent/15 to-black/40 border border-white/10 rounded-md">
            {hasBanner && (
              <>
                <img
                  src={pack.bannerUrl}
                  alt=""
                  onError={() => setBrokenBanner(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0" style={{ background: BANNER_SHADE }} />
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
                  <h2 className="text-3xl font-bold text-white truncate drop-shadow-md">{pack.name}</h2>
                  {pack.version && <span className="text-sm font-normal text-muted-foreground shrink-0">{pack.version}v</span>}
                </div>
                {!!pack.description && <p className="text-sm text-gray-200 max-w-3xl line-clamp-2 drop-shadow">{pack.description}</p>}
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

        <div className="flex-1 min-h-0 flex gap-4">
          {/* Left column: Participantes on top, Novedades below. */}
          <div className="w-72 shrink-0 flex flex-col gap-4">
            <div className="flex-1 min-h-0">
              <InstanceMembersPanel
                modpackId={pack.id}
                entries={pack.id === DRAWER_EXAMPLE_PACK.id ? DRAWER_EXAMPLE_MEMBERS : undefined}
              />
            </div>
            <div className="flex-1 min-h-0">
              <ChangelogSidePanel
                pack={pack}
                history={
                  isExample
                    ? DRAWER_EXAMPLE_HISTORY
                    : manifest === undefined
                      ? null
                      : [...(manifest?.changelogHistory ?? [])].reverse()
                }
                error={manifestError}
              />
            </div>
          </div>

          {/* The real instance manager (same as a private instance's or the
              carousel's "Contenido"), embedded — this column is its scroll
              container. */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
            <ModpackManager embeddedId={pack.id} />
          </div>

          {/* Right column: the instance's group chat, always open (the
              footer has no group chat button on this page). */}
          <div className="w-96 shrink-0">
            {uuid && viewContext.type === "carousel" ? (
              <InstanceGroupChatPanel pack={viewContext.pack} myUuid={uuid} myUsername={username ?? ""} />
            ) : (
              <aside className="h-full flex items-center justify-center rounded-md border border-white/10 bg-gray-500/10 backdrop-blur-md p-6 text-center text-xs text-muted-foreground">
                {isExample ? "La instancia de ejemplo no tiene chat de grupo." : "Esta instancia ya no tiene chat de grupo."}
              </aside>
            )}
          </div>
        </div>
      </div>

      <footer className="relative z-20 h-20 border-t border-white/5 bg-card/50 backdrop-blur flex items-center px-6 shrink-0">
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && (
            <PresenceButton
              context={viewContext}
              open={activePopup === "presence"}
              onOpenChange={(next) => (next ? openOverlay("presence") : closeOverlay())}
            />
          )}
          {uuid && (
            <div className="relative">
              <ChatBubbleRow />
              <ChatWindow myUuid={uuid} myUsername={username ?? ""} defaultMode={viewContext} />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
