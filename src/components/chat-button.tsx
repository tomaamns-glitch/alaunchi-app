import { useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { useBarInvites } from "@/hooks/use-invites";
import { Hint } from "@/components/hint";
import { InviteBubbles, InviteCard } from "@/components/invite-bubbles";

const FRONT_BUBBLE =
  "M6 8h7a3.5 3.5 0 0 1 3.5 3.5v3A3.5 3.5 0 0 1 13 18H9.5L6 21v-3a3.5 3.5 0 0 1-3.5-3.5v-3A3.5 3.5 0 0 1 6 8z";
const BACK_BUBBLE =
  "M10.5 5.5A3.5 3.5 0 0 1 14 2h4.5A3.5 3.5 0 0 1 22 5.5v3a3.5 3.5 0 0 1-3.5 3.5H18v2.5L15.2 12H14a3.5 3.5 0 0 1-3.5-3.5z";

/** Two overlapping speech bubbles (a conversation, not a single message); the
 *  front one has "typing" dots that bounce while there's something unread. The
 *  back bubble is cut out around the front one with a mask, so the gap stays
 *  clean over the button's translucent background. */
function ChatGlyph({ active, className }: { active: boolean; className?: string }) {
  const maskId = `chat-glyph-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className={className} aria-hidden>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="white" />
          <path d={FRONT_BUBBLE} fill="black" stroke="black" strokeWidth={4.2} />
        </mask>
      </defs>
      <path d={BACK_BUBBLE} mask={`url(#${maskId})`} opacity={0.55} />
      <path d={FRONT_BUBBLE} fill="currentColor" fillOpacity={0.16} />
      {[6.3, 9.5, 12.7].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy={13}
          r={1.15}
          fill="currentColor"
          stroke="none"
          animate={active ? { y: [0, -1.6, 0] } : { y: 0 }}
          transition={
            active
              ? { duration: 0.9, repeat: Infinity, repeatDelay: 1.4, delay: i * 0.14, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />
      ))}
    </svg>
  );
}

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
            <ChatGlyph active={unread > 0} className="h-[19px] w-[19px]" />
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
