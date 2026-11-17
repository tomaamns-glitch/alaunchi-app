import { Paintbrush } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdaptiveColorPanel, AnimatedBackgroundPanel, ChristmasPanel, GlassPanel, NotificationSoundPanel, ThemePanel } from "@/components/launcher-appearance";

/** "Personalizar": the launcher's own look in one window, opened from the
 *  brush in the title bar — theme, glass, adaptive colours, animated background
 *  and notification sound. Configuración → Personalización no longer repeats them. */
export function LauncherCustomizeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:rounded-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paintbrush className="h-5 w-5 text-accent" /> Personalizar
          </DialogTitle>
          <DialogDescription>El aspecto de ALaunchi. Los cambios se aplican al momento y se guardan en este equipo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ThemePanel />
          <ChristmasPanel />
          <GlassPanel />
          <AdaptiveColorPanel />
          <AnimatedBackgroundPanel />
          <NotificationSoundPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
