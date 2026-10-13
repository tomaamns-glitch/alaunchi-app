import { create } from "zustand";
import type { ChangelogEntry, Modpack } from "@/services/github";
import type { PresenceEntry } from "@/services/presence";

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

/** Dev-only fake online instance, to preview the drawer view (its banner tile
 *  and its page, /online/:id) without any real instance. Never installable. */
export const DRAWER_EXAMPLE_PACK: Modpack = {
  id: "__drawer-example__",
  name: "Survival Pro",
  description: "Instancia de ejemplo para ver cómo queda el banner en la vista cajón.",
  minecraftVersion: "1.20.1",
  loaderType: "fabric",
  version: "1.0.0",
  imageUrl: "./logo.png",
  bannerUrl: "./survival-pro.png",
  installed: false,
  updateAvailable: false,
  fileCount: 142,
  totalSizeMb: 318,
};

/** Fake update history for the example pack's "Novedades" panel, newest first. */
export const DRAWER_EXAMPLE_HISTORY: ChangelogEntry[] = [
  {
    version: "1.0.0",
    publishedAt: "2026-10-10T18:00:00Z",
    title: "Temporada 2",
    changelog:
      "## Nuevo\n- Mapa nuevo con biomas de Terralith\n- Añadido Create 0.5.1\n\n## Arreglos\n- Crash al abrir el inventario con JEI",
  },
  {
    version: "0.9.2",
    publishedAt: "2026-09-28T18:00:00Z",
    title: "Arreglos de rendimiento",
    changelog: "- Sodium y Lithium actualizados\n- Quitado un mod que causaba lag en el nether",
  },
  {
    version: "0.9.0",
    publishedAt: "2026-09-12T18:00:00Z",
    title: "Primera versión",
    changelog: "Primera versión pública de la instancia.",
  },
];

/** Fake roster for the example pack's "Participantes" panel. */
export const DRAWER_EXAMPLE_MEMBERS: Record<string, PresenceEntry> = {
  "069a79f444e94726a5befca90e38aaf5": { username: "Notch", online: true, lastSeen: Date.now() },
  "853c80ef3c3749fdaa49938b674adae6": { username: "jeb_", online: false, lastSeen: Date.now() - 3 * 3600_000, playtimeMs: 12.5 * 3600_000 },
  "61699b2ed3274a019f1e0ea8c3f06bc6": { username: "Dinnerbone", online: false, lastSeen: Date.now() - 4 * 86400_000, playtimeMs: 95 * 60_000 },
};
