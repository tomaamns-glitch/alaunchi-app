import type { CSSProperties } from "react";

// Small animated preview of each character decoration (decoration-catalog's
// AVATAR_DECORATIONS) for the picker grid — drawn with CSS, not with the 3D
// viewer: 22 WebGL scenes at once would blow the browser's context limit.
// Colours and motion roughly follow each effect's particles.

type Motion = "fall" | "rise" | "float" | "twinkle" | "inward" | "low";

interface Swatch {
  colors: string[];
  motion: Motion;
  /** Particle size in px. */
  size?: number;
  /** Seconds per cycle. */
  speed?: number;
  /** Background tint behind the particles. */
  glow?: string;
}

const SWATCHES: Record<string, Swatch> = {
  "cherry-petals": { colors: ["#f9a8d4", "#f472b6", "#fbcfe8"], motion: "fall", size: 5, speed: 4 },
  fireflies: { colors: ["#d9f99d", "#facc15", "#bef264"], motion: "twinkle", size: 3, speed: 2.4, glow: "#1e293b" },
  "pale-garden": { colors: ["#d6d3d1", "#a8a29e", "#e7e5e4"], motion: "fall", size: 5, speed: 5 },
  "falling-leaves": { colors: ["#4ade80", "#16a34a", "#86efac"], motion: "fall", size: 5, speed: 4.2 },
  "spore-blossom": { colors: ["#86efac", "#f9a8d4", "#bbf7d0"], motion: "float", size: 3, speed: 5 },
  snowfall: { colors: ["#ffffff", "#e0f2fe", "#f1f5f9"], motion: "fall", size: 3, speed: 5 },
  "crimson-spores": { colors: ["#ef4444", "#b91c1c", "#f87171"], motion: "float", size: 3, speed: 5, glow: "#7f1d1d" },
  "warped-spores": { colors: ["#2dd4bf", "#14b8a6", "#5eead4"], motion: "rise", size: 3, speed: 5, glow: "#134e4a" },
  ash: { colors: ["#9ca3af", "#6b7280", "#d1d5db"], motion: "fall", size: 2, speed: 6 },
  souls: { colors: ["#a5f3fc", "#67e8f9", "#cffafe"], motion: "rise", size: 4, speed: 3.2, glow: "#164e63" },
  enchant: { colors: ["#c4b5fd", "#a78bfa", "#ddd6fe"], motion: "inward", size: 4, speed: 2.6 },
  portal: { colors: ["#a855f7", "#7e22ce", "#d8b4fe"], motion: "float", size: 3, speed: 3, glow: "#3b0764" },
  "end-rod": { colors: ["#ffffff", "#fef9c3", "#f5f5f4"], motion: "twinkle", size: 3, speed: 2 },
  glow: { colors: ["#5eead4", "#2dd4bf", "#99f6e4"], motion: "twinkle", size: 3, speed: 2.2, glow: "#042f2e" },
  "sculk-souls": { colors: ["#22d3ee", "#0891b2", "#67e8f9"], motion: "rise", size: 4, speed: 3.6, glow: "#083344" },
  notes: { colors: ["#f472b6", "#facc15", "#4ade80", "#60a5fa"], motion: "rise", size: 4, speed: 3 },
  "electric-spark": { colors: ["#e0f2fe", "#38bdf8", "#fde68a"], motion: "twinkle", size: 2, speed: 0.9 },
  hearts: { colors: ["#f43f5e", "#fb7185", "#e11d48"], motion: "rise", size: 5, speed: 3 },
  "dragon-breath": { colors: ["#c084fc", "#a855f7", "#e9d5ff"], motion: "low", size: 6, speed: 3.4, glow: "#581c87" },
  campfire: { colors: ["#fb923c", "#f97316", "#9ca3af"], motion: "rise", size: 4, speed: 2.4, glow: "#7c2d12" },
};

const COUNT = 9;

/** Deterministic pseudo-random in [0,1) so every swatch keeps its layout. */
function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function particleStyle(sw: Swatch, i: number, idSeed: number): CSSProperties {
  const r1 = rand(idSeed + i * 3.1);
  const r2 = rand(idSeed + i * 7.7);
  const r3 = rand(idSeed + i * 13.3);
  const size = (sw.size ?? 4) * (0.7 + r3 * 0.6);
  const speed = (sw.speed ?? 3) * (0.8 + r2 * 0.4);
  const delay = -r1 * speed;
  const base: CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: sw.motion === "fall" && (sw.size ?? 4) >= 5 ? "60% 0 60% 0" : "9999px",
    background: sw.colors[i % sw.colors.length],
    boxShadow: `0 0 ${size * 1.5}px ${sw.colors[i % sw.colors.length]}`,
    animation: `swatch-${sw.motion} ${speed}s ${sw.motion === "twinkle" ? "ease-in-out" : "linear"} ${delay}s infinite`,
  };
  if (sw.motion === "low") return { ...base, left: `${10 + r1 * 80}%`, bottom: `${4 + r2 * 18}%`, opacity: 0.7 };
  if (sw.motion === "inward") return { ...base, left: `${r1 * 90}%`, top: `${r2 * 90}%` };
  if (sw.motion === "twinkle" || sw.motion === "float") return { ...base, left: `${5 + r1 * 85}%`, top: `${8 + r2 * 80}%` };
  return { ...base, left: `${5 + r1 * 85}%`, top: sw.motion === "fall" ? "-10%" : "100%" };
}

export function EffectSwatch({ id, className = "" }: { id: string; className?: string }) {
  const sw = SWATCHES[id];
  const seed = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return (
    <div className={`relative overflow-hidden bg-black/40 ${className}`} aria-hidden>
      {sw?.glow && (
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: `radial-gradient(ellipse at center, ${sw.glow}, transparent 70%)` }}
        />
      )}
      {/* The character's spot: a soft silhouette in the middle. */}
      <div className="absolute left-1/2 top-[22%] h-[56%] w-[18%] -translate-x-1/2 rounded-sm bg-white/10" />
      {sw ? (
        Array.from({ length: COUNT }, (_, i) => <span key={i} style={particleStyle(sw, i, seed)} />)
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">—</span>
      )}
    </div>
  );
}
