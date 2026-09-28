import { useEffect, useState } from "react";
import { subscribeAvatarDecoration } from "@/services/public-profile";
import { toSkinEffect } from "@/lib/decoration-catalog";

/** The player's chosen avatar decoration, already narrowed to
 *  SkinViewerAnimated's `effect` prop — live, so picking a new one in
 *  Personalizar updates every viewer showing your own character. */
export function useAvatarDecoration(uuid: string | null | undefined) {
  const [id, setId] = useState("none");

  useEffect(() => {
    if (!uuid) {
      setId("none");
      return;
    }
    return subscribeAvatarDecoration(uuid, setId);
  }, [uuid]);

  return toSkinEffect(id);
}
