import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Send, Users } from "lucide-react";
import { format } from "date-fns";
import { Head } from "@/components/player-picker";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import { useKeepInViewport } from "@/hooks/use-keep-in-viewport";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import {
  getGroupLastRead,
  groupKeyFor,
  sendGroupMessage,
  setGroupLastRead,
  subscribeGroupMessages,
  type GroupMessage,
} from "@/services/group-chat";
import { getNicknames } from "@/lib/nicknames";
import { playNotificationSound } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";
import type { Modpack } from "@/services/github";

/** Footer button (next to Jugadores, styled like a chat head but showing the
 *  instance's picture) + the group chat of that online instance: one room for
 *  everyone who plays it. Mutually exclusive with the other footer popups —
 *  opening it closes them, and opening any of them closes this. */
export function InstanceGroupChat({ pack, myUuid, myUsername }: { pack: Modpack; myUuid: string; myUsername: string }) {
  const groupKey = useMemo(() => groupKeyFor(pack), [pack.id, pack.repoUrl]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Record<string, PresenceEntry>>({});
  const [lastRead, setLastRead] = useState(0);
  const [draft, setDraft] = useState("");
  const [nicknames] = useState(() => getNicknames());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Opens towards the left when there's no room on the right (see the hook).
  const panelShift = useKeepInViewport(panelRef, open);
  const initialLoad = useRef(true);

  // Another footer popup (account, players) or a 1:1 chat opening closes this one.
  const overlayActive = useHeaderOverlay((s) => s.active);
  const openUuid = useChatHeads((s) => s.openUuid);
  useEffect(() => {
    if (overlayActive || openUuid) setOpen(false);
  }, [overlayActive, openUuid]);
  // Switching carousel instance closes the room of the previous one.
  useEffect(() => setOpen(false), [groupKey]);

  useEffect(() => {
    // First time ever in this room: start from "now", not with its whole history unread.
    let read = getGroupLastRead(myUuid, groupKey);
    if (!read) {
      read = Date.now();
      setGroupLastRead(myUuid, groupKey, read);
    }
    setLastRead(read);
    initialLoad.current = true;
    return subscribeGroupMessages(groupKey, setMessages);
  }, [myUuid, groupKey]);

  useEffect(() => subscribePresence(pack.id, setMembers), [pack.id]);

  // A new message from someone else while the room is closed → the usual sound.
  const lastSeenCount = useRef(0);
  useEffect(() => {
    const fromOthers = messages.filter((m) => m.senderUuid !== myUuid).length;
    if (initialLoad.current) {
      initialLoad.current = false;
    } else if (fromOthers > lastSeenCount.current && !open) {
      playNotificationSound();
    }
    lastSeenCount.current = fromOthers;
  }, [messages, myUuid, open]);

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

  useDismissOnOutsideClick([panelRef, buttonRef], () => setOpen(false), open);

  const unread = messages.filter((m) => m.senderUuid !== myUuid && m.timestamp > lastRead).length;
  const roster = useMemo(() => sortAllPresence(members), [members]);
  const onlineCount = roster.filter(([, e]) => e.online).length;

  const toggle = () => {
    if (!open) {
      useHeaderOverlay.getState().close();
      useChatHeads.getState().minimizeChat();
    }
    setOpen((v) => !v);
  };

  const send = () => {
    if (!draft.trim()) return;
    sendGroupMessage(groupKey, myUuid, myUsername, draft).catch(() => {});
    setDraft("");
  };

  const nameOf = (m: GroupMessage) => nicknames[m.senderUuid] || members[m.senderUuid]?.username || m.senderUsername;

  return (
    <div className="relative" data-keep-popups-open>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ left: panelShift }}
            className="absolute bottom-full left-0 mb-2 z-40 flex flex-col w-[36rem] max-w-[calc(100vw-24px)] h-[30rem] rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
              <InstanceAvatar pack={pack} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">Chat de {pack.name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {roster.length} jugador{roster.length === 1 ? "" : "es"}
                  {onlineCount > 0 && <span className="text-green-400">· {onlineCount} en línea</span>}
                </p>
              </div>
              <div className="flex -space-x-1.5">
                {roster.slice(0, 6).map(([uuid, e]) => (
                  <div key={uuid} className="relative" title={nicknames[uuid] || e.username}>
                    <Head uuid={uuid} username={e.username} className="h-6 w-6 border border-card" />
                    {e.online && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border border-card" />}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Minimizar"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Todavía no hay mensajes. Escribe el primero para todos los de {pack.name}.
                </p>
              ) : (
                messages.map((m, i) => {
                  const isMe = m.senderUuid === myUuid;
                  const prev = messages[i - 1];
                  // Name + head only at the start of a run from the same person.
                  const startsRun = !prev || prev.senderUuid !== m.senderUuid || m.timestamp - prev.timestamp > 5 * 60 * 1000;
                  return (
                    <div key={m.id} className={cn("flex gap-2", isMe ? "justify-end" : "justify-start", startsRun && i > 0 && "pt-2")}>
                      {!isMe && (
                        <div className="w-7 shrink-0">
                          {startsRun && <Head uuid={m.senderUuid} username={m.senderUsername} className="h-7 w-7" />}
                        </div>
                      )}
                      <div className={cn("flex flex-col max-w-[75%]", isMe ? "items-end" : "items-start")}>
                        {startsRun && (
                          <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                            {isMe ? "Tú" : nameOf(m)} · {m.timestamp ? format(m.timestamp, "HH:mm") : ""}
                          </span>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2 text-sm shadow-sm whitespace-pre-wrap break-words select-text",
                            isMe ? "bg-accent text-accent-foreground rounded-br-md" : "bg-white/10 text-gray-100 rounded-bl-md"
                          )}
                        >
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-white/10 flex items-center gap-2">
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
                className="flex-1 h-9 rounded-md bg-background/50 border border-white/10 px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent/50"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim()}
                className="h-9 w-9 flex items-center justify-center rounded-md bg-accent text-accent-foreground disabled:opacity-40 hover:bg-accent/90 transition-colors"
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        ref={buttonRef}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.15 }}
        type="button"
        onClick={toggle}
        aria-label={`Chat de grupo de ${pack.name}`}
        title={`Chat de grupo de ${pack.name}`}
        className={cn(
          "relative h-9 w-9 shrink-0 rounded-md border transition-colors",
          open ? "border-accent bg-accent/15" : "border-white/10 bg-white/5 hover:bg-white/10"
        )}
      >
        <InstanceAvatar pack={pack} className="h-full w-full" />
        <span className="absolute -bottom-1 -left-1 h-4 w-4 flex items-center justify-center rounded-full bg-card border border-white/10">
          <Users className="h-2.5 w-2.5 text-accent" />
        </span>
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-card"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

function InstanceAvatar({ pack, className }: { pack: Modpack; className?: string }) {
  return pack.imageUrl ? (
    <img src={pack.imageUrl} alt="" className={cn(className, "rounded-md object-cover")} draggable={false} />
  ) : (
    <div className={cn(className, "rounded-md bg-accent/20 text-accent font-bold flex items-center justify-center")}>
      {pack.name.charAt(0).toUpperCase()}
    </div>
  );
}
