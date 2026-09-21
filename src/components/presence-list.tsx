import type { PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { formatCompactAgo } from "@/lib/format";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface PresenceListProps {
  players: [string, PresenceEntry][];
  /** Shown when players is empty — defaults to the per-modpack presence
   *  wording; PresenceButton's friends section passes its own (that default
   *  text talks about "playing this", which doesn't fit a friends list). */
  emptyMessage?: string;
}

/** Row list shared by the home screen's presence popup and the "Todos" dialog —
 *  online status, "hace X" for recent-but-offline players. Clicking someone's
 *  name opens a chat with them (bubble next to the players button; alias
 *  editing lives in the chat header now, not here). Callers filter the
 *  current user out of `players` before calling this — you never see
 *  yourself listed here. */
export function PresenceList({ players, emptyMessage }: PresenceListProps) {
  const nicknames = getNicknames();
  const openChat = useChatHeads((s) => s.openChat);

  if (players.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {emptyMessage ?? "Nadie ha jugado esto en los últimos 7 días."}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {players.map(([uuid, entry]) => {
        const nickname = nicknames[uuid];
        const label = nickname || entry.username;
        const statusText = entry.online
          ? entry.playing
            ? "Jugando"
            : "En línea"
          : entry.lastSeen
            ? `Hace ${formatCompactAgo(entry.lastSeen)}`
            : "";

        return (
          <div key={uuid} className="flex items-center gap-2 text-sm min-h-[26px]">
            <PlayerAvatar uuid={uuid} username={entry.username} online={entry.online} />

            <button
              type="button"
              onClick={() => openChat(uuid)}
              className="text-white hover:text-accent truncate text-left transition-colors"
              aria-label={`Chat con ${label}`}
            >
              {label}
            </button>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{statusText}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerAvatar({ uuid, username, online }: { uuid: string; username: string; online: boolean }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <div className="relative shrink-0">
      <Avatar className="h-6 w-6 border border-white/10">
        {headUrl && <AvatarImage src={headUrl} alt={username} />}
        <AvatarFallback className="bg-accent/20 text-accent text-[10px] font-bold">
          {username?.charAt(0)?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card"
          aria-hidden
        />
      )}
    </div>
  );
}
