import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { SkinViewer3D } from "@/components/skin-viewer-3d";
import { useShowcaseSkin } from "@/hooks/use-showcase-skin";
import { getInstalledModpacksMeta } from "@/services/electron";
import { getFavorites, type FavoriteCategory } from "@/services/favorites";
import { formatPlaytime } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function ChipGrid({
  items,
  emptyText,
}: {
  items: { key: string; iconUrl?: string; label: string; href?: string; onClick?: () => void }[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-6">{emptyText}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2 pt-4">
      {items.map((item) => {
        const inner = (
          <>
            <div className="h-6 w-6 rounded border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-[10px] font-black text-accent/60 shrink-0">
              {item.iconUrl ? <img src={item.iconUrl} alt="" className="h-full w-full object-cover" /> : item.label.charAt(0)}
            </div>
            <span className="text-xs font-medium text-gray-200 truncate max-w-[160px]">{item.label}</span>
          </>
        );
        const className =
          "flex items-center gap-2 rounded-md border border-white/10 bg-card/50 pl-1.5 pr-3 py-1.5 hover:border-accent/50 hover:bg-card/80 transition-colors";
        return item.href ? (
          <a key={item.key} href={item.href} target="_blank" rel="noreferrer" className={className}>
            {inner}
          </a>
        ) : (
          <button key={item.key} type="button" onClick={item.onClick} className={className}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

const FAV_LABELS: Record<FavoriteCategory, string> = {
  mods: "Mods",
  shaderpacks: "Shaders",
  resourcepacks: "Texturas",
};

export default function Profile() {
  const { isAuthenticated, username } = useAuth();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();
  const { instances, loadInstances } = useCustomInstances();
  const skin = useShowcaseSkin(username ?? "");

  const [totalPlaytimeMs, setTotalPlaytimeMs] = useState(0);
  const [favFilter, setFavFilter] = useState<FavoriteCategory>("mods");

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

  if (!isAuthenticated) return null;

  const onlineInstances = modpacks.filter((mp) => mp.installed);
  const favorites = getFavorites(favFilter);

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl w-full mx-auto space-y-8">
          <div className="flex items-center gap-6">
            <div className="rounded-md border border-white/10 bg-black/40 overflow-hidden shrink-0 flex items-center justify-center" style={{ width: 140, height: 200 }}>
              {skin.fullDataUrl && <SkinViewer3D skinUrl={skin.fullDataUrl} variant={skin.variant} width={140} height={200} />}
            </div>
            <div className="space-y-2 min-w-0">
              <h2 className="text-2xl font-bold truncate">{username}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                {formatPlaytime(totalPlaytimeMs)} en total
              </div>
            </div>
          </div>

          <Tabs defaultValue="online">
            <TabsList>
              <TabsTrigger value="online">Instancias online</TabsTrigger>
              <TabsTrigger value="private">Instancias privadas</TabsTrigger>
              <TabsTrigger value="favorites">Favoritas</TabsTrigger>
            </TabsList>

            <TabsContent value="online">
              <ChipGrid
                emptyText="No tienes ninguna instancia online instalada."
                items={onlineInstances.map((mp) => ({
                  key: mp.id,
                  iconUrl: mp.imageUrl,
                  label: mp.name,
                  onClick: () => setLocation(`/modpack/${mp.id}`),
                }))}
              />
            </TabsContent>

            <TabsContent value="private">
              <ChipGrid
                emptyText="No tienes ninguna instancia privada."
                items={instances.map((inst) => ({
                  key: inst.id,
                  iconUrl: inst.imageUrl,
                  label: inst.name,
                  onClick: () => setLocation(`/modpack/${inst.id}`),
                }))}
              />
            </TabsContent>

            <TabsContent value="favorites">
              <ToggleGroup
                type="single"
                value={favFilter}
                onValueChange={(v) => v && setFavFilter(v as FavoriteCategory)}
                className="justify-start pt-2"
              >
                {(Object.keys(FAV_LABELS) as FavoriteCategory[]).map((cat) => (
                  <ToggleGroupItem key={cat} value={cat} className="px-4">
                    {FAV_LABELS[cat]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ChipGrid
                emptyText={`Aún no has marcado ningún ${FAV_LABELS[favFilter].toLowerCase()} como favorito.`}
                items={favorites.map((f) => ({
                  key: f.projectId,
                  iconUrl: f.iconUrl,
                  label: f.title,
                  href: `https://modrinth.com/${favFilter === "mods" ? "mod" : favFilter === "shaderpacks" ? "shader" : "resourcepack"}/${f.projectId}`,
                }))}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
