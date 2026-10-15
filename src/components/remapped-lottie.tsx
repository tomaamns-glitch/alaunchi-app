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
/**
 * For every pixel of the output band: which source pixel to copy. The band
 * follows the head's ROUNDED square (corner radius `corner`, in half-head
 * units): each pixel is located by its closest point on the head's straight
 * "core" plus its outward distance from the head's edge, and the same is done
 * in the source ring (a square ring gets the same rounding, scaled to it; a
 * round ring is sampled along the direction). So corners curve with the head
 * instead of leaving a square gap there.
 */
function bandMap(src: RingSource, S: number, head: number, band: number, out: number, corner: number): Int32Array {
  const key = `${JSON.stringify(src)}|${S}|${head}|${band}|${out}|${corner.toFixed(3)}`;
  const cached = mapCache.get(key);
  if (cached) return cached;
  const map = new Int32Array(out * out).fill(-1);
  const half = head / 2;
  const c = out / 2;
  const [rinX, rinY] = Array.isArray(src.rin) ? src.rin : [src.rin, src.rin];
  const [routX, routY] = Array.isArray(src.rout) ? src.rout : [src.rout, src.rout];
  const depth = 2 * band + OVERLAP; // band thickness in half-head units
  const core = 1 - corner; // half-size of the head's straight part
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      const u = (x + 0.5 - c) / half;
      const v = (y + 0.5 - c) / half;
      // Closest point on the core square, and the way out from it.
      const cu = Math.max(-core, Math.min(core, u));
      const cv = Math.max(-core, Math.min(core, v));
      let nu = u - cu;
      let nv = v - cv;
      const len = Math.hypot(nu, nv);
      if (len === 0) continue; // inside the core: under the head
      const q = (len - corner + OVERLAP) / depth; // 0 = head edge, 1 = band edge
      if (q < 0 || q > 1) continue;
      nu /= len;
      nv /= len;
      let sx: number;
      let sy: number;
      if (src.shape === "square") {
        // Same construction in the source ring, its rounding scaled to it.
        const rx = rinX + q * (routX - rinX);
        const ry = rinY + q * (routY - rinY);
        const sCornerX = corner * rinX;
        const sCornerY = corner * rinY;
        sx = src.cx + (cu / core || 0) * (rinX - sCornerX) + nu * (sCornerX + (rx - rinX));
        sy = src.cy + (cv / core || 0) * (rinY - sCornerY) + nv * (sCornerY + (ry - rinY));
      } else {
        const a = Math.atan2(v, u);
        sx = src.cx + Math.cos(a) * (rinX + q * (routX - rinX));
        sy = src.cy + Math.sin(a) * (rinY + q * (routY - rinY));
      }
      const px = Math.floor(sx * S);
      const py = Math.floor(sy * S);
      if (px >= 0 && py >= 0 && px < S && py < S) map[y * out + x] = py * S + px;
    }
  }
  mapCache.set(key, map);
  return map;
}

export function RemappedLottie({
  load,
  source,
  head,
  radius,
  band,
  once,
  replayKey = 0,
}: {
  load: () => Promise<{ default: unknown }>;
  source: RingSource;
  /** The head's size in CSS px. */
  head: number;
  /** The head's corner radius in CSS px — the band curves with it. */
  radius: number;
  /** Instead of looping forever: play `loops` times each time it comes on
   *  screen, then rest on the last frame; again every `replayEvery` s while
   *  visible (and on click, via replayKey). */
  once?: { loops: number; replayEvery: number };
  /** Band thickness on each side, × head size. */
  band: number;
  /** Each change restarts the animation from its first frame (clicking the icon). */
  replayKey?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<{ goToAndPlay: (f: number, isFrame: boolean) => void; playCount: number } | null>(null);
  const loops = once?.loops;
  const replayEvery = once?.replayEvery;
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const cssOut = head * (1 + 2 * band);
  const out = Math.max(8, Math.round(cssOut * dpr));
  const headPx = head * dpr;
  const corner = Math.min(1, Math.max(0, radius / (head / 2)));

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
    const map = bandMap(source, S, headPx, band, out, corner);
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

    // Looping: off-screen icons (long lists, hidden panels) don't animate.
    // `once`: play when (re)appearing on screen and every `replayEvery` s.
    let timer: ReturnType<typeof setInterval> | null = null;
    const replay = () => {
      const a = animRef.current;
      if (!a) return;
      a.playCount = 0;
      a.goToAndPlay(0, true);
    };
    const io = new IntersectionObserver(([e]) => {
      if (!anim) return;
      if (loops === undefined) {
        if (e.isIntersecting) anim.play();
        else anim.pause();
        return;
      }
      if (timer) clearInterval(timer);
      timer = null;
      if (!e.isIntersecting) return;
      replay();
      timer = setInterval(replay, (replayEvery ?? 60) * 1000);
    });

    Promise.all([loadLottie(), load()])
      .then(([lottie, data]) => {
        if (cancelled) return;
        anim = lottie.loadAnimation({
          renderer: "canvas",
          // A number = play that many times, then stay on the last frame.
          loop: loops ?? true,
          autoplay: loops === undefined,
          // Each player mutates its data while playing — never share one object.
          animationData: structuredClone(data.default),
          rendererSettings: { context: sctx, clearCanvas: true, preserveAspectRatio: "xMidYMid meet" },
        } as any) as any;
        // Fired right after each frame is rendered on the source canvas.
        anim!.addEventListener("enterFrame", draw);
        animRef.current = anim as any;
        io.observe(canvas);
      })
      .catch((e) => console.warn("[remapped-lottie]", e));

    return () => {
      cancelled = true;
      io.disconnect();
      if (timer) clearInterval(timer);
      animRef.current = null;
      anim?.destroy();
    };
  }, [load, source, headPx, band, out, corner, loops, replayEvery]);

  useEffect(() => {
    const a = animRef.current;
    if (!replayKey || !a) return;
    a.playCount = 0;
    a.goToAndPlay(0, true);
  }, [replayKey]);

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
