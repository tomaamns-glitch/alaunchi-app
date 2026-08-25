import { useEffect, useState } from "react";
import type { Resources } from "deepslate";
import { getSchematicAssets, onSchematicAssetsProgress, type SchematicAssetsProgress } from "@/services/electron";
import { buildSchematicResources } from "@/lib/schematic-resources";

// Building the texture atlas + flattening every block model is expensive enough
// (and identical for every schematic on the same MC version) that it's worth
// keeping across dialog opens within one app session, not just across renders
// of one open dialog.
const resourcesCache = new Map<string, Promise<Resources>>();

export interface SchematicResourcesState {
  resources: Resources | null;
  progress: SchematicAssetsProgress | null;
  error: string | null;
}

/** Loads (and disk-caches on the main-process side, in-memory here) the
 *  deepslate Resources needed to render any schematic for a given MC version.
 *  First call for a version may download+extract the client jar and take a
 *  while — `progress` reports that; later calls resolve near-instantly. */
export function useSchematicResources(mcVersion: string | null | undefined): SchematicResourcesState {
  const [state, setState] = useState<SchematicResourcesState>({ resources: null, progress: null, error: null });

  useEffect(() => {
    setState({ resources: null, progress: null, error: null });
    if (!mcVersion) return;
    let cancelled = false;

    const unsubscribe = onSchematicAssetsProgress((data) => {
      if (cancelled || data.mcVersion !== mcVersion) return;
      setState((s) => ({ ...s, progress: data }));
    });

    let built = resourcesCache.get(mcVersion);
    if (!built) {
      built = getSchematicAssets(mcVersion).then(buildSchematicResources);
      resourcesCache.set(mcVersion, built);
    }
    built
      .then((resources) => {
        if (!cancelled) setState((s) => ({ ...s, resources }));
      })
      .catch((e) => {
        console.error(`[use-schematic-resources] ${mcVersion}:`, e);
        resourcesCache.delete(mcVersion);
        if (!cancelled) setState((s) => ({ ...s, error: "No se pudieron cargar los modelos y texturas." }));
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [mcVersion]);

  return state;
}
