import { create } from "zustand";

// The "glass" look (blurred translucent panels) can be switched off in
// Personalizar. Off = `data-glass="off"` on <html>, which index.css uses to
// drop every backdrop blur and put a mostly solid layer behind those panels
// (cheaper to draw, and clearer on busy backgrounds). Per device.

const STORAGE_KEY = "alaunchi_glass";

export function getStoredGlass(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function apply(on: boolean) {
  const root = document.documentElement;
  if (on) delete root.dataset.glass;
  else root.dataset.glass = "off";
}

/** Call once before the first render so the app never flashes the wrong look. */
export function initGlass(): void {
  apply(getStoredGlass());
}

interface GlassState {
  glass: boolean;
  setGlass: (on: boolean) => void;
}

export const useGlass = create<GlassState>((set) => ({
  glass: getStoredGlass(),
  setGlass: (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {}
    apply(on);
    set({ glass: on });
  },
}));
