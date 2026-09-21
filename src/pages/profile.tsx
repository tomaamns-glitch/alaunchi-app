import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Boxes,
  Clock,
  Gamepad2,
  Heart,
  Home as HomeIcon,
  ImagePlus,
  Loader2,
  LogOut,
  MoreVertical,
  Palette,
  Pencil,
  Play,
  Shirt,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceFolders } from "@/hooks/use-instance-folders";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { SkinViewerAnimated } from "@/components/skin-viewer-animated";
import { ProfileFrame } from "@/components/profile-frame";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";
import { ProfileCustomizeDialog } from "@/components/profile-customize-dialog";
import { SkinManagerPanel } from "@/components/skin-manager-panel";
import { useShowcaseSkin } from "@/hooks/use-showcase-skin";
import { getInstalledModpacksMeta } from "@/services/electron";
import { getFavorites, type FavoriteCategory } from "@/services/favorites";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import {
  getProfileCustomization,
  publishProfile,
  type ProfileVisibility,
} from "@/services/public-profile";
import { toSkinEffect } from "@/lib/decoration-catalog";
import { buildInstanceRecipe } from "@/lib/instance-recipe";
import { formatPlaytime } from "@/lib/format";
import type { Modpack } from "@/services/github";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-white">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

const tabTrigger =
  "rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-accent data-[state=active]:border-accent";

function InstanceCard({ pack, onOpen }: { pack: Modpack; onOpen: () => void }) {
  const { launching, launch } = useLaunchModpack(pack);
  const cover = pack.bannerUrl || pack.imageUrl;

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 overflow-hidden hover:border-accent/40 transition-colors">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative h-20 bg-black/50">
          {cover && <img src={cover} alt="" className="w-full h-full object-cover opacity-50" />}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          <div className="absolute -bottom-5 left-4 h-12 w-12 rounded-lg border-2 border-background bg-black/60 overflow-hidden shadow-lg flex items-center justify-center text-lg font-black text-accent/70">
            {pack.imageUrl ? <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" /> : pack.name.charAt(0)}
          </div>
        </div>
        <div className="pt-7 px-4 pb-3">
          <div className="font-semibold text-sm truncate">{pack.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="secondary" className="text-[10px]">{pack.minecraftVersion}</Badge>
            <Badge variant="secondary" className="text-[10px] uppercase">{pack.loaderType}</Badge>
            {pack.fileCount > 0 && <Badge variant="outline" className="text-[10px]">{pack.fileCount} archivos</Badge>}
          </div>
        </div>
      </button>
      <div className="px-4 pb-4">
        <Button size="sm" className="w-full rounded-full font-bold" onClick={launch} disabled={launching}>
          {launching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />}
          JUGAR
        </Button>
      </div>
    </div>
  );
}

function InstanceGrid({ items, emptyText }: { items: Modpack[]; emptyText: string }) {
  const [, setLocation] = useLocation();
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-14 text-center">{emptyText}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-5">
      {items.map((pack) => (
        <InstanceCard key={pack.id} pack={pack} onOpen={() => setLocation(`/modpack/${pack.id}`)} />
      ))}
    </div>
  );
}

const FAV_LABELS: Record<FavoriteCategory, string> = {
  mods: "Mods",
  shaderpacks: "Shaders",
  resourcepacks: "Texturas",
};

export default function Profile() {
  const { isAuthenticated, username, uuid, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();
  const { instances, loadInstances } = useCustomInstances();
  const { pinned } = useInstanceFolders();
  const skin = useShowcaseSkin(username ?? "");

  const [totalPlaytimeMs, setTotalPlaytimeMs] = useState(0);
  const [favFilter, setFavFilter] = useState<FavoriteCategory>("mods");
  const [skinDialogOpen, setSkinDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibility, setVisibility] = useState<ProfileVisibility>("everyone");
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [recentBanners, setRecentBanners] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [avatarDecoration, setAvatarDecoration] = useState("none");
  const [frame, setFrame] = useState("none");

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (modpacks.length === 0) loadModpacks();
    loadInstances();
    // Total playtime = sum across every instance's own tracked total (each
    // alaunchi-meta.json accrues its own via creditPlaytimeAndClearSession in
    // main.js) — the only place that number exists is per-instance, so this
    // page is what actually adds them all up.
    getInstalledModpacksMeta()
      .then((meta) => {
        const total = Object.values(meta).reduce((sum: number, m: any) => sum + (m?.totalPlaytimeMs || 0), 0);
        setTotalPlaytimeMs(total);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!uuid) return;
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
  // Private instances only leave your machine if you starred them in the Hub
  // ("Destacar instancia") — same star, doubles as "share this on my profile".
  const starredPrivateInstances = instances.filter((i) => pinned.includes(i.id));

  // Republishes the public half of this profile every time the numbers above
  // change — this is the only reason a friend's client can show any of this
  // at all, since none of it lives anywhere but this machine otherwise. Each
  // starred private instance also gets its Modrinth-resolvable content list
  // computed here (buildInstanceRecipe) — that's the "recipe" a friend's
  // launcher can redownload from, never the files themselves.
  useEffect(() => {
    if (!uuid || !username) return;
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

  if (!isAuthenticated) return null;

  const totalInstances = onlineInstances.length + instances.length;
  const totalFavorites = getFavorites().length;
  const favorites = getFavorites(favFilter);

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl w-full mx-auto space-y-6">
          <ProfileFrame frame={frame}>
          <div className="relative rounded-xl border border-white/10 bg-card/40 overflow-hidden">
            <div className="absolute inset-0">
              <img src={bannerUrl || DEFAULT_PROFILE_BANNER} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/25" />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-black/50 backdrop-blur-sm text-gray-200 hover:bg-black/70 hover:text-white transition-colors"
                  aria-label="Opciones del perfil"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCustomizeOpen(true)}>
                  <Palette className="mr-2 h-4 w-4" />
                  Personalizar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSkinDialogOpen(true)}>
                  <Shirt className="mr-2 h-4 w-4" />
                  Cambiar skin
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    await logout();
                    setLocation("/login");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative p-5 flex items-stretch gap-5">
              <div className="shrink-0" style={{ width: 100, height: 145 }}>
                {skin.fullDataUrl && (
                  <SkinViewerAnimated
                    key={avatarDecoration}
                    skinUrl={skin.fullDataUrl}
                    variant={skin.variant}
                    width={100}
                    height={145}
                    effect={toSkinEffect(avatarDecoration)}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="min-w-0 pr-10">
                  <h2 className="text-2xl font-bold truncate">{username}</h2>
                  {bio && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{bio}</p>}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-x-8 gap-y-3 pt-3 border-t border-white/5">
                  <Stat icon={<Clock className="h-4 w-4" />} value={formatPlaytime(totalPlaytimeMs)} label="Tiempo jugado" />
                  <Stat icon={<Gamepad2 className="h-4 w-4" />} value={String(totalInstances)} label="Instancias" />
                  <Stat icon={<Heart className="h-4 w-4" />} value={String(totalFavorites)} label="Favoritas" />
                </div>
              </div>
            </div>
          </div>
          </ProfileFrame>

          <Tabs defaultValue="online">
            <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-white/10 bg-transparent p-0">
              <TabsTrigger value="online" className={tabTrigger}>
                <HomeIcon className="mr-1.5 h-3.5 w-3.5 inline" />
                Instancias online
              </TabsTrigger>
              <TabsTrigger value="private" className={tabTrigger}>
                <Boxes className="mr-1.5 h-3.5 w-3.5 inline" />
                Instancias privadas
              </TabsTrigger>
              <TabsTrigger value="favorites" className={tabTrigger}>
                <Heart className="mr-1.5 h-3.5 w-3.5 inline" />
                Favoritas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="online">
              <InstanceGrid items={onlineInstances} emptyText="No tienes ninguna instancia online instalada." />
            </TabsContent>

            <TabsContent value="private">
              <InstanceGrid items={instances} emptyText="No tienes ninguna instancia privada." />
            </TabsContent>

            <TabsContent value="favorites">
              <ToggleGroup
                type="single"
                value={favFilter}
                onValueChange={(v) => v && setFavFilter(v as FavoriteCategory)}
                className="justify-start pt-4"
              >
                {(Object.keys(FAV_LABELS) as FavoriteCategory[]).map((cat) => (
                  <ToggleGroupItem key={cat} value={cat} className="px-4 data-[state=on]:bg-accent/15 data-[state=on]:text-accent">
                    {FAV_LABELS[cat]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {favorites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-14 text-center">
                  Aún no has marcado ningún {FAV_LABELS[favFilter].toLowerCase()} como favorito.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2.5 pt-4">
                  {favorites.map((f) => (
                    <a
                      key={f.projectId}
                      href={`https://modrinth.com/${favFilter === "mods" ? "mod" : favFilter === "shaderpacks" ? "shader" : "resourcepack"}/${f.projectId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/50 pl-1.5 pr-3.5 py-1.5 hover:border-accent/50 hover:bg-card/80 hover:-translate-y-0.5 transition-all"
                    >
                      <div className="h-9 w-9 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-xs font-black text-accent/60 shrink-0">
                        {f.iconUrl ? <img src={f.iconUrl} alt="" className="h-full w-full object-cover" /> : f.title.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-gray-100 truncate max-w-[160px]">{f.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Dialog open={skinDialogOpen} onOpenChange={setSkinDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-accent" />
              Cambiar skin
            </DialogTitle>
          </DialogHeader>
          {uuid && <SkinManagerPanel uuid={uuid} username={username} />}
        </DialogContent>
      </Dialog>

      {uuid && (
        <>
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
            skinUrl={skin.fullDataUrl}
            skinVariant={skin.variant}
            avatarDecoration={avatarDecoration}
            frame={frame}
            onChange={(patch) => {
              if (patch.avatarDecoration !== undefined) setAvatarDecoration(patch.avatarDecoration);
              if (patch.frame !== undefined) setFrame(patch.frame);
            }}
          />
        </>
      )}
    </div>
  );
}
