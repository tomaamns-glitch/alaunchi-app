import { Folder } from "lucide-react";
import type { Modpack } from "@/services/github";

export interface TileDragProps {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

function dragClasses(drag: TileDragProps) {
  return [
    drag.isDragging ? "opacity-40" : "",
    drag.isDropTarget ? "ring-2 ring-accent border-accent/50" : "",
  ].join(" ");
}

interface InstanceTileProps {
  instance: Modpack;
  onClick: () => void;
  drag: TileDragProps;
}

export function InstanceTile({ instance, onClick, drag }: InstanceTileProps) {
  return (
    <button
      onClick={onClick}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      className={`group flex flex-col items-start gap-2 rounded-md border border-white/10 bg-card/50 p-3 text-left hover:border-accent/50 hover:bg-card/80 transition-colors cursor-grab active:cursor-grabbing ${dragClasses(drag)}`}
    >
      <div className="relative w-full aspect-square rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-4xl font-black text-accent/60">
        {instance.imageUrl ? (
          <img src={instance.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          instance.name.charAt(0)
        )}
        <span className="absolute bottom-1 right-1 max-w-[calc(100%-8px)] truncate rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold leading-none text-white backdrop-blur-sm">
          {instance.minecraftVersion} · {instance.loaderType.toUpperCase()}
        </span>
      </div>
      <span className="text-sm font-semibold truncate w-full">{instance.name}</span>
    </button>
  );
}

interface FolderTileProps {
  name: string;
  count: number;
  onClick: () => void;
  drag: TileDragProps;
}

export function FolderTile({ name, count, onClick, drag }: FolderTileProps) {
  return (
    <button
      onClick={onClick}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      className={`group flex flex-col items-start gap-2 rounded-md border border-white/10 bg-card/50 p-3 text-left hover:border-accent/50 hover:bg-card/80 transition-colors cursor-grab active:cursor-grabbing ${dragClasses(drag)}`}
    >
      <div className="relative w-full aspect-square rounded-md border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center">
        <Folder className="h-10 w-10 text-accent/70" />
        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
          {count}
        </span>
      </div>
      <span className="text-sm font-semibold truncate w-full">{name}</span>
    </button>
  );
}
