import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Layers, Package } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { OptionalGroup, SnapshotManifest } from "@/services/github";
import type { OptionalGroupChoice } from "@/services/electron";

// First-install picker for an online instance's optional groups (admin →
// Contenido adicional). Mounted once in App.tsx; any install path awaits
// askOptionalGroups() before calling installSnapshot.

interface PickerRequest {
  packName: string;
  groups: OptionalGroup[];
  sizeByPath: Map<string, number>;
  resolve: (choice: OptionalGroupChoice | null) => void;
}

const usePicker = create<{ request: PickerRequest | null }>(() => ({ request: null }));

/** Groups worth asking about: named, with at least one optional file that's in
 *  this manifest. */
function askableGroups(manifest: SnapshotManifest): OptionalGroup[] {
  const optional = new Set(manifest.files.filter((f) => f.required === false).map((f) => f.path));
  return (manifest.optionalGroups ?? [])
    .map((g) => ({ ...g, paths: g.paths.filter((p) => optional.has(p)) }))
    .filter((g) => g.name.trim() && g.paths.length > 0);
}

/**
 * Asks which optional groups to install. Resolves to:
 *  - `undefined` when the pack has no groups (nothing asked — install as usual),
 *  - `null` if the player cancelled (don't install),
 *  - their choice otherwise.
 */
export function askOptionalGroups(
  manifest: SnapshotManifest,
  packName: string
): Promise<OptionalGroupChoice | null | undefined> {
  const groups = askableGroups(manifest);
  if (groups.length === 0) return Promise.resolve(undefined);
  const sizeByPath = new Map(manifest.files.map((f) => [f.path, f.size]));
  return new Promise((resolve) => {
    // A second ask while one is open replaces it (the first counts as cancelled).
    usePicker.getState().request?.resolve(null);
    usePicker.setState({ request: { packName, groups, sizeByPath, resolve } });
  });
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function OptionalGroupsDialog() {
  const request = usePicker((s) => s.request);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [request]);

  const sizeOf = useMemo(
    () => (paths: string[]) => paths.reduce((sum, p) => sum + (request?.sizeByPath.get(p) ?? 0), 0),
    [request]
  );

  if (!request) return null;

  const finish = (choice: OptionalGroupChoice | null) => {
    request.resolve(choice);
    usePicker.setState({ request: null });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPaths = Array.from(new Set(request.groups.flatMap((g) => g.paths)));
  const selectedPaths = Array.from(new Set(request.groups.filter((g) => selected.has(g.id)).flatMap((g) => g.paths)));

  return (
    <Dialog open onOpenChange={(open) => !open && finish(null)}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-accent shrink-0" />
            <DialogTitle className="text-white">Contenido opcional de {request.packName}</DialogTitle>
          </div>
          <DialogDescription>
            Este modpack trae grupos de mods opcionales. Elige los que quieras, o instala la experiencia completa con
            todo. El resto del modpack se instala igual.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-2 pr-1">
          {request.groups.map((g) => {
            const checked = selected.has(g.id);
            return (
              <label
                key={g.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  checked ? "border-accent/50 bg-accent/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(g.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{g.name}</p>
                  {g.description.trim() && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {g.paths.length} mod{g.paths.length === 1 ? "" : "s"} · {formatSize(sizeOf(g.paths))}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="text-muted-foreground hover:text-white" onClick={() => finish(null)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="border-white/10"
            onClick={() => finish({ all: false, selected: Array.from(selected) })}
          >
            {selected.size === 0
              ? "Instalar sin opcionales"
              : `Instalar seleccionados (${formatSize(sizeOf(selectedPaths))})`}
          </Button>
          <Button
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
            onClick={() => finish({ all: true, selected: request.groups.map((g) => g.id) })}
          >
            Experiencia completa ({formatSize(sizeOf(allPaths))})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
