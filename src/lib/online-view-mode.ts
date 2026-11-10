import { create } from "zustand";

// How Inicio (/) shows the online instances: "carousel" (one big banner at a
// time, the original view) or "drawer" (a Hub-style page). Toggled from the
// titlebar, next to the window buttons. Per device; the carousel is the default.

export type OnlineViewMode = "carousel" | "drawer";

const STORAGE_KEY = "alaunchi_online_view_mode";

export const ONLINE_DRAWER_AVAILABLE = true;

function read(): OnlineViewMode {
  if (!ONLINE_DRAWER_AVAILABLE) return "carousel";
  try {
    return localStorage.getItem(STORAGE_KEY) === "drawer" ? "drawer" : "carousel";
  } catch {
    return "carousel";
  }
}

interface OnlineViewModeState {
  mode: OnlineViewMode;
  toggle: () => void;
}

export const useOnlineViewMode = create<OnlineViewModeState>((set, get) => ({
  mode: read(),
  toggle: () => {
    const mode: OnlineViewMode = get().mode === "carousel" ? "drawer" : "carousel";
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
    set({ mode });
  },
}));

