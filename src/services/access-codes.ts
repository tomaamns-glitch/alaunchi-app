import { ref, get, set, remove, serverTimestamp, onValue, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";

// Per-modpack access codes — lets the admin restrict which of the players in
// the group can see a given modpack, without touching the GitHub catalog
// (modpacks.json/manifest.json are fetched wholesale by every install with
// the one shared reader token, so a code stored there would be world-readable
// and wouldn't gate anything). Lives entirely in Firebase RTDB instead, same
// place chat/presence already keep their own state — see presence.ts for the
// sibling pattern this mirrors (ref/set/update/onValue over `rtdb`).
//
// No Firebase Auth exists in this app (chat/presence don't use it either), so
// none of this is enforced server-side by identity — it's the same trust
// level the rest of the app already runs on for a private friend group. The
// real gate is that a code has to be *known* to be used, not cryptography.

// Excludes 0/O/1/I/L so a spoken/typed code is never ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export interface AccessGrant {
  username: string;
  grantedAt: number;
}

async function grantAccess(modpackId: string, uuid: string, username: string): Promise<void> {
  await Promise.all([
    set(ref(rtdb, `modpackGrants/${modpackId}/${uuid}`), { username, grantedAt: serverTimestamp() }),
    set(ref(rtdb, `userAccess/${uuid}/${modpackId}`), true),
  ]);
}

/** Generates this modpack's first code and auto-grants the creating admin,
 *  so it shows up in their own carousel without redeeming their own code. */
export async function createAccessCode(modpackId: string, adminUuid: string, adminUsername: string): Promise<string> {
  const code = generateCode();
  await Promise.all([
    set(ref(rtdb, `modpackCodes/${modpackId}`), code),
    set(ref(rtdb, `codeIndex/${code}`), modpackId),
  ]);
  await grantAccess(modpackId, adminUuid, adminUsername);
  return code;
}

/** Rotates the code — old shares stop working, but grants already given stay
 *  untouched (this only affects future redemptions). */
export async function regenerateAccessCode(modpackId: string): Promise<string> {
  const oldCode = (await get(ref(rtdb, `modpackCodes/${modpackId}`))).val() as string | null;
  const newCode = generateCode();
  const ops: Promise<void>[] = [
    set(ref(rtdb, `modpackCodes/${modpackId}`), newCode),
    set(ref(rtdb, `codeIndex/${newCode}`), modpackId),
  ];
  if (oldCode) ops.push(remove(ref(rtdb, `codeIndex/${oldCode}`)));
  await Promise.all(ops);
  return newCode;
}

/** Resolves a code to its modpack and records the grant. Returns null (not a
 *  throw) for an unknown code — the dialog shows that inline, not as a toast. */
export async function redeemAccessCode(code: string, uuid: string, username: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  const modpackId = (await get(ref(rtdb, `codeIndex/${normalized}`))).val() as string | null;
  if (!modpackId) return null;
  await grantAccess(modpackId, uuid, username);
  return modpackId;
}

export async function revokeAccess(modpackId: string, uuid: string): Promise<void> {
  await Promise.all([
    remove(ref(rtdb, `modpackGrants/${modpackId}/${uuid}`)),
    remove(ref(rtdb, `userAccess/${uuid}/${modpackId}`)),
  ]);
}

/** Live list of who currently has access to one modpack — for the admin's
 *  "Acceso" tab. */
export function subscribeAccessGrants(
  modpackId: string,
  callback: (grants: Record<string, AccessGrant>) => void
): Unsubscribe {
  const grantsRef = ref(rtdb, `modpackGrants/${modpackId}`);
  const handler = onValue(grantsRef, (snap) => callback(snap.val() || {}));
  return () => handler();
}

export async function getAccessCode(modpackId: string): Promise<string | null> {
  return (await get(ref(rtdb, `modpackCodes/${modpackId}`))).val() as string | null;
}

/** Every modpackId that has a code at all — anything NOT in this set is
 *  unrestricted (legacy behavior: packs created before this feature, or any
 *  future one whose code creation failed, stay visible to everyone). */
export async function getGatedModpackIds(): Promise<Set<string>> {
  const snap = await get(ref(rtdb, "modpackCodes"));
  return new Set(Object.keys(snap.val() || {}));
}

/** Which gated modpacks this uuid has been granted access to. */
export async function getUserAccessSet(uuid: string): Promise<Set<string>> {
  const snap = await get(ref(rtdb, `userAccess/${uuid}`));
  return new Set(Object.keys(snap.val() || {}));
}
