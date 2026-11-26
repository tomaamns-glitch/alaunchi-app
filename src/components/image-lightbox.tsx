import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface LightboxImage {
  src: string;
  title?: string;
}

/** Previous/next inside the list the image was opened from. */
export interface LightboxNav {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

interface ImageLightboxProps {
  image: LightboxImage | null;
  /** True while the full-resolution image is still being fetched — the
   *  caller may pass `image` immediately (e.g. a thumbnail) for instant
   *  feedback and swap it once the real bytes are in. */
  loading?: boolean;
  /** Arrows (and ←/→) to move through the list without closing. */
  nav?: LightboxNav | null;
  onClose: () => void;
}

/** Nav for a plain list of images: finds the open one by `src`. Null when it
 *  isn't in the list (or the list has a single image). */
export function listNav(
  images: LightboxImage[],
  current: LightboxImage | null,
  open: (image: LightboxImage) => void
): LightboxNav | null {
  if (!current || images.length < 2) return null;
  const index = images.findIndex((i) => i.src === current.src);
  if (index < 0) return null;
  return {
    index,
    total: images.length,
    onPrev: () => index > 0 && open(images[index - 1]),
    onNext: () => index < images.length - 1 && open(images[index + 1]),
  };
}

/** Below this natural width an image is pixel art (skins, icons): scaled up
 *  with hard edges instead of a blur. */
const PIXEL_ART_MAX_WIDTH = 128;

/** Reusable click-to-enlarge viewer — used by both the Modrinth gallery tab
 *  and the screenshots tab. Overrides DialogContent's default max-w-lg/p-6
 *  cap so the image isn't letterboxed inside a small card. The image always
 *  fills the dialog's width (up to 80vh tall), scaling up small ones — a
 *  small source (e.g. a gallery thumbnail) used to show at its natural size,
 *  lost in the middle of a big empty box. */
export function ImageLightbox({ image, loading, nav, onClose }: ImageLightboxProps) {
  const [pixelated, setPixelated] = useState(false);
  useEffect(() => setPixelated(false), [image?.src]);

  const hasPrev = !!nav && nav.index > 0;
  const hasNext = !!nav && nav.index < nav.total - 1;

  useEffect(() => {
    if (!image || !nav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        nav.onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        nav.onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image, nav, hasPrev, hasNext]);

  const arrow =
    "absolute top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/55 border border-white/15 text-white flex items-center justify-center backdrop-blur-sm transition-opacity hover:bg-black/75 disabled:opacity-0 disabled:pointer-events-none";

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-[92vw] sm:max-w-6xl p-2">
        <DialogHeader className="px-2 pt-1 pr-10">
          <DialogTitle className="text-white text-sm flex items-center gap-2 min-w-0">
            <span className="truncate">{image?.title || ""}</span>
            {nav && (
              <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                {nav.index + 1} / {nav.total}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="relative flex items-center justify-center bg-black/30 rounded-md overflow-hidden">
          {loading || !image ? (
            <div className="min-h-[40vh] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <img
              src={image.src}
              alt={image.title || ""}
              onLoad={(e) => setPixelated(e.currentTarget.naturalWidth <= PIXEL_ART_MAX_WIDTH)}
              className="w-full h-auto max-h-[80vh] object-contain"
              style={pixelated ? { imageRendering: "pixelated" } : undefined}
            />
          )}
          {nav && (
            <>
              <button type="button" aria-label="Imagen anterior" disabled={!hasPrev} onClick={nav.onPrev} className={`${arrow} left-3`}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" aria-label="Imagen siguiente" disabled={!hasNext} onClick={nav.onNext} className={`${arrow} right-3`}>
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
