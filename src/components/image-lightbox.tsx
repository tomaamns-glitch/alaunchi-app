import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LightboxImage {
  src: string;
  title?: string;
}

interface ImageLightboxProps {
  image: LightboxImage | null;
  /** True while the full-resolution image is still being fetched — the
   *  caller may pass `image` immediately (e.g. a thumbnail) for instant
   *  feedback and swap it once the real bytes are in. */
  loading?: boolean;
  onClose: () => void;
}

/** Reusable click-to-enlarge viewer — used by both the Modrinth gallery tab
 *  and the screenshots tab. Overrides DialogContent's default max-w-lg/p-6
 *  cap so the image isn't letterboxed inside a small card. */
export function ImageLightbox({ image, loading, onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground max-w-[90vw] sm:max-w-4xl p-2">
        <DialogHeader className="px-2 pt-1">
          <DialogTitle className="text-white text-sm truncate">{image?.title || ""}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center bg-black/30 rounded-md min-h-[40vh]">
          {loading || !image ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <img src={image.src} alt={image.title || ""} className="max-h-[80vh] max-w-full object-contain" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
