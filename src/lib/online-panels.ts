import { useEffect, useState } from "react";
import { create } from "zustand";

// The online instances' side panels: which are minimized, and which were moved
// from Inicio's footer into the instance manager ("Contenido"). Per device.

export type SidePanel = "members" | "changelog" | "groupChat";
/** All of them live in Inicio's footer by default and can be moved to Contenido. */
export type MovablePanel = SidePanel;

const COLLAPSED_KEY = "alaunchi_online_collapsed_panels";
const MOVED_KEY = "alaunchi_panels_in_content";
const LAYOUT_KEY = "alaunchi_content_panels_layout";

export type PanelColumn = "left" | "right";
/** Where each block goes in the instance manager, top to bottom. */
export type ContentLayout = Record<PanelColumn, SidePanel[]>;

const ALL_PANELS: SidePanel[] = ["members", "changelog", "groupChat"];
const DEFAULT_LAYOUT: ContentLayout = { left: ["members", "changelog"], right: ["groupChat"] };

function readLayout(): ContentLayout {
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    const left = (Array.isArray(v?.left) ? v.left : []).filter((p: SidePanel) => ALL_PANELS.includes(p));
    const right = (Array.isArray(v?.right) ? v.right : []).filter((p: SidePanel) => ALL_PANELS.includes(p) && !left.includes(p));
    // Exactly the three blocks, or a damaged value would lose one of them for good.
    return left.length + right.length === ALL_PANELS.length ? { left, right } : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** The blocks on screen, per column. Without room for a second column (`wide`
 *  false) they all share the left one; the saved layout isn't touched by that. */
export function contentColumns(layout: ContentLayout, visible: SidePanel[], wide: boolean): ContentLayout {
  const left = layout.left.filter((p) => visible.includes(p));
  const right = layout.right.filter((p) => visible.includes(p));
  return wide ? { left, right } : { left: [...left, ...right], right: [] };
}

function readList<T extends string>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

interface OnlinePanelsState {
  collapsed: SidePanel[];
  toggleCollapsed: (panel: SidePanel) => void;
  /** Living inside the instance manager instead of as a button in Inicio's footer. */
  moved: MovablePanel[];
  setMoved: (panel: MovablePanel, moved: boolean) => void;
  contentLayout: ContentLayout;
  /** Puts a block in a column, right above `before` (null: at the bottom). */
  placePanel: (panel: SidePanel, column: PanelColumn, before: SidePanel | null) => void;
}

export const useOnlinePanels = create<OnlinePanelsState>((set, get) => ({
  collapsed: readList<SidePanel>(COLLAPSED_KEY),
  toggleCollapsed: (panel) => {
    const { collapsed } = get();
    const next = collapsed.includes(panel) ? collapsed.filter((p) => p !== panel) : [...collapsed, panel];
    writeList(COLLAPSED_KEY, next);
    set({ collapsed: next });
  },
  moved: readList<MovablePanel>(MOVED_KEY),
  setMoved: (panel, moved) => {
    const next = get().moved.filter((p) => p !== panel);
    if (moved) next.push(panel);
    writeList(MOVED_KEY, next);
    set({ moved: next });
  },
  contentLayout: readLayout(),
  placePanel: (panel, column, before) => {
    const { left, right } = get().contentLayout;
    const next: ContentLayout = { left: left.filter((p) => p !== panel), right: right.filter((p) => p !== panel) };
    const at = before ? next[column].indexOf(before) : -1;
    next[column].splice(at === -1 ? next[column].length : at, 0, panel);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {}
    set({ contentLayout: next });
  },
}));

// Below this width a third column no longer fits next to the content. Tailwind's xl.
const WIDE_QUERY = "(min-width: 1280px)";

/** In JS rather than CSS so only one group chat is mounted at a time — a
 *  hidden one would still count unread and play the sound. */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}
