import { ref, set, update, push, onValue, runTransaction, serverTimestamp, off, type Unsubscribe } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import type { SharedContent } from "./content-share";

export interface ChatMessage {
  senderUuid: string;
  senderUsername: string;
  text: string;
  timestamp: number;
  content?: SharedContent;
  /** Set when sent from the chat's "carousel instance" mode instead of
   *  "general" — the id of that catalog modpack. Absent = general mode
   *  (covers every message sent before this field existed too). The sender
   *  doesn't know whether the recipient even has this modpack; that's decided
   *  at render time by whoever's reading the message. */
  carouselInstanceId?: string;
}

export interface ChatIndexEntry {
  otherUsername: string;
  lastMessage: string;
  lastTimestamp: number;
  unreadCount?: number;
  /** Set by deleteConversationForMe — messages at or before this ms timestamp
   *  are hidden from view for the current user only (never written to/read
   *  from the shared chats/{conversationId}/messages node, so the other
   *  participant's history is untouched). A message sent/received after this
   *  point shows normally, effectively starting the conversation fresh. */
  deletedBefore?: number;
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
  body: { text: string; content?: SharedContent; carouselInstanceId?: string },
  indexPreview: string
): Promise<void> {
  const conversationId = getConversationId(myUuid, otherUuid);
  const timestamp = Date.now();

  await push(ref(rtdb, `chats/${conversationId}/messages`), {
    senderUuid: myUuid,
    senderUsername: myUsername,
    text: body.text,
    ...(body.content ? { content: body.content } : {}),
    ...(body.carouselInstanceId ? { carouselInstanceId: body.carouselInstanceId } : {}),
    timestamp: serverTimestamp(),
  });

  await Promise.all([
    // update (not set) — a plain set would also wipe out deletedBefore if the
    // sender had previously deleted their own view of this conversation and
    // is now sending a fresh message; update() only touches these four keys.
    update(ref(rtdb, `chatIndex/${myUuid}/${otherUuid}`), {
      otherUsername,
      lastMessage: indexPreview,
      lastTimestamp: timestamp,
      unreadCount: 0,
    }),
    // Transaction (not set) on the recipient's side — a plain set would clobber
    // whatever unreadCount was already sitting there from earlier messages.
    // Same reasoning as above: explicitly carry deletedBefore over instead of
    // letting the transaction's replacement value silently drop it.
    runTransaction(ref(rtdb, `chatIndex/${otherUuid}/${myUuid}`), (current) => ({
      ...(current?.deletedBefore ? { deletedBefore: current.deletedBefore } : {}),
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
  text: string,
  carouselInstanceId?: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await pushMessageAndUpdateIndex(myUuid, myUsername, otherUuid, otherUsername, { text: trimmed, carouselInstanceId }, trimmed);
}

/** Shares a piece of local content (mod/shader/texture pack/emote) as a
 *  message — the recipient sees a card with a Descargar button instead of
 *  plain text. */
export async function sendSharedContent(
  myUuid: string,
  myUsername: string,
  otherUuid: string,
  otherUsername: string,
  content: SharedContent,
  carouselInstanceId?: string
): Promise<void> {
  await pushMessageAndUpdateIndex(
    myUuid,
    myUsername,
    otherUuid,
    otherUsername,
    { text: "", content, carouselInstanceId },
    `📎 ${content.displayName}`
  );
}

/** Clears unread count for one conversation — call when the user opens it. */
export async function markConversationRead(myUuid: string, otherUuid: string): Promise<void> {
  await update(ref(rtdb, `chatIndex/${myUuid}/${otherUuid}`), { unreadCount: 0 });
}

/** "Eliminar conversación" — hides the history up to now for the current user
 *  only. Never touches chats/{conversationId}/messages (shared with the other
 *  participant); ChatWindow filters messages against this marker at render
 *  time instead. A message sent/received after this point (by either side)
 *  shows normally — see pushMessageAndUpdateIndex, which is careful to carry
 *  this field forward rather than dropping it on the next message. */
export async function deleteConversationForMe(myUuid: string, otherUuid: string): Promise<void> {
  await update(ref(rtdb, `chatIndex/${myUuid}/${otherUuid}`), { deletedBefore: Date.now() });
}
