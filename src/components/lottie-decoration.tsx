import { useEffect, useRef } from "react";

// Plays a Lottie animation (an object from src/assets/decorations) as a purely
// decorative overlay. lottie-web's light SVG build is loaded on demand, so it
// only costs anything once a decoration that uses it is actually on screen.

type LottieModule = typeof import("lottie-web/build/player/lottie_light");
let lottiePromise: Promise<LottieModule["default"]> | null = null;
const loadLottie = () =>
  (lottiePromise ??= import("lottie-web/build/player/lottie_light").then((m) => m.default));

export function LottieDecoration({
  load,
  className,
  style,
}: {
  /** Returns the animation JSON — e.g. `() => import("@/assets/decorations/vines.json")`. */
  load: () => Promise<{ default: unknown }>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let anim: { destroy: () => void } | null = null;
    let cancelled = false;
    Promise.all([loadLottie(), load()])
      .then(([lottie, data]) => {
        if (cancelled || !ref.current) return;
        anim = lottie.loadAnimation({
          container: ref.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          // Each player mutates its data while playing — never share one object.
          animationData: structuredClone(data.default),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
      })
      .catch((e) => console.warn("[lottie-decoration]", e));
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [load]);

  return <div ref={ref} aria-hidden className={className} style={{ pointerEvents: "none", ...style }} />;
}
