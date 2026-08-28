import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { Modpack } from "@/services/github";
import { useInstanceFolders, type InstanceFolder } from "@/hooks/use-instance-folders";
import { useDragReorder } from "@/hooks/use-drag-reorder";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface FolderContentsDialogProps {
  folder: InstanceFolder | null;
  onOpenChange: (open: boolean) => void;
  instances: Modpack[];
  onOpenInstance: (id: string) => void;
}

/** Opened by clicking a folder tile in the Hub — shows what's inside, lets you
 *  rename/delete the folder (deleting only ungroups, never touches the
 *  instances themselves), reorder by dragging, or eject one back to root with
 *  the × on each tile (a non-drag way to get an instance out, since dragging
 *  it out of this dialog to a spot in the root grid behind it isn't a target
 *  you can actually see/hit while the dialog is open). */
export function FolderContentsDialog({ folder, onOpenChange, instances, onOpenInstance }: FolderContentsDialogProps) {
  const { folderOrder, renameFolder, deleteFolder, moveInstance, reorderInFolder } = useInstanceFolders();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setRenaming(false);
    setConfirmDelete(false);
  }, [folder?.id]);

  const order = folder ? folderOrder[folder.id] ?? [] : [];
  const byId = new Map(instances.map((i) => [i.id, i]));
  const items = order.map((id) => byId.get(id)).filter((i): i is Modpack => !!i);

  const { handlersFor } = useDragReorder({
    order,
    onReorder: (next) => folder && reorderInFolder(folder.id, next),
  });

  if (!folder) return null;

  const startRename = () => {
    setNameDraft(folder.name);
    setRenaming(true);
  };
  const confirmRename = () => {
    if (nameDraft.trim()) renameFolder(folder.id, nameDraft.trim());
    setRenaming(false);
  };

  return (
    <>
      <Dialog open={!!folder} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {renaming ? (
                <>
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={confirmRename} aria-label="Guardar nombre">
                    <Check className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <DialogTitle className="flex-1 min-w-0 truncate">{folder.name}</DialogTitle>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={startRename} aria-label="Renombrar carpeta">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                aria-label="Eliminar carpeta"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogHeader>

          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Esta carpeta está vacía.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {items.map((inst) => {
                const drag = handlersFor(inst.id);
                return (
                  <div
                    key={inst.id}
                    draggable={drag.draggable}
                    onDragStart={drag.onDragStart}
                    onDragOver={drag.onDragOver}
                    onDragLeave={drag.onDragLeave}
                    onDrop={drag.onDrop}
                    onDragEnd={drag.onDragEnd}
                    className={`group relative flex flex-col items-start gap-2 rounded-md border border-white/10 bg-card/50 p-2 text-left cursor-grab active:cursor-grabbing ${
                      drag.isDragging ? "opacity-40" : ""
                    } ${drag.isDropTarget ? "ring-2 ring-accent border-accent/50" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => moveInstance(inst.id, null)}
                      aria-label="Sacar de la carpeta"
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 border border-white/10 text-gray-300 hover:text-white hover:bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button onClick={() => onOpenInstance(inst.id)} className="flex flex-col items-start gap-2 w-full">
                      <div className="w-full aspect-square rounded border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-2xl font-black text-accent/60">
                        {inst.imageUrl ? (
                          <img src={inst.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                        ) : (
                          inst.name.charAt(0)
                        )}
                      </div>
                      <span className="text-xs font-semibold truncate w-full">{inst.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la carpeta "{folder.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Las instancias que contiene no se borran — vuelven a la vista principal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteFolder(folder.id);
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
