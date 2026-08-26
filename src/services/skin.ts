const eAPI = (window as any).electronAPI;

export interface MojangSkin {
  id: string;
  state: "ACTIVE" | "INACTIVE";
  url: string;
  variant: "SLIM" | "CLASSIC";
  alias?: string;
}

export interface MojangCape {
  id: string;
  state: "ACTIVE" | "INACTIVE";
  url: string;
  alias?: string;
}

export interface SkinProfile {
  skins: MojangSkin[];
  capes: MojangCape[];
}

export interface LibrarySkin {
  id: string;
  name: string;
  variant: "slim" | "classic";
  addedAt: string;
  fileBase64: string;
  /** Absent (undefined/null) for skins saved before sha1 tracking was added. */
  sha1?: string | null;
}

function requireElectron() {
  if (!eAPI) throw new Error("El gestor de skins solo está disponible en la app de escritorio.");
}

/** Current skin/cape state of the signed-in Mojang account. */
export async function getSkinProfile(mcToken: string): Promise<SkinProfile> {
  requireElectron();
  return eAPI.getSkinProfile({ mcToken });
}

/** Uploads and equips a new skin on the real Mojang account. */
export async function changeSkin(
  mcToken: string,
  variant: "slim" | "classic",
  fileBase64: string
): Promise<SkinProfile> {
  requireElectron();
  return eAPI.changeSkin({ mcToken, variant, fileBase64 });
}

/** Activates a cape by id, or pass null to unequip whatever cape is active. */
export async function setCape(mcToken: string, capeId: string | null): Promise<SkinProfile> {
  requireElectron();
  return eAPI.setCape({ mcToken, capeId });
}

/** The local library of saved skins — independent of what's currently equipped. */
export async function listSkinLibrary(): Promise<LibrarySkin[]> {
  requireElectron();
  return eAPI.skinLibraryList();
}

export async function saveToSkinLibrary(
  name: string,
  variant: "slim" | "classic",
  fileBase64: string
): Promise<LibrarySkin> {
  requireElectron();
  return eAPI.skinLibrarySave({ name, variant, fileBase64 });
}

export async function deleteFromSkinLibrary(id: string): Promise<void> {
  requireElectron();
  await eAPI.skinLibraryDelete({ id });
}

/**
 * Fetches a textures.minecraft.net URL through the main process and returns it
 * as a data: URL — textures.minecraft.net sends no CORS headers, so loading it
 * directly into a WebGL texture from here would fail.
 */
export async function fetchTextureAsDataUrl(url: string): Promise<string> {
  requireElectron();
  const { base64 } = await eAPI.fetchTextureB64({ url });
  return `data:image/png;base64,${base64}`;
}

/** Reads a File (e.g. from an <input type="file">) as a base64 string. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface ResolvedSkin {
  skinUrl: string;
  variant: "SLIM" | "CLASSIC";
}

/** Resolves any player's currently-equipped skin texture URL via Mojang's public
 *  session server — works for any UUID, not just the signed-in account, and (unlike
 *  a third-party mirror) always reflects whatever is equipped right now. */
export async function getSkinUrlForUuid(uuid: string): Promise<ResolvedSkin | null> {
  requireElectron();
  const { skinUrl, variant } = await eAPI.getSkinUrlForUuid({ uuid });
  return skinUrl ? { skinUrl, variant: variant ?? "CLASSIC" } : null;
}

/** Resolves a Minecraft username to its UUID via Mojang's public API. */
export async function getUuidForUsername(username: string): Promise<string | null> {
  requireElectron();
  const { uuid } = await eAPI.getUuidForUsername({ username });
  return uuid ?? null;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo decodificar la textura de skin."));
    img.src = src;
  });
}

/** Crops the face plus its hat-layer overlay out of a full skin texture and
 *  returns a square PNG data URL — the standard "player head" avatar render,
 *  done locally instead of depending on a third-party mirror to do it for us. */
export async function renderHeadIcon(skinDataUrl: string, size = 64): Promise<string> {
  const img = await loadImageElement(skinDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
  ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}
