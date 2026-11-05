import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, MessageCircle, Stethoscope, UserPlus, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import { sortAllPresence } from "@/services/presence";
import {
  acceptFriendRequest,
  declineFriendRequest,
  subscribeFriends,
  subscribeIncomingRequests,
  type FriendEntry,
  type FriendRequestEntry,
} from "@/services/friends";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { toPresenceEntries } from "@/lib/friend-presence";
import { getNicknames } from "@/lib/nicknames";
import { useAuth } from "@/hooks/use-auth";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { PresenceList } from "@/components/presence-list";
import { getInstalledModpacksMeta, onInstanceCrashed } from "@/services/electron";
import { openCrashDiagnosis } from "@/lib/crash-diagnosis";
import { cn } from "@/lib/utils";

/** A friend counts as "recent" if seen within this window (same as the old Jugadores panel). */
const FRIEND_RECENT_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Crash streaks the player cleared from the panel (until the next streak). */
const DISMISSED_CRASHES_KEY = "alaunchi_activity_dismissed_crashes";

interface CrashItem {
  id: string;
  name: string;
  consecutive: number;
  streakStartedAt: number;
  lastCrashAt: number;
  lastReason: string;
  lastDescription: string | null;
}

function readDismissedCrashes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_CRASHES_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function timeAgo(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

function Head({ uuid, name }: { uuid: string; name: string }) {
  const url = usePlayerHeadUrl(uuid);
  return url ? (
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-md [image-rendering:pixelated]" />
  ) : (
    <div className="h-8 w-8 shrink-0 rounded-md bg-white/10 flex items-center justify-center text-xs font-bold text-muted-foreground">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function SectionTitle({ children, count, onClick }: { children: React.ReactNode; count?: number; onClick?: () => void }) {
  const Tag = onClick ? "button" : "p";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        onClick && "hover:text-accent transition-colors"
      )}
    >
      {children}
      {!!count && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 text-accent-foreground">{count}</span>}
    </Tag>
  );
}

/**
 * "Actividad" — replaces the old Jugadores button in the footers (far right).
 * A full-height side panel with notifications (pending friend requests, unread
 * chats, instances that keep crashing) and what friends are up to. The badge
 * counts the notifications. Controlled through useHeaderOverlay ("presence"),
 * so it stays mutually exclusive with the other footer popups.
 */
export function ActivityButton({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const myUuid = useAuth((s) => s.uuid);
  const myUsername = useAuth((s) => s.username);
  const openProfile = useHeaderOverlay((s) => s.openProfile);

  // Friends' activity (same data as the old Jugadores panel).
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  useEffect(() => {
    if (!myUuid) return;
    return subscribeFriends(myUuid, setFriends);
  }, [myUuid]);
  useEffect(() => subscribeAllActivity(setActivity), []);
  const friendsSorted = useMemo(() => sortAllPresence(toPresenceEntries(friends, activity)), [friends, activity]);
  const recentFriends = friendsSorted.filter(
    ([, e]) => e.online || (e.lastSeen && Date.now() - e.lastSeen < FRIEND_RECENT_WINDOW_MS)
  );
  const anyFriendOnline = friendsSorted.some(([, e]) => e.online);

  // Pending friend requests.
  const [requests, setRequests] = useState<Record<string, FriendRequestEntry>>({});
  useEffect(() => {
    if (!myUuid) return;
    return subscribeIncomingRequests(myUuid, setRequests);
  }, [myUuid]);
  const requestList = Object.entries(requests).sort(([, a], [, b]) => (b.sentAt || 0) - (a.sentAt || 0));
  const [answering, setAnswering] = useState<string | null>(null);
  const answer = async (uuid: string, username: string, accept: boolean) => {
    if (!myUuid) return;
    setAnswering(uuid);
    try {
      if (accept) await acceptFriendRequest(myUuid, myUsername ?? "", uuid, username);
      else await declineFriendRequest(myUuid, uuid);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo responder a la solicitud.");
    } finally {
      setAnswering(null);
    }
  };

  // Unread 1:1 chats (muted ones don't count, like their bubble).
  const chatIndex = useChatHeads((s) => s.chatIndex);
  const mutedUuids = useChatHeads((s) => s.mutedUuids);
  const openChat = useChatHeads((s) => s.openChat);
  const unreadChats = Object.entries(chatIndex)
    .filter(([uuid, e]) => (e.unreadCount || 0) > 0 && !mutedUuids.has(uuid))
    .sort(([, a], [, b]) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  // Instances in a crash streak (alaunchi-meta.json#crashStats).
  const [crashes, setCrashes] = useState<CrashItem[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissedCrashes);
  const loadCrashes = useCallback(async () => {
    try {
      const metas = await getInstalledModpacksMeta();
      const list: CrashItem[] = [];
      for (const [id, meta] of Object.entries(metas)) {
        const c = meta?.crashStats;
        if (!c || !(c.consecutive > 0)) continue;
        list.push({
          id,
          name: meta.name || id,
          consecutive: c.consecutive,
          streakStartedAt: c.streakStartedAt || 0,
          lastCrashAt: c.lastCrashAt || 0,
          lastReason: c.lastReason || "Se cerró por un error",
          lastDescription: c.lastDescription || null,
        });
      }
      setCrashes(list.sort((a, b) => b.lastCrashAt - a.lastCrashAt));
    } catch {}
  }, []);
  useEffect(() => {
    loadCrashes();
    return onInstanceCrashed(() => loadCrashes());
  }, [loadCrashes]);
  useEffect(() => {
    if (open) loadCrashes();
  }, [open, loadCrashes]);
  const visibleCrashes = crashes.filter((c) => !dismissed.includes(`${c.id}:${c.streakStartedAt}`));
  const dismissCrash = (c: CrashItem) => {
    const next = [...dismissed, `${c.id}:${c.streakStartedAt}`].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_CRASHES_KEY, JSON.stringify(next));
    } catch {}
  };

  const notificationCount = requestList.length + unreadChats.length + visibleCrashes.length;
  const nicknames = getNicknames();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  useDismissOnOutsideClick([rootRef, panelRef], () => onOpenChange(false), open);

  return (
    <div ref={rootRef} className="relative">
      {/* Portaled to <body>: the footers have backdrop-blur, and a `fixed` element
          inside one is positioned against the 80px footer instead of the window
          (the panel came out with a negative height — the button "did nothing"). */}
      {createPortal(
      <AnimatePresence>
        {open && (
          <motion.aside
            ref={panelRef}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            // Full height between the titlebar (h-11) and the footer (h-20), 8px off each.
            className="fixed right-6 top-[52px] bottom-[88px] z-40 w-96 flex flex-col rounded-md bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Zap className="h-4 w-4 text-accent" />
              <h2 className="font-semibold flex-1">Actividad</h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Cerrar"
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
              <section>
                <SectionTitle count={notificationCount}>Notificaciones</SectionTitle>
                {notificationCount === 0 ? (
                  <p className="text-xs text-muted-foreground">No tienes notificaciones.</p>
                ) : (
                  <div className="space-y-1.5">
                    {requestList.map(([uuid, r]) => (
                      <div key={`req-${uuid}`} className="flex items-center gap-3 rounded-md bg-white/[0.04] p-2">
                        <Head uuid={uuid} name={r.username} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{nicknames[uuid] || r.username}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <UserPlus className="h-3 w-3" /> Solicitud de amistad · {timeAgo(r.sentAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={answering === uuid}
                          onClick={() => answer(uuid, r.username, true)}
                          title="Aceptar"
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" strokeWidth={2.75} />
                        </button>
                        <button
                          type="button"
                          disabled={answering === uuid}
                          onClick={() => answer(uuid, r.username, false)}
                          title="Rechazar"
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
                        >
                          <X className="h-4 w-4" strokeWidth={2.75} />
                        </button>
                      </div>
                    ))}

                    {unreadChats.map(([uuid, c]) => (
                      <button
                        key={`chat-${uuid}`}
                        type="button"
                        onClick={() => openChat(uuid)}
                        className="w-full flex items-center gap-3 rounded-md bg-white/[0.04] p-2 text-left hover:bg-white/10 transition-colors"
                      >
                        <Head uuid={uuid} name={c.otherUsername} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{nicknames[uuid] || c.otherUsername}</p>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            <MessageCircle className="h-3 w-3 shrink-0" />
                            <span className="truncate">{c.lastMessage}</span>
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] leading-4 text-accent-foreground">
                          {c.unreadCount}
                        </span>
                      </button>
                    ))}

                    {visibleCrashes.map((c) => (
                      <div key={`crash-${c.id}`} className="flex items-start gap-3 rounded-md bg-red-500/10 p-2">
                        <div className="h-8 w-8 shrink-0 rounded-md bg-red-500/15 text-red-400 flex items-center justify-center">
                          <Stethoscope className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {c.name} {c.consecutive === 1 ? "ha crasheado" : `ha crasheado ${c.consecutive} veces`}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {c.lastDescription || c.lastReason} · {timeAgo(c.lastCrashAt)}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false);
                              openCrashDiagnosis({ modpackId: c.id, name: c.name });
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/15"
                          >
                            <Stethoscope className="h-3 w-3" /> Diagnosticar
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissCrash(c)}
                          title="Descartar"
                          className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionTitle onClick={() => openProfile("friends")}>Actividad de amigos</SectionTitle>
                <PresenceList players={recentFriends} emptyMessage="Ningún amigo conectado recientemente." banners />
              </section>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>,
      document.body
      )}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Actividad"
        data-tour="presence-button"
        className={cn(
          "relative z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors",
          open && "bg-white/10"
        )}
      >
        <span className="relative flex items-center justify-center h-6 w-6">
          <Bell className="h-4 w-4 text-gray-300" />
          {anyFriendOnline && notificationCount === 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-card" />
          )}
        </span>
        <span className="text-sm font-semibold text-gray-200">Actividad</span>
        {notificationCount > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-accent-foreground">
            {notificationCount}
          </span>
        )}
      </button>
    </div>
  );
}
