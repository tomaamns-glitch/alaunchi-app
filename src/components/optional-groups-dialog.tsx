import { useEffect, useState } from "react";
import { create } from "zustand";
import { Layers, Package } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { OptionalGroup, OptionalGroupOption, SnapshotManifest } from "@/services/github";
import type { OptionalGroupChoice } from "@/services/electron";

// First-install picker for an online instance's optional groups (admin →
// Contenido adicional). Mounted once in App.tsx; any install path awaits
// askOptionalGroups() before calling installSnapshot.
//
// Two kinds of group:
//  - normal: tick it or not ("experiencia completa" = all of them);
//  - selectable (group.options): pick exactly one option, always — even with
//    "experiencia completa", which never installs two alternatives together.

interface PickerRequest {
  packName: string;
  /** Normal groups. */
  groups: OptionalGroup[];
  /** Selectable groups with 2+ options — need an explicit pick. */
  selectable: SelectableGroup[];
  /** Selectable groups with a single option left: chosen without asking. */
  forced: Record<string, string>;
  sizeByPath: Map<string, number>;
  resolve: (choice: OptionalGroupChoice | null) => void;
}

const usePicker = create<{ request: PickerRequest | null }>(() => ({ request: null }));

/**
 * Asks which optional groups to install. Resolves to:
 *  - `undefined` when there's nothing to ask (install as usual),
 *  - `null` if the player cancelled (don't install),
 *  - their choice otherwise.
 */
export type SelectableGroup = OptionalGroup & { options: OptionalGroupOption[] };

/** A manifest's optional groups as the player sees them: normal groups
 *  (tick or not), selectable ones with 2+ options (pick one), and selectable
 *  ones left with a single option (no choice to make). Only optional files
 *  that are actually in this manifest count; empty groups/options drop out. */
export function splitOptionalGroups(manifest: SnapshotManifest): {
  groups: OptionalGroup[];
  selectable: SelectableGroup[];
  forced: Record<string, string>;
} {
  const optional = new Set(manifest.files.filter((f) => f.required === false).map((f) => f.path));
  const keepOptional = (paths: string[]) => paths.filter((p) => optional.has(p));

  const groups: OptionalGroup[] = [];
  const selectable: SelectableGroup[] = [];
  const forced: Record<string, string> = {};
  for (const g of manifest.optionalGroups ?? []) {
    if (!g.name.trim()) continue;
    if (g.options) {
      const options = g.options.map((o) => ({ ...o, paths: keepOptional(o.paths) })).filter((o) => o.paths.length > 0);
      if (options.length === 1) forced[g.id] = options[0].id;
      else if (options.length > 1) selectable.push({ ...g, options });
    } else {
      const paths = keepOptional(g.paths);
      if (paths.length > 0) groups.push({ ...g, paths });
    }
  }
  return { groups, selectable, forced };
}

export function askOptionalGroups(
  manifest: SnapshotManifest,
  packName: string
): Promise<OptionalGroupChoice | null | undefined> {
  const { groups, selectable, forced } = splitOptionalGroups(manifest);

  if (groups.length === 0 && selectable.length === 0) {
    return Promise.resolve(Object.keys(forced).length > 0 ? { all: true, selected: [], options: forced } : undefined);
  }
  const sizeByPath = new Map(manifest.files.map((f) => [f.path, f.size]));
  return new Promise((resolve) => {
    // A second ask while one is open replaces it (the first counts as cancelled).
    usePicker.getState().request?.resolve(null);
    usePicker.setState({ request: { packName, groups, selectable, forced, sizeByPath, resolve } });
  });
}

export function sizeSuffix(bytes: number): string {
  return bytes > 0 ? ` · ${formatSize(bytes)}` : "";
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ModCount({ paths, size }: { paths: string[]; size: number }) {
  return (
    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
      <Package className="h-3 w-3" />
      {paths.length} mod{paths.length === 1 ? "" : "s"} · {formatSize(size)}
    </span>
  );
}

export function OptionalGroupsDialog() {
  const request = usePicker((s) => s.request);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelected(new Set());
    setPicks({});
  }, [request]);

  if (!request) return null;

  const sizeOf = (paths: string[]) => paths.reduce((sum, p) => sum + (request.sizeByPath.get(p) ?? 0), 0);
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

  const missingPick = request.selectable.some((g) => !picks[g.id]);
  const options = { ...request.forced, ...picks };
  const pickedPaths = request.selectable.flatMap((g) => g.options.find((o) => o.id === picks[g.id])?.paths ?? []);
  const uniq = (paths: string[]) => Array.from(new Set(paths));
  const fullSize = sizeOf(uniq([...request.groups.flatMap((g) => g.paths), ...pickedPaths]));
  const selectedSize = sizeOf(
    uniq([...request.groups.filter((g) => selected.has(g.id)).flatMap((g) => g.paths), ...pickedPaths])
  );

  return (
    <Dialog open onOpenChange={(open) => !open && finish(null)}>
      {/* Header / scrolling list / fixed footer, capped to the window height —
          a plain grid dialog grew past the window and pushed the buttons out. */}
      <DialogContent className="bg-background border-white/10 text-foreground sm:max-w-xl p-0 gap-0 flex flex-col max-h-[min(85vh,720px)] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 pr-12 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-5 w-5 text-accent shrink-0" />
            <DialogTitle className="text-white truncate">Contenido opcional de {request.packName}</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            {request.selectable.length > 0 && request.groups.length > 0
              ? "Elige una opción en cada apartado y marca los extras que quieras, o instala la experiencia completa."
              : request.selectable.length > 0
                ? "Elige una opción en cada apartado."
                : "Este modpack trae grupos de mods opcionales. Elige los que quieras, o instala la experiencia completa."}{" "}
            El resto del modpack se instala igual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {request.selectable.map((g) => (
            <div key={g.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{g.name}</p>
              {g.description.trim() && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
              <div role="radiogroup" aria-label={g.name} className="mt-2 flex flex-col gap-1.5">
                {g.options.map((o) => {
                  const checked = picks[g.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setPicks((prev) => ({ ...prev, [g.id]: o.id }))}
                      className={`flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                        checked ? "border-accent/60 bg-accent/10" : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                          checked ? "border-accent" : "border-white/30"
                        }`}
                      >
                        {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{o.name}</span>
                        <ModCount paths={o.paths} size={sizeOf(o.paths)} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {request.groups.length > 0 && request.selectable.length > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Extras</p>
          )}
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
                  <div className="mt-1.5">
                    <ModCount paths={g.paths} size={sizeOf(g.paths)} />
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter className="shrink-0 border-t border-white/5 bg-black/20 px-6 py-4 flex-col sm:flex-col gap-3 sm:space-x-0">
          {missingPick && (
            <p className="text-xs text-amber-300">Elige una opción en cada apartado para poder instalar.</p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 w-full">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-white sm:mr-auto"
              onClick={() => finish(null)}
            >
              Cancelar
            </Button>
            {request.groups.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  className="border-white/10"
                  disabled={missingPick}
                  onClick={() => finish({ all: false, selected: Array.from(selected), options })}
                >
                  {selected.size === 0 && request.selectable.length === 0
                    ? "Sin extras"
                    : `Solo lo elegido${sizeSuffix(selectedSize)}`}
                </Button>
                <Button
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                  disabled={missingPick}
                  onClick={() => finish({ all: true, selected: request.groups.map((g) => g.id), options })}
                >
                  Experiencia completa{sizeSuffix(fullSize)}
                </Button>
              </>
            ) : (
              <Button
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                disabled={missingPick}
                onClick={() => finish({ all: true, selected: [], options })}
              >
                Instalar{sizeSuffix(fullSize)}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
