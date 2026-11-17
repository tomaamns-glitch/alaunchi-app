import { ChristmasLights } from "@/components/christmas-decorations";
import { Hint } from "@/components/hint";
import { CuriositiesCard } from "@/components/curiosities-card";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import { Box, Compass, Plus, SlidersHorizontal } from "lucide-react";
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
import { CURSEFORGE_IMPORT_ENABLED, CurseForgeImportDialog, CurseForgeLogo } from "@/components/curseforge-import-dialog";
import { HubToolbar, SORT_OPTIONS, pillButtonClass, type HubLayout, type HubSort, type HubStatus } from "@/components/hub-toolbar";
import { useRunningInstanceIds } from "@/hooks/use-instance-run-state";
import { Slider } from "@/components/ui/slider";

// Minimum tile width in px. The grid uses `repeat(auto-fill, minmax(SIZE, 1fr))`:
// columns reflow when the window is resized, and the row always spans the full
// width between the page's side margins.
const TILE_SIZE_KEY = "alaunchi_hub_tile_size";
const TILE_MIN = 140;
const TILE_MAX = 340;
const SORT_KEY = "alaunchi_hub_sort";
const LAYOUT_KEY = "alaunchi_hub_layout";

const LOADER_LABELS: Record<string, string> = {
  vanilla: "Vanilla",
  forge: "Forge",
  neoforge: "NeoForge",
  fabric: "Fabric",
  quilt: "Quilt",
};

/** Newest Minecraft version first ("1.21.4" before "1.21", before "1.20.6"). */
function compareMcVersionsDesc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

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
  // Toolbar: sort and layout are remembered; the filters start clear every time.
  const [sort, setSort] = useState<HubSort>(() => {
    const saved = localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some((o) => o.id === saved) ? (saved as HubSort) : "custom";
  });
  const [layout, setLayout] = useState<HubLayout>(() => (localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid"));
  const [versionFilter, setVersionFilter] = useState("all");
  const [loaderFilter, setLoaderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<HubStatus>("all");
  const runningIds = useRunningInstanceIds();
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutsideClick([sizeRef], () => setSizeOpen(false), sizeOpen);
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

  const displayIds = baseIds;

  useEffect(() => {
    localStorage.setItem(TILE_SIZE_KEY, String(tileSize));
  }, [tileSize]);
  useEffect(() => {
    localStorage.setItem(SORT_KEY, sort);
  }, [sort]);
  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  // Filter options come from the instances you actually have.
  const versionOptions = useMemo(
    () => [...new Set(instances.map((i) => i.minecraftVersion).filter(Boolean))].sort(compareMcVersionsDesc),
    [instances]
  );
  const loaderOptions = useMemo(() => {
    const ids = [...new Set(instances.map((i) => (i.loaderType || "vanilla").toLowerCase()))];
    return ids.sort().map((id) => ({ id, label: LOADER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1) }));
  }, [instances]);
  // A filter whose value disappeared (its last instance deleted) goes back to "all".
  useEffect(() => {
    if (versionFilter !== "all" && !versionOptions.includes(versionFilter)) setVersionFilter("all");
  }, [versionFilter, versionOptions]);
  useEffect(() => {
    if (loaderFilter !== "all" && !loaderOptions.some((o) => o.id === loaderFilter)) setLoaderFilter("all");
  }, [loaderFilter, loaderOptions]);

  const searching = search.trim().length > 0;
  const filtering = versionFilter !== "all" || loaderFilter !== "all" || statusFilter !== "all";
  // Search looks through every instance (not only the current folder); the
  // filters and the sort apply on top of whatever is listed.
  const shownIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (q ? instances.filter((i) => i.name.toLowerCase().includes(q)).map((i) => i.id) : displayIds)
      .map((id) => byId.get(id))
      .filter((i): i is NonNullable<typeof i> => !!i);
    if (versionFilter !== "all") list = list.filter((i) => i.minecraftVersion === versionFilter);
    if (loaderFilter !== "all") list = list.filter((i) => (i.loaderType || "vanilla").toLowerCase() === loaderFilter);
    if (statusFilter === "running") list = list.filter((i) => runningIds.has(i.id));
    else if (statusFilter === "downloaded") list = list.filter((i) => i.isDownloaded);
    else if (statusFilter === "created") list = list.filter((i) => !i.isDownloaded);
    else if (statusFilter === "unplayed") list = list.filter((i) => !i.totalPlaytimeMs || i.totalPlaytimeMs < 60000);
    if (sort === "recent") list = [...list].sort((a, b) => (b.installedAt ?? 0) - (a.installedAt ?? 0));
    else if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    else if (sort === "played") list = [...list].sort((a, b) => (b.totalPlaytimeMs ?? 0) - (a.totalPlaytimeMs ?? 0));
    return list.map((i) => i.id);
  }, [search, instances, displayIds, byId, versionFilter, loaderFilter, statusFilter, runningIds, sort]);

  // Dragging reorders the whole folder/list, so only on the plain custom order
  // with nothing hidden.
  const canDrag = !!reorderFn && sort === "custom" && !searching && !filtering;

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

  // Tile size (grid only): the slider slides out to the button's right. A click
  // anywhere else folds it back (useDismissOnOutsideClick above).
  const sizeControl = (
    <div ref={sizeRef} className="flex items-center">
      <Hint label="Tamaño de las instancias">
        <button
          type="button"
          onClick={() => setSizeOpen((v) => !v)}
          className={pillButtonClass(false, sizeOpen)}
          aria-label="Tamaño de las instancias"
          aria-expanded={sizeOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
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
            <div className="flex h-8 w-[168px] items-center pl-3 pr-2">
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
  );

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
        layout={layout}
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
            <div className="flex items-center gap-3 min-w-0">
              {/* The page's icon, in the accent. */}
              <Box className="h-10 w-10 shrink-0 text-accent drop-shadow-[0_0_10px_hsl(var(--accent)/0.35)]" strokeWidth={1.75} aria-hidden />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">Mis instancias</h1>
                {/* Divider between the title and the count, like the instance manager's header. */}
                <div className="my-1 h-px w-full bg-white/10" aria-hidden />
                <p className="text-xs text-muted-foreground">
                  {instances.length} instancia{instances.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {/* Importar, Explorar and Nueva instancia; search, filters and tile size are in the toolbar below. */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-3">
                {/* Importar instancias de CurseForge (hidden for now: CURSEFORGE_IMPORT_ENABLED). */}
                {CURSEFORGE_IMPORT_ENABLED && (
                <Button
                  variant="outline"
                  className="h-11 px-5 gap-2.5 text-sm font-semibold [&_svg]:size-5 border-white/10"
                  onClick={() => setCurseForgeOpen(true)}
                >
                  <CurseForgeLogo className="h-5 w-5 text-[#F16436]" /> Importar de CurseForge
                </Button>
                )}
                {/* Explorar: Modrinth content and creators (pages/explore.tsx). */}
                <Button
                  variant="outline"
                  className="h-11 px-5 gap-2.5 text-sm font-semibold [&_svg]:size-5 border-white/10"
                  onClick={() => setLocation("/explore")}
                >
                  <Compass className="h-5 w-5" /> Explorar
                </Button>
                {/* The page's only colored button. */}
                <Button
                  data-tour="hub-new-instance"
                  // border-transparent: the default variant keeps the orange primary border.
                  className="h-11 px-5 gap-2.5 text-sm font-semibold [&_svg]:size-5 bg-accent text-accent-foreground hover:bg-accent/90 border-transparent"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="h-5 w-5" /> Nueva instancia
                </Button>
              </div>
            </div>
          </div>
        </div>

        {instances.length > 0 && (
          <HubToolbar
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
            version={versionFilter}
            onVersionChange={setVersionFilter}
            versions={versionOptions}
            loader={loaderFilter}
            onLoaderChange={setLoaderFilter}
            loaders={loaderOptions}
            status={statusFilter}
            onStatusChange={setStatusFilter}
            layout={layout}
            onLayoutChange={setLayout}
            extra={layout === "grid" ? sizeControl : null}
          />
        )}

        <div className="flex-1 flex min-h-0">
        <main ref={gridAreaRef} className="flex-1 overflow-y-auto" data-tour="hub-instances">
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
              <p>Aún no tienes instancias.</p>
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Crea la primera
              </Button>
            </div>
          ) : shownIds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              {searching
                ? `Ninguna instancia coincide con "${search}".`
                : filtering
                  ? "Ninguna instancia coincide con los filtros."
                  : view.kind === "favorites"
                    ? "No has destacado ninguna instancia todavía."
                    : "Esta carpeta está vacía."}
            </p>
          ) : layout === "list" ? (
            <div className="flex flex-col gap-2">
              {shownIds.map((id) => renderTile(id, canDrag))}
            </div>
          ) : (
            <div className="grid gap-4" style={gridStyle}>
              {shownIds.map((id) => renderTile(id, canDrag))}
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
        {/* December: fairy lights along the top edge (lib/christmas.ts). */}
        <ChristmasLights edge="top" />
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
