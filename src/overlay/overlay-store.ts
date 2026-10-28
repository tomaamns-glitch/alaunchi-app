import { create } from "zustand";
import { subscribeChatIndex, type ChatIndexEntry } from "@/services/chat";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { getGroupLastRead, setGroupLastRead, subscribeGroupMessages, type GroupMessage } from "@/services/group-chat";

const eAPI = (window as any).electronAPI;

export interface OverlayAccount {
  uuid: string;
  username: string;
}

export type OverlayTab = "content" | "chat" | "screenshots" | "members";

/** openUuid of the instance's group chat (a player uuid otherwise). */
export const GROUP_CHAT = "__group__";

export interface OverlayGroupChat {
  key: string;
  messages: GroupMessage[];
  /** Newest message timestamp seen with the room open (group-chat.ts). */
  lastRead: number;
}

/** A screenshot that can be shared — the session's newest F2 one (from main)
 *  or any other picked in the Capturas tab (mc:list-screenshots). */
export interface ShareableShot {
  modpackId: string;
  fileName: string;
  size: number;
  sha1: string;
  thumbnailDataUrl: string | null;
}

interface OverlayStoreState {
  me: OverlayAccount | null;
  chatIndex: Record<string, ChatIndexEntry>;
  /** Everyone's launcher status (online / playing), for the green dots. */
  activity: Record<string, UserActivity>;
  tab: OverlayTab;
  /** Conversation open in the Chat tab (other player's uuid, or GROUP_CHAT). */
  openUuid: string | null;
  /** Group chat of the running instance — online instances only. */
  group: OverlayGroupChat | null;
  markGroupRead: () => void;
  /** "Compartir captura" open over the tabs. */
  shareShot: ShareableShot | null;
  /** Whether the panel itself is on screen (vs. hidden / showing a notice). */
  panelVisible: boolean;
  /** Usernames of people a chat was opened with before any message exists
   *  (from Participantes) — chatIndex only has them once one is sent. */
  chatNames: Record<string, string>;
  setTab: (tab: OverlayTab) => void;
  openChat: (uuid: string | null, username?: string) => void;
  openShare: (shot: ShareableShot | null) => void;
  setPanelVisible: (visible: boolean) => void;
}

export const useOverlayStore = create<OverlayStoreState>((set) => ({
  me: null,
  chatIndex: {},
  activity: {},
  tab: "content",
  openUuid: null,
  group: null,
  markGroupRead: () => {
    const { me, group } = useOverlayStore.getState();
    const newest = group?.messages[group.messages.length - 1]?.timestamp || 0;
    if (!me || !group || newest <= group.lastRead) return;
    setGroupLastRead(me.uuid, group.key, newest);
    useOverlayStore.setState({ group: { ...group, lastRead: newest } });
  },
  shareShot: null,
  panelVisible: false,
  setTab: (tab) => set({ tab, shareShot: null }),
  chatNames: {},
  openChat: (openUuid, username) =>
    set((s) =>
      openUuid
        ? { openUuid, tab: "chat", shareShot: null, ...(username ? { chatNames: { ...s.chatNames, [openUuid]: username } } : {}) }
        : { openUuid },
    ),
  // Sharing lives under Capturas: going back from it lands on the grid.
  openShare: (shareShot) => set(shareShot ? { shareShot, tab: "screenshots" } : { shareShot }),
  setPanelVisible: (panelVisible) => set({ panelVisible }),
}));

// Same keys as the launcher (hooks/use-chat-heads.ts, lib/nicknames.ts) — both
// pages share the app's origin, so mutes and nicknames carry over.
const mutedStorageKey = (myUuid: string) => `alaunchi_muted_chats_${myUuid}`;

function isMuted(myUuid: string, uuid: string): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(mutedStorageKey(myUuid)) || "[]");
    return Array.isArray(raw) && raw.includes(uuid);
  } catch {
    return false;
  }
}

/** Reads the account and watches its conversation index (plus everyone's
 *  status) for as long as the overlay lives (one game session). A message that
 *  raises a conversation's unread count asks main to show it in the corner —
 *  unless that very conversation is open on screen, or the sender is muted.
 *  The first snapshot is just the current state, so it never announces anything. */
export function initOverlayChat(): () => void {
  const unsubs: (() => void)[] = [];
  let cancelled = false;
  eAPI
    ?.readAuth()
    .then((auth: any) => {
      if (cancelled || !auth?.uuid || !auth?.username) return;
      const me = { uuid: auth.uuid as string, username: auth.username as string };
      useOverlayStore.setState({ me });
      let previous: Record<string, ChatIndexEntry> | null = null;
      unsubs.push(
        subscribeChatIndex(me.uuid, (index) => {
          const { openUuid, panelVisible, tab } = useOverlayStore.getState();
          if (previous) {
            for (const [uuid, entry] of Object.entries(index)) {
              const before = previous[uuid]?.unreadCount || 0;
              if ((entry.unreadCount || 0) <= before) continue;
              if (panelVisible && tab === "chat" && openUuid === uuid) continue;
              if (isMuted(me.uuid, uuid)) continue;
              eAPI.overlayNotify({ uuid, chat: uuid, title: entry.otherUsername, body: entry.lastMessage });
            }
          }
          previous = index;
          useOverlayStore.setState({ chatIndex: index });
        }),
        subscribeAllActivity((activity) => useOverlayStore.setState({ activity })),
      );
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    unsubs.forEach((u) => u());
  };
}

/** Unread messages of the group chat: from others, newer than lastRead. */
export function groupUnread(group: OverlayGroupChat | null, myUuid: string | undefined): number {
  if (!group) return 0;
  return group.messages.filter((m) => m.senderUuid !== myUuid && m.timestamp > group.lastRead && !m.deleted).length;
}

/** Watches the running instance's group chat (online instances): keeps its
 *  messages for the pinned row / the room, and announces new ones from others
 *  in the corner unless the room is open on screen. */
export function watchOverlayGroup(groupKey: string, instanceName: string): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  const start = (me: OverlayAccount) => {
    if (cancelled) return;
    const startedAt = Date.now();
    let seen: Set<string> | null = null;
    useOverlayStore.setState({ group: { key: groupKey, messages: [], lastRead: getGroupLastRead(me.uuid, groupKey) } });
    unsub = subscribeGroupMessages(groupKey, (messages) => {
      const { group, openUuid, panelVisible, tab } = useOverlayStore.getState();
      const viewing = panelVisible && tab === "chat" && openUuid === GROUP_CHAT;
      if (seen) {
        for (const m of messages) {
          if (seen.has(m.id) || m.senderUuid === me.uuid || m.deleted || m.timestamp < startedAt || viewing) continue;
          eAPI?.overlayNotify({
            uuid: m.senderUuid,
            chat: GROUP_CHAT,
            title: `${m.senderUsername} · ${instanceName}`,
            body: m.content ? `📎 ${m.content.displayName}` : m.text,
          });
        }
      }
      seen = new Set(messages.map((m) => m.id));
      useOverlayStore.setState({ group: { key: groupKey, messages, lastRead: group?.key === groupKey ? group.lastRead : 0 } });
      if (viewing) useOverlayStore.getState().markGroupRead();
    });
  };
  const me = useOverlayStore.getState().me;
  if (me) start(me);
  else {
    // The account is read asynchronously (initOverlayChat).
    const off = useOverlayStore.subscribe((s) => {
      if (s.me) {
        off();
        start(s.me);
      }
    });
    unsub = off; // replaced by the room's own unsubscribe once it starts
  }
  return () => {
    cancelled = true;
    unsub?.();
    useOverlayStore.setState({ group: null });
  };
}
