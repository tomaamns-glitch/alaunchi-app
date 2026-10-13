import { useEffect, useMemo, useState } from "react";
import { subscribePresence, type PresenceEntry } from "@/services/presence";
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

  useEffect(() => {
    setByPack({});
    const offs = ids.map((id) =>
      subscribePresence(id, (entries) => setByPack((prev) => ({ ...prev, [id]: entries })))
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return byPack;
}

/** Who is playing an instance right now (presence `online`), yourself excluded. */
export function playingNow(entries: Record<string, PresenceEntry> | undefined, myUuid: string | null | undefined) {
  return Object.entries(entries ?? {}).filter(([uuid, e]) => e.online && uuid !== myUuid);
}
