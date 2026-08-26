import { useEffect, useRef } from "react";
import { extractDominantColor, type HSL } from "@/lib/dominant-color";

// Must match --accent in index.css.
const DEFAULT_ACCENT: HSL = { h: 205, s: 90, l: 55 };

function parseAccent(value: string): HSL | null {
  const m = value.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return null;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Hues wrap around 360° — interpolate along the shorter arc (350→10 should
// move +20, not -340) so the transition never spins the wrong way around.
function lerpHue(a: number, b: number, t: number) {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/**
 * Retints the app's accent color (--accent) to match the dominant color of
 * the given image, animating smoothly between colors as it changes. Resets
 * to the default accent on unmount.
 */
export function useDynamicAccent(imageUrl: string | undefined | null) {
  const currentRef = useRef<HSL>(DEFAULT_ACCENT);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const existing = parseAccent(getComputedStyle(document.documentElement).getPropertyValue("--accent"));
    if (existing) currentRef.current = existing;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const animateTo = (target: HSL) => {
      const root = document.documentElement;
      const start = { ...currentRef.current };
      const duration = 600;
      const startTime = performance.now();

      if (frameRef.current) cancelAnimationFrame(frameRef.current);

      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const h = lerpHue(start.h, target.h, eased);
        const s = lerp(start.s, target.s, eased);
        const l = lerp(start.l, target.l, eased);
        const hsl = `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`;
        root.style.setProperty("--accent", hsl);
        // --primary-border and --ring default to a static orange (matching the
        // *default* accent) — without retinting them too, any accent-colored
        // button's border/focus ring clashes the moment the accent is retinted
        // away from orange (e.g. a purple modpack banner on an orange border).
        // Unlike --accent/--ring (raw "H S% L%" triples, wrapped in hsl() at the
        // point of use), --primary-border's CSS variable holds a complete color
        // function already, so it needs the hsl() wrapper applied here instead.
        root.style.setProperty("--primary-border", `hsl(${hsl})`);
        root.style.setProperty("--ring", hsl);
        currentRef.current = { h, s, l };
        if (t < 1) frameRef.current = requestAnimationFrame(step);
      };
      frameRef.current = requestAnimationFrame(step);
    };

    extractDominantColor(imageUrl).then((color) => {
      if (!cancelled) animateTo(color ?? DEFAULT_ACCENT);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      const root = document.documentElement;
      root.style.removeProperty("--accent");
      root.style.removeProperty("--primary-border");
      root.style.removeProperty("--ring");
    };
  }, []);
}
