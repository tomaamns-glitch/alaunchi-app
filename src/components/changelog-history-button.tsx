import { useEffect, useState } from "react";
import { MessageSquareText, Loader2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChangelogViewerDialog } from "@/components/changelog-viewer-dialog";
import { fetchSnapshot, type ChangelogEntry } from "@/services/github";
import { getGithubRepo, getModpacksToken } from "@/lib/app-config";

interface ChangelogHistoryButtonProps {
  modpackId: string;
}

/** Speech-bubble button next to "Contenido" — lazily loads every past publish's
 *  changelog (skipping ones left blank). The list shows just each update's title;
 *  clicking one opens the same big viewer as "Leer cambios" on the announcement. */
export function ChangelogHistoryButton({ modpackId }: ChangelogHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChangelogEntry[] | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ChangelogEntry | null>(null);

  // This button is reused across every pack in the carousel (not remounted per
  // pack), so the cached fetch from the last one has to be dropped explicitly
  // whenever the selected modpack changes — otherwise the popover keeps showing
  // whichever pack's changelog was fetched first, regardless of which one is
  // actually selected now.
  useEffect(() => {
    setHistory(null);
  }, [modpackId]);

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (!next || history !== null) return;
    setLoading(true);
    const repoUrl = getGithubRepo();
    const token = getModpacksToken();
    const manifest = await fetchSnapshot(repoUrl, modpackId, token || undefined);
    setHistory([...(manifest?.changelogHistory ?? [])].reverse());
    setLoading(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-gray-200"
            aria-label="Actualizaciones anteriores"
          >
            <MessageSquareText className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 max-w-[90vw] max-h-[60vh] overflow-y-auto bg-card border-white/10 text-foreground"
        >
          <p className="text-sm font-semibold text-white mb-1">Actualizaciones anteriores</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Todavía no hay novedades registradas.</p>
          ) : (
            <div className="space-y-1">
              {history.map((entry, i) => (
                <button
                  key={`${entry.version}-${i}`}
                  type="button"
                  onClick={() => {
                    setSelectedEntry(entry);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left hover:bg-white/5 transition-colors"
                >
                  <Badge variant="secondary" className="shrink-0">
                    v{entry.version}
                  </Badge>
                  <span className="text-sm text-gray-100 truncate flex-1">{entry.title || "Novedades"}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {selectedEntry && (
        <ChangelogViewerDialog
          title={selectedEntry.title ?? ""}
          version={selectedEntry.version}
          changelog={selectedEntry.changelog}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </>
  );
}
