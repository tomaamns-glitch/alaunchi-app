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
  /** The sender's own source instance — absent for "skins" (account-wide, not
   *  tied to any instance) and always absent for isReference content (a
   *  favorite has no file of its own to point at). NOT necessarily something
   *  the recipient has: only used as a direct-install target when the message
   *  itself was sent in that exact carousel instance's mode (see
   *  ChatMessage.carouselInstanceId) and the recipient has that instance too
   *  — otherwise the recipient goes through content-compat.ts instead. */
  modpackId?: string;
  /** Only set for category === "schematics" — which of the two destination
   *  folders (Litematica vs WorldEdit/FAWE) to write into on download. */
  schematicSource?: "litematica" | "worldedit";
  /** Only set for category === "skins". */
  skinVariant?: "slim" | "classic";
  /** Modrinth project id for mods/shaderpacks/resourcepacks that were
   *  identified (via identifyModrinthFiles) or shared as a favorite reference.
   *  Lets a recipient who doesn't have modpackId run compatibility detection
   *  (content-compat.ts) against their own instances instead. */
  modrinthProjectId?: string;
  /** True for content shared from a favorite (services/favorites.ts) — a
   *  Modrinth bookmark with no local file behind it. sha1/downloadUrl/size
   *  above are empty placeholders, not real: the actual file for a specific
   *  destination instance is resolved fresh from Modrinth (via
   *  content-compat.ts, which already needs to hit the Modrinth API to check
   *  compatibility) once the recipient picks where to install it. */
  isReference?: boolean;
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
