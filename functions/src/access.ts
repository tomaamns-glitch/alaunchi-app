import { getDatabase, ServerValue } from "firebase-admin/database";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

/**
 * Online-instance access, moved server-side (phase 2 of the Firebase Auth
 * migration) so the database rules can close these paths to clients:
 *
 *  - claimInstances: proves a player is a creator of a GitHub repo and records
 *    instanceOwners/{grantKey}/{uid} for its instances. The proof is a file in
 *    the repo itself, `alaunchi-owner.json` ({"owners": [uuid, …]}), which the
 *    creator's app writes with their admin token — only someone who can write
 *    to the repo can put their uuid there, and the admin token never leaves
 *    their PC. Read here with the players' read token for private repos.
 *  - publishAccessCode: creates / rotates / re-encrypts an instance's code
 *    (codeIndex + modpackCodes), owners only.
 *  - redeemAccessCode: resolves a code and records the grant (modpackGrants +
 *    userAccess), refusing banned players.
 *
 * `invoker: "public"`: Cloud Run lets anyone reach them (a first deploy left
 * them private and every call got a 401 before running) — the auth check is
 * requireUid below. Everything requires Firebase Auth (uid = the player's Minecraft uuid, see
 * mintFirebaseToken). The key formats mirror the app's exactly
 * (src/lib/sources.ts repoKey, src/services/access-codes.ts grantKey).
 */

const OWNER_FILE = "alaunchi-owner.json";
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;
const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/;
// Instance ids end up as folder names in the app (assertSafeInstanceId) and as
// part of database keys here.
const MODPACK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión en ALaunchi para hacer esto.");
  return uid;
}

const normUuid = (u: string) => u.replace(/-/g, "").toLowerCase();

function parseRepo(repoUrl: unknown): { owner: string; repo: string } | null {
  if (typeof repoUrl !== "string" || !repoUrl) return null;
  const gh = repoUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (gh) return { owner: gh[1], repo: gh[2].replace(/\.git$/, "") };
  const slash = repoUrl.match(/^([^/\s]+)\/([^/\s]+)$/);
  return slash ? { owner: slash[1], repo: slash[2] } : null;
}

/** Same as the app's grantKey(repoUrl, modpackId). */
function grantKeyOf(repoUrl: string, modpackId: string): string {
  const p = parseRepo(repoUrl);
  if (!p) throw new HttpsError("invalid-argument", "Repositorio no válido.");
  const key = `${p.owner}/${p.repo}`.toLowerCase();
  return `${key.replace("/", "~")}~${modpackId}`.replace(/[.#$[\]/]/g, "_");
}

function requireModpackId(id: unknown): string {
  if (typeof id !== "string" || !MODPACK_ID_RE.test(id)) throw new HttpsError("invalid-argument", "Id de instancia no válido.");
  return id;
}

// ── claimInstances ──────────────────────────────────────────────────────────

export const claimInstances = onCall({ memory: "256MiB", timeoutSeconds: 30, invoker: "public" }, async (req) => {
  const uid = requireUid(req);
  const { repoUrl, readToken, modpackIds } = (req.data ?? {}) as Record<string, unknown>;
  const repo = parseRepo(repoUrl);
  if (!repo) throw new HttpsError("invalid-argument", "Repositorio no válido.");
  if (!Array.isArray(modpackIds) || modpackIds.length === 0 || modpackIds.length > 200) {
    throw new HttpsError("invalid-argument", "Lista de instancias no válida.");
  }
  const ids = modpackIds.map(requireModpackId);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ALaunchi-Functions",
  };
  if (typeof readToken === "string" && readToken) headers.Authorization = `Bearer ${readToken}`;
  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${OWNER_FILE}`;
  let owners: string[] = [];
  try {
    const res = await fetch(url, { headers });
    if (res.status === 404) throw new HttpsError("failed-precondition", "El repositorio no tiene el archivo de propietario.");
    if (!res.ok) throw new HttpsError("unavailable", `GitHub devolvió ${res.status}.`);
    const json = JSON.parse(await res.text()) as { owners?: unknown };
    owners = Array.isArray(json.owners) ? json.owners.filter((o): o is string => typeof o === "string") : [];
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.warn("claimInstances: owner file unreadable", e);
    throw new HttpsError("unavailable", "No se pudo leer el archivo de propietario del repositorio.");
  }
  if (!owners.some((o) => normUuid(o) === normUuid(uid))) {
    throw new HttpsError("permission-denied", "Tu cuenta no figura como propietaria de este repositorio.");
  }

  const updates: Record<string, true> = {};
  for (const id of ids) updates[`instanceOwners/${grantKeyOf(repoUrl as string, id)}/${uid}`] = true;
  await getDatabase().ref().update(updates);
  return { claimed: ids.length };
});

// ── publishAccessCode ───────────────────────────────────────────────────────

interface CodeEntry {
  v: 2;
  repoUrl: string;
  modpackId: string;
  creatorUuid: string;
  payload?: { salt: string; iv: string; ct: string };
}

export const publishAccessCode = onCall({ memory: "256MiB", timeoutSeconds: 20, invoker: "public" }, async (req) => {
  const uid = requireUid(req);
  const { code, entry } = (req.data ?? {}) as Record<string, unknown>;
  if (typeof code !== "string" || !CODE_RE.test(code)) throw new HttpsError("invalid-argument", "Código no válido.");
  if (typeof entry !== "string" || entry.length > 4000) throw new HttpsError("invalid-argument", "Datos del código no válidos.");
  let e: CodeEntry;
  try {
    e = JSON.parse(entry);
  } catch {
    throw new HttpsError("invalid-argument", "Datos del código no válidos.");
  }
  if (e?.v !== 2 || typeof e.repoUrl !== "string" || typeof e.creatorUuid !== "string") {
    throw new HttpsError("invalid-argument", "Datos del código no válidos.");
  }
  const modpackId = requireModpackId(e.modpackId);
  if (normUuid(e.creatorUuid) !== normUuid(uid)) throw new HttpsError("permission-denied", "El código no es tuyo.");
  const key = grantKeyOf(e.repoUrl, modpackId);

  const db = getDatabase();
  const owner = await db.ref(`instanceOwners/${key}/${uid}`).get();
  if (owner.val() !== true) throw new HttpsError("permission-denied", "No eres el creador de esta instancia.");

  // A code already in use by another instance is never overwritten.
  const existing = (await db.ref(`codeIndex/${code}`).get()).val();
  if (typeof existing === "string" && existing.startsWith("{")) {
    try {
      const other = JSON.parse(existing) as CodeEntry;
      if (grantKeyOf(other.repoUrl, other.modpackId) !== key) throw new HttpsError("already-exists", "Ese código ya existe.");
    } catch (err) {
      if (err instanceof HttpsError) throw err;
    }
  }

  const old = (await db.ref(`modpackCodes/${key}`).get()).val();
  const updates: Record<string, string | null> = {
    [`codeIndex/${code}`]: entry,
    [`modpackCodes/${key}`]: code,
  };
  // Rotating: the old code stops working.
  if (typeof old === "string" && old !== code && CODE_RE.test(old)) updates[`codeIndex/${old}`] = null;
  await db.ref().update(updates);
  return { ok: true };
});

// ── redeemAccessCode ────────────────────────────────────────────────────────

export const redeemAccessCode = onCall({ memory: "256MiB", timeoutSeconds: 20, invoker: "public" }, async (req) => {
  const uid = requireUid(req);
  const { code, username } = (req.data ?? {}) as Record<string, unknown>;
  if (typeof code !== "string" || !CODE_RE.test(code)) return { found: false };
  if (typeof username !== "string" || !USERNAME_RE.test(username)) throw new HttpsError("invalid-argument", "Nombre no válido.");

  const db = getDatabase();
  const raw = (await db.ref(`codeIndex/${code}`).get()).val();
  if (typeof raw !== "string" || !raw) return { found: false };
  // Pre-v2 codes: a bare modpack id from the single-repo days.
  if (!raw.startsWith("{")) return { found: true, legacy: true };
  let e: CodeEntry;
  try {
    e = JSON.parse(raw);
  } catch {
    return { found: false };
  }
  if (e?.v !== 2 || typeof e.repoUrl !== "string" || typeof e.modpackId !== "string") return { found: false };
  const key = grantKeyOf(e.repoUrl, e.modpackId);

  if ((await db.ref(`modpackBans/${key}/${uid}`).get()).exists()) {
    throw new HttpsError("permission-denied", "Bloqueado en esta instancia.", { banned: true });
  }
  await db.ref().update({
    [`modpackGrants/${key}/${uid}`]: { username, grantedAt: ServerValue.TIMESTAMP },
    [`userAccess/${uid}/${key}`]: true,
  });
  // The client decrypts the read token itself (it has the code).
  return { found: true, entry: raw };
});
