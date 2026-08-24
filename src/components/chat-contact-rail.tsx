import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { cn } from "@/lib/utils";

interface ChatContactRailProps {
  myUuid: string;
  currentPackId: string;
  selectedUuid: string;
}

/** Right-hand sidebar of the chat window — existing conversations, collapsible
 *  down to just head icons, plus a picker to start a new one from whoever has
 *  played the modpack currently open. */
export function ChatContactRail({ myUuid, currentPackId, selectedUuid }: ChatContactRailProps) {
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const openChat = useChatHeads((s) => s.openChat);
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({});
  const [nicknames] = useState(() => getNicknames());

  useEffect(() => subscribePresence(currentPackId, setPresence), [currentPackId]);

  const contacts = Object.entries(chatIndex).sort(
    ([, a], [, b]) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0)
  );
  const roster = sortAllPresence(presence).filter(([uuid]) => uuid !== myUuid);

  return (
    <div className={cn("shrink-0 border-l border-white/10 flex flex-col min-h-0", expanded ? "w-44" : "w-14")}>
      <div className="flex items-center justify-between p-2 border-b border-white/10">
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          title="Añadir jugador"
          className="h-7 w-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Contraer" : "Expandir"}
          className="h-7 w-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
        >
          {expanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {showAdd && (
        <div className="border-b border-white/10 max-h-48 overflow-y-auto">
          {roster.length === 0 ? (
            <p className="text-[10px] text-muted-foreground p-2 text-center">Nadie ha jugado esto todavía.</p>
          ) : (
            roster.map(([uuid, entry]) => (
              <button
                key={uuid}
                type="button"
                onClick={() => {
                  openChat(uuid);
                  setShowAdd(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 transition-colors"
              >
                <ContactHead uuid={uuid} username={entry.username} online={entry.online} size={22} />
                {expanded && <span className="text-xs text-gray-200 truncate">{entry.username}</span>}
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {contacts.map(([uuid, entry]) => (
          <button
            key={uuid}
            type="button"
            onClick={() => openChat(uuid)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors",
              uuid === selectedUuid ? "bg-accent/15" : "hover:bg-white/5"
            )}
          >
            <ContactHead uuid={uuid} username={entry.otherUsername} online={presence[uuid]?.online} size={28} />
            {expanded && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{nicknames[uuid] || entry.otherUsername}</p>
                {nicknames[uuid] && (
                  <p className="text-[10px] text-muted-foreground truncate">{entry.otherUsername}</p>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContactHead({
  uuid,
  username,
  online,
  size,
}: {
  uuid: string;
  username: string;
  online?: boolean;
  size: number;
}) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar className="h-full w-full">
        {headUrl && <AvatarImage src={headUrl} alt={username} />}
        <AvatarFallback className="bg-accent/20 text-accent text-[10px] font-bold">
          {username?.charAt(0)?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card" />
      )}
    </div>
  );
}
