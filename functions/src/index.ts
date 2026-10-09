import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getDownloadURL, getStorage } from "firebase-admin/storage";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { moderateImage, sniffImageType, type ModerationVerdict } from "./moderation";

initializeApp();

// Same region as the Realtime Database. maxInstances caps how much a flood of
// calls can spend: the app has no Firebase Auth, so these are reachable by
// anyone who has the (public) web config.
setGlobalOptions({ region: "europe-west1", maxInstances: 5 });

const MAX_BYTES = 8 * 1024 * 1024;
const MODERATED_META = "moderated";

function decodeImage(base64: unknown): { buf: Buffer; contentType: string } {
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new HttpsError("invalid-argument", "Falta la imagen.");
  }
  const buf = Buffer.from(base64, "base64");
  if (buf.length > MAX_BYTES) throw new HttpsError("invalid-argument", "La imagen pesa demasiado (máximo 8 MB).");
  const contentType = sniffImageType(buf);
  if (!contentType) throw new HttpsError("invalid-argument", "El archivo no es una imagen PNG, JPEG, GIF o WebP.");
  return { buf, contentType };
}

/** Runs the check, failing closed: if moderation itself breaks, nothing is
 *  published. */
async function requireAllowed(buf: Buffer): Promise<void> {
  let verdict: ModerationVerdict;
  try {
    verdict = await moderateImage(buf);
  } catch (e) {
    logger.error("Moderation failed", e);
    throw new HttpsError("unavailable", "No se pudo revisar la imagen. Inténtalo de nuevo en un rato.");
  }
  if (!verdict.allowed) {
    throw new HttpsError("permission-denied", verdict.reason || "La imagen no está permitida.", {
      categories: verdict.categories,
    });
  }
}

/**
 * Moderates an image and, only if it passes, stores it where the client used
 * to upload it directly:
 *  - kind "banner": banners/{uuid}/{timestamp} (profile banners, modpack logos)
 *  - kind "shared": content-objects/{sha1} + its contentObjects/{sha1} registry
 *    entry (screenshots and skins sent by chat)
 * Returns the public download URL.
 */
export const uploadModeratedImage = onCall(
  { memory: "1GiB", timeoutSeconds: 60 },
  async (req) => {
    const { kind, base64, uuid, sha1 } = (req.data ?? {}) as Record<string, unknown>;
    const { buf, contentType } = decodeImage(base64);
    const bucket = getStorage().bucket();

    if (kind === "banner") {
      if (typeof uuid !== "string" || !/^[0-9a-f-]{32,36}$/i.test(uuid)) {
        throw new HttpsError("invalid-argument", "UUID no válido.");
      }
      await requireAllowed(buf);
      const file = bucket.file(`banners/${uuid}/${Date.now().toString(36)}`);
      await file.save(buf, { contentType, metadata: { metadata: { [MODERATED_META]: "true" } } });
      return { url: await getDownloadURL(file) };
    }

    if (kind === "shared") {
      if (typeof sha1 !== "string" || !/^[0-9a-f]{40}$/i.test(sha1)) {
        throw new HttpsError("invalid-argument", "Hash no válido.");
      }
      if (createHash("sha1").update(buf).digest("hex") !== sha1.toLowerCase()) {
        throw new HttpsError("invalid-argument", "El hash no coincide con la imagen.");
      }
      const registryRef = getDatabase().ref(`contentObjects/${sha1}`);
      const existing = await registryRef.get();
      if (existing.exists() && existing.child("moderated").val() === true) {
        return { url: existing.child("downloadUrl").val() as string };
      }
      await requireAllowed(buf);
      const file = bucket.file(`content-objects/${sha1}`);
      await file.save(buf, { contentType, metadata: { metadata: { [MODERATED_META]: "true" } } });
      const url = await getDownloadURL(file);
      await registryRef.set({ downloadUrl: url, uploadedAt: Date.now(), moderated: true });
      return { url };
    }

    throw new HttpsError("invalid-argument", "Tipo de subida desconocido.");
  }
);

/** Check-only, for images that travel inside an RTDB message instead of
 *  Storage (the icon of an instance shared by chat). */
export const checkImage = onCall(
  { memory: "1GiB", timeoutSeconds: 60 },
  async (req) => {
    const { buf } = decodeImage((req.data ?? {}).base64);
    await requireAllowed(buf);
    return { allowed: true };
  }
);

/**
 * Backstop for anything that reaches Storage without going through
 * uploadModeratedImage (older app versions, or someone using the public web
 * config directly): images in the shared paths get moderated after the fact
 * and deleted if they fail. Non-images (mods, schematics…) are left alone.
 */
export const moderateStorageUpload = onObjectFinalized(
  // Storage triggers must run in the bucket's own region.
  { region: "us-east1", memory: "1GiB", timeoutSeconds: 120 },
  async (event) => {
    const { name, metadata, size } = event.data;
    if (!name || !(name.startsWith("banners/") || name.startsWith("content-objects/"))) return;
    if (metadata?.[MODERATED_META] === "true") return;

    const file = getStorage().bucket(event.data.bucket).file(name);
    const [head] = await file.download({ start: 0, end: 15 });
    if (!sniffImageType(head)) return;

    if (Number(size) > MAX_BYTES) {
      logger.warn("Deleting oversized unmoderated image", { name, size });
      await deleteObject(name);
      return;
    }

    const [buf] = await file.download();
    let verdict: ModerationVerdict;
    try {
      verdict = await moderateImage(buf);
    } catch (e) {
      // Fail open here: deleting someone's file because the API hiccuped is
      // worse than letting one unchecked upload through this backstop.
      logger.error("Backstop moderation failed", { name, error: String(e) });
      return;
    }
    if (verdict.allowed) {
      await file.setMetadata({ metadata: { [MODERATED_META]: "true" } });
      return;
    }
    logger.warn("Deleting blocked image", { name, categories: verdict.categories });
    await deleteObject(name);
  }
);

async function deleteObject(name: string): Promise<void> {
  await getStorage().bucket().file(name).delete({ ignoreNotFound: true });
  // Drop the dedupe entry too, or the next share of the same file would be
  // handed the dead URL.
  const sha1 = name.match(/^content-objects\/([0-9a-f]{40})$/i)?.[1];
  if (sha1) await getDatabase().ref(`contentObjects/${sha1}`).remove();
}
