import { ref, set, push, onValue, serverTimestamp, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export interface ChatMessage {
  senderUuid: string;
  senderUsername: string;
  text: string;
  timestamp: number;
}

export interface ChatIndexEntry {
  otherUsername: string;
  lastMessage: string;
  lastTimestamp: number;
}

export interface KnownUser {
  username: string;
  lastSeen: number;
}

/** Deterministic id for a 1:1 conversation — both participants read/write the
 *  same node regardless of who started it. */
export function getConversationId(uuidA: string, uuidB: string): string {
  return [uuidA, uuidB].sort().join("_");
}

/** Registers you in the shared directory of players others can start a chat
 *  with. Call once at startup, same spirit as the presence sync. */
export async function touchUserDirectory(uuid: string, username: string): Promise<void> {
  await set(ref(rtdb, `users/${uuid}`), { username, lastSeen: serverTimestamp() });
}

export function subscribeUserDirectory(callback: (users: Record<string, KnownUser>) => void): Unsubscribe {
  const usersRef = ref(rtdb, "users");
  const handler = onValue(usersRef, (snap) => callback(snap.val() || {}));
  return () => off(usersRef, "value", handler);
}

export function subscribeChatIndex(
  myUuid: string,
  callback: (index: Record<string, ChatIndexEntry>) => void
): Unsubscribe {
  const indexRef = ref(rtdb, `chatIndex/${myUuid}`);
  const handler = onValue(indexRef, (snap) => callback(snap.val() || {}));
  return () => off(indexRef, "value", handler);
}

export function subscribeMessages(
  conversationId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const messagesRef = ref(rtdb, `chats/${conversationId}/messages`);
  const handler = onValue(messagesRef, (snap) => {
    const val = snap.val() || {};
    callback(Object.values(val) as ChatMessage[]);
  });
  return () => off(messagesRef, "value", handler);
}

/** Sends a message and updates both participants' conversation index — the
 *  sender's directly, the recipient's with the sender's real username so their
 *  sidebar shows who it's from even before they've set a nickname for you. */
export async function sendMessage(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const conversationId = getConversationId(myUuid, otherUuid);
  const timestamp = Date.now();

  await push(ref(rtdb, `chats/${conversationId}/messages`), {
    senderUuid: myUuid,
    senderUsername: myUsername,
    text: trimmed,
    timestamp: serverTimestamp(),
  });

  await Promise.all([
    set(ref(rtdb, `chatIndex/${myUuid}/${otherUuid}`), {
      otherUsername,
      lastMessage: trimmed,
      lastTimestamp: timestamp,
    }),
    set(ref(rtdb, `chatIndex/${otherUuid}/${myUuid}`), {
      otherUsername: myUsername,
      lastMessage: trimmed,
      lastTimestamp: timestamp,
    }),
  ]);
}
