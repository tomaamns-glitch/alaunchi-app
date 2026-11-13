import { useEffect, useMemo, useState } from "react";
import { Check, Gamepad2, Loader2, MessageCircle, Search, UserMinus, UserPlus, X } from "lucide-react";
import { subscribeUserDirectory, touchUserDirectory, type KnownUser } from "@/services/chat";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
  subscribeFriends,
  subscribeIncomingRequests,
  subscribeSentRequests,
  type FriendEntry,
  type FriendRequestEntry,
} from "@/services/friends";
import { subscribeAllActivity, type UserActivity } from "@/services/user-activity";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { cn } from "@/lib/utils";
import { PlayerDecoratedIcon } from "@/components/icon-decoration";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/hint";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

function PersonAvatar({ uuid, username }: { uuid: string; username: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <PlayerDecoratedIcon uuid={uuid} size={32} radius={6}>
      <Avatar className="h-8 w-8 rounded-md border border-white/10 shrink-0">
        {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
        <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
          {username.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </PlayerDecoratedIcon>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-transparent bg-white/[0.07] px-2.5 py-2">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">{children}</h2>;
}

type FriendsTab = "all" | "online" | "requests";

/** Segmented tab with its count; `alert` paints the count red (incoming requests). */
function TabButton({
  active,
  label,
  count,
  alert = false,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-7 flex items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium transition-colors",
        active ? "bg-white/[0.14] text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.07]"
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            "min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-bold leading-none",
            alert ? "bg-red-500 text-white" : "bg-white/10 text-gray-300"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface FriendsPanelProps {
  uuid: string;
  username: string;
  /** Opening someone's public profile. */
  onOpenProfile: (uuid: string) => void;
  onChat: (uuid: string) => void;
}

/** Search + tabs (Todos · En línea · Solicitudes, received and sent) over the
 *  friend list. Used both by the /friends page and inside the account menu;
 *  fills its parent's height, scrolling the list part while the search box and
 *  tabs stay put. Searching shows the results instead of the tab. */
export function FriendsPanel({ uuid, username, onOpenProfile, onChat }: FriendsPanelProps) {
  const [directory, setDirectory] = useState<Record<string, KnownUser>>({});
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [incoming, setIncoming] = useState<Record<string, FriendRequestEntry>>({});
  const [sent, setSent] = useState<Record<string, FriendRequestEntry>>({});
  const [search, setSearch] = useState("");
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [tab, setTab] = useState<FriendsTab>("all");
  // Everyone's live status (same node as Actividad), for the En línea tab.
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  useEffect(() => subscribeAllActivity(setActivity), []);

  useEffect(() => {
    touchUserDirectory(uuid, username).catch(() => {});
    const unsubs = [
      subscribeUserDirectory(setDirectory),
      subscribeFriends(uuid, setFriends),
      subscribeIncomingRequests(uuid, setIncoming),
      subscribeSentRequests(uuid, setSent),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uuid, username]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return Object.entries(directory)
      .filter(([id, u]) => id !== uuid && u.username.toLowerCase().includes(q))
      .sort(([, a], [, b]) => a.username.localeCompare(b.username))
      .slice(0, 20);
  }, [directory, search, uuid]);

  const withBusy = async (otherUuid: string, action: () => Promise<void>) => {
    setBusyUuid(otherUuid);
    try {
      await action();
    } finally {
      setBusyUuid(null);
    }
  };

  const incomingList = Object.entries(incoming).sort(([, a], [, b]) => b.sentAt - a.sentAt);
  const sentList = Object.entries(sent).sort(([, a], [, b]) => b.sentAt - a.sentAt);
  const friendsList = Object.entries(friends).sort(([, a], [, b]) => a.username.localeCompare(b.username));
  const isOnline = (id: string) => !!activity[id] && activity[id].status !== "offline";
  // Playing first, then just online; alphabetical within each (stable sort).
  const onlineList = friendsList
    .filter(([id]) => isOnline(id))
    .sort(([a], [b]) => Number(activity[b].status === "playing") - Number(activity[a].status === "playing"));
  const searching = !!search.trim();

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="space-y-2 shrink-0">
        {/* Tabs first; picking one clears a search in progress (its results
            replace the tab's list while there's text). */}
        <div className={cn("flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04]", searching && "opacity-60")}>
          <TabButton active={!searching && tab === "all"} label="Todos" count={friendsList.length} onClick={() => { setSearch(""); setTab("all"); }} />
          <TabButton active={!searching && tab === "online"} label="En línea" count={onlineList.length} onClick={() => { setSearch(""); setTab("online"); }} />
          <TabButton
            active={!searching && tab === "requests"}
            label="Solicitudes"
            count={incomingList.length || sentList.length}
            alert={incomingList.length > 0}
            onClick={() => { setSearch(""); setTab("requests"); }}
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jugador por nombre..."
            className="h-8 pl-8 text-sm bg-white/[0.07] border-transparent"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {searching && (
          <section className="space-y-1.5">
            <SectionTitle>Resultados</SectionTitle>
            {searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nadie coincide con "{search}".</p>
            ) : (
              <div className="space-y-1.5">
                {searchResults.map(([id, u]) => {
                  const isFriend = !!friends[id];
                  const hasSent = !!sent[id];
                  const hasIncoming = !!incoming[id];
                  const busy = busyUuid === id;
                  return (
                    <Row key={id}>
                      <button
                        type="button"
                        onClick={() => onOpenProfile(id)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      >
                        <PersonAvatar uuid={id} username={u.username} />
                        <span className="flex-1 min-w-0 truncate text-sm font-medium hover:text-accent transition-colors">
                          {u.username}
                        </span>
                      </button>
                      {isFriend ? (
                        <span className="text-[11px] text-muted-foreground shrink-0">Ya sois amigos</span>
                      ) : hasIncoming ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-7 px-2"
                            disabled={busy}
                            title="Aceptar"
                            onClick={() => withBusy(id, () => acceptFriendRequest(uuid, username, id, u.username))}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </Button>
                          <Hint label="Rechazar">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={busy}
                              onClick={() => withBusy(id, () => declineFriendRequest(uuid, id))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </Hint>
                        </div>
                      ) : hasSent ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 shrink-0 text-xs"
                          disabled={busy}
                          onClick={() => withBusy(id, () => cancelFriendRequest(uuid, id))}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancelar"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 px-2 shrink-0 text-xs"
                          disabled={busy}
                          onClick={() => withBusy(id, () => sendFriendRequest(uuid, username, id, u.username))}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <UserPlus className="mr-1 h-3.5 w-3.5" />
                              Añadir
                            </>
                          )}
                        </Button>
                      )}
                    </Row>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!searching && tab === "requests" && incomingList.length === 0 && sentList.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No tienes solicitudes pendientes. Busca a alguien por nombre arriba para enviarle una.
          </p>
        )}

        {!searching && tab === "requests" && incomingList.length > 0 && (
          <section className="space-y-1.5">
            <SectionTitle>Recibidas</SectionTitle>
            <div className="space-y-1.5">
              {incomingList.map(([id, r]) => {
                const busy = busyUuid === id;
                return (
                  <Row key={id}>
                    <PersonAvatar uuid={id} username={r.username} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.username}</div>
                      <div className="text-[10px] text-muted-foreground">hace {formatDistanceToNow(r.sentAt, { locale: es })}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={busy}
                        onClick={() => withBusy(id, () => acceptFriendRequest(uuid, username, id, r.username))}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aceptar"}
                      </Button>
                      <Hint label="Rechazar">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          disabled={busy}
                          onClick={() => withBusy(id, () => declineFriendRequest(uuid, id))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </Hint>
                    </div>
                  </Row>
                );
              })}
            </div>
          </section>
        )}

        {!searching && tab === "requests" && sentList.length > 0 && (
          <section className="space-y-1.5">
            <SectionTitle>Enviadas</SectionTitle>
            <div className="space-y-1.5">
              {sentList.map(([id, r]) => {
                const busy = busyUuid === id;
                return (
                  <Row key={id}>
                    <button
                      type="button"
                      onClick={() => onOpenProfile(id)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    >
                      <PersonAvatar uuid={id} username={r.username} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate hover:text-accent transition-colors">{r.username}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Enviada hace {formatDistanceToNow(r.sentAt, { locale: es })}
                        </div>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 shrink-0 text-xs"
                      disabled={busy}
                      onClick={() => withBusy(id, () => cancelFriendRequest(uuid, id))}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancelar"}
                    </Button>
                  </Row>
                );
              })}
            </div>
          </section>
        )}

        {!searching && tab !== "requests" && (
        <section className="space-y-1.5">
          {(tab === "online" ? onlineList : friendsList).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {tab === "online" && friendsList.length > 0
                ? "Ninguno de tus amigos está conectado ahora."
                : "Aún no tienes amigos añadidos. Búscalos por nombre arriba."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {(tab === "online" ? onlineList : friendsList).map(([id, f]) => {
                const busy = busyUuid === id;
                const a = activity[id];
                return (
                  <Row key={id}>
                    <button
                      type="button"
                      onClick={() => onOpenProfile(id)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    >
                      <PersonAvatar uuid={id} username={f.username} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate hover:text-accent transition-colors">{f.username}</div>
                        {tab === "online" ? (
                          <div className={`flex items-center gap-1 text-[10px] truncate ${a?.away ? "text-amber-300" : "text-green-400"}`}>
                            {a?.away ? (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="truncate">
                                  Ausente{a.status === "playing" ? ` · Jugando a ${a.instanceName || "Minecraft"}` : ""}
                                </span>
                              </>
                            ) : a?.status === "playing" ? (
                              <>
                                <Gamepad2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">Jugando a {a.instanceName || "Minecraft"}</span>
                              </>
                            ) : (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                                En línea
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground truncate">
                            Amigos desde hace {formatDistanceToNow(f.since, { locale: es })}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Hint label="Chatear">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          aria-label="Chatear"
                          onClick={() => onChat(id)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      </Hint>
                      <Hint label="Quitar amigo">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-gray-400 hover:text-destructive"
                          aria-label="Quitar amigo"
                          disabled={busy}
                          onClick={() => withBusy(id, () => removeFriend(uuid, id))}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                        </Button>
                      </Hint>
                    </div>
                  </Row>
                );
              })}
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
