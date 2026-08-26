import { ref as dbRef, get, set } from "firebase/database";
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { rtdb, storage } from "@/lib/firebase";

export type ContentCategory =
  | "mods"
  | "shaderpacks"
  | "resourcepacks"
  | "emotes"
  | "schematics"
  | "skins"
  | "screenshots";

export interface SharedContent {
  category: ContentCategory;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string;
  size: number;
  downloadUrl: string;
  /** Absent for "skins" — skins live in the account-wide skin library, not
   *  any one modpack's instance folder. */
  modpackId?: string;
  /** Only set for category === "schematics" — which of the two destination
   *  folders (Litematica vs WorldEdit/FAWE) to write into on download. */
  schematicSource?: "litematica" | "worldedit";
  /** Only set for category === "skins". */
  skinVariant?: "slim" | "classic";
}

/**
 * Uploads a file's bytes to the shared content-object store, deduplicated by
 * hash in RTDB (`contentObjects/{sha1}`) — same spirit as the object cache
 * modpack publishing already uses, so sharing a mod someone already shared
 * before never re-uploads it. Returns a URL any recipient can download it from.
 */
export async function uploadSharedContent(fileBase64: string, sha1: string): Promise<string> {
  const registryRef = dbRef(rtdb, `contentObjects/${sha1}`);
  const existing = await get(registryRef);
  if (existing.exists()) {
    return existing.val().downloadUrl as string;
  }

  const objectRef = storageRef(storage, `content-objects/${sha1}`);
  await uploadString(objectRef, fileBase64, "base64");
  const downloadUrl = await getDownloadURL(objectRef);
  await set(registryRef, { downloadUrl, uploadedAt: Date.now() });
  return downloadUrl;
}

/** Fetches a shared-content download URL (Firebase Storage) directly in the
 *  renderer and returns its bytes as base64 — used for categories with no
 *  instance-file destination (skins), where downloadInstanceFile doesn't
 *  apply. Not routed through the mc:fetch-texture-b64 IPC proxy: that one
 *  enforces a Mojang-only host allowlist unrelated to Storage's public,
 *  CORS-friendly download URLs. */
export async function fetchAsBase64(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
