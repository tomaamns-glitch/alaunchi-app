import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Check, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { LoaderIcon } from "@/components/loader-icon";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  scanCurseForge,
  chooseCurseForgeFolder,
  importCurseForgeInstance,
  onCurseForgeImportProgress,
  type CurseForgeInstance,
  type CurseForgeImportProgress,
} from "@/services/electron";

const LOADER_LABEL: Record<CurseForgeInstance["loaderType"], string> = {
  forge: "Forge",
  neoforge: "NeoForge",
  fabric: "Fabric",
  quilt: "Quilt",
  vanilla: "Vanilla",
  unknown: "Desconocido",
};

/** CurseForge's anvil mark, drawn simply (no bundled brand asset). */
export function CurseForgeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M3 6.5h5.2c.9 0 1.6.4 2 1.1l.3.5h10.5v1.6c0 2.6-1.8 4.6-4.4 5.2l-.9.2v1.4h1.6v2.5H6.6v-2.5h1.6v-1.6c-1.7-.6-2.9-1.9-3.3-3.6H6c-1.7 0-3-1.3-3-3V6.5Z" />
    </svg>
  );
}

/**
 * "Importar desde CurseForge": lists the instances in CurseForge's Instances
 * folder (electron/main.js' curseforge:* handlers) and turns the chosen ones
 * into ALaunchi private instances — same Minecraft + modloader build, game
 * folders copied over, CurseForge's own copy left untouched.
 */
export function CurseForgeImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const loadInstances = useCustomInstances((s) => s.loadInstances);
  const [scanning, setScanning] = useState(false);
  const [instancesDir, setInstancesDir] = useState("");
  const [found, setFound] = useState(true);
  const [instances, setInstances] = useState<CurseForgeInstance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState<string | null>(null);
  const [progress, setProgress] = useState<CurseForgeImportProgress | null>(null);
  const [queue, setQueue] = useState<string[]>([]);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await scanCurseForge();
      setInstancesDir(result.instancesDir);
      setFound(result.found);
      setInstances(result.instances);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || "No se pudo leer la carpeta de CurseForge.");
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (open && !importing) scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => onCurseForgeImportProgress((p) => setProgress(p)), []);

  const importable = useMemo(() => instances.filter((i) => !i.unsupported), [instances]);
  const busy = !!importing;

  const toggle = (folder: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  const chooseFolder = async () => {
    try {
      const r = await chooseCurseForgeFolder();
      if (!r.canceled) await scan();
    } catch (e: any) {
      toast.error(e?.message || "Esa carpeta no es de CurseForge.");
    }
  };

  const runImport = async (folders: string[]) => {
    if (folders.length === 0) return;
    setQueue(folders);
    const done: string[] = [];
    for (const folder of folders) {
      const inst = instances.find((i) => i.folder === folder);
      setImporting(folder);
      setProgress(null);
      try {
        await importCurseForgeInstance(folder);
        done.push(inst?.name ?? folder);
        setInstances((prev) => prev.map((i) => (i.folder === folder ? { ...i, alreadyImported: true } : i)));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(folder);
          return next;
        });
      } catch (e: any) {
        toast.error(`${inst?.name ?? folder}: ${e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "no se pudo importar."}`);
      }
    }
    setImporting(null);
    setProgress(null);
    setQueue([]);
    await loadInstances();
    if (done.length > 0) {
      toast.success(done.length === 1 ? `${done[0]} importada.` : `${done.length} instancias importadas.`);
    }
  };

  const queueIndex = importing ? queue.indexOf(importing) : -1;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-3xl sm:max-w-3xl w-[92vw] h-[78vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-white/5 shrink-0">
          <DialogTitle className="text-white flex items-center gap-2">
            <CurseForgeLogo className="h-5 w-5 text-[#F16436]" />
            Importar desde CurseForge
          </DialogTitle>
          <DialogDescription className="text-xs">
            Crea una instancia privada con la misma versión y modloader, y copia sus mods, configuración, mundos y
            demás. La instancia de CurseForge no se toca.
          </DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <p className="flex-1 min-w-0 truncate font-mono text-[11px] text-muted-foreground select-text" title={instancesDir}>
              {instancesDir || "…"}
            </p>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy || scanning} onClick={scan} title="Volver a buscar">
              <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs border-white/10" disabled={busy} onClick={chooseFolder}>
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Cambiar carpeta
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          {scanning && instances.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !found ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center px-8">
              <CurseForgeLogo className="h-10 w-10 text-[#F16436] opacity-60" />
              <p className="text-sm text-gray-200">No se ha encontrado la carpeta de instancias de CurseForge.</p>
              <p className="text-xs text-muted-foreground">
                Suele estar en <span className="font-mono">C:\Users\TuUsuario\curseforge\minecraft\Instances</span>. Si la tienes
                en otro sitio, elígela a mano.
              </p>
              <Button size="sm" onClick={chooseFolder}>
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Elegir carpeta
              </Button>
            </div>
          ) : instances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-14">No hay ninguna instancia en esa carpeta.</p>
          ) : (
            instances.map((inst) => {
              const disabled = !!inst.unsupported || busy;
              const checked = selected.has(inst.folder);
              const isImporting = importing === inst.folder;
              return (
                <div
                  key={inst.folder}
                  onClick={() => !disabled && toggle(inst.folder)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                    inst.unsupported
                      ? "bg-white/[0.02] border-white/5 opacity-60"
                      : checked
                        ? "bg-accent/10 border-accent/40 cursor-pointer"
                        : "bg-white/[0.04] border-white/5 hover:bg-white/[0.07] cursor-pointer"
                  )}
                >
                  <Checkbox checked={checked} disabled={disabled} onClick={(e) => e.stopPropagation()} onCheckedChange={() => toggle(inst.folder)} />
                  {inst.iconDataUrl ? (
                    <img src={inst.iconDataUrl} alt="" className="h-10 w-10 rounded-md object-cover shrink-0 bg-black/30" />
                  ) : (
                    <span className="h-10 w-10 rounded-md shrink-0 bg-black/30 flex items-center justify-center">
                      <LoaderIcon loader={inst.loaderType === "quilt" || inst.loaderType === "unknown" ? "vanilla" : inst.loaderType} className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium text-gray-100 truncate">{inst.name}</p>
                      {inst.alreadyImported && (
                        <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                          <Check className="h-2.5 w-2.5" /> Ya importada
                        </span>
                      )}
                      {inst.fromModpack && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground">Modpack</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <span>Minecraft {inst.minecraftVersion || "?"}</span>
                      <span className="opacity-40">·</span>
                      <span className="flex items-center gap-1">
                        {inst.loaderType !== "quilt" && inst.loaderType !== "unknown" && (
                          <LoaderIcon loader={inst.loaderType} className="h-3 w-3" />
                        )}
                        {LOADER_LABEL[inst.loaderType]} {inst.loaderVersion ?? ""}
                      </span>
                      <span className="opacity-40">·</span>
                      <span>{inst.addonCount} mods</span>
                      {inst.lastPlayed && (
                        <>
                          <span className="opacity-40">·</span>
                          <span>jugada hace {formatDistanceToNow(inst.lastPlayed, { locale: es })}</span>
                        </>
                      )}
                    </p>
                    {inst.unsupported && (
                      <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> {inst.unsupported}
                      </p>
                    )}
                    {isImporting && (
                      <div className="mt-1.5 space-y-1">
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {progress ? `${formatBytes(progress.done)} / ${formatBytes(progress.total)}` : "Preparando…"}
                          {progress?.current ? ` · ${progress.current}` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin text-accent shrink-0" />}
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2 shrink-0">
          {importable.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setSelected((prev) =>
                  prev.size === importable.length ? new Set() : new Set(importable.map((i) => i.folder))
                )
              }
              className="text-xs text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
            >
              {selected.size === importable.length ? "Quitar selección" : "Seleccionar todas"}
            </button>
          )}
          <span className="flex-1 text-xs text-muted-foreground text-right">
            {busy ? `Importando ${queueIndex + 1} de ${queue.length}…` : selected.size > 0 ? `${selected.size} seleccionada${selected.size !== 1 ? "s" : ""}` : ""}
          </span>
          <Button
            onClick={() => runImport(instances.filter((i) => selected.has(i.folder)).map((i) => i.folder))}
            disabled={busy || selected.size === 0}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Importando…" : selected.size > 1 ? `Importar ${selected.size}` : "Importar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
