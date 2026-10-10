import { useMemo, useState } from "react";
import { ArrowLeft, Check, Layers, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatSize, sizeSuffix, splitOptionalGroups } from "@/components/optional-groups-dialog";
import type { SnapshotManifest } from "@/services/github";
import type { OptionalGroupChoice } from "@/services/electron";

// "Contenido adicional" screen of an online instance's content manager: every
// optional group of the pack (admin → Contenido adicional), what's installed,
// and the player's choice — changeable here after the first install.

interface OptionalContentViewProps {
  manifest: SnapshotManifest;
  /** What the player chose; null = never asked (installed before groups
   *  existed), which the installer treats as everything / first option. */
  savedChoice: OptionalGroupChoice | null;
  /** Optional pack files currently on disk (disabled mods included). */
  installedPaths: Set<string>;
  /** Shown when applying will also update the pack to a newer version. */
  pendingUpdateVersion?: string;
  onApply: (choice: OptionalGroupChoice) => Promise<void>;
  onBack: () => void;
}

function StatusBadge({ installed, total }: { installed: number; total: number }) {
  const label = installed === 0 ? "No instalado" : installed === total ? "Instalado" : "Instalado en parte";
  const tone =
    installed === total
      ? "border-accent/30 bg-accent/10 text-accent"
      : "border-white/15 bg-white/5 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${tone}`}>
      {installed === total && <Check className="h-3 w-3" />}
      {label}
    </span>
  );
}

function ModCount({ paths, size }: { paths: string[]; size: number }) {
  return (
    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
      <Package className="h-3 w-3" />
      {paths.length} mod{paths.length === 1 ? "" : "s"}
      {sizeSuffix(size)}
    </span>
  );
}

export function OptionalContentView({
  manifest,
  savedChoice,
  installedPaths,
  pendingUpdateVersion,
  onApply,
  onBack,
}: OptionalContentViewProps) {
  const { groups, selectable, forced } = useMemo(() => splitOptionalGroups(manifest), [manifest]);
  const sizeByPath = useMemo(() => new Map(manifest.files.map((f) => [f.path, f.size])), [manifest]);
  const sizeOf = (paths: string[]) => paths.reduce((sum, p) => sum + (sizeByPath.get(p) ?? 0), 0);

  // Starting point = what the installer is applying today.
  const initial = useMemo(() => {
    const selected = new Set(
      groups.filter((g) => !savedChoice || savedChoice.all || savedChoice.selected.includes(g.id)).map((g) => g.id)
    );
    const picks: Record<string, string> = {};
    for (const g of selectable) {
      const saved = savedChoice?.options[g.id];
      picks[g.id] = g.options.some((o) => o.id === saved) ? saved! : g.options[0].id;
    }
    return { selected, picks };
  }, [groups, selectable, savedChoice]);

  const [selected, setSelected] = useState<Set<string>>(initial.selected);
  const [picks, setPicks] = useState<Record<string, string>>(initial.picks);
  const [applying, setApplying] = useState(false);

  const dirty =
    groups.some((g) => selected.has(g.id) !== initial.selected.has(g.id)) ||
    selectable.some((g) => picks[g.id] !== initial.picks[g.id]);

  const wantedPaths = Array.from(
    new Set([
      ...groups.filter((g) => selected.has(g.id)).flatMap((g) => g.paths),
      ...selectable.flatMap((g) => g.options.find((o) => o.id === picks[g.id])?.paths ?? []),
    ])
  );
  const toDownload = wantedPaths.filter((p) => !installedPaths.has(p));
  const countInstalled = (paths: string[]) => paths.filter((p) => installedPaths.has(p)).length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const apply = async () => {
    setApplying(true);
    try {
      // Everything ticked and it was "experiencia completa" before → stays so
      // (groups the admin adds later keep coming).
      const allTicked = groups.every((g) => selected.has(g.id));
      await onApply({
        all: allTicked && (!savedChoice || savedChoice.all),
        selected: Array.from(selected),
        options: { ...forced, ...picks },
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
          aria-label="Volver al contenido"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-accent" /> Contenido adicional
          </h3>
          <p className="text-xs text-muted-foreground">
            Mods opcionales de este modpack, por grupos. Cambia lo que quieras y aplica: se descarga lo nuevo y se quita
            lo que desmarques.
          </p>
        </div>
      </div>

      {selectable.map((g) => (
        <section key={g.id} className="rounded-lg border border-white/10 bg-card/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{g.name}</p>
          {g.description.trim() && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
          <div role="radiogroup" aria-label={g.name} className="mt-3 grid gap-2 sm:grid-cols-2">
            {g.options.map((o) => {
              const checked = picks[g.id] === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={applying}
                  onClick={() => setPicks((prev) => ({ ...prev, [g.id]: o.id }))}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                    checked ? "border-accent/60 bg-accent/10" : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      checked ? "border-accent" : "border-white/30"
                    }`}
                  >
                    {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{o.name}</span>
                      {countInstalled(o.paths) > 0 && (
                        <StatusBadge installed={countInstalled(o.paths)} total={o.paths.length} />
                      )}
                    </span>
                    <ModCount paths={o.paths} size={sizeOf(o.paths)} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {groups.length > 0 && (
        <section className="rounded-lg border border-white/10 bg-card/50 p-4">
          {selectable.length > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Extras</p>
          )}
          <div className="flex flex-col gap-2">
            {groups.map((g) => {
              const on = selected.has(g.id);
              return (
                <label
                  key={g.id}
                  className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    on ? "border-accent/40 bg-accent/[0.07]" : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{g.name}</span>
                      <StatusBadge installed={countInstalled(g.paths)} total={g.paths.length} />
                    </span>
                    {g.description.trim() && <p className="text-xs text-muted-foreground">{g.description}</p>}
                    <ModCount paths={g.paths} size={sizeOf(g.paths)} />
                  </div>
                  <Switch checked={on} disabled={applying} onCheckedChange={(v) => toggle(g.id, v)} />
                </label>
              );
            })}
          </div>
        </section>
      )}

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-lg border border-white/10 bg-background/95 backdrop-blur px-4 py-3 shadow-xl">
        <p className="text-xs text-muted-foreground min-w-0 flex-1">
          {!dirty
            ? "Sin cambios."
            : toDownload.length > 0
              ? `Se descargarán ${toDownload.length} mod${toDownload.length === 1 ? "" : "s"} (${formatSize(sizeOf(toDownload))}).`
              : "Solo se quitarán mods."}
          {dirty && pendingUpdateVersion && ` También se actualizará el modpack a v${pendingUpdateVersion}.`}
        </p>
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-white"
            disabled={applying}
            onClick={() => {
              setSelected(initial.selected);
              setPicks(initial.picks);
            }}
          >
            Descartar
          </Button>
        )}
        <Button
          size="sm"
          className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          disabled={!dirty || applying}
          onClick={apply}
        >
          {applying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {applying ? "Aplicando…" : "Aplicar cambios"}
        </Button>
      </div>
    </div>
  );
}
