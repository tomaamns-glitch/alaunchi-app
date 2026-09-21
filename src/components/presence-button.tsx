import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User } from "lucide-react";
import { subscribePresence, sortAndFilterPresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { subscribeFriends, type FriendEntry } from "@/services/friends";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { getNicknames } from "@/lib/nicknames";
import { toPresenceEntries } from "@/lib/friend-presence";
import type { ChatMode } from "@/lib/instance-context";
import { useAuth } from "@/hooks/use-auth";
import { focusWindow, getAppIconDataUrl } from "@/services/electron";
import { PresenceList } from "@/components/presence-list";
import { PresenceAllDialog } from "@/components/presence-all-dialog";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";
import { getPlayerHeadDataUrl } from "@/hooks/use-player-head";
import { playNotificationSound } from "@/lib/notification-sound";

interface PresenceButtonProps {
  /** "general" (the Hub — no single modpack in view, only the friends
   *  section makes sense) or "carousel" (the home carousel's current pack —
   *  friends plus who else is playing that specific instance). */
  context: ChatMode;
  /** Controlled so it can be mutually exclusive with the skin panel — see home.tsx. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A friend counts as "recent" here if seen within this window — separate
 *  from presence.ts's PRESENCE_RECENT_WINDOW_MS (7 days), which is about a
 *  specific modpack's roster, not friends in general. */
const FRIEND_RECENT_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Native OS notification (works even with the window hidden in the tray —
 *  see the close-to-tray behavior in main.js) so a friend connecting doesn't
 *  go unnoticed just because the launcher isn't in the foreground. Skipped
 *  while the window is focused (you'd see the green dot right there) and
 *  always requested silent — see notifyNewMessage in use-chat-heads.ts.
 *  Only used for the carousel-instance section (see context above) — a
 *  friend coming online in general doesn't get this treatment (yet). */
async function notifyConnected(uuid: string, name: string, packName: string) {
  if (typeof Notification === "undefined" || document.hasFocus()) return;
  const icon = (await getPlayerHeadDataUrl(uuid).catch(() => null)) || (await getAppIconDataUrl().catch(() => null));
  const n = new Notification("ALaunchi", { body: `${name} se ha conectado a ${packName}`, icon: icon ?? undefined, silent: true });
  n.onclick = () => focusWindow();
  playNotificationSound();
}

function formatAnnouncement(onlineOthers: [string, PresenceEntry][], nicknames: Record<string, string>): string {
  const [featuredUuid, featuredEntry] = onlineOthers[Math.floor(Math.random() * onlineOthers.length)];
  const name = nicknames[featuredUuid] || featuredEntry.username;
  const restCount = onlineOthers.length - 1;
  if (restCount === 0) return `${name} está jugando`;
  const personas = restCount === 1 ? "persona" : "personas";
  return `${name} y ${restCount} ${personas} más están jugando`;
}

/** Same visual language as the avatar/skin button — a pill icon button with a
 *  popup panel above it. Always shows a friends section (online now, or seen
 *  within the last 12h); in carousel context, also shows who else is playing
 *  that specific instance (green dot + one-shot arrival announcement +
 *  native notification, same as before — scoped to that section only). */
export function PresenceButton({ context, open, onOpenChange }: PresenceButtonProps) {
  const myUuid = useAuth((s) => s.uuid);
  const showFriendsAll = useHeaderOverlay((s) => s.active === "presence-all-friends");
  const showInstanceAll = useHeaderOverlay((s) => s.active === "presence-all-instance");
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);

  // Friends section — always active, independent of context. Friends can't
  // include yourself by construction, no filtering needed here.
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  useEffect(() => {
    if (!myUuid) return;
    return subscribeFriends(myUuid, setFriends);
  }, [myUuid]);
  useEffect(() => subscribeAllActivity(setActivity), []);

  const allFriendEntries = useMemo(() => toPresenceEntries(friends, activity), [friends, activity]);
  const allFriendsSorted = sortAllPresence(allFriendEntries);
  const recentFriends = allFriendsSorted.filter(
    ([, e]) => e.online || (e.lastSeen && Date.now() - e.lastSeen < FRIEND_RECENT_WINDOW_MS)
  );
  const friendsOnlineCount = allFriendsSorted.filter(([, e]) => e.online).length;

  // Instance section — only meaningful in carousel context.
  const instancePack = context.type === "carousel" ? context.pack : null;
  const [instanceEntries, setInstanceEntries] = useState<Record<string, PresenceEntry>>({});
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const announcedForRef = useRef<string | null>(null);
  // null = no snapshot seen yet for the current instance, so the *next* diff
  // is "who was already online when I arrived" (handled by the arrival
  // announcement below), not a fresh connection worth a notification.
  const prevOnlineRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    onOpenChange(false);
    prevOnlineRef.current = null;
    if (!instancePack) {
      setInstanceEntries({});
      return;
    }
    return subscribePresence(instancePack.id, setInstanceEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instancePack?.id]);

  // Excludes ourselves — this panel never lists the current user.
  const instancePlayers = instancePack
    ? sortAndFilterPresence(instanceEntries).filter(([uuid]) => uuid !== myUuid)
    : [];
  const onlineOthers = instancePlayers.filter(([, e]) => e.online);

  useEffect(() => {
    if (!instancePack) return;
    if (announcedForRef.current === instancePack.id || onlineOthers.length === 0) return;
    announcedForRef.current = instancePack.id;
    setAnnouncement(formatAnnouncement(onlineOthers, getNicknames()));
    const t = setTimeout(() => setAnnouncement(null), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instancePack?.id, onlineOthers.length]);

  // Live "just connected" alerts for the rest of the time you're already
  // sitting on this pack — separate from the one-shot arrival announcement.
  useEffect(() => {
    if (!instancePack) return;
    const currentUuids = new Set(onlineOthers.map(([uuid]) => uuid));
    const previousUuids = prevOnlineRef.current;
    if (previousUuids) {
      const nicknames = getNicknames();
      for (const [uuid, entry] of onlineOthers) {
        if (!previousUuids.has(uuid)) notifyConnected(uuid, nicknames[uuid] || entry.username, instancePack.name).catch(() => {});
      }
    }
    prevOnlineRef.current = currentUuids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instancePack?.id, onlineOthers.map(([uuid]) => uuid).join(",")]);

  const hasAnyoneOnline = friendsOnlineCount > 0 || onlineOthers.length > 0;

  return (
    <div className="relative">
      {open && (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}

      <AnimatePresence>
        {announcement && !open && instancePack && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-3 z-40 whitespace-nowrap px-3 py-2 rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl text-xs text-white"
          >
            {announcement}
            <span className="absolute top-full left-5 -mt-1 h-2 w-2 rotate-45 bg-card/95 border-b border-r border-white/10" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 z-40 w-72 p-4 rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto space-y-4"
          >
            <div>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  openOverlay("presence-all-friends");
                }}
                title="Ver todos los amigos"
                className="block mb-2 text-xs font-semibold text-muted-foreground hover:text-accent uppercase tracking-wide text-left transition-colors"
              >
                Amigos
              </button>
              <PresenceList players={recentFriends} emptyMessage="Ningún amigo conectado recientemente." />
            </div>

            {instancePack && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    openOverlay("presence-all-instance");
                  }}
                  title={`Ver todos en ${instancePack.name}`}
                  className="block mb-2 text-xs font-semibold text-muted-foreground hover:text-accent uppercase tracking-wide text-left transition-colors"
                >
                  {instancePack.name}
                </button>
                <PresenceList players={instancePlayers} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {showFriendsAll && (
        <PresenceAllDialog
          title="Amigos"
          players={allFriendsSorted}
          emptyMessage="Todavía no tienes amigos añadidos."
          onClose={closeOverlay}
        />
      )}
      {showInstanceAll && instancePack && (
        <PresenceAllDialog title={instancePack.name} players={instancePlayers} onClose={closeOverlay} />
      )}

      <button
        type="button"
        onClick={() => {
          onOpenChange(!open);
          setAnnouncement(null);
        }}
        aria-label="Jugadores en línea"
        className="relative z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
      >
        <span className="relative flex items-center justify-center h-6 w-6">
          <User className="h-4 w-4 text-gray-300" />
          {hasAnyoneOnline && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card" />
          )}
        </span>
      </button>
    </div>
  );
}
