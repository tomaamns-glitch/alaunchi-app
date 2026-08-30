import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Boxes, Clock, Download, Gamepad2, Heart, Home as HomeIcon, Loader2, Lock, Play, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { SkinViewer3D } from "@/components/skin-viewer-3d";
import { useShowcaseSkin } from "@/hooks/use-showcase-skin";
import { subscribeProfile, type PublicProfileSnapshot, type PublicInstanceSummary } from "@/services/public-profile";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import { areFriends, sendFriendRequest, subscribeSentRequests } from "@/services/friends";
import { InstallFavoriteDialog } from "@/components/install-favorite-dialog";
import { installOnlineInstance } from "@/lib/install-online-instance";
import { installFromRecipe, type RecipeInstallResult } from "@/lib/instance-recipe";
import { formatPlaytime } from "@/lib/format";
import { toast } from "sonner";
import type { Modpack } from "@/services/github";
import type { FavoriteEntry } from "@/services/favorites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

/** A catalog modpack the viewer ALSO has installed — reuses the viewer's own
 *  real Modpack object (and thus their own real launch flow) rather than
 *  needing any install-on-behalf-of logic here. If the viewer doesn't have it
 *  yet, that's the "instalar desde el perfil de otro" piece for later. */
function OwnedOnlineCard({ pack, onOpen }: { pack: Modpack; onOpen: () => void }) {
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

/** A catalog modpack the viewer doesn't have yet — same install path as the
 *  home carousel's own "Instalar" button (installOnlineInstance). */
function UninstalledOnlineCard({ pack }: { pack: Modpack }) {
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const cover = pack.bannerUrl || pack.imageUrl;

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
    <div className="rounded-xl border border-white/10 bg-card/40 overflow-hidden">
      <div className="relative h-20 bg-black/50">
        {cover && <img src={cover} alt="" className="w-full h-full object-cover opacity-40" />}
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
        </div>
      </div>
      <div className="px-4 pb-4">
        <Button
          size="sm"
          variant="outline"
          className="w-full rounded-full font-bold"
          onClick={handleInstall}
          disabled={installing || done}
        >
          {installing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {done ? "Instalado" : "Instalar"}
        </Button>
      </div>
    </div>
  );
}

function PrivateInstanceCard({ instance }: { instance: PublicInstanceSummary }) {
  const [state, setState] = useState<"idle" | "installing" | "done" | "error">("idle");
  const [result, setResult] = useState<RecipeInstallResult | null>(null);
  const contentCount = instance.recipe?.length ?? 0;

  const handleDownload = async () => {
    setState("installing");
    try {
      const r = await installFromRecipe(instance.name, instance);
      setResult(r);
      setState("done");
      toast.success(`${instance.name} creada — ${r.installedCount} de ${contentCount} elementos instalados.`);
    } catch (e: any) {
      setState("error");
      toast.error(e?.message || "No se pudo crear la instancia.");
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 overflow-hidden">
      <div className="relative h-20 bg-black/50 flex items-center justify-center">
        {instance.imageUrl ? (
          <img src={instance.imageUrl} alt="" className="w-full h-full object-cover opacity-50" />
        ) : (
          <Boxes className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="px-4 pt-3 pb-4">
        <div className="font-semibold text-sm truncate">{instance.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Badge variant="secondary" className="text-[10px]">{instance.minecraftVersion}</Badge>
          <Badge variant="secondary" className="text-[10px] uppercase">{instance.loaderType}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {contentCount} elemento{contentCount === 1 ? "" : "s"} para descargar
          {!!instance.unresolvedCount && ` · ${instance.unresolvedCount} no incluible${instance.unresolvedCount === 1 ? "" : "s"}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full rounded-full font-bold mt-2"
          onClick={handleDownload}
          disabled={state === "installing" || state === "done"}
        >
          {state === "installing" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {state === "done" ? `Creada (${result?.installedCount}/${contentCount})` : "Descargar"}
        </Button>
      </div>
    </div>
  );
}

export default function PublicProfile() {
  const params = useParams<{ uuid: string }>();
  const targetUuid = params.uuid;
  const { isAuthenticated, uuid: myUuid, username: myUsername } = useAuth();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const [profile, setProfile] = useState<PublicProfileSnapshot | null | undefined>(undefined);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [sentRequest, setSentRequest] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (targetUuid && myUuid && targetUuid === myUuid) setLocation("/profile");
  }, [targetUuid, myUuid, setLocation]);

  useEffect(() => {
    if (modpacks.length === 0) loadModpacks();
  }, [modpacks.length, loadModpacks]);

  useEffect(() => {
    if (!targetUuid) return;
    return subscribeProfile(targetUuid, setProfile);
  }, [targetUuid]);

  useEffect(() => {
    if (!myUuid || !targetUuid) return;
    return subscribeSentRequests(myUuid, (requests) => setSentRequest(!!requests[targetUuid]));
  }, [myUuid, targetUuid]);

  useEffect(() => {
    if (!myUuid || !targetUuid || !profile) return;
    if (profile.visibility !== "friends") {
      setAuthorized(true);
      return;
    }
    areFriends(myUuid, targetUuid).then(setAuthorized).catch(() => setAuthorized(false));
  }, [myUuid, targetUuid, profile]);

  if (!isAuthenticated || !targetUuid || !myUuid || !myUsername) return null;

  if (profile === undefined || (profile?.visibility === "friends" && authorized === null)) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Este jugador todavía no tiene un perfil que mostrar.</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-bold">{profile.username}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Este perfil solo es visible para sus amigos.
        </p>
        <Button
          size="sm"
          disabled={sentRequest || sending}
          onClick={async () => {
            setSending(true);
            try {
              await sendFriendRequest(myUuid, myUsername, targetUuid, profile.username);
              setSentRequest(true);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {sentRequest ? "Solicitud enviada" : "Añadir amigo"}
        </Button>
      </div>
    );
  }

  const totalInstances = profile.onlineInstanceIds.length + profile.privateInstances.length;

  return (
    <ProfileContent
      profile={profile}
      modpacks={modpacks}
      totalInstances={totalInstances}
      onOpenOnline={(id) => setLocation(`/modpack/${id}`)}
    />
  );
}

function ProfileContent({
  profile,
  modpacks,
  totalInstances,
  onOpenOnline,
}: {
  profile: PublicProfileSnapshot;
  modpacks: Modpack[];
  totalInstances: number;
  onOpenOnline: (id: string) => void;
}) {
  const skin = useShowcaseSkin(profile.username);
  const modpackById = new Map(modpacks.map((mp) => [mp.id, mp]));
  const [installFavorite, setInstallFavorite] = useState<FavoriteEntry | null>(null);

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl w-full mx-auto space-y-6">
          <div className="relative rounded-xl border border-white/10 bg-card/40 overflow-hidden">
            <div className="absolute inset-0">
              <img src={profile.bannerUrl || DEFAULT_PROFILE_BANNER} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/25" />
            </div>
            <div className="relative p-5 flex items-start gap-5">
              <div
                className="rounded-lg border border-white/10 bg-black/40 overflow-hidden shrink-0"
                style={{ width: 100, height: 145 }}
              >
                {skin.fullDataUrl && <SkinViewer3D skinUrl={skin.fullDataUrl} variant={skin.variant} width={100} height={145} />}
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold truncate">{profile.username}</h2>
                  <p className="text-sm text-muted-foreground">Jugador</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-3 border-t border-white/5">
                  <Stat icon={<Clock className="h-4 w-4" />} value={formatPlaytime(profile.totalPlaytimeMs)} label="Tiempo jugado" />
                  <Stat icon={<Gamepad2 className="h-4 w-4" />} value={String(totalInstances)} label="Instancias" />
                  <Stat icon={<Heart className="h-4 w-4" />} value={String(profile.favorites?.length ?? 0)} label="Favoritas" />
                </div>
              </div>
            </div>
          </div>

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
              {profile.onlineInstanceIds.length === 0 ? (
                <p className="text-sm text-muted-foreground py-14 text-center">No tiene ninguna instancia online instalada.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-5">
                  {profile.onlineInstanceIds.map((id) => {
                    const pack = modpackById.get(id);
                    if (!pack) {
                      return (
                        <div
                          key={id}
                          className="rounded-xl border border-white/10 bg-card/20 overflow-hidden p-4 flex flex-col items-center justify-center gap-1.5 text-center h-[9.5rem]"
                        >
                          <HomeIcon className="h-5 w-5 text-muted-foreground" />
                          <p className="text-[10px] text-muted-foreground">No disponible en tu catálogo</p>
                        </div>
                      );
                    }
                    return pack.installed ? (
                      <OwnedOnlineCard key={id} pack={pack} onOpen={() => onOpenOnline(id)} />
                    ) : (
                      <UninstalledOnlineCard key={id} pack={pack} />
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="private">
              {profile.privateInstances.length === 0 ? (
                <p className="text-sm text-muted-foreground py-14 text-center">No tiene ninguna instancia privada destacada.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-5">
                  {profile.privateInstances.map((i) => (
                    <PrivateInstanceCard key={i.id} instance={i} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="favorites">
              {!profile.favorites || profile.favorites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-14 text-center">Aún no ha marcado ningún favorito.</p>
              ) : (
                <div className="flex flex-wrap gap-2.5 pt-4">
                  {profile.favorites.map((f) => (
                    <div
                      key={f.projectId}
                      className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/50 pl-1.5 pr-2 py-1.5"
                    >
                      <a
                        href={`https://modrinth.com/${f.category === "mods" ? "mod" : f.category === "shaderpacks" ? "shader" : "resourcepack"}/${f.projectId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                      >
                        <div className="h-9 w-9 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-xs font-black text-accent/60 shrink-0">
                          {f.iconUrl ? <img src={f.iconUrl} alt="" className="h-full w-full object-cover" /> : f.title.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold text-gray-100 truncate max-w-[140px]">{f.title}</span>
                      </a>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-gray-400 hover:text-accent"
                        aria-label={`Instalar ${f.title}`}
                        onClick={() => setInstallFavorite(f)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <InstallFavoriteDialog favorite={installFavorite} onOpenChange={(open) => !open && setInstallFavorite(null)} />
    </div>
  );
}
