import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowUpDown, Loader2, Package, Sparkles, Image as ImageIcon, FileQuestion } from "lucide-react";
import { SnapshotEntry, fetchSnapshot } from "@/services/github";
import { identifyModrinthFiles, type ModrinthMatch } from "@/services/modrinth";
import { getGithubRepo } from "@/lib/app-config";
import { formatBytes } from "@/lib/format";

type Category = "mods" | "shaderpacks" | "resourcepacks";

const CATEGORY_META: Record<Category, { label: string; icon: typeof Package }> = {
  mods: { label: "Mods", icon: Package },
  shaderpacks: { label: "Shaders", icon: Sparkles },
  resourcepacks: { label: "Resource Packs", icon: ImageIcon },
};

function categorize(files: SnapshotEntry[]): Record<Category, SnapshotEntry[]> {
  const out: Record<Category, SnapshotEntry[]> = { mods: [], shaderpacks: [], resourcepacks: [] };
  for (const f of files) {
    const top = f.path.split("/")[0]?.toLowerCase();
    if (top === "mods") out.mods.push(f);
    else if (top === "shaderpacks" || top === "shaders") out.shaderpacks.push(f);
    else if (top === "resourcepacks") out.resourcepacks.push(f);
  }
  return out;
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

export default function ModpackDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const pack = modpacks.find((p) => p.id === id);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<Record<Category, SnapshotEntry[]> | null>(null);
  const [modrinthMatches, setModrinthMatches] = useState<Map<string, ModrinthMatch>>(new Map());
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (modpacks.length === 0) loadModpacks();
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setModrinthMatches(new Map());
    const repoUrl = getGithubRepo();
    const token = localStorage.getItem("githubToken") || undefined;
    fetchSnapshot(repoUrl, id, token)
      .then((manifest) => {
        setContent(manifest ? categorize(manifest.files) : { mods: [], shaderpacks: [], resourcepacks: [] });
        if (manifest) identifyModrinthFiles(manifest.files).then(setModrinthMatches);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (!pack) {
    return (
      <div className="min-h-full bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Modpack no encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  const categories = (Object.keys(CATEGORY_META) as Category[]).filter(
    (c) => (content?.[c]?.length ?? 0) > 0
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="relative h-32 md:h-40 bg-black/50 overflow-hidden">
        {pack.bannerUrl || pack.imageUrl ? (
          <img src={pack.bannerUrl || pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/20 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto w-full">
        <div className="px-8 -mt-8 relative z-10">
          <div className="flex items-end gap-4">
            <div className="h-20 w-20 rounded-2xl border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl">
              {pack.imageUrl ? (
                <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-black text-accent/60">
                  {pack.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="pb-1 min-w-0">
              <h2 className="text-2xl font-bold text-white drop-shadow-md truncate">{pack.name}</h2>
            </div>
          </div>
        </div>

        <div className="px-8 pt-4 pb-8 space-y-4">
          <p className="text-base text-gray-300 max-w-3xl">{pack.description}</p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="uppercase">{pack.loaderType}</Badge>
            <Badge variant="secondary">MC {pack.minecraftVersion}</Badge>
            <Badge variant="secondary">Pack v{pack.version}</Badge>
            <Badge variant="outline">{pack.fileCount} archivos · {pack.totalSizeMb} MB</Badge>
          </div>

          <div className="pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando contenido...
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileQuestion className="h-6 w-6" />
                <p className="text-sm">Sin manifiesto publicado todavía.</p>
              </div>
            ) : (
              <Tabs defaultValue={categories[0]}>
                <TabsList className="bg-card/50 border border-white/5">
                  {categories.map((c) => {
                    const Icon = CATEGORY_META[c].icon;
                    return (
                      <TabsTrigger
                        key={c}
                        value={c}
                        className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {CATEGORY_META[c].label}
                        <span className="opacity-60">({content![c].length})</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {categories.map((c) => (
                  <TabsContent key={c} value={c} className="mt-4">
                    <button
                      onClick={() => setSortAsc((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-white transition-colors"
                    >
                      Nombre
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <div className="flex flex-col gap-1.5">
                      {content![c]
                        .slice()
                        .sort((a, b) => {
                          const cmp = (modrinthMatches.get(a.path)?.title ?? fileName(a.path)).localeCompare(
                            modrinthMatches.get(b.path)?.title ?? fileName(b.path)
                          );
                          return sortAsc ? cmp : -cmp;
                        })
                        .map((f) => {
                          const match = modrinthMatches.get(f.path);
                          const CategoryIcon = CATEGORY_META[c].icon;
                          return (
                            <div
                              key={f.path}
                              className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 border border-white/5 rounded-md w-full"
                            >
                              {match ? (
                                <>
                                  {match.iconUrl ? (
                                    <img src={match.iconUrl} alt="" className="h-7 w-7 rounded shrink-0 object-cover bg-black/30" />
                                  ) : (
                                    <div className="h-7 w-7 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                      <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-gray-100 font-medium truncate">{match.title}</p>
                                    <p className="text-muted-foreground text-[11px] font-mono truncate">{fileName(f.path)}</p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className="font-mono text-gray-200 truncate flex-1">{fileName(f.path)}</span>
                                  <span className="text-muted-foreground shrink-0 tabular-nums">{formatBytes(f.size)}</span>
                                </>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
