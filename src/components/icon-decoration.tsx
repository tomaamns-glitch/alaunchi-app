import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { subscribeIconDecoration } from "@/services/public-profile";
import { TracedBorder } from "@/components/traced-border";
import { LottieDecoration } from "@/components/lottie-decoration";
import { useProfileLook } from "@/hooks/use-profile-look";
import { cn } from "@/lib/utils";

// A player's head icon with their chosen icon decoration (decoration-catalog's
// ICON_DECORATIONS, saved as profiles/{uuid}/iconDecoration). The head itself
// keeps its exact size and place — the decoration is drawn around it and may
// spill a little outside, like Discord's avatar decorations — so wrapping an
// existing avatar never shifts the layout. Shown wherever a player's head is
// (chat, chat bubbles, friends, lists…), never on skins/characters.

/** How a Lottie animation (src/assets/decorations, all from LottieFiles under
 *  the Lottie Simple License — see NOTICE.md) sits around the head. Measured
 *  per animation, since each one leaves its hole somewhere else. */
interface LottieIcon {
  load: () => Promise<{ default: unknown }>;
  /** Animation box size ÷ head size. */
  scale: number;
  /** Where the head's centre falls inside the animation box (0..1). */
  cx: number;
  cy: number;
  /** Ring-shaped frames: the head is clipped to a circle to sit in the ring. */
  round?: boolean;
  /** Drawn behind the head (frames whose middle would cover the face). */
  behind?: boolean;
}

const LOTTIE_ICONS: Record<string, LottieIcon> = {
  vines: { load: () => import("@/assets/decorations/vines.json"), scale: 1.74, cx: 0.5, cy: 0.487 },
  "gold-stars": { load: () => import("@/assets/decorations/icon/wreath.json"), scale: 1.92, cx: 0.517, cy: 0.547, round: true },
  "wings-1": { load: () => import("@/assets/decorations/icon/avatar-b.json"), scale: 1.82, cx: 0.497, cy: 0.547, round: true },
  "wings-2": { load: () => import("@/assets/decorations/icon/avatar-c.json"), scale: 1.82, cx: 0.497, cy: 0.547, round: true },
  "wings-3": { load: () => import("@/assets/decorations/icon/avatar-a.json"), scale: 1.82, cx: 0.497, cy: 0.547, round: true },
  "orange-run": { load: () => import("@/assets/decorations/icon/square.json"), scale: 1.9, cx: 0.5, cy: 0.5 },
  flames: { load: () => import("@/assets/decorations/icon/flames.json"), scale: 1.85, cx: 0.507, cy: 0.503 },
  shapes: { load: () => import("@/assets/decorations/icon/frame-1x1.json"), scale: 1.7, cx: 0.5, cy: 0.5, behind: true },
  pastel: { load: () => import("@/assets/decorations/icon/yeye.json"), scale: 1.33, cx: 0.5, cy: 0.5 },
  "blue-hud": { load: () => import("@/assets/decorations/icon/blue-border.json"), scale: 1.45, cx: 0.5, cy: 0.5, round: true },
  circuit: { load: () => import("@/assets/decorations/icon/back-forth.json"), scale: 1.45, cx: 0.5, cy: 0.5, round: true, behind: true },
  "orange-ring": { load: () => import("@/assets/decorations/icon/loading.json"), scale: 5.4, cx: 0.5, cy: 0.497, round: true },
};

export function DecoratedIcon({
  decoration,
  size: fixedSize,
  radius: fixedRadius,
  className,
  children,
}: {
  decoration: string | undefined;
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
  const lottie = decoration ? LOTTIE_ICONS[decoration] : undefined;
  const decorated = decoration === "traced" || !!lottie;

  useLayoutEffect(() => {
    if (!decorated || fixedSize || !ref.current) return;
    const el = ref.current;
    const update = () => setMeasured(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [decorated, fixedSize]);

  if (!decorated && !className) return <>{children}</>;
  const size = fixedSize ?? measured;
  const radius = fixedRadius ?? size * 0.17;

  return (
    <div
      ref={ref}
      className={cn("relative shrink-0", fixedSize ? undefined : "inline-flex", className)}
      style={fixedSize ? { width: fixedSize, height: fixedSize } : undefined}
    >
      {/* The head; clipped to a circle inside ring-shaped frames. */}
      <div
        className={cn("relative z-[1] flex", fixedSize || className ? "h-full w-full" : undefined)}
        style={lottie?.round ? { clipPath: "circle(50% at 50% 50%)" } : undefined}
      >
        {children}
      </div>
      {size > 0 && decoration === "traced" && (
        <div className="pointer-events-none absolute z-[2]" style={{ inset: -Math.max(2, size * 0.08) }}>
          <TracedBorder
            fill
            borderRadius={radius + Math.max(2, size * 0.08)}
            strokeScale={Math.min(1, Math.max(0.45, size / 80))}
          >
            <span />
          </TracedBorder>
        </div>
      )}
      {size > 0 && lottie && (
        <LottieDecoration
          load={lottie.load}
          className={cn("absolute", lottie.behind ? "z-0" : "z-[2]")}
          style={{
            width: size * lottie.scale,
            height: size * lottie.scale,
            left: size / 2 - lottie.cx * size * lottie.scale,
            top: size / 2 - lottie.cy * size * lottie.scale,
          }}
        />
      )}
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
  children,
}: {
  uuid: string | null | undefined;
  size?: number;
  radius?: number;
  className?: string;
  children: ReactNode;
}) {
  return uuid ? (
    <LookDecoratedIcon uuid={uuid} size={size} radius={radius} className={className}>
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
