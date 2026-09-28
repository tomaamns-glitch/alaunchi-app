import { create } from "zustand";

// DEV ONLY — a temporary, in-memory banner used by the Pruebas lab to try a
// third-party nameplate video as your profile banner. Never persisted or
// published; in a production build nothing ever sets it, so it stays null.

interface DevBannerOverride {
  name: string | null;
  videoUrl: string | null;
  set: (name: string, videoUrl: string) => void;
  clear: () => void;
}

export const useDevBannerOverride = create<DevBannerOverride>((set) => ({
  name: null,
  videoUrl: null,
  set: (name, videoUrl) => set({ name, videoUrl }),
  clear: () => set({ name: null, videoUrl: null }),
}));
