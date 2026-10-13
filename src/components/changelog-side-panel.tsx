import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChangelogViewerDialog } from "@/components/changelog-viewer-dialog";
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
 * Vertical "Novedades" panel on the online instance page: every publish's
 * changelog, newest first (same data as the carousel's history button). Each
 * card shows title, version, date and a short preview; clicking it opens the
 * full viewer. Pass `history` (null = still loading) when the caller already
 * has the manifest — then nothing is fetched here.
 */
export function ChangelogSidePanel({
  pack,
  history: given,
  error: givenError = false,
}: {
  pack: Modpack;
  history?: ChangelogEntry[] | null;
  error?: boolean;
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
    <aside className="h-full flex flex-col rounded-md border border-white/10 bg-gray-500/10 backdrop-blur-md overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">Novedades</h3>
      </div>

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
                className="w-full text-left rounded-md px-3 py-2.5 hover:bg-white/5 transition-colors space-y-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className={`shrink-0 ${i === 0 ? "bg-accent/20 text-accent" : ""}`}>
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
