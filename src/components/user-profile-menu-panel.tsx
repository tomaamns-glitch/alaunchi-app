import { useEffect, useState } from "react";
import {
  Boxes,
  Clock,
  Download,
  ExternalLink,
  Gamepad2,
  Heart,
  Loader2,
  Lock,
  MessageSquare,
  MoreVertical,
  Play,
  Square,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useModpacks } from "@/hooks/use-modpacks";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { usePlayerSkinUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { SkinViewerAnimated } from "@/components/lazy-heavy";
import { ProfileFrame } from "@/components/profile-frame";
import { InstallFavoriteDialog } from "@/components/install-favorite-dialog";
import { subscribeProfile, visibleOnlineInstances, type PublicProfileSnapshot, type PublicInstanceSummary } from "@/services/public-profile";
import { removeFriend, sendFriendRequest, subscribeFriends, subscribeSentRequests } from "@/services/friends";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import { toSkinEffect } from "@/lib/decoration-catalog";
import { installOnlineInstance } from "@/lib/install-online-instance";
import { installFromRecipe } from "@/lib/instance-recipe";
import { formatPlaytime } from "@/lib/format";
import type { Modpack } from "@/services/github";
import type { FavoriteCategory, FavoriteEntry } from "@/services/favorites";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = "online" | "private" | "favorites";

const TABS: { id: Tab; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "private", label: "Privadas" },
  { id: "favorites", label: "Favoritas" },
];

const FAV_PATH: Record<FavoriteCategory, string> = {
  mods: "mod",
  shaderpacks: "shader",
  resourcepacks: "resourcepack",
};

interface UserProfileMenuViewProps {
  targetUuid: string;
  myUuid: string;
  myUsername: string;
  /** "Volver" under the character. */
  backButton: React.ReactNode;
  /** Navigates somewhere, closing the account menu. */
  onNavigate: (path: string) => void;
}

/** Someone else's profile inside the account menu: their character on the
 *  left (same spot/size as yours in the other screens), a compact card +
 *  content tabs on the right. EXPERIMENTAL — the full /profile/:uuid page
 *  (pages/public-profile.tsx) is untouched and still reachable from ⋮. */
export function UserProfileMenuView({ targetUuid, myUuid, myUsername, backButton, onNavigate }: UserProfileMenuViewProps) {
  const { modpacks, loadModpacks } = useModpacks();
  const openChat = useChatHeads((s) => s.openChat);
  const [profile, setProfile] = useState<PublicProfileSnapshot | null | undefined>(undefined);
  const [isFriend, setIsFriend] = useState(false);
  const [sentRequest, setSentRequest] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Only if nobody has tried yet: Inicio swaps its whole screen (footer and
    // this menu included) for a spinner while the catalog loads, so reloading
    // it from here — e.g. after it failed — would unmount the menu we're in.
    const { modpacks: loaded, loading, error } = useModpacks.getState();
    if (loaded.length === 0 && !loading && !error) loadModpacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setProfile(undefined);
    return subscribeProfile(targetUuid, setProfile);
  }, [targetUuid]);

  useEffect(() => subscribeSentRequests(myUuid, (r) => setSentRequest(!!r[targetUuid])), [myUuid, targetUuid]);
  useEffect(() => subscribeFriends(myUuid, (f) => setIsFriend(!!f[targetUuid])), [myUuid, targetUuid]);

  // By uuid (session server + texture proxy, cached) — same as your own
  // character in the menu; no username → uuid lookup needed.
  const skinUrl = usePlayerSkinUrl(targetUuid);

  const handleAddFriend = async () => {
    if (!profile) return;
    setSending(true);
    try {
      await sendFriendRequest(myUuid, myUsername, targetUuid, profile.username);
      setSentRequest(true);
    } catch {
      toast.error("No se pudo enviar la solicitud.");
    } finally {
      setSending(false);
    }
  };

  const handleRemoveFriend = async () => {
    try {
      await removeFriend(myUuid, targetUuid);
    } catch {
      toast.error("No se pudo eliminar el amigo.");
    }
  };

  return (
    <div className="flex gap-6">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="rounded-xl bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.18),transparent_70%)]">
          {profile && skinUrl ? (
            <SkinViewerAnimated
              key={`${targetUuid}:${profile.avatarDecoration}`}
              skinUrl={skinUrl}
              variant="auto-detect"
              width={190}
              height={254}
              effect={toSkinEffect(profile.avatarDecoration)}
              className="cursor-grab active:cursor-grabbing"
            />
          ) : (
            <div className="w-[190px] h-[254px] flex items-center justify-center">
              {profile !== null && <Loader2 className="h-5 w-5 animate-spin text-accent/60" />}
            </div>
          )}
        </div>
        {backButton}
      </div>

      <div className="w-[29rem] h-[300px]">
        {profile === undefined ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : profile === null ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-sm text-muted-foreground">Este jugador todavía no tiene un perfil que mostrar.</p>
          </div>
        ) : (
          <UserProfileBody
            profile={profile}
            modpacks={modpacks}
            friendState={isFriend ? "friends" : sentRequest ? "sent" : "none"}
            sending={sending}
            onAddFriend={handleAddFriend}
            onRemoveFriend={handleRemoveFriend}
            // openChat closes the menu itself (useHeaderOverlay).
            onOpenChat={() => openChat(targetUuid)}
            onOpenFullPage={() => onNavigate(`/profile/${targetUuid}`)}
            onOpenOnline={(id) => onNavigate(`/modpack/${id}`)}
          />
        )}
      </div>
    </div>
  );
}

function UserProfileBody({
  profile,
  modpacks,
  friendState,
  sending,
  onAddFriend,
  onRemoveFriend,
  onOpenChat,
  onOpenFullPage,
  onOpenOnline,
}: {
  profile: PublicProfileSnapshot;
  modpacks: Modpack[];
  friendState: "none" | "sent" | "friends";
  sending: boolean;
  onAddFriend: () => void;
  onRemoveFriend: () => void;
  onOpenChat: () => void;
  onOpenFullPage: () => void;
  onOpenOnline: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("online");
  const [installFavorite, setInstallFavorite] = useState<FavoriteEntry | null>(null);
  const onlinePacks = visibleOnlineInstances(profile, modpacks);
  const contentVisible = profile.visibility !== "friends" || friendState === "friends";
  const totalInstances = onlinePacks.length + profile.privateInstances.length;

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <ProfileFrame frame={profile.frame}>
        <div className="relative rounded-xl border border-white/10 overflow-hidden shrink-0">
          <div className="absolute inset-0">
            <img src={profile.bannerUrl || DEFAULT_PROFILE_BANNER} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/20" />
          </div>

          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            {friendState === "friends" ? (
              <HeaderButton onClick={onOpenChat} title="Abrir chat">
                <MessageSquare className="h-3.5 w-3.5" />
              </HeaderButton>
            ) : (
              <HeaderButton
                onClick={onAddFriend}
                disabled={friendState === "sent" || sending}
                title={friendState === "sent" ? "Solicitud enviada" : "Añadir amigo"}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              </HeaderButton>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-sm text-gray-200 hover:bg-black/70 hover:text-white transition-colors"
                  aria-label="Opciones del perfil"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[60]">
                <DropdownMenuItem onClick={onOpenFullPage}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver perfil completo
                </DropdownMenuItem>
                {friendState === "friends" && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemoveFriend}>
                    <UserMinus className="mr-2 h-4 w-4" />
                    Eliminar amigo
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="relative px-3.5 pt-3 pb-2.5">
            <div className="pr-16 min-w-0">
              <h2 className="text-lg font-bold leading-tight truncate">{profile.username}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 min-h-[1rem]">
                {profile.bio || (friendState === "sent" ? "Solicitud de amistad enviada" : "")}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3.5 text-[11px] text-gray-300">
              <MiniStat icon={Clock} value={formatPlaytime(profile.totalPlaytimeMs)} title="Tiempo jugado" />
              <MiniStat icon={Gamepad2} value={String(totalInstances)} title="Instancias" />
              <MiniStat icon={Heart} value={String(profile.favorites?.length ?? 0)} title="Favoritas" />
            </div>
          </div>
        </div>
      </ProfileFrame>

      {!contentVisible ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] text-center px-6">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {profile.username} solo comparte sus instancias y favoritos con sus amigos.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/5 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                  tab === t.id ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
            {tab === "online" ? (
              onlinePacks.length === 0 ? (
                <Empty text="No tiene ninguna instancia online que puedas ver." />
              ) : (
                onlinePacks.map((pack) =>
                  pack.installed ? (
                    <OwnedOnlineRow key={pack.id} pack={pack} onOpen={() => onOpenOnline(pack.id)} />
                  ) : (
                    <UninstalledOnlineRow key={pack.id} pack={pack} />
                  )
                )
              )
            ) : tab === "private" ? (
              profile.privateInstances.length === 0 ? (
                <Empty text="No tiene ninguna instancia privada destacada." />
              ) : (
                profile.privateInstances.map((i) => <PrivateInstanceRow key={i.id} instance={i} />)
              )
            ) : !profile.favorites || profile.favorites.length === 0 ? (
              <Empty text="Aún no ha marcado ningún favorito." />
            ) : (
              profile.favorites.map((f) => (
                <RowShell key={f.projectId}>
                  <a
                    href={`https://modrinth.com/${FAV_PATH[f.category]}/${f.projectId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                  >
                    <Thumb url={f.iconUrl} fallback={f.title} />
                    <span className="flex-1 min-w-0 truncate text-xs font-semibold text-gray-100">{f.title}</span>
                  </a>
                  <RowAction title={`Instalar ${f.title}`} onClick={() => setInstallFavorite(f)} variant="outline">
                    <Download className="h-3.5 w-3.5" />
                  </RowAction>
                </RowShell>
              ))
            )}
          </div>
        </>
      )}

      <InstallFavoriteDialog favorite={installFavorite} onOpenChange={(open) => !open && setInstallFavorite(null)} />
    </div>
  );
}

function HeaderButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-sm text-gray-200 hover:bg-black/70 hover:text-white transition-colors disabled:opacity-60 disabled:hover:bg-black/50"
    >
      {children}
    </button>
  );
}

function MiniStat({ icon: Icon, value, title }: { icon: typeof Clock; value: string; title: string }) {
  return (
    <span className="flex items-center gap-1" title={title}>
      <Icon className="h-3 w-3 text-accent" />
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function Thumb({ url, fallback, icon }: { url?: string | null; fallback: string; icon?: React.ReactNode }) {
  return (
    <div className="h-7 w-7 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-[10px] font-black text-accent/60 shrink-0">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : icon ?? fallback.charAt(0)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{text}</p>;
}

function RowShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.07] hover:border-white/10 transition-colors">
      {children}
    </div>
  );
}

function RowAction({
  onClick,
  disabled,
  title,
  variant = "solid",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  variant?: "solid" | "outline";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
        variant === "solid"
          ? "bg-accent text-accent-foreground hover:bg-accent/90"
          : "border border-white/15 text-gray-300 hover:text-accent hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );
}

function PackInfo({ name, minecraftVersion, loaderType, extra }: { name: string; minecraftVersion: string; loaderType: string; extra?: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-gray-100 truncate">{name}</div>
      <div className="text-[10px] text-muted-foreground truncate">
        {minecraftVersion} · <span className="uppercase">{loaderType}</span>
        {extra && ` · ${extra}`}
      </div>
    </div>
  );
}

/** A catalog modpack you ALSO have installed — your own launch flow. */
function OwnedOnlineRow({ pack, onOpen }: { pack: Modpack; onOpen: () => void }) {
  const { busy, running, toggle } = useLaunchModpack(pack);
  return (
    <RowShell>
      <button type="button" onClick={onOpen} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
        <Thumb url={pack.imageUrl} fallback={pack.name} />
        <PackInfo name={pack.name} minecraftVersion={pack.minecraftVersion} loaderType={pack.loaderType} />
      </button>
      <RowAction title={running ? "Cerrar Minecraft" : "Jugar"} onClick={toggle} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : running ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
      </RowAction>
    </RowShell>
  );
}

/** A catalog modpack you don't have yet — same install as the home carousel. */
function UninstalledOnlineRow({ pack }: { pack: Modpack }) {
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await installOnlineInstance(pack);
      setDone(true);
      toast.success(`${pack.name} instalado correctamente.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <RowShell>
      <Thumb url={pack.imageUrl} fallback={pack.name} />
      <PackInfo name={pack.name} minecraftVersion={pack.minecraftVersion} loaderType={pack.loaderType} extra={done ? "Instalado" : undefined} />
      <RowAction title="Instalar" onClick={handleInstall} disabled={installing || done} variant="outline">
        {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </RowAction>
    </RowShell>
  );
}

/** A starred private instance — rebuilt on your side from its Modrinth recipe. */
function PrivateInstanceRow({ instance }: { instance: PublicInstanceSummary }) {
  const [state, setState] = useState<"idle" | "installing" | "done">("idle");
  const contentCount = instance.recipe?.length ?? 0;

  const handleDownload = async () => {
    setState("installing");
    try {
      const r = await installFromRecipe(instance.name, instance);
      setState("done");
      toast.success(`${instance.name} creada — ${r.installedCount} de ${contentCount} elementos instalados.`);
    } catch (e: any) {
      setState("idle");
      toast.error(e?.message || "No se pudo crear la instancia.");
    }
  };

  return (
    <RowShell>
      <Thumb url={instance.imageUrl} fallback={instance.name} icon={<Boxes className="h-3.5 w-3.5 text-muted-foreground" />} />
      <PackInfo
        name={instance.name}
        minecraftVersion={instance.minecraftVersion}
        loaderType={instance.loaderType}
        extra={state === "done" ? "Creada" : `${contentCount} elemento${contentCount === 1 ? "" : "s"}`}
      />
      <RowAction title="Descargar" onClick={handleDownload} disabled={state !== "idle"} variant="outline">
        {state === "installing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </RowAction>
    </RowShell>
  );
}
