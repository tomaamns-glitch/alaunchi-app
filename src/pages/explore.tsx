import { Hint } from "@/components/hint";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast, notify } from "@/lib/toast";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Compass,
  Check,
  Download,
  ExternalLink,
  Heart,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Search,
  User,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppBackground } from "@/components/app-background";
import { ProjectIcon } from "@/components/admin-modrinth-browser";
import { ModpackDetail, FilterSelect as VersionFilterSelect, LOADER_LABEL, compareMcVersionsDesc } from "@/components/modrinth-modpacks-dialog";
import { ModrinthSummary } from "@/components/modrinth-summary";
import { ImageLightbox } from "@/components/image-lightbox";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useModpacks } from "@/hooks/use-modpacks";
import { downloadInstanceFile, listInstanceFiles } from "@/services/electron";
import { identifyModrinthFiles, getProjectDetail, type ModrinthProjectDetail } from "@/services/modrinth";
import type { Modpack } from "@/services/github";
import {
  exploreCategories,
  exploreCreator,
  exploreGameVersions,
  exploreMembers,
  exploreProject,
  exploreSearch,
  exploreVersions,
  formatCount,
  type ExploreCreator,
  type ExploreHit,
  type ExploreMember,
  type ExploreProject,
  type ExploreSort,
  type ExploreType,
  type ExploreVersion,
} from "@/services/modrinth-explore";
import { cn } from "@/lib/utils";

/**
 * Explorar (Hub → Explorar): browse Modrinth — modpacks, mods, shaders, resource
 * packs and data packs — plus creator profiles. Mods/shaders/packs install
 * straight into one of your instances (required mod dependencies included);
 * a modpack installs as a new private instance (same flow as Importar →
 * Modrinth, its ModpackDetail).
 */

type Tab = ExploreType | "creators";

const TABS: { id: Tab; label: string }[] = [
  { id: "modpack", label: "Modpacks" },
  { id: "mod", label: "Mods" },
  { id: "shader", label: "Shaders" },
  { id: "resourcepack", label: "Resource packs" },
  { id: "datapack", label: "Data packs" },
  { id: "creators", label: "Creadores" },
];

const SORTS: { id: ExploreSort; label: string }[] = [
  { id: "relevance", label: "Relevancia" },
  { id: "downloads", label: "Más descargados" },
  { id: "follows", label: "Más seguidos" },
  { id: "newest", label: "Más nuevos" },
  { id: "updated", label: "Actualizados" },
];

const LOADERS = [
  { id: "any", label: "Cualquier loader" },
  { id: "fabric", label: "Fabric" },
  { id: "forge", label: "Forge" },
  { id: "neoforge", label: "NeoForge" },
  { id: "quilt", label: "Quilt" },
];

const TYPE_LABEL: Record<ExploreType, string> = {
  modpack: "Modpack",
  mod: "Mod",
  shader: "Shader",
  resourcepack: "Resource pack",
  datapack: "Data pack",
};

/** Where each installable type goes inside an instance. */
const TYPE_FOLDER: Partial<Record<ExploreType, string>> = { mod: "mods", shader: "shaderpacks", resourcepack: "resourcepacks" };

type View =
  | { kind: "search" }
  | { kind: "project"; id: string; type?: ExploreType }
  | { kind: "creator"; handle: string; prefer: "user" | "organization" };

export default function Explore() {
  const [, setLocation] = useLocation();
  const [stack, setStack] = useState<View[]>([{ kind: "search" }]);
  const view = stack[stack.length - 1];
  const push = (v: View) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const [tab, setTab] = useState<Tab>("modpack");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <AppBackground />
      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        {/* Top bar: flush glass, like Mis instancias. */}
        <div className="shrink-0 bg-gray-500/10 backdrop-blur-md px-6 py-2.5 flex items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
              <Compass className="h-5 w-5 text-accent" /> Explorar
            </h1>
            <div className="my-1 h-px w-full bg-white/10" aria-hidden />
            <p className="text-xs text-muted-foreground">Contenido y creadores de Modrinth</p>
          </div>
          <div className="ml-auto relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (view.kind !== "search") setStack([{ kind: "search" }]);
              }}
              placeholder={tab === "creators" ? "Nombre exacto del creador u organización…" : "Buscar en Modrinth…"}
              className="h-9 pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 px-6 pt-4 pb-4 flex flex-col">
          <div className="flex-1 min-h-0 rounded-md bg-gray-500/10 overflow-y-auto overflow-x-hidden">
            {view.kind === "search" ? (
              <SearchView
                tab={tab}
                onTab={setTab}
                query={debounced}
                onOpenProject={(hit) => push({ kind: "project", id: hit.projectId, type: hit.projectType })}
                onOpenCreator={(handle, prefer) => push({ kind: "creator", handle, prefer })}
              />
            ) : view.kind === "project" ? (
              <ProjectView
                key={view.id}
                id={view.id}
                type={view.type}
                onBack={back}
                onOpenCreator={(handle, prefer) => push({ kind: "creator", handle, prefer })}
                onOpenInstance={(id) => setLocation(`/modpack/${id}`)}
              />
            ) : (
              <CreatorView
                key={view.handle}
                handle={view.handle}
                prefer={view.prefer}
                onBack={back}
                onOpenProject={(hit) => push({ kind: "project", id: hit.projectId, type: hit.projectType })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────

function SearchView({
  tab,
  onTab,
  query,
  onOpenProject,
  onOpenCreator,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  query: string;
  onOpenProject: (hit: ExploreHit) => void;
  onOpenCreator: (handle: string, prefer: "user" | "organization") => void;
}) {
  const [sort, setSort] = useState<ExploreSort>("downloads");
  const [gameVersion, setGameVersion] = useState<string>("any");
  const [loader, setLoader] = useState<string>("any");
  const [category, setCategory] = useState<string>("any");
  const [versions, setVersions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [hits, setHits] = useState<ExploreHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    exploreGameVersions().then(setVersions);
  }, []);
  useEffect(() => {
    setCategory("any");
    if (tab !== "creators") exploreCategories(tab).then(setCategories);
  }, [tab]);
  // With a query, "relevance" is what people expect; browsing, the most downloaded.
  useEffect(() => {
    setSort(query ? "relevance" : "downloads");
  }, [query]);

  const load = async (offset: number) => {
    if (tab === "creators") return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await exploreSearch({
        type: tab,
        query,
        sort,
        gameVersion: gameVersion === "any" ? null : gameVersion,
        loader: loader === "any" ? null : loader,
        category: category === "any" ? null : category,
        offset,
      });
      if (id !== reqId.current) return;
      setHits((h) => (offset === 0 ? r.hits : [...h, ...r.hits]));
      setTotal(r.total);
    } catch (e: any) {
      if (id === reqId.current) setError(e?.message || "No se pudo buscar en Modrinth.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };
  useEffect(() => {
    setHits([]);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, sort, gameVersion, loader, category]);

  return (
    <div>
      {/* Tabs + filters: a sticky glass band at the top of the card. */}
      <div className="sticky top-0 z-10 bg-gray-500/10 backdrop-blur-xl border-b border-white/10 px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={cn(
                "relative px-2.5 pb-2 pt-1 text-sm font-medium whitespace-nowrap transition-colors",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {tab === t.id && (
                <motion.span layoutId="explore-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>
        {tab !== "creators" && (
          <div className="flex items-center gap-2 flex-wrap">
            <FilterSelect value={sort} onChange={(v) => setSort(v as ExploreSort)} options={SORTS.map((s) => ({ id: s.id, label: s.label }))} />
            <FilterSelect
              value={gameVersion}
              onChange={setGameVersion}
              options={[{ id: "any", label: "Cualquier versión" }, ...versions.slice(0, 60).map((v) => ({ id: v, label: v }))]}
            />
            {(tab === "mod" || tab === "modpack") && <FilterSelect value={loader} onChange={setLoader} options={LOADERS} />}
            {categories.length > 0 && (
              <FilterSelect
                value={category}
                onChange={setCategory}
                options={[{ id: "any", label: "Todas las categorías" }, ...categories.map((c) => ({ id: c, label: c }))]}
                capitalize
              />
            )}
            {total > 0 && <span className="ml-auto text-[11px] text-muted-foreground">{formatCount(total)} resultados</span>}
          </div>
        )}
      </div>

      {tab === "creators" ? (
        <CreatorLookup query={query} onOpenCreator={onOpenCreator} />
      ) : error ? (
        <p className="p-8 text-center text-sm text-red-400">{error}</p>
      ) : hits.length === 0 && loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando…
        </div>
      ) : hits.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Nada coincide con esa búsqueda.</p>
      ) : (
        <div className="p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {hits.map((h) => (
              <HitCard key={h.projectId} hit={h} onOpen={() => onOpenProject(h)} onOpenCreator={() => onOpenCreator(h.author, "user")} />
            ))}
          </div>
          {hits.length < total && (
            <div className="flex justify-center pt-4">
              <Button variant="ghost" size="sm" disabled={loading} onClick={() => load(hits.length)} className="gap-1.5">
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cargar más
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  capitalize,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  capitalize?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 w-auto min-w-[9rem] gap-2 border-transparent bg-white/[0.06] text-xs focus:ring-0", capitalize && "capitalize")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className={cn("text-xs", capitalize && "capitalize")}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HitCard({ hit, onOpen, onOpenCreator }: { hit: ExploreHit; onOpen: () => void; onOpenCreator: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group flex gap-3 rounded-md bg-white/[0.04] p-3 text-left hover:bg-white/[0.08] transition-colors cursor-pointer"
    >
      <ProjectIcon url={hit.iconUrl} title={hit.title} className="h-16 w-16 rounded-md shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-white truncate group-hover:text-accent transition-colors">{hit.title}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCreator();
          }}
          className="text-[11px] text-muted-foreground hover:text-accent hover:underline truncate max-w-full text-left"
        >
          de {hit.author}
        </button>
        <p className="mt-1 text-xs text-gray-300 line-clamp-2">{hit.description}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" /> {formatCount(hit.downloads)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {formatCount(hit.follows)}
          </span>
          {hit.loaders.length > 0 && <span className="capitalize truncate">{hit.loaders.join(", ")}</span>}
        </div>
      </div>
    </div>
  );
}

function CreatorLookup({ query, onOpenCreator }: { query: string; onOpenCreator: (handle: string, prefer: "user" | "organization") => void }) {
  const [result, setResult] = useState<ExploreCreator | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!query) {
      setResult(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    exploreCreator(query).then((c) => {
      if (cancelled) return;
      setResult(c);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!query) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground px-6">
        <Users className="h-8 w-8 opacity-50" />
        <p className="text-sm">Escribe arriba el nombre de un creador u organización de Modrinth.</p>
        <p className="text-xs">También puedes pulsar el autor de cualquier proyecto para ver su perfil.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando…
      </div>
    );
  }
  if (!result) {
    return <p className="p-8 text-center text-sm text-muted-foreground">No hay ningún creador ni organización llamado «{query}» en Modrinth.</p>;
  }
  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => onOpenCreator(result.handle, result.kind)}
        className="w-full max-w-xl flex items-center gap-4 rounded-md bg-white/[0.04] p-4 text-left hover:bg-white/[0.08] transition-colors"
      >
        <CreatorAvatar url={result.avatarUrl} name={result.name} kind={result.kind} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{result.name}</p>
          <p className="text-xs text-muted-foreground">
            {result.kind === "organization" ? "Organización" : `@${result.handle}`} · {result.projects.length} proyectos ·{" "}
            {formatCount(result.downloads)} descargas
          </p>
          {result.bio && <p className="mt-1 text-xs text-gray-300 line-clamp-2">{result.bio}</p>}
        </div>
      </button>
    </div>
  );
}

function CreatorAvatar({ url, name, kind, className }: { url: string | null; name: string; kind: "user" | "organization"; className?: string }) {
  return url ? (
    <img src={url} alt="" className={cn("shrink-0 rounded-md object-cover bg-white/10", className)} />
  ) : (
    <div className={cn("shrink-0 rounded-md bg-white/10 flex items-center justify-center text-muted-foreground", className)}>
      {kind === "organization" ? <Building2 className="h-1/2 w-1/2" /> : <span className="text-lg font-bold">{name.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

// ─── Project ────────────────────────────────────────────────────────────────

function ProjectView({
  id,
  type,
  onBack,
  onOpenCreator,
  onOpenInstance,
}: {
  id: string;
  type?: ExploreType;
  onBack: () => void;
  onOpenCreator: (handle: string, prefer: "user" | "organization") => void;
  onOpenInstance: (id: string) => void;
}) {
  const [project, setProject] = useState<ExploreProject | null>(null);
  const [members, setMembers] = useState<ExploreMember[]>([]);
  const [orgName, setOrgName] = useState<{ handle: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    exploreProject(id)
      .then((p) => {
        if (cancelled) return;
        setProject(p);
        if (p.organization) {
          exploreCreator(p.organization, "organization").then((o) => !cancelled && o && setOrgName({ handle: o.handle, name: o.name }));
        }
      })
      .catch((e) => !cancelled && setError(e?.message || "No se pudo cargar el proyecto."));
    exploreMembers(id).then((m) => !cancelled && setMembers(m));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="p-6">
        <BackButton onBack={onBack} />
        <p className="mt-6 text-center text-sm text-red-400">{error}</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  // Modpacks: the same detail (version picker + install as an instance) as Importar → Modrinth.
  if ((type ?? project.projectType) === "modpack") {
    return (
      <div className="h-full">
        <ModpackDetail
          hit={{
            projectId: project.id,
            slug: project.slug,
            title: project.title,
            description: project.description,
            author: orgName?.name ?? members[0]?.username ?? "",
            iconUrl: project.iconUrl,
            downloads: project.downloads,
            follows: project.followers,
            categories: project.categories,
            loaders: project.loaders,
            gameVersions: project.gameVersions,
            gallery: project.gallery.map((g) => g.url),
            dateModified: project.updated,
          }}
          preferredGameVersion={null}
          preferredLoader={null}
          onBack={onBack}
          onInstallingChange={() => {}}
          onOpenInstance={onOpenInstance}
        />
      </div>
    );
  }

  return (
    <ContentProjectView project={project} members={members} orgName={orgName} onBack={onBack} onOpenCreator={onOpenCreator} />
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Hint label="Volver">
      <button
        type="button"
        onClick={onBack}
        className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
        aria-label="Volver"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
    </Hint>
  );
}

function SideBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white/[0.04] p-3 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

type ContentSection = "summary" | "versions" | "images";
const CONTENT_SECTIONS: { id: ContentSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "summary", label: "Resumen", icon: FileText },
  { id: "versions", label: "Versiones", icon: History },
  { id: "images", label: "Imágenes", icon: ImageIcon },
];

/** A mod / shader / resource pack / data pack: the same layout as a modpack's page
 *  (header, Resumen · Versiones · Imágenes, install bar at the bottom). */
function ContentProjectView({
  project,
  members,
  orgName,
  onBack,
  onOpenCreator,
}: {
  project: ExploreProject;
  members: ExploreMember[];
  orgName: { handle: string; name: string } | null;
  onBack: () => void;
  onOpenCreator: (handle: string, prefer: "user" | "organization") => void;
}) {
  const isMod = project.projectType === "mod";
  const folder = TYPE_FOLDER[project.projectType];
  const [section, setSection] = useState<ContentSection>("summary");
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string } | null>(null);

  // The project's images with their originals; the explore data's urls stand in meanwhile.
  const [galleryDetail, setGalleryDetail] = useState<ModrinthProjectDetail["gallery"] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setGalleryDetail(null);
    getProjectDetail(project.id).then((d) => !cancelled && setGalleryDetail(d?.gallery ?? null));
    return () => {
      cancelled = true;
    };
  }, [project.id]);
  const gallery: ModrinthProjectDetail["gallery"] = galleryDetail ?? project.gallery.map((g) => ({ url: g.url, title: g.title }));

  // Versions, with a Minecraft + loader filter (Versiones only) that cascade into each other.
  const [versions, setVersions] = useState<ExploreVersion[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    exploreVersions(project.id).then((v) => !cancelled && setVersions(v));
    return () => {
      cancelled = true;
    };
  }, [project.id]);
  const [mcFilter, setMcFilter] = useState("");
  const [loaderFilter, setLoaderFilter] = useState("");
  const [versionId, setVersionId] = useState<string | null>(null);
  const mcOptions = useMemo(
    () =>
      [...new Set((versions ?? []).filter((v) => !loaderFilter || v.loaders.includes(loaderFilter)).flatMap((v) => v.gameVersions))].sort(
        compareMcVersionsDesc
      ),
    [versions, loaderFilter]
  );
  const loaderOptions = useMemo(
    () =>
      [...new Set((versions ?? []).filter((v) => !mcFilter || v.gameVersions.includes(mcFilter)).flatMap((v) => v.loaders))]
        .filter((l) => l !== "minecraft")
        .sort(),
    [versions, mcFilter]
  );
  useEffect(() => {
    if (mcFilter && !mcOptions.includes(mcFilter)) setMcFilter("");
    if (loaderFilter && !loaderOptions.includes(loaderFilter)) setLoaderFilter("");
  }, [mcOptions, loaderOptions, mcFilter, loaderFilter]);
  const filteredVersions = useMemo(
    () => (versions ?? []).filter((v) => (!mcFilter || v.gameVersions.includes(mcFilter)) && (!loaderFilter || v.loaders.includes(loaderFilter))),
    [versions, mcFilter, loaderFilter]
  );
  // A filter that hides the chosen version drops the choice (back to "latest compatible").
  useEffect(() => {
    if (versionId && !filteredVersions.some((v) => v.versionId === versionId)) setVersionId(null);
  }, [filteredVersions, versionId]);
  const chosen = versions?.find((v) => v.versionId === versionId) ?? null;

  // Installed instances where this could go. With a version chosen, it has to fit
  // that version; mods need a matching loader; locked instances are left out.
  const custom = useCustomInstances((s) => s.instances);
  const loadInstances = useCustomInstances((s) => s.loadInstances);
  const online = useModpacks((s) => s.modpacks);
  useEffect(() => {
    if (custom.length === 0) loadInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const candidates = useMemo(() => {
    const loaders = chosen ? chosen.loaders : project.loaders;
    const games = chosen ? chosen.gameVersions : project.gameVersions;
    const all: Modpack[] = [...custom, ...online.filter((p) => p.installed && !p.lockContent)];
    return all.filter((p) => {
      if (isMod && (!p.loaderType || p.loaderType === "vanilla" || !loaders.includes(p.loaderType))) return false;
      return games.length === 0 || games.includes(p.minecraftVersion);
    });
  }, [custom, online, project, chosen, isMod]);
  const [target, setTarget] = useState("");
  useEffect(() => {
    if (!candidates.some((c) => c.id === target)) setTarget(candidates[0]?.id ?? "");
  }, [candidates, target]);
  const [busy, setBusy] = useState(false);

  const install = async () => {
    const inst = candidates.find((c) => c.id === target);
    if (!inst || !folder) return;
    setBusy(true);
    try {
      const loader = isMod ? inst.loaderType : null;
      const main = chosen ?? (await exploreVersions(project.id, { loader, gameVersion: inst.minecraftVersion }))[0];
      if (!main) throw new Error(`No hay ninguna versión para Minecraft ${inst.minecraftVersion}${loader ? ` con ${loader}` : ""}.`);
      // What's already there, by Modrinth project (so a dependency isn't added twice).
      const files = await listInstanceFiles(inst.id);
      const matches = await identifyModrinthFiles(files.map((f) => ({ path: f.path, sha1: f.sha1 })));
      const present = new Set([...matches.values()].map((m) => m.projectId));
      if (present.has(project.id)) {
        notify.info(`${project.title} ya está instalado en ${inst.name}.`);
        return;
      }
      await downloadInstanceFile(inst.id, `${folder}/${main.filename}`, main.url, main.sha1 || undefined);
      let deps = 0;
      if (isMod) {
        for (const depId of main.requiredProjectIds) {
          if (present.has(depId)) continue;
          const [dv] = await exploreVersions(depId, { loader, gameVersion: inst.minecraftVersion });
          if (!dv) continue;
          await downloadInstanceFile(inst.id, `mods/${dv.filename}`, dv.url, dv.sha1 || undefined);
          present.add(depId);
          deps++;
        }
      }
      notify.success(`${project.title} instalado en ${inst.name}${deps ? ` (+${deps} ${deps === 1 ? "dependencia" : "dependencias"})` : ""}.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo instalar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="relative shrink-0 overflow-hidden border-b border-white/10">
        {project.gallery[0] && (
          <div className="absolute inset-0 opacity-25">
            <img src={project.gallery[0].url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/30" />
          </div>
        )}
        <div className="relative px-5 py-4 flex items-start gap-4">
          <BackButton onBack={onBack} />
          <ProjectIcon url={project.iconUrl} title={project.title} className="h-20 w-20 rounded-md shadow-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white leading-tight truncate">{project.title}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-200">{TYPE_LABEL[project.projectType]}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
              {orgName ? (
                <button type="button" onClick={() => onOpenCreator(orgName.handle, "organization")} className="hover:text-accent hover:underline">
                  de {orgName.name}
                </button>
              ) : (
                members.slice(0, 3).map((m, i) => (
                  <span key={m.id}>
                    {i === 0 ? "de " : ", "}
                    <button type="button" onClick={() => onOpenCreator(m.username, "user")} className="hover:text-accent hover:underline">
                      {m.username}
                    </button>
                  </span>
                ))
              )}
              <span>· {formatCount(project.downloads)} descargas</span>
              <span>· {formatCount(project.followers)} seguidores</span>
              <span>· actualizado hace {formatDistanceToNow(new Date(project.updated), { locale: es })}</span>
            </div>
            <p className="mt-1.5 text-sm text-gray-200 select-text">{project.description}</p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {project.categories.map((c) => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-200 capitalize">
                  {c}
                </span>
              ))}
              {project.loaders.length > 0 && <span className="text-[10px] text-muted-foreground capitalize">{project.loaders.join(" · ")}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Section buttons; the summary's translation toggle portals into the right-hand slot. */}
      <div className="px-5 py-2.5 shrink-0 flex items-center gap-2 border-b border-white/5">
        <div className="flex items-center gap-1 p-1 rounded-md bg-white/[0.07]">
          {CONTENT_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                section === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-white"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div ref={setActionsEl} className="ml-auto flex items-center gap-2" />
      </div>

      {section === "versions" && versions && versions.length > 0 && (
        <div className="px-5 py-2.5 shrink-0 flex items-center gap-2 border-b border-white/5">
          <VersionFilterSelect
            value={mcFilter}
            onChange={setMcFilter}
            options={[{ value: "", label: "Todas las versiones de Minecraft" }, ...mcOptions.map((v) => ({ value: v, label: `Minecraft ${v}` }))]}
          />
          {isMod && (
            <VersionFilterSelect
              value={loaderFilter}
              onChange={setLoaderFilter}
              options={[{ value: "", label: "Cualquier loader" }, ...loaderOptions.map((l) => ({ value: l, label: LOADER_LABEL[l] ?? l }))]}
            />
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {filteredVersions.length} {filteredVersions.length === 1 ? "versión" : "versiones"}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
        {section === "summary" && (
          <div className="flex gap-6">
            <div className="min-w-0 flex-1">
              <ModrinthSummary projectId={project.id} onOpenImage={setLightboxImage} actionsEl={actionsEl} showGallery={false} />
            </div>
            <aside className="hidden lg:block w-60 shrink-0 space-y-4 text-xs pt-4">
              <SideBlock title="Creadores">
                {orgName && (
                  <button
                    type="button"
                    onClick={() => onOpenCreator(orgName.handle, "organization")}
                    className="w-full flex items-center gap-2 rounded-md p-1.5 hover:bg-white/10 text-left"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{orgName.name}</span>
                  </button>
                )}
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpenCreator(m.username, "user")}
                    className="w-full flex items-center gap-2 rounded-md p-1.5 hover:bg-white/10 text-left"
                  >
                    <CreatorAvatar url={m.avatarUrl} name={m.username} kind="user" className="h-7 w-7" />
                    <span className="min-w-0">
                      <span className="block truncate text-gray-100">{m.username}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{m.role}</span>
                    </span>
                  </button>
                ))}
              </SideBlock>
              <SideBlock title="Detalles">
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Publicado el {format(new Date(project.published), "d MMM yyyy", { locale: es })}
                </p>
                {project.license && <p className="text-muted-foreground">Licencia: {project.license}</p>}
                {project.gameVersions.length > 0 && (
                  <p className="text-muted-foreground">
                    Minecraft {project.gameVersions[0]}
                    {project.gameVersions.length > 1 ? ` – ${project.gameVersions[project.gameVersions.length - 1]}` : ""}
                  </p>
                )}
              </SideBlock>
              <SideBlock title="Enlaces">
                {project.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-accent">
                    <ExternalLink className="h-3 w-3" /> {l.label}
                  </a>
                ))}
              </SideBlock>
            </aside>
          </div>
        )}

        {section === "versions" && (
          <section className="space-y-1.5 pt-4">
            {versions === null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando versiones...
              </div>
            ) : versions.length === 0 ? (
              <p className="text-xs text-amber-400">Este proyecto no tiene versiones.</p>
            ) : filteredVersions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Ninguna versión coincide con esos filtros.</p>
            ) : (
              <>
                {folder && (
                  <p className="text-[11px] text-muted-foreground pb-1">
                    Elige una versión para instalar esa en concreto; sin elegir, se instala la última compatible con la instancia.
                  </p>
                )}
                {filteredVersions.slice(0, 100).map((v) => {
                  const selected = v.versionId === versionId;
                  return (
                    <button
                      key={v.versionId}
                      type="button"
                      disabled={!folder}
                      onClick={() => setVersionId(selected ? null : v.versionId)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md border text-left transition-colors disabled:cursor-default",
                        selected ? "bg-accent/15 border-accent/50" : "bg-gray-500/10 border-transparent hover:bg-white/[0.08] disabled:hover:bg-gray-500/10"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium text-white truncate">{v.name || v.versionNumber}</span>
                          {v.versionType !== "release" && (
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-200 shrink-0">{v.versionType}</span>
                          )}
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5 truncate capitalize">
                          {v.loaders.filter((l) => l !== "minecraft").join(", ")}
                          {v.loaders.length ? " · " : ""}Minecraft {v.gameVersions.slice(0, 4).join(", ")}
                          {v.gameVersions.length > 4 ? "…" : ""} · hace {formatDistanceToNow(new Date(v.datePublished), { locale: es })} ·{" "}
                          {formatCount(v.downloads)} descargas
                        </span>
                      </span>
                      {selected && <Check className="h-4 w-4 text-accent shrink-0" />}
                    </button>
                  );
                })}
              </>
            )}
          </section>
        )}

        {section === "images" &&
          (gallery.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ImageIcon className="h-6 w-6" />
              <p className="text-sm">Este proyecto no tiene imágenes en Modrinth.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
              {gallery.map((image) => (
                <button type="button" key={image.url} onClick={() => setLightboxImage({ src: image.rawUrl || image.url, title: image.title })} className="block">
                  <img
                    src={image.url}
                    alt={image.title || ""}
                    loading="lazy"
                    className="w-full aspect-video object-cover rounded-md border border-white/10 hover:border-white/30 transition-colors"
                  />
                </button>
              ))}
            </div>
          ))}
      </div>

      {/* Install bar. */}
      <div className="px-5 py-3 border-t border-white/5 flex items-center gap-3 shrink-0">
        {!folder ? (
          <p className="text-xs text-muted-foreground">
            Los data packs se instalan dentro de cada mundo.{" "}
            <a href={`https://modrinth.com/${project.projectType}/${project.slug}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Descárgalo en Modrinth
            </a>
            .
          </p>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-xs text-muted-foreground truncate">
              {candidates.length === 0
                ? isMod
                  ? "Ninguna de tus instancias tiene un loader y una versión compatibles."
                  : "Ninguna de tus instancias tiene una versión compatible."
                : chosen
                  ? `Versión ${chosen.versionNumber}`
                  : "Se instala la última versión compatible"}
              {chosen && (
                <button type="button" onClick={() => setVersionId(null)} className="ml-2 text-accent hover:underline">
                  Quitar
                </button>
              )}
            </p>
            {candidates.length > 0 && (
              <>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="h-9 w-56 border-transparent bg-white/[0.06] text-xs focus:ring-0">
                    <SelectValue placeholder="Elige una instancia" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name} · {c.minecraftVersion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={install} disabled={busy || !target} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {busy ? "Instalando..." : "Instalar"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  );
}

// ─── Creator ────────────────────────────────────────────────────────────────

function CreatorView({
  handle,
  prefer,
  onBack,
  onOpenProject,
}: {
  handle: string;
  prefer: "user" | "organization";
  onBack: () => void;
  onOpenProject: (hit: ExploreHit) => void;
}) {
  const [creator, setCreator] = useState<ExploreCreator | null | undefined>(undefined);
  const [filter, setFilter] = useState<ExploreType | "all">("all");
  useEffect(() => {
    let cancelled = false;
    exploreCreator(handle, prefer).then((c) => !cancelled && setCreator(c));
    return () => {
      cancelled = true;
    };
  }, [handle, prefer]);

  if (creator === undefined) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando perfil…
      </div>
    );
  }
  if (!creator) {
    return (
      <div className="p-6">
        <BackButton onBack={onBack} />
        <p className="mt-6 text-center text-sm text-muted-foreground">No se encontró el perfil de «{handle}» en Modrinth.</p>
      </div>
    );
  }

  const types = Array.from(new Set(creator.projects.map((p) => p.projectType))).filter(Boolean);
  const shown = filter === "all" ? creator.projects : creator.projects.filter((p) => p.projectType === filter);

  return (
    <div>
      <div className="px-5 py-4 flex items-start gap-4 border-b border-white/10">
        <BackButton onBack={onBack} />
        <CreatorAvatar url={creator.avatarUrl} name={creator.name} kind={creator.kind} className="h-20 w-20 shadow-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white truncate flex items-center gap-2">
            {creator.name}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-gray-200 flex items-center gap-1">
              {creator.kind === "organization" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {creator.kind === "organization" ? "Organización" : "Creador"}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {creator.kind === "user" ? `@${creator.handle} · ` : ""}
            {creator.projects.length} proyectos · {formatCount(creator.downloads)} descargas
            {creator.joined ? ` · en Modrinth desde ${format(new Date(creator.joined), "MMM yyyy", { locale: es })}` : ""}
          </p>
          {creator.bio && <p className="mt-1.5 text-sm text-gray-200 whitespace-pre-line select-text">{creator.bio}</p>}
          <a
            href={`https://modrinth.com/${creator.kind === "organization" ? "organization" : "user"}/${creator.handle}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent"
          >
            Ver en Modrinth <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {types.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", ...types] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t as ExploreType | "all")}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                  filter === t ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "all" ? `Todo (${creator.projects.length})` : `${TYPE_LABEL[t as ExploreType] ?? t} (${creator.projects.filter((p) => p.projectType === t).length})`}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {shown.map((p) => (
            <HitCard key={p.projectId} hit={{ ...p, author: creator.name }} onOpen={() => onOpenProject(p)} onOpenCreator={() => {}} />
          ))}
        </div>
        {shown.length === 0 && <p className="text-sm text-muted-foreground">Sin proyectos públicos.</p>}
      </div>
    </div>
  );
}

