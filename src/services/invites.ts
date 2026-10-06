import { ref, get, set, update, remove, serverTimestamp, onValue, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { grantKey, isBannedFromInstance } from "@/services/access-codes";

// Invitations to an online instance — the creator picks a player by name
// instead of handing out the code. The invitation carries the instance's
// current access code, so accepting one is exactly redeeming that code
// (same grant, same read-token handling, same block check).
//
// Layout:
//   invites/{toUuid}/{grantKey}         → Invite   (what the invited player sees)
//   modpackInvites/{grantKey}/{toUuid}  → { username, sentAt }  (creator's pending list)
// Keyed by grantKey: at most one invitation per player and instance —
// inviting again just refreshes it.

export interface Invite {
  /** grantKey of the instance — also this invitation's id. */
  key: string;
  repoUrl: string;
  modpackId: string;
  modpackName: string;
  imageUrl?: string;
  /** Instance color, worked out by the sender (`hsl(...)`) — the invited
   *  player doesn't have the instance to compute it from. */
  color?: string;
  code: string;
  fromUuid: string;
  fromUsername: string;
  sentAt: number;
}

export interface PendingInvite {
  username: string;
  sentAt: number;
}

export async function sendInvite(params: {
  repoUrl: string;
  modpackId: string;
  modpackName: string;
  imageUrl?: string;
  color?: string;
  code: string;
  fromUuid: string;
  fromUsername: string;
  toUuid: string;
  toUsername: string;
}): Promise<void> {
  if (await isBannedFromInstance(params.repoUrl, params.modpackId, params.toUuid)) {
    throw new Error(`${params.toUsername} está bloqueado en esta instancia. Desbloquéalo antes de invitarle.`);
  }
  const key = grantKey(params.repoUrl, params.modpackId);
  const invite: Omit<Invite, "sentAt"> & { sentAt: object } = {
    key,
    repoUrl: params.repoUrl,
    modpackId: params.modpackId,
    modpackName: params.modpackName,
    ...(params.imageUrl ? { imageUrl: params.imageUrl } : {}),
    ...(params.color ? { color: params.color } : {}),
    code: params.code,
    fromUuid: params.fromUuid,
    fromUsername: params.fromUsername,
    sentAt: serverTimestamp(),
  };
  await Promise.all([
    set(ref(rtdb, `invites/${params.toUuid}/${key}`), invite),
    set(ref(rtdb, `modpackInvites/${key}/${params.toUuid}`), { username: params.toUsername, sentAt: serverTimestamp() }),
  ]);
}

/** Removes an invitation from both sides — cancelled by the creator, or
 *  accepted/rejected by the player. Child by child (the rules don't allow
 *  removing parent nodes in one go). */
export async function clearInvite(key: string, toUuid: string): Promise<void> {
  await Promise.all([remove(ref(rtdb, `invites/${toUuid}/${key}`)), remove(ref(rtdb, `modpackInvites/${key}/${toUuid}`))]);
}

export async function cancelInvite(repoUrl: string, modpackId: string, toUuid: string): Promise<void> {
  await clearInvite(grantKey(repoUrl, modpackId), toUuid);
}

/** After the creator regenerates the code, pending invitations would carry a
 *  dead one — point them at the new code instead. */
export async function updatePendingInviteCodes(repoUrl: string, modpackId: string, newCode: string): Promise<void> {
  const key = grantKey(repoUrl, modpackId);
  const pending = ((await get(ref(rtdb, `modpackInvites/${key}`))).val() || {}) as Record<string, PendingInvite>;
  await Promise.all(
    Object.keys(pending).map((uuid) => update(ref(rtdb, `invites/${uuid}/${key}`), { code: newCode }).catch(() => {}))
  );
}

/** Invitations sent for one instance and not answered yet — admin's "Acceso" tab. */
export function subscribePendingInvites(
  repoUrl: string,
  modpackId: string,
  callback: (pending: Record<string, PendingInvite>) => void
): Unsubscribe {
  return onValue(
    ref(rtdb, `modpackInvites/${grantKey(repoUrl, modpackId)}`),
    (snap) => callback(snap.val() || {}),
    () => callback({})
  );
}

/** Invitations this player has received. */
export function subscribeMyInvites(uuid: string, callback: (invites: Record<string, Invite>) => void): Unsubscribe {
  return onValue(
    ref(rtdb, `invites/${uuid}`),
    (snap) => {
      const raw = (snap.val() || {}) as Record<string, Invite>;
      const valid: Record<string, Invite> = {};
      for (const [key, inv] of Object.entries(raw)) {
        if (inv && inv.repoUrl && inv.modpackId && inv.code) valid[key] = { ...inv, key };
      }
      callback(valid);
    },
    () => callback({})
  );
}
