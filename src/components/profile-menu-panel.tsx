import { Hint } from "@/components/hint";
import { useEffect, useState } from "react";
import { Clock, ExternalLink, Gamepad2, Heart, Loader2, LogOut, MoreVertical, Pencil, Play, Square } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceFolders } from "@/hooks/use-instance-folders";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useShowcaseSkin } from "@/hooks/use-showcase-skin";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";
import { MiniStat, ProfileBannerVisual, StatDivider } from "@/components/profile-banner-visual";
import { getInstalledModpacksMeta } from "@/services/electron";
import { getFavorites, type FavoriteCategory } from "@/services/favorites";
import { useDevBannerOverride } from "@/lib/dev-banner-override";
import { getPublishedPlaytime, getProfileCustomization, publishProfile, type ProfileVisibility } from "@/services/public-profile";
import { buildInstanceRecipe } from "@/lib/instance-recipe";
import { formatPlaytime } from "@/lib/format";
import { localPlaytimeFor } from "@/lib/playtime";
import type { Modpack } from "@/services/github";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const customizationCache = new Map<string, Awaited<ReturnType<typeof getProfileCustomization>>>();

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

interface ProfileMenuPanelProps {
  uuid: string;
  username: string;
  /** Navigates somewhere, closing the account menu. */
  onNavigate: (path: string) => void;
}

/** Your profile card — banner, frame, name, bio, stats and the ⋮ menu (Editar
 *  perfil, Decoraciones, Ver perfil completo, Cerrar sesión). Shown at the top
 *  of the account menu's main view. Like the /profile page, it republishes the
 *  public half of the profile whenever it's shown. */
export function ProfileBannerCard({ uuid, username, onNavigate }: ProfileMenuPanelProps) {
  const { logout } = useAuth();
  const { modpacks, loadModpacks } = useModpacks();
  const { instances, loadInstances } = useCustomInstances();
  const { pinned } = useInstanceFolders();
  const skin = useShowcaseSkin(username);
  const devBannerVideo = useDevBannerOverride((s) => s.videoUrl);

  const [totalPlaytimeMs, setTotalPlaytimeMs] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  // Seeded from the last read, so reopening the menu paints the real banner /
  // frame / bio on the first frame instead of defaults that pop into place.
  const cached = customizationCache.get(uuid);
  const [visibility, setVisibility] = useState<ProfileVisibility>(cached?.visibility ?? "everyone");
  const [bannerUrl, setBannerUrl] = useState<string | null>(cached?.bannerUrl ?? null);
  const [recentBanners, setRecentBanners] = useState<string[]>(cached?.recentBanners ?? []);
  const [bio, setBio] = useState(cached?.bio ?? "");
  const [avatarDecoration, setAvatarDecoration] = useState(cached?.avatarDecoration ?? "none");
  const [frame, setFrame] = useState(cached?.frame ?? "none");
  const [frameColor, setFrameColor] = useState<string | null>(cached?.frameColor ?? null);
  const [frameOnCharacter, setFrameOnCharacter] = useState(cached?.frameOnCharacter ?? false);
  const [hideInstances, setHideInstances] = useState(cached?.hideInstances ?? false);
  const [hideFavorites, setHideFavorites] = useState(cached?.hideFavorites ?? false);

  useEffect(() => {
    // Only if nobody has tried yet: Inicio swaps its whole screen (footer and
    // this menu included) for a spinner while the catalog loads, so reloading
    // it from here — e.g. after it failed — would unmount the menu we're in.
    const { modpacks: loaded, loading, error } = useModpacks.getState();
    if (loaded.length === 0 && !loading && !error) loadModpacks();
    loadInstances();
    getInstalledModpacksMeta()
      .then((meta) => {
        const total = localPlaytimeFor(meta as Record<string, any>, uuid);
        setTotalPlaytimeMs(total);
        // What this PC knows can be less than the real total (new PC, other
        // device): show the published one if it's higher.
        if (uuid) getPublishedPlaytime(uuid).then((remote) => remote > total && setTotalPlaytimeMs(remote)).catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getProfileCustomization(uuid)
      .then((c) => {
        customizationCache.set(uuid, c);
        setVisibility(c.visibility);
        setBannerUrl(c.bannerUrl);
        setRecentBanners(c.recentBanners);
        setBio(c.bio);
        setAvatarDecoration(c.avatarDecoration);
        setFrame(c.frame);
        setFrameColor(c.frameColor);
        setFrameOnCharacter(c.frameOnCharacter);
        setHideInstances(c.hideInstances);
        setHideFavorites(c.hideFavorites);
      })
      .catch(() => {});
  }, [uuid]);

  const onlineInstances = modpacks.filter((mp) => mp.installed);
  const starredPrivateInstances = instances.filter((i) => pinned.includes(i.id));

  // Same republish as pages/profile.tsx — see the comment there.
  useEffect(() => {
    let cancelled = false;
    // Wait for the open animation to finish: building recipes + publishing
    // competes with it for the main thread.
    const timer = window.setTimeout(() => void run(), 700);
    const run = async () => {
      const privateInstances = await Promise.all(
        starredPrivateInstances.map(async (i) => {
          const { recipe, unresolvedCount } = await buildInstanceRecipe(i.id).catch(() => ({ recipe: [], unresolvedCount: 0 }));
          return {
            id: i.id,
            name: i.name,
            minecraftVersion: i.minecraftVersion,
            loaderType: i.loaderType,
            imageUrl: i.imageUrl,
            recipe,
            unresolvedCount,
          };
        })
      );
      if (cancelled) return;
      await publishProfile(uuid, {
        username,
        totalPlaytimeMs,
        onlineInstanceIds: onlineInstances.map((mp) => mp.id),
        onlineInstanceRefs: onlineInstances.filter((mp) => mp.repoUrl).map((mp) => ({ id: mp.id, repoUrl: mp.repoUrl! })),
        privateInstances,
      }).catch(() => {});
    };
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, username, totalPlaytimeMs, onlineInstances.length, starredPrivateInstances.length]);

  const favorites = getFavorites();

  const renderStats = (hidden: { hideInstances: boolean; hideFavorites: boolean }) => (
    <>
      <MiniStat icon={Clock} value={formatPlaytime(totalPlaytimeMs)} title="Tiempo jugado" />
      {/* What you chose to hide (Editar perfil) leaves the banner too. */}
      {!hidden.hideInstances && (
        <>
          <StatDivider />
          <MiniStat icon={Gamepad2} value={String(onlineInstances.length + instances.length)} title="Instancias" />
        </>
      )}
      {!hidden.hideFavorites && (
        <>
          <StatDivider />
          <MiniStat icon={Heart} value={String(favorites.length)} title="Favoritas" />
        </>
      )}
    </>
  );
  const statsRow = renderStats({ hideInstances, hideFavorites });

  return (
    <>
      <ProfileBannerVisual
        uuid={uuid}
        username={username}
        bio={bio}
        bannerUrl={bannerUrl}
        frame={frame}
        frameColor={frameColor}
        devBannerVideo={devBannerVideo}
        menu={
          <DropdownMenu modal={false}>
          <Hint label="Opciones del perfil">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-sm text-gray-200 hover:bg-black/70 hover:text-white transition-colors"
                aria-label="Opciones del perfil"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="z-[60]">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("/profile")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Ver perfil completo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                await logout();
                onNavigate("/login");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        }
        stats={statsRow}
      />

      <ProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        uuid={uuid}
        bio={bio}
        bannerUrl={bannerUrl}
        recentBanners={recentBanners}
        visibility={visibility}
        onChange={(patch) => {
          if (patch.bio !== undefined) setBio(patch.bio);
          if (patch.bannerUrl !== undefined) setBannerUrl(patch.bannerUrl);
          if (patch.recentBanners !== undefined) setRecentBanners(patch.recentBanners);
          if (patch.visibility !== undefined) setVisibility(patch.visibility);
        }}
        previewStats={renderStats}
        customize={{
          uuid,
          username,
          skinUrl: skin.fullDataUrl,
          skinVariant: skin.variant,
          avatarDecoration,
          frame,
          frameColor,
          frameOnCharacter,
          hideInstances,
          hideFavorites,
          onChange: (patch) => {
            if (patch.avatarDecoration !== undefined) setAvatarDecoration(patch.avatarDecoration);
            if (patch.frame !== undefined) setFrame(patch.frame);
            if (patch.frameColor !== undefined) setFrameColor(patch.frameColor);
            if (patch.frameOnCharacter !== undefined) setFrameOnCharacter(patch.frameOnCharacter);
            if (patch.hideInstances !== undefined) setHideInstances(patch.hideInstances);
            if (patch.hideFavorites !== undefined) setHideFavorites(patch.hideFavorites);
          },
        }}
      />
    </>
  );
}

/** Your own profile, compacted to fit the account menu next to your character
 *  (which doubles as the profile's avatar there): the profile card on top and
 *  your instances / favorites below. EXPERIMENTAL — lives beside the full
 *  /profile page (pages/profile.tsx); that page is still reachable from "Ver
 *  perfil completo" in the card's ⋮ menu. */
export function ProfileMenuPanel({ uuid, username, onNavigate }: ProfileMenuPanelProps) {
  const { modpacks } = useModpacks();
  const { instances } = useCustomInstances();
  const [tab, setTab] = useState<Tab>("online");
  const onlineInstances = modpacks.filter((mp) => mp.installed);
  const favorites = getFavorites();

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <ProfileBannerCard uuid={uuid} username={username} onNavigate={onNavigate} />

      <div className="flex items-center gap-1 p-0.5 rounded-md bg-white/[0.07] border border-transparent shrink-0">
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
        {tab === "favorites" ? (
          favorites.length === 0 ? (
            <Empty text="Aún no has marcado nada como favorito." />
          ) : (
            favorites.map((f) => (
              <a
                key={f.projectId}
                href={`https://modrinth.com/${FAV_PATH[f.category]}/${f.projectId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-md border border-transparent bg-white/[0.07] px-2 py-1.5 hover:bg-white/[0.14] transition-colors"
              >
                <Thumb url={f.iconUrl} fallback={f.title} />
                <span className="flex-1 min-w-0 truncate text-xs font-semibold text-gray-100">{f.title}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </a>
            ))
          )
        ) : (() => {
          const items = tab === "online" ? onlineInstances : instances;
          if (items.length === 0) {
            return (
              <Empty
                text={tab === "online" ? "No tienes ninguna instancia online instalada." : "No tienes ninguna instancia privada."}
              />
            );
          }
          return items.map((pack) => (
            <InstanceRow key={pack.id} pack={pack} onOpen={() => onNavigate(`/modpack/${pack.id}`)} />
          ));
        })()}
      </div>
    </div>
  );
}

function Thumb({ url, fallback }: { url?: string | null; fallback: string }) {
  return (
    <div className="h-7 w-7 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-[10px] font-black text-accent/60 shrink-0">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : fallback.charAt(0)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{text}</p>;
}

function InstanceRow({ pack, onOpen }: { pack: Modpack; onOpen: () => void }) {
  const { busy, running, toggle } = useLaunchModpack(pack);
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-transparent bg-white/[0.07] px-2 py-1.5 hover:bg-white/[0.14] transition-colors">
      <button type="button" onClick={onOpen} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
        <Thumb url={pack.imageUrl} fallback={pack.name} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-100 truncate">{pack.name}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {pack.minecraftVersion} · <span className="uppercase">{pack.loaderType}</span>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={running ? "Cerrar Minecraft" : "Jugar"}
        aria-label={running ? "Cerrar Minecraft" : "Jugar"}
        className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-full disabled:opacity-60 transition-colors ${
            running ? "bg-red-600 text-white hover:bg-red-500" : "bg-accent text-accent-foreground hover:bg-accent/90"
          }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : running ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
      </button>
    </div>
  );
}
