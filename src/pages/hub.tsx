import { Hint } from "@/components/hint";
import { CuriositiesCard } from "@/components/curiosities-card";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import { Compass, LayoutGrid, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceFolders } from "@/hooks/use-instance-folders";
import { useDragReorder } from "@/hooks/use-drag-reorder";
import { AccountMenuButton } from "@/components/account-menu-button";
import { ChatButton } from "@/components/chat-button";
import { ChatWindow } from "@/components/chat-window";
import { GroupChatNotifications } from "@/components/instance-group-chat";
import { ActivityButton } from "@/components/activity-button";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";
import { NewInstanceDialog } from "@/components/new-instance-dialog";
import { NewFolderDialog } from "@/components/new-folder-dialog";
import { HubSidebar, type HubView } from "@/components/hub-sidebar";
import { InstanceTile } from "@/components/hub-tile";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/app-background";
import { CurseForgeImportDialog, CurseForgeLogo } from "@/components/curseforge-import-dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

// Minimum tile width in px. The grid uses `repeat(auto-fill, minmax(SIZE, 1fr))`:
// columns reflow when the window is resized, and the row always spans the full
// width between the page's side margins.
const TILE_SIZE_KEY = "alaunchi_hub_tile_size";
const TILE_MIN = 140;
const TILE_MAX = 340;

export default function Hub() {
  const [curseForgeOpen, setCurseForgeOpen] = useState(false);
  const { isAuthenticated, username, uuid } = useAuth();
  const [, setLocation] = useLocation();
  const { instances, loaded: instancesLoaded, loadInstances } = useCustomInstances();
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
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutsideClick([sizeRef], () => setSizeOpen(false), sizeOpen);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tileSize, setTileSize] = useState(() => {
    const raw = Number(localStorage.getItem(TILE_SIZE_KEY));
    return raw >= TILE_MIN && raw <= TILE_MAX ? raw : 200;
  });
  // Same global store home.tsx uses — keeps the presence popup and the skin
  // panel (elsewhere) mutually exclusive across both pages for free.
  const activePopup = useHeaderOverlay((s) => s.active);
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (isAuthenticated) loadInstances();
  }, [isAuthenticated, loadInstances]);

  // Keeps the folders store's bookkeeping honest against what actually exists
  // on disk — newly created instances show up in "Todas" automatically, and
  // deleted ones vanish from wherever they were filed/starred. Only after a real
  // read from disk: on startup `instances` is still the empty initial list, and
  // syncing against it pruned every folder placement/star/order on each restart.
  useEffect(() => {
    if (!instancesLoaded) return;
    syncInstances(instances.map((i) => i.id));
  }, [instances, instancesLoaded, syncInstances]);

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

  // The size you pick is each tile's minimum width: as many columns as fit, then
  // they stretch a little to fill the row. Fixed-width centred columns left the
  // spare width as side gaps that changed with every size (the grid never lined
  // up with the header's left edge nor kept the sidebar's 24px on the right).
  // auto-fill keeps empty tracks, so a short row doesn't blow its tiles up.
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`,
  };

  // Since tiles stretch to fill the row, only the number of columns really changes
  // their size — a slider in px had long stretches that did nothing. So it moves
  // through column counts (right = fewer, bigger tiles), each step setting the
  // smallest size that gives exactly that many columns. GRID_GAP = gap-4.
  const GRID_GAP = 16;
  const [gridW, setGridW] = useState(0);
  const gridAreaRef = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const update = () => setGridW(node.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const colsFor = (size: number) => Math.max(1, Math.floor((gridW + GRID_GAP) / (size + GRID_GAP)));
  const sizeForCols = (cols: number) =>
    Math.min(TILE_MAX, Math.max(TILE_MIN, Math.floor((gridW - GRID_GAP * (cols - 1)) / cols)));
  const minCols = colsFor(TILE_MAX);
  const maxCols = Math.max(minCols, colsFor(TILE_MIN));
  const currentCols = Math.min(maxCols, Math.max(minCols, colsFor(tileSize)));

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
      {/* Animated background, under every card (z-0). */}
      <AppBackground />
      <div className="relative z-10 flex-1 flex flex-col min-h-0 px-6 pt-6 pb-4 gap-6">
        {/* A glass bar flush with the window's top and sides (cancels the page's px-6 / pt-6),
            with one scoped accent glow; px-6 inside keeps its content lined up with the grid. */}
        <div className="relative shrink-0 -mx-6 -mt-6 rounded-none border-0 bg-gray-500/10 backdrop-blur-md px-6 py-2.5 overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">Mis instancias</h1>
              {/* Divider between the title and the count, like the instance manager's header. */}
              <div className="my-1 h-px w-full bg-white/10" aria-hidden />
              <p className="text-xs text-muted-foreground">
                {instances.length} instancia{instances.length === 1 ? "" : "s"}
              </p>
            </div>

            {/* Importar + Nueva instancia on top; search and tile size right under them. */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1.5">
                {/* Importar instancias de CurseForge. */}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 gap-1.5"
                  onClick={() => setCurseForgeOpen(true)}
                >
                  <CurseForgeLogo className="h-3.5 w-3.5 text-[#F16436]" /> Importar de CurseForge
                </Button>
                {/* Explorar: Modrinth content and creators (pages/explore.tsx). */}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 gap-1.5"
                  onClick={() => setLocation("/explore")}
                >
                  <Compass className="h-3.5 w-3.5" /> Explorar
                </Button>
                {/* The page's only colored button. */}
                <Button
                  size="sm"
                  data-tour="hub-new-instance"
                  // border-transparent: the default variant keeps the orange primary border.
                  className="bg-accent text-accent-foreground hover:bg-accent/90 border-transparent"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva instancia
                </Button>
              </div>
              {instances.length > 0 && (
                <div className="flex items-center">
                  {/* Search + tile size side by side, with a thin line between them. Opening the
                      search, the box grows out to the magnifier's right — pushing it left. */}
                  <div className="flex items-center">
                  <Hint label={searchOpen ? "Cerrar búsqueda" : "Buscar instancia"}>
                    <Button
                      size="icon"
                      variant="ghost"
                      // No box around it, open or not: just the icon (accent while searching).
                      className={`h-8 w-8 shrink-0 hover:bg-transparent focus-visible:ring-0 ${searchOpen ? "text-accent hover:text-accent" : "text-muted-foreground hover:text-foreground"}`}
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
                      <Search className="h-4 w-4" />
                    </Button>
                  </Hint>
                  <AnimatePresence initial={false}>
                    {searchOpen && (
                      <motion.div
                        key="search-box"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 216, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="pl-1 pr-0.5">
                          <Input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onBlur={() => !search && setSearchOpen(false)}
                            onKeyDown={(e) => e.key === "Escape" && (setSearch(""), setSearchOpen(false))}
                            placeholder="Nombre de la instancia..."
                            className="h-8 w-[208px] text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden />
                {/* Tile size: like the search, the slider slides out to the button's right.
                    A click anywhere else folds it back (useDismissOnOutsideClick below). */}
                <div ref={sizeRef} className="flex items-center">
                <Hint label="Tamaño de las instancias">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSizeOpen((v) => !v)}
                    className={`h-8 w-8 shrink-0 hover:bg-transparent focus-visible:ring-0 ${sizeOpen ? "text-accent hover:text-accent" : "text-muted-foreground hover:text-foreground"}`}
                    aria-label="Tamaño de las instancias"
                    aria-expanded={sizeOpen}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </Hint>
                <AnimatePresence initial={false}>
                  {sizeOpen && (
                    <motion.div
                      key="size-box"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 168, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="flex h-8 w-[168px] items-center pl-2 pr-1">
                        <Slider
                          // Column counts, mirrored so dragging right means bigger tiles.
                          min={minCols}
                          max={maxCols}
                          step={1}
                          disabled={gridW === 0 || minCols === maxCols}
                          // The app accent instead of the yellow/orange primary (track, fill, thumb, focus ring).
                          className="[&>span:first-child]:bg-white/10 [&>span:first-child>span]:bg-accent [&_[role=slider]]:border-accent/70 [&_[role=slider]]:focus-visible:ring-0"
                          value={[minCols + maxCols - currentCols]}
                          onValueChange={([v]) => setTileSize(sizeForCols(minCols + maxCols - v))}
                          aria-label="Tamaño de las instancias"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
        <main ref={gridAreaRef} className="flex-1 overflow-y-auto" data-tour="hub-instances">
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
      <CurseForgeImportDialog open={curseForgeOpen} onOpenChange={setCurseForgeOpen} />
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={createFolder} />

      {/* Rotating tips, just above the footer's left end. */}
      <CuriositiesCard className="bottom-24 left-5" />

      <footer className="relative z-20 h-20 [transform:translateZ(0)] flex items-center justify-between px-6 shrink-0">
        {/* The blur in a layer of its own: on the footer itself, the chat windows
            inside it couldn't blur the page behind them (backdrop root). The
            transform keeps `fixed` descendants relative to the footer, as the blur did. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gray-500/10 backdrop-blur-xl" />
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && (
            <div className="relative">
              <ChatButton />
              <ChatWindow myUuid={uuid} myUsername={username ?? ""} defaultMode={{ type: "general" }} />
            </div>
          )}
        </div>
        {/* Someone wrote in one of your online instances' group chats; Actividad at the far right. */}
        <div className="flex items-center gap-2">
          {uuid && <GroupChatNotifications myUuid={uuid} myUsername={username ?? ""} />}
          {uuid && (
            <ActivityButton
              open={activePopup === "presence"}
              onOpenChange={(next) => (next ? openOverlay("presence") : closeOverlay())}
            />
          )}
        </div>
      </footer>
    </div>
  );
}
