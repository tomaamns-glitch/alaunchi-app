import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowDownCircle,
  X,
  Loader2,
  Package,
  Sparkles,
  Image as ImageIcon,
  FileQuestion,
  CheckSquare,
} from "lucide-react";
import { SnapshotEntry, fetchSnapshot } from "@/services/github";
import {
  identifyModrinthFiles,
  getLatestVersion,
  type ModrinthMatch,
  type ModrinthUpdate,
} from "@/services/modrinth";
import { listInstanceFiles, deleteInstanceFile, updateInstanceFile, type InstanceFile } from "@/services/electron";
import { getGithubRepo } from "@/lib/app-config";
import { toast } from "sonner";

type Category = "mods" | "shaderpacks" | "resourcepacks";

const CATEGORY_META: Record<Category, { label: string; icon: typeof Package }> = {
  mods: { label: "Mods", icon: Package },
  shaderpacks: { label: "Shaders", icon: Sparkles },
  resourcepacks: { label: "Resource Packs", icon: ImageIcon },
};

function categoryOf(path: string): Category | null {
  const top = path.split("/")[0]?.toLowerCase();
  if (top === "mods") return "mods";
  if (top === "shaderpacks" || top === "shaders") return "shaderpacks";
  if (top === "resourcepacks") return "resourcepacks";
  return null;
}

function categorize<T extends { path: string }>(files: T[]): Record<Category, T[]> {
  const out: Record<Category, T[]> = { mods: [], shaderpacks: [], resourcepacks: [] };
  for (const f of files) {
    const cat = categoryOf(f.path);
    if (cat) out[cat].push(f);
  }
  return out;
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

/** Best-effort mod name from a filename: everything before the first "-" or "_", capitalized. */
function guessTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const stop = base.search(/[-_]/);
  const raw = (stop === -1 ? base : base.slice(0, stop)).trim();
  if (!raw) return filename;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

interface ContentRow {
  path: string;
  mandatory: boolean;
}

const EMPTY_CATEGORIES: Record<Category, any[]> = { mods: [], shaderpacks: [], resourcepacks: [] };

export default function ModpackDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const pack = modpacks.find((p) => p.id === id);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<Record<Category, SnapshotEntry[]> | null>(null);
  const [optionalContent, setOptionalContent] = useState<Record<Category, InstanceFile[]>>(EMPTY_CATEGORIES);
  const [modrinthMatches, setModrinthMatches] = useState<Map<string, ModrinthMatch>>(new Map());
  const [updates, setUpdates] = useState<Map<string, ModrinthUpdate>>(new Map());
  const [sortAsc, setSortAsc] = useState(true);
  const [showInstalledFirst, setShowInstalledFirst] = useState(false);
  const [busyPaths, setBusyPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (modpacks.length === 0) loadModpacks();
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setModrinthMatches(new Map());
    setUpdates(new Map());
    setOptionalContent(EMPTY_CATEGORIES);

    (async () => {
      const repoUrl = getGithubRepo();
      const token = localStorage.getItem("githubToken") || undefined;
      const manifest = await fetchSnapshot(repoUrl, id, token);
      if (cancelled) return;
      const manifestFiles = manifest?.files ?? [];
      setContent(categorize(manifestFiles));

      let optionalFiles: InstanceFile[] = [];
      if (pack?.installed) {
        const localFiles = await listInstanceFiles(id);
        const mandatoryPaths = new Set(manifestFiles.map((f) => f.path));
        optionalFiles = localFiles.filter((f) => !mandatoryPaths.has(f.path));
        if (cancelled) return;
        setOptionalContent(categorize(optionalFiles));
      }

      const matches = await identifyModrinthFiles([...manifestFiles, ...optionalFiles]);
      if (cancelled) return;
      setModrinthMatches(matches);

      if (pack && optionalFiles.length > 0) {
        const updateEntries = new Map<string, ModrinthUpdate>();
        await Promise.all(
          optionalFiles.map(async (f) => {
            const match = matches.get(f.path);
            if (!match) return;
            const latest = await getLatestVersion(match.projectId, pack.loaderType, pack.minecraftVersion);
            if (latest && latest.versionId !== match.versionId) {
              updateEntries.set(f.path, latest);
            }
          })
        );
        if (!cancelled) setUpdates(updateEntries);
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, pack?.installed]);

  const handleDelete = async (c: Category, path: string) => {
    if (!pack) return;
    setBusyPaths((s) => new Set(s).add(path));
    try {
      await deleteInstanceFile(pack.id, path);
      setOptionalContent((prev) => ({ ...prev, [c]: prev[c].filter((f) => f.path !== path) }));
      toast.success(`${fileName(path)} eliminado.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar el archivo.");
    } finally {
      setBusyPaths((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
  };

  const handleUpdate = async (c: Category, path: string) => {
    if (!pack) return;
    const update = updates.get(path);
    if (!update) return;
    setBusyPaths((s) => new Set(s).add(path));
    try {
      const newPath = `${c}/${update.filename}`;
      await updateInstanceFile(pack.id, path, newPath, update.url, update.sha1);
      setOptionalContent((prev) => ({
        ...prev,
        [c]: prev[c].map((f) => (f.path === path ? { path: newPath, size: f.size, sha1: update.sha1 } : f)),
      }));
      setModrinthMatches((prev) => {
        const next = new Map(prev);
        const match = next.get(path);
        if (match) {
          next.delete(path);
          next.set(newPath, { ...match, versionId: update.versionId, versionNumber: update.versionNumber });
        }
        return next;
      });
      setUpdates((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      toast.success(`Actualizado a v${update.versionNumber}.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar.");
    } finally {
      setBusyPaths((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
  };

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
    (c) => (content?.[c]?.length ?? 0) > 0 || optionalContent[c].length > 0
  );

  const rowsFor = (c: Category): ContentRow[] => [
    ...(content?.[c] ?? []).map((f): ContentRow => ({ path: f.path, mandatory: true })),
    ...optionalContent[c].map((f): ContentRow => ({ path: f.path, mandatory: false })),
  ];

  const titleFor = (path: string) => modrinthMatches.get(path)?.title ?? guessTitle(fileName(path));

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
          <div className="inline-flex items-center gap-4 max-w-full bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-2xl p-4">
            <div className="h-20 w-20 rounded-2xl border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl">
              {pack.imageUrl ? (
                <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-black text-accent/60">
                  {pack.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <h2 className="text-2xl font-bold text-white truncate">{pack.name}</h2>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="uppercase">{pack.loaderType}</Badge>
                <Badge variant="secondary">MC {pack.minecraftVersion}</Badge>
                <Badge variant="secondary">Pack v{pack.version}</Badge>
                <Badge variant="outline">{pack.fileCount} archivos · {pack.totalSizeMb} MB</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 pt-4 pb-8 space-y-4">
          <p className="text-base text-gray-300 max-w-3xl">{pack.description}</p>

          <div className="mt-4 bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-2xl p-4">
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
                        <span className="opacity-60">({rowsFor(c).length})</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {categories.map((c) => (
                  <TabsContent key={c} value={c} className="mt-4">
                    <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-2xl p-3">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setSortAsc((v) => !v)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-white transition-colors"
                        >
                          Nombre
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setShowInstalledFirst((v) => !v)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                            showInstalledFirst
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-white"
                          }`}
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                          Instalados
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {rowsFor(c)
                          .sort((a, b) => {
                            if (showInstalledFirst) {
                              const rank = (r: ContentRow) => (r.mandatory ? 2 : updates.has(r.path) ? 0 : 1);
                              const rankDiff = rank(a) - rank(b);
                              if (rankDiff !== 0) return rankDiff;
                            }
                            const cmp = titleFor(a.path).localeCompare(titleFor(b.path));
                            return sortAsc ? cmp : -cmp;
                          })
                          .map((row) => {
                            const match = modrinthMatches.get(row.path);
                            const update = updates.get(row.path);
                            const busy = busyPaths.has(row.path);
                            const CategoryIcon = CATEGORY_META[c].icon;
                            return (
                              <div
                                key={row.path}
                                className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full"
                              >
                                {match?.iconUrl ? (
                                  <img src={match.iconUrl} alt="" className="h-11 w-11 rounded shrink-0 object-cover bg-black/30" />
                                ) : match ? (
                                  <div className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                    <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                ) : (
                                  <div className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                    <span className="text-xs font-bold text-muted-foreground">Ms</span>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-gray-100 font-medium text-sm truncate">{titleFor(row.path)}</p>
                                  <p className="text-muted-foreground text-[11px] font-mono truncate">{fileName(row.path)}</p>
                                </div>
                                {!row.mandatory && update && (
                                  <button
                                    onClick={() => handleUpdate(c, row.path)}
                                    disabled={busy}
                                    title={`Actualizar a v${update.versionNumber}`}
                                    className="h-7 w-7 flex items-center justify-center rounded-full text-accent hover:bg-accent/10 transition-colors shrink-0 disabled:opacity-50"
                                  >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownCircle className="h-4 w-4" />}
                                  </button>
                                )}
                                {!row.mandatory && (
                                  <button
                                    onClick={() => handleDelete(c, row.path)}
                                    disabled={busy}
                                    title="Eliminar"
                                    className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                      </div>
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
