import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Send,
  X,
  Pencil,
  Check,
  Paperclip,
  Download,
  RefreshCw,
  Loader2,
  Package,
  Sparkles,
  Image as ImageIcon,
  Smile,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  getConversationId,
  subscribeMessages,
  sendMessage,
  type ChatMessage,
} from "@/services/chat";
import { subscribePresence, type PresenceEntry } from "@/services/presence";
import { listInstanceFiles, listEmotes, downloadInstanceFile } from "@/services/electron";
import { getNicknames, setNickname } from "@/lib/nicknames";
import { formatPlaytime } from "@/lib/format";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { useModpacks } from "@/hooks/use-modpacks";
import { ChatContactRail } from "@/components/chat-contact-rail";
import { ChatContentPicker } from "@/components/chat-content-picker";
import type { ContentCategory, SharedContent } from "@/services/content-share";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  myUuid: string;
  myUsername: string;
  currentPackId: string;
}

const tapHover = { whileHover: { scale: 1.08 }, whileTap: { scale: 0.9 } };

const CONTENT_CATEGORY_ICON: Record<ContentCategory, typeof Package> = {
  mods: Package,
  shaderpacks: Sparkles,
  resourcepacks: ImageIcon,
  emotes: Smile,
};

const CONTENT_CATEGORY_LABEL: Record<ContentCategory, string> = {
  mods: "Mod",
  shaderpacks: "Shader",
  resourcepacks: "Textura",
  emotes: "Emote",
};

/** Floating panel for one open conversation — head/alias/status/playtime up
 *  top, messages, an input, and the contact rail on the left. Not a modal
 *  dialog, but a click outside it (or on its own bubble again) minimizes it
 *  back to the bubble; only the X in the header un-pins it entirely. Open,
 *  close, and minimize are all the same transition from here — they just
 *  differ in whether openUuid comes back later. */
export function ChatWindow({ myUuid, myUsername, currentPackId }: ChatWindowProps) {
  const openUuid = useChatHeads((s) => s.openUuid);
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const minimizeChat = useChatHeads((s) => s.minimizeChat);
  const closeChat = useChatHeads((s) => s.closeChat);
  const modpacks = useModpacks((s) => s.modpacks);

  // Sticky "who we're looking at" — openUuid itself flips to null the instant
  // you minimize/close, but the panel stays mounted for its exit animation, so
  // content has to keep reading from this instead or it'd flash blank mid-fade.
  const [displayUuid, setDisplayUuid] = useState<string | null>(null);
  useEffect(() => {
    if (openUuid) setDisplayUuid(openUuid);
  }, [openUuid]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [presenceEntry, setPresenceEntry] = useState<PresenceEntry | null>(null);
  const [nicknames, setNicknamesState] = useState(() => getNicknames());
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [installedHashes, setInstalledHashes] = useState<Record<string, Set<string>>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const headUrl = usePlayerHeadUrl(displayUuid);
  const otherUsername = displayUuid ? chatIndex[displayUuid]?.otherUsername ?? "" : "";
  const alias = displayUuid ? nicknames[displayUuid] : undefined;

  useEffect(() => {
    if (!displayUuid) {
      setMessages([]);
      return;
    }
    return subscribeMessages(getConversationId(myUuid, displayUuid), setMessages);
  }, [displayUuid, myUuid]);

  useEffect(() => {
    if (!displayUuid) return;
    return subscribePresence(currentPackId, (entries) => setPresenceEntry(entries[displayUuid] ?? null));
  }, [displayUuid, currentPackId]);

  useEffect(() => {
    setEditingAlias(false);
    setShowContentPicker(false);
  }, [displayUuid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Which shared-content hashes are already installed, per modpack referenced
  // by the visible messages — refreshed on load and after every install, so
  // deleting the file locally shows back up as "Descargar" next time you look.
  const refreshInstalledHashes = useCallback(async (modpackId: string) => {
    const [files, emotes] = await Promise.all([listInstanceFiles(modpackId), listEmotes(modpackId)]);
    const hashes = new Set<string>();
    for (const f of files) if (f.sha1) hashes.add(f.sha1);
    for (const e of emotes) if (e.sha1) hashes.add(e.sha1);
    setInstalledHashes((prev) => ({ ...prev, [modpackId]: hashes }));
  }, []);

  useEffect(() => {
    const modpackIds = new Set(messages.filter((m) => m.content).map((m) => m.content!.modpackId));
    modpackIds.forEach((id) => {
      refreshInstalledHashes(id).catch(() => {});
    });
  }, [messages, refreshInstalledHashes]);

  const handleSend = () => {
    if (!draft.trim() || !displayUuid) return;
    sendMessage(myUuid, myUsername, displayUuid, otherUsername, draft).catch(() => {});
    setDraft("");
  };

  const handleSaveAlias = () => {
    if (!displayUuid) return;
    setNicknamesState(setNickname(displayUuid, aliasDraft));
    setEditingAlias(false);
  };

  return (
    <AnimatePresence>
      {openUuid && (
        <motion.button
          key="chat-backdrop"
          type="button"
          aria-label="Minimizar chat"
          onClick={minimizeChat}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
      {openUuid && (
        <motion.div
          key="chat-panel"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full left-0 mb-2 z-40 flex w-[38rem] h-[30rem] rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden"
        >
          <ChatContactRail myUuid={myUuid} currentPackId={currentPackId} selectedUuid={displayUuid ?? ""} />

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
                    <motion.button
                      {...tapHover}
                      type="button"
                      onClick={handleSaveAlias}
                      className="text-accent hover:text-accent/80 shrink-0"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    {...tapHover}
                    type="button"
                    onClick={() => {
                      setAliasDraft(alias || "");
                      setEditingAlias(true);
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-accent transition-colors"
                  >
                    {alias || otherUsername}
                    <Pencil className="h-3 w-3 opacity-50" />
                  </motion.button>
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
                <motion.button
                  {...tapHover}
                  type="button"
                  onClick={() => displayUuid && closeChat(displayUuid)}
                  title="Cerrar"
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
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
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn("flex", isMe ? "justify-end" : "justify-start")}
                      >
                        {m.content ? (
                          <SharedContentCard
                            content={m.content}
                            installed={installedHashes[m.content.modpackId]?.has(m.content.sha1) ?? false}
                            pack={modpacks.find((p) => p.id === m.content!.modpackId)}
                            onInstalled={() => refreshInstalledHashes(m.content!.modpackId)}
                          />
                        ) : (
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
                              <div className="text-[10px] mt-1 opacity-60 text-right">
                                {format(m.timestamp, "HH:mm")}
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-white/10 flex items-center gap-2">
              <div className="relative">
                <motion.button
                  {...tapHover}
                  type="button"
                  onClick={() => setShowContentPicker((v) => !v)}
                  title="Enviar contenido"
                  className={cn(
                    "h-9 w-9 flex items-center justify-center rounded-md transition-colors shrink-0",
                    showContentPicker ? "bg-accent/20 text-accent" : "bg-white/5 hover:bg-white/10 text-gray-300"
                  )}
                >
                  <Paperclip className="h-4 w-4" />
                </motion.button>
                <AnimatePresence>
                  {showContentPicker && displayUuid && (
                    <ChatContentPicker
                      myUuid={myUuid}
                      myUsername={myUsername}
                      otherUuid={displayUuid}
                      otherUsername={otherUsername}
                      currentPackId={currentPackId}
                      onClose={() => setShowContentPicker(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-background/50 border-white/10"
              />
              <motion.button
                whileHover={draft.trim() ? { scale: 1.08 } : undefined}
                whileTap={draft.trim() ? { scale: 0.9 } : undefined}
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                className="h-9 w-9 flex items-center justify-center rounded-md bg-accent hover:bg-accent/90 text-accent-foreground disabled:opacity-50 transition-colors shrink-0"
              >
                <Send className="h-4 w-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SharedContentCard({
  content,
  installed,
  pack,
  onInstalled,
}: {
  content: SharedContent;
  installed: boolean;
  pack: { id: string; name: string; installed: boolean } | undefined;
  onInstalled: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const Icon = CONTENT_CATEGORY_ICON[content.category];
  const packInstalled = pack?.installed ?? false;

  const handleDownload = async () => {
    setInstalling(true);
    try {
      const targetPath = `${content.category}/${content.fileName}`;
      await downloadInstanceFile(content.modpackId, targetPath, content.downloadUrl, content.sha1);
      toast.success(`${content.displayName} instalado.`);
      onInstalled();
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="max-w-[85%] flex items-center gap-2.5 rounded-2xl px-3 py-2.5 bg-white/10 shadow-sm">
      {content.iconUrl ? (
        <img
          src={content.iconUrl}
          alt=""
          className="h-9 w-9 rounded shrink-0 object-cover bg-black/30"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <div className="h-9 w-9 rounded shrink-0 bg-white/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-100 truncate font-medium">{content.displayName}</p>
        <p className="text-[10px] text-muted-foreground">{CONTENT_CATEGORY_LABEL[content.category]}</p>
      </div>
      {!packInstalled ? (
        <span className="text-[10px] text-muted-foreground text-right shrink-0 max-w-[6rem]">
          Instala {pack?.name ?? "el modpack"} primero
        </span>
      ) : (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={handleDownload}
          disabled={installing}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold disabled:opacity-60 transition-colors"
        >
          {installing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : installed ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          {installed ? "Volver a descargar" : "Descargar"}
        </motion.button>
      )}
    </div>
  );
}
