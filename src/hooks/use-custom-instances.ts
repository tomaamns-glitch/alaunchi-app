import { create } from "zustand";
import { Modpack } from "../services/github";
import {
  createInstance as createInstanceIpc,
  deleteInstance as deleteInstanceIpc,
  getInstalledModpacksMeta,
  CreateInstanceInput,
} from "../services/electron";
import { backfillModrinthBanners, backfillModrinthIcons } from "../lib/modrinth-banner";

// Kept deliberately separate from useModpacks() (the GitHub-catalog store) —
// home.tsx's carousel iterates that store's array directly, so merging custom
// instances into it would leak them into the main "Inicio" carousel instead of
// staying scoped to the Hub's own instance grid.

function metaToModpack(meta: Record<string, any>): Modpack {
  return {
    id: meta.id,
    name: meta.name,
    description: "",
    minecraftVersion: meta.minecraftVersion,
    loaderType: meta.loaderType,
    loaderVersion: meta.loaderVersion,
    version: meta.version ?? "1",
    imageUrl: meta.iconDataUrl ?? "",
    bannerUrl: meta.bannerDataUrl ?? "",
    installed: true,
    installedVersion: meta.version,
    updateAvailable: false,
    fileCount: 0,
    totalSizeMb: 0,
    source: "custom",
    installedAt: meta.installedAt,
    totalPlaytimeMs: typeof meta.totalPlaytimeMs === "number" ? meta.totalPlaytimeMs : 0,
    isCopy: !!meta.duplicatedFrom,
    isDownloaded: meta.importedFrom?.type === "modrinth" || meta.importedFrom?.type === "curseforge",
    modrinthProjectId: meta.importedFrom?.type === "modrinth" ? meta.importedFrom.projectId : undefined,
    modrinthVersionId: meta.importedFrom?.type === "modrinth" ? meta.importedFrom.versionId : undefined,
    modrinthVersionNumber: meta.importedFrom?.type === "modrinth" ? meta.importedFrom.versionNumber : undefined,
  };
}

interface CustomInstancesState {
  instances: Modpack[];
  loading: boolean;
  /** True once a read from disk has succeeded — until then `instances` is just
   *  the empty initial value, not "the user has no instances". */
  loaded: boolean;
  loadInstances: () => Promise<void>;
  createInstance: (input: CreateInstanceInput) => Promise<Modpack>;
  deleteInstance: (id: string) => Promise<void>;
}

export const useCustomInstances = create<CustomInstancesState>((set, get) => ({
  instances: [],
  loading: false,
  loaded: false,

  loadInstances: async () => {
    set({ loading: true });
    try {
      const meta = await getInstalledModpacksMeta();
      const instances = Object.values(meta)
        .filter((m: any) => m?.source === "custom")
        .map(metaToModpack);
      set({ instances, loading: false, loaded: true });
      // One after the other: both rewrite the same alaunchi-meta.json.
      void (async () => {
        const banners = await backfillModrinthBanners(Object.values(meta));
        const icons = await backfillModrinthIcons(Object.values(meta));
        if (banners || icons) void get().loadInstances();
      })();
    } catch {
      set({ loading: false });
    }
  },

  createInstance: async (input) => {
    const meta = await createInstanceIpc(input);
    const instance = metaToModpack(meta);
    set({ instances: [instance, ...get().instances] });
    return instance;
  },

  deleteInstance: async (id) => {
    await deleteInstanceIpc(id);
    set({ instances: get().instances.filter((i) => i.id !== id) });
  },
}));
