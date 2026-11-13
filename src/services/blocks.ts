import { ref, get, update, onValue, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";

/**
 * Blocking another player (chat header → ⋮ → Bloquear).
 *
 *   blocks/{blockerUuid}/{blockedUuid}   = true   — who I blocked
 *   blockedBy/{blockedUuid}/{blockerUuid} = true  — mirror: who blocked me
 *
 * A block works both ways for the conversation: neither of the two can send
 * messages, files, servers or instances to the other (pushMessageAndUpdateIndex
 * in chat.ts refuses), and the content already shared between them can't be
 * installed or saved any more — the history itself stays readable. Whoever is
 * blocked can't open the blocker's profile. Like the rest of the app there's
 * no Firebase Auth, so this is enforced by the clients, not by the rules.
 */

export class BlockedChatError extends Error {
  constructor() {
    super("No podéis enviaros mensajes: hay un bloqueo entre vosotros.");
    this.name = "BlockedChatError";
  }
}

export async function blockUser(myUuid: string, otherUuid: string): Promise<void> {
  await update(ref(rtdb), {
    [`blocks/${myUuid}/${otherUuid}`]: true,
    [`blockedBy/${otherUuid}/${myUuid}`]: true,
  });
}

/** Child by child: the rules don't allow removing parent nodes at once. */
export async function unblockUser(myUuid: string, otherUuid: string): Promise<void> {
  await update(ref(rtdb), {
    [`blocks/${myUuid}/${otherUuid}`]: null,
    [`blockedBy/${otherUuid}/${myUuid}`]: null,
  });
}

/** Whether either of the two blocked the other — read fresh from the database. */
export async function isBlockedBetween(uuidA: string, uuidB: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([get(ref(rtdb, `blocks/${uuidA}/${uuidB}`)), get(ref(rtdb, `blocks/${uuidB}/${uuidA}`))]);
  return ab.val() === true || ba.val() === true;
}

function subscribeSet(path: string, callback: (uuids: Set<string>) => void): Unsubscribe {
  const r = ref(rtdb, path);
  const handler = onValue(r, (snap) => {
    const val = (snap.val() || {}) as Record<string, unknown>;
    callback(new Set(Object.keys(val).filter((k) => val[k] === true)));
  });
  return () => off(r, "value", handler);
}

/** Who I blocked. */
export function subscribeMyBlocks(myUuid: string, callback: (uuids: Set<string>) => void): Unsubscribe {
  return subscribeSet(`blocks/${myUuid}`, callback);
}

/** Who blocked me. */
export function subscribeBlockedBy(myUuid: string, callback: (uuids: Set<string>) => void): Unsubscribe {
  return subscribeSet(`blockedBy/${myUuid}`, callback);
}
