import { Loader2, Repeat, Smile } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmoteViewer } from "@/components/emote-viewer";
import type { ParsedEmote } from "@/lib/emotecraft";
import type { EmoteFile } from "@/services/electron";

interface EmotePreviewDialogProps {
  /** The emote file picked in the list; null closes the dialog. */
  emote: EmoteFile | null;
  /** Its decoded animation, null while it loads (or if it can't be read). */
  data: ParsedEmote | null;
  skinUrl: string | null;
  onClose: () => void;
}

const VIEWER_W = 512;
const VIEWER_H = 400;

function seconds(ticks: number): string {
  return `${(ticks / 20).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s`;
}

/** Emote packs often store translation keys ("translate:spemotes.…") that
 *  only a resource pack in-game turns into text — not worth showing. */
function readable(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t && !/^translat(e|ion):/i.test(t) ? t : null;
}

/** Live preview of an Emotecraft emote on the player's own skin, in the same
 *  glass style as the schematic viewer. */
export function EmotePreviewDialog({ emote, data, skinUrl, onClose }: EmotePreviewDialogProps) {
  const icon = data?.iconDataUrl ?? (emote?.thumbnailBase64 ? `data:image/png;base64,${emote.thumbnailBase64}` : null);
  const title = emote?.displayName || readable(data?.name) || "Emote";
  const author = readable(data?.author);
  const subtitle = [author && `por ${author}`, readable(data?.description)].filter(Boolean).join(" · ");

  return (
    <Dialog open={!!emote} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-foreground sm:max-w-[552px] sm:rounded-md p-0 gap-0 overflow-hidden grid-cols-[minmax(0,1fr)]">
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]"
        />
        <DialogHeader className="px-5 pt-5 pb-4 pr-12 border-b border-white/5 space-y-0 text-left">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-accent/15 text-accent flex items-center justify-center shadow-[0_0_14px_hsl(var(--accent)/0.25)]">
              {icon ? (
                <img src={icon} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />
              ) : (
                <Smile className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-white text-base truncate">{title}</DialogTitle>
              <div className="mt-1 flex items-center gap-1.5 min-w-0">
                {data && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent shrink-0">
                      {data.isLoop && <Repeat className="h-2.5 w-2.5" />}
                      {data.isLoop ? "En bucle" : "Una vez"}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {seconds(data.isLoop ? data.endTick + 1 : data.stopTick)}
                    </span>
                  </>
                )}
                {subtitle && (
                  <DialogDescription className="min-w-0 flex-1 text-[11px] text-muted-foreground truncate" title={subtitle}>
                    · {subtitle}
                  </DialogDescription>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 pt-4 pb-4">
          {skinUrl && data ? (
            <EmoteViewer skinUrl={skinUrl} emote={data} width={VIEWER_W} height={VIEWER_H} />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md bg-black/30 text-muted-foreground"
              style={{ width: VIEWER_W, height: VIEWER_H }}
            >
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
              <span className="text-xs">Cargando vista previa…</span>
            </div>
          )}

          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              {[
                ["Arrastrar", "girar"],
                ["Rueda", "zoom"],
                ["Doble clic", "recolocar"],
              ].map(([key, act]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <kbd className="rounded bg-white/[0.07] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-gray-300">{key}</kbd>
                  {act}
                </span>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
