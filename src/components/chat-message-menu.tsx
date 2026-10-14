import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface MessageMenuState {
  x: number;
  y: number;
  /** Own message → deleted for everyone; someone else's → hidden only for you. */
  own: boolean;
  onDelete: () => Promise<void> | void;
}

/** Opens the menu at the cursor — `onContextMenu={(e) => open(e, …)}`. */
export function useMessageMenu() {
  const [menu, setMenu] = useState<MessageMenuState | null>(null);
  const open = (e: MouseEvent, own: boolean, onDelete: MessageMenuState["onDelete"]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, own, onDelete });
  };
  return { menu, open, close: () => setMenu(null) };
}

/** Right-click menu of a chat message (1:1 and group chat). Portaled to
 *  <body>: both chat windows are transformed (framer-motion), which would
 *  otherwise turn `fixed` into "relative to the window". */
export function ChatMessageMenu({ menu, onClose }: { menu: MessageMenuState | null; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, onClose]);

  if (!menu) return null;
  const width = 176;
  const left = Math.min(menu.x, window.innerWidth - width - 8);
  const top = Math.min(menu.y, window.innerHeight - 48);

  return createPortal(
    // data-keep-popups-open: clicks here aren't "outside" the chat popup
    // (use-dismiss-on-outside-click.ts), so using the menu doesn't close it.
    <div data-keep-popups-open>
      <button
        type="button"
        aria-label="Cerrar menú"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-[200] cursor-default"
      />
      <div
        style={{ top, left, width }}
        className="fixed z-[201] rounded-lg bg-card border border-white/10 shadow-2xl py-1"
      >
        <button
          type="button"
          onClick={async () => {
            onClose();
            try {
              await menu.onDelete();
            } catch (e: any) {
              toast.error(e?.message || "No se pudo eliminar el mensaje.");
            }
          }}
          className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          {menu.own ? "Eliminar para todos" : "Eliminar para mí"}
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Placeholder bubble for a message its sender deleted (tombstone). */
export function DeletedMessageBubble({ mine }: { mine: boolean }) {
  return (
    <div
      className={
        "rounded-2xl px-3.5 py-2 text-xs italic text-muted-foreground bg-white/5 border border-white/10 " +
        (mine ? "rounded-br-sm" : "rounded-bl-sm")
      }
    >
      Mensaje eliminado
    </div>
  );
}
