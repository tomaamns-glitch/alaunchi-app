import { create } from "zustand";
import { subscribeChatIndex, markConversationRead, type ChatIndexEntry } from "@/services/chat";
import { focusWindow, getAppIconDataUrl } from "@/services/electron";
import { getPlayerHeadDataUrl } from "@/hooks/use-player-head";
import { playNotificationSound } from "@/lib/notification-sound";

/** Native OS notification for an incoming chat message — same pattern as
 *  notifyConnected in presence-button.tsx. Skipped while the app window is
 *  focused (you're already looking at it — the unread bubble covers it) and
 *  always requested silent so the user's chosen sound (see notification-sound.ts)
 *  is the only audio, instead of whatever the OS default is. */
async function notifyNewMessage(uuid: string, name: string, text: string) {
  if (typeof Notification === "undefined" || document.hasFocus()) return;
  const icon = (await getPlayerHeadDataUrl(uuid).catch(() => null)) || (await getAppIconDataUrl().catch(() => null));
  const n = new Notification(name, { body: text, icon: icon ?? undefined, silent: true });
  n.onclick = () => focusWindow();
  playNotificationSound();
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

// Chats you had minimized (visible as a bubble, not necessarily unread) stay
// that way across an app restart instead of quietly closing — scoped per
// account since the same PC can be shared by more than one Microsoft login.
const pinnedStorageKey = (myUuid: string) => `alaunchi_pinned_chats_${myUuid}`;

function loadPinnedUuids(myUuid: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(pinnedStorageKey(myUuid)) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function savePinnedUuids(myUuid: string, pinnedUuids: Set<string>) {
  localStorage.setItem(pinnedStorageKey(myUuid), JSON.stringify(Array.from(pinnedUuids)));
}

export const useChatHeads = create<ChatHeadsState>((set, get) => ({
  myUuid: null,
  chatIndex: {},
  openUuid: null,
  pinnedUuids: new Set(),

  init: (myUuid) => {
    if (get().myUuid === myUuid) return;
    unsubscribeIndex?.();
    set({ myUuid, chatIndex: {}, openUuid: null, pinnedUuids: loadPinnedUuids(myUuid) });

    let previous: Record<string, ChatIndexEntry> = {};
    unsubscribeIndex = subscribeChatIndex(myUuid, (index) => {
      for (const [uuid, entry] of Object.entries(index)) {
        const before = previous[uuid]?.unreadCount || 0;
        const after = entry.unreadCount || 0;
        if (after > before) {
          notifyNewMessage(uuid, entry.otherUsername, entry.lastMessage).catch(() => {});
        }
      }
      previous = index;
      set({ chatIndex: index });
    });
  },

  openChat: (uuid) => {
    useHeaderOverlay.getState().close();
    const { myUuid, pinnedUuids } = get();
    const nextPinned = new Set(pinnedUuids);
    nextPinned.add(uuid);
    set({ openUuid: uuid, pinnedUuids: nextPinned });
    if (myUuid) {
      markConversationRead(myUuid, uuid).catch(() => {});
      savePinnedUuids(myUuid, nextPinned);
    }
  },

  minimizeChat: () => set({ openUuid: null }),

  closeChat: (uuid) => {
    const { myUuid, openUuid, pinnedUuids } = get();
    const nextPinned = new Set(pinnedUuids);
    nextPinned.delete(uuid);
    set({ pinnedUuids: nextPinned, openUuid: openUuid === uuid ? null : openUuid });
    if (myUuid) savePinnedUuids(myUuid, nextPinned);
  },
}));

export type HeaderOverlay = "profile" | "presence" | "presence-all" | null;

interface HeaderOverlayState {
  active: HeaderOverlay;
  open: (kind: Exclude<HeaderOverlay, null>) => void;
  close: () => void;
}

// Colocated with useChatHeads (rather than its own file) specifically to avoid
// a circular import: opening the skins/players/"todos" panel has to minimize
// an open chat, and opening a chat has to close whichever of these is open —
// each store calls the other's getState() directly.
export const useHeaderOverlay = create<HeaderOverlayState>((set) => ({
  active: null,
  open: (kind) => {
    useChatHeads.getState().minimizeChat();
    set({ active: kind });
  },
  close: () => set({ active: null }),
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
