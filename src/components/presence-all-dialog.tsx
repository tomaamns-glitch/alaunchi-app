import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PresenceList } from "@/components/presence-list";
import type { PresenceEntry } from "@/services/presence";

interface PresenceAllDialogProps {
  title: string;
  players: [string, PresenceEntry][];
  emptyMessage?: string;
  onClose: () => void;
}

/** Full, unfiltered roster for one section (Amigos, or the current carousel
 *  instance) — everyone, not just who's currently shown in the compact popup
 *  (online, or the last 7 days/12h). Opened by clicking that section's own
 *  title in PresenceButton, one dialog per section rather than a single
 *  combined "Todos" button. */
export function PresenceAllDialog({ title, players, emptyMessage, onClose }: PresenceAllDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <PresenceList players={players} emptyMessage={emptyMessage} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
