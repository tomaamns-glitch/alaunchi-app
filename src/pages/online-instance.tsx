import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { AlertTriangle, ArrowUpCircle, Loader2, Play, Sparkles, Users } from "lucide-react";
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
import { AppBackground } from "@/components/app-background";
import { PresenceButton } from "@/components/presence-button";
import { InstanceGroupChat, InstanceGroupChatPanel } from "@/components/instance-group-chat";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { ChatWindow } from "@/components/chat-window";
import { useAuth } from "@/hooks/use-auth";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";
import type { ChatMode } from "@/lib/instance-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Minimized side panels (Participantes / Novedades), remembered per device.
const COLLAPSED_KEY = "alaunchi_online_collapsed_panels";
type SidePanel = "members" | "changelog";

function readCollapsed(): SidePanel[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Below this width the three columns no longer fit: the side columns (Participantes
// + Novedades, group chat) give way to buttons in the footer's corner. Tailwind's xl.
const WIDE_QUERY = "(min-width: 1280px)";

/** In JS rather than CSS so only one group chat is mounted at a time — a
 *  hidden footer one would still count unread and play the sound. */
function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/** Footer corner button that opens one of the side panels as a popover —
 *  what replaces the left column once the window is too narrow for it. */
function FooterPanelButton({ icon: Icon, label, children }: { icon: typeof Users; label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-[38px] flex items-center gap-2 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-gray-200 data-[state=open]:border-accent data-[state=open]:bg-accent/15"
        >
          <Icon className="h-4 w-4" />
          <span className="text-sm font-medium">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-80 max-h-[min(28rem,70vh)] flex flex-col p-0 border-0 bg-card/95">
        {children}
      </PopoverContent>
    </Popover>
  );
}

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
  const pack =
    modpacks.find((m) => m.id === id) ??
    (import.meta.env.DEV && id === DRAWER_EXAMPLE_PACK.id ? DRAWER_EXAMPLE_PACK : undefined);
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
  const [collapsed, setCollapsed] = useState<SidePanel[]>(readCollapsed);
  const toggleCollapsed = (panel: SidePanel) =>
    setCollapsed((prev) => {
      const next = prev.includes(panel) ? prev.filter((p) => p !== panel) : [...prev, panel];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

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

  const hasGroupChat = !!uuid && viewContext.type === "carousel";
  const membersCollapsed = collapsed.includes("members");
  const changelogCollapsed = collapsed.includes("changelog");
  // Same panels in the left column (collapsible) and in the footer popovers.
  const membersPanel = (className: string, inColumn = false) => (
    <InstanceMembersPanel
      modpackId={pack.id}
      entries={isExample ? DRAWER_EXAMPLE_MEMBERS : undefined}
      className={className}
      collapsed={inColumn && membersCollapsed}
      onToggleCollapsed={inColumn ? () => toggleCollapsed("members") : undefined}
    />
  );
  const changelogPanel = (className: string, inColumn = false) => (
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
                  {isExample ? (
                    <Button size="sm" className="h-11 px-6 text-base font-bold border-0" onClick={() => toast.info("Instancia de ejemplo — no se puede jugar.")}>
                      <Play className="mr-1.5 h-4 w-4 fill-current" /> JUGAR
                    </Button>
                  ) : (
                    <BannerPlayButton pack={pack} large />
                  )}
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
              carousel's "Contenido"), embedded — this column is its scroll
              container. */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
            <ModpackManager embeddedId={pack.id} slots={{ actions: actionsSlot, extras: extrasSlot }} />
          </div>

          {/* Right column: the instance's group chat, always open. Narrow
              window → the usual popup button in the footer's corner instead. */}
          {wide && (
            <div className="w-96 shrink-0">
              {hasGroupChat ? (
                <InstanceGroupChatPanel pack={pack} myUuid={uuid!} myUsername={username ?? ""} />
              ) : (
                <aside className="h-full flex items-center justify-center rounded-md border border-white/10 bg-gray-500/10 backdrop-blur-md p-6 text-center text-xs text-muted-foreground">
                  {isExample ? "La instancia de ejemplo no tiene chat de grupo." : "Esta instancia ya no tiene chat de grupo."}
                </aside>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="relative z-20 h-20 border-t border-white/5 bg-card/50 backdrop-blur flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && (
            // Friends only — this instance's players are in Participantes.
            <PresenceButton
              context={{ type: "general" }}
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

        {/* Narrow window: the side columns are hidden, they open from here. */}
        {!wide && (
          <div className="flex items-center gap-1">
            <FooterPanelButton icon={Sparkles} label="Novedades">
              {changelogPanel("min-h-0")}
            </FooterPanelButton>
            <FooterPanelButton icon={Users} label="Participantes">
              {membersPanel("min-h-0")}
            </FooterPanelButton>
            {hasGroupChat && <InstanceGroupChat pack={pack} myUuid={uuid!} myUsername={username ?? ""} plainHeader />}
          </div>
        )}
      </footer>
    </div>
  );
}
