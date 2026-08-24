import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User } from "lucide-react";
import { subscribePresence, sortAndFilterPresence, sortAllPresence, type PresenceEntry } from "@/services/presence";
import { getNicknames } from "@/lib/nicknames";
import { useAuth } from "@/hooks/use-auth";
import { focusWindow } from "@/services/electron";
import { PresenceList } from "@/components/presence-list";
import { PresenceAllDialog } from "@/components/presence-all-dialog";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";

interface PresenceButtonProps {
  modpackId: string;
  packName: string;
  /** Controlled so it can be mutually exclusive with the skin panel — see home.tsx. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Native OS notification (works even with the window hidden in the tray —
 *  see the close-to-tray behavior in main.js) so a friend connecting doesn't
 *  go unnoticed just because the launcher isn't in the foreground. */
function notifyConnected(name: string, packName: string) {
  if (typeof Notification === "undefined") return;
  const n = new Notification("ALaunchi", { body: `${name} se ha conectado a ${packName}` });
  n.onclick = () => focusWindow();
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
 *  popup panel above it. Shows a green dot whenever someone else is online for
 *  the pack currently showing in the carousel, and announces it once, the
 *  first time you land on that pack while they're playing. */
export function PresenceButton({ modpackId, packName, open, onOpenChange }: PresenceButtonProps) {
  const myUuid = useAuth((s) => s.uuid);
  const [entries, setEntries] = useState<Record<string, PresenceEntry>>({});
  const showAll = useHeaderOverlay((s) => s.active === "presence-all");
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const announcedForRef = useRef<string | null>(null);
  // null = no snapshot seen yet for the current modpackId, so the *next* diff
  // is "who was already online when I arrived" (handled by the arrival
  // announcement below), not a fresh connection worth a notification.
  const prevOnlineRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    onOpenChange(false);
    prevOnlineRef.current = null;
    return subscribePresence(modpackId, setEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modpackId]);

  const players = sortAndFilterPresence(entries);
  const onlineOthers = players.filter(([uuid, e]) => e.online && uuid !== myUuid);

  useEffect(() => {
    if (announcedForRef.current === modpackId || onlineOthers.length === 0) return;
    announcedForRef.current = modpackId;
    setAnnouncement(formatAnnouncement(onlineOthers, getNicknames()));
    const t = setTimeout(() => setAnnouncement(null), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modpackId, onlineOthers.length]);

  // Live "just connected" alerts for the rest of the time you're already
  // sitting on this pack — separate from the one-shot arrival announcement.
  useEffect(() => {
    const currentUuids = new Set(onlineOthers.map(([uuid]) => uuid));
    const previousUuids = prevOnlineRef.current;
    if (previousUuids) {
      const nicknames = getNicknames();
      for (const [uuid, entry] of onlineOthers) {
        if (!previousUuids.has(uuid)) notifyConnected(nicknames[uuid] || entry.username, packName);
      }
    }
    prevOnlineRef.current = currentUuids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modpackId, onlineOthers.map(([uuid]) => uuid).join(",")]);

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
        {announcement && !open && (
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
            className="absolute bottom-full left-0 mb-2 z-40 w-72 p-4 rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Jugadores</p>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  openOverlay("presence-all");
                }}
                className="text-xs font-semibold text-accent hover:text-accent/80"
              >
                Todos
              </button>
            </div>
            <PresenceList players={players} myUuid={myUuid} />
          </motion.div>
        )}
      </AnimatePresence>

      {showAll && (
        <PresenceAllDialog players={sortAllPresence(entries)} myUuid={myUuid} onClose={closeOverlay} />
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
          {onlineOthers.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card" />
          )}
        </span>
      </button>
    </div>
  );
}
