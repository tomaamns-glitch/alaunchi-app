import { limitToLast, onValue, push, query, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { grantKey } from "@/services/access-codes";
import type { SharedContent } from "@/services/content-share";

// Group chat of an online instance: everyone who plays it talks in one room.
// RTDB `groupChats/{groupKey}/messages/{pushId}`. groupKey is the instance's
// grantKey (repo + id) — instance ids alone can repeat between creators.

export interface GroupMessage {
  id: string;
  senderUuid: string;
  senderUsername: string;
  text: string;
  timestamp: number;
  /** A mod/shader/texture/emote/schematic/skin/screenshot shared in the room
   *  (same card and install flow as the 1:1 chat); text is "" then. */
  content?: SharedContent;
  /** Deleted by its sender (tombstone, see deleteGroupMessage). */
  deleted?: boolean;
}

const MAX_LOADED = 150;

export function groupKeyFor(pack: { id: string; repoUrl?: string }): string {
  if (pack.repoUrl) {
    try {
      return grantKey(pack.repoUrl, pack.id);
    } catch {}
  }
  return pack.id.replace(/[.#$[\]/]/g, "_");
}

/** The last MAX_LOADED messages, oldest first, kept live. */
export function subscribeGroupMessages(groupKey: string, onChange: (messages: GroupMessage[]) => void): () => void {
  return onValue(
    query(ref(rtdb, `groupChats/${groupKey}/messages`), limitToLast(MAX_LOADED)),
    (snap) => {
      const out: GroupMessage[] = [];
      snap.forEach((child) => {
        const v = child.val();
        const content = v?.content && typeof v.content === "object" ? (v.content as SharedContent) : undefined;
        if (v && (typeof v.text === "string" || content)) {
          out.push({
            id: child.key!,
            senderUuid: String(v.senderUuid ?? ""),
            senderUsername: String(v.senderUsername ?? ""),
            text: typeof v.text === "string" ? v.text : "",
            timestamp: Number(v.timestamp) || 0,
            ...(content ? { content } : {}),
            ...(v.deleted ? { deleted: true } : {}),
          });
        }
      });
      onChange(out.sort((a, b) => a.timestamp - b.timestamp));
    },
    () => onChange([])
  );
}

export async function sendGroupMessage(groupKey: string, senderUuid: string, senderUsername: string, text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  await set(push(ref(rtdb, `groupChats/${groupKey}/messages`)), {
    senderUuid,
    senderUsername,
    text: trimmed,
    timestamp: serverTimestamp(),
  });
}

/** Shares content in the room — a card everyone can download/install from
 *  (bytes already uploaded by the picker, see content-share.ts). */
export async function sendGroupContent(groupKey: string, senderUuid: string, senderUsername: string, content: SharedContent): Promise<void> {
  await set(push(ref(rtdb, `groupChats/${groupKey}/messages`)), {
    senderUuid,
    senderUsername,
    text: "",
    content,
    timestamp: serverTimestamp(),
  });
}

/** Removes one of your messages for everyone in the room — or, if the rules
 *  don't allow removing the node, empties it into a "Mensaje eliminado"
 *  tombstone. */
export async function deleteGroupMessage(groupKey: string, messageId: string): Promise<void> {
  const msgRef = ref(rtdb, `groupChats/${groupKey}/messages/${messageId}`);
  try {
    await remove(msgRef);
  } catch {
    await update(msgRef, { text: "", deleted: true, content: null });
  }
}

// Unread = messages from others newer than the last time you had the room
// open. Per user and per PC (localStorage) — a display hint, not shared state.
const readKey = (myUuid: string, groupKey: string) => `alaunchi_group_read:${myUuid}:${groupKey}`;

export function getGroupLastRead(myUuid: string, groupKey: string): number {
  try {
    return Number(localStorage.getItem(readKey(myUuid, groupKey))) || 0;
  } catch {
    return 0;
  }
}

export function setGroupLastRead(myUuid: string, groupKey: string, timestamp: number): void {
  try {
    localStorage.setItem(readKey(myUuid, groupKey), String(timestamp));
  } catch {}
}
