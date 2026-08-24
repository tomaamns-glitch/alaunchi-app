import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Send, Minus, X, Pencil, Check } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  getConversationId,
  subscribeMessages,
  sendMessage,
  type ChatMessage,
} from "@/services/chat";
import { subscribePresence, type PresenceEntry } from "@/services/presence";
import { getNicknames, setNickname } from "@/lib/nicknames";
import { formatPlaytime } from "@/lib/format";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { ChatContactRail } from "@/components/chat-contact-rail";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  myUuid: string;
  myUsername: string;
  currentPackId: string;
}

/** Floating panel for one open conversation — head/alias/status/playtime up
 *  top, messages, an input, and the contact rail on the right. Not a modal:
 *  minimizing (via the store) just drops it back to its bubble, closing (X)
 *  un-pins it entirely. */
export function ChatWindow({ myUuid, myUsername, currentPackId }: ChatWindowProps) {
  const openUuid = useChatHeads((s) => s.openUuid);
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const minimizeChat = useChatHeads((s) => s.minimizeChat);
  const closeChat = useChatHeads((s) => s.closeChat);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [presenceEntry, setPresenceEntry] = useState<PresenceEntry | null>(null);
  const [nicknames, setNicknamesState] = useState(() => getNicknames());
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const headUrl = usePlayerHeadUrl(openUuid);
  const otherUsername = openUuid ? chatIndex[openUuid]?.otherUsername ?? "" : "";
  const alias = openUuid ? nicknames[openUuid] : undefined;

  useEffect(() => {
    if (!openUuid) {
      setMessages([]);
      return;
    }
    return subscribeMessages(getConversationId(myUuid, openUuid), setMessages);
  }, [openUuid, myUuid]);

  useEffect(() => {
    if (!openUuid) return;
    return subscribePresence(currentPackId, (entries) => setPresenceEntry(entries[openUuid] ?? null));
  }, [openUuid, currentPackId]);

  useEffect(() => {
    setEditingAlias(false);
  }, [openUuid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!openUuid) return null;

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage(myUuid, myUsername, openUuid, otherUsername, draft).catch(() => {});
    setDraft("");
  };

  const handleSaveAlias = () => {
    setNicknamesState(setNickname(openUuid, aliasDraft));
    setEditingAlias(false);
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 z-40 flex w-[38rem] h-[30rem] rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-white/10 flex items-start gap-3">
          <Avatar className="h-10 w-10 border border-white/10 shrink-0">
            {headUrl && <AvatarImage src={headUrl} alt={otherUsername} />}
            <AvatarFallback className="bg-accent/20 text-accent text-sm font-bold">
              {otherUsername.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            {editingAlias ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={aliasDraft}
                  onChange={(e) => setAliasDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAlias();
                    if (e.key === "Escape") setEditingAlias(false);
                  }}
                  placeholder={otherUsername}
                  className="h-6 text-xs px-2 bg-background/50 border-white/10 flex-1"
                />
                <button type="button" onClick={handleSaveAlias} className="text-accent hover:text-accent/80 shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAliasDraft(alias || "");
                  setEditingAlias(true);
                }}
                className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-accent transition-colors"
              >
                {alias || otherUsername}
                <Pencil className="h-3 w-3 opacity-50" />
              </button>
            )}
            <p className="text-xs text-muted-foreground truncate">{otherUsername}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {presenceEntry?.online ? (
                <span className="text-green-400">● En línea</span>
              ) : presenceEntry?.lastSeen ? (
                `Hace ${formatDistanceToNow(presenceEntry.lastSeen, { locale: es })}`
              ) : (
                "Sin conexión registrada"
              )}
              {presenceEntry?.playtimeMs ? ` · ${formatPlaytime(presenceEntry.playtimeMs)}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={minimizeChat}
              title="Minimizar"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => closeChat(openUuid)}
              title="Cerrar"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Todavía no hay mensajes con {alias || otherUsername}.
            </p>
          ) : (
            messages
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((m, i) => {
                const isMe = m.senderUuid === myUuid;
                return (
                  <div key={i} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                        isMe
                          ? "bg-accent text-accent-foreground rounded-br-sm"
                          : "bg-white/10 text-gray-100 rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      {m.timestamp && (
                        <div className="text-[10px] mt-1 opacity-60 text-right">{format(m.timestamp, "HH:mm")}</div>
                      )}
                    </div>
                  </div>
                );
              })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-white/10 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-background/50 border-white/10"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim()}
            className="h-9 w-9 flex items-center justify-center rounded-md bg-accent hover:bg-accent/90 text-accent-foreground disabled:opacity-50 transition-colors shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ChatContactRail myUuid={myUuid} currentPackId={currentPackId} selectedUuid={openUuid} />
    </div>
  );
}
