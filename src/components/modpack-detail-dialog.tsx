import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Sparkles, Image as ImageIcon, FileQuestion } from "lucide-react";
import { Modpack, SnapshotEntry, fetchSnapshot } from "@/services/github";
import { getGithubRepo } from "@/lib/app-config";
import { formatBytes } from "@/lib/format";

interface ModpackDetailDialogProps {
  pack: Modpack | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function ModpackDetailDialog({ pack, open, onOpenChange }: ModpackDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<Record<Category, SnapshotEntry[]> | null>(null);

  useEffect(() => {
    if (!open || !pack) {
      setContent(null);
      return;
    }
    setLoading(true);
    const repoUrl = getGithubRepo();
    const token = localStorage.getItem("githubToken") || undefined;
    fetchSnapshot(repoUrl, pack.id, token)
      .then((manifest) => setContent(manifest ? categorize(manifest.files) : { mods: [], shaderpacks: [], resourcepacks: [] }))
      .finally(() => setLoading(false));
  }, [open, pack?.id]);

  if (!pack) return null;

  const categories = (Object.keys(CATEGORY_META) as Category[]).filter(
    (c) => (content?.[c]?.length ?? 0) > 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-white/10 text-white max-w-2xl p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-40 bg-black/50 overflow-hidden">
          {pack.imageUrl ? (
            <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        </div>

        <div className="px-6 -mt-10 relative z-10">
          <div className="flex items-end gap-4">
            <div className="h-20 w-20 rounded-xl border-2 border-card bg-black/70 overflow-hidden shrink-0 shadow-xl">
              {pack.imageUrl ? (
                <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-accent/60">
                  {pack.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="pb-1 min-w-0">
              <DialogHeader className="text-left space-y-0">
                <DialogTitle className="text-2xl font-bold text-white truncate">{pack.name}</DialogTitle>
              </DialogHeader>
            </div>
          </div>
        </div>

        <div className="px-6 pt-4 pb-6 space-y-4">
          <DialogDescription className="text-sm text-gray-300">
            {pack.description}
          </DialogDescription>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="uppercase">{pack.loaderType}</Badge>
            <Badge variant="secondary">MC {pack.minecraftVersion}</Badge>
            <Badge variant="secondary">Pack v{pack.version}</Badge>
            <Badge variant="outline">{pack.fileCount} archivos · {pack.totalSizeMb} MB</Badge>
          </div>

          <div className="pt-2">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando contenido...
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <FileQuestion className="h-6 w-6" />
                <p className="text-sm">Sin manifiesto publicado todavía.</p>
              </div>
            ) : (
              <Tabs defaultValue={categories[0]}>
                <TabsList className="bg-background/50 border border-white/5">
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
                  <TabsContent key={c} value={c} className="mt-3">
                    <div className="max-h-64 overflow-y-auto bg-black/20 border border-white/5 rounded-md divide-y divide-white/5">
                      {content![c]
                        .slice()
                        .sort((a, b) => a.path.localeCompare(b.path))
                        .map((f) => (
                          <div key={f.path} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
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
      </DialogContent>
    </Dialog>
  );
}
