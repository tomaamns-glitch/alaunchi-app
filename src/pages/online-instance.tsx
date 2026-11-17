import { ChristmasLights } from "@/components/christmas-decorations";
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { AlertTriangle, ArrowUpCircle, Loader2, Sparkles, Users } from "lucide-react";
import { findPackSource, useCarouselModpacks, useModpacks } from "@/hooks/use-modpacks";
import { fetchSnapshot, type SnapshotManifest } from "@/services/github";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";
import { ModpackManager } from "@/pages/modpack-detail";
import { InstanceMembersPanel } from "@/components/instance-members-panel";
import { ChangelogSidePanel } from "@/components/changelog-side-panel";
import { LoaderIcon } from "@/components/loader-icon";
import { Badge } from "@/components/ui/badge";
import { BannerPlayButton } from "@/components/online-banner-tile";
import { AccountMenuButton } from "@/components/account-menu-button";
import { AppBackground } from "@/components/app-background";
import { ActivityButton } from "@/components/activity-button";
import { InstanceGroupChat, InstanceGroupChatPanel } from "@/components/instance-group-chat";
import { ChatButton } from "@/components/chat-button";
import { ChatWindow } from "@/components/chat-window";
import { useAuth } from "@/hooks/use-auth";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";
import type { ChatMode } from "@/lib/instance-context";
import { FooterPanelButton } from "@/components/footer-panel-button";
import { useOnlinePanels, useWideLayout } from "@/lib/online-panels";

/**
 * An online instance opened from Inicio's drawer view (/online/:id): a header
 * card (banner as background, Play on the right) and below it Participantes +
 * Novedades (left, xl+ only — narrower they open from the footer), the
 * embedded instance manager and the group chat.
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
  const pack = modpacks.find((m) => m.id === id);
  const [brokenBanner, setBrokenBanner] = useState(false);
  const { username, uuid } = useAuth();
  const activePopup = useHeaderOverlay((s) => s.active);
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);
  const [brokenLogo, setBrokenLogo] = useState(false);
  const wide = useWideLayout();
  // Header slots the embedded manager portals its Play group / extras card into.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const [extrasSlot, setExtrasSlot] = useState<HTMLDivElement | null>(null);
  const collapsed = useOnlinePanels((s) => s.collapsed);
  const toggleCollapsed = useOnlinePanels((s) => s.toggleCollapsed);

  useDynamicAccent(pack?.bannerUrl || pack?.imageUrl);

  // The published manifest (for Novedades; the embedded manager reads its own).
  // undefined = loading, null = none published / no source.
  const [manifest, setManifest] = useState<SnapshotManifest | null | undefined>(undefined);
  const [manifestError, setManifestError] = useState(false);
  useEffect(() => {
    if (!pack) return;
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
  }, [pack?.id, pack?.version, pack?.repoUrl]);

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
  // (past instances have none → general).
  const viewContext: ChatMode = !pack.outOfNetwork ? { type: "carousel", pack } : { type: "general" };

  const hasGroupChat = !!uuid && viewContext.type === "carousel";
  const membersCollapsed = collapsed.includes("members");
  const changelogCollapsed = collapsed.includes("changelog");
  // Same panels in the left column (collapsible) and in the footer popovers.
  const membersPanel = (className: string, inColumn = false) => (
    <InstanceMembersPanel
      modpackId={pack.id}
      className={className}
      collapsed={inColumn && membersCollapsed}
      onToggleCollapsed={inColumn ? () => toggleCollapsed("members") : undefined}
    />
  );
  const changelogPanel = (className: string, inColumn = false) => (
    <ChangelogSidePanel
      pack={pack}
      history={manifest === undefined ? null : [...(manifest?.changelogHistory ?? [])].reverse()}
      error={manifestError}
      className={className}
      collapsed={inColumn && changelogCollapsed}
      onToggleCollapsed={inColumn ? () => toggleCollapsed("changelog") : undefined}
    />
  );

  return (
    <div className="relative h-full flex flex-col bg-background text-foreground">
      {/* Same animated background as the Hub / instance manager, in the
          instance's own color: the same image useDynamicAccent above takes the
          page's accent from, so background and accent always match (z-0). */}
      <AppBackground tintFrom={pack.bannerUrl || pack.imageUrl || undefined} />
      {/* Header card across the whole width; below it the columns:
          Participantes + Novedades, content, group chat. */}
      <div className="relative z-10 flex-1 min-h-0 w-full flex flex-col gap-4 p-4">
        {/* Header card + (only when the pack has optional groups) the manager's
            "Contenido adicional" card on its right, portaled into the slot. */}
        <div className="shrink-0 flex items-stretch gap-4">
          {/* The banner is the card's own background (no strip across the page);
              the card is as tall as its content, Play button on the right. */}
          <div className="relative flex-1 min-w-0 overflow-hidden bg-gradient-to-br from-accent/15 to-black/40 border border-white/10 rounded-md">
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
              {pack.installed ? (
                // The instance manager's own ⋮ + Play + playtime (same state as
                // the embedded manager below — it portals them in here).
                <div ref={setActionsSlot} className="shrink-0 self-center" />
              ) : (
                <div className="shrink-0 self-center">
                  <BannerPlayButton pack={pack} large />
                </div>
              )}
            </div>
          </div>
          <div ref={setExtrasSlot} className="shrink-0 empty:hidden" />
        </div>

        <div className="flex-1 min-h-0 flex gap-4">
          {/* Left column: Participantes on top, Novedades below, each one
              minimizable to its header. Only on wide windows — narrower, the
              three columns no longer fit and both move to the footer. */}
          {wide && (
            <div className="w-72 shrink-0 flex flex-col gap-4">
              {/* As tall as their content (never stretched); when both don't
                  fit they shrink and their lists scroll. */}
              {membersPanel(membersCollapsed ? "shrink-0" : "min-h-0", true)}
              {changelogPanel(changelogCollapsed ? "shrink-0" : "min-h-0", true)}
            </div>
          )}

          {/* The real instance manager (same as a private instance's or the
              carousel's "Contenido"), embedded — it fills this column and its
              content card scrolls inside, like everywhere else. */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <ModpackManager embeddedId={pack.id} slots={{ actions: actionsSlot, extras: extrasSlot }} />
          </div>

          {/* Right column: the instance's group chat, minimizable to its header.
              Narrow window → the usual popup button in the footer's corner instead. */}
          {wide && (
            <div className="w-96 shrink-0">
              {hasGroupChat ? (
                <InstanceGroupChatPanel
                  pack={pack}
                  myUuid={uuid!}
                  myUsername={username ?? ""}
                  collapsed={collapsed.includes("groupChat")}
                  onToggleCollapsed={() => toggleCollapsed("groupChat")}
                />
              ) : (
                <aside className="h-full flex items-center justify-center rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md p-6 text-center text-xs text-muted-foreground">
                  Esta instancia ya no tiene chat de grupo.
                </aside>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="relative z-20 h-20 [transform:translateZ(0)] flex items-center justify-between px-6 shrink-0">
        {/* December: fairy lights along the top edge (lib/christmas.ts). */}
        <ChristmasLights edge="top" />
        {/* The blur in a layer of its own: on the footer itself, the chat windows
            inside it couldn't blur the page behind them (backdrop root). The
            transform keeps `fixed` descendants relative to the footer, as the blur did. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gray-500/10 backdrop-blur-xl" />
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && (
            <div className="relative">
              <ChatButton />
              <ChatWindow myUuid={uuid} myUsername={username ?? ""} defaultMode={viewContext} />
            </div>
          )}
          {/* Narrow window: the group chat column is hidden, it opens from here —
              same button as Inicio's, next to the 1:1 chat. */}
          {!wide && hasGroupChat && <InstanceGroupChat pack={pack} myUuid={uuid!} myUsername={username ?? ""} plainHeader card />}
        </div>

        <div className="flex items-center gap-1">
          {/* Narrow window: the side columns are hidden, they open from here. */}
          {!wide && (
            <>
              <FooterPanelButton icon={Sparkles} label="Novedades" iconOnly>
                {changelogPanel("min-h-0")}
              </FooterPanelButton>
              <FooterPanelButton icon={Users} label="Participantes" iconOnly>
                {membersPanel("min-h-0")}
              </FooterPanelButton>
            </>
          )}
          {/* Actividad, always at the far right. */}
          {uuid && (
            <ActivityButton
              open={activePopup === "presence"}
              onOpenChange={(next) => (next ? openOverlay("presence") : closeOverlay())}
            />
          )}
        </div>
      </footer>
    </div>
  );
}
