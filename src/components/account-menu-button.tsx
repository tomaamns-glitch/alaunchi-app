import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Shirt, Settings, Users, Globe, Server, ChevronLeft, ChevronDown, BookMarked, type LucideIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
// Loaded on demand (three.js) — see components/lazy-heavy.tsx.
import { SkinManagerPanel, SkinViewerAnimated } from "@/components/lazy-heavy";
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
import { useDevDecoOverride } from "@/lib/dev-deco-override";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";

// DEV ONLY: decoration picked in Personalizar → Pruebas, drawn around your head
// here. Lazy + gated on import.meta.env.DEV so the lab isn't in the prod bundle.
const DevDecoratedHead = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-deco-lab").then((m) => ({ default: m.DecoratedHead })))
  : null;

interface AccountMenuButtonProps {
  uuid: string | null;
  username: string | null;
}

// The panel is revealed by a clip-path that starts as exactly the footer
// button's own rectangle (anchored bottom-left, same as the button) and opens
// up to the full panel — so it reads as the button itself growing, Windows
// start-menu style, and swallowing the players button/chat bubbles beside it.
// Same "calc(N% - Npx)" shape on both ends so framer-motion can interpolate it.
const clipFromButton = (w: number, h: number) =>
  `inset(calc(100% - ${h}px) calc(100% - ${w}px) calc(0% - 0px) calc(0% - 0px) round 8px)`;
const CLIP_OPEN = "inset(calc(0% - 0px) calc(0% - 0px) calc(0% - 0px) calc(0% - 0px) round 14px)";

type ViewDir = "forward" | "back";

/** How deep a view is: the menu, a section of it, someone's profile (opened
 *  from a section). Going to a shallower one is "back". */
function VIEW_DEPTH(view: string): number {
  return view === "menu" ? 0 : view === "user" ? 2 : 1;
}

/** Forward: the new view comes in from the right, the old one fades out.
 *  Back (Volver): the old view slides out to the right, the new one fades in
 *  from a little to the left. */
const VIEW_VARIANTS = {
  enter: (dir: ViewDir) => ({ opacity: 0, x: dir === "back" ? -16 : 24 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
  exit: (dir: ViewDir) => ({
    opacity: 0,
    x: dir === "back" ? 24 : 0,
    transition: { duration: dir === "back" ? 0.16 : 0.12, ease: "easeIn" as const },
  }),
};

/** The account button in the bottom bar — expands into the account panel
 *  (your character, Personalizar, Perfil/Amigos/Instancias online/Configuración), coordinated
 *  with the other footer popups (presence, chat) via useHeaderOverlay so only
 *  one is ever open at a time. */
export function AccountMenuButton({ uuid, username }: AccountMenuButtonProps) {
  const [, setLocation] = useLocation();
  const myHeadUrl = usePlayerHeadUrl(uuid);
  const mySkinUrl = usePlayerSkinUrl(uuid);
  const decoration = useAvatarDecoration(uuid);
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
  const inviteCount = useInvites((s) => Object.keys(s.invites).length);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [buttonSize, setButtonSize] = useState({ w: 160, h: 38 });
  const [previewSlot, setPreviewSlot] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Direction of the last view change: Volver (to the menu, or back from
  // someone's profile) slides the view out to the right; going into a section
  // slides the new one in from the right.
  const prevViewRef = useRef(profileView);
  const viewDirRef = useRef<ViewDir>("forward");
  if (prevViewRef.current !== profileView) {
    viewDirRef.current = VIEW_DEPTH(profileView) < VIEW_DEPTH(prevViewRef.current) ? "back" : "forward";
    prevViewRef.current = profileView;
  }
  const viewDir = viewDirRef.current;

  useEffect(() => {
    if (uuid) useSavedServers.getState().init(uuid);
  }, [uuid]);

  useEffect(() => {
    if (!uuid) return;
    return subscribeIncomingRequests(uuid, (requests) => setPendingRequests(Object.keys(requests).length));
  }, [uuid]);

  // Kept measured ahead of time (not only on click) since the panel can also
  // be opened from elsewhere, and its expand animation starts from this rect.
  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const measure = () => setButtonSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const collapsedClip = clipFromButton(buttonSize.w, buttonSize.h);
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
      <AnimatePresence>
        {profileOpen && uuid && (
          <motion.div
            ref={panelRef}
            initial={{ clipPath: collapsedClip, opacity: 0.4 }}
            animate={{ clipPath: CLIP_OPEN, opacity: 1 }}
            exit={{ clipPath: collapsedClip, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-0 left-0 z-50 min-w-[32rem] rounded-[14px] bg-card/95 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col"
          >
            <AnimatePresence mode="wait" initial={false} custom={viewDir}>
              {profileView === "menu" ? (
                <motion.div
                  key="menu"
                  custom={viewDir}
                  variants={VIEW_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex gap-6 p-6"
                >
                  <CharacterColumn skinUrl={mySkinUrl} effect={decoration}>
                    <button
                      type="button"
                      data-tour="account-customize"
                      onClick={() => setProfileView("skin")}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-bold hover:bg-accent/90 transition-colors"
                    >
                      <Shirt className="h-3.5 w-3.5" />
                      Personalizar
                    </button>
                  </CharacterColumn>

                  <div className="flex-1 flex flex-col gap-2 pt-1 w-[19rem]">
                    {/* Your profile card (banner, bio, stats, ⋮), straight in the menu. */}
                    {username && <ProfileBannerCard uuid={uuid} username={username} onNavigate={go} />}
                    <MenuTile icon={Users} label="Amigos" badge={pendingRequests} onClick={() => setProfileView("friends")} />
                    <MenuTile icon={Globe} label="Instancias online" badge={inviteCount} tourId="account-online" onClick={() => setProfileView("online")} />
                    <MenuTile icon={Server} label="Servers" onClick={() => setProfileView("servers")} />
                    <MenuTile icon={BookMarked} label="Biblioteca" onClick={() => setProfileView("library")} />
                    <MenuTile icon={Settings} label="Configuración" onClick={() => go("/settings")} />
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
                    className="w-[42rem] h-[300px]"
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
                  <CharacterColumn skinUrl={mySkinUrl} effect={decoration} />
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
                    className="w-[42rem] h-[300px]"
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
                    className="w-[42rem] h-[300px]"
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
                    className="w-[42rem] h-[300px]"
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
                  className="p-6"
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
            <div className="relative flex items-center border-t border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors rounded-b-[14px]">
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="flex-1 min-w-0 flex items-center gap-3 px-6 py-3.5 text-left rounded-b-[14px]"
              >
                <HeadAvatar headUrl={myHeadUrl} username={username} size={40}>
                  <Avatar className="h-10 w-10 rounded-lg border border-white/10">
                    {myHeadUrl && <AvatarImage src={myHeadUrl} alt={username ?? ""} className="rounded-lg" />}
                    <AvatarFallback className="rounded-lg bg-accent/20 text-accent text-base font-bold">
                      {username?.charAt(0)?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </HeadAvatar>
                <span className="flex-1 text-base font-semibold text-white truncate">{username}</span>
              </button>
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
      </AnimatePresence>
      <button
        ref={buttonRef}
        type="button"
        data-tour="account-button"
        onClick={() => setProfileOpen((v) => !v)}
        className="relative z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
      >
        <HeadAvatar headUrl={myHeadUrl} username={username} size={24}>
          <Avatar className="h-6 w-6 rounded-md border border-white/10">
            {myHeadUrl && <AvatarImage src={myHeadUrl} alt={username ?? ""} className="rounded-md" />}
            <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
              {username?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </HeadAvatar>
        <span className="text-sm font-medium text-gray-200" data-testid="text-username">
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
  children,
}: {
  headUrl: string | null;
  username: string | null;
  size: number;
  children: React.ReactNode;
}) {
  const devDeco = useDevDecoOverride((s) => s.name);
  const devSquare = useDevDecoOverride((s) => s.square);
  if (!DevDecoratedHead || !devDeco) return <>{children}</>;
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

/** Your character on the left of the panel — main menu and Perfil only, same
 *  size/spot in both so it never jumps when switching between them. */
function CharacterColumn({
  skinUrl,
  effect,
  children,
}: {
  skinUrl: string | null;
  effect: ReturnType<typeof useAvatarDecoration>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 shrink-0 self-end">
      <div className="rounded-xl bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.18),transparent_70%)]">
        {skinUrl ? (
          <SkinViewerAnimated
            skinUrl={skinUrl}
            variant="auto-detect"
            width={190}
            height={254}
            effect={effect}
            className="cursor-grab active:cursor-grabbing"
          />
        ) : (
          <div className="w-[190px] h-[254px]" />
        )}
      </div>
      {children}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 flex items-center justify-center gap-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-gray-200 hover:bg-white/10 transition-colors"
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
}

function MenuTile({ icon: Icon, label, badge, onClick, tourId }: MenuTileProps) {
  return (
    <button
      type="button"
      data-tour={tourId}
      onClick={onClick}
      // Single line even if that widens the menu ("Instancias online").
      className="group flex items-center gap-2.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/5 text-sm font-medium text-gray-200 whitespace-nowrap hover:bg-white/10 hover:border-white/10 transition-colors"
    >
      <span className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md bg-accent/15 text-accent group-hover:bg-accent/25 transition-colors">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {label}
      {!!badge && badge > 0 && (
        <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}
