import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// "Trazo" profile frame — the idea of LottieFiles' free "frame" animation by
// hugo (Lottie Simple License): a stroke drawing itself around the card, with
// a few layered strokes trailing behind. Redone as plain SVG instead of
// shipping lottie-web: the original is a black 1:1 square that plays once,
// this one follows the card's real size and corners, loops (draws in, stays
// complete for a few seconds, fades out, then draws in again) and uses the
// launcher's green → orange.

const LAYERS = [
  // delay (s), stroke width, opacity, blur (px)
  { delay: 0.3, width: 6, opacity: 0.35, blur: 6 },
  { delay: 0.15, width: 3, opacity: 0.55, blur: 2 },
  { delay: 0, width: 2, opacity: 1, blur: 0 },
];

export function TracedBorder({
  borderRadius = 12,
  from = "#4ade80",
  to = "#ff9436",
  duration = 7,
  fill = false,
  strokeScale = 1,
  replayEvery,
  replayKey = 0,
  split = false,
  children,
}: {
  borderRadius?: number;
  from?: string;
  to?: string;
  /** Seconds for one cycle: draw in (~1.9 s), hold (~3.5 s), fade, pause. */
  duration?: number;
  /** Take the parent's full size (e.g. around a fixed-size icon) instead of
   *  sizing to the children. */
  fill?: boolean;
  /** Multiplies stroke widths and glow blur — thinner for small icons. */
  strokeScale?: number;
  /** Seconds. Instead of looping, draw in once each time it comes on screen,
   *  then stay complete (with its glow) and redraw every `replayEvery` s
   *  while it's still visible — the icon decoration. */
  replayEvery?: number;
  /** Periodic mode: each change redraws it now (clicking the icon). */
  replayKey?: number;
  /** Two strokes from opposite corners, each filling half the border, instead
   *  of one going all the way round ("Recorrido"). */
  split?: boolean;
  children: ReactNode;
}) {
  const gradientId = `traced-${useId().replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Periodic mode: `run` remounts the strokes to restart their one-shot
  // animation; 0 = not drawn yet (hidden until first on screen).
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!replayEvery || !rootRef.current) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (timer) clearInterval(timer);
      timer = null;
      if (!e.isIntersecting) return;
      setRun((r) => r + 1); // (re)appeared on screen → draw now
      timer = setInterval(() => setRun((r) => r + 1), replayEvery * 1000);
    });
    io.observe(rootRef.current);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [replayEvery]);
  useEffect(() => {
    // Only once it's been drawn (on screen) — the first draw comes from the observer.
    if (replayKey) setRun((r) => (r > 0 ? r + 1 : r));
  }, [replayKey]);
  const periodic = !!replayEvery;
  // First draw: from nothing. Later ones: quick fade of the complete stroke,
  // then the same draw-in, so it never just blinks out.
  const kf = split ? "traced-half" : "traced-border";
  const strokeAnimation = (delay: number) =>
    !periodic
      ? `${kf} ${duration}s cubic-bezier(0.45, 0, 0.25, 1) ${delay}s infinite`
      : run <= 1
      ? `${kf}-draw 1.9s cubic-bezier(0.45, 0, 0.25, 1) ${delay}s both`
      : `${kf}-redraw 2.3s cubic-bezier(0.45, 0, 0.25, 1) ${delay}s both`;
  // Split: one dash of half the border (pathLength 100 → "50 150" never
  // repeats), growing from the path's start; the second copy is turned 180°
  // so it starts at the opposite corner.
  const halves = split ? [false, true] : [false];
  return (
    <div ref={rootRef} className={`relative isolate ${fill ? "h-full w-full" : ""}`} style={{ borderRadius }}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {(!periodic || run > 0) && LAYERS.map((l, i) => (
          // Base opacity on the <g> so the rect's own animation can fade it
          // out (each layer fades within its own, delayed, cycle).
          <g key={`${i}-${run}`} style={{ opacity: l.opacity }}>
          {halves.map((turned) => (
          <rect
            key={String(turned)}
            x={1}
            y={1}
            rx={borderRadius}
            ry={borderRadius}
            pathLength={100}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={l.width * strokeScale}
            strokeLinecap="round"
            strokeDasharray={split ? "50 150" : "100 100"}
            style={{
              width: "calc(100% - 2px)",
              height: "calc(100% - 2px)",
              filter: l.blur ? `blur(${l.blur * strokeScale}px)` : undefined,
              animation: strokeAnimation(l.delay),
              strokeDashoffset: split ? 50 : 100,
              opacity: 0,
              ...(turned ? { transformBox: "fill-box" as const, transformOrigin: "center", transform: "rotate(180deg)" } : {}),
            }}
          />
          ))}
          </g>
        ))}
      </svg>
      <div className={`relative z-[1] rounded-[inherit] ${fill ? "h-full w-full" : ""}`}>{children}</div>
      <style>{`
        @keyframes traced-border {
          0% { stroke-dashoffset: 100; opacity: 1; }
          27% { stroke-dashoffset: 0; opacity: 1; }
          77% { stroke-dashoffset: 0; opacity: 1; }
          88% { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes traced-half {
          0% { stroke-dashoffset: 50; opacity: 1; }
          27% { stroke-dashoffset: 0; opacity: 1; }
          77% { stroke-dashoffset: 0; opacity: 1; }
          88% { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes traced-half-draw {
          0% { stroke-dashoffset: 50; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes traced-half-redraw {
          0% { stroke-dashoffset: 0; opacity: 1; }
          15% { stroke-dashoffset: 0; opacity: 0; }
          16% { stroke-dashoffset: 50; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes traced-border-draw {
          0% { stroke-dashoffset: 100; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes traced-border-redraw {
          0% { stroke-dashoffset: 0; opacity: 1; }
          15% { stroke-dashoffset: 0; opacity: 0; }
          16% { stroke-dashoffset: 100; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes traced-border { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
          @keyframes traced-border-draw { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
          @keyframes traced-border-redraw { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
          @keyframes traced-half { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
          @keyframes traced-half-draw { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
          @keyframes traced-half-redraw { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
