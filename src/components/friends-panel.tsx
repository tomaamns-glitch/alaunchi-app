import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageCircle, Search, UserMinus, UserPlus, X } from "lucide-react";
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
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

function PersonAvatar({ uuid, username }: { uuid: string; username: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <Avatar className="h-8 w-8 rounded-md border border-white/10 shrink-0">
      {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
      <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
        {username.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">{children}</h2>;
}

interface FriendsPanelProps {
  uuid: string;
  username: string;
  /** Opening someone's public profile. */
  onOpenProfile: (uuid: string) => void;
  onChat: (uuid: string) => void;
}

/** Search + incoming requests + friend list. Used both by the /friends page and
 *  inside the account menu; fills its parent's height, scrolling the list part
 *  while the search box stays put. */
export function FriendsPanel({ uuid, username, onOpenProfile, onChat }: FriendsPanelProps) {
  const [directory, setDirectory] = useState<Record<string, KnownUser>>({});
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [incoming, setIncoming] = useState<Record<string, FriendRequestEntry>>({});
  const [sent, setSent] = useState<Record<string, FriendRequestEntry>>({});
  const [search, setSearch] = useState("");
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

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
  const friendsList = Object.entries(friends).sort(([, a], [, b]) => a.username.localeCompare(b.username));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="space-y-1.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jugador por nombre..."
            className="h-8 pl-8 text-sm bg-background/50 border-white/10"
          />
        </div>
        <p className="text-[11px] text-muted-foreground px-1">
          {friendsList.length} amigo{friendsList.length === 1 ? "" : "s"}
          {incomingList.length > 0
            ? ` · ${incomingList.length} solicitud${incomingList.length === 1 ? "" : "es"} pendiente${incomingList.length === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {search.trim() && (
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={busy}
                            title="Rechazar"
                            onClick={() => withBusy(id, () => declineFriendRequest(uuid, id))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
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

        {incomingList.length > 0 && (
          <section className="space-y-1.5">
            <SectionTitle>Solicitudes recibidas</SectionTitle>
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        disabled={busy}
                        title="Rechazar"
                        onClick={() => withBusy(id, () => declineFriendRequest(uuid, id))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Row>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-1.5">
          <SectionTitle>Mis amigos</SectionTitle>
          {friendsList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Aún no tienes amigos añadidos. Búscalos por nombre arriba.
            </p>
          ) : (
            <div className="space-y-1.5">
              {friendsList.map(([id, f]) => {
                const busy = busyUuid === id;
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
                        <div className="text-[10px] text-muted-foreground truncate">
                          Amigos desde hace {formatDistanceToNow(f.since, { locale: es })}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        title="Chatear"
                        aria-label="Chatear"
                        onClick={() => onChat(id)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-gray-400 hover:text-destructive"
                        title="Quitar amigo"
                        aria-label="Quitar amigo"
                        disabled={busy}
                        onClick={() => withBusy(id, () => removeFriend(uuid, id))}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </Row>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
