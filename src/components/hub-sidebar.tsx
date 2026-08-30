import { useState } from "react";
import { Check, Folder, LayoutGrid, MoreVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useInstanceFolders, type InstanceFolder } from "@/hooks/use-instance-folders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

export type HubView = { kind: "all" } | { kind: "favorites" } | { kind: "folder"; id: string };

function viewKey(v: HubView) {
  return v.kind === "folder" ? `folder:${v.id}` : v.kind;
}

interface HubSidebarProps {
  view: HubView;
  onSelectView: (v: HubView) => void;
  countAll: number;
  countFavorites: number;
  countForFolder: (folderId: string) => number;
  onNewFolder: () => void;
  /** The instance id currently being dragged in the main grid, if any — lets a
   *  folder row act as a drop target without a separate drag system: this is
   *  the same React state useDragReorder already tracks for the grid. */
  draggedInstanceId: string | null;
  onDropInstance: (instanceId: string, folderId: string) => void;
}

function FolderRow({
  folder,
  active,
  count,
  isDropTarget,
  onSelect,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  folder: InstanceFolder;
  active: boolean;
  count: number;
  isDropTarget: boolean;
  onSelect: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const { renameFolder, deleteFolder } = useInstanceFolders();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(folder.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const confirmRename = () => {
    if (nameDraft.trim()) renameFolder(folder.id, nameDraft.trim());
    setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmRename()}
          autoFocus
          className="h-7 text-sm"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={confirmRename} aria-label="Guardar nombre">
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer ${
          active ? "bg-accent/15 text-accent" : "text-gray-300 hover:bg-white/5"
        } ${isDropTarget ? "ring-2 ring-accent" : ""}`}
      >
        <Folder className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-left">{folder.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{count}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-5 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => {
                setNameDraft(folder.name);
                setRenaming(true);
              }}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la carpeta "{folder.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Las instancias que contiene no se borran — vuelven a la vista "Todas".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteFolder(folder.id);
                setConfirmDelete(false);
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

export function HubSidebar({
  view,
  onSelectView,
  countAll,
  countFavorites,
  countForFolder,
  onNewFolder,
  draggedInstanceId,
  onDropInstance,
}: HubSidebarProps) {
  const { folders } = useInstanceFolders();
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);

  return (
    <aside className="w-56 shrink-0 ml-6 rounded-xl border border-white/10 bg-card/40 px-3 py-4 overflow-y-auto space-y-5">
      <nav className="space-y-0.5">
        <button
          type="button"
          onClick={() => onSelectView({ kind: "all" })}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
            viewKey(view) === "all" ? "bg-accent/15 text-accent" : "text-gray-300 hover:bg-white/5"
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Todas
          <span className="ml-auto text-xs opacity-70">{countAll}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectView({ kind: "favorites" })}
          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
            viewKey(view) === "favorites" ? "bg-accent/15 text-accent" : "text-gray-300 hover:bg-white/5"
          }`}
        >
          <Star className="h-4 w-4" />
          Favoritas
          <span className="ml-auto text-xs opacity-70">{countFavorites}</span>
        </button>
      </nav>

      <div>
        <div className="flex items-center justify-between px-2 mb-1.5">
          <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Carpetas</span>
          <button
            type="button"
            onClick={onNewFolder}
            aria-label="Nueva carpeta"
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-0.5">
          {folders.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">Sin carpetas todavía.</p>
          ) : (
            folders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                active={viewKey(view) === `folder:${folder.id}`}
                count={countForFolder(folder.id)}
                isDropTarget={!!draggedInstanceId && dropTargetFolderId === folder.id}
                onSelect={() => onSelectView({ kind: "folder", id: folder.id })}
                onDragOver={(e) => {
                  if (!draggedInstanceId) return;
                  e.preventDefault();
                  setDropTargetFolderId(folder.id);
                }}
                onDragLeave={() => setDropTargetFolderId((cur) => (cur === folder.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTargetFolderId(null);
                  if (draggedInstanceId) onDropInstance(draggedInstanceId, folder.id);
                }}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
