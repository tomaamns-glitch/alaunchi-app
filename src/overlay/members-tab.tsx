import { useEffect, useMemo, useState } from "react";
import { Search, Users, MessageCircle } from "lucide-react";
import { subscribePresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { formatCompactAgo, formatPlaytime } from "@/lib/format";
import { ProfileBannerRow } from "@/components/profile-banner-row";
import type { OverlayState } from "@/services/electron";
import { useOverlayStore } from "./overlay-store";
import { EmptyState, Field, PlayerHead, Skeleton } from "./ui";
import { cn } from "@/lib/utils";

type Instance = NonNullable<OverlayState["instance"]>;

function SectionLabel({ children, count }: { children: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
      <span>{children}</span>
      <span className="font-medium tabular-nums">{count}</span>
    </div>
  );
}

function MemberRow({ uuid, entry, name, isMe }: { uuid: string; entry: PresenceEntry; name: string; isMe: boolean }) {
  const activity = useOverlayStore((s) => s.activity[uuid]);
  const openChat = useOverlayStore((s) => s.openChat);
  const appOpen = !!activity && activity.status !== "offline";
  const ago = entry.lastSeen > 0 ? formatCompactAgo(entry.lastSeen) : null;

  return (
    <ProfileBannerRow uuid={uuid} className="h-14" onClick={isMe ? undefined : () => openChat(uuid, entry.username)} ariaLabel={`Hablar con ${name}`}>
      <PlayerHead uuid={uuid} name={name} size={32} status={entry.online ? "playing" : appOpen ? "online" : "offline"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white drop-shadow">
          {name}
          {isMe && <span className="font-normal text-gray-300"> (tú)</span>}
        </p>
        <p className="truncate text-[11px] text-gray-300 drop-shadow">
          {entry.playtimeMs ? formatPlaytime(entry.playtimeMs) : "Sin partidas registradas"}
        </p>
      </div>
      {entry.online ? (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Jugando
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          {!isMe && <MessageCircle className="h-3.5 w-3.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />}
          {ago && (
            <span className="text-[10px] text-gray-200 drop-shadow" title="Última vez que jugó a esta instancia">
              {ago === "ahora" ? "ahora" : `hace ${ago}`}
            </span>
          )}
        </span>
      )}
    </ProfileBannerRow>
  );
}

/** "Participantes" of an online instance — the same presence/{modpackId}
 *  roster as the launcher's panel (instance-members-panel.tsx): playing now
 *  first, then by how recently each one played. */
export function MembersTab({ instance, entries }: { instance: Instance; entries?: Record<string, PresenceEntry> }) {
  const me = useOverlayStore((s) => s.me);
  const [members, setMembers] = useState<Record<string, PresenceEntry> | null>(entries ?? null);
  const [query, setQuery] = useState("");
  const nicknames = useMemo(() => getNicknames(), []);

  // `entries` overrides the live roster (design previews), like InstanceMembersPanel.
  useEffect(() => {
    if (entries) return;
    setMembers(null);
    return subscribePresence(instance.modpackId, setMembers);
  }, [instance.modpackId, entries]);

  const { playing, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const roster = (members ? sortAllPresence(members) : [])
      .map(([uuid, e]) => ({ uuid, e, name: nicknames[uuid] || e.username || "Jugador" }))
      .filter(({ name, e }) => !q || name.toLowerCase().includes(q) || (e.username || "").toLowerCase().includes(q));
    return { playing: roster.filter((r) => r.e.online), rest: roster.filter((r) => !r.e.online) };
  }, [members, nicknames, query]);

  if (members === null) {
    return (
      <div className="space-y-2 px-4 pt-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const total = Object.keys(members).length;
  if (!total) {
    return (
      <EmptyState icon={Users} title="Todavía no hay participantes">
        Aquí saldrá todo el que juegue a {instance.name}.
      </EmptyState>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-1 pt-1">
        <Field icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar participante" />
      </div>
      <div className="overlay-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {playing.length === 0 && rest.length === 0 && <p className="py-10 text-center text-xs text-gray-500">Nadie con ese nombre.</p>}
        {playing.length > 0 && (
          <>
            <SectionLabel count={playing.length}>Jugando ahora</SectionLabel>
            <div className="space-y-1.5">
              {playing.map((r) => (
                <MemberRow key={r.uuid} uuid={r.uuid} entry={r.e} name={r.name} isMe={r.uuid === me?.uuid} />
              ))}
            </div>
          </>
        )}
        {rest.length > 0 && (
          <>
            <SectionLabel count={rest.length}>Desconectados</SectionLabel>
            <div className={cn("space-y-1.5")}>
              {rest.map((r) => (
                <MemberRow key={r.uuid} uuid={r.uuid} entry={r.e} name={r.name} isMe={r.uuid === me?.uuid} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
