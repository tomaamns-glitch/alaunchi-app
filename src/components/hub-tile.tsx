import { FolderMinus, Loader2, MoreVertical, Play, Star } from "lucide-react";
import type { Modpack } from "@/services/github";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useInstanceThumbnail } from "@/hooks/use-instance-thumbnail";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { openInstanceFolder } from "@/services/electron";
import { toast } from "sonner";

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
  pinned: boolean;
  onTogglePin: () => void;
  /** Only passed while viewing a specific folder — adds a "Quitar de la
   *  carpeta" shortcut so ejecting doesn't require opening the instance first. */
  onRemoveFromFolder?: () => void;
}

export function InstanceTile({ instance, onClick, drag, pinned, onTogglePin, onRemoveFromFolder }: InstanceTileProps) {
  const { launching, launch } = useLaunchModpack(instance);
  const shot = useInstanceThumbnail(instance.id);
  const cover = shot || instance.bannerUrl || instance.imageUrl;

  return (
    <div
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      className={`rounded-xl border border-white/10 bg-card/40 overflow-hidden hover:border-accent/40 transition-colors cursor-grab active:cursor-grabbing ${dragClasses(drag)}`}
    >
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="relative h-24 bg-black/50">
          {cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent/15 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            aria-label={pinned ? "Quitar de destacadas" : "Destacar instancia"}
            className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <Star className={`h-3.5 w-3.5 ${pinned ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          </button>

          <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white backdrop-blur-sm">
            {instance.minecraftVersion} · {instance.loaderType.toUpperCase()}
          </span>

          <div className="absolute bottom-1.5 left-2 right-2">
            <div className="h-7 w-7 rounded-md border border-white/20 bg-black/60 overflow-hidden flex items-center justify-center text-[11px] font-black text-accent/70 shadow">
              {instance.imageUrl ? <img src={instance.imageUrl} alt="" className="h-full w-full object-cover" /> : instance.name.charAt(0)}
            </div>
          </div>
        </div>
        <div className="px-3 pt-2 pb-1">
          <div className="text-sm font-semibold truncate">{instance.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {instance.minecraftVersion} · {instance.loaderType}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5 px-3 pb-3 pt-1">
        <Button size="sm" className="flex-1 h-8 font-bold" onClick={launch} disabled={launching}>
          {launching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />}
          JUGAR
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-gray-400 hover:text-white" aria-label="Más opciones">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await openInstanceFolder(instance.id);
                } catch (e: any) {
                  toast.error(e?.message || "No se pudo abrir la carpeta.");
                }
              }}
            >
              Abrir carpeta
            </DropdownMenuItem>
            {onRemoveFromFolder && (
              <DropdownMenuItem onClick={onRemoveFromFolder}>
                <FolderMinus className="mr-2 h-3.5 w-3.5" />
                Quitar de la carpeta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
