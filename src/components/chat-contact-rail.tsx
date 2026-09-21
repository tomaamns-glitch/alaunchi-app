import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Ghost, X, Trash2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads, useVisibleChatBubbles } from "@/hooks/use-chat-heads";
import { deleteConversationForMe } from "@/services/chat";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { subscribeFriends, type FriendEntry } from "@/services/friends";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { toPresenceEntries } from "@/lib/friend-presence";
import { getNicknames } from "@/lib/nicknames";
import { ChatModeSelector } from "@/components/chat-mode-selector";
import type { ChatMode } from "@/lib/instance-context";
import { cn } from "@/lib/utils";

interface ChatContactRailProps {
  myUuid: string;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  selectedUuid: string;
  /** Lifted to the parent ChatWindow, which — unlike this rail — stays mounted
   *  while the conversation is minimized, so collapsing the rail sticks across
   *  minimize/reopen instead of resetting to expanded every time. */
  expanded: boolean;
  onToggleExpanded: () => void;
}

/** Left-hand sidebar of the chat window — existing conversations, collapsible
 *  down to just head icons, plus a picker to start a new one. In carousel
 *  mode that picker offers whoever's played the selected instance; in general
 *  mode (no single instance in view) it offers friends you haven't started a
 *  conversation with yet instead. Right-click a contact to close (unpin — it
 *  disappears here and from the bubble tray, but reopening from elsewhere
 *  brings its history right back) or delete (hides history for you only). */
export function ChatContactRail({
  myUuid,
  mode,
  onModeChange,
  selectedUuid,
  expanded,
  onToggleExpanded,
}: ChatContactRailProps) {
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const directory = useChatHeads((s) => s.directory);
  const openChat = useChatHeads((s) => s.openChat);
  const closeChat = useChatHeads((s) => s.closeChat);
  const visibleBubbleUuids = useVisibleChatBubbles();
  const [showAdd, setShowAdd] = useState(false);
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({});
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  const [nicknames] = useState(() => getNicknames());
  // Coordinates are relative to railRef (below), not the viewport — this rail
  // sits inside ChatWindow's animated motion.div, which keeps a `transform`
  // applied even at rest, and that turns `position: fixed` descendants
  // relative to it instead of the real viewport. Anchoring to the rail itself
  // (position: absolute) sidesteps that entirely.
  const railRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{ uuid: string; username: string; x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ uuid: string; username: string } | null>(null);

  useEffect(() => {
    if (mode.type !== "carousel") {
      setPresence({});
      return;
    }
    return subscribePresence(mode.pack.id, setPresence);
  }, [mode]);

  useEffect(() => subscribeFriends(myUuid, setFriends), [myUuid]);
  // Covers the online dot on already-open conversations below (contacts) too —
  // per-modpack `presence` above is empty in general mode, which used to leave
  // every contact looking offline regardless of whether they actually were.
  useEffect(() => subscribeAllActivity(setActivity), []);

  // chatIndex only gets an entry once a message has actually been sent, so a
  // conversation just opened (from a friend's profile, say) with nothing sent
  // yet would otherwise be entirely absent from this list — fall back to the
  // global user directory for its username so it still shows up, highlighted.
  const contactsSource =
    selectedUuid && !chatIndex[selectedUuid]
      ? {
          ...chatIndex,
          [selectedUuid]: {
            otherUsername: directory[selectedUuid]?.username ?? presence[selectedUuid]?.username ?? "",
            lastMessage: "",
            lastTimestamp: Date.now(),
          },
        }
      : chatIndex;
  // Only pinned-or-unread conversations show here (same rule as the bubble
  // tray) — "Cerrar conversación" unpins, which is what actually makes it
  // disappear from both places instead of just the bubbles. The one showing
  // right now always stays visible regardless, same reasoning as the
  // chatIndex fallback above.
  const visibleUuids = new Set(visibleBubbleUuids);
  if (selectedUuid) visibleUuids.add(selectedUuid);
  const contacts = Object.entries(contactsSource)
    .filter(([uuid]) => visibleUuids.has(uuid))
    .sort(([, a], [, b]) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  const friendEntries = useMemo(() => toPresenceEntries(friends, activity), [friends, activity]);
  const roster =
    mode.type === "carousel"
      ? sortAllPresence(presence).filter(([uuid]) => uuid !== myUuid && !chatIndex[uuid] && uuid !== selectedUuid)
      : sortAllPresence(friendEntries).filter(([uuid]) => !chatIndex[uuid] && uuid !== selectedUuid);

  const handleCloseConversation = (uuid: string) => {
    closeChat(uuid);
    setContextMenu(null);
  };

  const handleDeleteConversation = async () => {
    if (!confirmDelete) return;
    const { uuid } = confirmDelete;
    setConfirmDelete(null);
    closeChat(uuid);
    await deleteConversationForMe(myUuid, uuid).catch(() => {});
  };

  return (
    <div
      ref={railRef}
      className={cn(
        "relative shrink-0 border-r border-white/10 flex flex-col min-h-0 transition-[width] duration-200 ease-out",
        expanded ? "w-44" : "w-14"
      )}
    >
      <div className="flex flex-col gap-1.5 p-2 border-b border-white/10">
        {expanded ? (
          <div className="flex items-center justify-between gap-2">
            <ChatModeSelector mode={mode} onSelect={onModeChange} />
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={onToggleExpanded}
              title="Contraer"
              className="h-7 w-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.button>
          </div>
        ) : (
          <div className="flex justify-center">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={onToggleExpanded}
              title="Expandir"
              className="h-7 w-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        )}
        <div className={cn("flex", expanded ? "" : "justify-center")}>
          <motion.button
            whileHover={{ scale: expanded ? 1.02 : 1.08 }}
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            title="Nuevo chat"
            className={cn(
              "flex items-center gap-2 rounded-md transition-colors shrink-0",
              expanded ? "w-full px-2.5 py-1.5" : "h-7 w-7 justify-center",
              showAdd ? "bg-accent/20 text-accent" : "bg-white/5 hover:bg-white/10 text-gray-300"
            )}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {expanded && <span className="text-xs font-medium">Nuevo Chat</span>}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="border-b border-white/10 max-h-48 overflow-y-auto"
          >
            {roster.length === 0 ? (
              expanded ? (
                <p className="text-[10px] text-muted-foreground p-2 text-center">Nadie nuevo con quien chatear.</p>
              ) : (
                <div className="flex justify-center py-2">
                  <div
                    className="h-[22px] w-[22px] rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground"
                    title="No hay nadie con quien chatear"
                  >
                    <Ghost className="h-3.5 w-3.5" />
                  </div>
                </div>
              )
            ) : (
              roster.map(([uuid, entry]) => (
                <motion.button
                  key={uuid}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => {
                    openChat(uuid);
                    setShowAdd(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 py-1.5 transition-colors hover:bg-white/5",
                    expanded ? "px-2 text-left" : "justify-center"
                  )}
                >
                  <ContactHead uuid={uuid} username={entry.username} online={entry.online} size={22} />
                  {expanded && <span className="text-xs text-gray-200 truncate">{entry.username}</span>}
                </motion.button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {contacts.map(([uuid, entry]) => (
          <motion.button
            key={uuid}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => openChat(uuid)}
            onContextMenu={(e) => {
              e.preventDefault();
              const railRect = railRef.current?.getBoundingClientRect();
              setContextMenu({
                uuid,
                username: nicknames[uuid] || entry.otherUsername,
                x: e.clientX - (railRect?.left ?? 0),
                y: e.clientY - (railRect?.top ?? 0),
              });
            }}
            className={cn(
              "w-full flex items-center gap-2 py-1.5 transition-colors",
              expanded ? "px-2 text-left" : "justify-center",
              uuid === selectedUuid ? "bg-accent/15" : "hover:bg-white/5"
            )}
          >
            <ContactHead
              uuid={uuid}
              username={entry.otherUsername}
              online={!!activity[uuid] && activity[uuid].status !== "offline"}
              size={28}
            />
            {expanded && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{nicknames[uuid] || entry.otherUsername}</p>
                {nicknames[uuid] && (
                  <p className="text-[10px] text-muted-foreground truncate">{entry.otherUsername}</p>
                )}
              </div>
            )}
          </motion.button>
        ))}
      </div>

      {contextMenu && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setContextMenu(null)}
            className="fixed inset-0 z-50 cursor-default"
          />
          <div
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute z-50 w-48 rounded-lg bg-card border border-white/10 shadow-2xl py-1"
          >
            <button
              type="button"
              onClick={() => handleCloseConversation(contextMenu.uuid)}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5 transition-colors"
            >
              <X className="h-3.5 w-3.5 shrink-0" />
              Cerrar conversación
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete({ uuid: contextMenu.uuid, username: contextMenu.username });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
              Eliminar conversación
            </button>
          </div>
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-lg bg-card border border-white/10 shadow-2xl p-4 space-y-3">
            <p className="text-sm text-white">
              ¿Eliminar la conversación con <span className="font-semibold">{confirmDelete.username}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              Se borra el historial solo para ti — {confirmDelete.username} lo seguirá viendo.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                className="px-3 py-1.5 rounded-md text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactHead({
  uuid,
  username,
  online,
  size,
}: {
  uuid: string;
  username: string;
  online?: boolean;
  size: number;
}) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar className="h-full w-full rounded-md">
        {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
        <AvatarFallback className="rounded-md bg-accent/20 text-accent text-[10px] font-bold">
          {username?.charAt(0)?.toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card" />
      )}
    </div>
  );
}
