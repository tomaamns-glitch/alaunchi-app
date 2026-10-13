import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Users } from "lucide-react";
import { Head } from "@/components/player-picker";
import { ProfileBannerRow } from "@/components/profile-banner-row";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { formatCompactAgo, formatPlaytime } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { cn } from "@/lib/utils";

/**
 * "Participantes" panel on the online instance page (left column, above
 * Novedades; a footer popover when the window is narrow): everyone who has
 * played this instance —
 * the same `presence/{modpackId}` roster the group chat and the players panel
 * use — online first, then by last seen. `entries` overrides the live roster
 * (dev example pack).
 */
export function InstanceMembersPanel({
  modpackId,
  entries,
  collapsed = false,
  onToggleCollapsed,
  className,
}: {
  modpackId: string;
  entries?: Record<string, PresenceEntry>;
  /** Only the header shows (the page's left column). */
  collapsed?: boolean;
  /** Shows the minimize/expand button in the header. */
  onToggleCollapsed?: () => void;
  className?: string;
}) {
  const [members, setMembers] = useState<Record<string, PresenceEntry> | null>(entries ?? null);
  // Whether each one has ALaunchi open (green dot) — `online` in the roster
  // only means "playing this instance right now".
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  useEffect(() => subscribeAllActivity(setActivity), []);
  const [nicknames] = useState(() => getNicknames());
  const myUuid = useAuth((s) => s.uuid);

  useEffect(() => {
    if (entries) return;
    setMembers(null);
    return subscribePresence(modpackId, setMembers);
  }, [modpackId, entries]);

  const roster = useMemo(() => (members ? sortAllPresence(members) : []), [members]);

  return (
    <aside className={cn("flex flex-col rounded-md border border-white/10 bg-gray-500/10 backdrop-blur-md overflow-hidden", className)}>
      <div className={cn("shrink-0 flex items-center gap-2 px-4 py-3", !collapsed && "border-b border-white/5")}>
        <Users className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">Participantes</h3>
        {members && (
          <span className="ml-auto text-[11px] text-muted-foreground">{roster.length}</span>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "Desplegar" : "Minimizar"}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0",
              !members && "ml-auto"
            )}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
          </button>
        )}
      </div>

      {!collapsed && (
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {members === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : roster.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">Todavía nadie ha jugado a esta instancia.</p>
        ) : (
          roster.map(([uuid, e]) => {
            const name = nicknames[uuid] || e.username;
            const status = activity[uuid]?.status;
            const connected = e.online || (!!status && status !== "offline");
            const ago = e.lastSeen > 0 ? formatCompactAgo(e.lastSeen) : null;
            return (
              // Styled like their profile card (banner + frame), like the friends panel.
              <ProfileBannerRow key={uuid} uuid={uuid} className="h-14">
                <div className="relative shrink-0">
                  <Head uuid={uuid} username={e.username} className="h-8 w-8 border border-white/10" />
                  <span
                    title={connected ? "Conectado" : "Desconectado"}
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                      connected ? "bg-green-500" : "bg-gray-500"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate drop-shadow">
                    {name}
                    {uuid === myUuid && <span className="font-normal text-gray-300"> (tú)</span>}
                  </div>
                  <div className="text-[11px] text-gray-300 truncate drop-shadow">
                    {e.playtimeMs ? formatPlaytime(e.playtimeMs) : "Sin partidas registradas"}
                  </div>
                </div>
                {/* Playing this instance now, or how long since they last did. */}
                {e.online ? (
                  <span className="shrink-0 text-[11px] font-medium text-green-400 drop-shadow">Jugando</span>
                ) : (
                  ago && (
                    <span className="shrink-0 text-[10px] text-gray-200 drop-shadow" title="Última vez que jugó a esta instancia">
                      {ago === "ahora" ? "ahora" : `hace ${ago}`}
                    </span>
                  )
                )}
              </ProfileBannerRow>
            );
          })
        )}
      </div>
      )}
    </aside>
  );
}
