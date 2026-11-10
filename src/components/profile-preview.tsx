import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { CharacterCard } from "@/components/character-card";
import { ProfileBannerVisual } from "@/components/profile-banner-visual";
import { toSkinEffect } from "@/lib/decoration-catalog";

/** How your profile looks, live and as elaborate as in the account menu: the
 *  character on its platform with its effect, next to the profile card with
 *  banner, frame, icon, name, bio and stats. Shown first in Editar perfil, so
 *  every change is seen as it's made. */
export function ProfilePreview({
  uuid,
  username,
  bio,
  bannerUrl,
  frame,
  frameColor,
  avatarDecoration,
  skinUrl,
  skinVariant,
  stats,
  frameOnCharacter = false,
  onFrameOnCharacterChange,
  extra,
  iconDecoration,
  iconColors,
  onBioChange,
}: {
  uuid: string;
  username: string;
  bio: string;
  bannerUrl: string | null;
  frame: string;
  frameColor?: string | null;
  avatarDecoration: string;
  skinUrl: string | null;
  skinVariant: "slim" | "classic";
  stats?: ReactNode;
  frameOnCharacter?: boolean;
  /** Shows the "apply the frame to the character" checkbox under the banner. */
  onFrameOnCharacterChange?: (on: boolean) => void;
  /** More options under the checkbox. */
  extra?: ReactNode;
  iconDecoration?: string;
  iconColors?: string | null;
  onBioChange?: (bio: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-6">
      {/* Remounted when the effect changes: the viewer builds its scene once. */}
      <CharacterCard
        key={avatarDecoration}
        skinUrl={skinUrl}
        variant={skinVariant}
        effect={toSkinEffect(avatarDecoration)}
        frame={frameOnCharacter ? frame : null}
        frameColor={frameColor}
      />
      <div className="w-[27rem] shrink-0 self-start">
        <ProfileBannerVisual
          uuid={uuid}
          username={username}
          bio={bio}
          bannerUrl={bannerUrl}
          frame={frame}
          frameColor={frameColor}
          stats={stats}
          iconDecoration={iconDecoration}
          iconColors={iconColors}
          onBioChange={onBioChange}
        />
        {onFrameOnCharacterChange && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-gray-200 select-none">
            <Checkbox
              checked={frameOnCharacter}
              onCheckedChange={(v) => onFrameOnCharacterChange(v === true)}
              disabled={frame === "none"}
              className="border-white/40 data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-foreground"
            />
            <span className={frame === "none" ? "opacity-50" : undefined}>Aplicar el marco también al personaje</span>
          </label>
        )}
        {extra}
      </div>
    </div>
  );
}
