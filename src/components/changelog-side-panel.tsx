import { Hint } from "@/components/hint";
import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChangelogViewerDialog } from "@/components/changelog-viewer-dialog";
import { MoveBackButton } from "@/components/move-to-content-menu";
import { fetchSnapshot, type ChangelogEntry, type Modpack } from "@/services/github";
import { findPackSource } from "@/hooks/use-modpacks";

/** Plain-text preview of a changelog (it's Markdown/HTML): no tags or markup. */
function previewText(changelog: string): string {
  return changelog
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Vertical "Novedades" panel on the online instance page and the instance
 * manager: every publish's changelog, newest first. Each card shows title, version, date and a short preview; clicking it opens the
 * full viewer. Pass `history` (null = still loading) when the caller already
 * has the manifest — then nothing is fetched here.
 */
export function ChangelogSidePanel({
  pack,
  history: given,
  error: givenError = false,
  collapsed = false,
  onToggleCollapsed,
  onMoveBack,
  className,
}: {
  pack: Modpack;
  history?: ChangelogEntry[] | null;
  error?: boolean;
  /** Only the header shows. */
  collapsed?: boolean;
  /** Shows the minimize/expand button in the header. */
  onToggleCollapsed?: () => void;
  /** Moved to Contenido: sends it back to Inicio's footer. */
  onMoveBack?: () => void;
  className?: string;
}) {
  const controlled = given !== undefined;
  const [fetched, setFetched] = useState<ChangelogEntry[] | null>(null);
  const [fetchError, setError] = useState(false);
  const history = controlled ? given : fetched;
  const error = controlled ? givenError : fetchError;
  const setHistory = setFetched;
  const [selected, setSelected] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    setHistory(null);
    setError(false);
    const source = findPackSource(pack);
    if (!source) {
      setHistory([]);
      return;
    }
    fetchSnapshot(source.repoUrl, pack.id, source.token)
      .then((manifest) => {
        if (!cancelled) setHistory([...(manifest?.changelogHistory ?? [])].reverse());
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // Only when the pack changes (or a new version is published).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id, pack.version, controlled]);

  return (
    <aside className={cn("flex flex-col rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md overflow-hidden", className)}>
      <div className={cn("shrink-0 flex items-center gap-2 px-4 py-3", !collapsed && "border-b border-white/5")}>
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">Novedades</h3>
        {onMoveBack && <MoveBackButton onClick={onMoveBack} className="ml-auto" />}
        {onToggleCollapsed && (
          <Hint label={collapsed ? "Desplegar" : "Minimizar"}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={cn("h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0", !onMoveBack && "ml-auto")}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
            </button>
          </Hint>
        )}
      </div>

      {!collapsed && (
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {error ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">No se pudieron cargar las novedades.</p>
        ) : history === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">Todavía no hay novedades registradas.</p>
        ) : (
          history.map((entry, i) => {
            const preview = previewText(entry.changelog);
            return (
              <button
                key={`${entry.version}-${i}`}
                type="button"
                onClick={() => setSelected(entry)}
                className="w-full text-left rounded-md px-3 py-2.5 hover:bg-white/[0.07] transition-colors space-y-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className={`shrink-0 ${i === 0 ? "bg-accent text-accent-foreground" : ""}`}>
                    v{entry.version}
                  </Badge>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{formatDate(entry.publishedAt)}</span>
                </div>
                <div className="text-sm font-medium text-gray-100 truncate">{entry.title || "Novedades"}</div>
                {preview && <p className="text-xs text-muted-foreground line-clamp-2">{preview}</p>}
              </button>
            );
          })
        )}
      </div>
      )}

      {selected && (
        <ChangelogViewerDialog
          title={selected.title ?? ""}
          version={selected.version}
          changelog={selected.changelog}
          onClose={() => setSelected(null)}
        />
      )}
    </aside>
  );
}
