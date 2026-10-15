import { useEffect, useRef } from "react";

// Draws a Lottie frame animation as a THIN SQUARE band around a head icon,
// whatever the original's shape and thickness: the animation plays on a small
// offscreen canvas, and every output pixel of the band samples the source
// ring (round or square) at the same angle, its depth in the band mapped
// linearly onto the source ring's thickness. So round frames come out square
// like the heads, chunky ones come out slim, and nothing is ever drawn over
// the face (the inside of the band stays empty). Same idea as the circle →
// square warp of the dev decoration lab, applied live to every frame.

type LottieCanvasModule = typeof import("lottie-web/build/player/lottie_light_canvas");
let lottiePromise: Promise<LottieCanvasModule["default"]> | null = null;
const loadLottie = () =>
  (lottiePromise ??= import("lottie-web/build/player/lottie_light_canvas").then((m) => m.default));

/** Where the frame's ring is inside its animation box (all 0..1 of the box). */
export interface RingSource {
  shape: "round" | "square";
  cx: number;
  cy: number;
  /** Inner / outer edge of the ring (radius, or half-side for squares);
   *  [x, y] for animations that aren't square. */
  rin: number | [number, number];
  rout: number | [number, number];
}

const OVERLAP = 0.05; // the band starts a hair inside the head's edge (× half head)

const mapCache = new Map<string, Int32Array>();
function bandMap(src: RingSource, S: number, head: number, band: number, out: number): Int32Array {
  const key = `${JSON.stringify(src)}|${S}|${head}|${band}|${out}`;
  const cached = mapCache.get(key);
  if (cached) return cached;
  const map = new Int32Array(out * out).fill(-1);
  const half = head / 2;
  const c = out / 2;
  const [rinX, rinY] = Array.isArray(src.rin) ? src.rin : [src.rin, src.rin];
  const [routX, routY] = Array.isArray(src.rout) ? src.rout : [src.rout, src.rout];
  const depth = (2 * band) + OVERLAP; // band thickness in half-head units
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      const u = (x + 0.5 - c) / half;
      const v = (y + 0.5 - c) / half;
      const q = (Math.max(Math.abs(u), Math.abs(v)) - (1 - OVERLAP)) / depth;
      if (q < 0 || q > 1) continue;
      const a = Math.atan2(v, u);
      let dx = Math.cos(a);
      let dy = Math.sin(a);
      if (src.shape === "square") {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        dx /= m;
        dy /= m;
      }
      const sx = Math.floor((src.cx + dx * (rinX + q * (routX - rinX))) * S);
      const sy = Math.floor((src.cy + dy * (rinY + q * (routY - rinY))) * S);
      if (sx >= 0 && sy >= 0 && sx < S && sy < S) map[y * out + x] = sy * S + sx;
    }
  }
  mapCache.set(key, map);
  return map;
}

export function RemappedLottie({
  load,
  source,
  head,
  band,
}: {
  load: () => Promise<{ default: unknown }>;
  source: RingSource;
  /** The head's size in CSS px. */
  head: number;
  /** Band thickness on each side, × head size. */
  band: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const cssOut = head * (1 + 2 * band);
  const out = Math.max(8, Math.round(cssOut * dpr));
  const headPx = head * dpr;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let anim: { destroy: () => void; pause: () => void; play: () => void; addEventListener: (n: string, f: () => void) => void } | null = null;
    let cancelled = false;
    // Source resolution: enough for the band, never huge (lists show many).
    const S = out <= 80 ? 160 : 256;
    const src = document.createElement("canvas");
    src.width = src.height = S;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    const octx = canvas.getContext("2d");
    if (!sctx || !octx) return;
    const map = bandMap(source, S, headPx, band, out);
    const img = octx.createImageData(out, out);

    const draw = () => {
      const sd = sctx.getImageData(0, 0, S, S).data;
      const od = img.data;
      for (let k = 0; k < map.length; k++) {
        const j = map[k];
        if (j < 0) continue;
        const o = k * 4;
        const i = j * 4;
        od[o] = sd[i];
        od[o + 1] = sd[i + 1];
        od[o + 2] = sd[i + 2];
        od[o + 3] = sd[i + 3];
      }
      octx.putImageData(img, 0, 0);
    };

    // Off-screen icons (long lists, hidden panels) don't animate.
    const io = new IntersectionObserver(([e]) => {
      if (!anim) return;
      if (e.isIntersecting) anim.play();
      else anim.pause();
    });
    io.observe(canvas);

    Promise.all([loadLottie(), load()])
      .then(([lottie, data]) => {
        if (cancelled) return;
        anim = lottie.loadAnimation({
          renderer: "canvas",
          loop: true,
          autoplay: true,
          // Each player mutates its data while playing — never share one object.
          animationData: structuredClone(data.default),
          rendererSettings: { context: sctx, clearCanvas: true, preserveAspectRatio: "xMidYMid meet" },
        } as any) as any;
        // Fired right after each frame is rendered on the source canvas.
        anim!.addEventListener("enterFrame", draw);
      })
      .catch((e) => console.warn("[remapped-lottie]", e));

    return () => {
      cancelled = true;
      io.disconnect();
      anim?.destroy();
    };
  }, [load, source, headPx, band, out]);

  return (
    <canvas
      ref={canvasRef}
      width={out}
      height={out}
      aria-hidden
      className="pointer-events-none absolute z-[2]"
      style={{ width: cssOut, height: cssOut, left: -head * band, top: -head * band }}
    />
  );
}
