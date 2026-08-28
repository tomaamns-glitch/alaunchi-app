import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FolderPlus, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceFolders, FOLDER_PREFIX, INSTANCE_PREFIX } from "@/hooks/use-instance-folders";
import { useDragReorder } from "@/hooks/use-drag-reorder";
import { AccountMenuButton } from "@/components/account-menu-button";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { ChatWindow } from "@/components/chat-window";
import { NewInstanceDialog } from "@/components/new-instance-dialog";
import { NewFolderDialog } from "@/components/new-folder-dialog";
import { FolderContentsDialog } from "@/components/folder-contents-dialog";
import { InstanceTile, FolderTile } from "@/components/hub-tile";
import { Button } from "@/components/ui/button";
import { CAROUSEL_POSITION_KEY } from "@/pages/home";

export default function Hub() {
  const { isAuthenticated, username, uuid } = useAuth();
  const [, setLocation] = useLocation();
  const { instances, loadInstances } = useCustomInstances();
  const { folders, rootOrder, placement, reorderRoot, moveInstance, syncInstances, createFolder } = useInstanceFolders();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  // The chat window needs a modpack to scope presence/sharing to — reuse
  // whichever pack was last showing in the Inicio carousel rather than
  // requiring this page to pick one of its own.
  const [lastPackId] = useState(() => localStorage.getItem(CAROUSEL_POSITION_KEY));

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (isAuthenticated) loadInstances();
  }, [isAuthenticated, loadInstances]);

  // Keeps the folders store's bookkeeping honest against what actually exists
  // on disk — newly created instances default to root, deleted ones vanish
  // from wherever they were filed.
  useEffect(() => {
    syncInstances(instances.map((i) => i.id));
  }, [instances, syncInstances]);

  const { handlersFor } = useDragReorder({
    order: rootOrder,
    onReorder: reorderRoot,
    onDropInto: (draggedId, targetId) => {
      if (!draggedId.startsWith(INSTANCE_PREFIX) || !targetId.startsWith(FOLDER_PREFIX)) return false;
      moveInstance(draggedId.slice(INSTANCE_PREFIX.length), targetId.slice(FOLDER_PREFIX.length));
      return true;
    },
  });

  if (!isAuthenticated) return null;

  const byId = new Map(instances.map((i) => [i.id, i]));
  // Instances already filed into a folder shouldn't also show loose at root —
  // rootOrder is kept in sync by syncInstances, but this is a cheap belt-and-
  // braces filter against stale localStorage from an older session.
  const rootItems = rootOrder.filter((entry) => {
    if (!entry.startsWith(INSTANCE_PREFIX)) return true;
    return !placement[entry.slice(INSTANCE_PREFIX.length)];
  });
  const openFolder = folders.find((f) => f.id === openFolderId) ?? null;

  return (
    <div className="relative min-h-full bg-background text-foreground flex flex-col">
      {/* Relative, not "/backgrounds/..." — the packaged app loads index.html via
          file://, where a leading slash resolves against the filesystem root
          instead of the dist/ folder next to this document (same reason App.tsx's
          splash logo and the notification sounds use relative paths). */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.14]"
        style={{ backgroundImage: "url('./backgrounds/hub-bg.png')" }}
      />

      <header className="relative z-10 h-12 border-b border-white/5 bg-card/50 backdrop-blur flex items-center justify-between px-6 shrink-0">
        <h1 className="text-xl font-bold">Mis instancias</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" /> Nueva carpeta
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva instancia
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 py-6 max-w-5xl w-full mx-auto">
        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
            <p>Aún no tienes instancias.</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Crea la primera
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {rootItems.map((entry) => {
              const drag = handlersFor(entry);
              if (entry.startsWith(FOLDER_PREFIX)) {
                const id = entry.slice(FOLDER_PREFIX.length);
                const folder = folders.find((f) => f.id === id);
                if (!folder) return null;
                const count = instances.filter((i) => placement[i.id] === id).length;
                return (
                  <FolderTile key={entry} name={folder.name} count={count} onClick={() => setOpenFolderId(id)} drag={drag} />
                );
              }
              const id = entry.slice(INSTANCE_PREFIX.length);
              const inst = byId.get(id);
              if (!inst) return null;
              return <InstanceTile key={entry} instance={inst} onClick={() => setLocation(`/modpack/${inst.id}`)} drag={drag} />;
            })}
          </div>
        )}
      </main>

      <NewInstanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => setLocation(`/modpack/${id}`)}
      />
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={createFolder} />
      <FolderContentsDialog
        folder={openFolder}
        onOpenChange={(open) => !open && setOpenFolderId(null)}
        instances={instances}
        onOpenInstance={(id) => setLocation(`/modpack/${id}`)}
      />

      <footer className="relative z-20 h-20 border-t border-white/5 bg-card/50 backdrop-blur flex items-center px-6 shrink-0">
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && lastPackId && (
            <div className="relative">
              <ChatBubbleRow />
              <ChatWindow myUuid={uuid} myUsername={username ?? ""} currentPackId={lastPackId} />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
