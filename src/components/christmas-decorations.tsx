import { useEffect, useRef } from "react";
import { useChristmasActive, useChristmasLights, useChristmasSnow } from "@/lib/christmas";

/**
 * Falling snow behind the app's panels (lib/christmas.ts decides when). One 2D
 * canvas, no clicks (pointer-events: none), ~70 flakes at most, scaled to the
 * window size. requestAnimationFrame stops by itself while the window isn't
 * visible, and the frame delta is clamped so it doesn't jump after a pause.
 */
export function Snowfall() {
  // In season and not switched off in Personalizar.
  const active = useChristmasSnow();
  if (!active) return null;
  return <SnowCanvas />;
}

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
}

function SnowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const makeFlake = (anywhere: boolean): Flake => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -6,
      r: 0.8 + Math.random() * 2.2,
      speed: 18 + Math.random() * 34, // px/s
      drift: 8 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.5,
    });

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(70, Math.round((width * height) / 28000));
      flakes = Array.from({ length: count }, () => makeFlake(true));
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      for (const f of flakes) {
        f.phase += dt * 0.8;
        f.y += f.speed * dt;
        f.x += Math.sin(f.phase) * f.drift * dt;
        if (f.y > height + 6) Object.assign(f, makeFlake(false));
        if (f.x < -6) f.x = width + 6;
        else if (f.x > width + 6) f.x = -6;
        ctx.globalAlpha = f.alpha;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // z-[5]: over the pages' animated background (z-0) but under their content
  // (z-10), the footer (z-20), the title bar (z-30) and every menu / dialog —
  // the snow falls behind the UI instead of over it.
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[5] h-full w-full" />;
}

const FAIRY_SPACING = 26;

/**
 * Fairy lights along the bottom edge of the title bar: small warm-white points
 * with a soft glow, no wire, each twinkling gently at its own pace (pure CSS,
 * no JS per frame). Uneven heights so it reads as a loose string, not a ruler.
 * The parent must be `relative`.
 */
export function ChristmasLights({ edge = "bottom" }: { edge?: "top" | "bottom" }) {
  // In season and not switched off in Personalizar.
  const active = useChristmasLights();
  if (!active) return null;
  // "bottom": along the title bar's lower edge. "top": along the footer's
  // upper edge (a different pattern, so the two strings don't mirror each other).
  const seed = edge === "top" ? 7 : 0;
  // Enough lights for any window; the overflow is clipped.
  const lights = Array.from({ length: 140 }, (_, i) => i);
  return (
    // no-drag: it reaches a little below the (draggable) title bar, over the
    // page — that strip must not turn into a window-drag area that eats clicks.
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 ${edge === "top" ? "-top-[5px]" : "-bottom-[5px]"} z-20 h-[10px] overflow-hidden`}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <style>{`
        @keyframes alaunchi-fairy { 0%, 100% { opacity: 0.95; } 50% { opacity: 0.3; } }
      `}</style>
      <svg className="absolute left-0 top-0" width={lights.length * FAIRY_SPACING} height="10">
        <defs>
          <radialGradient id="alaunchi-fairy-glow">
            <stop offset="0%" stopColor="#fff3d6" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#ffd98a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffc861" stopOpacity="0" />
          </radialGradient>
        </defs>
        {lights.map((n) => {
          const i = n + seed;
          // Pseudo-random but stable per light: offset, height, pace.
          const jitter = ((i * 37) % 11) - 5;
          const cx = n * FAIRY_SPACING + FAIRY_SPACING / 2 + jitter;
          const cy = 4 + ((i * 53) % 3);
          const dur = 2.4 + ((i * 29) % 9) * 0.35;
          const delay = ((i * 17) % 13) * 0.27;
          return (
            <g key={n} style={{ animation: `alaunchi-fairy ${dur}s ease-in-out ${delay}s infinite` }}>
              <circle cx={cx} cy={cy} r={4.5} fill="url(#alaunchi-fairy-glow)" />
              <circle cx={cx} cy={cy} r={1.1} fill="#fff8e6" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A small Santa hat tipped over the logo/wordmark (parent must be `relative`). */
export function SantaHat({ className }: { className?: string }) {
  const active = useChristmasActive();
  if (!active) return null;
  return (
    <svg aria-hidden viewBox="0 0 32 28" className={className} style={{ pointerEvents: "none" }}>
      {/* Hat body, bending to the right. */}
      <path d="M5 21 C 7 11, 13 4, 21 4 C 26 4, 29 8, 28 13 C 26 10, 23 9, 21 10 C 19 13, 22 18, 23 21 Z" fill="#dc2626" />
      <path d="M21 10 C 23 9, 26 10, 28 13" fill="none" stroke="#991b1b" strokeWidth="0.8" opacity="0.6" />
      {/* Pompom */}
      <circle cx="28.2" cy="14.2" r="3" fill="#f8fafc" />
      {/* Fur trim */}
      <rect x="2.5" y="19.5" width="23" height="6" rx="3" fill="#f8fafc" />
    </svg>
  );
}
