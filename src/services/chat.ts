import { ref, set, update, push, onValue, runTransaction, serverTimestamp, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { SharedContent } from "./content-share";

export interface ChatMessage {
  senderUuid: string;
  senderUsername: string;
  text: string;
  timestamp: number;
  content?: SharedContent;
}

export interface ChatIndexEntry {
  otherUsername: string;
  lastMessage: string;
  lastTimestamp: number;
  unreadCount?: number;
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

/** One user's directory entry — "Última conexión" in the chat header reads
 *  this (see touchUserDirectory: refreshed both when the launcher opens and
 *  when it's closed-to-tray, so lastSeen tracks actual launcher usage). */
export function subscribeUserActivity(
  uuid: string,
  callback: (activity: KnownUser | null) => void
): Unsubscribe {
  const userRef = ref(rtdb, `users/${uuid}`);
  const handler = onValue(userRef, (snap) => callback(snap.val() ?? null));
  return () => off(userRef, "value", handler);
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

/** Pushes a message and updates both participants' conversation index — the
 *  sender's directly, the recipient's with the sender's real username so their
 *  sidebar shows who it's from even before they've set a nickname for you.
 *  Shared by sendMessage and sendSharedContent, which only differ in the
 *  message body and what shows as the index preview. */
async function pushMessageAndUpdateIndex(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string,
  body: { text: string; content?: SharedContent },
  indexPreview: string
): Promise<void> {
  const conversationId = getConversationId(myUuid, otherUuid);
  const timestamp = Date.now();

  await push(ref(rtdb, `chats/${conversationId}/messages`), {
    senderUuid: myUuid,
    senderUsername: myUsername,
    text: body.text,
    ...(body.content ? { content: body.content } : {}),
    timestamp: serverTimestamp(),
  });

  await Promise.all([
    set(ref(rtdb, `chatIndex/${myUuid}/${otherUuid}`), {
      otherUsername,
      lastMessage: indexPreview,
      lastTimestamp: timestamp,
      unreadCount: 0,
    }),
    // Transaction (not set) on the recipient's side — a plain set would clobber
    // whatever unreadCount was already sitting there from earlier messages.
    runTransaction(ref(rtdb, `chatIndex/${otherUuid}/${myUuid}`), (current) => ({
      otherUsername: myUsername,
      lastMessage: indexPreview,
      lastTimestamp: timestamp,
      unreadCount: (current?.unreadCount || 0) + 1,
    })),
  ]);
}

export async function sendMessage(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await pushMessageAndUpdateIndex(myUuid, myUsername, otherUuid, otherUsername, { text: trimmed }, trimmed);
}

/** Shares a piece of local content (mod/shader/texture pack/emote) as a
 *  message — the recipient sees a card with a Descargar button instead of
 *  plain text. */
export async function sendSharedContent(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string,
  content: SharedContent
): Promise<void> {
  await pushMessageAndUpdateIndex(
    myUuid,
    myUsername,
    otherUuid,
    otherUsername,
    { text: "", content },
    `📎 ${content.displayName}`
  );
}

/** Clears unread count for one conversation — call when the user opens it. */
export async function markConversationRead(myUuid: string, otherUuid: string): Promise<void> {
  await update(ref(rtdb, `chatIndex/${myUuid}/${otherUuid}`), { unreadCount: 0 });
}
