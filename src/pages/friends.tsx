import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Check, Loader2, MessageCircle, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
import { useChatHeads } from "@/hooks/use-chat-heads";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

function PersonAvatar({ uuid, username }: { uuid: string; username: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <Avatar className="h-9 w-9 rounded-md border border-white/10 shrink-0">
      {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
      <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
        {username.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-3 py-2.5">
      {children}
    </div>
  );
}

export default function Friends() {
  const { isAuthenticated, uuid, username } = useAuth();
  const [, setLocation] = useLocation();
  const openChat = useChatHeads((s) => s.openChat);

  const [directory, setDirectory] = useState<Record<string, KnownUser>>({});
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [incoming, setIncoming] = useState<Record<string, FriendRequestEntry>>({});
  const [sent, setSent] = useState<Record<string, FriendRequestEntry>>({});
  const [search, setSearch] = useState("");
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!uuid || !username) return;
    touchUserDirectory(uuid, username).catch(() => {});
    const unsubs = [
      subscribeUserDirectory(setDirectory),
      subscribeFriends(uuid, setFriends),
      subscribeIncomingRequests(uuid, setIncoming),
      subscribeSentRequests(uuid, setSent),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uuid, username]);

  if (!isAuthenticated || !uuid || !username) return null;

  const withBusy = async (otherUuid: string, action: () => Promise<void>) => {
    setBusyUuid(otherUuid);
    try {
      await action();
    } finally {
      setBusyUuid(null);
    }
  };

  const handleChat = (otherUuid: string) => {
    openChat(otherUuid);
    setLocation("/hub");
  };

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return Object.entries(directory)
      .filter(([id, u]) => id !== uuid && u.username.toLowerCase().includes(q))
      .sort(([, a], [, b]) => a.username.localeCompare(b.username))
      .slice(0, 20);
  }, [directory, search, uuid]);

  const incomingList = Object.entries(incoming).sort(([, a], [, b]) => b.sentAt - a.sentAt);
  const friendsList = Object.entries(friends).sort(([, a], [, b]) => a.username.localeCompare(b.username));

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl w-full mx-auto space-y-6">
          <div className="relative rounded-xl border border-white/10 bg-card/40 p-5 overflow-hidden">
            <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative space-y-3">
              <div>
                <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
                  <Users className="h-5 w-5 text-accent" />
                  Amigos
                </h1>
                <p className="text-xs text-muted-foreground">
                  {friendsList.length} amigo{friendsList.length === 1 ? "" : "s"}
                  {incomingList.length > 0 ? ` · ${incomingList.length} solicitud${incomingList.length === 1 ? "" : "es"} pendiente${incomingList.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <div className="relative pt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar jugador por nombre..."
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>
          </div>

          {search.trim() && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Resultados</h2>
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nadie coincide con "{search}".</p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(([id, u]) => {
                    const isFriend = !!friends[id];
                    const hasSent = !!sent[id];
                    const hasIncoming = !!incoming[id];
                    const busy = busyUuid === id;
                    return (
                      <Row key={id}>
                        <button
                          type="button"
                          onClick={() => setLocation(`/profile/${id}`)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <PersonAvatar uuid={id} username={u.username} />
                          <span className="flex-1 min-w-0 truncate text-sm font-medium hover:text-accent transition-colors">{u.username}</span>
                        </button>
                        {isFriend ? (
                          <span className="text-xs text-muted-foreground shrink-0">Ya sois amigos</span>
                        ) : hasIncoming ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              className="h-7 px-2.5"
                              disabled={busy}
                              onClick={() => withBusy(id, () => acceptFriendRequest(uuid, username, id, u.username))}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5"
                              disabled={busy}
                              onClick={() => withBusy(id, () => declineFriendRequest(uuid, id))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : hasSent ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 shrink-0 text-xs"
                            disabled={busy}
                            onClick={() => withBusy(id, () => cancelFriendRequest(uuid, id))}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancelar solicitud"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 px-2.5 shrink-0 text-xs"
                            disabled={busy}
                            onClick={() => withBusy(id, () => sendFriendRequest(uuid, username, id, u.username))}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="mr-1.5 h-3.5 w-3.5" />Añadir</>}
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
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                Solicitudes recibidas
              </h2>
              <div className="space-y-2">
                {incomingList.map(([id, r]) => {
                  const busy = busyUuid === id;
                  return (
                    <Row key={id}>
                      <PersonAvatar uuid={id} username={r.username} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.username}</div>
                        <div className="text-[11px] text-muted-foreground">
                          hace {formatDistanceToNow(r.sentAt, { locale: es })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs"
                          disabled={busy}
                          onClick={() => withBusy(id, () => acceptFriendRequest(uuid, username, id, r.username))}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aceptar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          disabled={busy}
                          onClick={() => withBusy(id, () => declineFriendRequest(uuid, id))}
                        >
                          Rechazar
                        </Button>
                      </div>
                    </Row>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Mis amigos
            </h2>
            {friendsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Aún no tienes amigos añadidos. Búscalos por nombre arriba.
              </p>
            ) : (
              <div className="space-y-2">
                {friendsList.map(([id, f]) => {
                  const busy = busyUuid === id;
                  return (
                    <Row key={id}>
                      <button
                        type="button"
                        onClick={() => setLocation(`/profile/${id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <PersonAvatar uuid={id} username={f.username} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate hover:text-accent transition-colors">{f.username}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Amigos desde hace {formatDistanceToNow(f.since, { locale: es })}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => handleChat(id)}>
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                          Chatear
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-gray-400 hover:text-destructive"
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
      </main>
    </div>
  );
}
