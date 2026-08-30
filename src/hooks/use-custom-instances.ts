import { create } from "zustand";
import { Modpack } from "../services/github";
import {
  createInstance as createInstanceIpc,
  deleteInstance as deleteInstanceIpc,
  getInstalledModpacksMeta,
  CreateInstanceInput,
} from "../services/electron";

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
    bannerUrl: "",
    installed: true,
    installedVersion: meta.version,
    updateAvailable: false,
    fileCount: 0,
    totalSizeMb: 0,
    source: "custom",
    installedAt: meta.installedAt,
  };
}

interface CustomInstancesState {
  instances: Modpack[];
  loading: boolean;
  loadInstances: () => Promise<void>;
  createInstance: (input: CreateInstanceInput) => Promise<Modpack>;
  deleteInstance: (id: string) => Promise<void>;
}

export const useCustomInstances = create<CustomInstancesState>((set, get) => ({
  instances: [],
  loading: false,

  loadInstances: async () => {
    set({ loading: true });
    try {
      const meta = await getInstalledModpacksMeta();
      const instances = Object.values(meta)
        .filter((m: any) => m?.source === "custom")
        .map(metaToModpack);
      set({ instances, loading: false });
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
