import { useEffect, useState } from "react";
import type { Structure } from "deepslate";
import { readInstanceFile } from "@/services/electron";
import { base64ToBytes } from "@/lib/emotecraft";
import { parseSchematic } from "@/lib/schematic-parser";

export interface SchematicPreview {
  structure: Structure | null;
  /** Why it can't be shown (too big, unreadable) — ready to display. */
  error: string | null;
}

/** Reads and parses a schematic file (any of the four supported formats) from
 *  an instance, ready to feed into SchematicViewer3D. `structure` is null while
 *  loading or unset; a failure (too big, broken file) comes back in `error`
 *  instead of leaving the preview loading forever. */
export function useSchematicPreview(modpackId: string | null | undefined, relPath: string | null | undefined): SchematicPreview {
  const [state, setState] = useState<SchematicPreview>({ structure: null, error: null });

  useEffect(() => {
    setState({ structure: null, error: null });
    if (!modpackId || !relPath) return;
    let cancelled = false;
    const fileName = relPath.slice(relPath.lastIndexOf("/") + 1);
    readInstanceFile(modpackId, relPath)
      // A tick first, so the dialog's spinner is on screen before the parse.
      .then((base64) => new Promise<string>((res) => setTimeout(() => res(base64), 0)))
      .then((base64) => {
        if (cancelled) return;
        setState({ structure: parseSchematic(base64ToBytes(base64), fileName), error: null });
      })
      .catch((e) => {
        console.error(`[use-schematic-preview] ${relPath}:`, e);
        if (!cancelled) setState({ structure: null, error: e?.message || "No se pudo leer el esquema." });
      });
    return () => {
      cancelled = true;
    };
  }, [modpackId, relPath]);

  return state;
}
