import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Copy, FolderMinus, FolderOpen, Loader2, Play, RotateCcw, Share2, Square, Star, Trash2 } from "lucide-react";
import { ShareInstanceDialog } from "@/components/share-instance-dialog";
import { DuplicateInstanceDialog } from "@/components/duplicate-instance-dialog";
import type { Modpack } from "@/services/github";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useInstanceProgress } from "@/hooks/use-instance-progress";
import { InstanceProgressChip } from "@/components/instance-progress-chip";
import { runStateBusyLabel } from "@/hooks/use-instance-run-state";
import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/loader-icon";
import instanceVanillaIcon from "@/assets/instance-vanilla.png";
import instanceModdedIcon from "@/assets/instance-modded.png";
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
import { toast } from "@/lib/toast";

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
  /** "list": one row (icon, name, version/loader, time played, Jugar) instead of a square tile. */
  layout?: "grid" | "list";
}

/** "3 h 20 min", "45 min", or "Sin jugar". */
function formatPlaytime(ms: number | undefined) {
  const minutes = Math.floor((ms ?? 0) / 60000);
  if (minutes < 1) return "Sin jugar";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

export function InstanceTile({ instance, onClick, drag, pinned, onTogglePin, onRemoveFromFolder, layout = "grid" }: InstanceTileProps) {
  const { busy, running, runState, toggle } = useLaunchModpack(instance);
  const progress = useInstanceProgress(instance.id);
  // Private (custom) and downloaded instances show only their icon — never a
  // banner or a gallery image/screenshot. With no icon, the same default as a new
  // instance: vanilla or modded. Online instances keep their banner.
  const defaultCover = !instance.loaderType || instance.loaderType.toLowerCase() === "vanilla" ? instanceVanillaIcon : instanceModdedIcon;
  const cover =
    instance.source === "custom" || instance.isDownloaded
      ? instance.imageUrl || defaultCover
      : instance.bannerUrl || instance.imageUrl || defaultCover;
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

  // The Jugar/Cerrar button, or the progress chip while installing.
  const playControl = (
    <>
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
      // Quiet until you're on the tile (15 solid buttons were a wall of color);
      // then it takes the accent, like Jugar in the instance manager.
      variant={running ? "destructive" : "ghost"}
      className={`w-full h-8 font-bold ${
        running
          ? ""
          : "bg-white/[0.06] text-muted-foreground transition-colors duration-300 ease-out group-hover:bg-accent group-hover:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
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
    </>
  );

  return (
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {layout === "list" ? (
        <div
          draggable={drag.draggable}
          onDragStart={drag.onDragStart}
          onDragOver={drag.onDragOver}
          onDragLeave={drag.onDragLeave}
          onDrop={drag.onDrop}
          onDragEnd={drag.onDragEnd}
          className={`group flex items-center gap-4 rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md p-2.5 pr-3 hover:border-accent/40 transition-colors duration-300 ease-out ${drag.draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragClasses(drag)}`}
        >
          <button type="button" onClick={onClick} className="flex flex-1 min-w-0 items-center gap-4 text-left">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-black/50">
              <img src={cover} alt="" className="h-full w-full object-cover" draggable={false} />
              {instance.isCopy && (
                <span title="Copia de otra instancia" className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center text-gray-200">
                  <RotateCcw className="h-3 w-3" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{instance.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 rounded bg-white/[0.06] px-2 py-0.5 text-gray-200">
                  {instance.loaderType && instance.loaderType.toLowerCase() !== "vanilla" && (
                    <LoaderIcon loader={instance.loaderType} className="h-4 w-4" title={instance.loaderType} />
                  )}
                  {instance.minecraftVersion}
                </span>
                <span className="truncate">{formatPlaytime(instance.totalPlaytimeMs)}</span>
              </div>
            </div>
          </button>
          <FavoriteStar pinned={pinned} onToggle={onTogglePin} className="relative shrink-0" />
          <div className="w-36 shrink-0">{playControl}</div>
        </div>
        ) : (
        <div
          draggable={drag.draggable}
          onDragStart={drag.onDragStart}
          onDragOver={drag.onDragOver}
          onDragLeave={drag.onDragLeave}
          onDrop={drag.onDrop}
          onDragEnd={drag.onDragEnd}
          className={`group rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md overflow-hidden hover:border-accent/40 transition-colors duration-300 ease-out cursor-grab active:cursor-grabbing ${dragClasses(drag)}`}
        >
          <button type="button" onClick={onClick} className="block w-full text-left">
            <div className="relative aspect-square bg-black/50">
              <img src={cover} alt="" className="w-full h-full object-cover" draggable={false} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />

              <FavoriteStar
                pinned={pinned}
                onToggle={onTogglePin}
                className="absolute top-1.5 left-1.5"
              />

              {instance.isCopy && (
                <span
                  title="Copia de otra instancia"
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-gray-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </span>
              )}

              <span className="absolute bottom-2 right-2 flex items-center gap-2 rounded-md bg-black/70 px-2.5 py-1.5 text-[14px] font-semibold leading-none text-white backdrop-blur-sm">
                {instance.minecraftVersion}
                {instance.loaderType && instance.loaderType.toLowerCase() !== "vanilla" && (
                  <LoaderIcon loader={instance.loaderType} className="h-6 w-6" title={instance.loaderType} />
                )}
              </span>
            </div>
            <div className="px-3 pt-2 pb-1">
              <div className="text-sm font-semibold truncate">{instance.name}</div>
            </div>
          </button>

          <div className="px-3 pb-3 pt-1">
            {playControl}
          </div>
        </div>
        )}
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
      <AlertDialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:rounded-md">
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
          <AlertDialogCancel disabled={deleting} className="border-transparent bg-white/[0.07] hover:bg-white/[0.14]">
            Cancelar
          </AlertDialogCancel>
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

const BURST_DOTS = 8;

/**
 * The favorite star of a tile. Marking it: the star pops in with a spin and a
 * ring of amber sparks bursts out. Unmarking: it shrinks back and loses its color.
 * No animation on first render (only on a real change). Unmarked, it only
 * shows while hovering the tile (the tile root is the `group`).
 */
function FavoriteStar({ pinned, onToggle, className }: { pinned: boolean; onToggle: () => void; className?: string }) {
  const [burst, setBurst] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!pinned) setBurst((b) => b + 1);
        onToggle();
      }}
      aria-label={pinned ? "Quitar de destacadas" : "Destacar instancia"}
      className={`h-6 w-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-[opacity,background-color] duration-200 ${pinned ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"} ${className ?? ""}`}
    >
      <motion.span
        key={pinned ? "on" : "off"}
        initial={!mounted.current ? false : pinned ? { scale: 0.2, rotate: -72 } : { scale: 1.3, rotate: 0 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={pinned ? { type: "spring", stiffness: 520, damping: 13 } : { duration: 0.22, ease: "easeOut" }}
        className="flex"
      >
        <Star className={`h-3.5 w-3.5 transition-colors duration-200 ${pinned ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      </motion.span>
      {burst > 0 && pinned && (
        <span key={burst} aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: BURST_DOTS }, (_, i) => {
            const angle = (i / BURST_DOTS) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] h-1 w-1 rounded-full bg-amber-300"
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * 16, y: Math.sin(angle) * 16, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            );
          })}
        </span>
      )}
    </button>
  );
}
