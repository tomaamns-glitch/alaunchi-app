import { Hint } from "@/components/hint";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, ChevronDown, MessagesSquare, Minus, Paperclip, Send, Users } from "lucide-react";
import { useMutedGroups } from "@/lib/muted-groups";
import { format } from "date-fns";
import { ChatDaySeparator, startsNewDay } from "@/components/chat-day-separator";
import { ChatMessageMenu, DeletedMessageBubble, useMessageMenu } from "@/components/chat-message-menu";
import { hiddenKey, useHiddenMessages } from "@/lib/hidden-messages";
import { Head } from "@/components/player-picker";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import { useKeepInViewport } from "@/hooks/use-keep-in-viewport";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import {
  getGroupLastRead,
  groupKeyFor,
  sendGroupContent,
  sendGroupMessage,
  setGroupLastRead,
  subscribeGroupMessages,
  deleteGroupMessage,
  type GroupMessage,
} from "@/services/group-chat";
import { getNicknames } from "@/lib/nicknames";
import { playNotificationSound } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";
import type { Modpack } from "@/services/github";
import { useModpacks } from "@/hooks/use-modpacks";
import { ChatContentPicker } from "@/components/lazy-heavy";
import { SharedContentCard } from "@/components/chat-window";
import { MoveBackButton, MoveToContentMenu } from "@/components/move-to-content-menu";

/** Mutes / unmutes a group chat (lib/muted-groups.ts). */
function MuteGroupButton({ groupKey }: { groupKey: string }) {
  const muted = useMutedGroups((s) => s.muted.has(groupKey));
  const toggle = useMutedGroups((s) => s.toggle);
  return (
    <Hint
      label={muted ? "Grupo silenciado: pulsa para volver a recibir sus avisos" : "Silenciar el chat grupal"}
    >
      <button
        type="button"
        onClick={() => toggle(groupKey)}
        aria-pressed={muted}
        aria-label={muted ? "Activar avisos del grupo" : "Silenciar el grupo"}
        className={`h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors shrink-0 ${
          muted ? "text-amber-300 hover:text-amber-200" : "text-gray-400 hover:text-gray-200"
        }`}
      >
        {muted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
      </button>
    </Hint>
  );
}

function newestFromOthers(messages: GroupMessage[], myUuid: string): number {
  let newest = 0;
  for (const m of messages) if (m.senderUuid !== myUuid && m.timestamp > newest) newest = m.timestamp;
  return newest;
}

/** State of one online instance's group chat room: messages, members, unread
 *  count. `open` = the room is on screen (everything shown counts as read, no
 *  notification sound). Shared by the footer popup and the inline panel. */
function useGroupRoom(pack: Modpack, myUuid: string, open: boolean) {
  const groupKey = useMemo(() => groupKeyFor(pack), [pack.id, pack.repoUrl]);
  const [allMessages, setMessages] = useState<GroupMessage[]>([]);
  // Others' messages you deleted "para mí" (lib/hidden-messages.ts) — left
  // out here so they don't count as unread either.
  const hidden = useHiddenMessages((s) => s.hidden);
  useEffect(() => {
    useHiddenMessages.getState().init(myUuid);
  }, [myUuid]);
  const messages = useMemo(
    () => allMessages.filter((m) => !hidden.has(hiddenKey(groupKey, m.id))),
    [allMessages, hidden, groupKey]
  );
  const [members, setMembers] = useState<Record<string, PresenceEntry>>({});
  const [lastRead, setLastRead] = useState(0);
  const [nicknames] = useState(() => getNicknames());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Newest message from someone else already accounted for — only messages
  // after it are "new" and worth a sound.
  const newestSeen = useRef(0);

  useEffect(() => {
    // First time ever in this room: start from "now", not with its whole history unread.
    let read = getGroupLastRead(myUuid, groupKey);
    if (!read) {
      read = Date.now();
      setGroupLastRead(myUuid, groupKey, read);
    }
    setLastRead(read);
    setMessages([]);
    // The first snapshot of a room is its existing history, not new messages:
    // it only sets the baseline. (Doing this in the effect below instead used
    // to fire on the empty initial state, so every remount — e.g. coming back
    // to Inicio — played the sound for old messages.)
    let first = true;
    return subscribeGroupMessages(groupKey, (msgs) => {
      if (first) {
        first = false;
        newestSeen.current = newestFromOthers(msgs, myUuid);
      }
      setMessages(msgs);
    });
  }, [myUuid, groupKey]);

  useEffect(() => subscribePresence(pack.id, setMembers), [pack.id]);

  // A new message from someone else while the room is closed → the usual
  // sound, unless the room is muted (lib/muted-groups.ts; unread still counts).
  useEffect(() => {
    useMutedGroups.getState().init(myUuid);
  }, [myUuid]);
  useEffect(() => {
    const newest = newestFromOthers(messages, myUuid);
    if (newest <= newestSeen.current) return;
    newestSeen.current = newest;
    if (!open && !useMutedGroups.getState().muted.has(groupKey)) playNotificationSound();
  }, [messages, myUuid, open, groupKey]);

  // While open, everything shown counts as read.
  useEffect(() => {
    if (!open || messages.length === 0) return;
    const newest = messages[messages.length - 1].timestamp;
    if (newest > lastRead) {
      setLastRead(newest);
      setGroupLastRead(myUuid, groupKey, newest);
    }
  }, [open, messages, lastRead, myUuid, groupKey]);

  useLayoutEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, messages]);

  const unread = messages.filter((m) => m.senderUuid !== myUuid && m.timestamp > lastRead).length;
  const roster = useMemo(() => sortAllPresence(members), [members]);
  const onlineCount = roster.filter(([, e]) => e.online).length;
  return { groupKey, messages, members, nicknames, scrollRef, unread, roster, onlineCount };
}

type GroupRoom = ReturnType<typeof useGroupRoom>;

/** Header (instance + players) + messages + composer of a group chat room. */
function GroupChatBody({
  pack,
  myUuid,
  myUsername,
  room,
  onMinimize,
  onMoveBack,
  onChatOpened,
  panel = false,
}: {
  pack: Modpack;
  myUuid: string;
  myUsername: string;
  room: GroupRoom;
  onMinimize?: () => void;
  /** Panel moved to the manager: sends it back to Inicio's footer. */
  onMoveBack?: () => void;
  /** After opening a private chat, for pages without a chat window of their own. */
  onChatOpened?: () => void;
  /** The online instance page: plain "Chat de grupo" header like its other
   *  panels (no instance, player count or heads — the page already shows them). */
  panel?: boolean;
}) {
  const { messages, members, nicknames, roster, onlineCount } = room;
  const [draft, setDraft] = useState("");
  const [showContentPicker, setShowContentPicker] = useState(false);
  const messageMenu = useMessageMenu();
  // Clicking someone opens your private chat with them (and closes the group
  // popup, which gives way to any 1:1 chat opening).
  const openChatWith = useChatHeads((s) => s.openChat);
  const openChat = (uuid: string) => {
    openChatWith(uuid);
    onChatOpened?.();
  };

  const send = () => {
    if (!draft.trim()) return;
    sendGroupMessage(room.groupKey, myUuid, myUsername, draft).catch(() => {});
    setDraft("");
  };

  const nameOf = (m: GroupMessage) => nicknames[m.senderUuid] || members[m.senderUuid]?.username || m.senderUsername;

  return (
    <>
      {panel ? (
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <MessagesSquare className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-white">Chat grupal</h3>
          <div className="ml-auto flex items-center gap-0.5">
            <MuteGroupButton groupKey={room.groupKey} />
            {onMoveBack && <MoveBackButton onClick={onMoveBack} />}
            {onMinimize && (
              <Hint label="Minimizar">
                <button
                  type="button"
                  onClick={onMinimize}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                >
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </button>
              </Hint>
            )}
          </div>
        </div>
      ) : (
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <InstanceAvatar pack={pack} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">Chat de {pack.name}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {roster.length} jugador{roster.length === 1 ? "" : "es"}
            {onlineCount > 0 && <span className="text-green-400">· {onlineCount} en línea</span>}
          </p>
        </div>
        {/* Only who's playing this instance right now (`online` in its roster). */}
        <div className="flex -space-x-1.5">
          {roster
            .filter(([, e]) => e.online)
            .slice(0, 6)
            .map(([uuid, e]) => (
              <Hint label={nicknames[uuid] || e.username} key={uuid}>
                <button
                  type="button"
                  disabled={uuid === myUuid}
                  onClick={() => openChat(uuid)}
                  aria-label={`Chat con ${nicknames[uuid] || e.username}`}
                  className="block transition-opacity enabled:hover:opacity-80"
                >
                  <Head uuid={uuid} username={e.username} className="h-6 w-6 border border-card" />
                </button>
              </Hint>
            ))}
        </div>
        <MuteGroupButton groupKey={room.groupKey} />
        {onMinimize && (
          <Hint label="Minimizar">
            <button
              type="button"
              onClick={onMinimize}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </Hint>
        )}
      </div>
      )}

      <div ref={room.scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Todavía no hay mensajes. Escribe el primero para todos los de {pack.name}.
          </p>
        ) : (
          messages.map((m, i) => {
            const isMe = m.senderUuid === myUuid;
            const prev = messages[i - 1];
            // Name + head only at the start of a run from the same person.
            const newDay = startsNewDay(m.timestamp, prev?.timestamp);
            const startsRun =
              newDay || !prev || prev.senderUuid !== m.senderUuid || m.timestamp - prev.timestamp > 5 * 60 * 1000;
            return (
              <Fragment key={m.id}>
              {newDay && <ChatDaySeparator timestamp={m.timestamp} />}
              <div
                className={cn("flex gap-2", isMe ? "justify-end" : "justify-start", startsRun && i > 0 && !newDay && "pt-2")}
                // Right-click: your own message → deleted for everyone;
                // someone else's (or an already-deleted one) → hidden for you.
                onContextMenu={(e) => {
                  const forEveryone = isMe && !m.deleted;
                  messageMenu.open(e, forEveryone, () =>
                    forEveryone
                      ? deleteGroupMessage(room.groupKey, m.id)
                      : useHiddenMessages.getState().hide(myUuid, room.groupKey, m.id)
                  );
                }}
              >
                {!isMe && (
                  <div className="w-7 shrink-0">
                    {startsRun && (
                      <Hint label={`Chat con ${nameOf(m)}`}>
                        <button
                          type="button"
                          onClick={() => openChat(m.senderUuid)}
                          aria-label={`Chat con ${nameOf(m)}`}
                          className="block transition-opacity hover:opacity-80"
                        >
                          <Head uuid={m.senderUuid} username={m.senderUsername} className="h-7 w-7" />
                        </button>
                      </Hint>
                    )}
                  </div>
                )}
                <div className={cn("flex flex-col max-w-[75%]", isMe ? "items-end" : "items-start")}>
                  {startsRun && (
                    <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                      {isMe ? (
                        "Tú"
                      ) : (
                        <button
                          type="button"
                          onClick={() => openChat(m.senderUuid)}
                          title={`Chat con ${nameOf(m)}`}
                          className="hover:text-accent transition-colors"
                        >
                          {nameOf(m)}
                        </button>
                      )}{" "}
                      · {m.timestamp ? format(m.timestamp, "HH:mm") : ""}
                    </span>
                  )}
                  {m.deleted ? (
                    <DeletedMessageBubble mine={isMe} />
                  ) : m.content ? (
                    // Sent "in this instance's mode": whoever has the
                    // instance installs straight into it, like the 1:1 chat.
                    <SharedContentCard
                      content={m.content}
                      carouselInstanceId={pack.id}
                      senderUsername={m.senderUsername}
                      installed={false}
                      onInstalled={() => {}}
                    />
                  ) : (
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm shadow-sm whitespace-pre-wrap break-words select-text",
                        isMe ? "bg-accent text-accent-foreground rounded-br-md" : "bg-white/10 text-gray-100 rounded-bl-md"
                      )}
                    >
                      {m.text}
                    </div>
                  )}
                </div>
              </div>
              </Fragment>
            );
          })
        )}
      </div>

      <ChatMessageMenu menu={messageMenu.menu} onClose={messageMenu.close} />
      <div className="p-3 border-t border-white/5 flex items-center gap-2">
        <div className="relative">
          <Hint label="Enviar contenido">
            <button
              type="button"
              onClick={() => setShowContentPicker((v) => !v)}
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-md transition-colors shrink-0",
                showContentPicker ? "bg-accent/20 text-accent" : "bg-white/[0.07] hover:bg-white/[0.14] text-gray-300"
              )}
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </Hint>
          <AnimatePresence>
            {showContentPicker && (
              <ChatContentPicker
                myUuid={myUuid}
                myUsername={myUsername}
                mode={{ type: "carousel", pack }}
                onClose={() => setShowContentPicker(false)}
                onSendContent={(content) => sendGroupContent(room.groupKey, myUuid, myUsername, content)}
              />
            )}
          </AnimatePresence>
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={2000}
          placeholder={`Escribe a todos los de ${pack.name}…`}
          className="flex-1 min-w-0 h-9 rounded-md bg-white/[0.07] border border-transparent px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent/50"
        />
        <Hint label="Enviar">
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md bg-accent text-accent-foreground disabled:opacity-40 hover:bg-accent/90 transition-colors"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </Hint>
      </div>
    </>
  );
}

// Which group chat popup is open (its groupKey) — so with several buttons in
// the footer (GroupChatNotifications) opening one closes the others.
const useOpenGroupChat = create<{ key: string | null; set: (key: string | null) => void }>((set) => ({
  key: null,
  set: (key) => set({ key }),
}));

/** Footer button (next to Jugadores, styled like a chat head but showing the
 *  instance's picture) + the group chat of that online instance: one room for
 *  everyone who plays it. Mutually exclusive with the other footer popups —
 *  opening it closes them, and opening any of them closes this. */
export function InstanceGroupChat({
  pack,
  myUuid,
  myUsername,
  plainHeader = false,
  onlyWhenUnread = false,
  onMoveToContent,
  card = false,
}: {
  pack: Modpack;
  myUuid: string;
  myUsername: string;
  /** Inicio's footer: logo + "Chat de grupo" + unread count instead of the bare logo. */
  card?: boolean;
  /** The online instance page's header ("Chat de grupo", see GroupChatBody's `panel`). */
  plainHeader?: boolean;
  /** Adds "Mover a Contenido" on right click. */
  onMoveToContent?: () => void;
  /** Notification mode (GroupChatNotifications): the button only shows while
   *  there are unread messages or the room is open. Stays mounted regardless,
   *  to keep listening. */
  onlyWhenUnread?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const room = useGroupRoom(pack, myUuid, open);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Opens towards the left when there's no room on the right (see the hook).
  const panelShift = useKeepInViewport(panelRef, open);

  // Another footer popup (account, players) or a 1:1 chat opening closes this one.
  const overlayActive = useHeaderOverlay((s) => s.active);
  const chatOpen = useChatHeads((s) => s.panelOpen);
  useEffect(() => {
    if (overlayActive || chatOpen) setOpen(false);
  }, [overlayActive, chatOpen]);
  // Switching carousel instance closes the room of the previous one.
  useEffect(() => setOpen(false), [room.groupKey]);
  // Another group chat button opening closes this one.
  const openGroupKey = useOpenGroupChat((s) => s.key);
  useEffect(() => {
    if (openGroupKey !== room.groupKey) setOpen(false);
  }, [openGroupKey, room.groupKey]);

  useDismissOnOutsideClick([panelRef, buttonRef], () => setOpen(false), open);

  const toggle = () => {
    if (!open) {
      useHeaderOverlay.getState().close();
      useChatHeads.getState().minimizeChat();
    }
    useOpenGroupChat.getState().set(open ? null : room.groupKey);
    setOpen((v) => !v);
  };

  if (onlyWhenUnread && !open && room.unread === 0) return null;

  return (
    <div className="relative" data-keep-popups-open data-tour={card ? "online-group-chat" : undefined}>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ left: panelShift }}
            className="absolute bottom-full left-0 mb-2 z-40 flex flex-col w-[36rem] max-w-[calc(100vw-24px)] h-[30rem] rounded-md bg-background/60 backdrop-blur-xl border border-transparent shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden"
          >
            <GroupChatBody pack={pack} myUuid={myUuid} myUsername={myUsername} room={room} onMinimize={() => setOpen(false)} panel={plainHeader} />
          </motion.div>
        )}
      </AnimatePresence>

      <MoveToContentMenu onMove={onMoveToContent}>
      {card ? (
        <GroupChatCardButton pack={pack} room={room} open={open} buttonRef={buttonRef} onClick={toggle} />
      ) : (
      <Hint label={`Chat grupal de ${pack.name}`}>
        <motion.button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-label={`Chat grupal de ${pack.name}`}
          // Same 38px box, radius and border as the other footer buttons
          // (account, players, Contenido) — the instance logo fills it edge to
          // edge, so switching carousel packs never changes the button's size.
          className={cn(
            "relative h-[38px] w-[38px] shrink-0 flex items-center justify-center rounded-md border transition-colors",
            open ? "border-accent bg-accent/15" : "border-transparent bg-white/[0.07] backdrop-blur-md hover:bg-white/[0.14]"
          )}
        >
          <InstanceAvatar pack={pack} className="h-full w-full rounded-[5px] text-sm" />
          <span className="absolute -bottom-1 -left-1 h-4 w-4 flex items-center justify-center rounded-full bg-card border border-white/10">
            <Users className="h-2.5 w-2.5 text-accent" />
          </span>
          <AnimatePresence>
            {room.unread > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.15 }}
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-card"
              >
                {room.unread > 99 ? "99+" : room.unread}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </Hint>
      )}
      </MoveToContentMenu>
    </div>
  );
}

/** Inicio's footer version: same 38px height, radius and glass as the bar's
 *  other buttons — instance logo, "Chat de grupo" and the unread count. */
function GroupChatCardButton({
  pack,
  room,
  open,
  buttonRef,
  onClick,
}: {
  pack: Modpack;
  room: GroupRoom;
  open: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={`Chat grupal de ${pack.name}`}
      title={`Chat grupal de ${pack.name}`}
      className={cn(
        "relative h-[38px] flex items-center gap-2 pl-1 pr-3 rounded-md border backdrop-blur-md transition-colors",
        open ? "border-accent bg-accent/15" : "border-transparent bg-white/[0.07] hover:bg-white/[0.14]"
      )}
    >
      <InstanceAvatar pack={pack} className="h-[30px] w-[30px] shrink-0 rounded-[5px] text-xs" />
      <span className="text-sm font-medium text-white whitespace-nowrap">Chat grupal</span>
      {room.unread > 0 && (
        <span className="shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
          {room.unread > 99 ? "99+" : room.unread}
        </span>
      )}
    </button>
  );
}

/** The same group chat as a column (the online instance page, /online/:id) —
 *  while it's on screen everything counts as read. Minimized, only the header
 *  shows, with what's unread: messages keep counting and sounding like a closed popup. */
export function InstanceGroupChatPanel({
  pack,
  myUuid,
  myUsername,
  collapsed = false,
  onToggleCollapsed,
  onMoveBack,
  onChatOpened,
}: {
  pack: Modpack;
  myUuid: string;
  myUsername: string;
  collapsed?: boolean;
  /** Shows the minimize/expand button in the header. */
  onToggleCollapsed?: () => void;
  /** Moved to the manager: shows the button that sends it back to Inicio's footer. */
  onMoveBack?: () => void;
  /** After opening a private chat, for pages without a chat window of their own. */
  onChatOpened?: () => void;
}) {
  const room = useGroupRoom(pack, myUuid, !collapsed);
  if (collapsed) {
    return (
      <aside className="flex flex-col rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-4 py-3">
          <MessagesSquare className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-white">Chat grupal</h3>
          {room.unread > 0 && (
            <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {room.unread > 99 ? "99+" : room.unread}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <MuteGroupButton groupKey={room.groupKey} />
            {onMoveBack && <MoveBackButton onClick={onMoveBack} />}
            {onToggleCollapsed && (
              <Hint label="Desplegar">
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                </button>
              </Hint>
            )}
          </div>
        </div>
      </aside>
    );
  }
  return (
    <aside className="h-full flex flex-col rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md overflow-hidden">
      <GroupChatBody pack={pack} myUuid={myUuid} myUsername={myUsername} room={room} onMinimize={onToggleCollapsed} onMoveBack={onMoveBack} onChatOpened={onChatOpened} panel />
    </aside>
  );
}

function InstanceAvatar({ pack, className }: { pack: Modpack; className?: string }) {
  return pack.imageUrl ? (
    <img src={pack.imageUrl} alt="" className={cn("rounded-md object-cover", className)} draggable={false} />
  ) : (
    <div className={cn("rounded-md bg-accent/20 text-accent font-bold flex items-center justify-center", className)}>
      {pack.name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Right side of the footer in Inicio's drawer view and the Hub: a group chat
 *  button for every online instance you're in, shown only while it has
 *  unread messages — the "someone wrote in X's group" notification. Clicking
 *  opens that group chat right there; once read and closed it goes away. */
export function GroupChatNotifications({ myUuid, myUsername }: { myUuid: string; myUsername: string }) {
  const modpacks = useModpacks((s) => s.modpacks);
  // Past instances (outOfNetwork, no repoUrl) have no group chat anymore.
  const rooms = modpacks.filter((p) => !p.outOfNetwork && p.repoUrl);
  return (
    <div className="flex items-center gap-1.5">
      {rooms.map((p) => (
        <InstanceGroupChat key={groupKeyFor(p)} pack={p} myUuid={myUuid} myUsername={myUsername} onlyWhenUnread />
      ))}
    </div>
  );
}
