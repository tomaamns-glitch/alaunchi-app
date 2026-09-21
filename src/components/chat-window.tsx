import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Send,
  X,
  Minus,
  ArrowDown,
  Paperclip,
  Download,
  RefreshCw,
  Loader2,
  Package,
  Sparkles,
  Image as ImageIcon,
  Smile,
  Box,
  Shirt,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  getConversationId,
  subscribeMessages,
  sendMessage,
  type ChatMessage,
} from "@/services/chat";
import { subscribePlayingStatus, type UserActivity } from "@/services/user-activity";
import { listInstanceFiles, listEmotes, listSchematics, listScreenshots, downloadInstanceFile } from "@/services/electron";
import { listSkinLibrary, saveToSkinLibrary } from "@/services/skin";
import { fetchAsBase64 } from "@/services/content-share";
import { getNicknames } from "@/lib/nicknames";
import { getInstanceAccentColor } from "@/lib/instance-color";
import { findCompatibleInstances, type CompatibleInstance } from "@/lib/content-compat";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { ChatContactRail } from "@/components/chat-contact-rail";
import { ChatContentPicker } from "@/components/chat-content-picker";
import { ChatModeSelector } from "@/components/chat-mode-selector";
import type { ContentCategory, SharedContent } from "@/services/content-share";
import { cn } from "@/lib/utils";
// Re-exported for existing imports (chat-content-picker.tsx) — the type now
// lives in a shared module since PresenceButton/ChatContactRail need it too.
export type { ChatMode } from "@/lib/instance-context";
import type { ChatMode } from "@/lib/instance-context";

interface ChatWindowProps {
  myUuid: string;
  myUsername: string;
  /** Mode this conversation starts in when newly opened (not when reopening
   *  an already-open/minimized one — see the mode-reset effect below). Pass
   *  the carousel instance you're currently viewing, or {type:"general"} from
   *  anywhere else (the Hub, Friends, a public profile). */
  defaultMode: ChatMode;
}

const tapHover = { whileHover: { scale: 1.08 }, whileTap: { scale: 0.9 } };

const CONTENT_CATEGORY_ICON: Record<ContentCategory, typeof Package> = {
  mods: Package,
  shaderpacks: Sparkles,
  resourcepacks: ImageIcon,
  emotes: Smile,
  schematics: Box,
  skins: Shirt,
  screenshots: Camera,
};

const CONTENT_CATEGORY_LABEL: Record<ContentCategory, string> = {
  mods: "Mod",
  shaderpacks: "Shader",
  resourcepacks: "Textura",
  emotes: "Emote",
  schematics: "Esquema",
  skins: "Skin",
  screenshots: "Captura",
};

// Small threshold, not an exact 0 — lets a "smooth" scroll settle without
// flickering between at-bottom/not states while it's animating.
function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

/** Floating panel for one open conversation — head/alias/status/playtime up
 *  top, messages, an input, and the contact rail on the left. Not a modal
 *  dialog, but a click outside it (or on its own bubble again) minimizes it
 *  back to the bubble; only the X in the header un-pins it entirely. Open,
 *  close, and minimize are all the same transition from here — they just
 *  differ in whether openUuid comes back later. */
export function ChatWindow({ myUuid, myUsername, defaultMode }: ChatWindowProps) {
  const [, setLocation] = useLocation();
  const openUuid = useChatHeads((s) => s.openUuid);
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const directory = useChatHeads((s) => s.directory);
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

  // Custom instances only load reliably once the Hub has been visited this
  // session — general-mode content sharing (picker + received-content cards,
  // both reactively read useCustomInstances()) needs it regardless of which
  // page the chat panel happens to be open on.
  useEffect(() => {
    useCustomInstances.getState().loadInstances().catch(() => {});
  }, []);

  // Which mode (general / a specific carousel instance) this conversation is
  // currently framed in. Applies defaultMode only the moment displayUuid
  // actually changes to a *different* conversation — reopening the same one
  // after minimizing keeps whatever mode you had picked, it doesn't snap back.
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const modeInitializedForUuid = useRef<string | null>(null);
  useEffect(() => {
    if (!displayUuid) return;
    if (modeInitializedForUuid.current !== displayUuid) {
      modeInitializedForUuid.current = displayUuid;
      setMode(defaultMode);
    }
  }, [displayUuid, defaultMode]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // "Eliminar conversación" (chat-contact-rail.tsx's context menu) sets this
  // marker on our own chatIndex entry instead of touching the shared
  // chats/{conversationId}/messages node — everything at or before it just
  // gets filtered out of view here, for us only.
  const deletedBefore = displayUuid ? chatIndex[displayUuid]?.deletedBefore : undefined;
  const visibleMessages = deletedBefore ? messages.filter((m) => m.timestamp > deletedBefore) : messages;
  const [draft, setDraft] = useState("");
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityColor, setActivityColor] = useState<string | null>(null);
  // Nicknames are read-only here now — editing lives on the player's profile
  // page instead (a fresh mount of this component, e.g. after navigating away
  // and back, is enough to pick up a change made there).
  const [nicknames] = useState(() => getNicknames());
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [railExpanded, setRailExpanded] = useState(true);
  const [installedHashes, setInstalledHashes] = useState<Record<string, Set<string>>>({});
  const [installedSkinHashes, setInstalledSkinHashes] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  // Per-conversation scrollTop, remembered only when leaving it scrolled up —
  // if it was at the bottom, no entry is kept and it just opens at the bottom
  // again next time, same as always.
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const justSwitchedConversation = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [newMessagesBelow, setNewMessagesBelow] = useState(false);

  // chatIndex only gets an entry once a message has actually been sent —
  // fall back to the global "everyone who's ever opened the app" directory
  // for a conversation just opened from a friend's profile/the friends list.
  const otherUsername = displayUuid ? chatIndex[displayUuid]?.otherUsername ?? directory[displayUuid]?.username ?? "" : "";
  const alias = displayUuid ? nicknames[displayUuid] : undefined;

  useEffect(() => {
    if (!displayUuid) {
      setMessages([]);
      return;
    }
    return subscribeMessages(getConversationId(myUuid, displayUuid), setMessages);
  }, [displayUuid, myUuid]);

  useEffect(() => {
    if (!displayUuid) {
      setActivity(null);
      return;
    }
    return subscribePlayingStatus(displayUuid, setActivity);
  }, [displayUuid]);

  // Only "playing a catalog instance" needs a resolved color (custom instances
  // show plain text — see the render below) — extracted separately since it's
  // async and shouldn't block rendering the rest of the status line.
  useEffect(() => {
    if (activity?.status !== "playing" || activity.instanceSource !== "github" || !activity.instanceId) {
      setActivityColor(null);
      return;
    }
    const pack = modpacks.find((p) => p.id === activity.instanceId);
    let cancelled = false;
    getInstanceAccentColor({ id: activity.instanceId, imageUrl: pack?.imageUrl }).then((color) => {
      if (!cancelled) setActivityColor(color);
    });
    return () => {
      cancelled = true;
    };
  }, [activity, modpacks]);

  useEffect(() => {
    setShowContentPicker(false);
  }, [displayUuid]);

  // Kept current on every render (no deps array) purely so the cleanup below
  // — which only depends on openUuid — can read "whichever conversation was
  // showing right before this transition" without stale-closure trouble;
  // displayUuid itself doesn't change on minimize (openUuid -> null), it
  // stays pointed at the outgoing conversation, which is exactly what we
  // want to key the saved scroll position under.
  const displayUuidRef = useRef<string | null>(null);
  useEffect(() => {
    displayUuidRef.current = displayUuid;
  });

  // Saves the outgoing conversation's scroll position — but only if it
  // wasn't at the bottom — the moment you switch to a different conversation
  // or minimize (both change openUuid; switching between two already-open
  // conversations does too, via openChat).
  useEffect(() => {
    return () => {
      const uuid = displayUuidRef.current;
      const el = messagesContainerRef.current;
      if (!uuid || !el) return;
      if (isNearBottom(el)) scrollPositions.current.delete(uuid);
      else scrollPositions.current.set(uuid, el.scrollTop);
    };
  }, [openUuid]);

  // Marks the *next* messages update as "just switched conversations" so the
  // effect below restores a position (or jumps to bottom) instead of treating
  // it like a live new-message arrival.
  useEffect(() => {
    justSwitchedConversation.current = true;
    setNewMessagesBelow(false);
  }, [displayUuid]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (justSwitchedConversation.current) {
      justSwitchedConversation.current = false;
      const saved = displayUuid ? scrollPositions.current.get(displayUuid) : undefined;
      el.scrollTop = saved ?? el.scrollHeight;
      setAtBottom(isNearBottom(el));
      return;
    }
    // A genuinely new message arrived while this conversation was already open.
    if (isNearBottom(el)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setNewMessagesBelow(true);
    }
  }, [visibleMessages.length]);

  function handleMessagesScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const now = isNearBottom(el);
    setAtBottom(now);
    if (now) setNewMessagesBelow(false);
  }

  function jumpToLatest() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessagesBelow(false);
  }

  // Which shared-content hashes are already installed, per modpack referenced
  // by the visible messages — refreshed on load and after every install, so
  // deleting the file locally shows back up as "Descargar" next time you look.
  const refreshInstalledHashes = useCallback(async (modpackId: string) => {
    const [files, emotes, schematicFiles, shots] = await Promise.all([
      listInstanceFiles(modpackId),
      listEmotes(modpackId),
      listSchematics(modpackId),
      listScreenshots(modpackId),
    ]);
    const hashes = new Set<string>();
    for (const f of files) if (f.sha1) hashes.add(f.sha1);
    for (const e of emotes) if (e.sha1) hashes.add(e.sha1);
    for (const s of schematicFiles) if (s.sha1) hashes.add(s.sha1);
    for (const s of shots) if (s.sha1) hashes.add(s.sha1);
    setInstalledHashes((prev) => ({ ...prev, [modpackId]: hashes }));
  }, []);

  // Skins are account-scoped, not per-modpack — separate from installedHashes'
  // Record<modpackId, Set<sha1>> shape above.
  const refreshInstalledSkinHashes = useCallback(async () => {
    const skins = await listSkinLibrary();
    setInstalledSkinHashes(new Set(skins.map((s) => s.sha1).filter((h): h is string => !!h)));
  }, []);

  useEffect(() => {
    refreshInstalledSkinHashes().catch(() => {});
  }, [refreshInstalledSkinHashes]);

  useEffect(() => {
    const modpackIds = new Set(
      visibleMessages.filter((m) => m.content?.modpackId).map((m) => m.content!.modpackId as string)
    );
    modpackIds.forEach((id) => {
      refreshInstalledHashes(id).catch(() => {});
    });
  }, [visibleMessages, refreshInstalledHashes]);

  // Colors for the per-message "sent in {instance} mode" tag (see the render
  // below) — resolved lazily per distinct carouselInstanceId actually seen in
  // this conversation, not eagerly for every installed pack.
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const requestedColorIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of visibleMessages) {
      const id = m.carouselInstanceId;
      if (!id || requestedColorIds.current.has(id)) continue;
      const pack = modpacks.find((p) => p.id === id);
      if (!pack) continue;
      requestedColorIds.current.add(id);
      getInstanceAccentColor(pack).then((color) => {
        setTagColors((prev) => ({ ...prev, [id]: color }));
      });
    }
  }, [visibleMessages, modpacks]);

  const handleSend = () => {
    if (!draft.trim() || !displayUuid) return;
    const carouselInstanceId = mode.type === "carousel" ? mode.pack.id : undefined;
    sendMessage(myUuid, myUsername, displayUuid, otherUsername, draft, carouselInstanceId).catch(() => {});
    setDraft("");
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
          className="absolute bottom-full left-0 mb-2 z-40 flex w-[52rem] h-[30rem] rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden"
        >
          <ChatContactRail
            myUuid={myUuid}
            mode={mode}
            onModeChange={setMode}
            selectedUuid={displayUuid ?? ""}
            expanded={railExpanded}
            onToggleExpanded={() => setRailExpanded((v) => !v)}
          />

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-white/10 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {/* Only shown here while the rail is collapsed — expanded, this
                    same selector lives inside ChatContactRail instead (see
                    railExpanded below and chat-contact-rail.tsx). */}
                {!railExpanded && (
                  <div className="mb-1">
                    <ChatModeSelector mode={mode} onSelect={setMode} />
                  </div>
                )}
                <motion.button
                  {...tapHover}
                  type="button"
                  onClick={() => displayUuid && setLocation(`/profile/${displayUuid}`)}
                  title="Ver perfil"
                  className="block text-sm font-semibold text-white hover:text-accent transition-colors truncate text-left"
                >
                  {alias || otherUsername}
                </motion.button>
                <p className="text-[11px] text-muted-foreground truncate">
                  {activity?.status === "playing" ? (
                    activity.instanceSource === "custom" ? (
                      <span>Jugando a {activity.instanceName} (Local)</span>
                    ) : (
                      <span style={activityColor ? { color: activityColor } : undefined} className="font-medium">
                        Jugando a {activity.instanceName}
                      </span>
                    )
                  ) : activity?.status === "online" ? (
                    <span className="text-green-400">● En línea</span>
                  ) : activity?.lastSeen ? (
                    `Última conexión: hace ${formatDistanceToNow(activity.lastSeen, { locale: es })}`
                  ) : (
                    "Última conexión: sin registrar"
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <motion.button
                  {...tapHover}
                  type="button"
                  onClick={minimizeChat}
                  title="Minimizar"
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </motion.button>
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

            <div className="relative flex-1 min-h-0">
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="h-full overflow-y-auto p-4 space-y-2"
            >
              {visibleMessages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Todavía no hay mensajes con {alias || otherUsername}.
                </p>
              ) : (
                visibleMessages
                  .sort((a, b) => a.timestamp - b.timestamp)
                  .map((m, i) => {
                    const isMe = m.senderUuid === myUuid;
                    // Degradation rule: a message tagged with a carousel instance the
                    // viewer doesn't have renders exactly like a general message — no
                    // tag, nothing implying context they can't act on.
                    const tagPack = m.carouselInstanceId ? modpacks.find((p) => p.id === m.carouselInstanceId) : undefined;
                    const tagColor = m.carouselInstanceId ? tagColors[m.carouselInstanceId] : undefined;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                      >
                        {tagPack && (
                          <span
                            className="mb-0.5 max-w-[75%] truncate rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/90"
                            style={{ backgroundColor: tagColor ?? "hsl(205 90% 55%)" }}
                          >
                            {tagPack.name}
                          </span>
                        )}
                        {m.content ? (
                          <SharedContentCard
                            content={m.content}
                            carouselInstanceId={m.carouselInstanceId}
                            installed={
                              m.content.category === "skins"
                                ? installedSkinHashes.has(m.content.sha1)
                                : (m.content.modpackId ? installedHashes[m.content.modpackId]?.has(m.content.sha1) : false) ?? false
                            }
                            onInstalled={() =>
                              m.content!.category === "skins"
                                ? refreshInstalledSkinHashes()
                                : m.content!.modpackId && refreshInstalledHashes(m.content!.modpackId)
                            }
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

            <AnimatePresence>
              {!atBottom && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={jumpToLatest}
                  title="Ir a los mensajes más recientes"
                  className="absolute bottom-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-card border border-white/10 shadow-lg text-gray-200 hover:text-accent transition-colors"
                >
                  <ArrowDown className="h-4 w-4" />
                  {newMessagesBelow && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 border border-card" />
                  )}
                </motion.button>
              )}
            </AnimatePresence>
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
                      mode={mode}
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
  carouselInstanceId,
  installed,
  onInstalled,
}: {
  content: SharedContent;
  /** The message's mode tag (chat.ts' ChatMessage.carouselInstanceId), not
   *  content.modpackId — the message's *mode* decides whether this is a
   *  direct install or needs compatibility detection, not just whichever id
   *  the sender happened to record. */
  carouselInstanceId?: string;
  installed: boolean;
  onInstalled: () => void;
}) {
  const catalogModpacks = useModpacks((s) => s.modpacks);
  const customInstances = useCustomInstances((s) => s.instances);
  const [installing, setInstalling] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [checkingCompat, setCheckingCompat] = useState(false);
  const [compatible, setCompatible] = useState<CompatibleInstance[] | null>(null);
  const Icon = CONTENT_CATEGORY_ICON[content.category];

  // Direct match: sent in a carousel instance's mode AND the viewer actually
  // has that instance — install exactly what was shared, no picker. Anything
  // else (general mode, or carousel mode for an instance the viewer doesn't
  // have — the agreed degradation rule) falls through to compatibility
  // detection below instead of a modpackId-only guess.
  const directPack =
    content.category !== "skins" && carouselInstanceId
      ? catalogModpacks.find((p) => p.id === carouselInstanceId && p.installed) ??
        customInstances.find((p) => p.id === carouselInstanceId)
      : undefined;

  const allMyInstances = [...catalogModpacks.filter((p) => p.installed), ...customInstances];

  const installInto = async (targetId: string, targetName: string, url: string, sha1: string, fileName: string) => {
    setInstalling(true);
    try {
      if (content.category === "schematics") {
        const folder = content.schematicSource === "worldedit" ? "config/worldedit/schematics" : "schematics";
        await downloadInstanceFile(targetId, `${folder}/${fileName}`, url, sha1);
      } else {
        await downloadInstanceFile(targetId, `${content.category}/${fileName}`, url, sha1);
      }
      toast.success(`${content.displayName} instalado en ${targetName}.`);
      onInstalled();
      setShowPicker(false);
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setInstalling(false);
    }
  };

  const handleClick = async () => {
    if (content.category === "skins") {
      setInstalling(true);
      try {
        const base64 = await fetchAsBase64(content.downloadUrl);
        await saveToSkinLibrary(content.displayName, content.skinVariant ?? "classic", base64);
        toast.success(`${content.displayName} instalado.`);
        onInstalled();
      } catch (e: any) {
        toast.error(e?.message || "Error al instalar.");
      } finally {
        setInstalling(false);
      }
      return;
    }

    if (directPack) {
      await installInto(directPack.id, directPack.name, content.downloadUrl, content.sha1, content.fileName);
      return;
    }

    const opening = !showPicker;
    setShowPicker(opening);
    if (opening && compatible === null && content.modrinthProjectId) {
      setCheckingCompat(true);
      const found = await findCompatibleInstances(content.modrinthProjectId, content.category);
      setCheckingCompat(false);
      setCompatible(found);
    }
  };

  const isOneClick = content.category === "skins" || !!directPack;

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
      <div className="relative shrink-0">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={handleClick}
          disabled={installing}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold disabled:opacity-60 transition-colors",
            showPicker ? "bg-accent/20 text-accent" : "bg-accent hover:bg-accent/90 text-accent-foreground"
          )}
        >
          {installing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isOneClick && installed ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          {isOneClick ? (installed ? "Volver a descargar" : "Descargar") : "Instalar"}
        </motion.button>
        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full right-0 mb-1 z-50 w-52 max-h-56 overflow-y-auto rounded-lg bg-card border border-white/10 shadow-xl py-1"
            >
              {checkingCompat ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : compatible !== null ? (
                compatible.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground px-2.5 py-2 text-left">
                    No se encontró ninguna instancia compatible (versión de Minecraft / loader).
                  </p>
                ) : (
                  compatible.map((c) => (
                    <button
                      key={c.pack.id}
                      type="button"
                      onClick={() =>
                        installInto(c.pack.id, c.pack.name, c.resolvedVersion.url, c.resolvedVersion.sha1, c.resolvedVersion.filename)
                      }
                      className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/5 transition-colors"
                    >
                      {c.pack.imageUrl ? (
                        <img src={c.pack.imageUrl} alt="" className="h-4 w-4 rounded-sm object-cover shrink-0" />
                      ) : (
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{c.pack.name}</span>
                    </button>
                  ))
                )
              ) : (
                <>
                  <p className="text-[9px] text-muted-foreground px-2.5 pt-1.5 pb-1 text-left">
                    No se detectó compatibilidad — elige dónde instalarlo:
                  </p>
                  {allMyInstances.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground px-2.5 py-2 text-left">No tienes ninguna instancia.</p>
                  ) : (
                    allMyInstances.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => installInto(p.id, p.name, content.downloadUrl, content.sha1, content.fileName)}
                        className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/5 transition-colors"
                      >
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="h-4 w-4 rounded-sm object-cover shrink-0" />
                        ) : (
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
