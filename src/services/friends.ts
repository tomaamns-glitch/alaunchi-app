import { ref, set, remove, get, onValue, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";

/**
 * Friends layer, built on top of the user directory chat.ts already
 * maintains (users/{uuid}) — same trust model as chat/presence/access-codes:
 * no real Firebase Auth, so this is enforced client-side, not by RTDB rules
 * checking identity. Good enough for a private group where nobody has reason
 * to forge someone else's uuid, same reasoning as everything else here.
 *
 * Schema:
 *   friends/{uuid}/{otherUuid}            -> FriendEntry   (mirrored on both sides once accepted)
 *   friendRequests/{toUuid}/{fromUuid}     -> FriendRequestEntry   (incoming — canonical)
 *   sentFriendRequests/{fromUuid}/{toUuid} -> FriendRequestEntry   (outgoing mirror, so the
 *                                              sender can show "solicitud enviada" without
 *                                              being able to read anyone else's incoming list)
 */

export interface FriendEntry {
  username: string;
  since: number;
}

export interface FriendRequestEntry {
  /** The OTHER person's username — the sender's on the incoming side, the
   *  recipient's on the outgoing side. */
  username: string;
  sentAt: number;
}

export async function sendFriendRequest(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string
): Promise<void> {
  if (myUuid === otherUuid) return;
  const sentAt = Date.now();
  await Promise.all([
    set(ref(rtdb, `friendRequests/${otherUuid}/${myUuid}`), { username: myUsername, sentAt }),
    set(ref(rtdb, `sentFriendRequests/${myUuid}/${otherUuid}`), { username: otherUsername, sentAt }),
  ]);
}

/** Withdraws a request you sent, before the other person has answered it. */
export async function cancelFriendRequest(myUuid: string, otherUuid: string): Promise<void> {
  await Promise.all([
    remove(ref(rtdb, `friendRequests/${otherUuid}/${myUuid}`)),
    remove(ref(rtdb, `sentFriendRequests/${myUuid}/${otherUuid}`)),
  ]);
}

/** Turns down a request someone sent you — same cleanup as cancelling, just
 *  initiated from the recipient's side (the two entries are symmetric, so
 *  this is really the same operation with the roles swapped). */
export async function declineFriendRequest(myUuid: string, otherUuid: string): Promise<void> {
  await Promise.all([
    remove(ref(rtdb, `friendRequests/${myUuid}/${otherUuid}`)),
    remove(ref(rtdb, `sentFriendRequests/${otherUuid}/${myUuid}`)),
  ]);
}

export async function acceptFriendRequest(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string
): Promise<void> {
  const since = Date.now();
  await Promise.all([
    set(ref(rtdb, `friends/${myUuid}/${otherUuid}`), { username: otherUsername, since }),
    set(ref(rtdb, `friends/${otherUuid}/${myUuid}`), { username: myUsername, since }),
    remove(ref(rtdb, `friendRequests/${myUuid}/${otherUuid}`)),
    remove(ref(rtdb, `sentFriendRequests/${otherUuid}/${myUuid}`)),
  ]);
}

export async function removeFriend(myUuid: string, otherUuid: string): Promise<void> {
  await Promise.all([
    remove(ref(rtdb, `friends/${myUuid}/${otherUuid}`)),
    remove(ref(rtdb, `friends/${otherUuid}/${myUuid}`)),
  ]);
}

/** One-off check — used to gate a "solo amigos" profile before rendering it.
 *  friends/{a}/{b} and friends/{b}/{a} are always written together (see
 *  acceptFriendRequest/removeFriend), so checking either side is enough. */
export async function areFriends(uuidA: string, uuidB: string): Promise<boolean> {
  const snap = await get(ref(rtdb, `friends/${uuidA}/${uuidB}`));
  return snap.exists();
}

export function subscribeFriends(
  myUuid: string,
  callback: (friends: Record<string, FriendEntry>) => void
): Unsubscribe {
  const r = ref(rtdb, `friends/${myUuid}`);
  const handler = onValue(r, (snap) => callback(snap.val() || {}));
  return () => off(r, "value", handler);
}

export function subscribeIncomingRequests(
  myUuid: string,
  callback: (requests: Record<string, FriendRequestEntry>) => void
): Unsubscribe {
  const r = ref(rtdb, `friendRequests/${myUuid}`);
  const handler = onValue(r, (snap) => callback(snap.val() || {}));
  return () => off(r, "value", handler);
}

export function subscribeSentRequests(
  myUuid: string,
  callback: (requests: Record<string, FriendRequestEntry>) => void
): Unsubscribe {
  const r = ref(rtdb, `sentFriendRequests/${myUuid}`);
  const handler = onValue(r, (snap) => callback(snap.val() || {}));
  return () => off(r, "value", handler);
}
