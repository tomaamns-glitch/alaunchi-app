import { create } from "zustand";

// Light/dark appearance (Ajustes → Personalización). The app was designed dark;
// light mode is a `data-theme="light"` attribute on <html> that index.css uses
// to swap the base palette AND invert the hard-coded white/gray/black
// utilities (text-white, bg-white/5, border-white/10, text-gray-300…) — see the
// "LIGHT THEME" block there. Per device, like the notification sound.

/** Besides dark and light, tinted dark themes: "midnight" (Medianoche, navy),
 *  "forest" (Bosque, green), "ember" (Brasa, amber) and "amethyst" (Amatista,
 *  violet) — see their blocks in index.css. They're all dark: everything that
 *  checks "light" treats them as dark. */
export type Theme = "dark" | "light" | "midnight" | "forest" | "ember" | "amethyst";

const THEMES: readonly Theme[] = ["dark", "light", "midnight", "forest", "ember", "amethyst"];

/** Themes not available yet: shown with a padlock in Personalizar and never
 *  applied (a device that had one saved goes back to dark). */
export const LOCKED_THEMES: readonly Theme[] = ["forest", "ember"];
export function isThemeLocked(theme: Theme): boolean {
  return LOCKED_THEMES.includes(theme);
}

/** The animated background's light when it isn't tinted by an instance:
 *  each theme's own accent, plus a paler tone for the highlights. */
export const THEME_SWELL: Record<Theme, { color: string; glint: string }> = {
  dark: { color: "#259DF4", glint: "#7fc4ff" },
  light: { color: "hsl(208 92% 44%)", glint: "#0b2f5c" },
  midnight: { color: "#259DF4", glint: "#7fc4ff" },
  forest: { color: "hsl(148 62% 44%)", glint: "hsl(145 70% 78%)" },
  ember: { color: "hsl(28 92% 52%)", glint: "hsl(36 95% 78%)" },
  amethyst: { color: "hsl(266 78% 62%)", glint: "hsl(270 90% 84%)" },
};

const STORAGE_KEY = "alaunchi_theme";

export function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved && THEMES.includes(saved) && !LOCKED_THEMES.includes(saved) ? saved : "dark";
  } catch {
    return "dark";
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
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
    if (isThemeLocked(theme)) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    apply(theme);
    set({ theme });
  },
}));
