import { create } from "zustand";

// Cuenta → Biblioteca: the player's own saved content (file copies) and image
// gallery, stored locally by electron/main.js under ~/.alaunchi/library.
// Not to be confused with the group's shared "Biblioteca de mods"
// (services/mod-library.ts), which lives in Firebase.

const eAPI = (window as any).electronAPI;
const isElectron = !!eAPI;

export type SavedContentCategory = "mods" | "shaderpacks" | "resourcepacks" | "emotes" | "schematics";

export const SAVED_CATEGORY_LABELS: Record<SavedContentCategory, string> = {
  mods: "Mods",
  shaderpacks: "Shaders",
  resourcepacks: "Resource packs",
  emotes: "Emotes",
  schematics: "Estructuras",
};

export interface SavedContent {
  id: string;
  category: SavedContentCategory;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string;
  size: number;
  addedAt: number;
  modrinthProjectId?: string;
  schematicSource?: "litematica" | "worldedit";
  /** Instance (or chat) it was saved from, for display. */
  sourceName?: string;
}

export interface GalleryImage {
  id: string;
  fileName: string;
  sha1: string;
  size: number;
  addedAt: number;
  from: { kind: "instance"; name: string } | { kind: "chat"; username: string };
  thumbnailDataUrl: string | null;
}

export type LibrarySource =
  | { kind: "instance"; modpackId: string; path: string }
  | { kind: "url"; url: string; sha1?: string };

const unwrap = (e: any, fallback: string) =>
  new Error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || fallback);

// Shared store so every view (account panel, chat cards, screenshot menus) sees
// additions right away without each one re-reading the index.
interface LibraryState {
  content: SavedContent[];
  gallery: GalleryImage[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const usePersonalLibrary = create<LibraryState>((set) => ({
  content: [],
  gallery: [],
  loaded: false,
  refresh: async () => {
    if (!isElectron) return;
    const [content, gallery] = await Promise.all([eAPI.libraryListContent(), eAPI.galleryList()]);
    set({
      content: [...content].sort((a: SavedContent, b: SavedContent) => b.addedAt - a.addedAt),
      gallery: [...gallery].sort((a: GalleryImage, b: GalleryImage) => b.addedAt - a.addedAt),
      loaded: true,
    });
  },
}));

const refresh = () => usePersonalLibrary.getState().refresh().catch(() => {});

export async function saveContent(
  meta: Pick<SavedContent, "category" | "displayName"> &
    Partial<Pick<SavedContent, "iconUrl" | "modrinthProjectId" | "schematicSource" | "sourceName">>,
  fileName: string,
  source: LibrarySource
): Promise<{ entry: SavedContent; alreadySaved: boolean }> {
  if (!isElectron) throw new Error("Solo disponible en la app.");
  try {
    const result = await eAPI.libraryAddContent({ meta, fileName, source });
    await refresh();
    return result;
  } catch (e) {
    throw unwrap(e, "No se pudo guardar en la biblioteca.");
  }
}

export async function removeContent(id: string): Promise<void> {
  await eAPI.libraryRemoveContent({ id });
  await refresh();
}

/** Copies a saved item into an instance. Returns the instance-relative path written. */
export async function installSavedContent(id: string, modpackId: string): Promise<{ path: string; size: number; sha1: string }> {
  try {
    return await eAPI.libraryInstallContent({ id, modpackId });
  } catch (e) {
    throw unwrap(e, "No se pudo instalar.");
  }
}

export async function addToGallery(
  source: LibrarySource,
  fileName: string,
  from: GalleryImage["from"]
): Promise<{ entry: GalleryImage; alreadySaved: boolean }> {
  if (!isElectron) throw new Error("Solo disponible en la app.");
  try {
    const result = await eAPI.galleryAdd({ source, fileName, from });
    await refresh();
    return result;
  } catch (e) {
    throw unwrap(e, "No se pudo añadir a la galería.");
  }
}

export async function readGalleryImage(id: string): Promise<string> {
  return eAPI.galleryRead({ id });
}

export async function removeFromGallery(id: string): Promise<void> {
  await eAPI.galleryRemove({ id });
  await refresh();
}

/** Shows one image selected in Explorer, or opens the gallery folder. */
export async function showGalleryFile(id?: string): Promise<void> {
  if (isElectron) await eAPI.galleryShowFile({ id });
}

export async function showInstanceFile(modpackId: string, path: string): Promise<void> {
  if (isElectron) await eAPI.showInstanceFile({ modpackId, path });
}
