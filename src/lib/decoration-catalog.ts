import type { SkinEffect } from "@/components/skin-viewer-animated";

// The profile cosmetics library. Two independent slots the owner picks from in
// the "Personalizar" dialog; the choice syncs to the public profile so friends
// see it too.
//
//  - avatarDecoration → SkinViewerAnimated's `effect` prop (same ids)
//  - frame            → <ProfileFrame> around the profile card

export interface AvatarDecoration {
  id: string;
  label: string;
  description: string;
}

export interface FrameDecoration {
  id: string;
  label: string;
  description: string;
}

export const AVATAR_DECORATIONS: AvatarDecoration[] = [
  { id: "none", label: "Sin decoración", description: "El personaje sin efectos." },
  { id: "cherry-petals", label: "Pétalos de cerezo", description: "Pétalos rosas cayendo por detrás." },
  { id: "soul-fire", label: "Fuego de alma", description: "Llamas azules alrededor del personaje." },
  { id: "fireflies", label: "Luciérnagas", description: "Luciérnagas de noche parpadeando alrededor." },
  // Overworld
  { id: "pale-garden", label: "Jardín pálido", description: "Hojas de roble pálido cayendo." },
  { id: "falling-leaves", label: "Hojas de árbol", description: "Hojas verdes cayendo, como bajo cualquier árbol." },
  { id: "spore-blossom", label: "Flor de esporas", description: "Esporas flotando, como en las cuevas frondosas." },
  { id: "snowfall", label: "Nevada", description: "Copos de nieve cayendo." },
  // Nether
  { id: "crimson-spores", label: "Bosque carmesí", description: "Esporas rojas flotando." },
  { id: "warped-spores", label: "Bosque distorsionado", description: "Esporas turquesa subiendo." },
  { id: "ash", label: "Ceniza", description: "Ceniza cayendo, como en el valle de almas y los deltas de basalto." },
  { id: "souls", label: "Almas", description: "Almas escapando hacia arriba, como con velocidad de alma." },
  // Magia y bloques
  { id: "enchant", label: "Runas de encantamiento", description: "Runas volando hacia ti, como en la mesa de encantamientos." },
  { id: "portal", label: "Portal", description: "Partículas moradas del portal del Nether y los endermen." },
  { id: "end-rod", label: "Vara del End", description: "Destellos blancos flotando y parpadeando." },
  { id: "glow", label: "Calamar brillante", description: "Destellos turquesa brillando en la oscuridad." },
  { id: "sculk-souls", label: "Sculk", description: "Almas de sculk escapando, como del catalizador." },
  { id: "notes", label: "Notas musicales", description: "Notas de colores, como las de un bloque musical." },
  { id: "electric-spark", label: "Chispas eléctricas", description: "Chispazos como los de un pararrayos de cobre." },
  // Eventos
  { id: "hearts", label: "Corazones", description: "Corazones subiendo, como al criar o domesticar." },
  { id: "dragon-breath", label: "Aliento del dragón", description: "Nube morada a tus pies." },
  { id: "campfire", label: "Hoguera", description: "Llamas y humo de hoguera." },
];

export const FRAME_DECORATIONS: FrameDecoration[] = [
  { id: "none", label: "Sin marco", description: "Borde normal de la tarjeta." },
  { id: "electric", label: "Borde eléctrico", description: "Ondas de corriente naranja recorriendo el borde." },
];

export function avatarDecorationLabel(id: string | undefined): string {
  return AVATAR_DECORATIONS.find((d) => d.id === id)?.label ?? AVATAR_DECORATIONS[0].label;
}

export function frameLabel(id: string | undefined): string {
  return FRAME_DECORATIONS.find((d) => d.id === id)?.label ?? FRAME_DECORATIONS[0].label;
}

/** Narrows a stored decoration id to SkinViewerAnimated's prop type. */
export function toSkinEffect(id: string | undefined): SkinEffect {
  return id && id !== "none" && AVATAR_DECORATIONS.some((d) => d.id === id) ? (id as SkinEffect) : "none";
}
