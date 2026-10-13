import { useEffect, useMemo, useState } from "react";
import SwellLight from "@/components/swell-light";
import { StaticGlow } from "@/components/static-glow";
import { useAnimatedBackground } from "@/lib/animated-background";
import { useTheme } from "@/lib/theme";
import { extractDominantColor, type HSL } from "@/lib/dominant-color";

/**
 * The app's page background: soft light rolling across the window, with a
 * glowing trail behind the cursor (components/swell-light.tsx), or a static
 * glow when animated backgrounds are off in Ajustes. Absolutely positioned —
 * the parent must be `relative` and put its content above it (z-10).
 *
 * Blue by default (the Hub); with `tintFrom` (an instance's icon) it takes that
 * image's dominant color instead, like the instance manager does.
 */
export function AppBackground({ tintFrom }: { tintFrom?: string }) {
  const theme = useTheme((s) => s.theme);
  const animatedBackground = useAnimatedBackground((s) => s.enabled);
  const [iconHsl, setIconHsl] = useState<HSL | null>(null);

  useEffect(() => {
    if (!tintFrom) return;
    let cancelled = false;
    setIconHsl(null);
    extractDominantColor(tintFrom).then((hsl) => {
      if (!cancelled) setIconHsl(hsl ?? { h: 205, s: 90, l: 55 }); // --accent's default
    });
    return () => {
      cancelled = true;
    };
  }, [tintFrom]);

  const colors = useMemo(() => {
    if (tintFrom && iconHsl) {
      const { h, s, l } = iconHsl;
      // Same rules as the instance manager: on light a darker tone with dark
      // highlights; on dark a mid tone with pale ones. Clamped so very dark or
      // pale icons still glow.
      return theme === "light"
        ? { color: `hsl(${h} ${s}% ${Math.min(l, 44)}%)`, glint: `hsl(${h} ${s}% 18%)` }
        : { color: `hsl(${h} ${Math.max(s, 55)}% ${Math.min(Math.max(l, 45), 62)}%)`, glint: `hsl(${h} ${s}% 78%)` };
    }
    return theme === "light"
      ? { color: "hsl(208 92% 44%)", glint: "#0b2f5c" }
      : { color: "#259DF4", glint: "#7fc4ff" };
  }, [tintFrom, iconHsl, theme]);

  // Tinted: nothing until the color is known, so it never flashes blue first.
  if (tintFrom && !iconHsl) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ opacity: theme === "light" ? 0.6 : 0.9 }}
      aria-hidden
    >
      {animatedBackground ? (
        <SwellLight
          key={`${theme}-${colors.color}`}
          color={colors.color}
          glintColor={colors.glint}
          // Mostly dark: only the crests of the swell light up, highlights
          // stay faint, and the cursor leaves a small, short trail.
          contrast={2.2}
          glint={0.3}
          cursorSize={18}
          cursorStrength={0.6}
          trail={0.9}
        />
      ) : (
        <StaticGlow color={colors.color} />
      )}
    </div>
  );
}
