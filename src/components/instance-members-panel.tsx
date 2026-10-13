import { useEffect, useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Head } from "@/components/player-picker";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { formatCompactAgo, formatPlaytime } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

/**
 * Vertical "Participantes" panel on the online instance page (left side,
 * mirroring Novedades on the right): everyone who has played this instance —
 * the same `presence/{modpackId}` roster the group chat and the players panel
 * use — online first, then by last seen. `entries` overrides the live roster
 * (dev example pack).
 */
export function InstanceMembersPanel({ modpackId, entries }: { modpackId: string; entries?: Record<string, PresenceEntry> }) {
  const [members, setMembers] = useState<Record<string, PresenceEntry> | null>(entries ?? null);
  const [nicknames] = useState(() => getNicknames());
  const myUuid = useAuth((s) => s.uuid);

  useEffect(() => {
    if (entries) return;
    setMembers(null);
    return subscribePresence(modpackId, setMembers);
  }, [modpackId, entries]);

  const roster = useMemo(() => (members ? sortAllPresence(members) : []), [members]);
  const onlineCount = roster.filter(([, e]) => e.online).length;

  return (
    <aside className="h-full flex flex-col rounded-md border border-white/10 bg-gray-500/10 backdrop-blur-md overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Users className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">Participantes</h3>
        {members && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {roster.length}
            {onlineCount > 0 && <span className="text-green-400"> · {onlineCount} en línea</span>}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {members === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : roster.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">Todavía nadie ha jugado a esta instancia.</p>
        ) : (
          roster.map(([uuid, e]) => {
            const name = nicknames[uuid] || e.username;
            return (
              <div key={uuid} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors">
                <div className="relative shrink-0">
                  <Head uuid={uuid} username={e.username} className="h-8 w-8" />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                      e.online ? "bg-green-500" : "bg-gray-500"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-100 truncate">
                    {name}
                    {uuid === myUuid && <span className="text-muted-foreground"> (tú)</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {e.online ? (
                      <span className="text-green-400">Jugando ahora</span>
                    ) : e.playtimeMs ? (
                      formatPlaytime(e.playtimeMs)
                    ) : (
                      "Sin partidas registradas"
                    )}
                  </div>
                </div>
                {!e.online && e.lastSeen > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatCompactAgo(e.lastSeen)}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
