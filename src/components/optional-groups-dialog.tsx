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

function ModCount({ paths }: { paths: string[] }) {
  return (
    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
      <Package className="h-3 w-3" />
      {paths.length} mod{paths.length === 1 ? "" : "s"}
    </span>
  );
}

// Loader / Minecraft tokens that start a jar's version tail ("jei-1.20.1-forge-…").
const VERSION_TOKEN = /^(\d|v\d|mc\d|forge$|neoforge$|fabric$|quilt$|mc$|universal$|all$)/i;

/** A readable mod name from its path: "mods/jei-1.20.1-forge-15.2.0.27.jar" → "Jei".
 *  The manifest only has paths, so this is a best guess from the file name. */
export function modNameFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const stem = base.replace(/\.(jar|zip|disabled)$/i, "").replace(/\.(jar|zip)$/i, "");
  const tokens = stem.split(/[-_+ ]+/).filter(Boolean);
  const name: string[] = [];
  for (const t of tokens) {
    if (name.length > 0 && VERSION_TOKEN.test(t)) break;
    name.push(t);
  }
  const out = (name.length ? name : tokens).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").trim() || base;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const MODS_SHOWN = 8;

/** The mods a group or option would install, as small chips — the first few,
 *  then "+N más" to see them all. Inside a <label>, so its button doesn't
 *  toggle the checkbox. */
function ModChips({ paths }: { paths: string[] }) {
  const [all, setAll] = useState(false);
  const names = Array.from(new Set(paths.map(modNameFromPath))).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return null;
  const shown = all ? names : names.slice(0, MODS_SHOWN);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {shown.map((n) => (
        <span key={n} className="max-w-[12rem] truncate rounded px-1.5 py-0.5 bg-white/[0.06] text-[10px] text-gray-300">
          {n}
        </span>
      ))}
      {names.length > MODS_SHOWN && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setAll((v) => !v);
          }}
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/10 transition-colors"
        >
          {all ? "Ver menos" : `+${names.length - MODS_SHOWN} más`}
        </button>
      )}
    </div>
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

  return (
    <Dialog open onOpenChange={(open) => !open && finish(null)}>
      {/* Header / scrolling list / fixed footer, capped to the window height —
          a plain grid dialog grew past the window and pushed the buttons out. */}
      <DialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-foreground sm:max-w-xl sm:rounded-md p-0 gap-0 flex flex-col min-h-[min(80vh,640px)] max-h-[min(90vh,820px)] overflow-hidden">
        {/* Thin accent line along the top, like the account menu's cards. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]"
        />
        <DialogHeader className="px-6 pt-6 pb-4 pr-12 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 shrink-0 rounded-md bg-accent/15 text-accent flex items-center justify-center shadow-[0_0_14px_hsl(var(--accent)/0.25)]">
              <Layers className="h-4 w-4" />
            </span>
            <DialogTitle className="text-white truncate">Contenido opcional de {request.packName}</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            {request.selectable.length > 0 && request.groups.length > 0
              ? "Elige una opción en cada apartado y marca los extras que quieras, o instálalo todo."
              : request.selectable.length > 0
                ? "Elige una opción en cada apartado."
                : "Este modpack trae grupos de mods opcionales. Elige los que quieras, o instálalo todo."}{" "}
            El resto del modpack se instala igual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {request.selectable.map((g) => (
            <div key={g.id} className="relative overflow-hidden rounded-md border border-transparent bg-gray-500/10 p-3">
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.7),transparent)]"
              />
              {/* Mandatory: until one is picked, the install buttons stay off and it says so here. */}
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{g.name}</p>
                {!picks[g.id] && (
                  <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    Elige una
                  </span>
                )}
              </div>
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
                        checked ? "border-accent/60 bg-accent/15 shadow-[0_0_12px_hsl(var(--accent)/0.25)]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20"
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
                        <ModCount paths={o.paths} />
                        <ModChips paths={o.paths} />
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
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  checked ? "border-accent/60 bg-accent/15 shadow-[0_0_12px_hsl(var(--accent)/0.25)]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20"
                }`}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(g.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{g.name}</p>
                  {g.description.trim() && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  <div className="mt-1.5">
                    <ModCount paths={g.paths} />
                    <ModChips paths={g.paths} />
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter className="shrink-0 border-t border-white/5 bg-white/[0.02] px-6 py-4 flex-col sm:flex-col gap-3 sm:space-x-0">
          {/* No Cancelar: closing the dialog (✕ / Esc) still cancels the install.
              Left: everything; right, the main action: what's been picked. */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 w-full">
            {request.groups.length > 0 && (
              <Button
                variant="ghost"
                className="border border-white/10 bg-white/[0.04] text-gray-100 hover:bg-white/[0.08] hover:border-white/20 sm:mr-auto"
                disabled={missingPick}
                onClick={() => finish({ all: true, selected: request.groups.map((g) => g.id), options })}
              >
                Instalar todo
              </Button>
            )}
            <Button
              className="bg-accent/70 hover:bg-accent/85 text-white font-semibold shadow-[0_4px_16px_hsl(var(--accent)/0.25)] sm:ml-auto"
              disabled={missingPick}
              onClick={() =>
                request.groups.length > 0
                  ? finish({ all: false, selected: Array.from(selected), options })
                  : finish({ all: true, selected: [], options })
              }
            >
              Instalar lo elegido
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
