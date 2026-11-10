import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { useBarInvites } from "@/hooks/use-invites";
import { Hint } from "@/components/hint";
import { InviteBubbles, InviteCard } from "@/components/invite-bubbles";

/** The footer's way into the chat: one button with everything unread on it, then
 *  any invitations to online instances. Conversations live inside ChatWindow's
 *  contact list. */
export function ChatButton() {
  const panelOpen = useChatHeads((s) => s.panelOpen);
  const openPanel = useChatHeads((s) => s.openPanel);
  const minimizeChat = useChatHeads((s) => s.minimizeChat);
  const unread = useChatHeads((s) =>
    Object.values(s.chatIndex).reduce((total, entry) => total + (entry.unreadCount || 0), 0)
  );
  const invites = useBarInvites();

  return (
    <>
      {/* These toggle their popups themselves: not an "outside" click for them. */}
      <div data-keep-popups-open className="flex items-center gap-1.5">
        <Hint label="Chat">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.15 }}
            type="button"
            onClick={() => (panelOpen ? minimizeChat() : openPanel())}
            aria-label="Chat"
            className={`relative h-[38px] w-[38px] shrink-0 flex items-center justify-center rounded-md border transition-colors ${
              panelOpen ? "border-accent bg-accent/15 text-accent" : "border-transparent bg-white/[0.07] backdrop-blur-md text-gray-200 hover:bg-white/[0.14]"
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-[2] -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-card"
                >
                  {unread > 99 ? "99+" : unread}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </Hint>
        {invites.length > 0 && <InviteBubbles />}
      </div>
      <InviteCard />
    </>
  );
}
