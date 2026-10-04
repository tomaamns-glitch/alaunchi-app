import { useEffect, useState } from "react";
import { Clock, ExternalLink, Gamepad2, Heart, Loader2, LogOut, MoreVertical, Palette, Pencil, Play, Square } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceFolders } from "@/hooks/use-instance-folders";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useShowcaseSkin } from "@/hooks/use-showcase-skin";
import { ProfileFrame } from "@/components/profile-frame";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";
import { ProfileCustomizeDialog } from "@/components/profile-customize-dialog";
import { getInstalledModpacksMeta } from "@/services/electron";
import { getFavorites, type FavoriteCategory } from "@/services/favorites";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import { useDevBannerOverride } from "@/lib/dev-banner-override";
import { getProfileCustomization, publishProfile, type ProfileVisibility } from "@/services/public-profile";
import { buildInstanceRecipe } from "@/lib/instance-recipe";
import { formatPlaytime } from "@/lib/format";
import type { Modpack } from "@/services/github";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

interface ProfileMenuPanelProps {
  uuid: string;
  username: string;
  /** Navigates somewhere, closing the account menu. */
  onNavigate: (path: string) => void;
}

/** Your own profile, compacted to fit the account menu next to your character
 *  (which doubles as the profile's avatar there). EXPERIMENTAL — lives beside
 *  the full /profile page (pages/profile.tsx) while we try it out; that page is
 *  still reachable from "Ver perfil completo" in the ⋮ menu. Like the
 *  page, it republishes the public half of the profile whenever it's shown. */
export function ProfileMenuPanel({ uuid, username, onNavigate }: ProfileMenuPanelProps) {
  const { logout } = useAuth();
  const { modpacks, loadModpacks } = useModpacks();
  const { instances, loadInstances } = useCustomInstances();
  const { pinned } = useInstanceFolders();
  const skin = useShowcaseSkin(username);
  const devBannerVideo = useDevBannerOverride((s) => s.videoUrl);

  const [tab, setTab] = useState<Tab>("online");
  const [totalPlaytimeMs, setTotalPlaytimeMs] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibility, setVisibility] = useState<ProfileVisibility>("everyone");
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [recentBanners, setRecentBanners] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [avatarDecoration, setAvatarDecoration] = useState("none");
  const [frame, setFrame] = useState("none");

  useEffect(() => {
    // Only if nobody has tried yet: Inicio swaps its whole screen (footer and
    // this menu included) for a spinner while the catalog loads, so reloading
    // it from here — e.g. after it failed — would unmount the menu we're in.
    const { modpacks: loaded, loading, error } = useModpacks.getState();
    if (loaded.length === 0 && !loading && !error) loadModpacks();
    loadInstances();
    getInstalledModpacksMeta()
      .then((meta) => {
        const total = Object.values(meta).reduce((sum: number, m: any) => sum + (m?.totalPlaytimeMs || 0), 0);
        setTotalPlaytimeMs(total);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getProfileCustomization(uuid)
      .then((c) => {
        setVisibility(c.visibility);
        setBannerUrl(c.bannerUrl);
        setRecentBanners(c.recentBanners);
        setBio(c.bio);
        setAvatarDecoration(c.avatarDecoration);
        setFrame(c.frame);
      })
      .catch(() => {});
  }, [uuid]);

  const onlineInstances = modpacks.filter((mp) => mp.installed);
  const starredPrivateInstances = instances.filter((i) => pinned.includes(i.id));

  // Same republish as pages/profile.tsx — see the comment there.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        privateInstances,
      }).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, username, totalPlaytimeMs, onlineInstances.length, starredPrivateInstances.length]);

  const favorites = getFavorites();

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <ProfileFrame frame={frame}>
        <div className="relative rounded-xl border border-white/10 overflow-hidden shrink-0">
          <div className="absolute inset-0">
            {devBannerVideo ? (
              <video src={devBannerVideo} autoPlay loop muted playsInline className="w-full h-full object-cover" />
            ) : (
              <img src={bannerUrl || DEFAULT_PROFILE_BANNER} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/20" />
          </div>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-sm text-gray-200 hover:bg-black/70 hover:text-white transition-colors"
                aria-label="Opciones del perfil"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[60]">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCustomizeOpen(true)}>
                <Palette className="mr-2 h-4 w-4" />
                Decoraciones
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

          <div className="relative px-3.5 pt-3 pb-2.5">
            <div className="pr-8 min-w-0">
              <h2 className="text-lg font-bold leading-tight truncate">{username}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 min-h-[1rem]">
                {bio || <span className="italic opacity-70">Sin descripción</span>}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3.5 text-[11px] text-gray-300">
              <MiniStat icon={Clock} value={formatPlaytime(totalPlaytimeMs)} title="Tiempo jugado" />
              <MiniStat icon={Gamepad2} value={String(onlineInstances.length + instances.length)} title="Instancias" />
              <MiniStat icon={Heart} value={String(favorites.length)} title="Favoritas" />
            </div>
          </div>
        </div>
      </ProfileFrame>

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
                className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.07] hover:border-white/10 transition-colors"
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
      />
      <ProfileCustomizeDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        uuid={uuid}
        username={username}
        skinUrl={skin.fullDataUrl}
        skinVariant={skin.variant}
        avatarDecoration={avatarDecoration}
        frame={frame}
        onChange={(patch) => {
          if (patch.avatarDecoration !== undefined) setAvatarDecoration(patch.avatarDecoration);
          if (patch.frame !== undefined) setFrame(patch.frame);
        }}
      />
    </div>
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
    <div className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.07] hover:border-white/10 transition-colors">
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
