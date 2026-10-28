import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Download, Heart, Check, Lock, AlertTriangle, Sparkles, Image as ImageIcon, X, PackageSearch } from "lucide-react";
import {
  searchProjects,
  getLatestVersion,
  identifyModrinthFiles,
  SEARCH_PAGE_SIZE,
  type ModrinthSearchHit,
} from "@/services/modrinth";
import { listInstanceFiles, downloadInstanceFile, type OverlayState } from "@/services/electron";
import { ActionButton, Callout, Chips, EmptyState, Field, Skeleton, formatCount } from "./ui";

type Category = "shaderpacks" | "resourcepacks";
type Instance = NonNullable<OverlayState["instance"]>;

// What the game needs to load what was just installed — nothing activates it
// from outside the game (Minecraft rewrites options.txt when it closes).
const ACTIVATE_HINT: Record<Category, string> = {
  shaderpacks: "Actívalo en el menú de shaders de Iris u OptiFine.",
  resourcepacks: "Actívalo en Opciones → Paquetes de recursos.",
};

// Mods that load shader packs, matched by file name (no Modrinth lookup needed).
const SHADER_LOADER_RE = /iris|optifine|oculus/i;

function ResultSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2.5">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-4/5" />
        <Skeleton className="h-2 w-1/4" />
      </div>
      <Skeleton className="h-7 w-[76px] rounded-lg" />
    </div>
  );
}

function ResultRow({
  hit,
  installed,
  busy,
  onInstall,
}: {
  hit: ModrinthSearchHit;
  installed: boolean;
  busy: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.04]">
      {hit.iconUrl ? (
        <img
          src={hit.iconUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-12 w-12 shrink-0 rounded-xl bg-white/5 object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
          <PackageSearch className="h-5 w-5 text-gray-500" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-gray-50">{hit.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-400">{hit.description}</p>
        <p className="mt-1 flex items-center gap-3 text-[10px] font-medium text-gray-500">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" /> {formatCount(hit.downloads)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {formatCount(hit.follows)}
          </span>
        </p>
      </div>
      {installed ? (
        <ActionButton tone="success" icon={Check} disabled className="w-[84px] !opacity-100">
          Instalado
        </ActionButton>
      ) : (
        <ActionButton icon={Download} loading={busy} onClick={onInstall} className="w-[84px]">
          {busy ? "" : "Instalar"}
        </ActionButton>
      )}
    </div>
  );
}

export function ContentTab({ instance, locked }: { instance: Instance; locked: boolean }) {
  const [category, setCategory] = useState<Category>("shaderpacks");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [hasShaderLoader, setHasShaderLoader] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const searchSeq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const loader = instance.loaderType || "vanilla";
  const mcVersion = instance.mcVersion || "";

  // What's already in the instance, by Modrinth project (matched by sha1).
  useEffect(() => {
    let cancelled = false;
    listInstanceFiles(instance.modpackId)
      .then(async (files) => {
        if (cancelled) return;
        setHasShaderLoader(files.some((f) => f.path.startsWith("mods/") && SHADER_LOADER_RE.test(f.path)));
        const content = files.filter((f) => f.path.startsWith("shaderpacks/") || f.path.startsWith("resourcepacks/"));
        const matches = await identifyModrinthFiles(content);
        if (!cancelled) setInstalled(new Set([...matches.values()].map((m) => m.projectId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [instance.modpackId]);

  const runSearch = (offset: number) => {
    if (!mcVersion) {
      setLoading(false);
      return;
    }
    const seq = ++searchSeq.current;
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    const q = query.trim();
    searchProjects(category, q, loader, mcVersion, offset, SEARCH_PAGE_SIZE, q ? "relevance" : "downloads")
      .then((page) => {
        if (seq !== searchSeq.current) return;
        setHits((prev) => (offset === 0 ? page : [...prev, ...page]));
        setHasMore(page.length === SEARCH_PAGE_SIZE);
        if (offset === 0) listRef.current?.scrollTo({ top: 0 });
      })
      .finally(() => {
        if (seq !== searchSeq.current) return;
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    const t = setTimeout(() => runSearch(0), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, instance.modpackId]);

  // Infinite scroll: the next page loads near the end of the list.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && !loading && !loadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 240) runSearch(hits.length);
  };

  const install = async (hit: ModrinthSearchHit) => {
    setBusy((s) => new Set(s).add(hit.projectId));
    try {
      const version = await getLatestVersion(hit.projectId, loader, mcVersion, category);
      if (!version) throw new Error(`${hit.title} no tiene versión para Minecraft ${mcVersion}.`);
      await downloadInstanceFile(instance.modpackId, `${category}/${version.filename}`, version.url, version.sha1);
      setInstalled((s) => new Set(s).add(hit.projectId));
      toast.success(`${hit.title} instalado`, { description: ACTIVATE_HINT[category] });
    } catch (e: any) {
      toast.error(`No se pudo instalar ${hit.title}`, { description: e?.message });
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(hit.projectId);
        return next;
      });
    }
  };

  if (locked) {
    return (
      <EmptyState icon={Lock} title="Contenido bloqueado">
        El creador de esta instancia no permite añadir shaders ni resource packs.
      </EmptyState>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 px-4 pb-3 pt-1">
        <Field
          icon={Search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={category === "shaderpacks" ? "Buscar shaders en Modrinth" : "Buscar resource packs en Modrinth"}
          autoFocus
          trailing={
            query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Borrar" className="text-gray-500 hover:text-gray-200">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              mcVersion && <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-gray-400">{mcVersion}</span>
            )
          }
        />
        <Chips
          value={category}
          onChange={setCategory}
          options={[
            { id: "shaderpacks", label: "Shaders", icon: Sparkles },
            { id: "resourcepacks", label: "Resource packs", icon: ImageIcon },
          ]}
        />
        {category === "shaderpacks" && !hasShaderLoader && (
          <Callout icon={AlertTriangle}>Esta instancia no parece tener Iris ni OptiFine: sin uno de ellos los shaders no se pueden usar.</Callout>
        )}
      </div>

      <div className="flex items-center justify-between px-5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>{query.trim() ? "Resultados" : "Más descargados"}</span>
        <span className="font-medium normal-case tracking-normal">Modrinth</span>
      </div>

      <div ref={listRef} onScroll={onScroll} className="overlay-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          Array.from({ length: 6 }, (_, i) => <ResultSkeleton key={i} />)
        ) : hits.length === 0 ? (
          <EmptyState icon={PackageSearch} title={mcVersion ? "Sin resultados" : "Versión desconocida"}>
            {mcVersion
              ? `No hay nada para Minecraft ${mcVersion}${query.trim() ? ` que coincida con «${query.trim()}»` : ""}.`
              : "No se sabe la versión de Minecraft de esta instancia."}
          </EmptyState>
        ) : (
          <>
            {hits.map((hit) => (
              <ResultRow
                key={hit.projectId}
                hit={hit}
                installed={installed.has(hit.projectId)}
                busy={busy.has(hit.projectId)}
                onInstall={() => install(hit)}
              />
            ))}
            {loadingMore && <ResultSkeleton />}
          </>
        )}
      </div>
    </div>
  );
}
