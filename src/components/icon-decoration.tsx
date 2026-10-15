import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { subscribeIconDecoration } from "@/services/public-profile";
import { TracedBorder } from "@/components/traced-border";
import { LottieDecoration } from "@/components/lottie-decoration";
import { RemappedLottie, type RingSource } from "@/components/remapped-lottie";
import { useProfileLook } from "@/hooks/use-profile-look";
import { cn } from "@/lib/utils";

// A player's head icon with their chosen icon decoration (decoration-catalog's
// ICON_DECORATIONS, saved as profiles/{uuid}/iconDecoration). The head itself
// keeps its exact size and place — the decoration is drawn around it and may
// spill a little outside, like Discord's avatar decorations — so wrapping an
// existing avatar never shifts the layout. Shown wherever a player's head is
// (chat, chat bubbles, friends, lists…), never on skins/characters.

/** The vine: an arch rather than a ring, drawn as-is (SVG) around the head. */
const loadVines = () => import("@/assets/decorations/vines.json");
// Sized so the arch and sides run along the head's edges, over them a little,
// instead of floating outside.
const VINE_SCALE = 1.5; // vine box / head size
const VINE_CX = 0.5; // head centre inside the vine box
const VINE_CY = 0.49;
// Like "Trazo": grows when it comes on screen and every minute, and stays
// grown in between. The animation is fully grown from ~frame 76 until it
// starts retracting at 108 — it stops at 90.
const VINE_ONCE = { holdFrame: 90, replayEvery: 60 };

/** Frame animations from LottieFiles (Lottie Simple License, see
 *  assets/decorations/NOTICE.md), re-projected as a thin square band around
 *  the head (remapped-lottie.tsx). `source` = where each one's ring sits in
 *  its own box (measured per animation); `band` = how thick it ends up on
 *  each side, × head size. */
/** Frames kept exactly as the original animation (not re-projected): a ring
 *  around the head, which is clipped to a circle to sit inside it. `scale` =
 *  animation box ÷ head size; `cx`/`cy` = where the head's centre falls in it. */
const ROUND_ICONS: Record<
  string,
  {
    load: () => Promise<{ default: unknown }>;
    scale: number;
    cx: number;
    cy: number;
    /** Like Trazo/Enredadera: plays when it comes on screen, every minute and
     *  on click, then rests on `holdFrame`. */
    once: { holdFrame: number; replayEvery: number; fade?: boolean };
  }
> = {
  // The ring and stars are there from frame 0; the sparkles and the shine
  // sweep end by frame 99 — so it rests there and replays without fading.
  "gold-stars": {
    load: () => import("@/assets/decorations/icon/wreath.json"),
    scale: 1.82,
    cx: 0.5,
    cy: 0.53,
    once: { holdFrame: 99, replayEvery: 60, fade: false },
  },
};

const FRAME_ICONS: Record<string, { load: () => Promise<{ default: unknown }>; source: RingSource; band: number }> = {
  "wings-1": { load: () => import("@/assets/decorations/icon/avatar-b.json"), source: { shape: "round", cx: 0.497, cy: 0.547, rin: 0.265, rout: 0.45 }, band: 0.18 },
  "wings-2": { load: () => import("@/assets/decorations/icon/avatar-c.json"), source: { shape: "round", cx: 0.497, cy: 0.547, rin: 0.265, rout: 0.45 }, band: 0.18 },
  "wings-3": { load: () => import("@/assets/decorations/icon/avatar-a.json"), source: { shape: "round", cx: 0.497, cy: 0.547, rin: 0.265, rout: 0.45 }, band: 0.18 },
  "orange-run": { load: () => import("@/assets/decorations/icon/square.json"), source: { shape: "square", cx: 0.5, cy: 0.5, rin: 0.24, rout: 0.27 }, band: 0.1 },
  flames: { load: () => import("@/assets/decorations/icon/flames.json"), source: { shape: "square", cx: 0.507, cy: 0.503, rin: 0.26, rout: 0.37 }, band: 0.15 },
  shapes: { load: () => import("@/assets/decorations/icon/frame-1x1.json"), source: { shape: "square", cx: 0.5, cy: 0.5, rin: 0.3, rout: 0.5 }, band: 0.11 },
  pastel: { load: () => import("@/assets/decorations/icon/yeye.json"), source: { shape: "square", cx: 0.5, cy: 0.5, rin: [0.43, 0.37], rout: [0.5, 0.43] }, band: 0.1 },
  "blue-hud": { load: () => import("@/assets/decorations/icon/blue-border.json"), source: { shape: "round", cx: 0.5, cy: 0.5, rin: 0.33, rout: 0.45 }, band: 0.13 },
  circuit: { load: () => import("@/assets/decorations/icon/back-forth.json"), source: { shape: "round", cx: 0.5, cy: 0.5, rin: 0.38, rout: 0.45 }, band: 0.12 },
  "orange-ring": { load: () => import("@/assets/decorations/icon/loading.json"), source: { shape: "round", cx: 0.5, cy: 0.497, rin: 0.09, rout: 0.15 }, band: 0.08 },
};

export function DecoratedIcon({
  decoration,
  size: fixedSize,
  radius: fixedRadius,
  className,
  replayKey,
  children,
}: {
  decoration: string | undefined;
  /** Each change replays the decoration (e.g. the chat contact just selected). */
  replayKey?: number;
  /** The head's size in px — measured from the wrapper when omitted. */
  size?: number;
  /** The head's corner radius in px (for "Trazo"); ~rounded-md by default. */
  radius?: number;
  /** Classes for the wrapper — sizing/positioning the head had on itself
   *  (e.g. `h-full w-full`, or `absolute -bottom-1 -right-1`). */
  className?: string;
  /** The head avatar itself. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  const frame = decoration ? FRAME_ICONS[decoration] : undefined;
  const round = decoration ? ROUND_ICONS[decoration] : undefined;
  const decorated = decoration === "traced" || decoration === "vines" || !!frame || !!round;

  useLayoutEffect(() => {
    if (!decorated || fixedSize || !ref.current) return;
    const el = ref.current;
    const update = () => setMeasured(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [decorated, fixedSize]);

  // Replays: clicking the button/link the icon sits in, or a new `replayKey`.
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    if (!decorated) return;
    const target = ref.current?.closest("button, a, [role='button']");
    if (!target) return;
    const onClick = () => setReplay((r) => r + 1);
    target.addEventListener("click", onClick);
    return () => target.removeEventListener("click", onClick);
  }, [decorated]);
  useEffect(() => {
    if (replayKey) setReplay((r) => r + 1);
  }, [replayKey]);

  if (!decorated && !className) return <>{children}</>;
  const size = fixedSize ?? measured;
  const radius = fixedRadius ?? size * 0.17;

  return (
    <div
      ref={ref}
      className={cn("relative shrink-0", fixedSize ? undefined : "inline-flex", className)}
      style={fixedSize ? { width: fixedSize, height: fixedSize } : undefined}
    >
      {round ? (
        // The head, clipped to a circle to sit inside the ring.
        <div
          className={cn("flex", fixedSize || className ? "h-full w-full" : undefined)}
          style={{ clipPath: "circle(50% at 50% 50%)" }}
        >
          {children}
        </div>
      ) : (
        children
      )}
      {size > 0 && decoration === "traced" && <TracedIcon size={size} radius={radius} replayKey={replay} />}
      {size > 0 && round && (
        <LottieDecoration
          load={round.load}
          once={round.once}
          replayKey={replay}
          className="absolute z-[2]"
          style={{
            width: size * round.scale,
            height: size * round.scale,
            left: size / 2 - round.cx * size * round.scale,
            top: size / 2 - round.cy * size * round.scale,
          }}
        />
      )}
      {size > 0 && frame && (
        <RemappedLottie load={frame.load} source={frame.source} head={size} band={frame.band} replayKey={replay} />
      )}
      {size > 0 && decoration === "vines" && (
        <LottieDecoration
          load={loadVines}
          once={VINE_ONCE}
          replayKey={replay}
          className="absolute z-[2]"
          style={{
            width: size * VINE_SCALE,
            height: size * VINE_SCALE,
            left: size / 2 - VINE_CX * size * VINE_SCALE,
            top: size / 2 - VINE_CY * size * VINE_SCALE,
          }}
        />
      )}
    </div>
  );
}

/** "Trazo" hugging the head: the stroke's inner edge sits half a pixel over
 *  the head's edge (no gap) and its corners follow the head's rounding.
 *  TracedBorder draws its rect 1px inside its box, centred on that line. */
function TracedIcon({ size, radius, replayKey }: { size: number; radius: number; replayKey: number }) {
  // Never thinner than ~1.5px: on the 24px account button it used to shrink
  // below a pixel and all but vanish.
  const k = Math.min(1, Math.max(0.75, size / 64));
  const half = 2 * k / 2; // half of the main stroke's width (2px × k)
  const outset = half - 0.5 + 1; // stroke centre just outside the edge, + the rect's 1px inset
  return (
    <div className="pointer-events-none absolute z-[2]" style={{ inset: -outset }}>
      <TracedBorder fill borderRadius={radius + half - 0.5} strokeScale={k} replayEvery={60} replayKey={replayKey}>
        <span />
      </TracedBorder>
    </div>
  );
}

/** DecoratedIcon with someone's saved decoration, read once per session
 *  (useProfileLook — the same read list rows already do for banner/frame;
 *  your own refreshes right after you change it in Personalizar). */
export function PlayerDecoratedIcon({
  uuid,
  size,
  radius,
  className,
  replayKey,
  children,
}: {
  uuid: string | null | undefined;
  size?: number;
  radius?: number;
  className?: string;
  replayKey?: number;
  children: ReactNode;
}) {
  return uuid ? (
    <LookDecoratedIcon uuid={uuid} size={size} radius={radius} className={className} replayKey={replayKey}>
      {children}
    </LookDecoratedIcon>
  ) : (
    <DecoratedIcon decoration="none" className={className}>
      {children}
    </DecoratedIcon>
  );
}

function LookDecoratedIcon({
  uuid,
  children,
  ...rest
}: {
  uuid: string;
  size?: number;
  radius?: number;
  className?: string;
  replayKey?: number;
  children: ReactNode;
}) {
  const look = useProfileLook(uuid);
  return (
    <DecoratedIcon decoration={look?.iconDecoration} {...rest}>
      {children}
    </DecoratedIcon>
  );
}

/** Live icon-decoration id of one player (your own head in the account menu:
 *  a pick in Personalizar shows up right away). */
export function useLiveIconDecoration(uuid: string | null | undefined): string {
  const [id, setId] = useState("none");
  useEffect(() => {
    if (!uuid) {
      setId("none");
      return;
    }
    return subscribeIconDecoration(uuid, setId);
  }, [uuid]);
  return id;
}
