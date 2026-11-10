import { create } from "zustand";

// "Adaptar colores a la instancia" (Personalizar). On (default): the accent —
// buttons, highlights, the animated background — takes the dominant colour of
// the instance's image. Off: the app always uses its own colours. Per device.

const STORAGE_KEY = "alaunchi_adaptive_color";

export function getStoredAdaptiveColor(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

interface AdaptiveColorState {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

export const useAdaptiveColor = create<AdaptiveColorState>((set) => ({
  enabled: getStoredAdaptiveColor(),
  setEnabled: (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {}
    set({ enabled: on });
  },
}));
