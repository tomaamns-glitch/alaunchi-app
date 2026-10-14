import { useId, type ReactNode } from "react";

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
  children: ReactNode;
}) {
  const gradientId = `traced-${useId().replace(/:/g, "")}`;
  return (
    <div className={`relative isolate ${fill ? "h-full w-full" : ""}`} style={{ borderRadius }}>
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
        {LAYERS.map((l, i) => (
          // Base opacity on the <g> so the rect's own animation can fade it
          // out (each layer fades within its own, delayed, cycle).
          <g key={i} style={{ opacity: l.opacity }}>
          <rect
            x={1}
            y={1}
            rx={borderRadius}
            ry={borderRadius}
            pathLength={100}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={l.width}
            strokeLinecap="round"
            strokeDasharray="100 100"
            style={{
              width: "calc(100% - 2px)",
              height: "calc(100% - 2px)",
              filter: l.blur ? `blur(${l.blur}px)` : undefined,
              animation: `traced-border ${duration}s cubic-bezier(0.45, 0, 0.25, 1) ${l.delay}s infinite`,
              strokeDashoffset: 100,
              opacity: 0,
            }}
          />
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
        @media (prefers-reduced-motion: reduce) {
          @keyframes traced-border { 0%, 100% { stroke-dashoffset: 0; opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
