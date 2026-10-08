import { create } from "zustand";
import { subscribeChatIndex, subscribeUserDirectory, markConversationRead, type ChatIndexEntry, type KnownUser } from "@/services/chat";
import { toast } from "sonner";
import { subscribeFriends, subscribeIncomingRequests, subscribeSentRequests, type FriendRequestEntry } from "@/services/friends";
import { notifyUser, isAppVisible } from "@/lib/notify";

/** Incoming chat message: sound, plus a Windows notification if the launcher
 *  is minimized/in the tray (see notifyUser). Nothing at all if that very
 *  conversation is open on screen — you're already reading it. */
function notifyNewMessage(uuid: string, name: string, text: string) {
  if (isAppVisible() && useChatHeads.getState().openUuid === uuid) return;
  notifyUser({ title: name, body: text, iconUuid: uuid }).catch(() => {});
}

/** Friend request received / accepted. With the launcher on screen there's no
 *  Windows notification (see notifyUser), so an in-app toast says what the
 *  sound was about. */
function notifyFriendEvent(uuid: string, body: string) {
  if (isAppVisible()) toast(body);
  notifyUser({ title: "ALaunchi", body, iconUuid: uuid }).catch(() => {});
}

interface ChatHeadsState {
  myUuid: string | null;
  chatIndex: Record<string, ChatIndexEntry>;
  /** Every player who's ever opened the app (services/chat.ts' touchUserDirectory),
   *  keyed by uuid — the only reliable source for someone's username BEFORE a
   *  first message has been exchanged (chatIndex only gets an entry once a
   *  message actually gets sent, so a conversation opened fresh from a friend's
   *  profile/the friends list has nothing there yet). */
  directory: Record<string, KnownUser>;
  openUuid: string | null;
  pinnedUuids: Set<string>;
  init: (myUuid: string) => void;
  openChat: (uuid: string) => void;
  minimizeChat: () => void;
  closeChat: (uuid: string) => void;
}

let unsubscribeIndex: (() => void) | null = null;
let unsubscribeDirectory: (() => void) | null = null;
let unsubscribeFriendEvents: (() => void) | null = null;

/** Watches friend requests for notifications. The first snapshot of each node
 *  is just the current state (nothing new happened), so only later changes count.
 *  "Accepted" = someone you had sent a request to shows up as a friend; accepting
 *  one yourself also adds a friend, but that one was in your incoming list. */
function watchFriendEvents(myUuid: string): () => void {
  let incoming: Record<string, FriendRequestEntry> | null = null;
  let sent: Record<string, FriendRequestEntry> = {};
  // Sent requests that just disappeared — accepting one removes it and adds the
  // friend as separate writes, in no guaranteed order, so remember them briefly.
  const recentlyAnswered = new Map<string, number>();
  const wasSentByMe = (uuid: string) =>
    !!sent[uuid] || Date.now() - (recentlyAnswered.get(uuid) ?? 0) < 60_000;
  let friendUuids: Set<string> | null = null;

  const unsubs = [
    subscribeIncomingRequests(myUuid, (next) => {
      if (incoming) {
        for (const [uuid, req] of Object.entries(next)) {
          if (!incoming[uuid]) notifyFriendEvent(uuid, `${req.username} te ha enviado una solicitud de amistad`);
        }
      }
      incoming = next;
    }),
    subscribeSentRequests(myUuid, (next) => {
      for (const uuid of Object.keys(sent)) {
        if (!next[uuid]) recentlyAnswered.set(uuid, Date.now());
      }
      sent = next;
    }),
    subscribeFriends(myUuid, (next) => {
      if (friendUuids) {
        for (const [uuid, friend] of Object.entries(next)) {
          if (!friendUuids.has(uuid) && wasSentByMe(uuid)) {
            notifyFriendEvent(uuid, `${friend.username} ha aceptado tu solicitud de amistad`);
          }
        }
      }
      friendUuids = new Set(Object.keys(next));
    }),
  ];
  return () => unsubs.forEach((u) => u());
}

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
  directory: {},
  openUuid: null,
  pinnedUuids: new Set(),

  init: (myUuid) => {
    if (get().myUuid === myUuid) return;
    unsubscribeIndex?.();
    unsubscribeDirectory?.();
    unsubscribeFriendEvents?.();
    set({ myUuid, chatIndex: {}, directory: {}, openUuid: null, pinnedUuids: loadPinnedUuids(myUuid) });

    let previous: Record<string, ChatIndexEntry> = {};
    unsubscribeIndex = subscribeChatIndex(myUuid, (index) => {
      for (const [uuid, entry] of Object.entries(index)) {
        const before = previous[uuid]?.unreadCount || 0;
        const after = entry.unreadCount || 0;
        if (after > before) {
          notifyNewMessage(uuid, entry.otherUsername, entry.lastMessage);
        }
      }
      previous = index;
      set({ chatIndex: index });
    });

    unsubscribeDirectory = subscribeUserDirectory((users) => set({ directory: users }));
    unsubscribeFriendEvents = watchFriendEvents(myUuid);
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

// Split into two "todos" flavors — clicking "Amigos" vs. clicking the
// instance name now opens its own dialog directly (no shared "Todos" button).
export type HeaderOverlay = "profile" | "presence" | "presence-all-instance" | null;

/** Which screen the account menu shows. Lives here (not in the menu itself) so
 *  other footer popups can open it straight on a given screen — e.g. the
 *  players panel's "Amigos" heading opens it on "friends". */
export type ProfileView = "menu" | "skin" | "friends" | "profile" | "user" | "online" | "servers" | "library";

interface HeaderOverlayState {
  active: HeaderOverlay;
  profileView: ProfileView;
  open: (kind: Exclude<HeaderOverlay, null>) => void;
  /** Opens the account menu on a specific screen. */
  openProfile: (view: ProfileView) => void;
  setProfileView: (view: ProfileView) => void;
  /** Whose profile the "user" screen shows. */
  viewedUserUuid: string | null;
  /** Screen "Volver" goes back to from the "user" screen. */
  userProfileFrom: ProfileView;
  /** Opens the account menu on someone else's profile (EXPERIMENTAL — replaces
   *  navigating to the /profile/:uuid page, which still exists). */
  openUserProfile: (uuid: string) => void;
  close: () => void;
}

// Colocated with useChatHeads (rather than its own file) specifically to avoid
// a circular import: opening the skins/players/"todos" panel has to minimize
// an open chat, and opening a chat has to close whichever of these is open —
// each store calls the other's getState() directly.
export const useHeaderOverlay = create<HeaderOverlayState>((set, get) => ({
  active: null,
  profileView: "menu",
  open: (kind) => {
    useChatHeads.getState().minimizeChat();
    set({ active: kind, profileView: "menu" });
  },
  openProfile: (view) => {
    useChatHeads.getState().minimizeChat();
    set({ active: "profile", profileView: view });
  },
  setProfileView: (view) => set({ profileView: view }),
  viewedUserUuid: null,
  userProfileFrom: "menu",
  openUserProfile: (uuid) => {
    const { active, profileView } = get();
    useChatHeads.getState().minimizeChat();
    set({
      active: "profile",
      profileView: "user",
      viewedUserUuid: uuid,
      // Opened from inside the menu (e.g. the friends list) → Volver returns
      // there; from anywhere else → the main menu.
      userProfileFrom: active === "profile" && profileView !== "user" ? profileView : "menu",
    });
  },
  // profileView isn't reset here (the menu would swap screens mid-collapse) —
  // open() puts it back to "menu", so it never reopens mid-skin-editing.
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
