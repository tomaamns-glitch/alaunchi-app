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

  if (uuids.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {uuids.map((uuid) => {
        const entry = chatIndex[uuid];
        const unread = entry?.unreadCount || 0;
        return (
          <ChatBubble
            key={uuid}
            uuid={uuid}
            username={entry?.otherUsername ?? ""}
            unread={unread}
            active={openUuid === uuid}
            onClick={() => openChat(uuid)}
          />
        );
      })}
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
    <button
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
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-card">
          {unread > 1 ? unread : ""}
        </span>
      )}
    </button>
  );
}
