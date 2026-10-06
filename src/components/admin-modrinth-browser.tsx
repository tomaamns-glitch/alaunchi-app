import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Download, Image as ImageIcon, Link2, Loader2, Package, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { searchProjects, listVersions, SEARCH_PAGE_SIZE, type ModrinthSearchHit, type ModrinthUpdate } from "@/services/modrinth";
import {
  downloadDependencies,
  downloadVersion,
  pickDefaultVersion,
  planMissingDependencies,
  type AdminContentCategory,
  type ModrinthDownload,
  type PackTarget,
  type PlannedDependency,
  versionLabel,
} from "@/lib/admin-modrinth";

/** What's already in the update for a Modrinth project (to show "ya incluido"
 *  and turn "Añadir" into "Cambiar a esta versión"). */
export interface PresentProject {
  versionId: string;
  versionNumber: string;
  path: string;
}

const CATEGORIES: { id: AdminContentCategory; label: string; icon: typeof Package }[] = [
  { id: "mods", label: "Mods", icon: Package },
  { id: "shaderpacks", label: "Shaders", icon: Sparkles },
  { id: "resourcepacks", label: "Texturas", icon: ImageIcon },
];

const VERSION_TYPE_LABEL: Record<ModrinthUpdate["versionType"], string> = {
  release: "Estable",
  beta: "Beta",
  alpha: "Alpha",
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")} k`;
  return String(n);
}

/**
 * "Añadir desde Modrinth" for the admin file manager: search compatible
 * content (this pack's loader + Minecraft version), pick a version, and hand
 * the downloaded files back to be staged — together with whatever required
 * dependencies the update doesn't have yet.
 */
export function AdminModrinthBrowser({
  open,
  onOpenChange,
  target,
  present,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PackTarget;
  present: Map<string, PresentProject>;
  onAdd: (downloads: ModrinthDownload[]) => void;
}) {
  const isVanilla = target.loader === "vanilla";
  const [category, setCategory] = useState<AdminContentCategory>(isVanilla ? "resourcepacks" : "mods");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<ModrinthSearchHit | null>(null);
  const searchToken = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const runSearch = async (offset: number) => {
    const token = ++searchToken.current;
    setSearching(true);
    const results = await searchProjects(
      category,
      debouncedQuery,
      target.loader,
      target.minecraftVersion,
      offset,
      SEARCH_PAGE_SIZE,
      debouncedQuery ? "relevance" : "downloads"
    );
    if (token !== searchToken.current) return;
    setHits((prev) => (offset === 0 ? results : [...prev, ...results]));
    setHasMore(results.length === SEARCH_PAGE_SIZE);
    setSearching(false);
  };

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    runSearch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, debouncedQuery, target.loader, target.minecraftVersion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-5xl sm:max-w-5xl w-[95vw] h-[82vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-white/5 shrink-0">
          <DialogTitle className="text-white flex items-center gap-2">
            <ModrinthGlyph className="h-5 w-5 text-[#1bd96a]" />
            Añadir desde Modrinth
          </DialogTitle>
          <DialogDescription className="text-xs">
            Solo se muestra contenido compatible con Minecraft {target.minecraftVersion}
            {isVanilla ? "" : ` y ${target.loader}`}. Lo que añadas se sube con la próxima actualización.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          {/* Search column */}
          <div className="w-[22rem] shrink-0 border-r border-white/5 flex flex-col min-h-0">
            <div className="p-3 space-y-2 shrink-0">
              <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/5">
                {CATEGORIES.map((c) => {
                  const disabled = isVanilla && c.id === "mods";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setCategory(c.id)}
                      title={disabled ? "Un modpack vanilla no lleva mods" : undefined}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                        category === c.id ? "bg-accent text-accent-foreground" : "text-gray-300 hover:bg-white/5"
                      )}
                    >
                      <c.icon className="h-3.5 w-3.5" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Buscar ${CATEGORIES.find((c) => c.id === category)!.label.toLowerCase()}...`}
                  className="h-8 pl-8 text-sm bg-background/50 border-white/10"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1">
              {hits.length === 0 && searching ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : hits.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-10 px-4">
                  No hay resultados compatibles{debouncedQuery ? ` para "${debouncedQuery}"` : ""}.
                </p>
              ) : (
                <>
                  {!debouncedQuery && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1.5 pt-1">Más descargados</p>
                  )}
                  {hits.map((hit) => {
                    const inPack = present.get(hit.projectId);
                    return (
                      <button
                        key={hit.projectId}
                        type="button"
                        onClick={() => setSelected(hit)}
                        className={cn(
                          "w-full flex items-start gap-2.5 p-2 rounded-lg text-left border transition-colors",
                          selected?.projectId === hit.projectId
                            ? "bg-accent/15 border-accent/40"
                            : "bg-white/[0.03] border-transparent hover:bg-white/[0.07]"
                        )}
                      >
                        <ProjectIcon url={hit.iconUrl} title={hit.title} className="h-10 w-10" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-semibold text-gray-100 truncate">{hit.title}</p>
                            {inPack && (
                              <span className="shrink-0 text-[9px] font-bold uppercase text-accent" title={versionLabel(inPack.versionNumber)}>
                                Incluido
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{hit.description}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            <Download className="inline h-2.5 w-2.5 -mt-px mr-0.5" />
                            {formatCount(hit.downloads)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  {hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      disabled={searching}
                      onClick={() => runSearch(hits.length)}
                    >
                      {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cargar más"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Detail column */}
          <div className="flex-1 min-w-0 min-h-0">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={`${category}:${selected.projectId}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                  <ProjectDetail
                    hit={selected}
                    category={category}
                    target={target}
                    present={present}
                    onAdd={(downloads) => {
                      onAdd(downloads);
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground px-8 text-center"
                >
                  <ModrinthGlyph className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Elige algo de la lista para ver sus versiones y dependencias.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDetail({
  hit,
  category,
  target,
  present,
  onAdd,
}: {
  hit: ModrinthSearchHit;
  category: AdminContentCategory;
  target: PackTarget;
  present: Map<string, PresentProject>;
  onAdd: (downloads: ModrinthDownload[]) => void;
}) {
  const [versions, setVersions] = useState<ModrinthUpdate[] | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [deps, setDeps] = useState<PlannedDependency[] | null>(null);
  const [withDeps, setWithDeps] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const inPack = present.get(hit.projectId);

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    listVersions(hit.projectId, target.loader, target.minecraftVersion, category).then((v) => {
      if (cancelled) return;
      setVersions(v);
      setVersionId(pickDefaultVersion(v)?.versionId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [hit.projectId, category, target.loader, target.minecraftVersion]);

  const version = versions?.find((v) => v.versionId === versionId) ?? null;
  // Everything already in the update, plus this project itself (so a
  // dependency cycle back to it never plans to add it a second time).
  const presentIds = useMemo(() => {
    const s = new Set(present.keys());
    s.add(hit.projectId);
    return s;
  }, [present, hit.projectId]);

  useEffect(() => {
    let cancelled = false;
    setDeps(null);
    if (!version) return;
    planMissingDependencies([{ title: hit.title, version }], presentIds, target).then((d) => {
      if (!cancelled) setDeps(d);
    });
    return () => {
      cancelled = true;
    };
  }, [version, presentIds, hit.title, target]);

  const sameVersion = !!inPack && !!version && inPack.versionId === version.versionId;
  const addableDeps = (deps ?? []).filter((d) => d.version);
  const unavailableDeps = (deps ?? []).filter((d) => !d.version);

  const handleAdd = async () => {
    if (!version) return;
    try {
      setBusy("Descargando...");
      const main = await downloadVersion(version, category, { projectId: hit.projectId, title: hit.title, iconUrl: hit.iconUrl });
      let extra: ModrinthDownload[] = [];
      if (withDeps && addableDeps.length > 0) {
        setBusy(`Descargando dependencias (${addableDeps.length})...`);
        extra = await downloadDependencies(addableDeps);
      }
      onAdd([main, ...extra]);
      toast.success(
        extra.length > 0
          ? `${hit.title} y ${extra.length} dependencia${extra.length !== 1 ? "s" : ""} añadidos a la actualización.`
          : inPack
            ? `${hit.title} cambiado a ${version.versionNumber}.`
            : `${hit.title} añadido a la actualización.`
      );
    } catch (e: any) {
      toast.error(e?.message || "No se pudo descargar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="relative px-6 pt-5 pb-4 border-b border-white/5 overflow-hidden shrink-0">
        <div className="pointer-events-none absolute -top-20 -right-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <ProjectIcon url={hit.iconUrl} title={hit.title} className="h-16 w-16 rounded-lg shadow-lg" />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white leading-tight truncate">{hit.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3 select-text">{hit.description}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1.5">
              <Download className="inline h-3 w-3 -mt-px mr-1" />
              {formatCount(hit.downloads)} descargas
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
        <section className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Versión</p>
          {versions === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando versiones compatibles...
            </div>
          ) : versions.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              No tiene ninguna versión para Minecraft {target.minecraftVersion}
              {category === "mods" ? ` con ${target.loader}` : ""}.
            </p>
          ) : (
            <select
              value={versionId ?? ""}
              onChange={(e) => setVersionId(e.target.value)}
              className="w-full h-9 rounded-md border border-white/10 bg-background/60 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {v.versionNumber} · {VERSION_TYPE_LABEL[v.versionType]} · {new Date(v.datePublished).toLocaleDateString()}
                  {inPack?.versionId === v.versionId ? " (la que tienes)" : ""}
                </option>
              ))}
            </select>
          )}
          {version && (
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              {category}/{version.filename}
            </p>
          )}
          {inPack && (
            <p className="text-[11px] text-accent">
              Ya está en la actualización ({versionLabel(inPack.versionNumber)}).
              {!sameVersion && version ? " Al añadir esta versión se reemplaza la anterior." : ""}
            </p>
          )}
        </section>

        {category === "mods" && version && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Dependencias necesarias
            </p>
            {deps === null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Comprobando dependencias...
              </div>
            ) : deps.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-accent" />
                {version.dependencies.some((d) => d.dependencyType === "required")
                  ? "Todas sus dependencias ya están en la actualización."
                  : "No necesita ninguna dependencia."}
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  {deps.map((d) => (
                    <div
                      key={d.projectId}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5"
                    >
                      <ProjectIcon url={d.iconUrl} title={d.title} className="h-7 w-7" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-100 truncate">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {d.version ? versionLabel(d.version.versionNumber) : "Sin versión compatible"}
                          {d.requiredBy.some((t) => t !== hit.title) ? ` · la necesita ${d.requiredBy.join(", ")}` : ""}
                        </p>
                      </div>
                      {!d.version && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    </div>
                  ))}
                </div>
                {addableDeps.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer select-none">
                    <Checkbox checked={withDeps} onCheckedChange={(v) => setWithDeps(v === true)} />
                    Añadir también {addableDeps.length === 1 ? "esta dependencia" : `estas ${addableDeps.length} dependencias`}
                  </label>
                )}
                {unavailableDeps.length > 0 && (
                  <p className="text-[11px] text-amber-400 leading-snug">
                    {unavailableDeps.map((d) => d.title).join(", ")} no tiene{unavailableDeps.length > 1 ? "n" : ""} versión para
                    esta versión de Minecraft/loader: el mod podría no arrancar.
                  </p>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <div className="px-6 py-3 border-t border-white/5 flex items-center justify-end gap-2 shrink-0">
        <Button
          onClick={handleAdd}
          disabled={!version || sameVersion || !!busy || (category === "mods" && deps === null)}
          className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {busy}
            </>
          ) : sameVersion ? (
            <>
              <Check className="mr-2 h-4 w-4" /> Ya incluida
            </>
          ) : inPack ? (
            "Cambiar a esta versión"
          ) : (
            "Añadir a la actualización"
          )}
        </Button>
      </div>
    </div>
  );
}

export function ProjectIcon({ url, title, className }: { url: string | null | undefined; title: string; className?: string }) {
  return url ? (
    <img src={url} alt="" draggable={false} className={cn("shrink-0 rounded-md object-cover bg-black/30", className)} />
  ) : (
    <div className={cn("shrink-0 rounded-md bg-black/30 flex items-center justify-center text-xs font-bold text-muted-foreground", className)}>
      {title.charAt(0).toUpperCase()}
    </div>
  );
}

/** Modrinth's wrench-in-circle mark, drawn simply (no bundled brand asset). */
export function ModrinthGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 15.5 14 10m0 0 1.8-1.8a2.2 2.2 0 0 1 0 3.1L14 13.1M14 10l-1.8-1.8" />
    </svg>
  );
}
