import { Hint } from "@/components/hint";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, ChevronLeft, ChevronRight, Ghost, Search, Trash2, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { PlayerDecoratedIcon } from "@/components/icon-decoration";
import { listedConversations, useChatHeads } from "@/hooks/use-chat-heads";
import { deleteConversationForMe, type ChatIndexEntry } from "@/services/chat";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { subscribeFriends, type FriendEntry } from "@/services/friends";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { toPresenceEntries } from "@/lib/friend-presence";
import { getNicknames } from "@/lib/nicknames";
import type { ChatMode } from "@/lib/instance-context";
import { cn } from "@/lib/utils";

interface ChatContactRailProps {
  myUuid: string;
  /** Follows the view (see ChatWindow) — decides who the search offers. */
  mode: ChatMode;
  selectedUuid: string;
  /** Lifted to the parent ChatWindow, which — unlike this rail — stays mounted
   *  while the conversation is minimized, so collapsing the rail sticks across
   *  minimize/reopen instead of resetting to expanded every time. */
  expanded: boolean;
  onToggleExpanded: () => void;
}

/** Left-hand sidebar of the chat window — existing conversations, collapsible
 *  down to just head icons, plus a search bar that filters them and finds someone
 *  to start a new one with. In carousel mode that's whoever's played the selected
 *  instance; in general mode (no single instance in view) your friends instead —
 *  in both, minus whoever already has a conversation showing in the rail. Right-click a
 *  contact to mute it or delete the conversation (hides history for you only). */
export function ChatContactRail({
  myUuid,
  mode,
  selectedUuid,
  expanded,
  onToggleExpanded,
}: ChatContactRailProps) {
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const directory = useChatHeads((s) => s.directory);
  const openChat = useChatHeads((s) => s.openChat);
  const deselectChat = useChatHeads((s) => s.deselectChat);
  const mutedUuids = useChatHeads((s) => s.mutedUuids);
  const toggleMute = useChatHeads((s) => s.toggleMute);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
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
  //
  // An entry can also exist WITHOUT a username: opening a chat marks it read,
  // which writes `unreadCount: 0` and so creates the entry before any message
  // carries `otherUsername` — that's why someone who isn't your friend (no
  // history, not in the friends list) showed up nameless here. Always fill the
  // name in from the other sources.
  const nameFor = (uuid: string) =>
    chatIndex[uuid]?.otherUsername ||
    directory[uuid]?.username ||
    friends[uuid]?.username ||
    presence[uuid]?.username ||
    "";
  const contactsSource: Record<string, ChatIndexEntry> = Object.fromEntries(
    Object.entries(chatIndex).map(([uuid, entry]) => [uuid, { ...entry, otherUsername: nameFor(uuid) }])
  );
  if (selectedUuid && !contactsSource[selectedUuid]) {
    contactsSource[selectedUuid] = { otherUsername: nameFor(selectedUuid), lastMessage: "", lastTimestamp: Date.now() };
  }
  // The one showing right now always stays visible, same reasoning as the
  // chatIndex fallback above.
  const visibleUuids = new Set(listedConversations(chatIndex));
  if (selectedUuid) visibleUuids.add(selectedUuid);
  // Collapsed there's no search bar on screen, so nothing is being searched.
  const search = expanded ? query.trim().toLowerCase() : "";
  const matches = (uuid: string, username: string) =>
    !search || username.toLowerCase().includes(search) || !!nicknames[uuid]?.toLowerCase().includes(search);
  const contacts = Object.entries(contactsSource)
    .filter(([uuid, entry]) => visibleUuids.has(uuid) && matches(uuid, entry.otherUsername))
    .sort(([, a], [, b]) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  const friendEntries = useMemo(() => toPresenceEntries(friends, activity), [friends, activity]);
  // The search also offers everyone whose conversation isn't already in the list
  // above — NOT just people you've never talked to: someone whose conversation
  // you deleted (it's still in chatIndex) must show up here too.
  const roster = (
    mode.type === "carousel"
      ? sortAllPresence(presence).filter(([uuid]) => uuid !== myUuid && !visibleUuids.has(uuid))
      : sortAllPresence(friendEntries).filter(([uuid]) => !visibleUuids.has(uuid))
  ).filter(([uuid, entry]) => matches(uuid, entry.username));
  // While searching, or when there's no conversation yet to look at.
  const showRoster = !!search || visibleUuids.size === 0;

  const handleDeleteConversation = async () => {
    if (!confirmDelete) return;
    const { uuid } = confirmDelete;
    setConfirmDelete(null);
    if (uuid === selectedUuid) deselectChat();
    await deleteConversationForMe(myUuid, uuid).catch(() => {});
  };

  return (
    <div
      ref={railRef}
      className={cn(
        "relative shrink-0 border-r border-white/5 flex flex-col min-h-0 transition-[width] duration-200 ease-out",
        expanded ? "w-44" : "w-14"
      )}
    >
      <div className="flex flex-col gap-1.5 p-2 border-b border-white/5">
        {expanded ? (
          <div className="flex items-center justify-between gap-2">
            <span className="pl-1 text-xs font-semibold text-gray-200">Chats</span>
            <Hint label="Contraer">
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onToggleExpanded}
                className="h-7 w-7 flex items-center justify-center rounded-md bg-white/[0.07] hover:bg-white/[0.14] text-gray-300 transition-colors shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.button>
            </Hint>
          </div>
        ) : (
          <div className="flex justify-center">
            <Hint label="Expandir">
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onToggleExpanded}
                className="h-7 w-7 flex items-center justify-center rounded-md bg-white/[0.07] hover:bg-white/[0.14] text-gray-300 transition-colors shrink-0"
              >
                <ChevronRight className="h-4 w-4" />
              </motion.button>
            </Hint>
          </div>
        )}
        {expanded ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Buscar..."
              aria-label="Buscar personas"
              className="w-full h-7 rounded-md bg-white/[0.07] pl-7 pr-6 text-xs text-white placeholder:text-muted-foreground outline-none focus:bg-white/[0.14] transition-colors"
            />
            {query && (
              <Hint label="Borrar búsqueda">
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Borrar búsqueda"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Hint>
            )}
          </div>
        ) : null}
      </div>

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
              "relative w-full flex items-center gap-2 py-1.5 transition-colors",
              expanded ? "px-2 text-left" : "justify-center",
              // Room for the unread dot, so a long name doesn't run under it.
              expanded && (entry.unreadCount || 0) > 0 && "pr-5",
              uuid === selectedUuid ? "bg-accent/15" : "hover:bg-white/5"
            )}
          >
            <ContactHead
              uuid={uuid}
              username={entry.otherUsername}
              online={!!activity[uuid] && activity[uuid].status !== "offline"}
              size={28}
              active={uuid === selectedUuid}
              muted={mutedUuids.has(uuid)}
            />
            {expanded && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{nicknames[uuid] || entry.otherUsername}</p>
                {nicknames[uuid] && (
                  <p className="text-[10px] text-muted-foreground truncate">{entry.otherUsername}</p>
                )}
              </div>
            )}
            {(entry.unreadCount || 0) > 0 && (
              <span
                title="Mensajes sin leer"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-sky-400"
              />
            )}
          </motion.button>
        ))}

        {showRoster &&
          (roster.length > 0 ? (
            <>
              {expanded && (
                <p className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Nuevo chat</p>
              )}
              {roster.map(([uuid, entry]) => (
                <motion.button
                  key={uuid}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => {
                    openChat(uuid);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 py-1.5 transition-colors hover:bg-white/5",
                    expanded ? "px-2 text-left" : "justify-center"
                  )}
                >
                  <ContactHead uuid={uuid} username={entry.username} online={entry.online} size={22} />
                  {expanded && <span className="text-xs text-gray-200 truncate">{nicknames[uuid] || entry.username}</span>}
                </motion.button>
              ))}
            </>
          ) : contacts.length === 0 ? (
            expanded ? (
              <p className="text-[10px] text-muted-foreground p-2 text-center">
                {search ? "Sin resultados." : "Nadie con quien chatear todavía."}
              </p>
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
          ) : null)}
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
            className="absolute z-50 w-48 rounded-md bg-card border border-transparent shadow-2xl py-1"
          >
            <button
              type="button"
              onClick={() => {
                toggleMute(contextMenu.uuid);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5 transition-colors"
            >
              {mutedUuids.has(contextMenu.uuid) ? <Bell className="h-3.5 w-3.5 shrink-0" /> : <BellOff className="h-3.5 w-3.5 shrink-0" />}
              {mutedUuids.has(contextMenu.uuid) ? "Activar notificaciones" : "Silenciar"}
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
          <div className="w-full max-w-xs rounded-md bg-card border border-transparent shadow-2xl p-4 space-y-3">
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
  active = false,
  muted = false,
}: {
  uuid: string;
  username: string;
  online?: boolean;
  size: number;
  /** The open conversation — becoming it replays the icon decoration. */
  active?: boolean;
  muted?: boolean;
}) {
  const headUrl = usePlayerHeadUrl(uuid);
  const [replayKey, setReplayKey] = useState(0);
  useEffect(() => {
    if (active) setReplayKey((k) => k + 1);
  }, [active]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PlayerDecoratedIcon uuid={uuid} size={size} radius={6} replayKey={replayKey}>
        <Avatar className="h-full w-full rounded-md">
          {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
          <AvatarFallback className="rounded-md bg-accent/20 text-accent text-[10px] font-bold">
            {username?.charAt(0)?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
      </PlayerDecoratedIcon>
      {online && (
        <span className="absolute z-[4] -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card" />
      )}
      {muted && (
        <span className="absolute z-[4] -bottom-1 -left-1 h-3.5 w-3.5 flex items-center justify-center rounded-full bg-card border border-white/10 text-muted-foreground">
          <BellOff className="h-2 w-2" />
        </span>
      )}
    </div>
  );
}
