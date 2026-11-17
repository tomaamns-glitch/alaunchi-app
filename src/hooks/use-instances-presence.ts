import { useEffect, useMemo, useState } from "react";
import { isActive, subscribePresence, withAway, type PresenceEntry } from "@/services/presence";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import type { Modpack } from "@/services/github";

/** Live `presence/{modpackId}` roster of several online instances at once,
 *  keyed by modpack id (Inicio's drawer view: per-tile counts + "Jugando
 *  ahora"). Past instances (outOfNetwork) are skipped — nobody plays them. */
export function useInstancesPresence(packs: Modpack[]): Record<string, Record<string, PresenceEntry>> {
  const ids = useMemo(
    () => [...new Set(packs.filter((p) => !p.outOfNetwork).map((p) => p.id))].sort(),
    [packs]
  );
  const idsKey = ids.join("\n");
  const [byPack, setByPack] = useState<Record<string, Record<string, PresenceEntry>>>({});
  // "Ausente" comes from userActivity; merged in so playingNow leaves them out.
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  const watching = ids.length > 0;
  useEffect(() => (watching ? subscribeAllActivity(setActivity) : undefined), [watching]);

  useEffect(() => {
    setByPack({});
    const offs = ids.map((id) =>
      subscribePresence(id, (entries) => setByPack((prev) => ({ ...prev, [id]: entries })))
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return useMemo(() => {
    const out: Record<string, Record<string, PresenceEntry>> = {};
    for (const [id, entries] of Object.entries(byPack)) out[id] = withAway(entries, activity);
    return out;
  }, [byPack, activity]);
}

/** Who is playing an instance right now (presence `online`), yourself and
 *  anyone "Ausente" excluded — away never counts as activity. */
export function playingNow(entries: Record<string, PresenceEntry> | undefined, myUuid: string | null | undefined) {
  return Object.entries(entries ?? {}).filter(([uuid, e]) => isActive(e) && uuid !== myUuid);
}
