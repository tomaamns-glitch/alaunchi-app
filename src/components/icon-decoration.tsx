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

/** LottieFiles "framing" (Lottie Simple License, see assets/decorations/NOTICE.md). */
const loadVines = () => import("@/assets/decorations/vines.json");
// The vine's opening is only about half of its 1:1 box: scaled so its arch and
// sides run along the head's edges, hugging it rather than covering it.
const VINE_SCALE = 1.74; // vine box / head size
const VINE_TOP = 0.348; // how far above the head the vine box starts (× head size)

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
  const decorated = decoration === "traced" || decoration === "vines";

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
      {children}
      {decorated && size > 0 && decoration === "traced" && (
        <div className="pointer-events-none absolute" style={{ inset: -Math.max(2, size * 0.08) }}>
          <TracedBorder
            fill
            borderRadius={radius + Math.max(2, size * 0.08)}
            strokeScale={Math.min(1, Math.max(0.45, size / 80))}
          >
            <span />
          </TracedBorder>
        </div>
      )}
      {decorated && size > 0 && decoration === "vines" && (
        <LottieDecoration
          load={loadVines}
          className="absolute z-[1]"
          style={{
            width: size * VINE_SCALE,
            height: size * VINE_SCALE,
            left: (size - size * VINE_SCALE) / 2,
            top: -VINE_TOP * size,
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
