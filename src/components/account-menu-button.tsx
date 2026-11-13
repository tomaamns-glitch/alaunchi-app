import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Shirt, Settings, Users, Globe, Server, ChevronLeft, ChevronDown, ChevronRight, BookMarked, type LucideIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
// Loaded on demand (three.js) — see components/lazy-heavy.tsx.
import { SkinManagerPanel } from "@/components/lazy-heavy";
import { CharacterCard } from "@/components/character-card";
import { useProfileLook } from "@/hooks/use-profile-look";
import { usePlayerHeadUrl, usePlayerSkinUrl } from "@/hooks/use-player-head";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { FriendsPanel } from "@/components/friends-panel";
import { ProfileBannerCard, ProfileMenuPanel } from "@/components/profile-menu-panel";
import { OnlineInstancesPanel } from "@/components/online-instances-panel";
import { ServersPanel } from "@/components/servers-panel";
import { PersonalLibraryPanel } from "@/components/personal-library-panel";
import { useSavedServers } from "@/lib/saved-servers";
import { useInvites } from "@/hooks/use-invites";
import { UserProfileMenuView } from "@/components/user-profile-menu-panel";
import { useAvatarDecoration } from "@/hooks/use-avatar-decoration";
import { subscribeIncomingRequests } from "@/services/friends";
import { isAwayStored, setAwayStatus } from "@/services/user-activity";
import { Hint } from "@/components/hint";
import { toast } from "@/lib/toast";
import { useDevDecoOverride } from "@/lib/dev-deco-override";
import { DecoratedIcon, useLiveIconColors, useLiveIconDecoration } from "@/components/icon-decoration";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import { cn } from "@/lib/utils";

// DEV ONLY: decoration picked in Personalizar → Pruebas, drawn around your head
// here. Lazy + gated on import.meta.env.DEV so the lab isn't in the prod bundle.
const DevDecoratedHead = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-deco-lab").then((m) => ({ default: m.DecoratedHead })))
  : null;

interface AccountMenuButtonProps {
  uuid: string | null;
  username: string | null;
}

// Opening/closing: a short fade with a small rise, transform + opacity only so
// the compositor runs it on its own (no scale: it re-rasterises the text every
// frame). The panel is NOT unmounted when closed — it stays mounted and gets
// display:none at the end of the fade — so opening never has to build the whole
// menu (character card, profile banner, 3D viewer) in the same frame the
// animation starts, which is what made it stutter.
const PANEL_VARIANTS = {
  open: { display: "flex", opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const } },
  closed: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const },
    transitionEnd: { display: "none" },
  },
};

/** "instant": the view changed while the panel was hidden or just opening — no slide. */
type ViewDir = "forward" | "back" | "instant";

/** How deep a view is: the menu, a section of it, someone's profile (opened
 *  from a section). Going to a shallower one is "back". */
function VIEW_DEPTH(view: string): number {
  return view === "menu" ? 0 : view === "user" ? 2 : 1;
}

/** Forward: the new view comes in from the right, the old one fades out.
 *  Back (Volver): the old view slides out to the right, the new one fades in
 *  from a little to the left. */
const VIEW_VARIANTS = {
  enter: (dir: ViewDir) => (dir === "instant" ? { opacity: 1, x: 0 } : { opacity: 0, x: dir === "back" ? -16 : 24 }),
  center: (dir: ViewDir) => ({
    opacity: 1,
    x: 0,
    transition: dir === "instant" ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  }),
  exit: (dir: ViewDir) =>
    dir === "instant"
      ? { opacity: 0, transition: { duration: 0 } }
      : {
          opacity: 0,
          x: dir === "back" ? 24 : 0,
          transition: { duration: dir === "back" ? 0.16 : 0.12, ease: "easeIn" as const },
        },
};

/** The main menu's body: its character card is 380px tall (12 + 254 + 16 +
 *  Personalizar 40 + 8 + En línea 32 + 16 + 2 border) plus the panel's 24px
 *  padding on each side. Personalizar uses the very same height, so going in
 *  and out never resizes the panel. */
const MENU_BODY_MIN_H = "min-h-[428px]";
const MENU_BODY_H = "h-[428px]";

/** The account button in the bottom bar — expands into the account panel
 *  (your character, Personalizar, Perfil/Amigos/Instancias online/Configuración), coordinated
 *  with the other footer popups (presence, chat) via useHeaderOverlay so only
 *  one is ever open at a time. */
export function AccountMenuButton({ uuid, username }: AccountMenuButtonProps) {
  const [, setLocation] = useLocation();
  const myHeadUrl = usePlayerHeadUrl(uuid);
  const mySkinUrl = usePlayerSkinUrl(uuid);
  const decoration = useAvatarDecoration(uuid);
  // Your frame round the character too, if you chose so in Editar perfil.
  const look = useProfileLook(uuid ?? "");
  const characterFrame = look?.frameOnCharacter ? look.frame : null;
  const iconDecoration = useLiveIconDecoration(uuid);
  const iconColors = useLiveIconColors(uuid);
  const activePopup = useHeaderOverlay((s) => s.active);
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);
  const profileOpen = activePopup === "profile";
  // Which screen the panel shows (menu / skin manager / friends) — in the
  // shared store so the players panel can open it straight on "friends".
  const profileView = useHeaderOverlay((s) => s.profileView);
  const setProfileView = useHeaderOverlay((s) => s.setProfileView);
  const viewedUserUuid = useHeaderOverlay((s) => s.viewedUserUuid);
  const userProfileFrom = useHeaderOverlay((s) => s.userProfileFrom);
  const openUserProfile = useHeaderOverlay((s) => s.openUserProfile);
  const openChat = useChatHeads((s) => s.openChat);
  const [pendingRequests, setPendingRequests] = useState(0);
  // "En línea" / "Ausente" (user-activity.ts): kept per account on this PC.
  const [away, setAway] = useState(() => (uuid ? isAwayStored(uuid) : false));
  const [savingAway, setSavingAway] = useState(false);
  useEffect(() => {
    setAway(uuid ? isAwayStored(uuid) : false);
  }, [uuid]);
  const toggleAway = async () => {
    if (!uuid || savingAway) return;
    const next = !away;
    setSavingAway(true);
    try {
      await setAwayStatus(uuid, next);
      setAway(next);
    } catch {
      toast.error("No se pudo cambiar tu estado. Inténtalo de nuevo.");
    } finally {
      setSavingAway(false);
    }
  };
  const inviteCount = useInvites((s) => Object.keys(s.invites).length);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [previewSlot, setPreviewSlot] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Mounted the first time it's opened, or earlier when the app is idle, and
  // then kept (hidden) — see PANEL_VARIANTS.
  const [panelMounted, setPanelMounted] = useState(false);
  useEffect(() => {
    if (panelMounted || !uuid) return;
    if (profileOpen) {
      setPanelMounted(true);
      return;
    }
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cic = window.cancelIdleCallback ?? window.clearTimeout;
    const id = ric(() => setPanelMounted(true), { timeout: 4000 });
    return () => cic(id);
  }, [panelMounted, profileOpen, uuid]);
  // The 3D character waits for the open animation to finish: creating its WebGL
  // context (+ shaders, glTF clone) mid-animation is what made opening stutter.
  // panelSettled is per opening; the main menu's own character, once built,
  // stays alive (paused) while the panel is hidden, so reopening doesn't rebuild it.
  const [panelSettled, setPanelSettled] = useState(false);
  const [menuViewerReady, setMenuViewerReady] = useState(false);
  useEffect(() => {
    if (!profileOpen) setPanelSettled(false);
  }, [profileOpen]);

  // Direction of the last view change: Volver (to the menu, or back from
  // someone's profile) slides the view out to the right; going into a section
  // slides the new one in from the right.
  // Changes while the panel is hidden, or in the same render that opens it
  // (openProfileView/openUserProfile from elsewhere), are instant: no slide
  // under the opening fade.
  const prevViewRef = useRef(profileView);
  const wasOpenRef = useRef(profileOpen);
  const viewDirRef = useRef<ViewDir>("forward");
  if (prevViewRef.current !== profileView) {
    viewDirRef.current =
      !profileOpen || !wasOpenRef.current
        ? "instant"
        : VIEW_DEPTH(profileView) < VIEW_DEPTH(prevViewRef.current)
          ? "back"
          : "forward";
    prevViewRef.current = profileView;
  }
  wasOpenRef.current = profileOpen;
  const viewDir = viewDirRef.current;

  useEffect(() => {
    if (uuid) useSavedServers.getState().init(uuid);
  }, [uuid]);

  useEffect(() => {
    if (!uuid) return;
    return subscribeIncomingRequests(uuid, (requests) => setPendingRequests(Object.keys(requests).length));
  }, [uuid]);

  const setProfileOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const wasOpen = profileOpen;
    const nextOpen = typeof next === "function" ? next(wasOpen) : next;
    if (nextOpen) openOverlay("profile");
    else closeOverlay();
  };

  const go = (path: string) => {
    setProfileOpen(false);
    setLocation(path);
  };

  useDismissOnOutsideClick([panelRef, buttonRef], () => setProfileOpen(false), profileOpen);

  return (
    <div className="relative">
      {profileOpen && (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => setProfileOpen(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
      {panelMounted && uuid && (
          <motion.div
            ref={panelRef}
            initial="closed"
            animate={profileOpen ? "open" : "closed"}
            variants={PANEL_VARIANTS}
            style={{ willChange: "opacity, transform" }}
            inert={!profileOpen}
            aria-hidden={!profileOpen}
            onAnimationComplete={(def) => {
              if (def === "open") {
                if (useHeaderOverlay.getState().active === "profile") {
                  setPanelSettled(true);
                  setMenuViewerReady(true);
                }
              } else if (useHeaderOverlay.getState().active !== "profile") {
                // Hidden now: go back to the menu out of sight, so the next
                // opening shows it straight away instead of swapping views mid-fade.
                setProfileView("menu");
              }
            }}
            data-account-panel
            className="absolute bottom-0 left-0 z-50 min-w-[32rem] rounded-md bg-background/60 backdrop-blur-xl border border-transparent shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex-col"
          >
            {/* Faint accent rim (the carousel instance's colour, see useDynamicAccent). */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 rounded-md shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.35)]"
            />
            <AnimatePresence mode="wait" initial={false} custom={viewDir}>
              {profileView === "menu" ? (
                <motion.div
                  key="menu"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className={`flex gap-6 p-6 ${MENU_BODY_MIN_H}`}
                >
                  <CharacterCard
                    skinUrl={mySkinUrl}
                    effect={decoration}
                    ready={menuViewerReady}
                    active={profileOpen}
                    frame={characterFrame}
                    frameColor={look?.frameColor}
                  >
                    <button
                      type="button"
                      data-tour="account-customize"
                      onClick={() => setProfileView("skin")}
                      className="relative w-full h-10 flex items-center justify-center gap-2 rounded-md bg-accent/70 text-white text-sm font-semibold shadow-[0_4px_16px_hsl(var(--accent)/0.25)] hover:bg-accent/85 transition-colors"
                    >
                      <Shirt className="h-4 w-4" />
                      Personalizar
                    </button>
                    <Hint
                      label={
                        away
                          ? "Los demás te ven ausente. Pulsa para volver a estar en línea."
                          : "Los demás ven que estás en línea. Pulsa para ponerte ausente."
                      }
                    >
                      <button
                        type="button"
                        onClick={() => void toggleAway()}
                        disabled={savingAway}
                        aria-pressed={away}
                        // -mt-2: 8px under Personalizar instead of the card's 16px gap.
                        className="-mt-2 w-full h-8 flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] text-xs font-semibold text-gray-200 hover:bg-white/[0.1] transition-colors disabled:opacity-60"
                      >
                        <span
                          aria-hidden
                          className={`h-2 w-2 rounded-full transition-colors ${
                            away ? "bg-amber-400" : "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]"
                          }`}
                        />
                        {away ? "Ausente" : "En línea"}
                      </button>
                    </Hint>
                  </CharacterCard>

                  <div className="flex-1 flex flex-col gap-4 w-[27rem]">
                    {/* Your profile card (banner, bio, stats, ⋮), straight in the menu. */}
                    {username && <ProfileBannerCard uuid={uuid} username={username} onNavigate={go} />}
                    <div className="grid grid-cols-2 gap-2.5">
                      <MenuTile icon={Users} label="Amigos" badge={pendingRequests} onClick={() => setProfileView("friends")} />
                      <MenuTile icon={Globe} label="Instancias online" badge={inviteCount} tourId="account-online" onClick={() => setProfileView("online")} />
                      <MenuTile icon={Server} label="Servers" onClick={() => setProfileView("servers")} />
                      <MenuTile icon={BookMarked} label="Biblioteca" onClick={() => setProfileView("library")} />
                      <MenuTile icon={Settings} label="Configuración" onClick={() => go("/settings")} className="col-span-2" />
                    </div>
                  </div>
                </motion.div>
              ) : profileView === "friends" ? (
                <motion.div
                  key="friends"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-3 p-6"
                >
                  <motion.div
                    className="w-[34rem] h-[440px]"
                  >
                    {username && (
                      <FriendsPanel
                        uuid={uuid}
                        username={username}
                        onOpenProfile={(id) => (id === uuid ? setProfileView("profile") : openUserProfile(id))}
                        onChat={(id) => {
                          // openChat closes this panel itself (useHeaderOverlay).
                          openChat(id);
                        }}
                      />
                    )}
                  </motion.div>
                </motion.div>
              ) : profileView === "profile" ? (
                // EXPERIMENTAL: profile inside the menu; the old /profile page is untouched.
                <motion.div
                  key="profile"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex gap-6 p-6"
                >
                  <CharacterCard skinUrl={mySkinUrl} effect={decoration} ready={panelSettled} frame={characterFrame} frameColor={look?.frameColor} />
                  <motion.div
                    className="w-[29rem] h-[300px]"
                  >
                    {username && <ProfileMenuPanel uuid={uuid} username={username} onNavigate={go} />}
                  </motion.div>
                </motion.div>
              ) : profileView === "online" ? (
                <motion.div
                  key="online"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-3 p-6"
                >
                  <motion.div
                    className="w-[34rem] h-[440px]"
                  >
                    <OnlineInstancesPanel onNavigate={go} />
                  </motion.div>
                </motion.div>
              ) : profileView === "servers" ? (
                <motion.div
                  key="servers"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-3 p-6"
                >
                  <motion.div
                    className="w-[34rem] h-[440px]"
                  >
                    <ServersPanel />
                  </motion.div>
                </motion.div>
              ) : profileView === "library" ? (
                <motion.div
                  key="library"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-3 p-6"
                >
                  <motion.div
                    className="w-[42rem] h-[440px]"
                  >
                    <PersonalLibraryPanel />
                  </motion.div>
                </motion.div>
              ) : profileView === "user" && viewedUserUuid ? (
                // EXPERIMENTAL: someone else's profile inside the menu; /profile/:uuid is untouched.
                <motion.div
                  key={`user:${viewedUserUuid}`}
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="p-6"
                >
                  {username && (
                    <UserProfileMenuView
                      ready={panelSettled}
                      targetUuid={viewedUserUuid}
                      myUuid={uuid}
                      myUsername={username}
                      onNavigate={go}
                    />
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="skin"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  // Exactly the menu's frame (same width, same height): Personalizar opens
                  // in it, and its lists scroll inside instead of growing the panel.
                  className={`p-6 ${MENU_BODY_H}`}
                >
                  <SkinManagerPanel
                    uuid={uuid}
                    username={username}
                    previewActionsSlot={previewSlot}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* The button itself, grown — clicking it again collapses the panel. */}
            <div className="relative flex items-center border-t border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors rounded-b-md">
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                aria-label="Cerrar menú"
                // Open, the bar shows no name or head (the panel above already does):
                // just the area that collapses it and the controls on the right.
                className="flex-1 min-w-0 self-stretch min-h-12 rounded-b-md"
              />
              <div className="flex items-center gap-2 mr-6 shrink-0">
                {/* Personalizar portals its Aplicar/descartar buttons in here while previewing. */}
                <div ref={setPreviewSlot} className="flex items-center empty:hidden" />
                {/* Volver lives here, bottom-right, in every view but the main menu. */}
                {profileView === "menu" ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 pointer-events-none" />
                ) : (
                  <BackButton onClick={() => setProfileView(profileView === "user" ? userProfileFrom : "menu")} />
                )}
              </div>
            </div>
          </motion.div>
      )}
      <button
        ref={buttonRef}
        type="button"
        data-tour="account-button"
        onClick={() => setProfileOpen((v) => !v)}
        // Accent-tinted, like Actividad: these two are yours, not the instance's.
        // Hidden under the open panel so it doesn't show through while it fades.
        className={cn(
          "relative z-40 flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/15 backdrop-blur-md border border-transparent hover:bg-accent/25 transition-[background-color,opacity] duration-150",
          profileOpen && "opacity-0",
        )}
      >
        <HeadAvatar headUrl={myHeadUrl} username={username} size={24} radius={6} decoration={iconDecoration} colors={iconColors}>
          <Avatar className="h-6 w-6 rounded-md border border-white/10">
            {myHeadUrl && <AvatarImage src={myHeadUrl} alt={username ?? ""} className="rounded-md" />}
            <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
              {username?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </HeadAvatar>
        <span className="text-sm font-medium text-white" data-testid="text-username">
          {username}
        </span>
      </button>
    </div>
  );
}

/** Your head avatar, or — only in dev, while a decoration is picked in the
 *  Pruebas lab — that decoration drawn around it. The decoration is 1.2× the
 *  avatar (Discord's proportions), so it overflows by a negative margin and the
 *  button keeps its size. */
function HeadAvatar({
  headUrl,
  username,
  size,
  radius,
  decoration,
  colors,
  children,
}: {
  headUrl: string | null;
  username: string | null;
  size: number;
  /** The avatar's corner radius in px. */
  radius: number;
  /** Your saved icon decoration (ICON_DECORATIONS id). */
  decoration: string;
  colors?: string | null;
  children: React.ReactNode;
}) {
  const devDeco = useDevDecoOverride((s) => s.name);
  const devSquare = useDevDecoOverride((s) => s.square);
  if (!DevDecoratedHead || !devDeco) {
    return (
      <DecoratedIcon decoration={decoration} colors={colors} size={size} radius={radius}>
        {children}
      </DecoratedIcon>
    );
  }
  const outer = size * 1.2;
  const overflow = (outer - size) / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={username ?? undefined}>
      <div className="absolute" style={{ inset: -overflow }}>
        <Suspense fallback={children}>
          <DevDecoratedHead key={`${devDeco}-${devSquare}`} name={devDeco} headUrl={headUrl} size={outer} square={devSquare} />
        </Suspense>
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 flex items-center justify-center gap-1.5 px-3 rounded-md bg-white/[0.07] border border-transparent text-sm font-bold text-gray-200 hover:bg-white/[0.14] transition-colors"
    >
      <ChevronLeft className="h-4 w-4" />
      Volver
    </button>
  );
}

interface MenuTileProps {
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick: () => void;
  /** data-tour anchor for the onboarding tour. */
  tourId?: string;
  className?: string;
}

function MenuTile({ icon: Icon, label, badge, onClick, tourId, className }: MenuTileProps) {
  return (
    <button
      type="button"
      data-tour={tourId}
      onClick={onClick}
      className={cn(
        "group h-12 flex items-center gap-3 px-3.5 rounded-md bg-white/[0.04] border border-white/10 text-sm font-semibold text-gray-100 whitespace-nowrap hover:bg-white/[0.08] hover:border-white/20 transition-colors",
        className
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-accent" />
      <span className="truncate">{label}</span>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {!!badge && badge > 0 && (
          <span className="h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
            {badge}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
      </span>
    </button>
  );
}
