import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { ArrowUpCircle, Check, FileQuestion, Loader2, TriangleAlert } from "lucide-react";
import { toast, notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HTML_SANITIZE_SCHEMA } from "@/lib/markdown-schema";
import {
  changeModrinthModpackVersion,
  onModrinthInstallProgress,
  type ModrinthInstallProgress,
} from "@/services/electron";
import { isSupportedModpackVersion, listModpackVersions, type ModpackVersion } from "@/services/modrinth";
import type { Modpack } from "@/services/github";

const TYPE_META: Record<ModpackVersion["versionType"], { letter: string; className: string }> = {
  release: { letter: "R", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  beta: { letter: "B", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  alpha: { letter: "A", className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const publishedAt = (v: ModpackVersion) => new Date(v.datePublished).getTime();

function progressText(p: ModrinthInstallProgress | null) {
  if (!p || p.stage === "pack") return "Descargando el modpack…";
  if (p.stage === "files") return `Descargando archivos · ${p.done} / ${p.total}`;
  return "Aplicando la versión…";
}

/** "Versiones" of an instance installed from Modrinth: update it or move it to
 *  any other version of the modpack (modrinth:change-modpack-version in main.js). */
export function ModrinthVersions({ pack, onChanged }: { pack: Modpack; onChanged: () => void | Promise<void> }) {
  // undefined = still loading.
  const [versions, setVersions] = useState<ModpackVersion[] | undefined>(undefined);
  const [target, setTarget] = useState<ModpackVersion | null>(null);
  const [changing, setChanging] = useState<ModpackVersion | null>(null);
  const [progress, setProgress] = useState<ModrinthInstallProgress | null>(null);

  useEffect(() => {
    if (!pack.modrinthProjectId) return;
    let cancelled = false;
    setVersions(undefined);
    listModpackVersions(pack.modrinthProjectId).then((result) => {
      if (!cancelled) setVersions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [pack.modrinthProjectId]);

  useEffect(() => onModrinthInstallProgress(setProgress), []);

  if (versions === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando versiones...
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileQuestion className="h-6 w-6" />
        <p className="text-sm">No se han podido cargar las versiones de Modrinth.</p>
      </div>
    );
  }

  const installed = versions.find((v) => v.versionId === pack.modrinthVersionId);
  // Same Minecraft, newer, and no less stable than what's installed: never
  // offers a world-breaking jump or a beta as "the update".
  const update = installed
    ? versions.find(
        (v) =>
          isSupportedModpackVersion(v) &&
          v.gameVersions.includes(pack.minecraftVersion) &&
          publishedAt(v) > publishedAt(installed) &&
          (installed.versionType !== "release" || v.versionType === "release")
      )
    : undefined;

  const apply = async (version: ModpackVersion) => {
    if (!installed) return;
    setTarget(null);
    setChanging(version);
    setProgress(null);
    try {
      await changeModrinthModpackVersion({
        id: pack.id,
        url: version.url,
        sha1: version.sha1,
        oldUrl: installed.url,
        oldSha1: installed.sha1,
        versionId: version.versionId,
        versionNumber: version.versionNumber,
      });
      await onChanged();
      notify.success(`${pack.name} ahora está en la versión ${version.versionNumber}.`);
    } catch (e: any) {
      toast.error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo cambiar de versión.");
    } finally {
      setChanging(null);
    }
  };

  const busy = !!changing;
  const changesMinecraft = !!target && !target.gameVersions.includes(pack.minecraftVersion);
  const isDowngrade = !!target && !!installed && publishedAt(target) < publishedAt(installed);
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-3 pt-4">
      {changing ? (
        <div className="rounded-md border border-accent/30 bg-accent/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin text-accent shrink-0" />
            <span className="truncate">
              {changing.versionNumber} · {progressText(progress)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : !installed ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            La versión instalada ya no está publicada en Modrinth. Sin ella no se puede saber qué archivos son del modpack, así que no se
            puede cambiar de versión sin riesgo de mezclar mods.
          </p>
        </div>
      ) : update ? (
        <div className="flex items-center gap-3 rounded-md border border-accent/30 bg-accent/10 p-3">
          <ArrowUpCircle className="h-5 w-5 text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">Actualización disponible: {update.versionNumber}</p>
            <p className="text-[11px] text-muted-foreground">Tienes la {installed.versionNumber}</p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setTarget(update)}>
            Actualizar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Tienes la última versión para Minecraft {pack.minecraftVersion}.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {versions.map((v) => {
          const isInstalled = v.versionId === pack.modrinthVersionId;
          const supported = isSupportedModpackVersion(v);
          const type = TYPE_META[v.versionType];
          return (
            <div key={v.versionId} className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md">
              <span
                className={`h-6 w-6 flex items-center justify-center rounded-md border text-[11px] font-bold shrink-0 ${type.className}`}
                title={v.versionType}
              >
                {type.letter}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-gray-100 font-medium text-sm truncate">{v.versionNumber}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {v.gameVersions.join(", ")} · {v.loaders.join(", ")} · {new Date(v.datePublished).toLocaleDateString("es-ES")}
                </p>
              </div>
              {isInstalled ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-accent shrink-0">
                  <Check className="h-3.5 w-3.5" /> Instalada
                </span>
              ) : !supported ? (
                <span className="text-[11px] text-muted-foreground shrink-0">No compatible</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0 border-white/15 bg-transparent"
                  disabled={busy || !installed}
                  onClick={() => setTarget(v)}
                >
                  {v.versionId === update?.versionId ? "Actualizar" : "Cambiar"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar a la versión {target?.versionNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              Se sustituyen los archivos del modpack. Los mods que hayas añadido, tus mundos y los ajustes que hayas cambiado se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(changesMinecraft || isDowngrade) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {changesMinecraft
                  ? `Esta versión es para Minecraft ${target?.gameVersions.join(", ")} y tienes ${pack.minecraftVersion}. `
                  : "Esta versión es más antigua que la instalada. "}
                Tus mundos podrían dañarse: haz una copia antes de abrirlos.
              </p>
            </div>
          )}
          {!!target?.changelog.trim() && (
            <div className="max-h-64 overflow-y-auto rounded-md bg-black/20 p-3">
              <p className="text-xs font-semibold text-white mb-2">Novedades</p>
              <div className="prose prose-sm prose-invert max-w-none prose-a:text-accent select-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}>
                  {target.changelog}
                </ReactMarkdown>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => target && void apply(target)}>Cambiar de versión</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
