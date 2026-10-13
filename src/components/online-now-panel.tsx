import { useState } from "react";
import { Users } from "lucide-react";
import { Head } from "@/components/player-picker";
import { getNicknames } from "@/lib/nicknames";
import { playingNow } from "@/hooks/use-instances-presence";
import type { PresenceEntry } from "@/services/presence";
import type { Modpack } from "@/services/github";

/**
 * Right side of Inicio's drawer view: everyone playing one of your online
 * instances right now, grouped by instance (only instances with someone in
 * them). Clicking an instance opens its page.
 */
export function OnlineNowPanel({
  packs,
  presence,
  myUuid,
  onOpenPack,
}: {
  packs: Modpack[];
  presence: Record<string, Record<string, PresenceEntry>>;
  myUuid: string | null | undefined;
  onOpenPack: (pack: Modpack) => void;
}) {
  const [nicknames] = useState(() => getNicknames());
  const groups = packs
    .filter((p) => !p.outOfNetwork)
    .map((pack) => ({
      pack,
      players: playingNow(presence[pack.id], myUuid).sort(([, a], [, b]) => a.username.localeCompare(b.username)),
    }))
    .filter((g) => g.players.length > 0)
    .sort((a, b) => b.players.length - a.players.length || a.pack.name.localeCompare(b.pack.name));
  const total = groups.reduce((n, g) => n + g.players.length, 0);

  return (
    <aside className="flex flex-col max-h-full rounded-xl border border-white/10 bg-card/40 backdrop-blur-md overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Users className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">Jugando ahora</h3>
        {total > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {total}
          </span>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto p-2 space-y-2">
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">
            Nadie está jugando a tus instancias online ahora mismo.
          </p>
        ) : (
          groups.map(({ pack, players }) => (
            <div key={pack.id}>
              <button
                type="button"
                onClick={() => onOpenPack(pack)}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors text-left"
              >
                {pack.imageUrl ? (
                  <img src={pack.imageUrl} alt="" draggable={false} className="h-5 w-5 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                    {pack.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-semibold text-gray-200 truncate">{pack.name}</span>
                <span className="ml-auto text-[11px] text-green-400 shrink-0">{players.length}</span>
              </button>
              <div className="space-y-0.5">
                {players.map(([uuid, e]) => (
                  <div key={uuid} className="flex items-center gap-2.5 rounded-md px-2 py-1 pl-4">
                    <div className="relative shrink-0">
                      <Head uuid={uuid} username={e.username} className="h-7 w-7" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
                    </div>
                    <span className="text-sm text-gray-100 truncate">{nicknames[uuid] || e.username}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
