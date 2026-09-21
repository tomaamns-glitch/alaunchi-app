import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Move } from "lucide-react";

interface CropperProps {
  /** Source image (data URL / object URL). */
  src: string;
  /** width / height of the crop frame (and of the exported image). */
  aspect: number;
  /** Longest edge of the exported JPEG. */
  exportWidth?: number;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
  applying?: boolean;
}

/** Drag to reposition, slider to zoom — a WYSIWYG crop into a fixed aspect, so a
 *  square photo dropped onto a wide banner shows exactly the slice you chose. */
function Cropper({ src, aspect, exportWidth = 1600, onCancel, onApply, applying }: CropperProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // "cover" scale — at zoom 1 the image exactly fills the frame.
  const ready = nat.w > 0 && nat.h > 0 && frame.w > 0 && frame.h > 0;
  const base = ready ? Math.max(frame.w / nat.w, frame.h / nat.h) : 0;
  const dispW = nat.w * base * zoom;
  const dispH = nat.h * base * zoom;
  const maxX = Math.max(0, (dispW - frame.w) / 2);
  const maxY = Math.max(0, (dispH - frame.h) / 2);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

  useEffect(() => {
    setOffset((o) => ({ x: clamp(o.x, maxX), y: clamp(o.y, maxY) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, frame.w, frame.h, nat.w, nat.h]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: clamp(e.clientX - drag.current.x, maxX),
      y: clamp(e.clientY - drag.current.y, maxY),
    });
  };
  const onPointerUp = () => (drag.current = null);

  const apply = () => {
    const img = imgRef.current;
    if (!img || !base) return;
    // frame top-left in display-pixel space, then into natural-image pixels
    const leftDisp = (dispW - frame.w) / 2 - offset.x;
    const topDisp = (dispH - frame.h) / 2 - offset.y;
    const scale = base * zoom;
    const sx = leftDisp / scale;
    const sy = topDisp / scale;
    const sw = frame.w / scale;
    const sh = frame.h / scale;

    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = Math.round(exportWidth / aspect);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onApply(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="space-y-4">
      {/* padding-bottom keeps the aspect without an `aspect-ratio` that a huge
          absolutely-positioned child could fight with */}
      <div className="relative w-full" style={{ paddingBottom: `${100 / aspect}%` }}>
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="absolute inset-0 overflow-hidden rounded-lg bg-black/40 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          {ready && (
            <div
              className="absolute left-1/2 top-1/2 pointer-events-none"
              style={{
                width: dispW,
                height: dispH,
                backgroundImage: `url(${src})`,
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          <div className="absolute left-2 top-2 pointer-events-none flex items-center gap-1.5 rounded-md bg-black/45 px-1.5 py-1 text-[10px] text-white/75">
            <Move className="h-3 w-3" />
            Arrastra para encuadrar
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground shrink-0">Zoom</span>
        <Slider min={1} max={3} step={0.02} value={[zoom]} onValueChange={([v]) => setZoom(v)} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={applying}>
          Cancelar
        </Button>
        <Button onClick={apply} disabled={applying || !nat.w}>
          {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Aplicar
        </Button>
      </DialogFooter>
    </div>
  );
}

interface BannerCropDialogProps {
  /** null = closed. */
  src: string | null;
  aspect: number;
  applying?: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (dataUrl: string) => void;
}

export function BannerCropDialog({ src, aspect, applying, onOpenChange, onApply }: BannerCropDialogProps) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Encuadrar el banner</DialogTitle>
        </DialogHeader>
        {src && (
          <Cropper
            src={src}
            aspect={aspect}
            applying={applying}
            onCancel={() => onOpenChange(false)}
            onApply={onApply}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
