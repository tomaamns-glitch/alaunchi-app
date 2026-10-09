import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// Every image other players get to see goes through the Cloud Functions in
// functions/ (Cloud Vision SafeSearch: nudity and graphic violence) instead
// of being written to Storage directly — the storage rules no longer allow
// that for images.

const CATEGORY_LABELS: Record<string, string> = {
  sexual: "contenido sexual",
  violence: "violencia",
};

/** Turns the function's HttpsError into a message ready for a toast. */
function toUserError(e: unknown): Error {
  if (e instanceof FirebaseError) {
    if (e.code === "functions/permission-denied") {
      const categories = ((e as FirebaseError & { details?: { categories?: string[] } }).details?.categories ?? [])
        .map((c) => CATEGORY_LABELS[c])
        .filter(Boolean);
      return new Error(
        categories.length > 0
          ? `Imagen rechazada: contiene ${categories.join(", ")}.`
          : `Imagen rechazada: ${e.message}`
      );
    }
    return new Error(e.message);
  }
  return e instanceof Error ? e : new Error("No se pudo subir la imagen.");
}

const uploadModeratedImageFn = httpsCallable<
  { kind: "banner"; base64: string; uuid: string } | { kind: "shared"; base64: string; sha1: string },
  { url: string }
>(functions, "uploadModeratedImage", { timeout: 90_000 });

const checkImageFn = httpsCallable<{ base64: string }, { allowed: true }>(functions, "checkImage", {
  timeout: 90_000,
});

/** Profile banner / modpack logo: moderated, then stored under banners/{uuid}/. */
export async function uploadModeratedBanner(uuid: string, base64: string): Promise<string> {
  try {
    return (await uploadModeratedImageFn({ kind: "banner", base64, uuid })).data.url;
  } catch (e) {
    throw toUserError(e);
  }
}

/** Screenshot / skin shared by chat: moderated, then stored under content-objects/{sha1}. */
export async function uploadModeratedSharedImage(base64: string, sha1: string): Promise<string> {
  try {
    return (await uploadModeratedImageFn({ kind: "shared", base64, sha1 })).data.url;
  } catch (e) {
    throw toUserError(e);
  }
}

/** Check-only, for images embedded in a chat message as a data URL. Throws
 *  the same user-facing errors as the uploads. */
export async function assertImageAllowed(base64: string): Promise<void> {
  try {
    await checkImageFn({ base64 });
  } catch (e) {
    throw toUserError(e);
  }
}

/** True when the base64 bytes start like a PNG, JPEG, GIF or WebP file. */
export function isImageBase64(base64: string): boolean {
  let head: string;
  try {
    head = atob(base64.slice(0, 16));
  } catch {
    return false;
  }
  return (
    head.startsWith("\x89PNG") ||
    head.startsWith("\xff\xd8\xff") ||
    head.startsWith("GIF8") ||
    (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")
  );
}
