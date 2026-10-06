import { create } from "zustand";

// Light/dark appearance (Ajustes → Personalización). The app was designed dark;
// light mode is a `data-theme="light"` attribute on <html> that index.css uses
// to swap the base palette AND invert the hard-coded white/gray/black
// utilities (text-white, bg-white/5, border-white/10, text-gray-300…) — see the
// "LIGHT THEME" block there. Per device, like the notification sound.

export type Theme = "dark" | "light";

const STORAGE_KEY = "alaunchi_theme";

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  root.style.colorScheme = theme;
}

/** Call once before the first render so the app never flashes the wrong theme. */
export function initTheme(): void {
  apply(getStoredTheme());
}

export function isLightTheme(): boolean {
  return document.documentElement.dataset.theme === "light";
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    apply(theme);
    set({ theme });
  },
}));
