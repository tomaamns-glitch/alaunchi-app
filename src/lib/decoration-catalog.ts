import type { SkinEffect } from "@/components/skin-viewer-animated";

// The profile cosmetics library. Two independent slots the owner picks from in
// the "Personalizar" dialog; the choice syncs to the public profile so friends
// see it too.
//
//  - avatarDecoration → SkinViewerAnimated's `effect` prop (same ids)
//  - frame            → <ProfileFrame> around the profile card
//  - iconDecoration   → <DecoratedIcon> around the player's head icon

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
  { id: "traced", label: "Trazo", description: "Una línea verde y naranja que dibuja el borde y se vuelve a borrar." },
];

export const ICON_DECORATIONS: FrameDecoration[] = [
  { id: "none", label: "Sin decoración", description: "Tu cabeza tal cual." },
  { id: "traced", label: "Trazo", description: "Una línea verde y naranja que dibuja el borde del icono." },
  { id: "vines", label: "Enredadera", description: "Una enredadera que crece rodeando tu cabeza." },
  { id: "gold-stars", label: "Estrellas doradas", description: "Aro dorado con estrellas; tu cabeza se ve redonda dentro." },
  { id: "wings-1", label: "Alas I", description: "Aro dorado con alas y una estrella; tu cabeza se ve redonda dentro." },
  { id: "wings-2", label: "Alas II", description: "Aro dorado con alas y dos estrellas; tu cabeza se ve redonda dentro." },
  { id: "wings-3", label: "Alas III", description: "Aro dorado con alas y tres estrellas; tu cabeza se ve redonda dentro." },
  { id: "orange-run", label: "Recorrido", description: "Dos trazos naranjas que rellenan el borde desde esquinas opuestas." },
  { id: "flames", label: "Fuego", description: "Un marco en llamas." },
  { id: "shapes", label: "Formas", description: "Un marco de formas de colores que se dibuja alrededor de tu cabeza." },
  { id: "pastel", label: "Pastel", description: "Marco de colores pastel en movimiento." },
  { id: "blue-hud", label: "Interfaz azul", description: "Borde azul de interfaz futurista en movimiento." },
  { id: "circuit", label: "Circuito", description: "Borde punteado de circuitos." },
  { id: "orange-ring", label: "Giro naranja", description: "Un trazo naranja que gira alrededor." },
];

/** Narrows a stored id to a known icon decoration ("none" otherwise). */
export function toIconDecoration(id: string | undefined): string {
  return id && ICON_DECORATIONS.some((d) => d.id === id) ? id : "none";
}

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
