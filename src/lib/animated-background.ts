import { create } from "zustand";

// Ajustes → Personalización → "Fondo animado". On (default): the moving WebGL
// light (components/swell-light.tsx) behind the Hub and the instance manager.
// Off: a still, soft cloud of the same color instead (StaticGlow) — nothing
// moves and no WebGL runs. Per device, like the theme.

const STORAGE_KEY = "alaunchi_animated_background";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

interface AnimatedBackgroundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useAnimatedBackground = create<AnimatedBackgroundState>((set) => ({
  enabled: read(),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {}
    set({ enabled });
  },
}));
