import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Package, Sparkles, Image as ImageIcon, FileQuestion } from "lucide-react";
import { SnapshotEntry, fetchSnapshot } from "@/services/github";
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

  useEffect(() => {
    if (modpacks.length === 0) loadModpacks();
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const repoUrl = getGithubRepo();
    const token = localStorage.getItem("githubToken") || undefined;
    fetchSnapshot(repoUrl, id, token)
      .then((manifest) => setContent(manifest ? categorize(manifest.files) : { mods: [], shaderpacks: [], resourcepacks: [] }))
      .finally(() => setLoading(false));
  }, [id]);

  if (!pack) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4">
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/5 bg-card/50 backdrop-blur flex items-center px-6 sticky top-0 z-50 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-white truncate">{pack.name}</h1>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full">
        <div className="relative h-64 md:h-80 bg-black/50 overflow-hidden">
          {pack.imageUrl ? (
            <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        </div>

        <div className="px-8 -mt-14 relative z-10">
          <div className="flex items-end gap-5">
            <div className="h-28 w-28 rounded-2xl border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl">
              {pack.imageUrl ? (
                <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-accent/60">
                  {pack.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="pb-2 min-w-0">
              <h2 className="text-3xl font-bold text-white drop-shadow-md truncate">{pack.name}</h2>
            </div>
          </div>
        </div>

        <div className="px-8 pt-6 pb-12 space-y-6">
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
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {content![c]
                        .slice()
                        .sort((a, b) => a.path.localeCompare(b.path))
                        .map((f) => (
                          <div
                            key={f.path}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs bg-card/50 border border-white/5 rounded-md"
                          >
                            <span className="font-mono text-gray-200 truncate">{fileName(f.path)}</span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">{formatBytes(f.size)}</span>
                          </div>
                        ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
