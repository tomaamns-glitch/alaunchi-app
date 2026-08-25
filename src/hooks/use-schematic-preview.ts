import { useEffect, useState } from "react";
import type { Structure } from "deepslate";
import { readInstanceFile } from "@/services/electron";
import { base64ToBytes } from "@/lib/emotecraft";
import { parseSchematic } from "@/lib/schematic-parser";

/** Reads and parses a schematic file (any of the four supported formats) from
 *  an instance, ready to feed into SchematicViewer3D. Returns null while
 *  loading, unset, or on a parse failure. */
export function useSchematicPreview(modpackId: string | null | undefined, relPath: string | null | undefined): Structure | null {
  const [structure, setStructure] = useState<Structure | null>(null);

  useEffect(() => {
    setStructure(null);
    if (!modpackId || !relPath) return;
    let cancelled = false;
    const fileName = relPath.slice(relPath.lastIndexOf("/") + 1);
    readInstanceFile(modpackId, relPath)
      .then((base64) => {
        if (cancelled) return;
        setStructure(parseSchematic(base64ToBytes(base64), fileName));
      })
      .catch((e) => {
        console.error(`[use-schematic-preview] ${relPath}:`, e);
      });
    return () => {
      cancelled = true;
    };
  }, [modpackId, relPath]);

  return structure;
}
