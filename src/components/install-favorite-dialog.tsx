import { useEffect, useState } from "react";
import { Boxes, Check, Download, Home as HomeIcon, Loader2, X } from "lucide-react";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { installFavoriteInto, type InstallOutcome } from "@/lib/install-favorite";
import type { FavoriteEntry } from "@/services/favorites";
import type { Modpack } from "@/services/github";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface InstallFavoriteDialogProps {
  favorite: FavoriteEntry | null;
  onOpenChange: (open: boolean) => void;
}

type RowStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "needsChoice"; existingLabel: string; proceed: () => Promise<InstallOutcome> }
  | { state: "done" }
  | { state: "error"; message: string };

/** Lets you pick one of YOUR OWN instances to install a friend's favorited
 *  mod/shader/resourcepack into — compatibility (loader + Minecraft version)
 *  and conflict handling (mandatory files, replacing a different version) are
 *  resolved live per instance via installFavoriteInto. */
export function InstallFavoriteDialog({ favorite, onOpenChange }: InstallFavoriteDialogProps) {
  const { modpacks } = useModpacks();
  const { instances } = useCustomInstances();
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  const targets: Modpack[] = [...modpacks.filter((mp) => mp.installed), ...instances];

  useEffect(() => {
    if (favorite) setStatus({});
  }, [favorite]);

  const run = async (target: Modpack) => {
    setStatus((s) => ({ ...s, [target.id]: { state: "checking" } }));
    try {
      const outcome = await installFavoriteInto(target, favorite!);
      applyOutcome(target, outcome);
    } catch (e: any) {
      setStatus((s) => ({ ...s, [target.id]: { state: "error", message: e?.message || "Error" } }));
    }
  };

  const applyOutcome = (target: Modpack, outcome: InstallOutcome) => {
    if (outcome.kind === "installed") {
      setStatus((s) => ({ ...s, [target.id]: { state: "done" } }));
      toast.success(`${favorite!.title} instalado en ${target.name}.`);
    } else if (outcome.kind === "incompatible") {
      setStatus((s) => ({
        ...s,
        [target.id]: { state: "error", message: `No hay versión compatible con ${target.loaderType} ${target.minecraftVersion}.` },
      }));
    } else if (outcome.kind === "blocked") {
      setStatus((s) => ({ ...s, [target.id]: { state: "error", message: outcome.reason } }));
    } else if (outcome.kind === "skipped") {
      setStatus((s) => ({ ...s, [target.id]: { state: "done" } }));
      toast(outcome.reason);
    } else {
      setStatus((s) => ({ ...s, [target.id]: { state: "needsChoice", existingLabel: outcome.existingLabel, proceed: outcome.proceed } }));
    }
  };

  const confirmChoice = async (target: Modpack, proceed: () => Promise<InstallOutcome>) => {
    setStatus((s) => ({ ...s, [target.id]: { state: "checking" } }));
    try {
      const outcome = await proceed();
      applyOutcome(target, outcome);
    } catch (e: any) {
      setStatus((s) => ({ ...s, [target.id]: { state: "error", message: e?.message || "Error" } }));
    }
  };

  return (
    <Dialog open={!!favorite} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Instalar {favorite?.title}</DialogTitle>
          <DialogDescription>Elige en qué instancia tuya quieres instalarlo.</DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No tienes ninguna instancia todavía.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {targets.map((target) => {
              const st = status[target.id] ?? { state: "idle" };
              return (
                <div key={target.id} className="rounded-lg border border-white/10 bg-card/40 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-black/40 border border-white/10 flex items-center justify-center shrink-0 text-accent/70">
                      {target.source === "custom" ? <Boxes className="h-4 w-4" /> : <HomeIcon className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{target.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {target.minecraftVersion} · {target.loaderType}
                      </div>
                    </div>
                    {st.state === "idle" && (
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs shrink-0" onClick={() => run(target)}>
                        <Download className="mr-1.5 h-3 w-3" />
                        Instalar
                      </Button>
                    )}
                    {st.state === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
                    {st.state === "done" && <Check className="h-4 w-4 text-green-400 shrink-0" />}
                  </div>

                  {st.state === "needsChoice" && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">Ya tienes {st.existingLabel} instalado.</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => confirmChoice(target, st.proceed)}>
                          Sustituir
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setStatus((s) => ({ ...s, [target.id]: { state: "idle" } }))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {st.state === "error" && (
                    <p className="mt-1.5 pt-1.5 border-t border-white/5 text-[11px] text-destructive">{st.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
