import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useChatHeads } from "@/hooks/use-chat-heads";

/**
 * Search box over the player directory (everyone who has opened ALaunchi —
 * services/chat.ts' users/ node), with an action button per result. `blockedReason`
 * returns why a player can't be picked ("Ya tiene acceso"…), shown instead of
 * the button.
 */
export function PlayerPicker({
  placeholder,
  actionLabel,
  actionVariant = "default",
  blockedReason,
  onPick,
}: {
  placeholder: string;
  actionLabel: string;
  actionVariant?: "default" | "destructive";
  blockedReason: (uuid: string) => string | null;
  onPick: (uuid: string, username: string) => Promise<void>;
}) {
  const directory = useChatHeads((s) => s.directory);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.entries(directory)
      .filter(([, u]) => u?.username?.toLowerCase().includes(q))
      .sort(([, a], [, b]) => {
        // Exact and prefix matches first.
        const rank = (n: string) => (n.toLowerCase() === q ? 0 : n.toLowerCase().startsWith(q) ? 1 : 2);
        return rank(a.username) - rank(b.username) || a.username.localeCompare(b.username);
      })
      .slice(0, 6);
  }, [directory, query]);

  const pick = async (uuid: string, username: string) => {
    setBusy(uuid);
    try {
      await onPick(uuid, username);
      setQuery("");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-8 bg-background/50 border-white/10 text-white"
        />
      </div>
      {query.trim() && (
        <div className="space-y-1">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-1.5">
              Nadie con ese nombre ha abierto ALaunchi todavía.
            </p>
          ) : (
            results.map(([uuid, u]) => {
              const reason = blockedReason(uuid);
              return (
                <div key={uuid} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5">
                  <Head uuid={uuid} username={u.username} />
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-100">{u.username}</span>
                  {reason ? (
                    <span className="text-[11px] text-muted-foreground shrink-0">{reason}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant={actionVariant}
                      className="h-7 px-2.5 text-xs shrink-0"
                      disabled={!!busy}
                      onClick={() => pick(uuid, u.username)}
                    >
                      {busy === uuid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionLabel}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function Head({ uuid, username, className = "h-7 w-7" }: { uuid: string; username: string; className?: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <Avatar className={`${className} rounded-md shrink-0`}>
      {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
      <AvatarFallback className="rounded-md bg-accent/20 text-accent text-[10px] font-bold">
        {username.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
