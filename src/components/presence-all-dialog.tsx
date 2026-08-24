import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PresenceList } from "@/components/presence-list";
import type { PresenceEntry } from "@/services/presence";

interface PresenceAllDialogProps {
  players: [string, PresenceEntry][];
  myUuid: string | null;
  onClose: () => void;
}

/** Full, unfiltered roster for a modpack — everyone who has ever connected,
 *  not just the last 7 days. This is where nicknames actually get edited. */
export function PresenceAllDialog({ players, myUuid, onClose }: PresenceAllDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Todos los jugadores</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <PresenceList players={players} myUuid={myUuid} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
