import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads, useVisibleChatBubbles } from "@/hooks/use-chat-heads";

/** Row of square "chat head" bubbles next to the players button — one per
 *  pinned/unread conversation. Square (vs. the round players button) so it
 *  reads as a distinct, stacked set of mini chat windows. */
export function ChatBubbleRow() {
  const uuids = useVisibleChatBubbles();
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const openUuid = useChatHeads((s) => s.openUuid);
  const openChat = useChatHeads((s) => s.openChat);
  const minimizeChat = useChatHeads((s) => s.minimizeChat);

  if (uuids.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence>
        {uuids.map((uuid) => {
          const entry = chatIndex[uuid];
          const unread = entry?.unreadCount || 0;
          const active = openUuid === uuid;
          return (
            <ChatBubble
              key={uuid}
              uuid={uuid}
              username={entry?.otherUsername ?? ""}
              unread={unread}
              active={active}
              onClick={() => (active ? minimizeChat() : openChat(uuid))}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ChatBubble({
  uuid,
  username,
  unread,
  active,
  onClick,
}: {
  uuid: string;
  username: string;
  unread: number;
  active: boolean;
  onClick: () => void;
}) {
  const headUrl = usePlayerHeadUrl(uuid);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.15 }}
      type="button"
      onClick={onClick}
      aria-label={`Chat con ${username}`}
      className={`relative h-9 w-9 shrink-0 rounded-md border transition-colors ${
        active ? "border-accent bg-accent/15" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <Avatar className="h-full w-full rounded-md">
        {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
        <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
          {username?.charAt(0)?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-card"
          >
            {unread > 1 ? unread : ""}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
