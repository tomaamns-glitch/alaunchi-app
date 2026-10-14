import { useEffect, useState, type ReactNode } from "react";
import { subscribeIconDecoration } from "@/services/public-profile";
import { TracedBorder } from "@/components/traced-border";
import { LottieDecoration } from "@/components/lottie-decoration";
import { useProfileLook } from "@/hooks/use-profile-look";

// A player's head icon with their chosen icon decoration (decoration-catalog's
// ICON_DECORATIONS, saved as profiles/{uuid}/iconDecoration). The head itself
// keeps its exact size and place — the decoration is drawn around it and may
// spill a little outside, like Discord's avatar decorations — so wrapping an
// existing avatar never shifts the layout.

/** LottieFiles "framing" (Lottie Simple License, see assets/decorations/NOTICE.md). */
const loadVines = () => import("@/assets/decorations/vines.json");
// The vine's opening is only about half of its 1:1 box: scaled so its arch and
// sides run along the head's edges, hugging it rather than covering it.
const VINE_SCALE = 1.74; // vine box / head size
const VINE_TOP = 0.348; // how far above the head the vine box starts (× head size)

export function DecoratedIcon({
  decoration,
  size,
  radius,
  children,
}: {
  decoration: string | undefined;
  /** The head's size in px. */
  size: number;
  /** The head's corner radius in px (to follow it with "Trazo"). */
  radius: number;
  /** The head avatar itself, `size`×`size`. */
  children: ReactNode;
}) {
  if (decoration === "traced") {
    const gap = Math.max(2, size * 0.08);
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {children}
        <div className="pointer-events-none absolute" style={{ inset: -gap }}>
          <TracedBorder fill borderRadius={radius + gap} strokeScale={Math.min(1, Math.max(0.45, size / 80))}>
            <span />
          </TracedBorder>
        </div>
      </div>
    );
  }
  if (decoration === "vines") {
    const vine = size * VINE_SCALE;
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {children}
        <LottieDecoration
          load={loadVines}
          className="absolute z-[1]"
          style={{ width: vine, height: vine, left: (size - vine) / 2, top: -VINE_TOP * size }}
        />
      </div>
    );
  }
  return <>{children}</>;
}

/** DecoratedIcon with someone's saved decoration, read once per session
 *  (useProfileLook — the same read list rows already do for banner/frame). */
export function PlayerDecoratedIcon({
  uuid,
  size,
  radius,
  children,
}: {
  uuid: string;
  size: number;
  radius: number;
  children: ReactNode;
}) {
  const look = useProfileLook(uuid);
  return (
    <DecoratedIcon decoration={look?.iconDecoration} size={size} radius={radius}>
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
