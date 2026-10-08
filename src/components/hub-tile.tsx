import { useState } from "react";
import { Copy, FolderMinus, FolderOpen, Loader2, Play, RotateCcw, Share2, Square, Star, Trash2 } from "lucide-react";
import { ShareInstanceDialog } from "@/components/share-instance-dialog";
import { DuplicateInstanceDialog } from "@/components/duplicate-instance-dialog";
import type { Modpack } from "@/services/github";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useInstanceProgress } from "@/hooks/use-instance-progress";
import { InstanceProgressChip } from "@/components/instance-progress-chip";
import { runStateBusyLabel } from "@/hooks/use-instance-run-state";
import { useInstanceThumbnail } from "@/hooks/use-instance-thumbnail";
import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/loader-icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { deleteInstance, openInstanceFolder } from "@/services/electron";
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
  const { busy, running, runState, toggle } = useLaunchModpack(instance);
  const progress = useInstanceProgress(instance.id);
  const shot = useInstanceThumbnail(instance.id);
  const cover = shot || instance.bannerUrl || instance.imageUrl;
  const [sharing, setSharing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepFiles, setKeepFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteInstance(instance.id, keepFiles);
      toast.success(keepFiles ? `${instance.name} quitada de la app (archivos conservados).` : `${instance.name} eliminada.`);
      setConfirmDelete(false);
      await useCustomInstances.getState().loadInstances();
    } catch (e: any) {
      toast.error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo eliminar la instancia.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
            <div className="relative aspect-square bg-black/50">
              {cover ? (
                <img src={cover} alt="" className="w-full h-full object-cover" draggable={false} />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-accent/15 to-black" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />

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

              {instance.isCopy && (
                <span
                  title="Copia de otra instancia"
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-gray-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </span>
              )}

              <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold leading-none text-white backdrop-blur-sm">
                {instance.minecraftVersion}
                {instance.loaderType && instance.loaderType.toLowerCase() !== "vanilla" && (
                  <LoaderIcon loader={instance.loaderType} className="h-4 w-4" title={instance.loaderType} />
                )}
              </span>
            </div>
            <div className="px-3 pt-2 pb-1">
              <div className="text-sm font-semibold truncate">{instance.name}</div>
            </div>
          </button>

          <div className="px-3 pb-3 pt-1">
            {progress.active ? (
              <InstanceProgressChip
                entry={progress.entry}
                runState={progress.runState}
                status={progress.status}
                installed={!!instance.installed}
                online={instance.source !== "custom"}
                size={32}
              />
            ) : (
            <Button
              size="sm"
              variant={running ? "destructive" : "default"}
              className="w-full h-8 font-bold"
              onClick={toggle}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : running ? (
                <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
              )}
              {busy ? runStateBusyLabel(runState) : running ? "CERRAR" : "JUGAR"}
            </Button>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[11rem]">
        <ContextMenuItem
          onSelect={async () => {
            try {
              await openInstanceFolder(instance.id);
            } catch (e: any) {
              toast.error(e?.message || "No se pudo abrir la carpeta.");
            }
          }}
        >
          <FolderOpen className="mr-2 h-3.5 w-3.5" />
          Abrir carpeta
        </ContextMenuItem>
        {instance.source === "custom" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setSharing(true)}>
              <Share2 className="mr-2 h-3.5 w-3.5" />
              Compartir
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setDuplicating(true)}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Duplicar
            </ContextMenuItem>
          </>
        )}
        {onRemoveFromFolder && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onRemoveFromFolder}>
              <FolderMinus className="mr-2 h-3.5 w-3.5" />
              Quitar de la carpeta
            </ContextMenuItem>
          </>
        )}
        {instance.source === "custom" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                setKeepFiles(false);
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Eliminar instancia
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
    <ShareInstanceDialog instance={sharing ? instance : null} onOpenChange={(o) => !o && setSharing(false)} />
    <DuplicateInstanceDialog instance={duplicating ? instance : null} onOpenChange={(o) => !o && setDuplicating(false)} />
    <AlertDialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar "{instance.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {keepFiles
              ? "La instancia dejará de aparecer en la app, pero sus archivos (mods, partidas guardadas, configuración) se quedarán en el equipo."
              : "Se borrará toda la instancia (mods, partidas guardadas, configuración) de este equipo. Esta acción no se puede deshacer."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <Checkbox checked={keepFiles} onCheckedChange={(v) => setKeepFiles(v === true)} disabled={deleting} />
          Conservar los archivos de la instancia
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
