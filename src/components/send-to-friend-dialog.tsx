import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Head } from "@/components/player-picker";
import { useAuth } from "@/hooks/use-auth";
import { subscribeFriends, type FriendEntry } from "@/services/friends";

/** Pick a friend to send something to over chat (an image, an instance…).
 *  `onSend` does the actual sending; the dialog closes when it resolves and
 *  shows its error otherwise. */
export function SendToFriendDialog({
  open,
  onOpenChange,
  title,
  description,
  preview,
  disabled,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  preview?: React.ReactNode;
  /** e.g. while the thing to send is still being prepared. */
  disabled?: boolean;
  onSend: (uuid: string, username: string) => Promise<void>;
}) {
  const myUuid = useAuth((s) => s.uuid);
  const [friends, setFriends] = useState<Record<string, FriendEntry>>({});
  const [query, setQuery] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !myUuid) return;
    setQuery("");
    return subscribeFriends(myUuid, setFriends);
  }, [open, myUuid]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(friends)
      .filter(([, f]) => !q || f.username.toLowerCase().includes(q))
      .sort(([, a], [, b]) => a.username.localeCompare(b.username));
  }, [friends, query]);

  const send = async (uuid: string, username: string) => {
    setSendingTo(uuid);
    try {
      await onSend(uuid, username);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo enviar.");
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sendingTo && onOpenChange(o)}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {preview}
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar amigo…" className="h-8 text-sm" />
        <div className="max-h-56 overflow-y-auto -mx-1 px-1 space-y-1">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-6 text-muted-foreground">
              <Users className="h-5 w-5" />
              <p className="text-xs">{query.trim() ? "Ningún amigo con ese nombre." : "Todavía no tienes amigos agregados."}</p>
            </div>
          ) : (
            list.map(([uuid, f]) => (
              <button
                key={uuid}
                type="button"
                disabled={!!sendingTo || disabled}
                onClick={() => send(uuid, f.username)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 disabled:opacity-60 transition-colors text-left"
              >
                <Head uuid={uuid} username={f.username} />
                <span className="flex-1 text-sm truncate">{f.username}</span>
                {sendingTo === uuid ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <Send className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
