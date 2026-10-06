import { ref, get, set, update, remove, serverTimestamp, onValue, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { canonicalRepoUrl, repoKey } from "@/lib/sources";

// Access codes (v2) — how a player reaches ONE online instance in someone
// else's repo. There's no default repo: a code is the only way in, so it has
// to carry where the instance lives ({repoUrl, modpackId}) and, for a private
// repo, the creator's read-only token.
//
// That token is never stored readable: it's encrypted with a key derived from
// the code itself (PBKDF2 → AES-GCM), so only someone who knows the code can
// use it. Codes are long enough (10 chars of a 31-letter alphabet) that
// guessing one offline isn't practical.
//
// No Firebase Auth exists in this app (chat/presence don't use it either), so
// grants in Firebase are trust-level bookkeeping ("who did the creator give
// this to"). The real gate for a private repo is the GitHub token; for a public
// one the repo is readable by anyone anyway, a code just adds it to your list.
//
// Layout (the Firebase rules only accept a string in codeIndex and `true` in
// userAccess — so the entry travels as JSON text, and the grant key itself
// already identifies repo + instance):
//   codeIndex/{code}               → JSON.stringify(CodeEntry)  (pre-v2: bare modpack id)
//   modpackCodes/{grantKey}        → current code of that instance
//   modpackGrants/{grantKey}/{uuid}→ { username, grantedAt }
//   userAccess/{uuid}/{grantKey}   → true
//   modpackBans/{grantKey}/{uuid}  → { username, bannedAt }  — blocked: no code
//                                    or invitation gets them back in

// Excludes 0/O/1/I/L so a spoken/typed code is never ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const PBKDF2_ITERATIONS = 150_000;

interface EncryptedPayload {
  salt: string;
  iv: string;
  ct: string;
}

interface CodeEntry {
  v: 2;
  repoUrl: string;
  modpackId: string;
  creatorUuid: string;
  /** Only for private repos — the read token, encrypted with the code. */
  payload?: EncryptedPayload;
}

export interface AccessGrant {
  username: string;
  grantedAt: number;
}

export interface AccessBan {
  username: string;
  bannedAt: number;
}

/** Thrown when a blocked player tries to join (by code or invitation). */
export class BannedFromInstanceError extends Error {
  constructor() {
    super("El creador de esta instancia te ha bloqueado: no puedes unirte a ella.");
  }
}

/** What redeeming (or refreshing) a code resolves to. */
export interface RedeemedAccess {
  repoUrl: string;
  modpackId: string;
  /** Present for a private repo. */
  readToken?: string;
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

/** Codes are shown as "ABCDE-FGHJK" but typed however — dashes/spaces/case don't matter. */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

/** Firebase-safe key of one instance in one repo — unique across creators
 *  even when two of them use the same modpack id. */
export function grantKey(repoUrl: string, modpackId: string): string {
  const key = repoKey(repoUrl);
  if (!key) throw new Error("Repositorio no válido.");
  return `${key.replace("/", "~")}~${modpackId}`.replace(/[.#$[\]/]/g, "_");
}

// --- crypto -----------------------------------------------------------------

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Array.from(atob(s), (c) => c.charCodeAt(0)));

async function keyFromCode(code: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptToken(code: string, token: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromCode(code, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

async function decryptToken(code: string, payload: EncryptedPayload): Promise<string> {
  const key = await keyFromCode(code, unb64(payload.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.iv) }, key, unb64(payload.ct));
  return new TextDecoder().decode(pt);
}

async function buildEntry(code: string, repoUrl: string, modpackId: string, creatorUuid: string, readToken?: string): Promise<CodeEntry> {
  const url = canonicalRepoUrl(repoUrl);
  if (!url) throw new Error("Repositorio no válido.");
  return {
    v: 2,
    repoUrl: url,
    modpackId,
    creatorUuid,
    ...(readToken ? { payload: await encryptToken(code, readToken) } : {}),
  };
}

function parseEntry(raw: unknown): CodeEntry | "legacy" | null {
  if (typeof raw !== "string" || !raw) return null;
  // Pre-v2 codes stored a bare modpack id, from when the app had one fixed repo.
  if (!raw.startsWith("{")) return "legacy";
  try {
    const e = JSON.parse(raw);
    return e?.v === 2 && e.repoUrl && e.modpackId ? e : null;
  } catch {
    return null;
  }
}

async function resolveEntry(code: string, raw: unknown): Promise<RedeemedAccess | null> {
  const e = parseEntry(raw);
  if (e === "legacy") throw new Error("Este código es del sistema antiguo. Pide al creador un código nuevo.");
  if (!e) return null;
  const readToken = e.payload ? await decryptToken(code, e.payload) : undefined;
  return { repoUrl: e.repoUrl, modpackId: e.modpackId, readToken };
}

// --- creator side -------------------------------------------------------------

/** Creates this instance's code. `readToken` only for a private repo. */
export async function createAccessCode(
  repoUrl: string,
  modpackId: string,
  creatorUuid: string,
  readToken?: string
): Promise<string> {
  const code = generateCode();
  const entry = await buildEntry(code, repoUrl, modpackId, creatorUuid, readToken);
  await Promise.all([
    set(ref(rtdb, `codeIndex/${code}`), JSON.stringify(entry)),
    set(ref(rtdb, `modpackCodes/${grantKey(repoUrl, modpackId)}`), code),
  ]);
  return code;
}

/** Rotates the code — the old one stops working for new redemptions AND for
 *  refreshing the read token, so together with rotating the token in GitHub
 *  it really cuts off whoever only had the old code. */
export async function regenerateAccessCode(
  repoUrl: string,
  modpackId: string,
  creatorUuid: string,
  readToken?: string
): Promise<string> {
  const key = grantKey(repoUrl, modpackId);
  const oldCode = (await get(ref(rtdb, `modpackCodes/${key}`))).val() as string | null;
  const newCode = await createAccessCode(repoUrl, modpackId, creatorUuid, readToken);
  if (oldCode && oldCode !== newCode) await remove(ref(rtdb, `codeIndex/${oldCode}`));
  return newCode;
}

export async function getAccessCode(repoUrl: string, modpackId: string): Promise<string | null> {
  return (await get(ref(rtdb, `modpackCodes/${grantKey(repoUrl, modpackId)}`))).val() as string | null;
}

/** After the creator changes their read token (or repo visibility), re-encrypts
 *  it into every existing code of theirs — so players refreshing through their
 *  code pick up the new token instead of being locked out. */
export async function reencryptAccessCodes(
  repoUrl: string,
  modpackIds: string[],
  creatorUuid: string,
  readToken?: string
): Promise<void> {
  await Promise.all(
    modpackIds.map(async (modpackId) => {
      const code = await getAccessCode(repoUrl, modpackId);
      if (!code) return;
      const entry = await buildEntry(code, repoUrl, modpackId, creatorUuid, readToken);
      await set(ref(rtdb, `codeIndex/${code}`), JSON.stringify(entry));
    })
  );
}

export async function revokeAccess(repoUrl: string, modpackId: string, uuid: string): Promise<void> {
  const key = grantKey(repoUrl, modpackId);
  await Promise.all([remove(ref(rtdb, `modpackGrants/${key}/${uuid}`)), remove(ref(rtdb, `userAccess/${uuid}/${key}`))]);
}

/** Live list of who currently has access to one instance — admin's "Acceso" tab. */
export function subscribeAccessGrants(
  repoUrl: string,
  modpackId: string,
  callback: (grants: Record<string, AccessGrant>) => void
): Unsubscribe {
  const grantsRef = ref(rtdb, `modpackGrants/${grantKey(repoUrl, modpackId)}`);
  const handler = onValue(grantsRef, (snap) => callback(snap.val() || {}));
  return () => handler();
}

// --- player side ----------------------------------------------------------------

/** Resolves a code and records the grant. Returns null (not a throw) for an
 *  unknown code — the dialog shows that inline. */
export async function redeemAccessCode(code: string, uuid: string, username: string): Promise<RedeemedAccess | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const raw = (await get(ref(rtdb, `codeIndex/${normalized}`))).val();
  const access = await resolveEntry(normalized, raw);
  if (!access) return null;
  const key = grantKey(access.repoUrl, access.modpackId);
  if ((await get(ref(rtdb, `modpackBans/${key}/${uuid}`))).exists()) throw new BannedFromInstanceError();
  await update(ref(rtdb), {
    [`modpackGrants/${key}/${uuid}`]: { username, grantedAt: serverTimestamp() },
    [`userAccess/${uuid}/${key}`]: true,
  });
  return access;
}

/** Re-reads a code already redeemed, for when its repo's read token stopped
 *  working (the creator rotated it). null = that code no longer exists. */
export async function refreshAccess(code: string): Promise<RedeemedAccess | null> {
  const raw = (await get(ref(rtdb, `codeIndex/${normalizeCode(code)}`))).val();
  if (parseEntry(raw) === "legacy") return null;
  return resolveEntry(normalizeCode(code), raw);
}

/** grantKeys of every instance this uuid was given access to. */
export async function getUserAccessSet(uuid: string): Promise<Set<string>> {
  const snap = await get(ref(rtdb, `userAccess/${uuid}`));
  return new Set(Object.keys(snap.val() || {}));
}

// --- blocked players -------------------------------------------------------------

/** Blocks a player from one instance: removes the access they have (if any),
 *  any invitation pending for them, and stops any code or invitation from
 *  getting them back in until unblocked. */
export async function banFromInstance(repoUrl: string, modpackId: string, uuid: string, username: string): Promise<void> {
  const key = grantKey(repoUrl, modpackId);
  await set(ref(rtdb, `modpackBans/${key}/${uuid}`), { username, bannedAt: serverTimestamp() });
  // Child by child — the rules don't allow removing parent nodes in one go.
  await Promise.all([
    remove(ref(rtdb, `modpackGrants/${key}/${uuid}`)),
    remove(ref(rtdb, `userAccess/${uuid}/${key}`)),
    remove(ref(rtdb, `modpackInvites/${key}/${uuid}`)),
    remove(ref(rtdb, `invites/${uuid}/${key}`)),
  ]);
}

export async function unbanFromInstance(repoUrl: string, modpackId: string, uuid: string): Promise<void> {
  await remove(ref(rtdb, `modpackBans/${grantKey(repoUrl, modpackId)}/${uuid}`));
}

export async function isBannedFromInstance(repoUrl: string, modpackId: string, uuid: string): Promise<boolean> {
  return (await get(ref(rtdb, `modpackBans/${grantKey(repoUrl, modpackId)}/${uuid}`))).exists();
}

/** Live list of who's blocked from one instance — admin's "Acceso" tab. */
export function subscribeBans(
  repoUrl: string,
  modpackId: string,
  callback: (bans: Record<string, AccessBan>) => void
): Unsubscribe {
  const bansRef = ref(rtdb, `modpackBans/${grantKey(repoUrl, modpackId)}`);
  return onValue(
    bansRef,
    (snap) => callback(snap.val() || {}),
    () => callback({})
  );
}
