import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Search,
  Swords,
  Wand2,
  Cpu,
  Map as MapIcon,
  Mountain,
  Users,
  Feather,
  Gauge,
  Package,
  ScrollText,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LoaderIcon } from "@/components/loader-icon";
import { ModrinthGlyph, ProjectIcon } from "@/components/admin-modrinth-browser";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchModpacks, listModpackVersions, type ModpackHit, type ModpackSearch, type ModpackVersion } from "@/services/modrinth";
import { installModrinthModpack, onModrinthInstallProgress, type ModrinthInstallProgress } from "@/services/electron";

// Modrinth's modpack categories, in Spanish.
const CATEGORIES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "adventure", label: "Aventura", icon: MapIcon },
  { id: "challenging", label: "Desafío", icon: Mountain },
  { id: "combat", label: "Combate", icon: Swords },
  { id: "kitchen-sink", label: "Todo incluido", icon: Package },
  { id: "lightweight", label: "Ligero", icon: Feather },
  { id: "magic", label: "Magia", icon: Wand2 },
  { id: "multiplayer", label: "Multijugador", icon: Users },
  { id: "optimization", label: "Optimización", icon: Gauge },
  { id: "quests", label: "Misiones", icon: ScrollText },
  { id: "technology", label: "Tecnología", icon: Cpu },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

const SORTS: { id: ModpackSearch["sort"]; label: string }[] = [
  { id: "downloads", label: "Más descargados" },
  { id: "relevance", label: "Relevancia" },
  { id: "follows", label: "Más seguidos" },
  { id: "newest", label: "Más nuevos" },
  { id: "updated", label: "Actualizados" },
];

const LOADERS: { id: ModpackSearch["loader"]; label: string }[] = [
  { id: null, label: "Cualquier loader" },
  { id: "fabric", label: "Fabric" },
  { id: "forge", label: "Forge" },
  { id: "neoforge", label: "NeoForge" },
];

const SUPPORTED_LOADERS = new Set(["fabric", "forge", "neoforge"]);

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")} k`;
  return String(n);
}

let releaseVersionsCache: string[] | null = null;
async function fetchReleaseVersions(): Promise<string[]> {
  if (releaseVersionsCache) return releaseVersionsCache;
  try {
    const res = await fetch("https://api.modrinth.com/v2/tag/game_version");
    const tags: { version: string; version_type: string; major: boolean }[] = await res.json();
    releaseVersionsCache = tags.filter((t) => t.version_type === "release").map((t) => t.version);
  } catch {
    releaseVersionsCache = [];
  }
  return releaseVersionsCache;
}

/** Turns a remote (webp/png) icon into a small PNG data URL for the instance meta. */
async function iconToDataUrl(url: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, 96, 96);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

/**
 * Hub → "Modrinth": browse Modrinth's public modpacks (search, categories,
 * loader / Minecraft version filters, sort) and install one as a private
 * instance (electron/main.js' modrinth:install-modpack does the .mrpack).
 */
export function ModrinthModpacksDialog({
  open,
  onOpenChange,
  onOpenInstance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenInstance: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [loader, setLoader] = useState<ModpackSearch["loader"]>(null);
  const [gameVersion, setGameVersion] = useState<string | null>(null);
  const [sort, setSort] = useState<ModpackSearch["sort"]>("downloads");
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [hits, setHits] = useState<ModpackHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ModpackHit | null>(null);
  const [installing, setInstalling] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (open) fetchReleaseVersions().then(setGameVersions);
  }, [open]);

  const run = async (offset: number) => {
    const my = ++token.current;
    setLoading(true);
    const effectiveSort = debounced && sort === "downloads" ? "relevance" : sort;
    const result = await searchModpacks({ query: debounced, categories, loader, gameVersion, sort: effectiveSort, offset });
    if (my !== token.current) return;
    setHits((prev) => (offset === 0 ? result.hits : [...prev, ...result.hits]));
    setTotal(result.total);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced, categories.join(","), loader, gameVersion, sort]);

  const toggleCategory = (id: string) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={(v) => !installing && onOpenChange(v)}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-6xl sm:max-w-6xl w-[95vw] h-[86vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-2">
          <DialogTitle className="text-white flex items-center gap-2">
            <ModrinthGlyph className="h-5 w-5 text-[#1bd96a]" />
            Modpacks de Modrinth
          </DialogTitle>
          <DialogDescription className="text-xs">
            {total > 0 ? `${total.toLocaleString()} modpacks` : "Modpacks públicos"} · se instalan como instancia privada.
          </DialogDescription>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar modpacks..."
                className="h-9 pl-8 bg-background/50 border-white/10"
              />
            </div>
            <FilterSelect value={sort} onChange={(v) => setSort(v as ModpackSearch["sort"])} options={SORTS.map((s) => ({ value: s.id, label: s.label }))} />
            <FilterSelect
              value={loader ?? ""}
              onChange={(v) => setLoader((v || null) as ModpackSearch["loader"])}
              options={LOADERS.map((l) => ({ value: l.id ?? "", label: l.label }))}
            />
            <FilterSelect
              value={gameVersion ?? ""}
              onChange={(v) => setGameVersion(v || null)}
              options={[{ value: "", label: "Cualquier versión" }, ...gameVersions.map((v) => ({ value: v, label: `Minecraft ${v}` }))]}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          {/* Categories */}
          <aside className="w-48 shrink-0 border-r border-white/5 p-3 space-y-1 overflow-y-auto">
            <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Categorías</p>
            {CATEGORIES.map((c) => {
              const active = categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs font-medium transition-colors",
                    active ? "bg-accent/15 text-accent" : "text-gray-300 hover:bg-white/5"
                  )}
                >
                  <c.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{c.label}</span>
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
            {categories.length > 0 && (
              <button
                type="button"
                onClick={() => setCategories([])}
                className="w-full px-2 pt-1 text-left text-[11px] text-muted-foreground hover:text-white transition-colors"
              >
                Quitar filtros
              </button>
            )}
          </aside>

          {/* Results / detail */}
          <div className="flex-1 min-w-0 min-h-0 relative">
            <AnimatePresence mode="wait" initial={false}>
              {selected ? (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.16 }}
                  className="absolute inset-0"
                >
                  <ModpackDetail
                    hit={selected}
                    preferredGameVersion={gameVersion}
                    preferredLoader={loader}
                    onBack={() => !installing && setSelected(null)}
                    onInstallingChange={setInstalling}
                    onOpenInstance={(id) => {
                      onOpenChange(false);
                      onOpenInstance(id);
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-0 overflow-y-auto p-3"
                >
                  {hits.length === 0 && loading ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : hits.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-20">No hay modpacks con esos filtros.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {hits.map((hit) => (
                          <button
                            key={hit.projectId}
                            type="button"
                            onClick={() => setSelected(hit)}
                            className="flex items-start gap-3 p-3 rounded-xl text-left border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/10 transition-colors"
                          >
                            <ProjectIcon url={hit.iconUrl} title={hit.title} className="h-14 w-14 rounded-lg" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-100 truncate">{hit.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">de {hit.author}</p>
                              <p className="mt-1 text-xs text-gray-300 line-clamp-2 leading-snug">{hit.description}</p>
                              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-0.5">
                                  <Download className="h-3 w-3" /> {formatCount(hit.downloads)}
                                </span>
                                <span className="flex items-center gap-0.5">
                                  <Heart className="h-3 w-3" /> {formatCount(hit.follows)}
                                </span>
                                {hit.loaders.filter((l) => SUPPORTED_LOADERS.has(l)).map((l) => (
                                  <LoaderIcon key={l} loader={l} className="h-3 w-3" />
                                ))}
                                {hit.categories.slice(0, 3).map((c) => (
                                  <span key={c} className="px-1.5 py-0.5 rounded-full bg-white/5">
                                    {CATEGORY_LABEL[c] ?? c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      {hits.length < total && (
                        <Button variant="ghost" className="w-full mt-2 text-xs text-muted-foreground" disabled={loading} onClick={() => run(hits.length)}>
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cargar más"}
                        </Button>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-white/10 bg-background/60 px-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent max-w-[11rem]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ModpackDetail({
  hit,
  preferredGameVersion,
  preferredLoader,
  onBack,
  onInstallingChange,
  onOpenInstance,
}: {
  hit: ModpackHit;
  preferredGameVersion: string | null;
  preferredLoader: string | null;
  onBack: () => void;
  onInstallingChange: (v: boolean) => void;
  onOpenInstance: (id: string) => void;
}) {
  const loadInstances = useCustomInstances((s) => s.loadInstances);
  const [versions, setVersions] = useState<ModpackVersion[] | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ModrinthInstallProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [installedId, setInstalledId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listModpackVersions(hit.projectId).then((v) => {
      if (cancelled) return;
      setVersions(v);
      const usable = v.filter(isSupported);
      const preferred =
        usable.find(
          (x) =>
            x.versionType === "release" &&
            (!preferredGameVersion || x.gameVersions.includes(preferredGameVersion)) &&
            (!preferredLoader || x.loaders.includes(preferredLoader))
        ) ??
        usable.find((x) => x.versionType === "release") ??
        usable[0];
      setVersionId(preferred?.versionId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [hit.projectId, preferredGameVersion, preferredLoader]);

  useEffect(() => onModrinthInstallProgress((p) => setProgress(p)), []);

  const version = versions?.find((v) => v.versionId === versionId) ?? null;
  const supported = version ? isSupported(version) : false;

  const install = async () => {
    if (!version) return;
    setBusy(true);
    onInstallingChange(true);
    setProgress(null);
    try {
      const iconDataUrl = await iconToDataUrl(hit.iconUrl);
      const meta = await installModrinthModpack({
        url: version.url,
        sha1: version.sha1,
        name: hit.title,
        iconDataUrl,
        projectId: hit.projectId,
        versionId: version.versionId,
        versionNumber: version.versionNumber,
      });
      await loadInstances();
      setInstalledId(meta.id);
      toast.success(`${hit.title} instalado como instancia privada.`);
    } catch (e: any) {
      toast.error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo instalar el modpack.");
    } finally {
      setBusy(false);
      onInstallingChange(false);
    }
  };

  const stageText = (p: ModrinthInstallProgress | null) => {
    if (!p) return "Preparando…";
    if (p.stage === "pack") return `Descargando el modpack${p.total ? ` · ${formatBytes(p.done)} / ${formatBytes(p.total)}` : ""}`;
    if (p.stage === "files") return `Descargando archivos · ${p.done} / ${p.total}${p.current ? ` · ${p.current}` : ""}`;
    return "Aplicando configuración…";
  };
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="relative shrink-0 overflow-hidden border-b border-white/5">
        {hit.gallery[0] && (
          <div className="absolute inset-0 opacity-30">
            <img src={hit.gallery[0]} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/30" />
          </div>
        )}
        <div className="relative px-5 py-4 flex items-start gap-4">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <ProjectIcon url={hit.iconUrl} title={hit.title} className="h-20 w-20 rounded-xl shadow-xl" />
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-white leading-tight">{hit.title}</h3>
            <p className="text-xs text-muted-foreground">
              de {hit.author} · {formatCount(hit.downloads)} descargas · actualizado hace{" "}
              {formatDistanceToNow(new Date(hit.dateModified), { locale: es })}
            </p>
            <p className="mt-1.5 text-sm text-gray-200 select-text">{hit.description}</p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {hit.categories.map((c) => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-200">
                  {CATEGORY_LABEL[c] ?? c}
                </span>
              ))}
              <a
                href={`https://modrinth.com/modpack/${hit.slug}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-white transition-colors"
              >
                Ver en Modrinth <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {hit.gallery.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {hit.gallery.slice(0, 8).map((g) => (
              <img key={g} src={g} alt="" className="h-28 rounded-lg object-cover shrink-0 border border-white/10" />
            ))}
          </div>
        )}

        <section className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Versión</p>
          {versions === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando versiones...
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-amber-400">Este modpack no tiene versiones instalables.</p>
          ) : (
            <select
              value={versionId ?? ""}
              onChange={(e) => setVersionId(e.target.value)}
              disabled={busy}
              className="w-full h-9 rounded-md border border-white/10 bg-background/60 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {v.versionNumber} · MC {v.gameVersions.join(", ")} · {v.loaders.join("/")}
                  {v.versionType !== "release" ? ` · ${v.versionType}` : ""}
                  {isSupported(v) ? "" : " (no compatible)"}
                </option>
              ))}
            </select>
          )}
          {version && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              {version.loaders.filter((l) => SUPPORTED_LOADERS.has(l)).map((l) => (
                <LoaderIcon key={l} loader={l} className="h-3 w-3" />
              ))}
              Minecraft {version.gameVersions.join(", ")} · {formatBytes(version.size)} el paquete (los mods se descargan aparte)
            </p>
          )}
          {version && !supported && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Esta versión usa Quilt, que ALaunchi no admite. Elige otra.
            </p>
          )}
        </section>

        {busy && (
          <div className="space-y-1.5">
            <Progress value={progress?.stage === "overrides" ? 100 : pct} className="h-2" />
            <p className="text-[11px] text-muted-foreground truncate font-mono">{stageText(progress)}</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-white/5 flex items-center justify-end gap-2 shrink-0">
        {installedId ? (
          <Button onClick={() => onOpenInstance(installedId)} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
            <Check className="mr-2 h-4 w-4" /> Abrir instancia
          </Button>
        ) : (
          <Button
            onClick={install}
            disabled={!version || !supported || busy}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {busy ? "Instalando..." : "Instalar como instancia"}
          </Button>
        )}
      </div>
    </div>
  );
}

function isSupported(v: ModpackVersion): boolean {
  return v.loaders.length === 0 || v.loaders.some((l) => SUPPORTED_LOADERS.has(l)) || v.loaders.includes("minecraft");
}
