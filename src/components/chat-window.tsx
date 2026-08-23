import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Send, Search, MessageCircle } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getConversationId,
  subscribeChatIndex,
  subscribeMessages,
  subscribeUserDirectory,
  sendMessage,
  type ChatIndexEntry,
  type ChatMessage,
  type KnownUser,
} from "@/services/chat";
import { getNicknames } from "@/lib/nicknames";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  myUuid: string;
  myUsername: string;
  open: boolean;
  onClose: () => void;
}

interface ContactRow {
  uuid: string;
  username: string;
  lastMessage?: string;
  lastTimestamp?: number;
}

export function ChatWindow({ myUuid, myUsername, open, onClose }: ChatWindowProps) {
  const [chatIndex, setChatIndex] = useState<Record<string, ChatIndexEntry>>({});
  const [users, setUsers] = useState<Record<string, KnownUser>>({});
  const [nicknames] = useState(() => getNicknames());
  const [search, setSearch] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    return subscribeChatIndex(myUuid, setChatIndex);
  }, [open, myUuid]);

  useEffect(() => {
    if (!open) return;
    return subscribeUserDirectory(setUsers);
  }, [open]);

  useEffect(() => {
    if (!selectedUuid) {
      setMessages([]);
      return;
    }
    return subscribeMessages(getConversationId(myUuid, selectedUuid), setMessages);
  }, [selectedUuid, myUuid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const contacts: ContactRow[] = Object.entries(users)
    .filter(([uuid]) => uuid !== myUuid)
    .map(([uuid, u]) => ({
      uuid,
      username: u.username,
      lastMessage: chatIndex[uuid]?.lastMessage,
      lastTimestamp: chatIndex[uuid]?.lastTimestamp,
    }))
    .filter((c) => (nicknames[c.uuid] || c.username).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  const selected = selectedUuid ? contacts.find((c) => c.uuid === selectedUuid) : null;
  const selectedName = selectedUuid ? nicknames[selectedUuid] || users[selectedUuid]?.username || "" : "";

  const handleSend = () => {
    if (!selectedUuid || !draft.trim()) return;
    const otherUsername = users[selectedUuid]?.username || selectedName;
    sendMessage(myUuid, myUsername, selectedUuid, otherUsername, draft).catch(() => {});
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-3xl p-0 gap-0 overflow-hidden h-[32rem]">
        <div className="flex h-full min-h-0">
          <div className="w-64 shrink-0 border-r border-white/10 flex flex-col min-h-0">
            <div className="p-3 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="h-8 pl-8 bg-background/50 border-white/10 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {contacts.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No hay nadie más por aquí todavía.</p>
              ) : (
                contacts.map((c) => (
                  <button
                    key={c.uuid}
                    type="button"
                    onClick={() => setSelectedUuid(c.uuid)}
                    className={cn(
                      "w-full flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border-b border-white/5 transition-colors",
                      selectedUuid === c.uuid ? "bg-accent/15" : "hover:bg-white/5"
                    )}
                  >
                    <span className="text-sm font-medium text-white truncate w-full">
                      {nicknames[c.uuid] || c.username}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {c.lastMessage || "Sin mensajes todavía"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {!selectedUuid ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageCircle className="h-8 w-8" />
                <p className="text-sm">Elige a alguien para empezar a hablar.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-semibold text-white">{selectedName}</p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Todavía no hay mensajes con {selectedName}.
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
                                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                                isMe
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-white/10 text-gray-100"
                              )}
                            >
                              {m.text}
                              {m.timestamp && (
                                <div className={cn("text-[10px] mt-1 opacity-60")}>
                                  {formatDistanceToNow(m.timestamp, { locale: es, addSuffix: true })}
                                </div>
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
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
