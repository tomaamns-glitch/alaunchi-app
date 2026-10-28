import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, ArrowDown, Search, Send, MessageCircle, X, Trash2, Pin, Users } from "lucide-react";
import {
  subscribeMessages,
  sendMessage,
  markConversationRead,
  getConversationId,
  type ChatMessage,
} from "@/services/chat";
import { sendGroupMessage } from "@/services/group-chat";
import { listInstanceFiles, type OverlayState } from "@/services/electron";
import { subscribePresence, type PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { ChatDaySeparator, startsNewDay } from "@/components/chat-day-separator";
import type { UserActivity } from "@/services/user-activity";
import { useOverlayStore, groupUnread, GROUP_CHAT } from "./overlay-store";
import { ContentCard, InstanceCard, ScreenshotCard, ServerCard, type RunningTarget } from "./chat-cards";
import { EmptyState, Field, IconButton, InstanceAvatar, PlayerHead } from "./ui";
import { cn } from "@/lib/utils";

type Instance = NonNullable<OverlayState["instance"]>;

/** What both kinds of conversation render: a 1:1 ChatMessage, or a group
 *  message (same fields minus servers/instances, which the room can't send). */
type ThreadMessage = Pick<ChatMessage, "id" | "senderUuid" | "senderUsername" | "text" | "timestamp" | "content" | "deleted" | "server" | "instance">;

// Consecutive messages from the same person this close together are one group.
const GROUP_GAP_MS = 5 * 60_000;

function listTime(ts: number): string {
  if (!ts) return "";
  if (isToday(ts)) return format(ts, "HH:mm");
  if (isYesterday(ts)) return "Ayer";
  return format(ts, "d MMM", { locale: es });
}

function statusOf(a: UserActivity | undefined): "online" | "playing" | "offline" {
  return a?.status === "playing" ? "playing" : a?.status === "online" ? "online" : "offline";
}

function statusLine(a: UserActivity | undefined): { text: string; tone: "accent" | "online" | "muted" } {
  if (a?.status === "playing") return { text: `Jugando a ${a.instanceName || "Minecraft"}`, tone: "accent" };
  if (a?.status === "online") return { text: "En línea", tone: "online" };
  if (a?.lastSeen) return { text: `Hace ${formatDistanceToNowStrict(a.lastSeen, { locale: es })}`, tone: "muted" };
  return { text: "Desconectado", tone: "muted" };
}

function messagePreview(m: ThreadMessage | undefined): string {
  if (!m) return "Todavía no hay mensajes";
  if (m.deleted) return "Mensaje eliminado";
  if (m.content) return `📎 ${m.content.displayName}`;
  return m.text || "Mensaje";
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Pinned first row: the running instance's group chat (online instances). */
function GroupChatRow({ instance }: { instance: Instance }) {
  const me = useOverlayStore((s) => s.me);
  const group = useOverlayStore((s) => s.group);
  const openChat = useOverlayStore((s) => s.openChat);
  const last = group?.messages[group.messages.length - 1];
  const unread = groupUnread(group, me?.uuid);
  const nicknames = useMemo(() => getNicknames(), []);
  const lastSender = last && !last.deleted ? (last.senderUuid === me?.uuid ? "Tú" : nicknames[last.senderUuid] || last.senderUsername || "Alguien") : null;

  return (
    <button
      type="button"
      onClick={() => openChat(GROUP_CHAT)}
      className="relative flex w-full items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.07] px-2.5 py-2 text-left transition-colors hover:bg-accent/[0.12]"
    >
      <span className="relative">
        <InstanceAvatar imageUrl={instance.imageUrl} loaderType={instance.loaderType} size={38} className="rounded-[22%]" />
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#121214]">
          <Users className="h-2.5 w-2.5 text-accent" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-white">
            <span className="truncate">Chat de {instance.name}</span>
            <Pin className="h-3 w-3 shrink-0 rotate-45 text-accent" />
          </p>
          {last && <span className={cn("shrink-0 text-[10px]", unread ? "font-semibold text-accent" : "text-gray-500")}>{listTime(last.timestamp)}</span>}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={cn("truncate text-[11px]", unread ? "text-gray-200" : "text-gray-500")}>
            {lastSender && <span className="font-medium text-gray-300">{lastSender}: </span>}
            {messagePreview(last)}
          </p>
          <UnreadBadge count={unread} />
        </div>
      </div>
    </button>
  );
}

function ConversationList({ instance }: { instance: Instance | null }) {
  const chatIndex = useOverlayStore((s) => s.chatIndex);
  const activity = useOverlayStore((s) => s.activity);
  const openChat = useOverlayStore((s) => s.openChat);
  const [query, setQuery] = useState("");
  const nicknames = useMemo(() => getNicknames(), []);
  const hasGroup = !!instance?.groupKey;

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(chatIndex)
      .filter(([, e]) => !e.deletedBefore || e.lastTimestamp > e.deletedBefore)
      // Entries can come without a username (old or partial writes).
      .map(([uuid, e]) => ({ uuid, e, name: nicknames[uuid] || e.otherUsername || "Jugador" }))
      .filter(({ name, e }) => !q || name.toLowerCase().includes(q) || (e.otherUsername || "").toLowerCase().includes(q))
      .sort((a, b) => (b.e.lastTimestamp || 0) - (a.e.lastTimestamp || 0));
  }, [chatIndex, nicknames, query]);

  const total = Object.keys(chatIndex).length;
  if (!total && !hasGroup) {
    return (
      <EmptyState icon={MessageCircle} title="Sin conversaciones">
        Cuando hables con alguien desde ALaunchi, la conversación aparecerá aquí.
      </EmptyState>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {total > 0 && (
        <div className="px-4 pb-2 pt-1">
          <Field icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversación" />
        </div>
      )}
      <div className="overlay-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {hasGroup && instance && !query.trim() && (
          <div className="px-0.5 pb-1.5 pt-0.5">
            <GroupChatRow instance={instance} />
          </div>
        )}
        {total > 0 && entries.length === 0 && <p className="py-10 text-center text-xs text-gray-500">Nadie con ese nombre.</p>}
        {entries.map(({ uuid, e, name }) => {
          const unread = e.unreadCount || 0;
          return (
            <button
              key={uuid}
              type="button"
              onClick={() => openChat(uuid)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <PlayerHead uuid={uuid} name={name} size={38} status={statusOf(activity[uuid])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate text-[13px]", unread ? "font-semibold text-white" : "font-medium text-gray-100")}>{name}</p>
                  <span className={cn("shrink-0 text-[10px]", unread ? "font-semibold text-accent" : "text-gray-500")}>
                    {listTime(e.lastTimestamp)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className={cn("truncate text-[11px]", unread ? "text-gray-200" : "text-gray-500")}>{e.lastMessage || "Mensaje"}</p>
                  <UnreadBadge count={unread} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextBubble({ m, mine, first, last }: { m: ThreadMessage; mine: boolean; first: boolean; last: boolean }) {
  return (
    <div
      className={cn(
        "max-w-full px-3 py-1.5 text-[13px] leading-snug shadow-sm",
        mine ? "bg-accent text-accent-foreground" : "bg-white/[0.08] text-gray-100",
        // Rounded like the launcher's bubbles, with the tail corner only on
        // the last message of a group.
        "rounded-2xl",
        mine ? !first && "rounded-tr-md" : !first && "rounded-tl-md",
        mine ? !last && "rounded-br-md" : !last && "rounded-bl-md",
        mine ? last && "rounded-br-sm" : last && "rounded-bl-sm",
      )}
    >
      <span className="select-text whitespace-pre-wrap break-words">{m.text}</span>
      <span className={cn("float-right ml-2 mt-1.5 text-[9px] leading-none", mine ? "text-accent-foreground/60" : "text-gray-500")}>
        {m.timestamp ? format(m.timestamp, "HH:mm") : ""}
      </span>
    </div>
  );
}

function Lightbox({ image, onClose }: { image: { src: string; title: string } | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {image && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-30 flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={onClose}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <p className="truncate text-xs text-gray-300">{image.title}</p>
            <IconButton icon={X} label="Cerrar" onClick={onClose} />
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            <motion.img
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              src={image.src}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The thread + composer shared by 1:1 and group conversations. In a group,
 *  other people's messages carry their head and name. */
export function ConversationView({
  header,
  messages,
  onSend,
  target,
  group = false,
  placeholder,
  emptyTitle,
}: {
  header: ReactNode;
  messages: ThreadMessage[] | null;
  onSend: (text: string) => Promise<void>;
  target: RunningTarget | null;
  group?: boolean;
  placeholder: string;
  emptyTitle: string;
}) {
  const me = useOverlayStore((s) => s.me)!;
  const nicknames = useMemo(() => getNicknames(), []);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstScroll = useRef(true);
  const visible = messages ?? [];

  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Stick to the newest message unless the player scrolled up to read.
  useLayoutEffect(() => {
    if (!messages) return;
    if (firstScroll.current || atBottom) scrollToEnd(!firstScroll.current);
    firstScroll.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length, messages === null]);

  useEffect(() => inputRef.current?.focus(), []);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      await onSend(text);
      scrollToEnd(true);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3 pb-2.5">{header}</div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
        className="overlay-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {messages === null ? null : visible.length === 0 ? (
          <EmptyState icon={MessageCircle} title={emptyTitle}>
            Todavía no hay mensajes en esta conversación.
          </EmptyState>
        ) : (
          visible.map((m, i) => {
            const mine = m.senderUuid === me.uuid;
            const prev = visible[i - 1];
            const next = visible[i + 1];
            const newDay = startsNewDay(m.timestamp, prev?.timestamp);
            const first = newDay || !prev || prev.senderUuid !== m.senderUuid || m.timestamp - prev.timestamp > GROUP_GAP_MS;
            const last =
              !next || next.senderUuid !== m.senderUuid || next.timestamp - m.timestamp > GROUP_GAP_MS || startsNewDay(next.timestamp, m.timestamp);
            const sender = nicknames[m.senderUuid] || m.senderUsername || "Jugador";
            const showSender = group && !mine;
            const body = m.deleted ? (
              <div className="flex items-center gap-1.5 rounded-2xl border border-dashed border-white/10 px-3 py-1.5 text-[12px] italic text-gray-500">
                <Trash2 className="h-3 w-3" /> Mensaje eliminado
              </div>
            ) : m.instance ? (
              <InstanceCard instance={m.instance} />
            ) : m.server ? (
              <ServerCard server={m.server} />
            ) : m.content?.category === "screenshots" ? (
              <ScreenshotCard content={m.content} senderUsername={m.senderUsername} onOpen={(src, title) => setLightbox({ src, title })} />
            ) : m.content ? (
              <ContentCard content={m.content} target={mine ? null : target} />
            ) : (
              <TextBubble m={m} mine={mine} first={first} last={last} />
            );
            return (
              <Fragment key={m.id ?? i}>
                {newDay && <ChatDaySeparator timestamp={m.timestamp} />}
                <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", first ? "mt-2.5" : "mt-0.5")}>
                  {/* Group: the head sits next to the last message of each run. */}
                  {showSender && (
                    <span className="w-7 shrink-0">{last && <PlayerHead uuid={m.senderUuid} name={sender} size={28} />}</span>
                  )}
                  <div className={cn("flex min-w-0 max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
                    {showSender && first && <span className="mb-0.5 ml-1 text-[11px] font-semibold text-accent">{sender}</span>}
                    {body}
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {!atBottom && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            onClick={() => scrollToEnd(true)}
            aria-label="Ir al final"
            className="absolute bottom-[68px] right-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#1c1c20] text-gray-200 shadow-lg transition-colors hover:text-accent"
          >
            <ArrowDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <form
        className="border-t border-white/[0.06] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 pl-3.5 pr-1 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-gray-500"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Enviar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-[filter,opacity,transform] hover:brightness-110 active:scale-95 disabled:opacity-30"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>

      <Lightbox image={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

/** 1:1 conversation: subscribes to it, marks it read and sends. */
function DirectConversation({ otherUuid, target }: { otherUuid: string; target: RunningTarget | null }) {
  const me = useOverlayStore((s) => s.me)!;
  const entry = useOverlayStore((s) => s.chatIndex[otherUuid]);
  const activity = useOverlayStore((s) => s.activity[otherUuid]);
  const openChat = useOverlayStore((s) => s.openChat);
  const knownName = useOverlayStore((s) => s.chatNames[otherUuid]);
  const username = entry?.otherUsername || knownName || "Jugador";
  const otherName = useMemo(() => getNicknames()[otherUuid], [otherUuid]) || username;
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    return subscribeMessages(getConversationId(me.uuid, otherUuid), (list) => {
      setMessages(list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
    });
  }, [me.uuid, otherUuid]);

  // Reading it here counts as read in the launcher too (same chatIndex) — only
  // while the panel is on screen (it stays mounted, hidden, between openings).
  const panelVisible = useOverlayStore((s) => s.panelVisible);
  useEffect(() => {
    if (panelVisible && entry?.unreadCount) markConversationRead(me.uuid, otherUuid).catch(() => {});
  }, [panelVisible, entry?.unreadCount, me.uuid, otherUuid]);

  const visible = useMemo(
    () => messages && messages.filter((m) => !entry?.deletedBefore || (m.timestamp || 0) > entry.deletedBefore),
    [messages, entry?.deletedBefore],
  );
  const status = statusLine(activity);

  return (
    <ConversationView
      messages={visible}
      target={target}
      placeholder={`Mensaje para ${otherName}`}
      emptyTitle={`Saluda a ${otherName}`}
      onSend={(text) => sendMessage(me.uuid, me.username, otherUuid, username, text)}
      header={
        <>
          <IconButton icon={ArrowLeft} label="Volver" onClick={() => openChat(null)} />
          <PlayerHead uuid={otherUuid} name={otherName} size={32} status={statusOf(activity)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{otherName}</p>
            <p
              className={cn(
                "truncate text-[10px] font-medium",
                status.tone === "accent" ? "text-accent" : status.tone === "online" ? "text-emerald-400" : "text-gray-500",
              )}
            >
              {status.text}
            </p>
          </div>
        </>
      }
    />
  );
}

/** The instance's group chat (same room as the launcher's, group-chat.ts). */
function GroupConversation({ instance, target }: { instance: Instance; target: RunningTarget | null }) {
  const me = useOverlayStore((s) => s.me)!;
  const group = useOverlayStore((s) => s.group);
  const openChat = useOverlayStore((s) => s.openChat);
  const markGroupRead = useOverlayStore((s) => s.markGroupRead);
  const [members, setMembers] = useState<Record<string, PresenceEntry>>({});
  useEffect(() => subscribePresence(instance.modpackId, setMembers), [instance.modpackId]);
  const playing = Object.values(members).filter((m) => m.online).length;
  const total = Object.keys(members).length;

  const panelVisible = useOverlayStore((s) => s.panelVisible);
  useEffect(() => {
    if (panelVisible) markGroupRead();
  }, [panelVisible, group?.messages.length, markGroupRead]);

  return (
    <ConversationView
      group
      messages={group ? group.messages : null}
      target={target}
      placeholder={`Mensaje para ${instance.name}`}
      emptyTitle="Nadie ha escrito todavía"
      onSend={(text) => sendGroupMessage(instance.groupKey!, me.uuid, me.username, text)}
      header={
        <>
          <IconButton icon={ArrowLeft} label="Volver" onClick={() => openChat(null)} />
          <InstanceAvatar imageUrl={instance.imageUrl} loaderType={instance.loaderType} size={32} className="rounded-[22%]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">Chat de {instance.name}</p>
            <p className="truncate text-[10px] font-medium text-gray-500">
              {total} participante{total === 1 ? "" : "s"}
              {playing > 0 && <span className="text-emerald-400"> · {playing} jugando</span>}
            </p>
          </div>
        </>
      }
    />
  );
}

/** Where "Instalar" on a shared mod/shader/resource pack puts it: the
 *  instance being played, with what it already has (by sha1). */
function useRunningTarget(instance: Instance | null, contentLocked: boolean): RunningTarget | null {
  const [hashes, setHashes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!instance) return;
    let cancelled = false;
    listInstanceFiles(instance.modpackId)
      .then((files) => {
        if (!cancelled) setHashes(new Set(files.map((f) => f.sha1).filter((h): h is string => !!h)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [instance?.modpackId]);
  return useMemo(
    () =>
      instance
        ? {
            modpackId: instance.modpackId,
            name: instance.name,
            contentLocked,
            installedHashes: hashes,
            onInstalled: (sha1: string) => setHashes((s) => new Set(s).add(sha1)),
          }
        : null,
    [instance, contentLocked, hashes],
  );
}

export function ChatTab({ instance, contentLocked }: { instance: Instance | null; contentLocked: boolean }) {
  const me = useOverlayStore((s) => s.me);
  const openUuid = useOverlayStore((s) => s.openUuid);
  const target = useRunningTarget(instance, contentLocked);
  if (!me) {
    return (
      <EmptyState icon={MessageCircle} title="Inicia sesión en ALaunchi">
        El chat usa tu cuenta del launcher.
      </EmptyState>
    );
  }
  if (openUuid === GROUP_CHAT) {
    return instance?.groupKey ? <GroupConversation instance={instance} target={target} /> : <ConversationList instance={instance} />;
  }
  return openUuid ? <DirectConversation key={openUuid} otherUuid={openUuid} target={target} /> : <ConversationList instance={instance} />;
}
