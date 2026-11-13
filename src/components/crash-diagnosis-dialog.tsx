import { useCallback, useEffect, useState } from "react";
import { toast, notify } from "@/lib/toast";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Cpu,
  FileWarning,
  Globe,
  HardDrive,
  Info,
  Loader2,
  MemoryStick,
  Package,
  RefreshCw,
  Settings2,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  applyCrashFix,
  diagnoseCrash,
  installSnapshot,
  onCrashDiagnoseProgress,
  type CrashDiagnosis,
  type CrashFinding,
  type CrashFix,
} from "@/services/electron";
import { findModForMissingId } from "@/services/modrinth";
import { fetchSnapshot, snapshotBaseUrl } from "@/services/github";
import { findPackSource, useModpacks } from "@/hooks/use-modpacks";
import { closeCrashDiagnosis, noteCrashFixApplied, type CrashDiagnosisTarget } from "@/lib/crash-diagnosis";
import { reportCaughtError } from "@/services/error-reporter";
import { cn } from "@/lib/utils";

const SEVERITY: Record<CrashFinding["severity"], { label: string; className: string }> = {
  critical: { label: "Seguro", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  likely: { label: "Probable", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  possible: { label: "Posible", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  info: { label: "Info", className: "bg-white/10 text-muted-foreground border-white/15" },
};

const CATEGORY_ICON: Record<CrashFinding["category"], typeof Package> = {
  files: FileWarning,
  mods: Package,
  memory: MemoryStick,
  java: Cpu,
  loader: Wrench,
  config: Settings2,
  graphics: Cpu,
  world: Globe,
  system: HardDrive,
  other: AlertTriangle,
};

/** Plain-text report the player can paste in the chat or send to the creator. */
function reportText(name: string, d: CrashDiagnosis) {
  const lines = [`Diagnóstico de ${name} (ALaunchi)`, d.description ? `Error: ${d.description}` : "", ""];
  if (d.findings.length === 0) lines.push("No se encontró ninguna causa clara.");
  for (const f of d.findings) lines.push(`[${SEVERITY[f.severity].label}] ${f.title}`, `  ${f.detail}`);
  if (d.excerpt) lines.push("", "--- Fragmento del error ---", d.excerpt);
  return lines.filter((l, i) => l || i > 1).join("\n");
}

/**
 * The crash diagnosis (main: crash:diagnose in electron/crash-diagnosis.js):
 * runs as soon as it opens, lists the causes found — most certain first — and
 * applies each fix only when the player clicks it.
 */
export default function CrashDiagnosisDialog({ target }: { target: CrashDiagnosisTarget }) {
  const pack = useModpacks((s) => s.modpacks.find((p) => p.id === target.modpackId));
  const source = pack && pack.source !== "custom" ? findPackSource(pack) : null;
  const [result, setResult] = useState<CrashDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState({ label: "Preparando", progress: 0 });
  const [running, setRunning] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setApplied(new Set());
    setStep({ label: "Preparando", progress: 0 });
    try {
      setResult(
        await diagnoseCrash({
          modpackId: target.modpackId,
          canRepairFromSource: !!source,
          mcVersion: target.mcVersion ?? pack?.minecraftVersion,
          loaderType: target.loaderType ?? pack?.loaderType,
        })
      );
    } catch (e: any) {
      reportCaughtError(`crash-diagnosis:${target.modpackId}`, e);
      setError(e?.message || "No se pudo hacer el diagnóstico.");
    } finally {
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.modpackId]);

  useEffect(() => {
    const off = onCrashDiagnoseProgress((p) => {
      if (p.modpackId === target.modpackId) setStep({ label: p.label, progress: p.progress });
    });
    run();
    return off;
  }, [run, target.modpackId]);

  const apply = async (f: CrashFinding, fix: CrashFix) => {
    setApplying(`${f.key}|${fix.kind}`);
    try {
      if (fix.kind === "install-mod") {
        const found = await findModForMissingId(fix.modId, [fix.slug], fix.loader, fix.mcVersion);
        if (!found) throw new Error(`No se encontró ${fix.name} en Modrinth para Minecraft ${fix.mcVersion} (${fix.loader}). Búscalo a mano en la pestaña Mods.`);
        await applyCrashFix(target.modpackId, {
          ...fix,
          url: found.version.url,
          filename: found.version.filename,
          sha1: found.version.sha1,
        });
        setApplied((s) => new Set(s).add(f.key));
        noteCrashFixApplied();
        notify.success(`${found.title} instalado. Vuelve a analizar por si a su vez necesita otra cosa.`);
        return;
      }
      if (fix.kind === "repair-files") {
        if (!pack || !source) throw new Error("No se encuentra el repositorio de esta instancia.");
        const manifest = await fetchSnapshot(source.repoUrl, pack.id, source.token || undefined);
        if (!manifest) throw new Error("No hay manifiesto publicado para este modpack.");
        await installSnapshot(
          pack.id,
          manifest,
          snapshotBaseUrl(source.repoUrl, manifest),
          { name: pack.name, minecraftVersion: pack.minecraftVersion, loaderType: pack.loaderType },
          source.token || undefined
        );
        useModpacks.getState().updateModpackStatus(pack.id, { installed: true, installedVersion: manifest.version, updateAvailable: false });
      } else {
        await applyCrashFix(target.modpackId, fix);
      }
      setApplied((s) => new Set(s).add(f.key));
      noteCrashFixApplied();
      notify.success("Arreglo aplicado. Prueba a jugar otra vez.");
    } catch (e: any) {
      reportCaughtError(`crash-fix:${fix.kind}:${target.modpackId}`, e);
      toast.error(e?.message || "No se pudo aplicar el arreglo.");
    } finally {
      setApplying(null);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(reportText(target.name, result));
      toast.success("Informe copiado.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  const findings = result?.findings ?? [];
  const sure = findings.filter((f) => f.severity === "critical").length;
  const usable = (fix: CrashFix | null | undefined): fix is CrashFix => !!fix && (fix.kind !== "repair-files" || !!source);

  return (
    <Dialog open onOpenChange={(open) => !open && !applying && closeCrashDiagnosis()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:rounded-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-accent" />
            Diagnóstico de {target.name}
          </DialogTitle>
          <DialogDescription>
            {running
              ? "Revisando el informe del error, los mods y los archivos de la instancia…"
              : error
                ? "El diagnóstico no pudo terminar."
                : findings.length === 0
                  ? "No se ha encontrado ninguna causa clara."
                  : sure > 0
                    ? `${findings.length} ${findings.length === 1 ? "problema encontrado" : "problemas encontrados"}, ${sure} ${sure === 1 ? "seguro" : "seguros"}. Empieza por los de arriba.`
                    : `${findings.length} ${findings.length === 1 ? "posible causa" : "posibles causas"}. Empieza por la de arriba.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {running && (
            <div className="py-8 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {step.label}…
              </div>
              <Progress value={Math.round(step.progress * 100)} className="h-2 bg-white/10 [&>div]:bg-accent" />
            </div>
          )}

          {error && <p className="py-6 text-sm text-red-400">{error}</p>}

          {result && (
            <div className="space-y-2 pb-2">
              {result.description && (
                <p className="text-xs text-muted-foreground">
                  Último error: <span className="text-foreground">{result.description}</span>
                  {(result.repeats ?? 0) > 1 && <span> · se ha repetido en los últimos {result.repeats} crasheos</span>}
                </p>
              )}
              {findings.length === 0 && (
                <div className="rounded-md bg-white/[0.05] p-4 text-sm text-muted-foreground flex gap-3">
                  <Info className="h-5 w-5 shrink-0 text-accent" />
                  <div>
                    Los archivos están bien y los mods no tienen problemas conocidos entre sí. Si sigue fallando, copia el
                    informe y pásaselo al creador de la instancia: el fragmento del error le dirá más.
                  </div>
                </div>
              )}
              {findings.map((f) => {
                const Icon = CATEGORY_ICON[f.category] ?? AlertTriangle;
                const done = applied.has(f.key);
                return (
                  <div key={f.key} className={cn("rounded-md bg-white/[0.05] p-3 flex gap-3", done && "opacity-60")}>
                    <Icon className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-sm leading-snug flex-1 min-w-0">{f.title}</span>
                        <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", SEVERITY[f.severity].className)}>
                          {SEVERITY[f.severity].label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground break-words">{f.detail}</p>
                      {(usable(f.fix) || usable(f.altFix)) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[f.fix, f.altFix].filter(usable).map((fix, i) => {
                            const id = `${f.key}|${fix.kind}`;
                            return (
                              <Button
                                key={id}
                                size="sm"
                                variant="ghost"
                                className={cn(
                                  "h-7 text-xs border-transparent",
                                  i === 0
                                    ? "bg-accent/15 text-accent hover:bg-accent/25 hover:text-accent"
                                    : "bg-white/[0.06] text-muted-foreground hover:bg-white/10 hover:text-foreground"
                                )}
                                disabled={done || !!applying}
                                onClick={() => apply(f, fix)}
                              >
                                {done && i === 0 ? (
                                  <Check className="mr-1.5 h-3.5 w-3.5" />
                                ) : applying === id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Wrench className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {done && i === 0 ? "Hecho" : fix.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {result.excerpt && (
                <details className="rounded-md bg-black/30">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">Ver el fragmento del error</summary>
                  <pre className="max-h-64 overflow-auto px-3 pb-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                    {result.excerpt}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={copy} disabled={!result}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copiar informe
          </Button>
          <Button variant="ghost" onClick={run} disabled={running || !!applying}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Volver a analizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
