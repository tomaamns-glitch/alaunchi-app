import { useEffect, useRef } from "react";

// Plays a Lottie animation (an object from src/assets/decorations) as a purely
// decorative overlay. lottie-web's light SVG build is loaded on demand, so it
// only costs anything once a decoration that uses it is actually on screen.

type LottieModule = typeof import("lottie-web/build/player/lottie_light");
let lottiePromise: Promise<LottieModule["default"]> | null = null;
const loadLottie = () =>
  (lottiePromise ??= import("lottie-web/build/player/lottie_light").then((m) => m.default));

type Anim = {
  destroy: () => void;
  playSegments: (segment: [number, number], forceFlag: boolean) => void;
  goToAndStop: (frame: number, isFrame: boolean) => void;
};

export function LottieDecoration({
  load,
  once,
  replayKey = 0,
  speed = 1,
  className,
  style,
}: {
  /** Returns the animation JSON — e.g. `() => import("@/assets/decorations/vines.json")`. */
  load: () => Promise<{ default: unknown }>;
  /** Instead of looping: play frames 0 → `holdFrame` each time it comes on
   *  screen, stay on that frame, and replay every `replayEvery` seconds while
   *  it's still visible (fading the finished one out first). */
  once?: { holdFrame: number; replayEvery: number; fade?: boolean };
  /** Each change replays it now (clicking the icon): `once` → grow again,
   *  looping → restart from the first frame. */
  replayKey?: number;
  /** Playback speed (e.g. 3 = a 5.7 s animation in ~1.9 s). */
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const replayRef = useRef<() => void>(() => {});
  const holdFrame = once?.holdFrame;
  const replayEvery = once?.replayEvery;
  // Fade the finished one out before replaying — for animations that grow
  // from nothing. false = just restart (the frame is already there at frame 0).
  const fade = once?.fade ?? true;

  useEffect(() => {
    const el = ref.current;
    let anim: Anim | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let played = false;

    const play = () => {
      if (!anim || holdFrame === undefined || !el) return;
      const start = () => {
        el.style.opacity = "1";
        anim!.playSegments([0, holdFrame], true);
      };
      if (!played) {
        played = true;
        start();
        return;
      }
      if (!fade) return start();
      el.style.opacity = "0"; // quick fade of the finished one, then grow again
      fadeTimer = setTimeout(start, 350);
    };

    replayRef.current = () => {
      if (!anim) return;
      if (holdFrame !== undefined) {
        if (played) play();
      } else {
        (anim as any).goToAndPlay(0, true);
      }
    };

    const io =
      holdFrame !== undefined && el
        ? new IntersectionObserver(([e]) => {
            if (timer) clearInterval(timer);
            timer = null;
            if (!e.isIntersecting) return;
            play(); // (re)appeared on screen
            timer = setInterval(play, (replayEvery ?? 60) * 1000);
          })
        : null;

    Promise.all([loadLottie(), load()])
      .then(([lottie, data]) => {
        if (cancelled || !el) return;
        anim = lottie.loadAnimation({
          container: el,
          renderer: "svg",
          loop: holdFrame === undefined,
          autoplay: holdFrame === undefined,
          // Each player mutates its data while playing — never share one object.
          animationData: structuredClone(data.default),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        }) as unknown as Anim;
        if (speed !== 1) (anim as any).setSpeed(speed);
        if (io) {
          anim.goToAndStop(0, true);
          io.observe(el);
        }
      })
      .catch((e) => console.warn("[lottie-decoration]", e));
    return () => {
      cancelled = true;
      io?.disconnect();
      if (timer) clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
      anim?.destroy();
    };
  }, [load, holdFrame, replayEvery, fade, speed]);

  useEffect(() => {
    if (replayKey) replayRef.current();
  }, [replayKey]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
      style={{ pointerEvents: "none", transition: "opacity 300ms ease", ...style }}
    />
  );
}
