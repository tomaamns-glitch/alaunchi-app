import { Hint } from "@/components/hint";
import { memo, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { InstanceSettingsDialog } from "@/components/instance-settings-dialog";
import { ModLibraryDialog } from "@/components/mod-library-dialog";
import { FlipList } from "@/components/flip-list";
import { ShareImageDialog, type ShareableImage } from "@/components/share-image-dialog";
import { ShareInstanceDialog } from "@/components/share-instance-dialog";
import { ManagerTour } from "@/components/manager-tour";
import { ContentContextMenu, RenameContentDialog, ShareContentDialog, type ContentToShare } from "@/components/content-context-menu";
import { DuplicateInstanceDialog } from "@/components/duplicate-instance-dialog";
import { addToGallery, saveContent, showInstanceFile, type SavedContentCategory } from "@/services/personal-library";
import { onContentLockPurged } from "@/services/electron";
import { getMySource, sameRepo } from "@/lib/sources";
import {
  fetchLibraryMod,
  identifyLibraryFiles,
  isLibraryProjectId,
  isLibraryVersionId,
  libraryBuildAsUpdate,
  libraryMatch,
  libraryModIdOf,
  libraryProjectDetail,
  libraryVersionsFor,
  compatibleBuild,
} from "@/services/mod-library";
import { InstanceProgressChip } from "@/components/instance-progress-chip";
import { useInstanceProgress } from "@/hooks/use-instance-progress";
import { ListScrollbar } from "@/components/list-scrollbar";
import { openCrashDiagnosis, useCrashDiagnosis } from "@/lib/crash-diagnosis";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { isFavorite, toggleFavorite } from "@/services/favorites";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Layers,
  Library,
  Check,
  X,
  Loader2,
  Package,
  Sparkles,
  Image as ImageIcon,
  FileQuestion,
  FileText,
  History,
  List,
  Download,
  Lock,
  RefreshCw,
  Play,
  Heart,
  MoreVertical,
  Settings2,
  Stethoscope,
  FolderOpen,
  Send,
  Share2,
  Copy,
  Smile,
  Store,
  Box,
  Eye,
  Globe,
  WifiOff,
  UploadCloud,
  Camera,
  Trash2,
  Square,
  Link2,
  CornerUpLeft,
  Gamepad2,
  Clock,
} from "lucide-react";
import { SnapshotEntry, fetchSnapshot, snapshotBaseUrl, type SnapshotManifest } from "@/services/github";
import { OptionalContentView } from "@/components/optional-content-view";
import { splitOptionalGroups } from "@/components/optional-groups-dialog";
import {
  identifyModrinthFiles,
  getLatestVersion,
  getProjectDetail,
  getProjectInfo,
  getProjectsInfo,
  getRequiredDependencies,
  getVersionsByIds,
  listVersions,
  searchProjects,
  fetchCategoryTags,
  categoryOf,
  categorize,
  fileName,
  guessTitle,
  SEARCH_PAGE_SIZE,
  type ModrinthMatch,
  type ModrinthUpdate,
  type ModrinthProjectDetail,
  type ModrinthSearchHit,
  type ModrinthDependency,
  type ModrinthSort,
  type InstallableCategory,
} from "@/services/modrinth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { HTML_SANITIZE_SCHEMA } from "@/lib/markdown-schema";
import { ModrinthSummary } from "@/components/modrinth-summary";
import { ModrinthVersions } from "@/components/modrinth-versions";
import { DownloadedPackDetails } from "@/components/downloaded-pack-details";
import {
  listInstanceFiles,
  deleteInstanceFile,
  updateInstanceFile,
  downloadInstanceFile,
  getInstalledModpacksMeta,
  openInstanceFolder,
  listEmotes,
  listSchematics,
  listScreenshots,
  readInstanceFile,
  renameInstanceFile,
  classifyDroppedFile,
  writeInstanceFile,
  deleteInstance as deleteInstanceIpc,
  setModEnabled,
  DISABLED_SUFFIX,
  installSnapshot,
  type OptionalGroupChoice,
  type InstanceFile,
  type EmoteFile,
  type SchematicFile,
  type ScreenshotFile,
  type ContentClassification,
} from "@/services/electron";
import { ImageLightbox } from "@/components/image-lightbox";
import { resolveContentConflict, resolveNoIdentityConflict, type ConflictResolution } from "@/lib/content-conflict";
import { translateHtmlAwareToSpanish } from "@/services/translate";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { runStateBusyLabel } from "@/hooks/use-instance-run-state";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";
import { useAuth } from "@/hooks/use-auth";
import { usePlayerSkinUrl } from "@/hooks/use-player-head";
import { useEmotePreview } from "@/hooks/use-emote-preview";
import { bytesToBase64 } from "@/lib/emotecraft";
import { EmotePreviewDialog } from "@/components/emote-preview-dialog";
import { useSchematicPreview } from "@/hooks/use-schematic-preview";
import { useSchematicResources } from "@/hooks/use-schematic-resources";
import { SchematicViewer3D } from "@/components/schematic-viewer-3d";
import {
  searchSchematicsOnline,
  getSchematicPostDetail,
  listSchematicFiles,
  targetPathForSchematicFile,
  type MinemevSearchHit,
  type MinemevPostDetail,
  type MinemevFile,
} from "@/services/minemev";
import { findPackSource, requirePackSource } from "@/hooks/use-modpacks";
import { ContentSidePanels } from "@/components/content-side-panels";
import { contentColumns, useOnlinePanels, useWideLayout, type PanelColumn } from "@/lib/online-panels";
import { getLastViewPath } from "@/lib/last-view";
import SwellLight from "@/components/swell-light";
import { StaticGlow } from "@/components/static-glow";
import { useAnimatedBackground } from "@/lib/animated-background";
import { useTheme } from "@/lib/theme";
import { extractDominantColor, type HSL } from "@/lib/dominant-color";
import { useAdaptiveColor } from "@/lib/adaptive-color";
import { loadRecentUpdates, recordRecentUpdate, type RecentUpdates } from "@/lib/recent-updates";
import { formatBytes, formatPlaytime, formatPlaytimeShort } from "@/lib/format";
import { toast, notify } from "@/lib/toast";
import { SiModrinth } from "react-icons/si";

type Category = InstallableCategory;
type ModDetailTab = "description" | "gallery" | "versions" | "dependencies";

const CATEGORY_META: Record<Category, { label: string; icon: typeof Package }> = {
  mods: { label: "Mods", icon: Package },
  shaderpacks: { label: "Shaders", icon: Sparkles },
  resourcepacks: { label: "Resource Packs", icon: ImageIcon },
};

// Mod descriptions on Modrinth often embed raw HTML (social-button rows, centered
// banners) — HTML_SANITIZE_SCHEMA keeps the inline style/align they rely on.


// Stability color scale for a version's release channel — green is the most
// stable (release), red the least (alpha) — with a single-letter badge.
const VERSION_TYPE_META: Record<"release" | "beta" | "alpha", { letter: string; className: string }> = {
  release: { letter: "R", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  beta: { letter: "B", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  alpha: { letter: "A", className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

/** Hides X-ray-named content from the add-content search when the pack has
 *  antiXray enabled — matches "xray" as a substring, case-insensitive, so
 *  "yumpXray" is caught too, not just an exact "xray" name. */
function filterAntiXray<T extends { title: string }>(hits: T[], antiXray: boolean | undefined): T[] {
  if (!antiXray) return hits;
  return hits.filter((h) => !h.title.toLowerCase().includes("xray"));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

const sweepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 18 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -dir * 18 }),
};

interface ContentRow {
  path: string;
  size: number;
  mandatory: boolean;
  /** Turned off by the player (on disk as "<path>.disabled"; `path` stays the
   *  enabled name so every map keyed by path keeps working). */
  disabled: boolean;
  /** An optional pack file that isn't on disk. */
  notInstalled: boolean;
}

interface InstalledContentRowProps {
  path: string;
  category: Category;
  mandatory: boolean;
  /** Not from Modrinth nor ALaunchi's library (looked up by hash): the launcher can't update or download it. */
  external: boolean;
  title: string;
  match: ModrinthMatch | undefined;
  update: ModrinthUpdate | undefined;
  busy: boolean;
  /** Titles of the installed mods that require this one, if any. */
  dependentTitles: string[] | undefined;
  /** Mount with the shared-layout ids from the start — the row the mod panel
   *  was last opened from, so closing the panel animates back into it. */
  sharedLayout: boolean;
  /** Required dependencies of this mod that aren't installed. */
  missingDeps: MissingDep[] | undefined;
  /** Shows the on/off switch (optional mods of an unlocked instance). */
  canToggle: boolean;
  /** Set when the switch is shown but can't be turned off — why not. */
  toggleLockedReason: string | undefined;
  /** Optional pack file not on disk (unpicked optional group / deleted). */
  notInstalled: boolean;
  disabled: boolean;
  onToggle: (path: string, enabled: boolean) => void;
  onOpen: (path: string) => void;
  onUpdate: (category: Category, path: string) => void;
  onDelete: (category: Category, path: string) => void;
  /** Right-click: save a copy to the personal library / send it to a friend. */
  onSave: (category: Category, path: string) => void;
  onShare: (category: Category, path: string) => void;
  /** Ticked in the row's check (shown on hover, always while ticked). */
  marked: boolean;
  /** Something in the list is ticked: every row shows its check. */
  selecting: boolean;
  onMarkToggle: (path: string) => void;
  onInstallMissing: (deps: MissingDep[]) => Promise<void>;
}

interface MissingDep {
  projectId: string;
  title: string;
  iconUrl: string | null;
}

/** Yellow warning next to a mod's name when some of its required dependencies
 *  aren't installed. Opens on hover (like a tooltip) and on click; a Popover
 *  rather than a Tooltip so the install buttons inside stay reachable — closing
 *  is delayed a bit so the pointer can travel from the icon into the panel. */
function MissingDepsWarning({
  deps,
  onInstall,
}: {
  deps: MissingDep[];
  onInstall: (deps: MissingDep[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // Once everything installs this whole warning unmounts; the flag only needs
  // resetting when something couldn't be installed.
  const [installing, setInstalling] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label="Faltan dependencias">
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            onPointerEnter={show}
            onPointerLeave={hideSoon}
            aria-label="Faltan dependencias"
            className="h-5 w-5 flex items-center justify-center rounded text-yellow-400 hover:bg-yellow-400/15 shrink-0"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-72 p-3"
        onPointerEnter={show}
        onPointerLeave={hideSoon}
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
          {deps.length === 1 ? "Le falta una dependencia:" : `Le faltan ${deps.length} dependencias:`}
        </p>
        <div className="flex flex-col gap-1.5 mb-3">
          {deps.map((d) => (
            <div key={d.projectId} className="flex items-center gap-2 min-w-0">
              {d.iconUrl ? (
                <img src={d.iconUrl} alt="" className="h-6 w-6 rounded shrink-0 object-cover bg-black/30" />
              ) : (
                <div className="h-6 w-6 rounded shrink-0 bg-black/30 flex items-center justify-center">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              <span className="text-xs truncate">{d.title}</span>
            </div>
          ))}
        </div>
        <Button size="sm" className="w-full h-8 text-xs" disabled={installing}
          onClick={async () => {
            setInstalling(true);
            try {
              await onInstall(deps);
            } finally {
              setInstalling(false);
            }
          }}
        >
          {installing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          {deps.length === 1 ? "Instalar" : "Instalar todas"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** One row of the installed-content list. Memoized (with stable callbacks from
 *  the page) so a 200-mod list doesn't re-render on every unrelated state change
 *  of the page. The icon/title only become framer-motion `layoutId` elements
 *  once the row is pressed (or when `sharedLayout`): with every row carrying
 *  them, framer measured hundreds of nodes on each mount/update and switching
 *  tabs froze the UI for seconds. Not on hover either — see `armed`. */
const SCHEMATIC_EXT = /\.(litematic|schematic|schem|nbt)$/i;

const SCHEMATIC_TYPE: Record<string, string> = {
  litematic: "Archivo .litematic",
  schem: "Archivo .schem (Sponge)",
  schematic: "Archivo .schematic (MCEdit)",
  nbt: "Archivo .nbt (estructura)",
};

/** One installed schematic, laid out like a mod/shader row (InstalledContentRow):
 *  icon, name + format, the file's path in mono, and the same action capsule. */
function SchematicRow({
  file,
  busy,
  onOpen,
  onDelete,
  onSave,
  onShare,
  onRename,
}: {
  file: SchematicFile;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onSave: () => void;
  onShare: () => void;
  onRename: () => void;
}) {
  const base = file.path.slice(file.path.lastIndexOf("/") + 1);
  const ext = base.match(SCHEMATIC_EXT)?.[1]?.toLowerCase();
  const name = base.replace(SCHEMATIC_EXT, "");
  return (
    <ContentContextMenu onSave={onSave} onShare={onShare} onRename={onRename}>
    <div className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full [content-visibility:auto] [contain-intrinsic-size:auto_66px] relative border border-accent/15 hover:border-accent/35 transition-colors before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.55),transparent)]">
      <div onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
        <div className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center">
          <Box className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-gray-100 font-medium text-base truncate">{name}</p>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent shrink-0">
              {file.source === "worldedit" ? "WorldEdit" : "Litematica"}
            </span>
          </div>
          {/* Where a mod shows its file name: the schematic's file type. */}
          <p className="text-muted-foreground text-[11px] truncate" title={file.path}>
            {ext ? SCHEMATIC_TYPE[ext] ?? `.${ext}` : "Esquema"}
          </p>
        </div>
      </div>
      <div className="flex items-center shrink-0 rounded-lg border border-white/15 bg-white/[0.03] p-0.5">
        <Hint label="Ver en 3D">
          <button
            type="button"
            onClick={onOpen}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
        </Hint>
        <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
        <Hint label="Eliminar">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        </Hint>
      </div>
    </div>
    </ContentContextMenu>
  );
}

const InstalledContentRow = memo(function InstalledContentRow({
  path,
  category,
  mandatory,
  external,
  title,
  match,
  update,
  busy,
  dependentTitles,
  sharedLayout,
  missingDeps,
  canToggle,
  toggleLockedReason,
  notInstalled,
  disabled,
  onToggle,
  onOpen,
  onUpdate,
  onDelete,
  onSave,
  onShare,
  onInstallMissing,
  marked,
  selecting,
  onMarkToggle,
}: InstalledContentRowProps) {
  // Shared-layout ids only from the moment the row is pressed (the click that
  // opens the mod panel always starts with a press). It used to be on hover,
  // but scrolling the list with the wheel moves rows under a still cursor:
  // every row crossing it re-rendered, mounted framer layout nodes (layout
  // reads + a projection pass) and sometimes flew its icon in from where it
  // was before the scroll — that was the jank while scrolling long lists.
  const [armed, setArmed] = useState(false);
  const shared = sharedLayout || armed;
  // The mark check shows on hover through CSS (group-hover), no state.
  const showCheck = marked || selecting;
  const CategoryIcon = CATEGORY_META[category].icon;
  const isDependency = !!dependentTitles?.length;
  return (
    <ContentContextMenu onSave={() => onSave(category, path)} onShare={() => onShare(category, path)}>
    <div
      data-flip-key={path}
      onPointerDown={() => setArmed(true)}
      onPointerLeave={armed ? () => setArmed(false) : undefined}
      className="group/row flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full [content-visibility:auto] [contain-intrinsic-size:auto_66px] relative border border-accent/15 hover:border-accent/35 transition-colors before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.55),transparent)]"
    >
      {/* The mark check: no width while hidden (the -mr cancels the row's gap),
          so on hover the icon and name slide right to make room for it. */}
      <div
        className={`shrink-0 flex items-center overflow-hidden transition-[width,margin,opacity] duration-200 ease-out ${
          showCheck ? "w-4 opacity-100" : "w-0 -mr-3 opacity-0 group-hover/row:w-4 group-hover/row:mr-0 group-hover/row:opacity-100"
        }`}
      >
        <Checkbox
          checked={marked}
          onCheckedChange={() => onMarkToggle(path)}
          tabIndex={showCheck ? 0 : -1}
          aria-label={marked ? "Desmarcar" : "Marcar"}
          // The instance's accent (like Jugar), not the theme's orange primary.
          className="border-white/40 data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-foreground [&_svg]:h-3.5 [&_svg]:w-3.5"
        />
      </div>
      <div
        onClick={() => match && onOpen(path)}
        className={`flex items-center gap-3 min-w-0 flex-1 transition-opacity ${match ? "cursor-pointer" : ""} ${
          disabled || notInstalled ? "opacity-45 grayscale" : ""
        }`}
      >
        {/* Dependency: a chain seal on the icon's corner (who needs it: the counter by the name). */}
        <div className="relative shrink-0">
        {match?.iconUrl ? (
          shared ? (
            <motion.img
              layoutId={`icon-${path}`}
              src={match.iconUrl}
              alt=""
              className="h-11 w-11 rounded shrink-0 object-cover bg-black/30"
            />
          ) : (
            <img
              src={match.iconUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-11 w-11 rounded shrink-0 object-cover bg-black/30"
            />
          )
        ) : match && shared ? (
          <motion.div
            layoutId={`icon-${path}`}
            className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center"
          >
            <CategoryIcon className="h-5 w-5 text-muted-foreground" />
          </motion.div>
        ) : match ? (
          <div className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center">
            <CategoryIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center">
            <CategoryIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        {isDependency && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1.5 -bottom-1.5 h-[18px] w-[18px] rounded-full bg-accent text-accent-foreground ring-2 ring-card flex items-center justify-center"
          >
            <Link2 className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {match && shared ? (
              <motion.p layoutId={`title-${path}`} className="text-gray-100 font-medium text-base truncate">
                {match.title}
              </motion.p>
            ) : (
              <p className="text-gray-100 font-medium text-base truncate">{title}</p>
            )}
            {external && !notInstalled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 cursor-default text-red-500" aria-label="No es de Modrinth ni de ALaunchi">
                    <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Este archivo no es de Modrinth ni de ALaunchi: el launcher no puede darle actualizaciones ni descargarlo.
                </TooltipContent>
              </Tooltip>
            )}
            {(disabled || notInstalled) && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                {notInstalled ? "No instalado" : "Desactivado"}
              </span>
            )}
            {!disabled && !notInstalled && !!missingDeps?.length && (
              <MissingDepsWarning deps={missingDeps} onInstall={onInstallMissing} />
            )}
            {isDependency && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0 cursor-default">
                    <CornerUpLeft className="h-3 w-3 shrink-0" />
                    {dependentTitles!.length === 1 ? "1 mod" : `${dependentTitles!.length} mods`}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">Lo necesitan:</p>
                  <ul className="list-disc pl-4">
                    {dependentTitles!.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-muted-foreground text-[11px] font-mono truncate select-text">{fileName(path)}</p>
        </div>
      </div>
      {/* Update · on/off · delete as one capsule with lines between them (like
          the ⋮ menu). Every slot is always there so the columns line up row
          after row: ↻ is faint until there's a new version (then an accent
          dot marks it), and on files the modpack requires ✕ becomes a lock. */}
      {(category === "mods" || (!mandatory && !notInstalled)) && (
        <div className="flex items-center shrink-0 rounded-lg border border-white/15 bg-white/[0.03] p-0.5">
          <button
            onClick={() => onUpdate(category, path)}
            disabled={busy || mandatory || notInstalled || !update}
            title={update && !mandatory && !notInstalled ? `Actualizar a v${update.versionNumber}` : "Sin actualizaciones"}
            className="relative h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors disabled:pointer-events-none"
          >
            {busy && update ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className={`h-4 w-4 ${update && !mandatory && !notInstalled ? "" : "opacity-30"}`} strokeWidth={2.75} />
            )}
            {update && !mandatory && !notInstalled && !busy && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            )}
          </button>
          <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
          {/* Mods: the switch's slot is always there (empty when the row can't
              be toggled), so every switch lines up. */}
          {category === "mods" && (
            <>
              <span className="w-11 flex items-center justify-center">
                {canToggle && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center">
                        <Switch
                          checked={!disabled}
                          disabled={busy || !!toggleLockedReason}
                          onCheckedChange={(on) => onToggle(path, on)}
                          aria-label={disabled ? "Activar mod" : "Desactivar mod"}
                          // The instance's accent (like Jugar), not the theme's orange primary.
                          className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-white/20"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      {toggleLockedReason ?? (disabled ? "Activar mod" : "Desactivar mod (no se carga al jugar)")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
            </>
          )}
          {mandatory || notInstalled ? (
            <span
              data-tour={mandatory ? "manager-locked" : undefined}
              title={mandatory ? "Obligatorio del modpack" : undefined}
              className="h-7 w-7 flex items-center justify-center text-muted-foreground"
            >
              {mandatory && <Lock className="h-3.5 w-3.5 opacity-40" strokeWidth={2.75} />}
            </span>
          ) : (
            <Hint label="Eliminar">
              <button
                onClick={() => onDelete(category, path)}
                disabled={busy}
                data-tour="manager-optional"
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4" strokeWidth={2.75} />
              </button>
            </Hint>
          )}
        </div>
      )}
    </div>
    </ContentContextMenu>
  );
});

/** A content file staged for writing, once classified/hashed/conflict-checked —
 *  either "write it now" (no conflict) or waiting on the user's choice in the
 *  version-conflict dialog. */
interface StagedContentWrite {
  category: Category;
  targetPath: string;
  size: number;
  sha1: string;
  write: { fileBase64: string };
  modrinthMatch: ModrinthMatch | null;
}

const EMPTY_CATEGORIES: Record<Category, any[]> = { mods: [], shaderpacks: [], resourcepacks: [] };

/**
 * The instance manager (/modpack/:id — ModpackDetail is the route). With `embeddedId` it renders inside
 * another page instead (the online instance page's middle column): no banner,
 * no animated background, full width, and the pack's own header card hidden
 * (that page has its own) — the mod detail / search headers still show. The
 * parent element must be the scroll container.
 */
export default function ModpackDetail() {
  return <ModpackManager />;
}

/** Width (px) the Play group grows to, leftwards, while installing/opening. */
const PLAY_PROGRESS_WIDTH = 360;

/** Elements of the embedding page that receive the manager's Play group and
 *  "Contenido adicional" card (see playGroup/extrasCard). */
export interface ManagerHeaderSlots {
  actions: HTMLElement | null;
  extras: HTMLElement | null;
}

const EMOTE_STORE_URL = "https://emotes.redlance.org/";
const EMOTE_STORE_NOTICE_KEY = "alaunchi_emote_store_notice_seen";
/** Per-instance "don't show again" for the drag-and-drop hint (`<prefix><instanceId>`). */
const DROP_HINT_HIDDEN_PREFIX = "alaunchi_drop_hint_hidden:";

function readDropHintHidden(instanceId: string | undefined): boolean {
  if (!instanceId) return false;
  try {
    return localStorage.getItem(DROP_HINT_HIDDEN_PREFIX + instanceId) === "1";
  } catch {
    return false;
  }
}

export function ModpackManager({ embeddedId, slots }: { embeddedId?: string; slots?: ManagerHeaderSlots }) {
  const params = useParams<{ id: string }>();
  const id = embeddedId ?? params.id;
  const embedded = !!embeddedId;
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [, setLocation] = useLocation();
  const { modpacks, pastModpacks, loadModpacks } = useModpacks();
  const { instances, loadInstances } = useCustomInstances();
  const movedPanels = useOnlinePanels((s) => s.moved);
  const contentLayout = useOnlinePanels((s) => s.contentLayout);
  const wideWindow = useWideLayout();
  const myUsername = useAuth((s) => s.username);

  const pack =
    modpacks.find((p) => p.id === id) ??
    instances.find((p) => p.id === id) ??
    pastModpacks.find((p) => p.id === id && p.installed);
  const { busy: playBusy, running: playRunning, runState: playRunState, toggle: playToggle } = useLaunchModpack(pack);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const playProgress = useInstanceProgress(pack?.id);
  // While installing/opening, the Play group widens to the LEFT (its right edge
  // stays put, the pack info gives up the room) so the whole phase label reads
  // well. (Embedded, the Play group lives in another page's header.)
  const progressWide = playProgress.active && !embedded;
  useDynamicAccent(pack?.bannerUrl || pack?.imageUrl);

  // Animated background (same SwellLight as the Hub's "Mis instancias"), tinted
  // with the dominant color of the instance's icon — not the banner — so every
  // instance gets its own. null until the color is known, so it never flashes
  // the default blue first.
  const theme = useTheme((s) => s.theme);
  const animatedBackground = useAnimatedBackground((s) => s.enabled);
  const [iconHsl, setIconHsl] = useState<HSL | null>(null);
  const adaptiveColor = useAdaptiveColor((s) => s.enabled);
  useEffect(() => {
    let cancelled = false;
    setIconHsl(null);
    extractDominantColor(pack?.imageUrl).then((hsl) => {
      if (!cancelled) setIconHsl(hsl ?? { h: 205, s: 90, l: 55 }); // --accent's default
    });
    return () => {
      cancelled = true;
    };
  }, [pack?.id, pack?.imageUrl, adaptiveColor]);
  const swellColors = useMemo(() => {
    if (!iconHsl) return null;
    const { h, s, l } = iconHsl;
    // Same idea as the Hub's light/dark pair: on a light background the light
    // needs a darker tone and dark highlights to show; on dark, a mid tone with
    // pale highlights. Lightness is clamped so very dark/pale icons still glow.
    return theme === "light"
      ? { color: `hsl(${h} ${s}% ${Math.min(l, 44)}%)`, glint: `hsl(${h} ${s}% 18%)` }
      : { color: `hsl(${h} ${Math.max(s, 55)}% ${Math.min(Math.max(l, 45), 62)}%)`, glint: `hsl(${h} ${s}% 78%)` };
  }, [iconHsl, theme]);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<Record<Category, SnapshotEntry[]> | null>(null);
  const [optionalContent, setOptionalContent] = useState<Record<Category, InstanceFile[]>>(EMPTY_CATEGORIES);
  // Mods the player turned off, by their enabled path ("mods/foo.jar") — on
  // disk they're "mods/foo.jar.disabled" (see diskPath below).
  const [disabledMods, setDisabledMods] = useState<Set<string>>(new Set());
  // Optional pack files missing from disk (unpicked optional group / deleted).
  const [notInstalled, setNotInstalled] = useState<Set<string>>(new Set());
  // "Contenido adicional" screen: the live manifest (its optional groups),
  // what's on disk, and the group choice saved in the instance's meta.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [packManifest, setPackManifest] = useState<SnapshotManifest | null>(null);
  const [localPaths, setLocalPaths] = useState<Set<string>>(new Set());
  const [savedGroupChoice, setSavedGroupChoice] = useState<OptionalGroupChoice | null>(null);
  // Bumped to re-run the content load (after applying a new group choice).
  const [contentReloadKey, setContentReloadKey] = useState(0);
  // "Actualizar todo" running for the current category.
  const [updatingAll, setUpdatingAll] = useState(false);
  // A crash diagnosis fix disabled mods / reset a config: show the change.
  const crashFixesApplied = useCrashDiagnosis((s) => s.fixesApplied);
  useEffect(() => {
    if (crashFixesApplied) setContentReloadKey((k) => k + 1);
  }, [crashFixesApplied]);
  useEffect(() => setExtrasOpen(false), [id]);
  /** Where a listed file actually is on disk. */
  const diskPath = (path: string) => (disabledMods.has(path) ? `${path}${DISABLED_SUFFIX}` : path);
  const forgetDisabled = (...paths: (string | undefined)[]) =>
    setDisabledMods((prev) => {
      if (!paths.some((p) => p && prev.has(p))) return prev;
      const next = new Set(prev);
      for (const p of paths) if (p) next.delete(p);
      return next;
    });
  const [modrinthMatches, setModrinthMatches] = useState<Map<string, ModrinthMatch>>(new Map());
  const [updates, setUpdates] = useState<Map<string, ModrinthUpdate>>(new Map());
  // For each installed mod (by path), the projectIds its current version
  // requires — drives the "Requerido por…" badge, the delete warning and the
  // orphaned-dependency cleanup offer on the installed list.
  const [modRequires, setModRequires] = useState<Map<string, string[]>>(new Map());
  // A pending delete of a mod other installed mods still require.
  const [depDeleteConfirm, setDepDeleteConfirm] = useState<{ c: Category; path: string; dependents: string[] } | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<{ c: Category; paths: string[]; neededBy: string[] } | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  // Extra sort keys of the installed list, applied before the name order:
  // dependencies to the top/bottom (mods only), and pending updates first with
  // recently updated items sunk to the very end in the order they were updated.
  const [dependencySort, setDependencySort] = useState<"off" | "first" | "last">("off");
  const [updatesSort, setUpdatesSort] = useState(false);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdates>({});
  useEffect(() => {
    setRecentUpdates(id ? loadRecentUpdates(id) : {});
  }, [id]);
  const [busyPaths, setBusyPaths] = useState<Set<string>>(new Set());
  const [totalPlaytimeMs, setTotalPlaytimeMs] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingInstance, setDeletingInstance] = useState(false);
  const [keepInstanceFiles, setKeepInstanceFiles] = useState(false);

  // Drag-and-drop / file-picker content adding — works from anywhere on the page,
  // auto-detecting mod/shader/resourcepack/emote/schematic and routing accordingly.
  const [dropActive, setDropActive] = useState(false);
  // The hint can be dismissed per instance — it comes back in every other one.
  const [dropHintHidden, setDropHintHidden] = useState(() => readDropHintHidden(id));
  useEffect(() => {
    setDropHintHidden(readDropHintHidden(id));
  }, [id]);
  const hideDropHint = () => {
    setDropHintHidden(true);
    if (!id) return;
    try {
      localStorage.setItem(DROP_HINT_HIDDEN_PREFIX + id, "1");
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
  };
  const [versionChoice, setVersionChoice] = useState<{
    staged: StagedContentWrite;
    existingPath: string;
    existingLabel: string;
  } | null>(null);

  // The tabs band's height is NOT kept in state: it changes on every frame while its
  // rows fold, and a state update per frame re-rendered this whole page (choppy
  // animation). Nothing needs it since the sort row moved inside the band.
  const tabsElRef = useRef<HTMLDivElement | null>(null);
  const tabsRowRef = useCallback((node: HTMLDivElement | null) => {
    tabsElRef.current = node;
  }, []);
  const sortRowElRef = useRef<HTMLDivElement | null>(null);

  // The content card is fixed and scrolls inside, also embedded (the band sticks to
  // the card's top). Scrolled down in it → Contenido/Capturas fold away and the
  // tabs band gets shorter; back at the very top they come back.
  const [contentScrolled, setContentScrolled] = useState(false);
  // Mirrors of the two states read on every scroll / pointer move: setState is
  // only called when the value actually flips, so scrolling doesn't queue a
  // render of this (huge) component per event.
  const contentScrolledRef = useRef(false);
  const pointerNearBandRef = useRef(false);
  // …and 2 s after that, the sort/filter row folds away too (back at the top it returns).
  const [sortRowHidden, setSortRowHidden] = useState(false);
  // The cursor over the band or just under it (24px) brings the folded row back.
  const [pointerNearBand, setPointerNearBand] = useState(false);
  useEffect(() => {
    if (!contentScrolled) {
      setSortRowHidden(false);
      return;
    }
    const t = setTimeout(() => setSortRowHidden(true), 2000);
    return () => clearTimeout(t);
  }, [contentScrolled]);
  // The card that scrolls — for the floating "back to top" button.
  const cardScrollRef = useRef<HTMLDivElement>(null);
  /** Re-sorting while scrolled down: back to the list's first rows, but to 1px, not 0 —
   *  at the very top Contenido/Capturas would come back (contentScrolled). */
  const scrollListToFirst = () => {
    if (contentScrolled) cardScrollRef.current?.scrollTo({ top: 1, behavior: "smooth" });
  };

  // Mod detail view (opened by clicking a row's icon/name).
  const [selectedModPath, setSelectedModPath] = useState<string | null>(null);
  const [panelDirection, setPanelDirection] = useState(1);
  // Row the mod panel was last opened from — keeps its shared-layout ids so
  // closing the panel animates back into it (see InstalledContentRow).
  const [lastOpenedPath, setLastOpenedPath] = useState<string | null>(null);
  // The list and a mod's page (or Contenido adicional) share the card's
  // scroll. Leaving the list keeps where it was; the other view starts at its top
  // and coming back puts the list where it was (applied once the sweep swaps the
  // content — AnimatePresence's onExitComplete below).
  const inCardList = !selectedModPath && !extrasOpen;
  const inCardListRef = useRef(inCardList);
  inCardListRef.current = inCardList;
  const listScrollTopRef = useRef(0);
  const wasInCardListRef = useRef(true);
  useEffect(() => {
    if (wasInCardListRef.current && !inCardList) listScrollTopRef.current = cardScrollRef.current?.scrollTop ?? 0;
    wasInCardListRef.current = inCardList;
  }, [inCardList]);
  // One mod's page to another (a dependency link): same view, so no swap — reset here.
  const prevSelectedModRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSelectedModRef.current && selectedModPath && prevSelectedModRef.current !== selectedModPath) {
      cardScrollRef.current?.scrollTo({ top: 0 });
    }
    prevSelectedModRef.current = selectedModPath;
  }, [selectedModPath]);
  const restoreCardScroll = () => {
    const el = cardScrollRef.current;
    if (el) el.scrollTop = inCardListRef.current ? listScrollTopRef.current : 0;
  };
  const [modDetailTab, setModDetailTab] = useState<ModDetailTab>("description");
  const [modDetailLoading, setModDetailLoading] = useState(false);
  const [projectDetail, setProjectDetail] = useState<ModrinthProjectDetail | null>(null);
  const [modVersions, setModVersions] = useState<ModrinthUpdate[]>([]);
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);
  const [showOriginalDescription, setShowOriginalDescription] = useState(false);
  const [dependencies, setDependencies] = useState<ModrinthDependency[]>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [isModFavorited, setIsModFavorited] = useState(false);

  // Browse/search Modrinth to install new content into the active category.
  const [activeCategory, setActiveCategory] = useState<Category>("mods");
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ModrinthSearchHit[]>([]);
  const [popularResults, setPopularResults] = useState<ModrinthSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [resultsOffset, setResultsOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [sortBy, setSortBy] = useState<ModrinthSort>("downloads");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);

  // A mod counts as present whether it ships with the pack (mandatory) or the
  // player added it themselves (optional) — private instances have no manifest,
  // so everything there is optional. Matches the jar name or the Modrinth title.
  const hasMod = (pattern: RegExp) =>
    [...(content?.mods ?? []), ...optionalContent.mods].some(
      (f) => pattern.test(fileName(f.path)) || pattern.test(modrinthMatches.get(f.path)?.title ?? "")
    );

  // Emotecraft emotes — a separate, read-only tab alongside mods/shaders/resourcepacks,
  // shown when that mod is installed (mandatory or optional).
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [emotes, setEmotes] = useState<EmoteFile[]>([]);
  const [emotesLoading, setEmotesLoading] = useState(false);
  const [selectedEmote, setSelectedEmote] = useState<EmoteFile | null>(null);
  const [emoteStoreNoticeOpen, setEmoteStoreNoticeOpen] = useState(false);
  // The emote "store" is RedlanceEmotes' own site, in the default browser: its
  // downloads need a Redlance sign-in behind a Cloudflare check that blocks
  // any embedded browser. The first time, say so — and how to import.
  const openEmoteStore = () => {
    let seen = false;
    try {
      seen = localStorage.getItem(EMOTE_STORE_NOTICE_KEY) === "1";
    } catch {
      /* no storage: just show the notice */
    }
    if (seen) window.open(EMOTE_STORE_URL, "_blank");
    else setEmoteStoreNoticeOpen(true);
  };
  const emotecraftInstalled = hasMod(/emotecraft/i);

  // Schematics (.litematic/.schem/.schematic/.nbt) — same read-only-tab pattern as
  // emotes. The button shows when Litematica (or its Forge port Forgematica) is
  // installed, or when the recursive folder scan (below, tied to instance load)
  // already found files (e.g. WorldEdit schematics without Litematica).
  const litematicaInstalled = hasMod(/litematica|forgematica/i);
  const [schematicsOpen, setSchematicsOpen] = useState(false);
  const [schematics, setSchematics] = useState<SchematicFile[]>([]);
  const [selectedSchematic, setSelectedSchematic] = useState<SchematicFile | null>(null);

  // Vanilla F2 screenshots — same read-only-tab pattern as Emotes/Esquemas, but
  // always shown (once the pack is installed) since screenshots are a vanilla
  // feature, not gated behind any mod or prior content.
  const [screenshotsOpen, setScreenshotsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryActionsEl, setSummaryActionsEl] = useState<HTMLDivElement | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // A top-level section other than Contenido: its tabs and actions don't apply.
  const otherSectionOpen = screenshotsOpen || summaryOpen || versionsOpen;
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string } | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);

  // Online schematic search (unofficial aggregator API, see src/services/minemev.ts)
  // — a sub-mode inside the Esquemas panel, not a separate top-level entry.
  const [schematicOnlineMode, setSchematicOnlineMode] = useState(false);
  const [schematicQuery, setSchematicQuery] = useState("");
  const [schematicResults, setSchematicResults] = useState<MinemevSearchHit[]>([]);
  const [schematicSearchLoading, setSchematicSearchLoading] = useState(false);
  const [schematicBackendDown, setSchematicBackendDown] = useState(false);
  const [schematicPage, setSchematicPage] = useState(1);
  const [schematicHasMore, setSchematicHasMore] = useState(true);
  const [schematicLoadingMore, setSchematicLoadingMore] = useState(false);
  const schematicSentinelRef = useRef<HTMLDivElement | null>(null);

  const [selectedOnlinePost, setSelectedOnlinePost] = useState<MinemevSearchHit | null>(null);
  const [onlinePostDetail, setOnlinePostDetail] = useState<MinemevPostDetail | null>(null);
  const [onlinePostFiles, setOnlinePostFiles] = useState<MinemevFile[]>([]);
  const [onlineDetailLoading, setOnlineDetailLoading] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  const myUuid = useAuth((s) => s.uuid);
  const myPreviewSkinUrl = usePlayerSkinUrl(myUuid);
  const selectedEmoteData = useEmotePreview(id, selectedEmote?.fileName);

  const { structure: selectedSchematicStructure, error: selectedSchematicError } = useSchematicPreview(id, selectedSchematic?.path);
  // Kick off resource loading as soon as the panel opens (not just once a file is
  // picked) so the slow first-time-per-version jar extraction has a head start.
  const schematicMcVersion = schematicsOpen || selectedSchematic ? pack?.minecraftVersion : undefined;
  const { resources: schematicResources, progress: schematicProgress, error: schematicResourcesError } =
    useSchematicResources(schematicMcVersion);

  // Debounced search — fires as soon as the online sub-tab opens (an empty query
  // returns a general "browse latest" feed rather than nothing) and again whenever
  // the query changes, resetting pagination each time.
  useEffect(() => {
    if (!schematicOnlineMode) return;
    let cancelled = false;
    setSchematicSearchLoading(true);
    setSchematicPage(1);
    setSchematicBackendDown(false);
    const delay = schematicQuery.trim() ? 350 : 0;
    const timer = setTimeout(() => {
      searchSchematicsOnline(schematicQuery, 1).then(({ hits, hasMore, ok }) => {
        if (cancelled) return;
        setSchematicResults(hits);
        setSchematicHasMore(hasMore);
        setSchematicBackendDown(!ok);
        setSchematicSearchLoading(false);
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [schematicOnlineMode, schematicQuery]);

  const loadMoreSchematicResults = useCallback(() => {
    if (schematicLoadingMore || schematicSearchLoading || !schematicHasMore) return;
    const nextPage = schematicPage + 1;
    setSchematicLoadingMore(true);
    searchSchematicsOnline(schematicQuery, nextPage).then(({ hits, hasMore, ok }) => {
      if (ok) setSchematicResults((prev) => [...prev, ...hits]);
      setSchematicPage(nextPage);
      setSchematicHasMore(hasMore);
      setSchematicLoadingMore(false);
    });
  }, [schematicLoadingMore, schematicSearchLoading, schematicHasMore, schematicPage, schematicQuery]);

  useEffect(() => {
    if (!schematicOnlineMode || !schematicHasMore) return;
    const el = schematicSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreSchematicResults();
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [schematicOnlineMode, schematicHasMore, loadMoreSchematicResults]);

  useEffect(() => {
    if (!selectedOnlinePost) {
      setOnlinePostDetail(null);
      setOnlinePostFiles([]);
      return;
    }
    let cancelled = false;
    setOnlineDetailLoading(true);
    Promise.all([
      getSchematicPostDetail(selectedOnlinePost.vendor, selectedOnlinePost.uuid),
      listSchematicFiles(selectedOnlinePost.vendor, selectedOnlinePost.uuid),
    ]).then(([detail, files]) => {
      if (cancelled) return;
      setOnlinePostDetail(detail);
      setOnlinePostFiles(files);
      setOnlineDetailLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedOnlinePost]);

  const handleDownloadSchematicFile = async (file: MinemevFile) => {
    if (!pack || !selectedOnlinePost) return;
    setDownloadingFileId(file.id);
    try {
      const existing = new Set(schematics.map((s) => s.path));
      const targetPath = targetPathForSchematicFile(file, selectedOnlinePost.uuid, existing);
      await downloadInstanceFile(pack.id, targetPath, file.downloadUrl);
      setSchematics((prev) => [...prev, { path: targetPath, size: file.fileSize, source: "litematica", sha1: null }]);
      toast.success(`${file.fileName} descargado.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo descargar el esquema.");
    } finally {
      setDownloadingFileId(null);
    }
  };

  useEffect(() => {
    if (!emotesOpen || !id) return;
    let cancelled = false;
    setEmotesLoading(true);
    listEmotes(id)
      .then((result) => {
        if (cancelled) return;
        setEmotes(result);
        setEmotesLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setEmotes([]);
        setEmotesLoading(false);
        toast.error(e?.message || "No se pudo leer la carpeta de emotes.");
      });
    return () => {
      cancelled = true;
    };
  }, [emotesOpen, id]);

  useEffect(() => {
    if (!screenshotsOpen || !id) return;
    let cancelled = false;
    setScreenshotsLoading(true);
    listScreenshots(id)
      .then((result) => {
        if (cancelled) return;
        setScreenshots(result);
        setScreenshotsLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setScreenshots([]);
        setScreenshotsLoading(false);
        toast.error(e?.message || "No se pudo leer la carpeta de capturas.");
      });
    return () => {
      cancelled = true;
    };
  }, [screenshotsOpen, id]);

  // Mods opened from another mod's Dependencias tab, so "back" returns to the
  // mod you came from instead of all the way to the list.
  const [modHistory, setModHistory] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [shareImage, setShareImage] = useState<ShareableImage | null>(null);
  const [shareContent, setShareContent] = useState<ContentToShare | null>(null);
  // "Cambiar nombre" on an emote / schematic: its name is its file's name.
  const [renaming, setRenaming] = useState<{ kind: "emote" | "schematic"; path: string; currentName: string } | null>(null);
  // Bloqueo de contenido: main removed files from this instance — keep the list in sync.
  useEffect(
    () =>
      onContentLockPurged(({ modpackId, deleted }) => {
        if (modpackId !== id) return;
        const gone = (p: string) => deleted.some((d) => p === d || p.startsWith(`${d}/`));
        setOptionalContent((prev) => ({
          ...prev,
          mods: prev.mods.filter((f) => !gone(f.path)),
          shaderpacks: prev.shaderpacks.filter((f) => !gone(f.path)),
          resourcepacks: prev.resourcepacks.filter((f) => !gone(f.path)),
        }));
      }),
    [id]
  );
  const [sharingInstance, setSharingInstance] = useState(false);
  const [duplicatingInstance, setDuplicatingInstance] = useState(false);
  const openMod = (path: string) => {
    setPanelDirection(1);
    setSelectedModPath(path);
    setLastOpenedPath(path);
    setModHistory([]);
  };
  const closeMod = () => {
    setPanelDirection(-1);
    if (modHistory.length > 0) {
      setSelectedModPath(modHistory[modHistory.length - 1]);
      setModHistory(modHistory.slice(0, -1));
      return;
    }
    setSelectedModPath(null);
  };

  useEffect(() => {
    if (modpacks.length === 0) loadModpacks();
    if (instances.length === 0) loadInstances();
  }, []);

  // Refetched on window focus too, so coming back from playing (alt-tab, or the
  // launcher regaining focus) shows the just-finished session without needing
  // to leave and re-enter this page.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const refresh = async () => {
      const meta = await getInstalledModpacksMeta();
      if (!cancelled) setTotalPlaytimeMs(meta[id]?.totalPlaytimeMs || 0);
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setModrinthMatches(new Map());
    setUpdates(new Map());
    setOptionalContent(EMPTY_CATEGORIES);
    setDisabledMods(new Set());
    setNotInstalled(new Set());
    setSelectedModPath(null);
    setEmotesOpen(false);
    setEmotes([]);
    setSchematicsOpen(false);
    setSchematics([]);
    setSchematicOnlineMode(false);
    setSchematicResults([]);
    setSelectedOnlinePost(null);
    setScreenshotsOpen(false);
    setSummaryOpen(false);
    setVersionsOpen(false);
    setScreenshots([]);

    (async () => {
      const source = findPackSource(pack ?? id);
      const manifest = source ? await fetchSnapshot(source.repoUrl, id, source.token) : null;
      if (cancelled) return;
      const manifestFiles = manifest?.files ?? [];
      setContent(categorize(manifestFiles));
      setPackManifest(manifest);

      let optionalFiles: InstanceFile[] = [];
      if (pack?.installed) {
        const [rawLocalFiles, schematicFiles] = await Promise.all([listInstanceFiles(id), listSchematics(id)]);
        // Disabled mods are listed under their enabled name, so a pack's own
        // optional mod that's switched off still lines up with its manifest
        // entry instead of showing twice.
        const disabled = new Set<string>();
        const localFiles = rawLocalFiles.map((f) => {
          if (!f.path.startsWith("mods/") || !f.path.endsWith(DISABLED_SUFFIX)) return f;
          const enabledPath = f.path.slice(0, -DISABLED_SUFFIX.length);
          disabled.add(enabledPath);
          return { ...f, path: enabledPath };
        });
        const mandatoryPaths = new Set(manifestFiles.map((f) => f.path));
        optionalFiles = localFiles.filter((f) => !mandatoryPaths.has(f.path));
        // Pack files that aren't on disk: an optional group the player didn't
        // pick, or an optional file they deleted.
        const onDisk = new Set(localFiles.map((f) => f.path));
        const missing = new Set(
          manifestFiles.filter((f) => f.required === false && categoryOf(f.path) && !onDisk.has(f.path)).map((f) => f.path)
        );
        const meta = await getInstalledModpacksMeta().catch(() => ({} as Record<string, any>));
        if (cancelled) return;
        setLocalPaths(onDisk);
        setSavedGroupChoice(meta[id]?.optionalGroupChoice ?? null);
        setNotInstalled(missing);
        setDisabledMods(disabled);
        setOptionalContent(categorize(optionalFiles));
        setSchematics(schematicFiles);
      }

      const allFiles = [...manifestFiles, ...optionalFiles];
      const [modrinthFound, libraryFound] = await Promise.all([
        identifyModrinthFiles(allFiles),
        identifyLibraryFiles(allFiles),
      ]);
      if (cancelled) return;
      // Our own library's jars aren't on Modrinth; Modrinth wins if both match.
      const matches = new Map([...libraryFound, ...modrinthFound]);
      setModrinthMatches(matches);

      if (pack && optionalFiles.length > 0) {
        const updateEntries = new Map<string, ModrinthUpdate>();
        await Promise.all(
          optionalFiles.map(async (f) => {
            const match = matches.get(f.path);
            if (!match) return;
            const cat = categoryOf(f.path);
            if (!cat) return;
            const latest = isLibraryProjectId(match.projectId)
              ? (await libraryVersionsFor(match.projectId, pack.minecraftVersion, pack.loaderType))[0] ?? null
              : await getLatestVersion(match.projectId, pack.loaderType, pack.minecraftVersion, cat);
            if (latest && latest.versionId !== match.versionId) {
              updateEntries.set(f.path, latest);
            }
          })
        );
        if (!cancelled) setUpdates(updateEntries);
      }
    })().catch((e) => {
      if (!cancelled) toast.error(e?.message || "No se pudo cargar el contenido del modpack.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, pack?.installed, contentReloadKey]);

  // Fetch description/gallery/versions when a mod is opened.
  useEffect(() => {
    if (!selectedModPath || !pack) {
      setProjectDetail(null);
      setModVersions([]);
      return;
    }
    const match = modrinthMatches.get(selectedModPath);
    if (!match) return;
    let cancelled = false;
    setModDetailLoading(true);
    setModDetailTab("description");
    const cat = categoryOf(selectedModPath) ?? activeCategory;
    const libraryModId = libraryModIdOf(match.projectId);
    const load: Promise<[ModrinthProjectDetail | null, ModrinthUpdate[]]> = libraryModId
      ? fetchLibraryMod(libraryModId)
          .catch(() => null)
          .then((mod): [ModrinthProjectDetail | null, ModrinthUpdate[]] => {
            const build = mod ? compatibleBuild(mod, pack.minecraftVersion, pack.loaderType) : null;
            return [mod ? libraryProjectDetail(mod) : null, mod && build ? [libraryBuildAsUpdate(mod, build)] : []];
          })
      : Promise.all([
          getProjectDetail(match.projectId),
          listVersions(match.projectId, pack.loaderType, pack.minecraftVersion, cat),
        ]);
    load
      .then(([detail, versions]) => {
        if (cancelled) return;
        setProjectDetail(detail);
        setModVersions(versions);
      })
      .finally(() => {
        if (!cancelled) setModDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModPath]);

  useEffect(() => {
    const match = selectedModPath ? modrinthMatches.get(selectedModPath) : null;
    setIsModFavorited(match ? isFavorite(match.projectId) : false);
  }, [selectedModPath]);

  // Auto-translates the long-form description to Spanish once it loads; falls back
  // to the original silently if translation fails (unofficial keyless endpoint).
  // HTML-aware: tags (badge images, <br>, <details>...) are left untouched, only
  // the text between them gets translated.
  useEffect(() => {
    setShowOriginalDescription(false);
    setTranslatedDescription(null);
    const text = projectDetail?.body;
    if (!text || !text.trim()) return;
    if (selectedModPath && isLibraryProjectId(modrinthMatches.get(selectedModPath)?.projectId)) return;
    let cancelled = false;
    translateHtmlAwareToSpanish(text).then((translated) => {
      if (!cancelled) setTranslatedDescription(translated);
    });
    return () => {
      cancelled = true;
    };
  }, [projectDetail]);

  // Resolves the required-dependency projects for whichever version is "current"
  // (the installed one if there is one, otherwise the latest compatible version).
  useEffect(() => {
    if (modVersions.length === 0) {
      setDependencies([]);
      return;
    }
    const currentVersionId = selectedModPath ? modrinthMatches.get(selectedModPath)?.versionId : undefined;
    const current = modVersions.find((v) => v.versionId === currentVersionId) ?? modVersions[0];
    let cancelled = false;
    setDependenciesLoading(true);
    getRequiredDependencies(current.dependencies).then((deps) => {
      if (cancelled) return;
      setDependencies(deps);
      setDependenciesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [modVersions, selectedModPath, modrinthMatches]);

  // Genre category chips (adventure, magic, technology...) offered for whichever
  // category tab is active — reset the chosen filter when the tab changes since
  // the tag list is different per project type.
  useEffect(() => {
    if (!searchMode) return;
    fetchCategoryTags(activeCategory).then(setAvailableGenres);
  }, [searchMode, activeCategory]);
  useEffect(() => {
    setGenreFilter(null);
  }, [activeCategory]);

  // Browse (empty query) or search Modrinth for the active category, debounced while typing.
  // Resets pagination — this is always page one of a fresh query/category/sort/filter.
  useEffect(() => {
    if (!searchMode || !pack) return;
    let cancelled = false;
    setSearchLoading(true);
    setResultsOffset(0);
    setHasMoreResults(true);
    const delay = searchQuery.trim() ? 350 : 0;
    const timer = setTimeout(() => {
      searchProjects(activeCategory, searchQuery, pack.loaderType, pack.minecraftVersion, 0, SEARCH_PAGE_SIZE, sortBy, genreFilter).then((rawHits) => {
        if (cancelled) return;
        const hits = filterAntiXray(rawHits, pack.antiXray);
        if (searchQuery.trim()) setSearchResults(hits);
        else setPopularResults(hits);
        setHasMoreResults(rawHits.length === SEARCH_PAGE_SIZE);
        setSearchLoading(false);
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchMode, searchQuery, activeCategory, pack?.loaderType, pack?.minecraftVersion, sortBy, genreFilter]);

  // Fetches the next page of results and appends it — Modrinth's catalog is much
  // larger than one page, so browsing/searching keeps loading instead of capping at 20.
  const loadMoreResults = useCallback(() => {
    if (!pack || loadingMore || searchLoading || !hasMoreResults) return;
    const nextOffset = resultsOffset + SEARCH_PAGE_SIZE;
    setLoadingMore(true);
    searchProjects(activeCategory, searchQuery, pack.loaderType, pack.minecraftVersion, nextOffset, SEARCH_PAGE_SIZE, sortBy, genreFilter).then((rawHits) => {
      const hits = filterAntiXray(rawHits, pack.antiXray);
      if (searchQuery.trim()) setSearchResults((prev) => [...prev, ...hits]);
      else setPopularResults((prev) => [...prev, ...hits]);
      setResultsOffset(nextOffset);
      setHasMoreResults(rawHits.length === SEARCH_PAGE_SIZE);
      setLoadingMore(false);
    });
  }, [pack, loadingMore, searchLoading, hasMoreResults, resultsOffset, activeCategory, searchQuery, sortBy, genreFilter]);

  // Auto-loads more results as the sentinel at the bottom of the list scrolls into view.
  useEffect(() => {
    if (!searchMode || !hasMoreResults) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreResults(); },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [searchMode, hasMoreResults, loadMoreResults]);

  /** Resolves and installs a newly-installed mod's required dependencies,
   *  transitively (a dependency can itself have required dependencies), with
   *  a visited-set guard against cycles. Never touches a dependency that's
   *  already installed — mandatory (pack-shipped) or optional — which is what
   *  makes "never override the modpack's mandatory version" automatic rather
   *  than a special case. Uses a local snapshot of what's installed instead of
   *  re-reading React state mid-loop, since state updates from setOptionalContent
   *  below won't be visible to the next iteration synchronously. */
  const autoInstallDependencies = async (rootVersion: ModrinthUpdate, rootProjectId: string) => {
    if (!pack) return;
    const known = new Set<string>();
    for (const row of rowsFor("mods")) {
      const pid = modrinthMatches.get(row.path)?.projectId;
      if (pid) known.add(pid);
    }
    known.add(rootProjectId);

    const visited = new Set<string>([rootProjectId]);
    const queue: ModrinthUpdate[] = [rootVersion];
    let installedCount = 0;

    while (queue.length > 0) {
      const version = queue.shift()!;
      const requiredIds = Array.from(
        new Set(
          version.dependencies
            .filter((d) => d.dependencyType === "required" && d.projectId)
            .map((d) => d.projectId as string)
        )
      );
      for (const depId of requiredIds) {
        if (visited.has(depId)) continue;
        visited.add(depId);
        if (known.has(depId)) continue; // already covered — mandatory or optional, leave it alone

        const latest = await getLatestVersion(depId, pack.loaderType, pack.minecraftVersion, "mods");
        if (!latest) continue; // no version compatible with this instance — skip silently
        const info = await getProjectInfo(depId);
        if (!info) continue;

        const newPath = `mods/${latest.filename}`;
        try {
          await downloadInstanceFile(pack.id, newPath, latest.url, latest.sha1);
        } catch {
          continue; // don't let one failed dependency abort the rest
        }
        known.add(depId);
        installedCount++;

        setOptionalContent((prev) => ({
          ...prev,
          mods: [...prev.mods, { path: newPath, size: latest.size, sha1: latest.sha1 }],
        }));
        setModrinthMatches((prev) => {
          const next = new Map(prev);
          next.set(newPath, {
            title: info.title,
            iconUrl: info.iconUrl,
            projectId: depId,
            versionId: latest.versionId,
            versionNumber: latest.versionNumber,
          });
          return next;
        });

        queue.push(latest);
      }
    }
    if (installedCount > 0) {
      notify.info(`${installedCount} dependencia${installedCount > 1 ? "s" : ""} instalada${installedCount > 1 ? "s" : ""} automáticamente.`);
    }
  };

  /** Downloads a chosen version into the instance — replacing an existing file, or a fresh install
   *  if `path` is a not-yet-installed search result (synthetic "search:<projectId>" key). */
  const handleInstallVersion = async (
    c: Category,
    path: string,
    version: ModrinthUpdate,
    matchInfo: { title: string; iconUrl: string | null; projectId: string },
    /** "Actualizar todo": no toast per file (one at the end). */
    quiet = false
  ): Promise<boolean> => {
    if (!pack) return false;
    const isFresh = path.startsWith("search:");
    setBusyPaths((s) => new Set(s).add(path));
    try {
      const newPath = `${c}/${version.filename}`;
      if (isFresh) {
        await downloadInstanceFile(pack.id, newPath, version.url, version.sha1);
        setOptionalContent((prev) => ({
          ...prev,
          [c]: [...prev[c], { path: newPath, size: version.size, sha1: version.sha1 }],
        }));
      } else {
        // A disabled mod stays disabled after updating it.
        const wasDisabled = disabledMods.has(path);
        await updateInstanceFile(
          pack.id,
          diskPath(path),
          wasDisabled ? `${newPath}${DISABLED_SUFFIX}` : newPath,
          version.url,
          version.sha1
        );
        if (wasDisabled && newPath !== path) {
          setDisabledMods((prev) => {
            const next = new Set(prev);
            next.delete(path);
            next.add(newPath);
            return next;
          });
        }
        setOptionalContent((prev) =>
          prev[c].some((f) => f.path === path)
            ? { ...prev, [c]: prev[c].map((f) => (f.path === path ? { path: newPath, size: version.size, sha1: version.sha1 } : f)) }
            : prev
        );
      }
      setModrinthMatches((prev) => {
        const next = new Map(prev);
        next.delete(path);
        next.set(newPath, {
          title: matchInfo.title,
          iconUrl: matchInfo.iconUrl,
          projectId: matchInfo.projectId,
          versionId: version.versionId,
          versionNumber: version.versionNumber,
        });
        return next;
      });
      setUpdates((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      if (selectedModPath === path) setSelectedModPath(newPath);
      if (!isFresh) setRecentUpdates(recordRecentUpdate(pack.id, matchInfo.projectId));
      if (!quiet) toast.success(isFresh ? `${matchInfo.title} instalado.` : `Cambiado a v${version.versionNumber}.`);
      // Fire-and-forget — the mod just installed above updates its own UI
      // immediately; any dependencies it needs install in the background.
      if (c === "mods") void autoInstallDependencies(version, matchInfo.projectId);
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
      return false;
    } finally {
      setBusyPaths((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
  };

  /** Installs the latest compatible version of each given mod, one after another
   *  (their own required dependencies follow via autoInstallDependencies). */
  const installDependencies = async (deps: { projectId: string; title: string; iconUrl: string | null }[]) => {
    if (!pack) return;
    for (const dep of deps) {
      const version = await getLatestVersion(dep.projectId, pack.loaderType, pack.minecraftVersion, "mods");
      if (!version) {
        toast.error(`${dep.title}: no hay versión compatible con este pack.`);
        continue;
      }
      await handleInstallVersion("mods", `search:${dep.projectId}`, version, dep);
    }
  };

  /** From a mod's Dependencias tab: open the dependency's own page — the real
   *  installed row if it's installed, the not-installed (installable) view if not —
   *  remembering where we came from for the back button. */
  const openDependency = (dep: { projectId: string; title: string; iconUrl: string | null }) => {
    const back = selectedModPath ? [...modHistory, selectedModPath] : modHistory;
    const installedPath = installedModByProject.get(dep.projectId);
    openModFromSearch(
      { projectId: dep.projectId, title: dep.title, iconUrl: dep.iconUrl, description: "", downloads: 0, follows: 0 },
      installedPath ? { path: installedPath, mandatory: false } : undefined
    );
    setModHistory(back); // after openMod, which resets it
  };

  const handleInstallFromSearch = async (hit: ModrinthSearchHit) => {
    if (!pack) return;
    const version = await getLatestVersion(hit.projectId, pack.loaderType, pack.minecraftVersion, activeCategory);
    if (!version) {
      toast.error("No hay versión compatible con este pack.");
      return;
    }
    await handleInstallVersion(activeCategory, `search:${hit.projectId}`, version, hit);
  };

  const openModFromSearch = (hit: ModrinthSearchHit, installed?: { path: string; mandatory: boolean }) => {
    if (installed) {
      // Already installed (mandatory or optional) — open the real row so the
      // panel's "installed"/"locked" logic (which keys off the real path) works,
      // instead of a synthetic search:<id> path that never matches anything.
      openMod(installed.path);
      return;
    }
    setModrinthMatches((prev) => {
      const next = new Map(prev);
      next.set(`search:${hit.projectId}`, {
        title: hit.title,
        iconUrl: hit.iconUrl,
        projectId: hit.projectId,
        versionId: "",
        versionNumber: "",
      });
      return next;
    });
    openMod(`search:${hit.projectId}`);
  };

  const handleDelete = async (c: Category, path: string, opts: { skipDependencyCheck?: boolean } = {}) => {
    if (!pack) return;
    if (c === "mods" && !opts.skipDependencyCheck) {
      const dependents = dependentsOf(path);
      if (dependents.length > 0) {
        setDepDeleteConfirm({ c, path, dependents });
        return;
      }
    }
    // Snapshot before deleting: which of this mod's requirements nothing else
    // needs anymore — offered for removal afterwards, never removed silently
    // (the user may have installed a library on purpose).
    const orphans = c === "mods" ? orphanedBy(path) : [];
    setBusyPaths((s) => new Set(s).add(path));
    try {
      await deleteInstanceFile(pack.id, diskPath(path));
      forgetDisabled(path);
      setOptionalContent((prev) => ({ ...prev, [c]: prev[c].filter((f) => f.path !== path) }));
      setContent((prev) => (prev ? { ...prev, [c]: prev[c].filter((f) => f.path !== path) } : prev));
      if (selectedModPath === path) closeMod();
      toast.success(`${fileName(path)} eliminado.`);
      if (orphans.length > 0) {
        const names = orphans.map(titleFor).join(", ");
        toast.info(
          orphans.length === 1
            ? `${names} ya no lo necesita ningún mod.`
            : `${names} ya no los necesita ningún mod.`,
          {
            duration: 10000,
            action: {
              label: orphans.length === 1 ? "Quitar" : `Quitar (${orphans.length})`,
              onClick: () => {
                for (const o of orphans) void handleDelete("mods", o, { skipDependencyCheck: true });
              },
            },
          }
        );
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar el archivo.");
    } finally {
      setBusyPaths((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
  };

  const modPaths = useMemo(
    () => [...(content?.mods ?? []).map((f) => f.path), ...optionalContent.mods.map((f) => f.path)],
    [content, optionalContent]
  );

  // Batch-fetches every installed mod's current version (one request via
  // getVersionsByIds instead of one listVersions() call each) to record what
  // each installed mod requires — drives dependentsOf/orphanedBy below.
  useEffect(() => {
    if (!pack?.installed) {
      setModRequires(new Map());
      return;
    }
    let cancelled = false;
    const pathByVersion = new Map<string, string>();
    for (const path of modPaths) {
      const versionId = modrinthMatches.get(path)?.versionId;
      if (versionId && !isLibraryVersionId(versionId)) pathByVersion.set(versionId, path);
    }
    getVersionsByIds(Array.from(pathByVersion.keys())).then((versions) => {
      if (cancelled) return;
      const next = new Map<string, string[]>();
      for (const v of versions) {
        const path = pathByVersion.get(v.versionId);
        if (!path) continue;
        const ids = v.dependencies
          .filter((d) => d.dependencyType === "required" && d.projectId)
          .map((d) => d.projectId as string);
        if (ids.length > 0) next.set(path, Array.from(new Set(ids)));
      }
      setModRequires(next);
    });
    return () => {
      cancelled = true;
    };
  }, [modPaths, modrinthMatches, pack?.installed]);

  // Inverse of modRequires, computed once per change instead of per row:
  // installed mod path → paths of the installed mods that require it.
  const dependentsByPath = useMemo(() => {
    const pathsByProject = new Map<string, string[]>();
    for (const path of modPaths) {
      const id = modrinthMatches.get(path)?.projectId;
      if (id) pathsByProject.set(id, [...(pathsByProject.get(id) ?? []), path]);
    }
    const installed = new Set(modPaths);
    const out = new Map<string, string[]>();
    for (const [requirer, ids] of modRequires) {
      if (!installed.has(requirer)) continue;
      for (const id of ids) {
        for (const target of pathsByProject.get(id) ?? []) {
          if (target === requirer) continue;
          const list = out.get(target) ?? [];
          if (!list.includes(requirer)) out.set(target, [...list, requirer]);
        }
      }
    }
    return out;
  }, [modPaths, modrinthMatches, modRequires]);

  const dependentTitlesByPath = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [path, dependents] of dependentsByPath) {
      out.set(
        path,
        dependents.map((d) => modrinthMatches.get(d)?.title ?? guessTitle(fileName(d)))
      );
    }
    return out;
  }, [dependentsByPath, modrinthMatches]);

  // Installed mods by Modrinth projectId (first file wins if a project shows up twice).
  const installedModByProject = useMemo(() => {
    const out = new Map<string, string>();
    for (const path of modPaths) {
      const id = modrinthMatches.get(path)?.projectId;
      if (id && !out.has(id)) out.set(id, path);
    }
    return out;
  }, [modPaths, modrinthMatches]);

  // Required dependencies that no installed mod provides, per mod. Can't see a
  // dependency shipped as a jar Modrinth doesn't recognise — such a mod would be
  // flagged even though it's satisfied, the same limit as the rest of this list.
  const missingIdsByPath = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [path, ids] of modRequires) {
      if (!modPaths.includes(path)) continue;
      const missing = ids.filter((id) => !installedModByProject.has(id));
      if (missing.length > 0) out.set(path, missing);
    }
    return out;
  }, [modRequires, modPaths, installedModByProject]);

  const [depProjectInfo, setDepProjectInfo] = useState<Record<string, { title: string; iconUrl: string | null }>>({});
  useEffect(() => {
    const wanted = Array.from(new Set(Array.from(missingIdsByPath.values()).flat())).filter((id) => !depProjectInfo[id]);
    if (wanted.length === 0) return;
    let cancelled = false;
    getProjectsInfo(wanted).then((info) => {
      if (!cancelled && Object.keys(info).length > 0) setDepProjectInfo((prev) => ({ ...prev, ...info }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingIdsByPath]);

  const missingDepsByPath = useMemo(() => {
    const out = new Map<string, MissingDep[]>();
    for (const [path, ids] of missingIdsByPath) {
      out.set(
        path,
        ids.map((id) => ({
          projectId: id,
          title: depProjectInfo[id]?.title ?? "Dependencia desconocida",
          iconUrl: depProjectInfo[id]?.iconUrl ?? null,
        }))
      );
    }
    return out;
  }, [missingIdsByPath, depProjectInfo]);

  // Stable callbacks for the memoized rows; they forward to the latest handlers
  // (reassigned every render below), so rows never re-render just because the
  // page re-created its handler closures.
  const rowActionsRef = useRef<{
    toggle: (path: string, enabled: boolean) => void;
    open: (path: string) => void;
    update: (c: Category, path: string) => void;
    remove: (c: Category, path: string) => void;
    save: (c: Category, path: string) => void;
    share: (c: Category, path: string) => void;
    installMissing: (deps: MissingDep[]) => Promise<void>;
  }>({ toggle: () => {}, open: () => {}, update: () => {}, remove: () => {}, save: () => {}, share: () => {}, installMissing: async () => {} });
  const onRowSave = useCallback((c: Category, path: string) => rowActionsRef.current.save(c, path), []);
  const onRowShare = useCallback((c: Category, path: string) => rowActionsRef.current.share(c, path), []);
  const onRowToggle = useCallback((path: string, enabled: boolean) => rowActionsRef.current.toggle(path, enabled), []);
  const onRowOpen = useCallback((path: string) => rowActionsRef.current.open(path), []);
  const onRowUpdate = useCallback((c: Category, path: string) => rowActionsRef.current.update(c, path), []);
  const onRowDelete = useCallback((c: Category, path: string) => rowActionsRef.current.remove(c, path), []);
  const onRowInstallMissing = useCallback((deps: MissingDep[]) => rowActionsRef.current.installMissing(deps), []);
  // Rows ticked in the content list (by path; paths never repeat across
  // categories). Cleared on switching category: the marks belong to one list.
  const [markedPaths, setMarkedPaths] = useState<Set<string>>(() => new Set());
  const onRowMarkToggle = useCallback((path: string) => {
    setMarkedPaths((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);
  useEffect(() => {
    setMarkedPaths((prev) => (prev.size ? new Set() : prev));
  }, [activeCategory]);

  const dragCounterRef = useRef(0);

  if (!pack) {
    return (
      <div className="min-h-full bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Modpack no encontrado.</p>
        <Button variant="outline" onClick={() => setLocation(getLastViewPath())}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  // Once the pack is installed, always offer all 3 tabs (even empty ones) so the
  // user can navigate to e.g. Shaders and install their first one. Before that,
  // only show tabs for what the published manifest actually contains.
  const categories: Category[] = pack.installed
    ? (Object.keys(CATEGORY_META) as Category[])
    : (Object.keys(CATEGORY_META) as Category[]).filter((c) => (content?.[c]?.length ?? 0) > 0);

  const rowsFor = (c: Category): ContentRow[] => [
    ...(content?.[c] ?? []).map(
      (f): ContentRow => ({
        path: f.path,
        size: f.size,
        mandatory: f.required !== false,
        disabled: disabledMods.has(f.path),
        notInstalled: notInstalled.has(f.path),
      })
    ),
    ...optionalContent[c].map(
      (f): ContentRow => ({
        path: f.path,
        size: f.size,
        mandatory: false,
        disabled: disabledMods.has(f.path),
        notInstalled: false,
      })
    ),
  ];

  const titleFor = (path: string) => modrinthMatches.get(path)?.title ?? guessTitle(fileName(path));

  const hasPendingUpdate = (r: ContentRow) => !r.mandatory && updates.has(r.path);
  const pendingUpdateCount = (c: Category) => rowsFor(c).filter(hasPendingUpdate).length;
  /** When the row was updated from here in the last days (see lib/recent-updates), else undefined. */
  const recentUpdateTime = (path: string): number | undefined => {
    const projectId = modrinthMatches.get(path)?.projectId;
    return projectId ? recentUpdates[projectId] : undefined;
  };
  /** "Actualizaciones" order: pending updates → the rest → recently updated,
   *  the latter in update order (the most recent one last). 0 = tie. */
  const compareByUpdates = (a: ContentRow, b: ContentRow): number => {
    const ta = recentUpdateTime(a.path);
    const tb = recentUpdateTime(b.path);
    const group = (r: ContentRow, t: number | undefined) => (hasPendingUpdate(r) ? 0 : t !== undefined ? 2 : 1);
    const diff = group(a, ta) - group(b, tb);
    if (diff !== 0) return diff;
    if (ta !== undefined && tb !== undefined) return ta - tb;
    return 0;
  };

  /** Paths of the installed mods whose current version requires `path`'s project. */
  const dependentsOf = (path: string): string[] => dependentsByPath.get(path) ?? [];

  /** Optional mods required by `path` that no other installed mod requires —
   *  i.e. what would be left orphaned if `path` were removed. Pack-shipped
   *  (mandatory) files are never offered: they can't be removed anyway. */
  const orphanedBy = (path: string): string[] => {
    const required = modRequires.get(path);
    if (!required?.length) return [];
    return rowsFor("mods")
      .filter((r) => !r.mandatory && r.path !== path)
      .map((r) => r.path)
      .filter((p) => {
        const id = modrinthMatches.get(p)?.projectId;
        return !!id && required.includes(id) && dependentsOf(p).every((d) => d === path);
      });
  };

  // Online pack with optional groups → the "Contenido adicional" box/screen.
  const extraGroups = packManifest ? splitOptionalGroups(packManifest) : null;
  const hasExtras =
    pack.source !== "custom" && !!pack.installed && !!extraGroups &&
    extraGroups.groups.length + extraGroups.selectable.length > 0;

  /** Re-runs the snapshot install with the new group choice: downloads the
   *  newly picked groups, removes the dropped ones (see mc:install-snapshot). */
  const applyGroupChoice = async (choice: OptionalGroupChoice) => {
    if (!packManifest) return;
    try {
      const { repoUrl, token } = requirePackSource(pack);
      await installSnapshot(
        pack.id,
        packManifest,
        snapshotBaseUrl(repoUrl, packManifest),
        { name: pack.name, minecraftVersion: pack.minecraftVersion, loaderType: pack.loaderType },
        token || undefined,
        choice
      );
      useModpacks.getState().updateModpackStatus(pack.id, {
        installed: true,
        installedVersion: packManifest.version,
        updateAvailable: false,
      });
      toast.success("Contenido adicional actualizado.");
      setContentReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo aplicar el cambio.");
    }
  };

  /** Every mod reachable from `path` by repeatedly following `next` (BFS),
   *  `path` itself excluded. */
  const collectChain = (path: string, next: (p: string) => string[]): string[] => {
    const seen = new Set([path]);
    const queue = [path];
    const out: string[] = [];
    while (queue.length) {
      for (const p of next(queue.shift()!)) {
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
        queue.push(p);
      }
    }
    return out;
  };

  /** Enabled mods that (directly or through others) need `path` — switched
   *  off together with it so none is left without its dependency. */
  const enabledDependentsChain = (path: string) =>
    collectChain(path, (p) => dependentsOf(p).filter((d) => !disabledMods.has(d)));

  /** Disabled mods that `path` (directly or through others) needs — switched
   *  back on together with it. */
  const disabledDependenciesChain = (path: string) =>
    collectChain(path, (p) => modPaths.filter((q) => disabledMods.has(q) && dependentsOf(q).includes(p)));

  /** Disabling a dependency in use also disables the mods that need it (see
   *  handleToggleMod) — except when one of those is a mandatory file of the
   *  online pack, which has no switch: then this one can't be turned off. */
  const toggleLockedReason = (row: ContentRow): string | undefined => {
    if (row.disabled) return undefined;
    const rows = rowsFor("mods");
    const blocking = enabledDependentsChain(row.path).filter((d) => rows.find((r) => r.path === d)?.mandatory);
    if (blocking.length === 0) return undefined;
    const names = blocking.map(titleFor);
    return `No se puede desactivar: lo necesita${names.length > 1 ? "n" : ""} ${names.join(", ")}, que forma${
      names.length > 1 ? "n" : ""
    } parte del modpack.`;
  };

  /** Switches several mods at once (a mod plus its dependents/dependencies). */
  const setModsEnabled = async (paths: string[], enabled: boolean) => {
    setBusyPaths((s) => new Set([...s, ...paths]));
    const done: string[] = [];
    try {
      for (const p of paths) {
        await setModEnabled(pack.id, p, enabled);
        done.push(p);
      }
    } finally {
      setDisabledMods((prev) => {
        const next = new Set(prev);
        for (const p of done) {
          if (enabled) next.delete(p);
          else next.add(p);
        }
        return next;
      });
      setBusyPaths((s) => {
        const next = new Set(s);
        for (const p of paths) next.delete(p);
        return next;
      });
    }
  };

  const handleToggleMod = async (path: string, enabled: boolean) => {
    const rows = rowsFor("mods");
    if (!enabled) {
      const row = rows.find((r) => r.path === path);
      const locked = row && toggleLockedReason(row);
      if (locked) {
        toast.error(locked);
        return;
      }
    }
    // Off: also every enabled mod that needs it. On: also every disabled mod
    // it needs. Only rows that actually have a switch.
    const switchable = (p: string) => {
      const r = rows.find((x) => x.path === p);
      return !!r && !r.mandatory && !r.notInstalled;
    };
    const extra = (enabled ? disabledDependenciesChain(path) : enabledDependentsChain(path)).filter(switchable);
    try {
      await setModsEnabled([path, ...extra], enabled);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cambiar el mod.");
      return;
    }
    if (extra.length === 0) return;
    const names = extra.map(titleFor).join(", ");
    if (enabled) {
      notify.info(`${titleFor(path)} activado, junto con lo que necesita: ${names}.`, { duration: 6000 });
    } else {
      toast.info(
        `${titleFor(path)} desactivado. También se desactivó lo que depende de él: ${names}.`,
        {
          duration: 8000,
          action: {
            label: "Deshacer",
            onClick: () => void setModsEnabled([path, ...extra], true).catch(() => toast.error("No se pudo reactivar.")),
          },
        }
      );
    }
  };

  rowActionsRef.current = {
    toggle: (path, enabled) => void handleToggleMod(path, enabled),
    open: openMod,
    update: (c, path) => {
      const update = updates.get(path);
      const match = modrinthMatches.get(path);
      if (update && match) void handleInstallVersion(c, path, update, match);
    },
    remove: (c, path) => void handleDelete(c, path),
    save: (c, path) => void saveRowToLibrary(c, path),
    share: (c, path) => void shareRow(c, path),
    installMissing: installDependencies,
  };

  /** Right-click → "Guardar en la biblioteca" (mods, shaders, resource packs and schematics). */
  const saveFileToLibrary = async (
    category: SavedContentCategory,
    diskFilePath: string,
    name: string,
    meta: { displayName: string; iconUrl: string | null; modrinthProjectId?: string; schematicSource?: "litematica" | "worldedit" }
  ) => {
    try {
      const { alreadySaved } = await saveContent({ category, sourceName: pack.name, ...meta }, name, {
        kind: "instance",
        modpackId: pack.id,
        path: diskFilePath,
      });
      toast.success(alreadySaved ? "Ya estaba en tu biblioteca." : `${meta.displayName} guardado en la biblioteca.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar en la biblioteca.");
    }
  };
  const saveRowToLibrary = async (c: Category, path: string) => {
    if (notInstalled.has(path)) return void toast.error("Ese archivo no está instalado.");
    const match = modrinthMatches.get(path);
    await saveFileToLibrary(c, diskPath(path), fileName(path), {
      displayName: titleFor(path),
      iconUrl: match?.iconUrl ?? null,
      modrinthProjectId: match?.projectId,
    });
  };
  const shareRow = async (c: Category, path: string) => {
    if (notInstalled.has(path)) return void toast.error("Ese archivo no está instalado.");
    const dp = diskPath(path);
    const file = (await listInstanceFiles(pack.id).catch(() => [])).find((f) => f.path === dp);
    if (!file?.sha1) return void toast.error("No se pudo leer el archivo.");
    const match = modrinthMatches.get(path);
    setShareContent({
      modpackId: pack.id,
      path: dp,
      sha1: file.sha1,
      size: file.size,
      category: c,
      displayName: titleFor(path),
      fileName: fileName(path),
      iconUrl: match?.iconUrl ?? null,
      modrinthProjectId: match?.projectId,
    });
  };
  const schematicName = (sch: SchematicFile) => fileName(sch.path).replace(SCHEMATIC_EXT, "");
  /** The listing may not have a hash for the file: take it from the bytes. */
  const sha1OrCompute = async (known: string | null, path: string): Promise<string> => {
    if (known) return known;
    const base64 = await readInstanceFile(pack.id, path);
    const digest = await crypto.subtle.digest("SHA-1", Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };
  const applyRename = async (newName: string) => {
    if (!renaming) return;
    const newPath = await renameInstanceFile(pack.id, renaming.path, newName);
    if (renaming.kind === "emote") {
      const newFile = fileName(newPath);
      setEmotes((prev) =>
        prev.map((e) =>
          `emotes/${e.fileName}` === renaming.path
            ? { ...e, fileName: newFile, displayName: newFile.replace(/\.emotecraft$/i, "").trim() }
            : e
        )
      );
    } else {
      setSchematics((prev) => prev.map((s) => (s.path === renaming.path ? { ...s, path: newPath } : s)));
    }
    toast.success("Nombre cambiado.");
  };
  const shareEmote = async (emote: EmoteFile) => {
    try {
      const path = `emotes/${emote.fileName}`;
      setShareContent({
        modpackId: pack.id,
        path,
        sha1: await sha1OrCompute(emote.sha1, path),
        // The listing has no size: ~3/4 of the base64 length is the file's.
        size: Math.floor(((await readInstanceFile(pack.id, path)).length * 3) / 4),
        category: "emotes",
        displayName: emote.displayName,
        fileName: emote.fileName,
        iconUrl: emote.thumbnailBase64 ? `data:image/png;base64,${emote.thumbnailBase64}` : null,
      });
    } catch (e: any) {
      toast.error(e?.message || "No se pudo leer el archivo.");
    }
  };
  const shareSchematic = async (sch: SchematicFile) => {
    try {
      const sha1 = await sha1OrCompute(sch.sha1, sch.path);
      setShareContent({
        modpackId: pack.id,
        path: sch.path,
        sha1,
        size: sch.size,
        category: "schematics",
        displayName: schematicName(sch),
        fileName: fileName(sch.path),
        iconUrl: null,
        schematicSource: sch.source,
      });
    } catch (e: any) {
      toast.error(e?.message || "No se pudo leer el archivo.");
    }
  };

  /** Every pending update of the category, three at a time, one toast at the end. */
  const handleUpdateAll = async (c: Category) => {
    const pending = rowsFor(c)
      .filter(hasPendingUpdate)
      .map((r) => ({ path: r.path, update: updates.get(r.path), match: modrinthMatches.get(r.path) }))
      .filter((x) => x.update && x.match);
    if (pending.length === 0) return;
    setUpdatingAll(true);
    let ok = 0;
    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const item = pending[next++];
        if (await handleInstallVersion(c, item.path, item.update!, item.match!, true)) ok++;
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      setUpdatingAll(false);
    }
    if (ok > 0) toast.success(ok === 1 ? "1 archivo actualizado." : `${ok} archivos actualizados.`);
  };

  /** Deletes the ticked rows at once (one toast); asked first in bulkDeleteConfirm. */
  const handleBulkDelete = async (c: Category, paths: string[]) => {
    setBusyPaths((s) => new Set([...s, ...paths]));
    const done: string[] = [];
    let failed = 0;
    for (const p of paths) {
      try {
        await deleteInstanceFile(pack.id, diskPath(p));
        forgetDisabled(p);
        done.push(p);
      } catch {
        failed++;
      }
    }
    const gone = new Set(done);
    setOptionalContent((prev) => ({ ...prev, [c]: prev[c].filter((f) => !gone.has(f.path)) }));
    setContent((prev) => (prev ? { ...prev, [c]: prev[c].filter((f) => !gone.has(f.path)) } : prev));
    if (selectedModPath && gone.has(selectedModPath)) closeMod();
    setBusyPaths((s) => {
      const next = new Set(s);
      for (const p of paths) next.delete(p);
      return next;
    });
    setMarkedPaths((prev) => new Set([...prev].filter((p) => !gone.has(p))));
    if (done.length > 0) toast.success(done.length === 1 ? `${fileName(done[0])} eliminado.` : `${done.length} archivos eliminados.`);
    if (failed > 0) toast.error(failed === 1 ? "No se pudo eliminar 1 archivo." : `No se pudieron eliminar ${failed} archivos.`);
  };

  /** Switches the ticked mods on/off, dragging dependents/dependencies along
   *  like the row's own switch (see handleToggleMod). */
  const handleBulkToggle = async (paths: string[], enabled: boolean) => {
    const rows = rowsFor("mods");
    const rowOf = (p: string) => rows.find((r) => r.path === p);
    const switchable = (p: string) => {
      const r = rowOf(p);
      return !!r && !r.mandatory && !r.notInstalled && /\.jar$/i.test(p);
    };
    let targets = paths.filter((p) => switchable(p) && rowOf(p)!.disabled === enabled);
    const locked = enabled ? [] : targets.filter((p) => !!toggleLockedReason(rowOf(p)!));
    targets = targets.filter((p) => !locked.includes(p));
    const extra = [
      ...new Set(targets.flatMap((p) => (enabled ? disabledDependenciesChain(p) : enabledDependentsChain(p)))),
    ].filter((p) => switchable(p) && !targets.includes(p));
    const all = [...targets, ...extra];
    if (all.length > 0) {
      try {
        await setModsEnabled(all, enabled);
      } catch (e: any) {
        toast.error(e?.message || "No se pudieron cambiar los mods.");
        return;
      }
      const head = `${targets.length === 1 ? titleFor(targets[0]) : `${targets.length} mods`} ${
        enabled ? (targets.length === 1 ? "activado" : "activados") : targets.length === 1 ? "desactivado" : "desactivados"
      }`;
      const tail = extra.length
        ? enabled
          ? `, junto con lo que necesitan: ${extra.map(titleFor).join(", ")}.`
          : `. También se desactivó lo que depende de ellos: ${extra.map(titleFor).join(", ")}.`
        : ".";
      toast.info(head + tail, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () => void setModsEnabled(all, !enabled).catch(() => toast.error("No se pudo deshacer.")),
        },
      });
    }
    if (locked.length > 0) {
      toast.error(
        `${locked.map(titleFor).join(", ")}: no se ${locked.length === 1 ? "puede" : "pueden"} desactivar, lo necesita contenido del modpack.`
      );
    }
  };

  /** Floating bar under the list while something in it is ticked: mark all ·
   *  activar/desactivar (mods) · eliminar. Only rows still in the list count. */
  const renderMarkedBar = (c: Category, rows: ContentRow[]) => {
    const marked = rows.filter((r) => markedPaths.has(r.path));
    const deletable = marked.filter((r) => !r.mandatory && !r.notInstalled).map((r) => r.path);
    const toggleable =
      c === "mods" && !contentLocked
        ? marked.filter((r) => !r.mandatory && !r.notInstalled && /\.jar$/i.test(r.path))
        : [];
    // Off if any ticked mod is on; on only when all of them are off.
    const enableAll = toggleable.length > 0 && toggleable.every((r) => r.disabled);
    const busy = marked.some((r) => busyPaths.has(r.path));
    const allMarked = rows.length > 0 && marked.length === rows.length;
    return (
      <AnimatePresence>
        {marked.length > 0 && (
          <motion.div
            key="marked-bar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="sticky bottom-3 z-20 mx-auto mb-3 w-fit flex items-center gap-1 rounded-lg bg-gray-500/15 backdrop-blur-xl p-1 pl-3 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          >
            <Checkbox
              checked={allMarked ? true : "indeterminate"}
              onCheckedChange={() => setMarkedPaths(allMarked ? new Set() : new Set(rows.map((r) => r.path)))}
              aria-label={allMarked ? "Desmarcar todo" : "Marcar todo"}
              title={allMarked ? "Desmarcar todo" : "Marcar todo"}
              className="border-white/40 data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-foreground data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:text-accent-foreground [&_svg]:h-3.5 [&_svg]:w-3.5"
            />
            <span className="ml-1 mr-2 text-gray-200 whitespace-nowrap">
              {marked.length === 1 ? "1 marcado" : `${marked.length} marcados`}
            </span>
            {toggleable.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleBulkToggle(toggleable.map((r) => r.path), enableAll)}
                className="h-7 px-2.5 text-xs hover:bg-white/10"
              >
                {enableAll ? "Activar" : "Desactivar"}
              </Button>
            )}
            {deletable.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const set = new Set(deletable);
                  const neededBy =
                    c === "mods" ? [...new Set(deletable.flatMap((p) => dependentsOf(p)).filter((d) => !set.has(d)))] : [];
                  setBulkDeleteConfirm({ c, paths: deletable, neededBy });
                }}
                className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Eliminar{deletable.length !== marked.length ? ` (${deletable.length})` : ""}
              </Button>
            )}
            <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden />
            <Hint label="Quitar marcas">
              <button
                type="button"
                onClick={() => setMarkedPaths(new Set())}
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </Hint>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  // Bloqueo de contenido (Admin → Ajustes): the creator decided this instance's
  // mods/shaders/resource packs are exactly the modpack's — every way of adding
  // or swapping one is hidden here (main also removes anything dropped in by
  // hand). Never applies to the creator, nor to private instances.
  const contentLocked = !!pack.lockContent && pack.source !== "custom" && !sameRepo(pack.repoUrl, getMySource()?.repoUrl);

  const effectiveCategory = categories.includes(activeCategory) ? activeCategory : categories[0];
  const selectedCategory = selectedModPath ? categoryOf(selectedModPath) ?? effectiveCategory : null;
  const selectedMatch = selectedModPath ? modrinthMatches.get(selectedModPath) : null;
  const selectedRow =
    selectedModPath && selectedCategory ? rowsFor(selectedCategory).find((r) => r.path === selectedModPath) : null;
  const selectedLocked = !!selectedRow?.mandatory;
  const selectedUpdate =
    selectedModPath && selectedRow && !selectedLocked && !contentLocked ? updates.get(selectedModPath) : undefined;
  const selectedUpToDate = !!selectedRow && !selectedLocked && !selectedUpdate;
  const selectedActionable = !selectedLocked && !selectedUpToDate && !contentLocked;
  // Locked content: nothing to install, so no button for a mod that isn't installed.
  const showHeaderAction = !!selectedModPath && !!selectedMatch && !!selectedCategory && !(contentLocked && !selectedRow);
  const selectedBusy = selectedModPath ? busyPaths.has(selectedModPath) : false;

  const handleHeaderInstallClick = () => {
    if (!selectedActionable || !selectedMatch || !selectedModPath || !selectedCategory) return;
    if (selectedRow && selectedUpdate) {
      handleInstallVersion(selectedCategory, selectedModPath, selectedUpdate, selectedMatch);
    } else if (!selectedRow) {
      const latest = modVersions[0];
      if (!latest) {
        toast.error("No hay versión compatible con este pack.");
        return;
      }
      handleInstallVersion(selectedCategory, selectedModPath, latest, selectedMatch);
    }
  };

  // ─── Drag-and-drop / file-picker content adding ──────────────────────────

  const contentTargetPath = (classification: ContentClassification, name: string): string => {
    if (classification.category === "schematics") {
      const folder = classification.schematicRoot === "worldedit" ? "config/worldedit/schematics" : "schematics";
      return `${folder}/${name}`;
    }
    return `${classification.category}/${name}`;
  };

  /** Actually writes a staged mod/shader/resourcepack, replacing existingPath's
   *  entry if this came from the "use the new version" choice. */
  const writeStagedContent = async (staged: StagedContentWrite, existingPath?: string) => {
    try {
      await writeInstanceFile(pack.id, staged.targetPath, staged.write);
      if (existingPath && existingPath !== staged.targetPath) {
        await deleteInstanceFile(pack.id, diskPath(existingPath));
      }
      forgetDisabled(existingPath, staged.targetPath);
      setOptionalContent((prev) => ({
        ...prev,
        [staged.category]: [
          ...prev[staged.category].filter((f) => f.path !== existingPath && f.path !== staged.targetPath),
          { path: staged.targetPath, size: staged.size, sha1: staged.sha1 },
        ],
      }));
      setModrinthMatches((prev) => {
        const next = new Map(prev);
        if (existingPath) next.delete(existingPath);
        if (staged.modrinthMatch) next.set(staged.targetPath, staged.modrinthMatch);
        return next;
      });
      setActiveCategory(staged.category);
      setEmotesOpen(false);
      setSchematicsOpen(false);
      toast.success(`${staged.modrinthMatch?.title ?? fileName(staged.targetPath)} añadido.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo añadir el archivo.");
    }
  };

  /** Shared entry point for drag-and-drop — classifies, resolves any conflict
   *  against what's already installed, and either writes, skips, blocks, or
   *  (mods/shaders/resourcepacks only) stages a version-choice prompt.
   *  Emotes/schematics never prompt — see resolveNoIdentityConflict. */
  const processIncomingFile = async (
    name: string,
    sha1: string,
    classification: ContentClassification | null,
    write: { fileBase64: string },
    size: number
  ) => {
    if (!classification) {
      toast.error(`${name}: tipo de archivo no soportado.`);
      return;
    }
    const targetPath = contentTargetPath(classification, name);

    if (classification.category === "emotes") {
      if (!emotecraftInstalled) {
        toast.error("Este modpack no tiene Emotecraft instalado; no se pueden añadir emotes.");
        return;
      }
      const existingPaths = new Set(emotes.map((e) => `emotes/${e.fileName}`));
      const existingHashes = new Map(emotes.filter((e) => e.sha1).map((e) => [`emotes/${e.fileName}`, e.sha1 as string]));
      const resolution = resolveNoIdentityConflict(targetPath, sha1, existingPaths, existingHashes);
      if (resolution.kind === "skip") {
        notify(resolution.reason);
        return;
      }
      if (resolution.kind !== "write") return; // never "block"/"prompt" for emotes
      try {
        await writeInstanceFile(pack.id, resolution.targetPath, write);
        const addedName = resolution.targetPath.slice(resolution.targetPath.lastIndexOf("/") + 1);
        setEmotes((prev) => [
          ...prev,
          { fileName: addedName, displayName: addedName.replace(/\.emotecraft$/i, "").trim(), thumbnailBase64: null, sha1 },
        ]);
        setEmotesOpen(true);
        setSchematicsOpen(false);
        toast.success(`${addedName} añadido.`);
      } catch (e: any) {
        toast.error(e?.message || "No se pudo añadir el emote.");
      }
      return;
    }

    if (classification.category === "schematics") {
      const existingPaths = new Set(schematics.map((s) => s.path));
      const resolution = resolveNoIdentityConflict(targetPath, sha1, existingPaths, new Map());
      if (resolution.kind === "skip") {
        notify(resolution.reason);
        return;
      }
      if (resolution.kind !== "write") return;
      try {
        await writeInstanceFile(pack.id, resolution.targetPath, write);
        setSchematics((prev) => [
          ...prev,
          { path: resolution.targetPath, size, source: classification.schematicRoot === "worldedit" ? "worldedit" : "litematica", sha1 },
        ]);
        setSchematicsOpen(true);
        setEmotesOpen(false);
        toast.success(`${name} añadido.`);
      } catch (e: any) {
        toast.error(e?.message || "No se pudo añadir el esquema.");
      }
      return;
    }

    // mods / shaderpacks / resourcepacks
    if (contentLocked) {
      toast.error("El creador de esta instancia ha bloqueado añadir mods, shaders y resource packs.");
      return;
    }
    const category = classification.category as Category;
    const [modrinthFound, libraryFound] = await Promise.all([
      identifyModrinthFiles([{ path: targetPath, sha1 }]).catch(() => new Map<string, ModrinthMatch>()),
      identifyLibraryFiles([{ path: targetPath, sha1 }]),
    ]);
    const match = modrinthFound.get(targetPath) ?? libraryFound.get(targetPath) ?? null;
    const rows = rowsFor(category);
    const resolution = resolveContentConflict({
      targetPath,
      modrinthProjectId: match?.projectId ?? null,
      modrinthVersionId: match?.versionId ?? null,
      existingRows: rows,
      existingModrinthMatches: modrinthMatches,
    });
    const staged: StagedContentWrite = { category, targetPath, size, sha1, write, modrinthMatch: match };

    if (resolution.kind === "block") {
      toast.error(resolution.reason);
    } else if (resolution.kind === "skip") {
      notify(resolution.reason);
    } else if (resolution.kind === "prompt") {
      setVersionChoice({ staged, existingPath: resolution.existingPath, existingLabel: resolution.existingLabel });
    } else {
      await writeStagedContent(staged);
    }
  };

  const handleContentDrop = async (files: File[]) => {
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const base64 = bytesToBase64(new Uint8Array(buf));
        const { classification, sha1 } = await classifyDroppedFile(base64, file.name);
        await processIncomingFile(file.name, sha1, classification, { fileBase64: base64 }, file.size);
      } catch (e: any) {
        toast.error(e?.message || `No se pudo procesar ${file.name}.`);
      }
    }
  };

  const handleVersionChoice = async (choice: "keep-existing" | "use-new") => {
    if (!versionChoice) return;
    const { staged, existingPath } = versionChoice;
    setVersionChoice(null);
    if (choice === "use-new") await writeStagedContent(staged, existingPath);
  };

  const handlePageDragEnter = (e: React.DragEvent) => {
    if (!pack.installed) return;
    e.preventDefault();
    dragCounterRef.current++;
    setDropActive(true);
  };
  const handlePageDragOver = (e: React.DragEvent) => {
    if (pack.installed) e.preventDefault(); // required for onDrop to fire at all
  };
  const handlePageDragLeave = () => {
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDropActive(false);
  };
  const handlePageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDropActive(false);
    if (!pack.installed) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleContentDrop(files);
  };

  const swellLayer = (
    <AnimatePresence>
      {swellColors && (
        <motion.div
          key={`${pack.id}-${theme}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: theme === "light" ? 0.6 : 0.9 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          {animatedBackground ? (
            <SwellLight
              color={swellColors.color}
              glintColor={swellColors.glint}
              contrast={2.2}
              glint={0.3}
              cursorSize={18}
              cursorStrength={0.6}
              trail={0.9}
            />
          ) : (
            <StaticGlow color={swellColors.color} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ⋮ + Play (+ playtime) and the "Contenido adicional" card. Inline in the
  // header; embedded (the online instance page) they're portaled into that
  // page's own header card instead, so they're shown on every view.
  // Downloaded instances: the logo goes on its own, as tall as the header card, in
  // a column left of the header and content cards (130px + 12px of gap). It hangs out of the
  // max-w-5xl column as far as the window allows; the rest comes out of those
  // cards' left padding, so they always start right after it.
  const logoCard = !!pack.isDownloaded && !embedded;
  // The instance's banner across the top of the page, fading into the background;
  // the header card overlaps its lower part.
  const showBanner = !!pack.bannerUrl && !embedded;
  // Online instance: Novedades in a column of its own, left of both the header and
  // the content card (embedded, the host page already has it). The other two keep
  // their full width and stay centered in the window while there's room for it.
  // 19.25rem = 1rem window margin + 18rem panel + 1.25rem gap − the columns' own 1rem
  // padding (the gap is the same 20px as between header and card); 64rem = max-w-5xl.
  // The panel's left follows them, so it sits next to the card rather than the window edge.
  // Panels moved here from Inicio's footer (right click → "Mover a Contenido") join the
  // same layout, in the order and column the player left them (ContentSidePanels). The
  // reserves: 19.25rem as above, 25.25rem = the right column's 24rem + the same gaps.
  const novedadesColumn = !embedded && !!pack.repoUrl && !pack.outOfNetwork;
  const sideColumns = contentColumns(
    contentLayout,
    [
      ...(movedPanels.includes("changelog") ? (["changelog"] as const) : []),
      ...(movedPanels.includes("members") ? (["members"] as const) : []),
      ...(myUuid && movedPanels.includes("groupChat") ? (["groupChat"] as const) : []),
    ],
    wideWindow
  );
  const leftReserve = sideColumns.left.length > 0 ? "19.25rem" : "0rem";
  const rightReserve = sideColumns.right.length > 0 ? "25.25rem" : "0rem";
  const centerWidth = `min(64rem, calc(100% - ${leftReserve} - ${rightReserve}))`;
  const centerLeft = `max(${leftReserve}, min(calc((100% - var(--center-w)) / 2), calc(100% - var(--center-w) - ${rightReserve})))`;
  const centerVar = { "--center-w": centerWidth } as React.CSSProperties;
  const besideNovedades: React.CSSProperties | undefined = novedadesColumn
    ? { ...centerVar, width: "var(--center-w)", marginLeft: centerLeft }
    : undefined;
  // Next to the content card; an empty column (only there while dragging) at the window's edge.
  const sideColumnStyles: Record<PanelColumn, React.CSSProperties> = {
    left: sideColumns.left.length > 0 ? { ...centerVar, left: `calc(${centerLeft} - 18.25rem)` } : { left: "1rem" },
    right: sideColumns.right.length > 0 ? { ...centerVar, left: `calc(${centerLeft} + var(--center-w) + 0.25rem)` } : { right: "1rem" },
  };
  const packLogo = (
    <div className={`${logoCard ? "h-[130px] w-[130px] min-[1056px]:-ml-7 min-[1120px]:-ml-12 min-[1280px]:-ml-[142px]" : "h-24 w-24"} rounded-md border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl`}>
      {pack.imageUrl ? (
        <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-4xl font-black text-accent/60">
          {pack.name.charAt(0)}
        </div>
      )}
    </div>
  );

  const playGroup = pack.installed ? (
    // items-start, not center: the Play column has the playtime under
    // the button, and centering against the whole column left the ⋮
    // lower than the button itself. Both are h-9, so tops line up.
    <motion.div
      className={`flex items-start shrink-0 max-w-full ${embedded ? "gap-2" : "gap-1.5"}`}
      initial={false}
      animate={{ width: progressWide ? PLAY_PROGRESS_WIDTH : "auto" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* While installing/opening, the ⋮ goes away and the progress chip takes
          its place too: one piece, square on the left, round on the right. */}
      {!playProgress.active && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            // Glass: translucent fill and a blur, no lighter border frame (like the cards),
            // for whatever is behind (the header card itself, or the online page's banner).
            className={`shrink-0 rounded-md border border-transparent bg-white/[0.07] backdrop-blur-md text-gray-200 hover:bg-white/[0.14] hover:text-white data-[state=open]:bg-white/[0.14] data-[state=open]:text-white ${embedded ? "h-11 w-11" : ""}`}
            aria-label="Más opciones"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* Glass like the header card (gray-500 at 15% + blur; no lighter border frame), and a translucent
            highlight instead of the solid accent (Eliminar keeps its red). Highlights and lines
            run edge to edge (no inner padding/rounding), so every layer is the same width. */}
        <DropdownMenuContent
          align="end"
          className="p-0 bg-gray-500/15 backdrop-blur-xl border-transparent shadow-[0_8px_24px_rgba(0,0,0,0.35)] [&_[role=menuitem]]:rounded-none [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-2 [&_[role=separator]]:m-0 [&_[role=menuitem]]:focus:bg-white/10 [&_[role=menuitem]]:focus:text-foreground [&_[role=menuitem].text-destructive]:focus:bg-destructive/15 [&_[role=menuitem].text-destructive]:focus:text-destructive"
        >
          <DropdownMenuItem onSelect={() => setTimeout(() => setSettingsOpen(true), 0)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Configuración
          </DropdownMenuItem>
          {/* A line between every option. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            // Next tick, like Configuración: the menu has to finish closing before a dialog opens.
            onSelect={() =>
              setTimeout(() =>
                openCrashDiagnosis({
                  modpackId: pack.id,
                  name: pack.name,
                  mcVersion: pack.minecraftVersion,
                  loaderType: pack.loaderType,
                }),
                0
              )
            }
          >
            <Stethoscope className="mr-2 h-4 w-4" />
            Diagnosticar crasheos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              try {
                await openInstanceFolder(pack.id);
              } catch (e: any) {
                toast.error(e?.message || "No se pudo abrir la carpeta.");
              }
            }}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Abrir carpeta
          </DropdownMenuItem>
          {pack.source === "custom" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setSharingInstance(true), 0)}>
                <Share2 className="mr-2 h-4 w-4" />
                Compartir
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setDuplicatingInstance(true), 0)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  setKeepInstanceFiles(false);
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar instancia
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      )}
      <div className={`flex flex-col items-center gap-1 ${progressWide ? "flex-1 min-w-0" : "shrink-0"}`}>
        {playProgress.active ? (
          <InstanceProgressChip
            entry={playProgress.entry}
            runState={playProgress.runState}
            status={playProgress.status}
            installed={!!pack.installed}
            online={pack.source !== "custom"}
            size={embedded ? 44 : 36}
            // Embedded: 15rem + the ⋮ button and the gap it leaves free. Inline:
            // the whole Play group, widened to PLAY_PROGRESS_WIDTH.
            className={embedded ? "w-[calc(15rem+3.25rem)]" : "w-full"}
            // Left corners: the same curve as the Play/Cerrar button (rounded-md).
            style={{ borderRadius: `var(--radius-md) ${embedded ? 12 : 10}px ${embedded ? 12 : 10}px var(--radius-md)` }}
          />
        ) : (
        <Button
          onClick={playToggle}
          disabled={playBusy}
          className={`shrink-0 border-transparent font-bold gap-1.5 ${embedded ? "h-11 px-6 text-base" : ""} ${
            playRunning
              ? "bg-red-600 hover:bg-red-500 text-white"
              : "bg-accent hover:bg-accent/90 text-accent-foreground"
          }`}
        >
          {playBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playRunning ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          {playBusy
            ? runStateBusyLabel(playRunState)
            : playRunning
              ? "CERRAR"
              : pack.updateAvailable
                ? "ACTUALIZAR Y JUGAR"
                : "JUGAR"}
        </Button>
        )}
        {/* On the normal page it's a badge in the header (clock); embedded there's no such header. */}
        {embedded && totalPlaytimeMs > 0 && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatPlaytime(totalPlaytimeMs)}
          </span>
        )}
      </div>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{pack.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {keepInstanceFiles
                ? "La instancia dejará de aparecer en la app, pero sus archivos (mods, partidas guardadas, configuración) se quedarán en el equipo."
                : "Se borrará toda la instancia (mods, partidas guardadas, configuración) de este equipo. Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={keepInstanceFiles}
              onCheckedChange={(v) => setKeepInstanceFiles(v === true)}
              disabled={deletingInstance}
            />
            Conservar los archivos de la instancia
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingInstance} className="border-transparent bg-white/[0.07] hover:bg-white/[0.14]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingInstance}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                setDeletingInstance(true);
                try {
                  // Call the IPC directly rather than the store's deleteInstance
                  // action — that also removes the instance from the shared
                  // Zustand array, which would flip `pack` to undefined while
                  // this page is still mounted and crash the hook count (there
                  // are hooks declared after the `if (!pack) return` above).
                  // Navigating away first, then letting the Hub's own mount
                  // effect reload the list, sidesteps that entirely.
                  await deleteInstanceIpc(pack.id, keepInstanceFiles);
                  toast.success(
                    keepInstanceFiles
                      ? `${pack.name} quitada de la app (archivos conservados).`
                      : `${pack.name} eliminada.`
                  );
                  setLocation("/hub");
                } catch (err: any) {
                  toast.error(err?.message || "No se pudo eliminar la instancia.");
                } finally {
                  setDeletingInstance(false);
                  setDeleteConfirmOpen(false);
                }
              }}
            >
              {deletingInstance && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {keepInstanceFiles ? "Quitar" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  ) : null;
  const extrasCard =
    hasExtras && extraGroups ? (
    <div className={`${embedded ? "flex h-full w-80" : "hidden md:flex flex-1"} relative overflow-hidden min-w-0 items-center gap-3 bg-gray-500/10 backdrop-blur-md border border-transparent rounded-md p-4`}>
      {/* Accent line along the top, like the account menu's cards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.7),transparent)]"
      />
      <div className="h-11 w-11 shrink-0 rounded-md bg-accent/15 text-accent flex items-center justify-center shadow-[0_0_14px_hsl(var(--accent)/0.25)]">
        <Layers className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">Contenido adicional</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {extraGroups.groups.length + extraGroups.selectable.length} grupo
          {extraGroups.groups.length + extraGroups.selectable.length === 1 ? " opcional" : "s opcionales"}
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={() => {
          // Embedded the card stays visible from a mod's page or the search too.
          setSelectedModPath(null);
          setSearchMode(false);
          setEmotesOpen(false);
          setSchematicsOpen(false);
          setScreenshotsOpen(false);
          setSummaryOpen(false);
          setVersionsOpen(false);
          setExtrasOpen((v) => !v);
        }}
        className={`h-9 px-4 shrink-0 text-xs font-semibold border border-transparent ${
          extrasOpen
            ? "bg-white/[0.14] text-white hover:bg-white/[0.2]"
            : "bg-accent/70 text-white shadow-[0_4px_16px_hsl(var(--accent)/0.25)] hover:bg-accent/85"
        }`}
      >
        {extrasOpen ? "Cerrar" : "Ver"}
      </Button>
    </div>
    ) : null;

  return (
    <div
      ref={outerRef}
      // It doesn't scroll as a whole — the header and the content card stay put and only
      // the card's inside scrolls. Embedded it fills the host page's column.
      className={`flex flex-col overflow-hidden text-foreground relative ${embedded ? "flex-1 min-h-0" : "h-full bg-background"}`}
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {!embedded && <ManagerTour kind={pack.source === "custom" ? "private" : "online"} ready={!!pack.installed} />}
      {/* Sticky + negative margin: stays pinned to the viewport while the page
          scrolls, without taking any space in the flow. Under everything below
          (the content wrapper is z-10, the header group z-30). */}
      {!embedded && (
        <div className="pointer-events-none sticky top-0 z-0 h-screen -mb-[100vh] shrink-0 overflow-hidden" aria-hidden>
          {swellLayer}
        </div>
      )}
      {/* The instance's banner, same trick: pinned, taking no space, over the
          background and under everything else — it reaches down behind the header
          and the top of the content card (both glass) and fades into the page. */}
      {showBanner && (
        <div className="pointer-events-none sticky top-0 z-0 h-64 -mb-64 shrink-0 overflow-hidden" aria-hidden>
          <img
            src={pack.bannerUrl}
            alt=""
            className="w-full h-full object-cover"
            style={{
              maskImage: "linear-gradient(to bottom, black 35%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 35%, transparent 100%)",
            }}
          />
        </div>
      )}
      {dropActive && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-accent/10 border-4 border-dashed border-accent/50 flex items-center justify-center">
          <div className="bg-card/90 rounded-lg px-6 py-4 flex items-center gap-3 text-white">
            <UploadCloud className="h-6 w-6 text-accent" />
            <span className="font-semibold">Suelta el archivo para añadirlo</span>
          </div>
        </div>
      )}
      {/* Reminder that content can simply be dragged onto this page — here and in
          the online-instance page (which embeds this manager). Shown except while
          dragging (the drop overlay says it then) or once dismissed for THIS
          instance — hovering it unfolds a "No mostrar más" button. */}
      <AnimatePresence>
        {pack.installed && !dropActive && !dropHintHidden && (
          <motion.div
            key="drop-hint"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: "easeOut", delay: 0.6 }}
            className="group absolute bottom-5 left-5 z-40 w-[264px] overflow-hidden rounded-md border border-accent/20 bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]"
            />
            <div className="flex items-start gap-3 p-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent shadow-[0_0_14px_hsl(var(--accent)/0.25)]">
                <UploadCloud className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Arrastra y suelta</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {contentLocked
                    ? "Puedes añadir emotes o esquemas arrastrando el archivo a esta página."
                    : "Puedes añadir mods, shaders, resource packs, emotes o esquemas arrastrando el archivo a esta página."}
                </p>
              </div>
            </div>
            <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
              <div className="overflow-hidden">
                <div className="flex justify-start px-3 pb-3">
                  <button
                    type="button"
                    onClick={hideDropHint}
                    className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/15 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    No mostrar más
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* With a banner (the background layer above) the header card sits 4rem
          down over it, and there's no blur: it would blur the banner, and nothing
          scrolls under the header anyway (the list scrolls inside its card).
          Without one the group is just frosted glass, no fill. The blur is a layer
          of its own that fades out over its last 40px — ending sharp, it drew a
          visible seam across the page's background glow at the header's bottom edge. */}
      <div className="sticky top-0 z-30 shrink-0">
        {!showBanner && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]"
          />
        )}
        <div className={embedded ? (!selectedModPath && !searchMode ? "hidden" : "w-full") : "max-w-5xl mx-auto w-full"} style={besideNovedades}>
        <div className={`px-4 pb-2 relative z-10 flex items-stretch gap-3 ${showBanner ? "pt-16" : "pt-8"}`}>
          {logoCard && packLogo}
          <div
            className={`w-full min-w-0 flex items-center justify-between gap-4 mr-auto transition-[max-width] duration-300 ease-out bg-gray-500/10 backdrop-blur-md border border-transparent rounded-md p-4 ${!selectedModPath && !searchMode ? "" : "max-w-full"}`}
            style={
              !selectedModPath && !searchMode
                ? {
                    // As wide as the content card below. 42rem (the old max-w-2xl) only
                    // when the "Contenido adicional" card needs the room on its right.
                    maxWidth: !extrasCard ? "100%" : "42rem",
                  }
                : undefined
            }
          >
            {selectedModPath && selectedMatch ? (
                <motion.div
                  key="mod-header"
                  className="flex items-center gap-4 min-w-0 flex-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Hint label="Volver al pack">
                    <button
                      onClick={closeMod}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
                      aria-label="Volver al pack"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </Hint>
                  <motion.div
                    layoutId={`icon-${selectedModPath}`}
                    className="h-20 w-20 rounded-md border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl"
                  >
                    {selectedMatch.iconUrl ? (
                      <img src={selectedMatch.iconUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-black text-accent/60">
                        {selectedMatch.title.charAt(0)}
                      </div>
                    )}
                  </motion.div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <motion.h2 layoutId={`title-${selectedModPath}`} className="text-2xl font-bold text-white truncate">
                        {selectedMatch.title}
                      </motion.h2>
                      {selectedRow && (
                        <span className="text-sm text-muted-foreground shrink-0">v{selectedMatch.versionNumber}</span>
                      )}
                      {!isLibraryProjectId(selectedMatch.projectId) && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = toggleFavorite({
                            projectId: selectedMatch.projectId,
                            title: selectedMatch.title,
                            iconUrl: selectedMatch.iconUrl ?? undefined,
                            category: selectedCategory ?? effectiveCategory,
                          });
                          setIsModFavorited(next);
                        }}
                        aria-label={isModFavorited ? "Quitar de favoritos" : "Añadir a favoritos"}
                        className="shrink-0 text-gray-400 hover:text-accent transition-colors"
                      >
                        <Heart className={`h-4 w-4 ${isModFavorited ? "fill-accent text-accent" : ""}`} />
                      </button>
                      )}
                    </div>
                    {!!projectDetail?.description && (
                      <p className="text-sm text-gray-300 select-text">{projectDetail.description}</p>
                    )}
                    {isLibraryProjectId(selectedMatch.projectId) ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Library className="h-3.5 w-3.5 text-accent" /> Biblioteca de mods del grupo
                      </div>
                    ) : (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{(projectDetail?.downloads ?? 0).toLocaleString()} descargas</span>
                      <span className="opacity-50">•</span>
                      <span>{(projectDetail?.followers ?? 0).toLocaleString()} me gusta</span>
                      {!!projectDetail?.categories?.length && (
                        <>
                          <span className="opacity-50">•</span>
                          {projectDetail.categories.map((cat) => (
                            <Badge key={cat} variant="outline" className="text-[10px] capitalize bg-accent/15 text-accent border-accent/30">
                              {cat}
                            </Badge>
                          ))}
                        </>
                      )}
                    </div>
                    )}
                  </div>
                </motion.div>
              ) : searchMode ? (
                <motion.div
                  key="search-header"
                  className="flex items-center gap-3 min-w-0 flex-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Hint label="Volver al pack">
                    <button
                      onClick={() => {
                        setSearchMode(false);
                        setSearchQuery("");
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
                      aria-label="Volver al pack"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </Hint>
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Buscar ${CATEGORY_META[effectiveCategory].label.toLowerCase()}`}
                    className="flex-1 bg-background/50 border-white/10 text-white h-10 text-base"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="pack-header"
                  className="flex items-center gap-4 min-w-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {!logoCard && packLogo}
                  {/* As tall as the icon: the name at its top with a divider line right under it,
                      the badges at its bottom. */}
                  <div className="min-w-0 min-h-24 self-stretch flex flex-col gap-2">
                    <div className="flex items-baseline gap-2 min-w-0 leading-none">
                      {/* pb: truncate clips at the line box, and leading-none leaves no room for descenders. */}
                      <h2 className="text-4xl font-bold text-white truncate leading-none pb-1.5">{pack.name}</h2>
                      {pack.source !== "custom" && (
                        <span className="text-sm font-normal text-muted-foreground shrink-0">{pack.version}v</span>
                      )}
                    </div>
                    <div className="h-px w-full bg-white/10" aria-hidden />
                    {!!pack.description && <p className="text-sm text-gray-300 max-w-3xl">{pack.description}</p>}
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1.5" title="Versión de Minecraft">
                        <Gamepad2 className="h-3.5 w-3.5" />
                        {pack.minecraftVersion}
                      </Badge>
                      {/* The loader and its version in one badge. */}
                      <Badge variant="secondary" className="gap-1.5" title="Modloader">
                        <span className="uppercase">{pack.loaderType}</span>
                        {pack.source === "custom" && pack.loaderVersion && (
                          <span className="font-normal opacity-75">{pack.loaderVersion}</span>
                        )}
                      </Badge>
                      {pack.totalSizeMb > 0 && <Badge variant="outline">{pack.totalSizeMb} MB</Badge>}
                      {totalPlaytimeMs > 0 && (
                        <Badge variant="secondary" className="gap-1.5" title="Tiempo jugado">
                          <Clock className="h-3.5 w-3.5" />
                          {formatPlaytimeShort(totalPlaytimeMs)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            {showHeaderAction && (
              <div className="flex flex-col items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  onClick={handleHeaderInstallClick}
                  disabled={selectedBusy || !selectedActionable}
                  aria-label={selectedLocked ? "Instalado (obligatorio)" : selectedUpToDate ? "Instalado" : selectedUpdate ? "Actualizar" : "Instalar"}
                  className={`h-10 w-10 self-center ${
                    selectedActionable
                      ? "bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30"
                      : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {selectedBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : selectedUpToDate ? (
                    <Check className="h-4 w-4" />
                  ) : selectedUpdate ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-white" />
                  )}
                </Button>
                {selectedRow && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatBytes(selectedRow.size)}</span>
                )}
              </div>
            )}
            {!embedded && !selectedModPath && !searchMode && playGroup}
          </div>
          {/* Contenido adicional: its own card in the free space right of the
              pack header (only on the pack's main view, like the Play group). */}
          {!embedded && !selectedModPath && !searchMode && extrasCard}
        </div>
        </div>
      </div>

      {/* Shares its box with the side columns, so they start where the content card does
          (top-3 = its pt-3) and end where it ends, whatever the header's height. */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      {novedadesColumn && (
        <ContentSidePanels
          pack={pack}
          myUuid={myUuid}
          myUsername={myUsername ?? ""}
          columns={sideColumns}
          wide={wideWindow}
          styles={sideColumnStyles}
          // Level with the header card: 4rem down over the banner, or 2rem without one.
          topClassName={showBanner ? "top-[3.75rem]" : "top-7"}
          // No chat window on this page (no footer): Inicio shows the private chat.
          onChatOpened={() => setLocation("/")}
        />
      )}
      <div className={`relative z-10 w-full flex-1 min-h-0 flex flex-col ${embedded ? "" : "max-w-5xl mx-auto"}`} style={besideNovedades}>
        <div className={`relative flex-1 min-h-0 flex flex-col ${embedded ? "" : "px-4 pt-3 pb-4"} ${logoCard ? "pl-[158px] min-[1056px]:pl-[130px] min-[1120px]:pl-[110px] min-[1280px]:pl-4" : ""}`}>
          {/* Under the logo, in the same column (same x as its negative margins). */}
          {logoCard && (
            <div className="absolute top-3 left-4 min-[1056px]:-left-3 min-[1120px]:-left-8 min-[1280px]:-left-[126px] w-[130px] max-h-[calc(100%-1.75rem)] overflow-y-auto">
              <DownloadedPackDetails pack={pack} />
            </div>
          )}
          {/* No backdrop-blur here (unlike the header card): a blurred ancestor stops the
              sticky tabs/sort band inside from blurring the rows that scroll under it. */}
          {/* Our own scrollbar, next to the list only (from under the tabs/filters band). */}
          <ListScrollbar scrollRef={cardScrollRef} bandRefs={[tabsElRef, sortRowElRef]} />
          {/* Floating "back to top", centered at the bottom of the card while scrolled down. */}
          <AnimatePresence>
            {contentScrolled && (
              <Hint label="Volver arriba" key="back-to-top">
                <motion.button

                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  onClick={() => cardScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                  aria-label="Volver arriba"
                  className={`absolute bottom-8 ${logoCard ? "left-[calc(50%+71px)] min-[1056px]:left-[calc(50%+57px)] min-[1120px]:left-[calc(50%+47px)] min-[1280px]:left-1/2" : "left-1/2"} z-30 -ml-5 h-10 w-10 flex items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-black/40 hover:brightness-110 transition-[filter]`}
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.75} />
                </motion.button>
              </Hint>
            )}
          </AnimatePresence>
          <div
            ref={cardScrollRef}
            className="bg-gray-500/10 border border-accent/15 rounded-md flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            onPointerMove={(e) => {
              // Only matters while the sort row is folded away.
              if (!sortRowHidden && !pointerNearBandRef.current) return;
              const band = tabsElRef.current?.getBoundingClientRect();
              const near = !!band && e.clientY >= band.top && e.clientY <= band.bottom + 24;
              if (near !== pointerNearBandRef.current) {
                pointerNearBandRef.current = near;
                setPointerNearBand(near);
              }
            }}
            onPointerLeave={() => {
              if (!pointerNearBandRef.current) return;
              pointerNearBandRef.current = false;
              setPointerNearBand(false);
            }}
            // Hides past 16px, shows again only at the very top (no flicker around one threshold).
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              const was = contentScrolledRef.current;
              const next = was ? top > 0 : top > 16;
              if (next !== was) {
                contentScrolledRef.current = next;
                setContentScrolled(next);
              }
            }}
          >
            {/* Thin accent line along the top, like the emote viewer dialog. Sticky
                (and above the sticky tabs band) so it stays put while the list scrolls. */}
            <div
              aria-hidden
              className="pointer-events-none sticky top-0 z-30 -mb-px h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.7),transparent)]"
            />
            {/* The padding lives one layer in. On the scroll container itself the
                browser sticks the tabs band below the padding (16px under the card's top
                edge); here the band can reach the edge. */}
            <div className="p-4">
            {/* This card is the scroll container — the sticky tabs/sort band sticks to its top. */}
            <AnimatePresence mode="wait" initial={false} custom={panelDirection} onExitComplete={restoreCardScroll}>
              <motion.div
                key={selectedModPath ? "mod" : extrasOpen && hasExtras ? "extras" : "pack"}
                custom={panelDirection}
                variants={sweepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
            {selectedModPath && selectedCategory ? (
              <Tabs value={modDetailTab} onValueChange={(v) => setModDetailTab(v as ModDetailTab)}>
                <div className="flex items-center justify-between gap-2">
                  <TabsList className="bg-card/50 border border-white/5">
                    <TabsTrigger value="description" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Descripción
                    </TabsTrigger>
                    <TabsTrigger value="gallery" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" /> Imágenes
                    </TabsTrigger>
                    <TabsTrigger value="versions" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5">
                      <List className="h-3.5 w-3.5" /> Versiones
                    </TabsTrigger>
                    <TabsTrigger value="dependencies" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Dependencias
                    </TabsTrigger>
                  </TabsList>
                  <AnimatePresence>
                    {modDetailTab === "description" && translatedDescription && (
                      <motion.button
                        key="toggle-original"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowOriginalDescription((v) => !v)}
                        className="text-xs font-medium text-sky-400/90 hover:text-sky-300 transition-colors shrink-0"
                      >
                        {showOriginalDescription ? "Mostrar traducción" : "Mostrar original"}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                <TabsContent value="description" className="mt-4">
                  {modDetailLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
                    </div>
                  ) : projectDetail?.body ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-img:rounded-md prose-a:text-accent select-text">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}
                      >
                        {(showOriginalDescription ? projectDetail.body : translatedDescription ?? projectDetail.body)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-300">Sin descripción.</p>
                  )}
                </TabsContent>

                <TabsContent value="gallery" className="mt-4">
                  {modDetailLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
                    </div>
                  ) : !projectDetail?.gallery.length ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <ImageIcon className="h-6 w-6" />
                      <p className="text-sm">No hay imágenes.</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {projectDetail.gallery.map((g) => (
                        <button
                          type="button"
                          key={g.url}
                          onClick={() => setLightboxImage({ src: g.url, title: g.title })}
                          className="block"
                        >
                          <img
                            src={g.url}
                            alt={g.title || ""}
                            className="w-full aspect-video object-cover rounded-md border border-white/10 hover:border-white/30 transition-colors"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="versions" className="mt-4">
                  {modDetailLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
                    </div>
                  ) : modVersions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <FileQuestion className="h-6 w-6" />
                      <p className="text-sm">No hay versiones compatibles.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Elige qué versión instalar. El color del estado indica su estabilidad: verde es la más estable, rojo la menos.
                      </p>
                      <div className="flex items-center gap-3 px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        <span className="w-6 text-center shrink-0">Estado</span>
                        <span className="flex-1">Nombre</span>
                        <span className="w-24 shrink-0">Fecha</span>
                        <span className="w-16 shrink-0">Descargas</span>
                        <span className="w-7 shrink-0" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {modVersions.map((v) => {
                          const isInstalled = v.versionId === selectedMatch?.versionId;
                          const busy = busyPaths.has(selectedModPath!);
                          const locked = (!!selectedRow && selectedRow.mandatory && !isInstalled) || (contentLocked && !isInstalled);
                          const typeMeta = VERSION_TYPE_META[v.versionType];
                          return (
                            <div
                              key={v.versionId}
                              className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full relative border border-accent/15 hover:border-accent/35 transition-colors before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.55),transparent)]"
                            >
                              <span
                                className={`h-6 w-6 flex items-center justify-center rounded-md border text-[11px] font-bold shrink-0 ${typeMeta.className}`}
                                title={v.versionType}
                              >
                                {typeMeta.letter}
                              </span>
                              <p className="text-gray-100 font-medium text-sm truncate flex-1 min-w-0">v{v.versionNumber}</p>
                              <span className="text-muted-foreground text-[11px] w-24 shrink-0">{formatDate(v.datePublished)}</span>
                              <span className="text-muted-foreground text-[11px] w-16 shrink-0 flex items-center gap-0.5">
                                {v.downloads.toLocaleString()}
                                <ArrowDown className="h-2.5 w-2.5" />
                              </span>
                              <div className="w-7 shrink-0 flex items-center justify-center">
                                {isInstalled ? (
                                  <Check className="h-4 w-4 text-accent" />
                                ) : locked ? (
                                  <Lock className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <button
                                    onClick={() =>
                                      selectedMatch &&
                                      handleInstallVersion(selectedCategory!, selectedModPath!, v, selectedMatch)
                                    }
                                    disabled={busy}
                                    title={selectedRow ? `Cambiar a v${v.versionNumber}` : `Instalar v${v.versionNumber}`}
                                    className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                                  >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="dependencies" className="mt-4">
                  {dependenciesLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
                    </div>
                  ) : dependencies.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <Package className="h-6 w-6" />
                      <p className="text-sm">Este contenido no necesita otros mods para funcionar.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {dependencies.map((dep) => {
                        const installed = installedModByProject.has(dep.projectId);
                        const busy = busyPaths.has(`search:${dep.projectId}`);
                        return (
                          <div
                            key={dep.projectId}
                            role="button"
                            tabIndex={0}
                            onClick={() => openDependency(dep)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openDependency(dep);
                              }
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full cursor-pointer hover:bg-white/5 transition-colors relative border border-accent/15 hover:border-accent/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.55),transparent)]"
                          >
                            {dep.iconUrl ? (
                              <img src={dep.iconUrl} alt="" className="h-8 w-8 rounded shrink-0 object-cover bg-black/30" />
                            ) : (
                              <div className="h-8 w-8 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <p className="text-gray-100 font-medium text-sm truncate flex-1 min-w-0">{dep.title}</p>
                            <Badge variant="outline" className="text-[10px] shrink-0">Obligatoria</Badge>
                            {installed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-accent shrink-0">
                                <Check className="h-3.5 w-3.5" /> Instalada
                              </span>
                            ) : pack.installed && !contentLocked ? (
                              <Button
                                size="sm"
                                className="h-7 text-xs shrink-0"
                                disabled={busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void installDependencies([dep]);
                                }}
                              >
                                {busy ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="mr-1 h-3.5 w-3.5" />
                                )}
                                Instalar
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : extrasOpen && hasExtras && packManifest ? (
              <OptionalContentView
                key={contentReloadKey}
                manifest={packManifest}
                savedChoice={savedGroupChoice}
                installedPaths={localPaths}
                pendingUpdateVersion={pack.updateAvailable ? packManifest.version : undefined}
                onApply={applyGroupChoice}
                onBack={() => setExtrasOpen(false)}
              />
            ) : loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando contenido...
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileQuestion className="h-6 w-6" />
                <p className="text-sm">Sin manifiesto publicado todavía.</p>
              </div>
            ) : (
              <Tabs
                // An empty value matches no real category, so Radix stops marking
                // whichever tab was last active while the Emotes/Esquemas sibling
                // panels (which aren't part of this Tabs' value space) are open.
                value={emotesOpen || schematicsOpen || otherSectionOpen ? "" : effectiveCategory}
                onValueChange={(v) => {
                  setEmotesOpen(false);
                  setSchematicsOpen(false);
                  setScreenshotsOpen(false);
                  setActiveCategory(v as Category);
                }}
              >
                {!searchMode && (
                  <div
                    ref={tabsRowRef}
                    // A permanent gray panel across the top of the card (with the sort row
                    // below): out to the card's padding edge (-16px, back as padding) — no
                    // further, or the card (a scroll container) would scroll sideways; the
                    // card's rounded clip rounds its top corners. px 15 (+1px border) = 16px in, like the
                    // header card's p-4: its content and this band's start and end at the same x. The sort row lives inside
                    // it too, so tabs + filters are one block with one line under it.
                    className="sticky top-0 z-20 flex flex-col gap-3 border pt-3 -mx-4 -mt-4 px-[15px] pb-2 mb-0 rounded-none bg-gray-500/10 backdrop-blur-xl border-transparent border-b-white/10"
                  >
                    {/* Top level: the instance's content vs. its screenshots —
                        screenshots used to sit among the content tabs. */}
                    <AnimatePresence initial={false}>
                    {pack.installed && !(contentScrolled && !otherSectionOpen) && (
                      <motion.div
                        key="section-row"
                        // marginBottom: -12 cancels the band's gap-3 while it folds.
                        initial={{ opacity: 0, height: 0, marginBottom: -12 }}
                        animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: -12 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-1 p-1 rounded-md bg-gray-500/10 backdrop-blur-md border border-transparent">
                          {([
                            { id: "content", label: "Contenido", icon: Package },
                            ...(pack.modrinthProjectId ? ([{ id: "summary", label: "Resumen", icon: FileText }] as const) : []),
                            { id: "screenshots", label: "Capturas", icon: Camera },
                            ...(pack.modrinthProjectId ? ([{ id: "versions", label: "Versiones", icon: History }] as const) : []),
                          ] as const).map(({ id: sectionId, label, icon: SectionIcon }) => {
                            const active =
                              sectionId === "screenshots"
                                ? screenshotsOpen
                                : sectionId === "summary"
                                  ? summaryOpen
                                  : sectionId === "versions"
                                    ? versionsOpen
                                    : !otherSectionOpen;
                            return (
                              <button
                                key={sectionId}
                                type="button"
                                onClick={() => {
                                  if (sectionId !== "content") {
                                    setEmotesOpen(false);
                                    setSchematicsOpen(false);
                                  }
                                  setScreenshotsOpen(sectionId === "screenshots");
                                  setSummaryOpen(sectionId === "summary");
                                  setVersionsOpen(sectionId === "versions");
                                  // Only Contenido folds this row while scrolled.
                                  cardScrollRef.current?.scrollTo({ top: 0 });
                                }}
                                className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                                  active ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="section-pill"
                                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                                    className="absolute inset-0 rounded-md bg-accent shadow"
                                  />
                                )}
                                <SectionIcon className="relative h-4 w-4" />
                                <span className="relative">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                        {/* ModrinthSummary portals its translation toggle here. */}
                        {summaryOpen && <div ref={setSummaryActionsEl} className="shrink-0" />}
                      </motion.div>
                    )}
                    </AnimatePresence>
                    <AnimatePresence initial={false}>
                    {!otherSectionOpen && (
                    <motion.div
                      key="category-row"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="flex items-center justify-between gap-2 flex-wrap"
                    >
                    {/* Second level: underlined, so it doesn't compete with Contenido/Capturas. */}
                    <TabsList data-tour="manager-categories" className="h-auto justify-start gap-2 rounded-none border-b border-white/10 bg-transparent p-0">
                      {categories.map((c) => {
                        const Icon = CATEGORY_META[c].icon;
                        return (
                          <TabsTrigger
                            key={c}
                            value={c}
                            onClick={() => {
                              setEmotesOpen(false);
                              setSchematicsOpen(false);
                              setScreenshotsOpen(false);
                            }}
                            className="relative rounded-none px-2 pb-2 pt-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground text-muted-foreground hover:text-foreground gap-1.5"
                          >
                            {c === effectiveCategory && !emotesOpen && !schematicsOpen && (
                              <motion.span
                                layoutId="category-pill"
                                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                              />
                            )}
                            <Icon className="relative h-3.5 w-3.5" />
                            <span className="relative">{CATEGORY_META[c].label}</span>
                            <span className="relative opacity-50">{rowsFor(c).length}</span>
                          </TabsTrigger>
                        );
                      })}
                      {emotecraftInstalled && (
                        <button
                          type="button"
                          onClick={() => {
                            setSchematicsOpen(false);
                            setScreenshotsOpen(false);
                            setEmotesOpen(true);
                          }}
                          className={`relative inline-flex items-center justify-center whitespace-nowrap px-2 pb-2 pt-1 text-sm font-medium gap-1.5 transition-colors ${
                            emotesOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {emotesOpen && (
                            <motion.span
                              layoutId="category-pill"
                              transition={{ type: "spring", stiffness: 500, damping: 40 }}
                              className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                            />
                          )}
                          <Smile className="relative h-3.5 w-3.5" />
                          <span className="relative">Emotes</span>
                        </button>
                      )}
                      {(litematicaInstalled || schematics.length > 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEmotesOpen(false);
                            setScreenshotsOpen(false);
                            setSchematicsOpen(true);
                          }}
                          className={`relative inline-flex items-center justify-center whitespace-nowrap px-2 pb-2 pt-1 text-sm font-medium gap-1.5 transition-colors ${
                            schematicsOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {schematicsOpen && (
                            <motion.span
                              layoutId="category-pill"
                              transition={{ type: "spring", stiffness: 500, damping: 40 }}
                              className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                            />
                          )}
                          <Box className="relative h-3.5 w-3.5" />
                          <span className="relative">Esquemas</span>
                        </button>
                      )}
                    </TabsList>
                    {pack.installed && (
                      <div className="flex items-center gap-2">
                        {!emotesOpen && !schematicsOpen && !otherSectionOpen && contentLocked && (
                          <span
                            data-tour="manager-locked-badge"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-white/10 bg-white/5 text-xs font-semibold text-muted-foreground"
                            title="El creador de esta instancia no permite añadir mods, shaders ni resource packs."
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Contenido bloqueado
                          </span>
                        )}
                        {!emotesOpen && !schematicsOpen && !otherSectionOpen && !contentLocked && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSearchMode(true)}
                            data-tour="manager-install"
                            className="border-accent/50 bg-transparent text-accent hover:bg-accent/10 hover:text-accent font-semibold gap-1.5"
                          >
                            <SiModrinth className="h-3.5 w-3.5" />
                            {`Instalar ${CATEGORY_META[effectiveCategory].label}`}
                          </Button>
                        )}
                        {/* Emotes: the Redlance store lives where "Instalar …" is for the other tabs. */}
                        {emotesOpen && !otherSectionOpen && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={openEmoteStore}
                            title="Abre RedlanceEmotes en tu navegador"
                            className="border-accent/50 bg-transparent text-accent hover:bg-accent/10 hover:text-accent font-semibold gap-1.5"
                          >
                            <Store className="h-3.5 w-3.5" />
                            Tienda de emotes
                          </Button>
                        )}
                        {/* Esquemas: its online search lives where "Instalar …" is for the other tabs. */}
                        {schematicsOpen && !otherSectionOpen && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSchematicOnlineMode((v) => !v)}
                            className="border-accent/50 bg-transparent text-accent hover:bg-accent/10 hover:text-accent font-semibold gap-1.5"
                          >
                            {schematicOnlineMode ? <ArrowLeft className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                            {schematicOnlineMode ? "Ver instalados" : "Buscar online"}
                          </Button>
                        )}
                        {!emotesOpen && !schematicsOpen && !otherSectionOpen && !contentLocked && effectiveCategory === "mods" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLibraryOpen(true)}
                            title="Biblioteca de mods del grupo"
                            className="gap-1.5 font-semibold"
                          >
                            <Library className="h-3.5 w-3.5" />
                            Biblioteca
                          </Button>
                        )}
                      </div>
                    )}
                    </motion.div>
                    )}
                    </AnimatePresence>
                    {/* Sort / filter row of the list, inside the band (one block with the tabs). */}
                    <AnimatePresence initial={false}>
                    {!emotesOpen && !schematicsOpen && !otherSectionOpen && !(sortRowHidden && !pointerNearBand) && (
                      <motion.div
                        key="sort-row"
                        // marginTop: -12 cancels the band's gap-3 while it folds.
                        initial={{ opacity: 0, height: 0, marginTop: -12 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 0 }}
                        exit={{ opacity: 0, height: 0, marginTop: -12 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        // -5px out (on the clipping box, so hover backgrounds at the ends aren't cut):
                        // keeps "Nombre" under "Mods" and "Actualizar todo" under "Biblioteca".
                        className="overflow-hidden -mx-[5px]"
                      >
                      <div
                        ref={sortRowElRef}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSortAsc((v) => !v);
                              scrollListToFirst();
                            }}
                            className="h-7 flex items-center gap-1.5 px-3 text-[11px] font-semibold rounded-md border border-transparent text-muted-foreground hover:text-white transition-colors"
                          >
                            Nombre
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                          {effectiveCategory === "mods" && (
                            <button
                              onClick={() => {
                                setDependencySort((v) => (v === "off" ? "first" : v === "first" ? "last" : "off"));
                                scrollListToFirst();
                              }}
                              title={
                                dependencySort === "off"
                                  ? "Llevar las dependencias arriba"
                                  : dependencySort === "first"
                                  ? "Llevar las dependencias abajo"
                                  : "Quitar orden por dependencias"
                              }
                              className={`h-7 flex items-center gap-1.5 px-3 text-[11px] font-semibold rounded-md border transition-colors ${
                                dependencySort !== "off"
                                  ? "bg-accent/15 text-accent border-accent/30"
                                  : "border-transparent text-muted-foreground hover:text-white"
                              }`}
                            >
                              <Link2 className="h-3 w-3" />
                              Dependencias
                              <span className="w-3 flex justify-center">
                                {dependencySort === "first" ? (
                                  <ArrowUp className="h-3 w-3" />
                                ) : dependencySort === "last" ? (
                                  <ArrowDown className="h-3 w-3" />
                                ) : null}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setUpdatesSort((v) => !v);
                              scrollListToFirst();
                            }}
                            title="Pendientes de actualizar primero; las actualizadas recientemente, al final"
                            className={`h-7 flex items-center gap-1.5 px-3 text-[11px] font-semibold rounded-md border transition-colors ${
                              updatesSort
                                ? "bg-accent/15 text-accent border-accent/30"
                                : "border-transparent text-muted-foreground hover:text-white"
                            }`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Actualizaciones
                            {pendingUpdateCount(effectiveCategory) > 0 && (
                              <span className="rounded-full bg-accent text-accent-foreground px-1.5 text-[10px] leading-4">
                                {pendingUpdateCount(effectiveCategory)}
                              </span>
                            )}
                          </button>
                        </div>
                        {pack.installed && !contentLocked && pendingUpdateCount(effectiveCategory) > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateAll(effectiveCategory)}
                            disabled={updatingAll}
                            className="h-6 shrink-0 gap-1 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground mr-1"
                          >
                            {updatingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" strokeWidth={2.75} />}
                            Actualizar todo ({pendingUpdateCount(effectiveCategory)})
                          </Button>
                        )}
                      </div>
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </div>
                )}

                {searchMode ? (
                  (() => {
                    const results = searchQuery.trim() ? searchResults : popularResults;
                    const CategoryIcon = CATEGORY_META[effectiveCategory].icon;
                    return (
                    <>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <Select value={sortBy} onValueChange={(v) => setSortBy(v as ModrinthSort)}>
                        <SelectTrigger className="h-8 w-[168px] bg-card/50 border-white/10 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="downloads">Más descargas</SelectItem>
                          <SelectItem value="follows">Más me gusta</SelectItem>
                          <SelectItem value="relevance">Relevancia</SelectItem>
                          <SelectItem value="newest">Más reciente</SelectItem>
                        </SelectContent>
                      </Select>
                      {availableGenres.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setGenreFilter(null)}
                            className={`px-2.5 py-1 rounded-full text-[11px] capitalize border transition-colors ${
                              genreFilter === null
                                ? "bg-accent text-accent-foreground border-transparent"
                                : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                            }`}
                          >
                            Todas
                          </button>
                          {availableGenres.map((genre) => (
                            <button
                              key={genre}
                              type="button"
                              onClick={() => setGenreFilter(genre === genreFilter ? null : genre)}
                              className={`px-2.5 py-1 rounded-full text-[11px] capitalize border transition-colors ${
                                genreFilter === genre
                                  ? "bg-accent text-accent-foreground border-transparent"
                                  : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                              }`}
                            >
                              {genre}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando...
                      </div>
                    ) : results.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                        <FileQuestion className="h-6 w-6" />
                        <p className="text-sm">Sin resultados.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {(() => {
                          const installedByProject = new Map<string, { path: string; mandatory: boolean }>();
                          for (const row of rowsFor(effectiveCategory)) {
                            const match = modrinthMatches.get(row.path);
                            if (match) installedByProject.set(match.projectId, { path: row.path, mandatory: row.mandatory });
                          }
                          return results.map((hit) => {
                            const installed = installedByProject.get(hit.projectId);
                            const locked = installed?.mandatory ?? false;
                            const update = installed && !locked ? updates.get(installed.path) : undefined;
                            const upToDate = !!installed && !locked && !update;
                            const busyKey = installed ? installed.path : `search:${hit.projectId}`;
                            const busy = busyPaths.has(busyKey);
                            const actionable = !locked && !upToDate;
                            return (
                              <div key={hit.projectId} className="flex items-center gap-4 p-4 bg-card/50 rounded-md w-full [content-visibility:auto] [contain-intrinsic-size:auto_96px] relative border border-accent/15 hover:border-accent/35 transition-colors before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.55),transparent)]">
                                <div
                                  onClick={() => openModFromSearch(hit, installed)}
                                  className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer"
                                >
                                  {hit.iconUrl ? (
                                    <img src={hit.iconUrl} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded shrink-0 object-cover bg-black/30" />
                                  ) : (
                                    <div className="h-14 w-14 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                      <CategoryIcon className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-gray-100 font-semibold text-lg truncate">{hit.title}</p>
                                    <p className="text-muted-foreground text-sm">{hit.description}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-0.5">
                                    {hit.follows.toLocaleString()}
                                    <Heart className="h-2.5 w-2.5" />
                                  </span>
                                  <div className="flex flex-col items-center gap-1">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        if (!actionable) return;
                                        if (installed && update) handleInstallVersion(activeCategory, installed.path, update, hit);
                                        else handleInstallFromSearch(hit);
                                      }}
                                      disabled={busy || !actionable}
                                      className={`h-8 px-3 text-xs font-bold ${
                                        actionable
                                          ? "bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30"
                                          : "bg-white/5 text-muted-foreground"
                                      }`}
                                    >
                                      {busy ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : locked ? (
                                        <><Lock className="h-3.5 w-3.5 mr-1" />Instalado</>
                                      ) : upToDate ? (
                                        <><Check className="h-3.5 w-3.5 mr-1" />Instalado</>
                                      ) : update ? (
                                        <><RefreshCw className="h-3.5 w-3.5 mr-1" />Actualizar</>
                                      ) : (
                                        <><Download className="h-3.5 w-3.5 mr-1" />Instalar</>
                                      )}
                                    </Button>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-0.5">
                                      {hit.downloads.toLocaleString()}
                                      <ArrowDown className="h-2.5 w-2.5" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                        {hasMoreResults && (
                          <div ref={sentinelRef} className="flex items-center justify-center h-10 text-muted-foreground">
                            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                          </div>
                        )}
                      </div>
                    )}
                    </>
                    );
                  })()
                ) : (
                <motion.div
                  key={versionsOpen ? "versions" : summaryOpen ? "summary" : screenshotsOpen ? "screenshots" : emotesOpen ? "emotes" : schematicsOpen ? "schematics" : effectiveCategory}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                {emotesOpen ? (
                  emotesLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando emotes...
                    </div>
                  ) : emotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <Smile className="h-6 w-6" />
                      <p className="text-sm">No hay emotes en la carpeta "emotes" de esta instancia.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3 pt-4">
                      {emotes.map((emote) => (
                        <ContentContextMenu
                          key={emote.fileName}
                          onSave={() =>
                            void saveFileToLibrary("emotes", `emotes/${emote.fileName}`, emote.fileName, {
                              displayName: emote.displayName,
                              iconUrl: emote.thumbnailBase64 ? `data:image/png;base64,${emote.thumbnailBase64}` : null,
                            })
                          }
                          onShare={() => void shareEmote(emote)}
                          onRename={() =>
                            setRenaming({ kind: "emote", path: `emotes/${emote.fileName}`, currentName: emote.displayName })
                          }
                        >
                        <button
                          type="button"
                          onClick={() => setSelectedEmote(emote)}
                          className="group relative overflow-hidden flex flex-col items-center gap-2 p-3 rounded-md [content-visibility:auto] [contain-intrinsic-height:auto_130px] bg-gray-500/10 border border-accent/15 hover:bg-accent/10 hover:border-accent/40 transition-colors text-left"
                        >
                          {/* Thin accent line along the top, like the emote viewer dialog. */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.7),transparent)] opacity-70 transition-opacity group-hover:opacity-100"
                          />
                          <div className="h-16 w-16 rounded bg-black/30 overflow-hidden flex items-center justify-center shrink-0">
                            {emote.thumbnailBase64 ? (
                              <img
                                src={`data:image/png;base64,${emote.thumbnailBase64}`}
                                alt={emote.displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Smile className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-xs text-gray-200 text-center truncate w-full" title={emote.displayName}>
                            {emote.displayName}
                          </span>
                        </button>
                        </ContentContextMenu>
                      ))}
                    </div>
                  )
                ) : schematicsOpen ? (
                  <>
                    {!schematicOnlineMode ? (
                      schematics.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                          <Box className="h-6 w-6" />
                          <p className="text-sm">No hay esquemas en esta instancia.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 pt-4">
                          {schematics.map((sch) => (
                            <SchematicRow
                              key={sch.path}
                              file={sch}
                              busy={busyPaths.has(sch.path)}
                              onOpen={() => setSelectedSchematic(sch)}
                              onSave={() =>
                                void saveFileToLibrary("schematics", sch.path, fileName(sch.path), {
                                  displayName: schematicName(sch),
                                  iconUrl: null,
                                  schematicSource: sch.source,
                                })
                              }
                              onShare={() => void shareSchematic(sch)}
                              onRename={() => setRenaming({ kind: "schematic", path: sch.path, currentName: schematicName(sch) })}
                              onDelete={async () => {
                                if (!pack) return;
                                setBusyPaths((prev) => new Set(prev).add(sch.path));
                                try {
                                  await deleteInstanceFile(pack.id, sch.path);
                                  setSchematics((prev) => prev.filter((x) => x.path !== sch.path));
                                  toast.success(`${fileName(sch.path)} eliminado.`);
                                } catch (e: any) {
                                  toast.error(e?.message || "No se pudo eliminar el esquema.");
                                } finally {
                                  setBusyPaths((prev) => {
                                    const next = new Set(prev);
                                    next.delete(sch.path);
                                    return next;
                                  });
                                }
                              }}
                            />
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col gap-3">
                        <Input
                          value={schematicQuery}
                          onChange={(e) => setSchematicQuery(e.target.value)}
                          placeholder="Buscar esquemas online..."
                          className="h-8 bg-white/[0.07] border-transparent text-xs"
                        />
                        {schematicSearchLoading ? (
                          <div className="flex items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando...
                          </div>
                        ) : schematicBackendDown ? (
                          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                            <WifiOff className="h-6 w-6" />
                            <p className="text-sm">No se pudo conectar con el buscador de esquemas online.</p>
                          </div>
                        ) : schematicResults.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                            <FileQuestion className="h-6 w-6" />
                            <p className="text-sm">Sin resultados.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {schematicResults.map((hit) => (
                              <button
                                type="button"
                                key={`${hit.vendor}/${hit.uuid}`}
                                onClick={() => setSelectedOnlinePost(hit)}
                                className="flex items-center gap-3 px-3 py-2.5 bg-card/50 rounded-md w-full text-left hover:bg-white/[0.07] transition-colors relative border border-accent/15 hover:border-accent/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.55),transparent)]"
                              >
                                {hit.thumbnailUrl ? (
                                  <img
                                    src={hit.thumbnailUrl}
                                    alt=""
                                    className="h-14 w-14 rounded shrink-0 object-cover bg-black/30"
                                  />
                                ) : (
                                  <div className="h-14 w-14 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                    <Box className="h-6 w-6 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-gray-100 font-semibold text-sm truncate">{hit.postName}</p>
                                  <p className="text-muted-foreground text-xs truncate">{hit.description}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-[10px] py-0">
                                      {hit.vendor}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Download className="h-2.5 w-2.5" />
                                      {hit.downloads.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                            {schematicHasMore && (
                              <div ref={schematicSentinelRef} className="flex items-center justify-center py-4">
                                {schematicLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : summaryOpen && pack.modrinthProjectId ? (
                  <ModrinthSummary projectId={pack.modrinthProjectId} onOpenImage={setLightboxImage} actionsEl={summaryActionsEl} />
                ) : versionsOpen && pack.modrinthProjectId ? (
                  <ModrinthVersions
                    pack={pack}
                    onChanged={async () => {
                      await loadInstances();
                      setContentReloadKey((k) => k + 1);
                    }}
                  />
                ) : screenshotsOpen ? (
                  screenshotsLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
                    </div>
                  ) : screenshots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <Camera className="h-6 w-6" />
                      <p className="text-sm">No hay capturas en la carpeta "screenshots" de esta instancia.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3">
                      {screenshots.map((shot) => (
                        <div key={shot.fileName} className="group relative [content-visibility:auto] [contain-intrinsic-height:auto_160px]">
                        <DropdownMenu>
                          <Hint label="Opciones de la captura">
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-3 right-3 z-10 h-7 w-7 flex items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-black/80 transition-opacity"
                                aria-label="Opciones de la captura"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                          </Hint>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => void showInstanceFile(id!, `screenshots/${shot.fileName}`)}>
                              <FolderOpen className="mr-2 h-4 w-4" /> Abrir carpeta
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!shot.sha1}
                              onClick={() =>
                                setShareImage({
                                  fileName: shot.fileName,
                                  sha1: shot.sha1!,
                                  size: shot.size,
                                  thumbnailDataUrl: shot.thumbnailDataUrl,
                                  readBase64: () => readInstanceFile(id!, `screenshots/${shot.fileName}`),
                                })
                              }
                            >
                              <Send className="mr-2 h-4 w-4" /> Compartir imagen
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const { alreadySaved } = await addToGallery(
                                    { kind: "instance", modpackId: id!, path: `screenshots/${shot.fileName}` },
                                    shot.fileName,
                                    { kind: "instance", name: pack.name }
                                  );
                                  toast.success(alreadySaved ? "Ya estaba en tu galería." : "Añadida a tu galería.");
                                } catch (e: any) {
                                  toast.error(e?.message || "No se pudo añadir a la galería.");
                                }
                              }}
                            >
                              <ImageIcon className="mr-2 h-4 w-4" /> Agregar a la galería
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          type="button"
                          onClick={async () => {
                            setLightboxImage({ src: shot.thumbnailDataUrl ?? "", title: shot.fileName });
                            setLightboxLoading(true);
                            try {
                              const base64 = await readInstanceFile(id!, `screenshots/${shot.fileName}`);
                              setLightboxImage({ src: `data:image/png;base64,${base64}`, title: shot.fileName });
                            } catch (e: any) {
                              toast.error(e?.message || "No se pudo cargar la captura.");
                            } finally {
                              setLightboxLoading(false);
                            }
                          }}
                          className="w-full flex flex-col items-center gap-2 p-2 rounded-md bg-gray-500/10 border border-transparent hover:bg-white/10 hover:border-white/20 transition-colors"
                        >
                          <div className="h-24 w-full rounded bg-black/30 overflow-hidden flex items-center justify-center shrink-0">
                            {shot.thumbnailDataUrl ? (
                              <img src={shot.thumbnailDataUrl} alt={shot.fileName} className="h-full w-full object-cover" />
                            ) : (
                              <Camera className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-[10px] text-gray-200 text-center truncate w-full" title={shot.fileName}>
                            {shot.fileName}
                          </span>
                        </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                categories.map((c) => (
                  <TabsContent key={c} value={c} className="mt-0">
                    <div data-tour="manager-list">
                      {(() => {
                        const sorted = rowsFor(c)
                          .map((row) => ({ row, title: titleFor(row.path) }))
                          .sort((a, b) => {
                            if (updatesSort) {
                              const diff = compareByUpdates(a.row, b.row);
                              if (diff !== 0) return diff;
                            }
                            if (c === "mods" && dependencySort !== "off") {
                              const isDep = (r: ContentRow) => (dependentsOf(r.path).length > 0 ? 1 : 0);
                              const diff = isDep(b.row) - isDep(a.row);
                              if (diff !== 0) return dependencySort === "first" ? diff : -diff;
                            }
                            const cmp = a.title.localeCompare(b.title);
                            return sortAsc ? cmp : -cmp;
                          });
                        return (
                      <>
                      <FlipList orderKey={sorted.map((r) => r.row.path).join("|")} className="flex flex-col gap-1.5 px-0 pb-3 pt-3">
                        {sorted.map(({ row, title }) => (
                            <InstalledContentRow
                              key={row.path}
                              path={row.path}
                              category={c}
                              mandatory={row.mandatory}
                              external={!loading && !modrinthMatches.has(row.path)}
                              title={title}
                              match={modrinthMatches.get(row.path)}
                              update={contentLocked ? undefined : updates.get(row.path)}
                              busy={busyPaths.has(row.path)}
                              dependentTitles={c === "mods" ? dependentTitlesByPath.get(row.path) : undefined}
                              missingDeps={c === "mods" && !contentLocked ? missingDepsByPath.get(row.path) : undefined}
                              canToggle={c === "mods" && !row.mandatory && !row.notInstalled && !contentLocked && /\.jar$/i.test(row.path)}
                              notInstalled={row.notInstalled}
                              toggleLockedReason={c === "mods" ? toggleLockedReason(row) : undefined}
                              disabled={row.disabled}
                              onToggle={onRowToggle}
                              onInstallMissing={onRowInstallMissing}
                              sharedLayout={row.path === lastOpenedPath}
                              onOpen={onRowOpen}
                              onUpdate={onRowUpdate}
                              onDelete={onRowDelete}
                              onSave={onRowSave}
                              onShare={onRowShare}
                              marked={markedPaths.has(row.path)}
                              selecting={markedPaths.size > 0}
                              onMarkToggle={onRowMarkToggle}
                            />
                          ))}
                      </FlipList>
                      {renderMarkedBar(c, sorted.map((r) => r.row))}
                      </>
                        );
                      })()}
                    </div>
                  </TabsContent>
                ))
                )}
                </motion.div>
                )}
              </Tabs>
            )}
              </motion.div>
            </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      </div>

      <ShareImageDialog image={shareImage} onOpenChange={(o) => !o && setShareImage(null)} />
      <ShareContentDialog item={shareContent} onOpenChange={(o) => !o && setShareContent(null)} />
      <RenameContentDialog target={renaming} onOpenChange={(o) => !o && setRenaming(null)} onRename={applyRename} />
      <ShareInstanceDialog instance={sharingInstance ? pack : null} onOpenChange={(o) => !o && setSharingInstance(false)} />
      <DuplicateInstanceDialog instance={duplicatingInstance ? pack : null} onOpenChange={(o) => !o && setDuplicatingInstance(false)} />

      {pack.installed && (
        <ModLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          pack={pack}
          installedMods={[
            ...(content?.mods ?? []).map((f) => ({ path: f.path, sha1: f.sha1, mandatory: f.required !== false })),
            ...optionalContent.mods.map((f) => ({ path: f.path, sha1: f.sha1, mandatory: false })),
          ]}
          onInstall={async (mod, build, replacePath) => {
            const newPath = `mods/${build.fileName}`;
            if (replacePath) await updateInstanceFile(pack.id, diskPath(replacePath), newPath, build.downloadUrl, build.sha1);
            else await downloadInstanceFile(pack.id, newPath, build.downloadUrl, build.sha1);
            forgetDisabled(replacePath);
            const file = { path: newPath, size: build.size, sha1: build.sha1 };
            setOptionalContent((prev) => ({
              ...prev,
              mods: [...prev.mods.filter((f) => f.path !== file.path && f.path !== replacePath), file],
            }));
            // Identified straight away: icon, name and its detail page like any Modrinth mod.
            setModrinthMatches((prev) => {
              const next = new Map(prev);
              if (replacePath) next.delete(replacePath);
              next.set(newPath, libraryMatch(mod, build));
              return next;
            });
            if (replacePath) {
              setUpdates((prev) => {
                const next = new Map(prev);
                next.delete(replacePath);
                return next;
              });
            }
          }}
        />
      )}

      <AlertDialog open={!!depDeleteConfirm} onOpenChange={(open) => !open && setDepDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Quitar {depDeleteConfirm ? titleFor(depDeleteConfirm.path) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {depDeleteConfirm && depDeleteConfirm.dependents.length === 1
                    ? "Este mod lo necesita:"
                    : "Este mod lo necesitan:"}
                </p>
                <ul className="list-disc pl-5 text-foreground">
                  {depDeleteConfirm?.dependents.map((d) => (
                    <li key={d}>{titleFor(d)}</li>
                  ))}
                </ul>
                <p>Si lo quitas, probablemente el juego no arranque.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!depDeleteConfirm) return;
                const { c, path } = depDeleteConfirm;
                setDepDeleteConfirm(null);
                void handleDelete(c, path, { skipDependencyCheck: true });
              }}
            >
              Quitar igualmente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteConfirm?.paths.length === 1
                ? `¿Eliminar ${titleFor(bulkDeleteConfirm.paths[0])}?`
                : `¿Eliminar ${bulkDeleteConfirm?.paths.length ?? 0} archivos?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Se borrarán de la instancia. Esta acción no se puede deshacer.</p>
                {!!bulkDeleteConfirm?.neededBy.length && (
                  <>
                    <p>Otros mods que no has marcado los necesitan:</p>
                    <ul className="list-disc pl-5 text-foreground">
                      {bulkDeleteConfirm.neededBy.map((d) => (
                        <li key={d}>{titleFor(d)}</li>
                      ))}
                    </ul>
                    <p>Si los quitas, probablemente el juego no arranque.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!bulkDeleteConfirm) return;
                const { c, paths } = bulkDeleteConfirm;
                setBulkDeleteConfirm(null);
                void handleBulkDelete(c, paths);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={emoteStoreNoticeOpen} onOpenChange={setEmoteStoreNoticeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tienda de emotes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Los emotes se descargan desde <span className="font-semibold text-foreground">RedlanceEmotes</span>{" "}
                  (emotes.redlance.org), una página externa a ALaunchi. Se abrirá en tu navegador, y para descargar
                  puede pedirte iniciar sesión allí.
                </p>
                <p>
                  Después tienes que <span className="font-semibold text-foreground">importarlos</span> a la instancia:
                  arrastra el archivo <span className="font-mono text-foreground">.emotecraft</span> descargado a esta
                  ventana, en la pestaña Emotes.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                try {
                  localStorage.setItem(EMOTE_STORE_NOTICE_KEY, "1");
                } catch {
                  /* it'll just show again next time */
                }
                window.open(EMOTE_STORE_URL, "_blank");
              }}
            >
              Abrir la página
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmotePreviewDialog
        emote={selectedEmote}
        data={selectedEmoteData}
        skinUrl={myPreviewSkinUrl}
        onClose={() => setSelectedEmote(null)}
      />

      <Dialog open={!!selectedSchematic} onOpenChange={(open) => !open && setSelectedSchematic(null)}>
        <DialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-foreground sm:max-w-2xl sm:rounded-md p-0 gap-0 overflow-hidden">
          {/* Thin accent line along the top, like the account menu's cards. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]"
          />
          {(() => {
            const path = selectedSchematic?.path ?? "";
            const base = path.slice(path.lastIndexOf("/") + 1);
            const ext = base.match(SCHEMATIC_EXT)?.[1]?.toLowerCase();
            return (
              <DialogHeader className="px-5 pt-5 pb-4 pr-12 border-b border-white/5 space-y-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-10 w-10 shrink-0 rounded-md bg-accent/15 text-accent flex items-center justify-center shadow-[0_0_14px_hsl(var(--accent)/0.25)]">
                    <Box className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-white text-base truncate">{base.replace(SCHEMATIC_EXT, "")}</DialogTitle>
                    <div className="mt-1 flex items-center gap-1.5 min-w-0">
                      {selectedSchematic && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent shrink-0">
                          {selectedSchematic.source === "worldedit" ? "WorldEdit" : "Litematica"}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground truncate">
                        {ext ? SCHEMATIC_TYPE[ext] ?? `.${ext}` : "Esquema"}
                        {selectedSchematicStructure &&
                          ` · ${selectedSchematicStructure.getSize().join(" × ")} · ${selectedSchematicStructure
                            .getBlocks()
                            .length.toLocaleString("es-ES")} bloques`}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>
            );
          })()}

          {/* Always the viewer's size, so loading → model → error never jumps. */}
          <div className="relative mx-5 mt-4 rounded-md bg-black/30 overflow-hidden flex items-center justify-center h-[420px]">
            {selectedSchematicError ? (
              // Too big or unreadable: said plainly, never an endless spinner.
              <div className="flex flex-col items-center justify-center gap-2 text-center px-6">
                <AlertTriangle className="h-7 w-7 text-amber-400" />
                <p className="max-w-sm text-sm text-gray-200">{selectedSchematicError}</p>
                <p className="text-xs text-muted-foreground">Puedes abrirlo igualmente en Minecraft con Litematica o WorldEdit.</p>
              </div>
            ) : schematicResourcesError ? (
              <div className="flex flex-col items-center justify-center gap-2 text-center px-6">
                <AlertTriangle className="h-7 w-7 text-amber-400" />
                <p className="max-w-sm text-sm text-gray-200">{schematicResourcesError}</p>
              </div>
            ) : schematicResources && selectedSchematicStructure ? (
              <SchematicViewer3D
                structure={selectedSchematicStructure}
                resources={schematicResources}
                width={560}
                height={420}
                className="cursor-grab active:cursor-grabbing"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-accent" />
                <span className="text-xs">
                  {!schematicResources
                    ? schematicProgress?.stage === "downloading_client"
                      ? `Descargando recursos de Minecraft ${pack?.minecraftVersion}… ${schematicProgress.progress}%`
                      : schematicProgress?.stage === "extracting"
                      ? `Extrayendo modelos y texturas… ${schematicProgress.progress}%`
                      : "Preparando modelos y texturas…"
                    : "Cargando esquema…"}
                </span>
              </div>
            )}
          </div>

          {/* Controls, as small key hints. */}
          <div className="px-5 pt-3 pb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            {[
              ["Arrastrar", "girar"],
              ["Clic derecho", "desplazar"],
              ["Rueda", "zoom"],
            ].map(([key, action]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <kbd className="rounded bg-white/[0.07] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-gray-300">{key}</kbd>
                {action}
              </span>
            ))}
            <span className="text-muted-foreground/70">Los bloques de mods pueden no mostrarse.</span>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        image={lightboxImage}
        loading={lightboxLoading}
        onClose={() => setLightboxImage(null)}
      />

      <Dialog open={!!selectedOnlinePost} onOpenChange={(open) => !open && setSelectedOnlinePost(null)}>
        <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedOnlinePost?.postName}
              {selectedOnlinePost && (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedOnlinePost.vendor}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {onlineDetailLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {onlinePostDetail && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Por {onlinePostDetail.author}
                    {onlinePostDetail.tags.length > 0 && (
                      <span className="ml-2">
                        {onlinePostDetail.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] mr-1">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </p>
                  {onlinePostDetail.descriptionMd && (
                    <div className="prose prose-sm prose-invert max-w-none prose-img:rounded-md prose-a:text-accent select-text">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}
                      >
                        {onlinePostDetail.descriptionMd}
                      </ReactMarkdown>
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-2">
                {onlinePostFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este esquema no tiene archivos descargables.</p>
                ) : (
                  onlinePostFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-2.5 bg-gray-500/10 rounded-md border border-transparent"
                    >
                      <Box className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-100 truncate select-text">{file.fileName}</p>
                        <p className="text-[10px] text-muted-foreground">{formatBytes(file.fileSize)}</p>
                      </div>
                      <Button
                        size="sm"
                        disabled={!file.supported || downloadingFileId === file.id}
                        title={file.supported ? undefined : "Formato no compatible con el visor"}
                        onClick={() => handleDownloadSchematicFile(file)}
                        className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5 shrink-0"
                      >
                        {downloadingFileId === file.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Descargar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!versionChoice} onOpenChange={(open) => !open && setVersionChoice(null)}>
        <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">¿Con cuál versión te quedas?</DialogTitle>
          </DialogHeader>
          {versionChoice && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Ya tienes instalado <span className="text-white font-medium">{versionChoice.existingLabel}</span>. El
                archivo que has añadido es una versión distinta.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="border-white/10 justify-start"
                  onClick={() => handleVersionChoice("keep-existing")}
                >
                  Mantener el que ya tengo
                </Button>
                <Button
                  className="bg-accent hover:bg-accent/90 text-accent-foreground justify-start"
                  onClick={() => handleVersionChoice("use-new")}
                >
                  Usar el nuevo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <InstanceSettingsDialog pack={pack} open={settingsOpen} onOpenChange={setSettingsOpen} />
      {embedded && slots?.actions && playGroup && createPortal(playGroup, slots.actions)}
      {embedded && slots?.extras && extrasCard && createPortal(extrasCard, slots.extras)}
    </div>
  );
}
