import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getDownloadURL, getStorage } from "firebase-admin/storage";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { defineBoolean } from "firebase-functions/params";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { moderateImage, sniffImageType, type ModerationVerdict } from "./moderation";

initializeApp();

// Same region as the Realtime Database. maxInstances caps how much a flood of
// calls can spend: the app has no Firebase Auth, so these are reachable by
// anyone who has the (public) web config.
setGlobalOptions({ region: "europe-west1", maxInstances: 5 });

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Image functions and Firebase Auth. Off (functions/.env) while the group still
 * has app versions that don't sign in to Firebase — they'd lose every image
 * upload. Turn it on (true) once everyone is on a version with Firebase Auth,
 * then `firebase deploy --only functions:uploadModeratedImage,functions:checkImage`.
 * Either way, a signed-in caller can only upload banners to their own folder.
 */
const IMAGE_UPLOADS_REQUIRE_AUTH = defineBoolean("IMAGE_UPLOADS_REQUIRE_AUTH", { default: false });

/** The caller's uid, or null for an anonymous caller while that's still allowed. */
function imageCaller(req: CallableRequest): string | null {
  const uid = req.auth?.uid ?? null;
  if (!uid && IMAGE_UPLOADS_REQUIRE_AUTH.value()) {
    throw new HttpsError("unauthenticated", "Inicia sesión en ALaunchi para subir imágenes.");
  }
  return uid;
}

const normUuid = (u: string) => u.replace(/-/g, "").toLowerCase();
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
  { memory: "1GiB", timeoutSeconds: 60, invoker: "public" },
  async (req) => {
    const caller = imageCaller(req);
    const { kind, base64, uuid, sha1 } = (req.data ?? {}) as Record<string, unknown>;
    const { buf, contentType } = decodeImage(base64);
    const bucket = getStorage().bucket();

    if (kind === "banner") {
      if (typeof uuid !== "string" || !/^[0-9a-f-]{32,36}$/i.test(uuid)) {
        throw new HttpsError("invalid-argument", "UUID no válido.");
      }
      // Signed in: only into your own folder.
      if (caller && normUuid(caller) !== normUuid(uuid)) {
        throw new HttpsError("permission-denied", "Solo puedes subir tus propios banners.");
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
  { memory: "1GiB", timeoutSeconds: 60, invoker: "public" },
  async (req) => {
    imageCaller(req);
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

// ── Firebase Auth from the Minecraft account ────────────────────────────────

const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const SERVER_ID_RE = /^[0-9a-f]{40}$/;

/** "0123…" (Mojang's undashed id) → "01234567-89ab-…", the app's uuid format
 *  (and the key everything in the database already uses). */
function dashedUuid(id: string): string {
  const c = id.replace(/-/g, "").toLowerCase();
  return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
}

/**
 * Signs a player into Firebase as their Minecraft account, without ever
 * seeing their Microsoft/Minecraft token. The app first does what the game
 * does when joining a server: it tells Mojang's session server it's joining
 * `serverId` (a random value it picked), using its own access token
 * (main.js "mc:session-join"). Here we ask Mojang whether that player really
 * joined that id (`hasJoined`, exactly how a Minecraft server verifies a
 * player) and, if so, mint a Firebase custom token whose uid is their uuid.
 *
 * The client then calls signInWithCustomToken; the security rules can trust
 * auth.uid from then on.
 */
export const mintFirebaseToken = onCall({ memory: "256MiB", timeoutSeconds: 20 }, async (req) => {
  const { username, serverId } = (req.data ?? {}) as Record<string, unknown>;
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    throw new HttpsError("invalid-argument", "Nombre de jugador no válido.");
  }
  if (typeof serverId !== "string" || !SERVER_ID_RE.test(serverId)) {
    throw new HttpsError("invalid-argument", "Prueba de sesión no válida.");
  }

  const url =
    "https://sessionserver.mojang.com/session/minecraft/hasJoined" +
    `?username=${encodeURIComponent(username)}&serverId=${encodeURIComponent(serverId)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "ALaunchi-Functions" } });
  } catch (e) {
    logger.error("hasJoined request failed", e);
    throw new HttpsError("unavailable", "No se pudo contactar con Mojang. Inténtalo en un rato.");
  }
  // 204 / empty body: Mojang has no record of that join — not this player.
  if (res.status !== 200) {
    throw new HttpsError("permission-denied", "Mojang no confirmó la sesión.");
  }
  const profile = (await res.json().catch(() => null)) as { id?: string; name?: string } | null;
  if (!profile?.id || typeof profile.id !== "string" || !/^[0-9a-f]{32}$/i.test(profile.id)) {
    throw new HttpsError("permission-denied", "Mojang no confirmó la sesión.");
  }

  const uid = dashedUuid(profile.id);
  const token = await getAuth().createCustomToken(uid, { mc: true });
  return { token, uuid: uid, username: profile.name ?? username };
});

// Online-instance access (claim / codes / redeem): see access.ts.
export { claimInstances, publishAccessCode, redeemAccessCode } from "./access";

// Player reports (submit / moderator panel): see reports.ts.
export { submitReport, listReports, setReportStatus } from "./reports";

// "Borrar mis datos" (Ajustes → Privacidad): see account.ts.
export { deleteMyData } from "./account";
