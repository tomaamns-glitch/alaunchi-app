// Colours of the icon decorations that can be recoloured (Editar perfil →
// Avatar), saved as profiles/{uuid}/iconColors in one string so each keeps its
// own: "traced:#4ade80,#ff9436|orange-run:#22d3ee|flames:#a855f7|orange-ring:#ef4444".

export const RECOLORABLE_ICONS = ["traced", "orange-run", "flames", "orange-ring"] as const;
export type RecolorableIcon = (typeof RECOLORABLE_ICONS)[number];

/** Gradient pairs for "Trazo" (same as the banner frame's). */
export const ICON_TRACED_COMBOS: { from: string; to: string; label: string }[] = [
  { from: "#4ade80", to: "#ff9436", label: "ALaunchi" },
  { from: "#facc15", to: "#ef4444", label: "Fuego" },
  { from: "#22d3ee", to: "#3b82f6", label: "Océano" },
  { from: "#f472b6", to: "#fb923c", label: "Atardecer" },
  { from: "#a855f7", to: "#22d3ee", label: "Neón" },
  { from: "#bef264", to: "#15803d", label: "Bosque" },
  { from: "#ffffff", to: "#7dd3fc", label: "Hielo" },
  { from: "#ec4899", to: "#8b5cf6", label: "Galaxia" },
];

/** Single colours for Recorrido, Giro naranja and Fuego. Fuego is shifted by
 *  hue from its orange, so it gets no white. */
export const ICON_SINGLE_COLORS: { color: string; label: string }[] = [
  { color: "#ff6f00", label: "Naranja" },
  { color: "#ef4444", label: "Rojo" },
  { color: "#ec4899", label: "Rosa" },
  { color: "#a855f7", label: "Morado" },
  { color: "#3b82f6", label: "Azul" },
  { color: "#22d3ee", label: "Cian" },
  { color: "#22c55e", label: "Verde" },
  { color: "#facc15", label: "Amarillo" },
];

/** Each decoration's colours as they look when nothing was chosen. */
export const ICON_DEFAULT_COLORS: Record<RecolorableIcon, string[]> = {
  traced: ["#4ade80", "#ff9436"],
  "orange-run": ["#ff6f00"],
  flames: ["#ff5a00"],
  "orange-ring": ["#ff8e3a"],
};

const HEX = /^#[0-9a-f]{6}$/i;

export function parseIconColors(value: string | null | undefined): Partial<Record<RecolorableIcon, string[]>> {
  const out: Partial<Record<RecolorableIcon, string[]>> = {};
  if (!value) return out;
  for (const part of value.split("|")) {
    const [key, payload = ""] = part.split(":");
    if (!(RECOLORABLE_ICONS as readonly string[]).includes(key)) continue;
    const colors = payload.split(",").filter((c) => HEX.test(c));
    const need = key === "traced" ? 2 : 1;
    if (colors.length >= need) out[key as RecolorableIcon] = colors.slice(0, need);
  }
  return out;
}

export function serializeIconColors(colors: Partial<Record<RecolorableIcon, string[]>>): string {
  return RECOLORABLE_ICONS.filter((k) => colors[k]?.length)
    .map((k) => `${k}:${colors[k]!.join(",")}`)
    .join("|");
}

/** The colours to draw `decoration` with (its saved ones, or its defaults). */
export function iconColorsFor(decoration: string | undefined, value: string | null | undefined): string[] | undefined {
  if (!decoration || !(RECOLORABLE_ICONS as readonly string[]).includes(decoration)) return undefined;
  return parseIconColors(value)[decoration as RecolorableIcon] ?? ICON_DEFAULT_COLORS[decoration as RecolorableIcon];
}

function hue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** CSS filter that turns Fuego's orange flames (a Lottie, fixed colours) into
 *  `color`'s hue. */
export function flamesFilter(color: string): string | undefined {
  const delta = Math.round(hue(color) - hue(ICON_DEFAULT_COLORS.flames[0]));
  return delta ? `hue-rotate(${delta}deg) saturate(1.15)` : undefined;
}
