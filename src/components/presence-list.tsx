import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Check } from "lucide-react";
import type { PresenceEntry } from "@/services/presence";
import { getNicknames, setNickname } from "@/lib/nicknames";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface PresenceListProps {
  players: [string, PresenceEntry][];
  myUuid: string | null;
  /** Show the pencil to rename someone — only in the "Todos" dialog, not the quick popup. */
  editable?: boolean;
}

/** Row list shared by the home screen's presence popup and the "Todos" dialog —
 *  online status, "hace X" for recent-but-offline players, and (when editable)
 *  inline nickname editing (local-only, see src/lib/nicknames.ts for why it's
 *  not shared through Firebase). */
export function PresenceList({ players, myUuid, editable = false }: PresenceListProps) {
  const [nicknames, setNicknamesState] = useState<Record<string, string>>(() => getNicknames());
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const saveNickname = (uuid: string) => {
    setNicknamesState(setNickname(uuid, editValue));
    setEditingUuid(null);
  };

  if (players.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {editable ? "Nadie ha jugado esto todavía." : "Nadie ha jugado esto en los últimos 7 días."}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {players.map(([uuid, entry]) => {
        const isMe = uuid === myUuid;
        const nickname = nicknames[uuid];
        const label = isMe ? "Tú" : nickname || entry.username;
        const isEditing = editingUuid === uuid;

        return (
          <div key={uuid} className="flex items-center gap-2 text-sm min-h-[26px]">
            <div className="relative shrink-0">
              <Avatar className="h-6 w-6 border border-white/10">
                <AvatarImage src={`https://mc-heads.net/avatar/${uuid}/48`} alt={entry.username} />
                <AvatarFallback className="bg-accent/20 text-accent text-[10px] font-bold">
                  {entry.username?.charAt(0)?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              {entry.online && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card"
                  aria-hidden
                />
              )}
            </div>

            {isEditing ? (
              <>
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNickname(uuid);
                    if (e.key === "Escape") setEditingUuid(null);
                  }}
                  placeholder={entry.username}
                  className="h-6 text-xs px-2 bg-background/50 border-white/10 flex-1 min-w-0"
                />
                <button
                  type="button"
                  onClick={() => saveNickname(uuid)}
                  className="text-accent hover:text-accent/80 shrink-0"
                  aria-label="Guardar apodo"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="text-white truncate">{label}</span>
                {nickname && !isMe && (
                  <span className="text-xs text-muted-foreground truncate">({entry.username})</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {entry.online
                    ? "En línea"
                    : entry.lastSeen
                      ? `Hace ${formatDistanceToNow(entry.lastSeen, { locale: es })}`
                      : ""}
                </span>
                {editable && !isMe && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUuid(uuid);
                      setEditValue(nickname || "");
                    }}
                    className="text-muted-foreground hover:text-white shrink-0"
                    aria-label="Poner apodo"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
