import { useEffect, useState } from "react";
import { readInstanceFile } from "@/services/electron";
import { parseEmotecraft, base64ToBytes, type ParsedEmote } from "@/lib/emotecraft";

/** Reads and decodes a .emotecraft file from an instance's emotes/ folder,
 *  ready to drive a live EmoteAnimation preview instead of the static
 *  thumbnail. Returns null while loading, unset, or on a parse failure. */
export function useEmotePreview(modpackId: string | null | undefined, fileName: string | null | undefined): ParsedEmote | null {
  const [emote, setEmote] = useState<ParsedEmote | null>(null);

  useEffect(() => {
    setEmote(null);
    if (!modpackId || !fileName) return;
    let cancelled = false;
    readInstanceFile(modpackId, `emotes/${fileName}`)
      .then((base64) => {
        if (cancelled) return;
        setEmote(parseEmotecraft(base64ToBytes(base64)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modpackId, fileName]);

  return emote;
}
