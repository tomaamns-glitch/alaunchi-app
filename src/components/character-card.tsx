import { useId, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
// Loaded on demand (three.js) — see components/lazy-heavy.tsx.
import { SkinViewerAnimated } from "@/components/lazy-heavy";
import type { SkinEffect } from "@/components/skin-viewer-animated";
import { ProfileFrame } from "@/components/profile-frame";

/** A player's character standing on a lit platform inside a card, with room
 *  below for actions (Personalizar, Volver…). The account menu's left column —
 *  your own (menu, Perfil, Personalizar) and someone else's profile — same
 *  size/spot in all of them so it never jumps when switching between them. */
export function CharacterCard({
  skinUrl,
  capeUrl,
  variant = "auto-detect",
  effect,
  badge,
  ready = true,
  loading = false,
  frame,
  frameColor,
  grid = false,
  viewer,
  children,
}: {
  skinUrl: string | null;
  capeUrl?: string | null;
  variant?: "slim" | "classic" | "auto-detect";
  effect: SkinEffect;
  /** Over the bottom of the character (Personalizar's "Vista previa"). */
  badge?: React.ReactNode;
  /** The panel finished opening — only then is the viewer mounted. */
  ready?: boolean;
  /** No skin yet but one is coming: a spinner on the platform. */
  loading?: boolean;
  /** The profile frame, drawn round this card too (Editar perfil → "Aplicar al personaje"). */
  frame?: string | null;
  frameColor?: string | null;
  /** A grid ("malla") over the card's whole background (Personalizar). */
  grid?: boolean;
  /** Elytra / frozen-animation controls of the 3D viewer (Personalizar). */
  viewer?: { elytra?: boolean; paused?: boolean };
  children?: React.ReactNode;
}) {
  const framed = !!frame && frame !== "none";
  // The card is much taller than the character's box, so falling particles
  // (leaves, petals, snow…) used to pop in mid-air at the box's top. The
  // viewer draws up to the card's top edge (which clips it, rounded) and they
  // start from there. Measured, rounded to 8px so it doesn't rebuild the scene
  // on every pixel of change.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  // null until measured: the viewer rebuilds its whole WebGL scene whenever
  // extendTop changes, so it's only mounted once the value is known (it used to
  // be built with 0 and rebuilt right away). Later changes (the profile card
  // filling in) are debounced so a burst of resizes costs one rebuild at most.
  const [extendTop, setExtendTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const panel = cardRef.current;
    if (!box || !panel) return;
    const measure = () => {
      const gap = box.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      setExtendTop(Math.max(0, Math.round(gap / 8) * 8));
    };
    measure();
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    });
    ro.observe(panel);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, []);
  const card = (
    // One card for the character and its actions, as tall as the menu column
    // beside it (self-stretch) with the character standing at its bottom.
    <div
      ref={cardRef}
      className={`relative self-stretch shrink-0 flex flex-col items-center justify-end gap-4 px-4 pb-4 pt-3 rounded-md bg-black/25 border overflow-hidden ${
        frame === "electric" ? "border-transparent" : "border-white/10"
      }`}
    >
      {grid && (
        // A mesh behind everything: fine accent lines on a 16px grid, fading out
        // towards the card's edges so it reads as a backdrop, not a texture.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_45%,black_35%,transparent_95%)]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--accent) / 0.22) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent) / 0.22) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
      )}
      {/* A thin accent line along the top edge, brightest in the middle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]"
      />
      <div ref={boxRef} className="relative w-[190px] h-[254px]">
        {/* A soft glow behind the character and its particles (the viewer's canvas
            is transparent), breathing slowly — left out on the mesh (Personalizar). Larger than the box, but it has
            faded out by the time it would reach the menu's buttons. */}
        {!grid && (
          <motion.div
            aria-hidden
            animate={reduceMotion ? undefined : { opacity: [0.7, 1, 0.7], scale: [0.97, 1.03, 0.97] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -left-[35px] -right-[35px] -top-[43px] -bottom-[43px] bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.32),transparent_70%)]"
          />
        )}
        {/* What it stands on: a holographic grid floor (FloorGrid). */}
        <FloorGrid />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[12px] left-1/2 -translate-x-1/2 h-3 w-20 rounded-[50%] bg-black/60 blur-[5px]"
        />
        {!skinUrl && loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-accent/60" />
          </div>
        )}
        {skinUrl && ready && extendTop !== null && (
          // Fades in, so it doesn't pop in after the panel has opened.
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <SkinViewerAnimated
              skinUrl={skinUrl}
              capeUrl={capeUrl}
              variant={variant}
              width={190}
              height={254}
              extendTop={effect === "none" ? 0 : extendTop}
              effect={effect}
              elytra={viewer?.elytra}
              paused={viewer?.paused}
              // Anchored to the box's bottom, growing upward out of it (the
              // extension is empty panel space above the column).
              className="absolute bottom-0 left-0 cursor-grab active:cursor-grabbing"
            />
          </motion.div>
        )}
        {badge}
      </div>
      {children}
    </div>
  );
  if (!framed) return card;
  // The frame as an overlay over the card (it clips its own content, and the
  // frame has to be able to glow outside it).
  return (
    <div className="relative self-stretch shrink-0 flex">
      {card}
      <div className="pointer-events-none absolute inset-0 z-10">
        <ProfileFrame frame={frame!} color={frameColor} fill>
          <span />
        </ProfileFrame>
      </div>
    </div>
  );
}

// The floor under the character: a grid drawn in real perspective (lines that
// converge towards the back and get closer together with distance), clipped
// to an ellipse and fading out at its back and sides, with a glowing rim and a
// soft light in the middle. SVG, so the lines stay crisp at any size.
const FLOOR = { w: 240, h: 64, cx: 120, cy: 40, rx: 114, ry: 20 };

function FloorGrid() {
  const id = useId().replace(/:/g, "");
  const { w, h, cx, cy, rx, ry } = FLOOR;
  const top = cy - ry;
  const bottom = cy + ry;
  // Lines running front → back, converging (each ends nearer the middle at the back).
  const radial = Array.from({ length: 13 }, (_, k) => {
    const i = k - 6;
    return { x1: cx + i * 30, y1: bottom + 6, x2: cx + i * 9, y2: top - 2 };
  });
  // Lines across, closer together the further back they are.
  const across = Array.from({ length: 7 }, (_, j) => top + (bottom - top) * Math.pow(j / 6, 1.7));
  const accent = "hsl(var(--accent))";
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 overflow-visible"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
        </clipPath>
        {/* Lines bright in front, gone at the back. */}
        <linearGradient id={`${id}-depth`} x1="0" y1={top} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: accent, stopOpacity: 0 }} />
          <stop offset="0.55" style={{ stopColor: accent, stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: accent, stopOpacity: 0.75 }} />
        </linearGradient>
        {/* …and fading out towards the sides. */}
        <radialGradient id={`${id}-fade`} cx={cx} cy={cy} r={rx} gradientUnits="userSpaceOnUse" gradientTransform={`translate(0 ${cy}) scale(1 ${ry / rx}) translate(0 ${-cy})`}>
          <stop offset="0.45" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}-fade)`} />
        </mask>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: accent, stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: accent, stopOpacity: 0 }} />
        </radialGradient>
        <filter id={`${id}-blur`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Light pooled in the middle. */}
      <ellipse cx={cx} cy={cy} rx={rx * 0.75} ry={ry * 0.9} fill={`url(#${id}-glow)`} />

      <g clipPath={`url(#${id}-clip)`} mask={`url(#${id}-mask)`} stroke={`url(#${id}-depth)`} strokeWidth={0.8} fill="none">
        {radial.map((l, k) => (
          <line key={`r${k}`} {...l} />
        ))}
        {across.map((y, k) => (
          <line key={`a${k}`} x1={cx - rx} y1={y} x2={cx + rx} y2={y} />
        ))}
      </g>

      {/* The rim: a blurred glow under a thin line, brighter in front. */}
      <g mask={`url(#${id}-mask)`}>
        <ellipse cx={cx} cy={cy} rx={rx - 1} ry={ry - 0.5} fill="none" stroke={accent} strokeOpacity={0.55} strokeWidth={3} filter={`url(#${id}-blur)`} />
        <ellipse cx={cx} cy={cy} rx={rx - 1} ry={ry - 0.5} fill="none" stroke={`url(#${id}-depth)`} strokeWidth={1} />
      </g>

    </svg>
  );
}
