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
  duration = 16,
  fill = false,
  strokeScale = 1,
  replayEvery,
  replayKey = 0,
  split = false,
  segments,
  className,
  children,
}: {
  borderRadius?: number;
  from?: string;
  to?: string;
  /** Seconds for one loop cycle (banner frame): draw in (~2.4 s), stay
   *  complete (~9.6 s), fade out slowly (~1.6 s), stay hidden (~2.4 s). */
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
  /** Draw the border as this many separate pieces that appear one by one
   *  going round until it's complete ("Giro naranja", like its original). */
  segments?: number;
  className?: string;
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
  // The rects get their size in px from a ResizeObserver: a CSS
  // "calc(100% - 2px)" on an SVG rect didn't follow the card in Electron's
  // Chromium when it grew after mounting (the profile banner beside it loading
  // late), and the frame stayed at its first height, short of the card's bottom.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Hidden (display:none): keep the last size.
      if (!w || !h) return;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** Width/height of a rect inset by `inset` px on every side. */
  const rectSize = (inset: number) =>
    size
      ? { width: Math.max(0, size.w - inset * 2), height: Math.max(0, size.h - inset * 2) }
      : { width: `calc(100% - ${inset * 2}px)`, height: `calc(100% - ${inset * 2}px)` };
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
  // Segments: the pieces are a fixed dash pattern, revealed by a mask whose
  // stroke draws round in `segments` discrete steps (one more piece each).
  const maskId = `${gradientId}-mask`;
  const outsideId = `${gradientId}-out`;
  const period = segments ? 100 / segments : 0;
  const maskAnimation = segments
    ? `traced-border-draw 1.9s steps(${segments}, jump-start) 0s both`
    : undefined;
  return (
    <div ref={rootRef} className={`relative isolate ${fill ? "h-full w-full" : ""} ${className ?? ""}`} style={{ borderRadius }}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          {segments && (!periodic || run > 0) && (
            <mask id={maskId} key={run} maskUnits="userSpaceOnUse" x="-50%" y="-50%" width="200%" height="200%">
              <rect
                x={1}
                y={1}
                rx={borderRadius}
                ry={borderRadius}
                pathLength={100}
                fill="none"
                stroke="white"
                strokeWidth={16 * strokeScale}
                strokeDasharray="100 100"
                style={{
                  ...rectSize(1),
                  animation: maskAnimation,
                  strokeDashoffset: 100,
                }}
              />
            </mask>
          )}
          {/* Segments: keeps the blurred glow layers outside the stroke. Their
              inner half used to tint the head up to the reveal mask's inner
              edge and stop there in a hard line — on small icons (the chat
              list's 28px heads) that read as a second, duplicated frame. */}
          {segments && (
            <mask id={outsideId} maskUnits="userSpaceOnUse" x="-50%" y="-50%" width="200%" height="200%">
              <rect x="-50%" y="-50%" width="200%" height="200%" fill="white" />
              <rect
                x={1 + strokeScale}
                y={1 + strokeScale}
                rx={Math.max(0, borderRadius - strokeScale)}
                ry={Math.max(0, borderRadius - strokeScale)}
                fill="black"
                style={rectSize(1 + strokeScale)}
              />
            </mask>
          )}
        </defs>
        {(!periodic || run > 0) && LAYERS.map((l, i) => (
          // Base opacity on the <g> so the rect's own animation can fade it
          // out (each layer fades within its own, delayed, cycle).
          <g key={`${i}-${run}`} style={{ opacity: l.opacity }} mask={segments ? `url(#${maskId})` : undefined}>
          <g mask={segments && l.blur ? `url(#${outsideId})` : undefined}>
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
            strokeDasharray={
              segments ? `${period * 0.4} ${period * 0.6}` : split ? "50 150" : "100 100"
            }
            style={{
              ...rectSize(1),
              filter: l.blur ? `blur(${l.blur * strokeScale}px)` : undefined,
              ...(segments
                ? // Static pieces; the mask above does the revealing.
                  { strokeDashoffset: period * 0.2 }
                : { animation: strokeAnimation(l.delay), strokeDashoffset: split ? 50 : 100, opacity: 0 }),
              ...(turned ? { transformBox: "fill-box" as const, transformOrigin: "center", transform: "rotate(180deg)" } : {}),
            }}
          />
          ))}
          </g>
          </g>
        ))}
      </svg>
      <div className={`relative z-[1] rounded-[inherit] ${fill ? "h-full w-full" : ""}`}>{children}</div>
      <style>{`
        @keyframes traced-border {
          0% { stroke-dashoffset: 100; opacity: 1; }
          15% { stroke-dashoffset: 0; opacity: 1; }
          75% { stroke-dashoffset: 0; opacity: 1; }
          85% { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes traced-half {
          0% { stroke-dashoffset: 50; opacity: 1; }
          15% { stroke-dashoffset: 0; opacity: 1; }
          75% { stroke-dashoffset: 0; opacity: 1; }
          85% { stroke-dashoffset: 0; opacity: 0; }
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
