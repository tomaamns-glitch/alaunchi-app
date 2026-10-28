import { useEffect, useState } from "react";
import { Camera, Send } from "lucide-react";
import { listScreenshots, type OverlayState } from "@/services/electron";
import { useOverlayStore, type ShareableShot } from "./overlay-store";
import { EmptyState, Kbd, Skeleton } from "./ui";

type Instance = NonNullable<OverlayState["instance"]>;

// Minecraft names screenshots "2026-10-28_00.19.48.png" — turn that into a label.
export function shotLabel(fileName: string): string {
  const m = fileName.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})/);
  if (!m) return fileName.replace(/\.png$/i, "");
  const [, y, mo, d, h, mi] = m;
  const date = new Date(+y, +mo - 1, +d);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const day =
    date.toDateString() === today.toDateString()
      ? "Hoy"
      : date.toDateString() === yesterday.toDateString()
        ? "Ayer"
        : date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${day}, ${h}:${mi}`;
}

/** Every screenshot of the instance being played, newest first; clicking one
 *  opens "Compartir captura". Reloads when a new F2 one arrives. */
export function ScreenshotsTab({ instance, latest }: { instance: Instance; latest: OverlayState["screenshot"] }) {
  const openShare = useOverlayStore((s) => s.openShare);
  const [shots, setShots] = useState<ShareableShot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listScreenshots(instance.modpackId)
      .then((list) => {
        if (cancelled) return;
        setShots(
          list
            .filter((s) => !!s.sha1)
            .sort((a, b) => b.fileName.localeCompare(a.fileName))
            .map((s) => ({ modpackId: instance.modpackId, fileName: s.fileName, size: s.size, sha1: s.sha1!, thumbnailDataUrl: s.thumbnailDataUrl })),
        );
      })
      .catch(() => !cancelled && setShots([]));
    return () => {
      cancelled = true;
    };
  }, [instance.modpackId, latest?.fileName]);

  if (shots === null) {
    return (
      <div className="grid grid-cols-2 gap-2 px-4 pt-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-video w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <EmptyState icon={Camera} title="Aún no hay capturas">
        <span className="inline-flex flex-wrap items-center justify-center gap-1">
          Pulsa <Kbd keys="F2" /> en el juego para hacer una y compartirla desde aquí.
        </span>
      </EmptyState>
    );
  }

  return (
    <div className="overlay-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">
      <div className="grid grid-cols-2 gap-2">
        {shots.map((s, i) => (
          <button
            key={s.fileName}
            type="button"
            onClick={() => openShare(s)}
            className="group relative aspect-video overflow-hidden rounded-xl bg-black/40 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-shadow hover:shadow-[0_0_0_2px_hsl(var(--accent))]"
          >
            {s.thumbnailDataUrl ? (
              <img src={s.thumbnailDataUrl} alt="" draggable={false} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Camera className="h-5 w-5 text-gray-600" />
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-5">
              <span className="truncate text-[10px] font-medium text-gray-200">{shotLabel(s.fileName)}</span>
              {i === 0 && latest?.fileName === s.fileName && (
                <span className="shrink-0 rounded bg-accent px-1 py-px text-[9px] font-bold uppercase text-accent-foreground">Nueva</span>
              )}
            </span>
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground shadow-lg">
                <Send className="h-3 w-3" /> Compartir
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
