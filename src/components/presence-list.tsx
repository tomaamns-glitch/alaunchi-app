import type { PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { formatCompactAgo } from "@/lib/format";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProfileBannerRow } from "@/components/profile-banner-row";
import { PlayerDecoratedIcon } from "@/components/icon-decoration";

interface PresenceListProps {
  players: [string, PresenceEntry][];
  /** Shown when players is empty — defaults to the per-modpack presence
   *  wording; PresenceButton's friends section passes its own (that default
   *  text talks about "playing this", which doesn't fit a friends list). */
  emptyMessage?: string;
  /** Each row wrapped in that player's profile banner (the friends section). */
  banners?: boolean;
}

/** Row list shared by the home screen's presence popup and the "Todos" dialog —
 *  online status, "hace X" for recent-but-offline players. Clicking someone's
 *  name opens a chat with them (bubble next to the players button; alias
 *  editing lives in the chat header now, not here). Callers filter the
 *  current user out of `players` before calling this — you never see
 *  yourself listed here. */
export function PresenceList({ players, emptyMessage, banners = false }: PresenceListProps) {
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
    <div className={banners ? "space-y-2.5" : "space-y-1.5"}>
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

        if (banners) {
          return (
            <BannerRow
              key={uuid}
              uuid={uuid}
              entry={entry}
              label={label}
              statusText={statusText}
              onOpenChat={() => openChat(uuid)}
            />
          );
        }

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

/** Friends row: the player's profile banner + frame, the whole row opens the chat. */
function BannerRow({
  uuid,
  entry,
  label,
  statusText,
  onOpenChat,
}: {
  uuid: string;
  entry: PresenceEntry;
  label: string;
  statusText: string;
  onOpenChat: () => void;
}) {
  return (
    <ProfileBannerRow uuid={uuid} onClick={onOpenChat} ariaLabel={`Chat con ${label}`} className="h-12">
      <PlayerAvatar uuid={uuid} username={entry.username} online={entry.online} large />
      <span className="text-sm font-medium text-white truncate drop-shadow">{label}</span>
      <span className="ml-auto shrink-0 text-xs text-gray-200 drop-shadow">{statusText}</span>
    </ProfileBannerRow>
  );
}

function PlayerAvatar({
  uuid,
  username,
  online,
  large = false,
}: {
  uuid: string;
  username: string;
  online: boolean;
  /** Banner rows: bigger head and dot. */
  large?: boolean;
}) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <div className="relative shrink-0">
      <PlayerDecoratedIcon uuid={uuid} size={large ? 32 : 24} radius={6}>
        <Avatar className={`${large ? "h-8 w-8" : "h-6 w-6"} rounded-md border border-white/10`}>
          {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
          <AvatarFallback className="rounded-md bg-accent/20 text-accent text-[10px] font-bold">
            {username?.charAt(0)?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
      </PlayerDecoratedIcon>
      {online && (
        <span
          className={`absolute z-[2] -bottom-0.5 -right-0.5 rounded-full bg-green-400 border-card ${large ? "h-2.5 w-2.5 border-2" : "h-2 w-2 border"}`}
          aria-hidden
        />
      )}
    </div>
  );
}
