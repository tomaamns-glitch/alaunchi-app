import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { isBlockedEitherWay } from "@/hooks/use-blocks";
import { subscribePresence, type PresenceEntry } from "@/services/presence";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { getNicknames } from "@/lib/nicknames";
import { isAppVisible, notifyUser } from "@/lib/notify";
import { notify } from "@/lib/toast";

/** How long to wait after someone starts playing before deciding to notify:
 *  their "Ausente" flag is written right after the playing state
 *  (user-activity.ts reapplyAway), so deciding on the first snapshot would
 *  notify for away players too. */
const SETTLE_MS = 2500;
/** One notice per player and instance in this window — a crash and relaunch
 *  (or a few quick restarts while fixing mods) shouldn't ping everyone again. */
const COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Mounted once in App.tsx. When another participant of one of your online
 * instances opens it (presence/{modpackId}/{uuid}.online turns true), you get
 * the usual notice: sound, plus an in-app toast with the launcher on screen
 * or a Windows notification when it's minimized/in the tray (notifyUser).
 *
 * Not when that player is "Ausente" (userActivity/{uuid}/away), not for
 * yourself, not for people you've muted in the chat, and not for whoever was
 * already playing when the app (or that instance's watch) started — only
 * changes seen live count.
 */
export function InstanceJoinWatcher() {
  const myUuid = useAuth((s) => s.uuid);
  const modpacks = useModpacks((s) => s.modpacks);
  // Online instances only (catalog packs with a repo); a stable key so a
  // catalog reload with the same packs doesn't tear the watches down.
  const packs = useMemo(
    () => modpacks.filter((p) => p.repoUrl && !p.outOfNetwork).map((p) => ({ id: p.id, name: p.name })),
    [modpacks]
  );
  const packsKey = packs.map((p) => p.id).join("|");
  const namesRef = useRef(new Map<string, string>());
  namesRef.current = new Map(packs.map((p) => [p.id, p.name]));

  // Everyone's activity, read when deciding (away or not).
  const activityRef = useRef<Record<string, UserActivity>>({});
  useEffect(() => subscribeAllActivity((all) => (activityRef.current = all)), []);

  const lastNoticeRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!myUuid || packs.length === 0) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubs = packs.map(({ id }) => {
      // null until the first snapshot: who's already playing then isn't news.
      let prevOnline: Set<string> | null = null;
      let latest: Record<string, PresenceEntry> = {};
      return subscribePresence(id, (entries) => {
        latest = entries;
        const online = new Set(Object.keys(entries).filter((uuid) => uuid !== myUuid && entries[uuid]?.online));
        if (prevOnline) {
          for (const uuid of online) {
            if (prevOnline.has(uuid)) continue;
            const t = setTimeout(() => {
              timers.delete(t);
              const entry = latest[uuid];
              if (!entry?.online) return; // already gone again
              const activity = activityRef.current[uuid];
              if (activity?.away && activity.status !== "offline") return;
              if (useChatHeads.getState().mutedUuids.has(uuid) || isBlockedEitherWay(uuid)) return;
              const key = `${id}:${uuid}`;
              const last = lastNoticeRef.current.get(key) ?? 0;
              if (Date.now() - last < COOLDOWN_MS) return;
              lastNoticeRef.current.set(key, Date.now());
              const name = getNicknames()[uuid] || entry.username || "Alguien";
              const packName = namesRef.current.get(id) ?? id;
              const body = `${name} ha abierto ${packName}`;
              if (isAppVisible()) notify(body);
              notifyUser({ title: "ALaunchi", body, iconUuid: uuid }).catch(() => {});
            }, SETTLE_MS);
            timers.add(t);
          }
        }
        prevOnline = online;
      });
    });
    return () => {
      for (const u of unsubs) u();
      for (const t of timers) clearTimeout(t);
    };
    // packsKey stands for `packs` (same ids → same watches).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUuid, packsKey]);

  return null;
}
