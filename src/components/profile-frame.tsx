import type { ReactNode } from "react";
import { ElectricBorder } from "@/components/electric-border";
import { TracedBorder } from "@/components/traced-border";

/** The animated border around a profile card, chosen from decoration-catalog's
 *  FRAME_DECORATIONS. "none" just renders the card as-is. */
export const DEFAULT_ELECTRIC_COLOR = "#ff9436";

/** The colours offered for the electric frame (Editar perfil → Marco). */
export const ELECTRIC_COLORS: { color: string; label: string }[] = [
  { color: "#ff9436", label: "Naranja" },
  { color: "#ef4444", label: "Rojo" },
  { color: "#ec4899", label: "Rosa" },
  { color: "#a855f7", label: "Morado" },
  { color: "#3b82f6", label: "Azul" },
  { color: "#22d3ee", label: "Cian" },
  { color: "#22c55e", label: "Verde" },
  { color: "#facc15", label: "Amarillo" },
  { color: "#f5f5f5", label: "Blanco" },
];

/** Gradient combinations offered for the "Trazo" frame. */
export const TRACED_COMBOS: { from: string; to: string; label: string }[] = [
  { from: "#4ade80", to: "#ff9436", label: "ALaunchi" },
  { from: "#facc15", to: "#ef4444", label: "Fuego" },
  { from: "#22d3ee", to: "#3b82f6", label: "Océano" },
  { from: "#f472b6", to: "#fb923c", label: "Atardecer" },
  { from: "#a855f7", to: "#22d3ee", label: "Neón" },
  { from: "#bef264", to: "#15803d", label: "Bosque" },
  { from: "#ffffff", to: "#7dd3fc", label: "Hielo" },
  { from: "#ec4899", to: "#8b5cf6", label: "Galaxia" },
];
export const DEFAULT_TRACED = TRACED_COMBOS[0];

/** profiles/{uuid}/frameColor keeps each frame's colour, so switching frames
 *  never loses the other's: "electric:#ff9436|traced:#4ade80,#ff9436". A bare
 *  "#rrggbb" (how it was stored at first) is the electric colour. */
export interface FrameColors {
  electric?: string;
  traced?: { from: string; to: string };
}

const HEX = /^#[0-9a-f]{6}$/i;

export function parseFrameColors(value: string | null | undefined): FrameColors {
  const out: FrameColors = {};
  if (!value) return out;
  if (HEX.test(value)) return { electric: value };
  for (const part of value.split("|")) {
    const [key, payload = ""] = part.split(":");
    if (key === "electric" && HEX.test(payload)) out.electric = payload;
    if (key === "traced") {
      const [from, to] = payload.split(",");
      if (HEX.test(from ?? "") && HEX.test(to ?? "")) out.traced = { from, to };
    }
  }
  return out;
}

export function serializeFrameColors(colors: FrameColors): string {
  const parts: string[] = [];
  if (colors.electric) parts.push(`electric:${colors.electric}`);
  if (colors.traced) parts.push(`traced:${colors.traced.from},${colors.traced.to}`);
  return parts.join("|");
}

export function ProfileFrame({
  frame,
  color,
  // rounded-md (6px): the radius every profile card uses — with 12 the stroke
  // curved wider than the card and left gaps at its corners.
  borderRadius = 6,
  fill = false,
  children,
}: {
  frame: string | undefined;
  /** profiles/{uuid}/frameColor as stored (see parseFrameColors). */
  color?: string | null;
  /** Match the wrapped card's corners (px). */
  borderRadius?: number;
  /** Take the parent's full size (drawn as an overlay over something). */
  fill?: boolean;
  children: ReactNode;
}) {
  if (frame === "electric") {
    return (
      // Calmer than the component's defaults: slower crackle, gentler wobble
      // and about half the glow — at full strength it saturated the card.
      <ElectricBorder className={fill ? "h-full w-full" : undefined} borderRadius={borderRadius} color={parseFrameColors(color).electric || DEFAULT_ELECTRIC_COLOR} chaos={0.065} speed={0.38} intensity={0.5}>
        {children}
      </ElectricBorder>
    );
  }
  if (frame === "traced") {
    const combo = parseFrameColors(color).traced ?? DEFAULT_TRACED;
    return (
      <TracedBorder fill={fill} borderRadius={borderRadius} from={combo.from} to={combo.to} strokeScale={0.7}>
        {children}
      </TracedBorder>
    );
  }
  return <>{children}</>;
}
