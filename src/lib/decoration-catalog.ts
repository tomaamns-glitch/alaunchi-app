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
export function toSkinEffect(id: string | undefined): "none" | "soul-fire" | "cherry-petals" {
  return id === "soul-fire" || id === "cherry-petals" ? id : "none";
}
