import { Hint } from "@/components/hint";
import type { ReactNode } from "react";
import { ArrowDownToLine, PanelsTopLeft } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

/** Right-clicking a footer button of Inicio's carousel: move that panel into the
 *  instance manager (no `onMove`: no menu). Wrap only the button itself: React events
 *  bubble through portals, so around its popup too a right click in there would open this. */
export function MoveToContentMenu({ onMove, children }: { onMove?: () => void; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!onMove}>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onMove} className="gap-2">
          <PanelsTopLeft className="h-4 w-4" />
          Mover a Contenido
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** In the header of a panel that was moved to the manager: sends it back. */
export function MoveBackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Hint label="Volver al pie de Inicio">
      <button
        type="button"
        onClick={onClick}
        aria-label="Volver al pie de Inicio"
        className={`h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors shrink-0 ${className ?? ""}`}
      >
        <ArrowDownToLine className="h-3.5 w-3.5" />
      </button>
    </Hint>
  );
}
