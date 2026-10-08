import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Library, Loader2, Package, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { HTML_SANITIZE_SCHEMA } from "@/lib/markdown-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoaderIcon } from "@/components/loader-icon";
import { downloadInstanceFile, updateInstanceFile, type InstanceFile } from "@/services/electron";
import { formatBytes } from "@/lib/format";
import {
  LIBRARY_LOADER_LABELS,
  compatibleBuild,
  subscribeLibraryMods,
  type LibraryBuild,
  type LibraryMod,
} from "@/services/mod-library";

interface ModLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: { id: string; name: string; minecraftVersion: string; loaderType: string };
  /** Every file currently in the instance's mods/ folder (pack-shipped + optional). */
  installedMods: { path: string; sha1: string | null | undefined; mandatory: boolean }[];
  /** A library jar was installed (`replacedPath` set when it replaced an older one). */
  onInstalled: (file: InstanceFile, replacedPath?: string) => void;
}

type Status =
  | { kind: "unavailable" }
  | { kind: "installed" }
  | { kind: "locked" } // an older build is shipped by the modpack itself — can't be swapped here
  | { kind: "update"; oldPath: string }
  | { kind: "install" };

/** The instance manager's "Biblioteca" — like the Modrinth install browser, but
 *  for the group's own mods (services/mod-library.ts). Only builds for the
 *  instance's exact Minecraft version + loader can be installed. */
export function ModLibraryDialog({ open, onOpenChange, pack, installedMods, onInstalled }: ModLibraryDialogProps) {
  const [mods, setMods] = useState<LibraryMod[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setQuery("");
      return;
    }
    return subscribeLibraryMods(setMods, () => {
      setMods([]);
      toast.error("No se pudo cargar la biblioteca de mods.");
    });
  }, [open]);

  const installedBySha1 = useMemo(() => {
    const out = new Map<string, { path: string; mandatory: boolean }>();
    for (const m of installedMods) if (m.sha1) out.set(m.sha1, { path: m.path, mandatory: m.mandatory });
    return out;
  }, [installedMods]);

  const statusOf = (mod: LibraryMod, build: LibraryBuild | null): Status => {
    if (!build) return { kind: "unavailable" };
    if (installedBySha1.has(build.sha1)) return { kind: "installed" };
    // Any other jar of this same library mod in the instance → offer to swap it.
    for (const other of Object.values(mod.builds)) {
      const found = installedBySha1.get(other.sha1);
      if (found) return found.mandatory ? { kind: "locked" } : { kind: "update", oldPath: found.path };
    }
    return { kind: "install" };
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (mods ?? []).filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
    );
    // Installable here first, then the rest (shown greyed out).
    return list
      .map((mod) => ({ mod, build: compatibleBuild(mod, pack.minecraftVersion, pack.loaderType) }))
      .sort((a, b) => Number(!a.build) - Number(!b.build) || a.mod.name.localeCompare(b.mod.name));
  }, [mods, query, pack.minecraftVersion, pack.loaderType]);

  const install = async (mod: LibraryMod, build: LibraryBuild, status: Status) => {
    setBusyIds((s) => new Set(s).add(mod.id));
    const newPath = `mods/${build.fileName}`;
    try {
      if (status.kind === "update") {
        await updateInstanceFile(pack.id, status.oldPath, newPath, build.downloadUrl, build.sha1);
      } else {
        await downloadInstanceFile(pack.id, newPath, build.downloadUrl, build.sha1);
      }
      onInstalled({ path: newPath, size: build.size, sha1: build.sha1 }, status.kind === "update" ? status.oldPath : undefined);
      toast.success(status.kind === "update" ? `${mod.name} actualizado.` : `${mod.name} instalado.`);
    } catch (err: any) {
      toast.error(err?.message || `No se pudo instalar ${mod.name}.`);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(mod.id);
        return next;
      });
    }
  };

  const selected = selectedId ? visible.find((v) => v.mod.id === selectedId) ?? null : null;
  const loaderLabel =
    LIBRARY_LOADER_LABELS[pack.loaderType as keyof typeof LIBRARY_LOADER_LABELS] ?? pack.loaderType;

  const actionButton = (mod: LibraryMod, build: LibraryBuild | null, size: "sm" | "default" = "sm") => {
    const status = statusOf(mod, build);
    const busy = busyIds.has(mod.id);
    if (status.kind === "unavailable") {
      return <span className="text-[11px] text-muted-foreground shrink-0">No disponible</span>;
    }
    if (status.kind === "installed") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-accent shrink-0">
          <Check className="h-3.5 w-3.5" /> Instalado
        </span>
      );
    }
    if (status.kind === "locked") {
      return <span className="text-[11px] text-muted-foreground shrink-0">Incluido en el modpack</span>;
    }
    return (
      <Button
        size={size}
        className={size === "sm" ? "h-8 text-xs shrink-0" : "shrink-0"}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void install(mod, build!, status);
        }}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : status.kind === "update" ? (
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        )}
        {status.kind === "update" ? "Actualizar" : "Instalar"}
      </Button>
    );
  };

  const icon = (mod: LibraryMod, cls: string) =>
    mod.icon ? (
      <img src={mod.icon} alt="" className={`${cls} rounded object-cover bg-black/30 shrink-0`} />
    ) : (
      <div className={`${cls} rounded bg-black/30 shrink-0 flex items-center justify-center`}>
        <Package className="h-5 w-5 text-muted-foreground" />
      </div>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-accent" /> Biblioteca de mods
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            Mods del grupo para {pack.name} · {pack.minecraftVersion}
            <LoaderIcon loader={pack.loaderType} className="h-3.5 w-3.5" />
            {loaderLabel}
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a la biblioteca
            </button>
            <div className="flex items-center gap-4">
              {icon(selected.mod, "h-16 w-16")}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold truncate">{selected.mod.name}</h2>
                {selected.mod.description && <p className="text-sm text-muted-foreground">{selected.mod.description}</p>}
                {selected.mod.author && <p className="text-[11px] text-muted-foreground mt-0.5">Por {selected.mod.author}</p>}
              </div>
              {actionButton(selected.mod, selected.build, "default")}
            </div>
            {selected.build ? (
              <p className="text-xs text-muted-foreground">
                Para esta instancia: <span className="font-mono">{selected.build.fileName}</span>
                {selected.build.modVersion && ` · v${selected.build.modVersion}`} · {formatBytes(selected.build.size)}
              </p>
            ) : (
              <p className="text-xs text-yellow-400">
                No hay versión para Minecraft {pack.minecraftVersion} con {loaderLabel}.
              </p>
            )}
            {selected.mod.details && (
              <div className="prose prose-sm prose-invert max-w-none prose-img:rounded-md prose-a:text-accent select-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}>
                  {selected.mod.details}
                </ReactMarkdown>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold mb-2">Versiones disponibles</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(selected.mod.builds)
                  .sort((a, b) => b.mcVersion.localeCompare(a.mcVersion, undefined, { numeric: true }))
                  .map((b) => (
                    <span
                      key={`${b.mcVersion}-${b.loader}`}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]"
                    >
                      <LoaderIcon loader={b.loader} className="h-3 w-3" />
                      {b.mcVersion} · {LIBRARY_LOADER_LABELS[b.loader]}
                      {b.modVersion && <span className="text-muted-foreground">v{b.modVersion}</span>}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en la biblioteca…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {mods === null ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando biblioteca…
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Library className="h-6 w-6" />
                  <p className="text-sm">{query.trim() ? "Sin resultados." : "La biblioteca está vacía."}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {visible.map(({ mod, build }) => (
                    <div
                      key={mod.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(mod.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedId(mod.id)}
                      className={`flex items-center gap-3 p-3 bg-card/50 rounded-md w-full text-left hover:bg-white/5 transition-colors cursor-pointer ${
                        build ? "" : "opacity-50"
                      }`}
                    >
                      {icon(mod, "h-12 w-12")}
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-100 font-semibold text-sm truncate">{mod.name}</p>
                        {mod.description && <p className="text-muted-foreground text-xs truncate">{mod.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {build
                            ? build.modVersion
                              ? `v${build.modVersion}`
                              : build.fileName
                            : `Sin versión para ${pack.minecraftVersion} · ${loaderLabel}`}
                        </p>
                      </div>
                      {actionButton(mod, build)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
