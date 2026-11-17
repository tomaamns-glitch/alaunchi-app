import { create } from "zustand";

// Ajustes → Personalización → "Fondo animado". On: the moving WebGL light
// (components/swell-light.tsx) behind the Hub and the instance manager. Off: a
// still, soft cloud of the same color instead (StaticGlow) — nothing moves and
// no WebGL runs. Per device, like the theme.
//
// Default: OFF on a brand-new install. Players who already had the app keep it
// on (it was the old default) — told apart by any other "alaunchi_" key already
// in localStorage. Either way the choice is written down on first read.

const STORAGE_KEY = "alaunchi_animated_background";

function read(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "on" || saved === "off") return saved === "on";
    let existingPlayer = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== STORAGE_KEY && key.startsWith("alaunchi_")) {
        existingPlayer = true;
        break;
      }
    }
    localStorage.setItem(STORAGE_KEY, existingPlayer ? "on" : "off");
    return existingPlayer;
  } catch {
    return false;
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
