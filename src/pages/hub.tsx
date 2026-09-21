import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { Plus, Search, Scaling, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceFolders } from "@/hooks/use-instance-folders";
import { useDragReorder } from "@/hooks/use-drag-reorder";
import { AccountMenuButton } from "@/components/account-menu-button";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { ChatWindow } from "@/components/chat-window";
import { NewInstanceDialog } from "@/components/new-instance-dialog";
import { NewFolderDialog } from "@/components/new-folder-dialog";
import { HubSidebar, type HubView } from "@/components/hub-sidebar";
import { InstanceTile } from "@/components/hub-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { CAROUSEL_POSITION_KEY } from "@/pages/home";

// Tile width in px. The grid uses `repeat(auto-fill, minmax(SIZE, 1fr))` so this
// stays honest when the window is resized or maximised — columns reflow, tiles
// keep the size you picked.
const TILE_SIZE_KEY = "alaunchi_hub_tile_size";
const TILE_MIN = 140;
const TILE_MAX = 340;

export default function Hub() {
  const { isAuthenticated, username, uuid } = useAuth();
  const [, setLocation] = useLocation();
  const { instances, loadInstances } = useCustomInstances();
  const {
    order,
    placement,
    folderOrder,
    pinned,
    reorderAll,
    reorderInFolder,
    moveInstance,
    syncInstances,
    togglePin,
    createFolder,
  } = useInstanceFolders();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [view, setView] = useState<HubView>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tileSize, setTileSize] = useState(() => {
    const raw = Number(localStorage.getItem(TILE_SIZE_KEY));
    return raw >= TILE_MIN && raw <= TILE_MAX ? raw : 200;
  });
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
  // on disk — newly created instances show up in "Todas" automatically, and
  // deleted ones vanish from wherever they were filed/starred.
  useEffect(() => {
    syncInstances(instances.map((i) => i.id));
  }, [instances, syncInstances]);

  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);

  // Which ids belong to the active sidebar view, and how (if at all) they can
  // be drag-reordered — favorites has no order of its own (it's a filter, not
  // a folder), so it always falls back to the master order and never drags.
  const { baseIds, reorderFn } = useMemo(() => {
    if (view.kind === "all") {
      return { baseIds: order.filter((id) => byId.has(id)), reorderFn: reorderAll };
    }
    if (view.kind === "folder") {
      return { baseIds: (folderOrder[view.id] ?? []).filter((id) => byId.has(id)), reorderFn: (next: string[]) => reorderInFolder(view.id, next) };
    }
    return { baseIds: order.filter((id) => pinned.includes(id) && byId.has(id)), reorderFn: null as ((next: string[]) => void) | null };
  }, [view, order, folderOrder, pinned, byId, reorderAll, reorderInFolder]);

  const canDrag = !!reorderFn;
  const displayIds = baseIds;

  useEffect(() => {
    localStorage.setItem(TILE_SIZE_KEY, String(tileSize));
  }, [tileSize]);

  // Fixed-width columns (no `1fr`) so a tile stays exactly the size you picked —
  // resizing / maximising the window only changes how many columns fit, not the
  // tiles themselves. Centred so there's no lopsided gap when they don't fill.
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fill, ${tileSize}px)`,
    justifyContent: "center",
  };

  const { handlersFor, draggedId } = useDragReorder({
    order: displayIds,
    onReorder: (next) => reorderFn?.(next),
  });

  const searching = search.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = search.trim().toLowerCase();
    return instances.filter((i) => i.name.toLowerCase().includes(q));
  }, [searching, search, instances]);

  const noDrag = {
    draggable: false,
    onDragStart: () => {},
    onDragOver: () => {},
    onDragLeave: () => {},
    onDrop: () => {},
    onDragEnd: () => {},
    isDragging: false,
    isDropTarget: false,
  };

  if (!isAuthenticated) return null;

  const renderTile = (id: string, allowDrag: boolean) => {
    const inst = byId.get(id);
    if (!inst) return null;
    return (
      <InstanceTile
        key={id}
        instance={inst}
        onClick={() => setLocation(`/modpack/${inst.id}`)}
        pinned={pinned.includes(inst.id)}
        onTogglePin={() => togglePin(inst.id)}
        drag={allowDrag ? handlersFor(id) : noDrag}
        onRemoveFromFolder={view.kind === "folder" ? () => moveInstance(inst.id, null) : undefined}
      />
    );
  };

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <div className="relative z-10 flex-1 flex flex-col min-h-0 px-6 pt-6 pb-4 gap-6">
        {/* Same floating glass-card treatment as the Perfil header — rounded-xl,
            bg-card/40, one scoped accent glow — instead of the old flush,
            square-cornered bar, so the two screens read as the same app. */}
        <div className="relative shrink-0 rounded-xl border border-white/10 bg-card/40 p-5 overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">Mis instancias</h1>
              <p className="text-xs text-muted-foreground">
                {instances.length} instancia{instances.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {instances.length > 0 && (
                <div className="flex items-center">
                  {searchOpen && (
                    <Input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onBlur={() => !search && setSearchOpen(false)}
                      onKeyDown={(e) => e.key === "Escape" && (setSearch(""), setSearchOpen(false))}
                      placeholder="Nombre de la instancia..."
                      className="h-9 w-52 text-sm mr-1"
                    />
                  )}
                  <Button
                    size="icon"
                    variant={searchOpen ? "secondary" : "ghost"}
                    className="h-9 w-9 shrink-0"
                    aria-label={searchOpen ? "Cerrar búsqueda" : "Buscar instancia"}
                    onClick={() => {
                      if (searchOpen) {
                        setSearch("");
                        setSearchOpen(false);
                      } else {
                        setSearchOpen(true);
                        setTimeout(() => searchRef.current?.focus(), 0);
                      }
                    }}
                  >
                    {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              {instances.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Tamaño de las instancias">
                      <Scaling className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56">
                    <p className="text-xs font-medium mb-3">Tamaño de las instancias</p>
                    <Slider
                      min={TILE_MIN}
                      max={TILE_MAX}
                      step={10}
                      value={[tileSize]}
                      onValueChange={([v]) => setTileSize(v)}
                    />
                  </PopoverContent>
                </Popover>
              )}

              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva instancia
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
        <main className="flex-1 overflow-y-auto">
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
              <p>Aún no tienes instancias.</p>
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Crea la primera
              </Button>
            </div>
          ) : searching ? (
            searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">Ninguna instancia coincide con "{search}".</p>
            ) : (
              <div className="grid gap-4" style={gridStyle}>
                {searchResults.map((inst) => renderTile(inst.id, false))}
              </div>
            )
          ) : displayIds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              {view.kind === "favorites" ? "No has destacado ninguna instancia todavía." : "Esta carpeta está vacía."}
            </p>
          ) : (
            <div className="grid gap-4" style={gridStyle}>
              {displayIds.map((id) => renderTile(id, canDrag))}
            </div>
          )}
        </main>

        <HubSidebar
          view={view}
          onSelectView={setView}
          countAll={instances.length}
          countFavorites={instances.filter((i) => pinned.includes(i.id)).length}
          countForFolder={(folderId) => instances.filter((i) => placement[i.id] === folderId).length}
          onNewFolder={() => setNewFolderOpen(true)}
          draggedInstanceId={draggedId}
          onDropInstance={(instanceId, folderId) => moveInstance(instanceId, folderId)}
        />
        </div>
      </div>

      <NewInstanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => setLocation(`/modpack/${id}`)}
      />
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={createFolder} />

      <footer className="relative z-20 h-20 border-t border-white/5 bg-card/50 backdrop-blur flex items-center px-6 shrink-0">
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && (
            <div className="relative">
              <ChatBubbleRow />
              <ChatWindow
                myUuid={uuid}
                myUsername={username ?? ""}
                currentPackId={lastPackId ?? ""}
                defaultMode={{ type: "general" }}
              />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
