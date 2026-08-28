import { useState } from "react";

interface DragReorderOptions<T extends string> {
  order: T[];
  onReorder: (newOrder: T[]) => void;
  /** Called when the dragged item is dropped onto a "container" item (e.g. an
   *  instance dropped onto a folder tile) that should absorb it instead of a
   *  plain position swap. Return true once handled to skip the default reorder. */
  onDropInto?: (draggedId: T, targetId: T) => boolean;
}

/** Native HTML5 drag-and-drop reordering for a flat, ordered list of ids —
 *  shared by the Hub's root grid (folders + ungrouped instances) and a
 *  folder's own contents dialog, so the actual event wiring only lives once. */
export function useDragReorder<T extends string>({ order, onReorder, onDropInto }: DragReorderOptions<T>) {
  const [draggedId, setDraggedId] = useState<T | null>(null);
  const [overId, setOverId] = useState<T | null>(null);

  const handlersFor = (id: T) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedId && draggedId !== id) setOverId(id);
    },
    onDragLeave: () => setOverId((cur) => (cur === id ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverId(null);
      const dragged = draggedId;
      setDraggedId(null);
      if (!dragged || dragged === id) return;
      if (onDropInto?.(dragged, id)) return;
      const from = order.indexOf(dragged);
      const to = order.indexOf(id);
      if (from === -1 || to === -1) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, dragged);
      onReorder(next);
    },
    onDragEnd: () => {
      setDraggedId(null);
      setOverId(null);
    },
    isDragging: draggedId === id,
    isDropTarget: overId === id,
  });

  return { handlersFor, draggedId };
}
