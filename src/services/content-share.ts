import { ref as dbRef, get, set } from "firebase/database";
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { rtdb, storage } from "@/lib/firebase";

export type ContentCategory = "mods" | "shaderpacks" | "resourcepacks" | "emotes";

export interface SharedContent {
  category: ContentCategory;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string;
  size: number;
  modpackId: string;
  downloadUrl: string;
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
