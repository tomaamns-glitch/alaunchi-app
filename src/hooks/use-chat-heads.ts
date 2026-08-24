import { create } from "zustand";
import { subscribeChatIndex, markConversationRead, type ChatIndexEntry } from "@/services/chat";
import { focusWindow } from "@/services/electron";

/** Native OS notification for an incoming chat message — same pattern as
 *  notifyConnected in presence-button.tsx. */
function notifyNewMessage(name: string, text: string) {
  if (typeof Notification === "undefined") return;
  const n = new Notification(name, { body: text });
  n.onclick = () => focusWindow();
}

interface ChatHeadsState {
  myUuid: string | null;
  chatIndex: Record<string, ChatIndexEntry>;
  openUuid: string | null;
  pinnedUuids: Set<string>;
  init: (myUuid: string) => void;
  openChat: (uuid: string) => void;
  minimizeChat: () => void;
  closeChat: (uuid: string) => void;
}

let unsubscribeIndex: (() => void) | null = null;

export const useChatHeads = create<ChatHeadsState>((set, get) => ({
  myUuid: null,
  chatIndex: {},
  openUuid: null,
  pinnedUuids: new Set(),

  init: (myUuid) => {
    if (get().myUuid === myUuid) return;
    unsubscribeIndex?.();
    set({ myUuid, chatIndex: {}, openUuid: null, pinnedUuids: new Set() });

    let previous: Record<string, ChatIndexEntry> = {};
    unsubscribeIndex = subscribeChatIndex(myUuid, (index) => {
      for (const [uuid, entry] of Object.entries(index)) {
        const before = previous[uuid]?.unreadCount || 0;
        const after = entry.unreadCount || 0;
        if (after > before) {
          notifyNewMessage(entry.otherUsername, entry.lastMessage);
        }
      }
      previous = index;
      set({ chatIndex: index });
    });
  },

  openChat: (uuid) => {
    const { myUuid, pinnedUuids } = get();
    const nextPinned = new Set(pinnedUuids);
    nextPinned.add(uuid);
    set({ openUuid: uuid, pinnedUuids: nextPinned });
    if (myUuid) markConversationRead(myUuid, uuid).catch(() => {});
  },

  minimizeChat: () => set({ openUuid: null }),

  closeChat: (uuid) => {
    const { openUuid, pinnedUuids } = get();
    const nextPinned = new Set(pinnedUuids);
    nextPinned.delete(uuid);
    set({ pinnedUuids: nextPinned, openUuid: openUuid === uuid ? null : openUuid });
  },
}));

/** Bubbles shown next to the players button: anything pinned (opened at least
 *  once and not closed) plus anything with unread messages, even if never
 *  opened yet. */
export function useVisibleChatBubbles(): string[] {
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const pinnedUuids = useChatHeads((s) => s.pinnedUuids);
  const uuids = new Set(pinnedUuids);
  for (const [uuid, entry] of Object.entries(chatIndex)) {
    if ((entry.unreadCount || 0) > 0) uuids.add(uuid);
  }
  return Array.from(uuids);
}
