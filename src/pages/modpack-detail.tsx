import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowDown,
  Check,
  X,
  Loader2,
  Package,
  Sparkles,
  Image as ImageIcon,
  FileQuestion,
  CheckSquare,
  FileText,
  List,
  Download,
  Lock,
  RefreshCw,
  Play,
  Heart,
  MoreVertical,
  FolderOpen,
  Smile,
  Box,
  Globe,
  WifiOff,
  UploadCloud,
} from "lucide-react";
import { SnapshotEntry, fetchSnapshot } from "@/services/github";
import {
  identifyModrinthFiles,
  getLatestVersion,
  getProjectDetail,
  getRequiredDependencies,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { HTML_SANITIZE_SCHEMA } from "@/lib/markdown-schema";
import {
  listInstanceFiles,
  deleteInstanceFile,
  updateInstanceFile,
  downloadInstanceFile,
  getInstalledModpacksMeta,
  openInstanceFolder,
  listEmotes,
  listSchematics,
  classifyDroppedFile,
  writeInstanceFile,
  type InstanceFile,
  type EmoteFile,
  type SchematicFile,
  type ContentClassification,
} from "@/services/electron";
import { resolveContentConflict, resolveNoIdentityConflict, type ConflictResolution } from "@/lib/content-conflict";
import { translateHtmlAwareToSpanish } from "@/services/translate";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";
import { useAuth } from "@/hooks/use-auth";
import { usePlayerSkinUrl } from "@/hooks/use-player-head";
import { useEmotePreview } from "@/hooks/use-emote-preview";
import { EmoteAnimation } from "@/lib/emote-animation";
import { bytesToBase64 } from "@/lib/emotecraft";
import { SkinViewer3D } from "@/components/skin-viewer-3d";
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
import { getGithubRepo, getModpacksToken } from "@/lib/app-config";
import { formatBytes, formatPlaytime } from "@/lib/format";
import { toast } from "sonner";
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
}

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

export default function ModpackDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const pack = modpacks.find((p) => p.id === id);
  const { launching: playLaunching, launch: playLaunch } = useLaunchModpack(pack);
  useDynamicAccent(pack?.bannerUrl || pack?.imageUrl);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<Record<Category, SnapshotEntry[]> | null>(null);
  const [optionalContent, setOptionalContent] = useState<Record<Category, InstanceFile[]>>(EMPTY_CATEGORIES);
  const [modrinthMatches, setModrinthMatches] = useState<Map<string, ModrinthMatch>>(new Map());
  const [updates, setUpdates] = useState<Map<string, ModrinthUpdate>>(new Map());
  const [sortAsc, setSortAsc] = useState(true);
  const [showInstalledFirst, setShowInstalledFirst] = useState(false);
  const [busyPaths, setBusyPaths] = useState<Set<string>>(new Set());
  const [totalPlaytimeMs, setTotalPlaytimeMs] = useState(0);

  // Drag-and-drop / file-picker content adding — works from anywhere on the page,
  // auto-detecting mod/shader/resourcepack/emote/schematic and routing accordingly.
  const [dropActive, setDropActive] = useState(false);
  const [versionChoice, setVersionChoice] = useState<{
    staged: StagedContentWrite;
    existingPath: string;
    existingLabel: string;
  } | null>(null);

  // Sticky header stack: banner+header (top), category tabs + install button
  // (sticks right under the top layer), and the Nombre/Instalados sort row
  // (sticks right under that). Heights are measured live — the banner is
  // responsive and the header card's text can wrap to more than one line.
  const [headerH, setHeaderH] = useState(0);
  const [tabsH, setTabsH] = useState(0);
  const headerGroupRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const update = () => setHeaderH(node.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const tabsElRef = useRef<HTMLDivElement | null>(null);
  const tabsRowRef = useCallback((node: HTMLDivElement | null) => {
    tabsElRef.current = node;
    if (!node) return;
    const update = () => setTabsH(node.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const sortRowElRef = useRef<HTMLDivElement | null>(null);

  // Whether the tabs row / sort row are currently pinned flush against the layer
  // above them — used to swap their touching corners from rounded to square so two
  // independently-rounded boxes meeting edge-to-edge don't form a pinched "V" seam.
  const [tabsStuck, setTabsStuck] = useState(false);
  const [sortRowStuck, setSortRowStuck] = useState(false);
  useEffect(() => {
    const check = () => {
      if (tabsElRef.current) {
        setTabsStuck(tabsElRef.current.getBoundingClientRect().top <= headerH + 0.5);
      }
      if (sortRowElRef.current) {
        setSortRowStuck(sortRowElRef.current.getBoundingClientRect().top <= headerH + tabsH + 0.5);
      }
    };
    check();
    window.addEventListener("scroll", check, { capture: true, passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check, { capture: true });
      window.removeEventListener("resize", check);
    };
  }, [headerH, tabsH]);

  // Mod detail view (opened by clicking a row's icon/name).
  const [selectedModPath, setSelectedModPath] = useState<string | null>(null);
  const [panelDirection, setPanelDirection] = useState(1);
  const [modDetailTab, setModDetailTab] = useState<ModDetailTab>("description");
  const [modDetailLoading, setModDetailLoading] = useState(false);
  const [projectDetail, setProjectDetail] = useState<ModrinthProjectDetail | null>(null);
  const [modVersions, setModVersions] = useState<ModrinthUpdate[]>([]);
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);
  const [showOriginalDescription, setShowOriginalDescription] = useState(false);
  const [dependencies, setDependencies] = useState<ModrinthDependency[]>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);

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

  // Emotecraft emotes — a separate, read-only tab alongside mods/shaders/resourcepacks,
  // only shown when that mod is present in the published manifest.
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [emotes, setEmotes] = useState<EmoteFile[]>([]);
  const [emotesLoading, setEmotesLoading] = useState(false);
  const [selectedEmote, setSelectedEmote] = useState<EmoteFile | null>(null);
  const emotecraftInstalled = (content?.mods ?? []).some((f) => f.path.toLowerCase().includes("emotecraft"));

  // Schematics (.litematic/.schem/.schematic/.nbt) — same read-only-tab pattern as
  // emotes, but the button only shows once the recursive folder scan (below, tied
  // to instance load) actually finds files, since these aren't gated behind any one
  // mod being installed the way Emotecraft is.
  const [schematicsOpen, setSchematicsOpen] = useState(false);
  const [schematics, setSchematics] = useState<SchematicFile[]>([]);
  const [selectedSchematic, setSelectedSchematic] = useState<SchematicFile | null>(null);

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
  const emoteAnimation = useMemo(
    () => (selectedEmoteData ? new EmoteAnimation(selectedEmoteData) : null),
    [selectedEmoteData]
  );

  const selectedSchematicStructure = useSchematicPreview(id, selectedSchematic?.path);
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
      setSchematics((prev) => [...prev, { path: targetPath, size: file.fileSize, source: "litematica" }]);
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

  const openMod = (path: string) => {
    setPanelDirection(1);
    setSelectedModPath(path);
  };
  const closeMod = () => {
    setPanelDirection(-1);
    setSelectedModPath(null);
  };

  useEffect(() => {
    if (modpacks.length === 0) loadModpacks();
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
    setSelectedModPath(null);
    setEmotesOpen(false);
    setEmotes([]);
    setSchematicsOpen(false);
    setSchematics([]);
    setSchematicOnlineMode(false);
    setSchematicResults([]);
    setSelectedOnlinePost(null);

    (async () => {
      const repoUrl = getGithubRepo();
      const token = getModpacksToken() || undefined;
      const manifest = await fetchSnapshot(repoUrl, id, token);
      if (cancelled) return;
      const manifestFiles = manifest?.files ?? [];
      setContent(categorize(manifestFiles));

      let optionalFiles: InstanceFile[] = [];
      if (pack?.installed) {
        const [localFiles, schematicFiles] = await Promise.all([listInstanceFiles(id), listSchematics(id)]);
        const mandatoryPaths = new Set(manifestFiles.map((f) => f.path));
        optionalFiles = localFiles.filter((f) => !mandatoryPaths.has(f.path));
        if (cancelled) return;
        setOptionalContent(categorize(optionalFiles));
        setSchematics(schematicFiles);
      }

      const matches = await identifyModrinthFiles([...manifestFiles, ...optionalFiles]);
      if (cancelled) return;
      setModrinthMatches(matches);

      if (pack && optionalFiles.length > 0) {
        const updateEntries = new Map<string, ModrinthUpdate>();
        await Promise.all(
          optionalFiles.map(async (f) => {
            const match = matches.get(f.path);
            if (!match) return;
            const cat = categoryOf(f.path);
            if (!cat) return;
            const latest = await getLatestVersion(match.projectId, pack.loaderType, pack.minecraftVersion, cat);
            if (latest && latest.versionId !== match.versionId) {
              updateEntries.set(f.path, latest);
            }
          })
        );
        if (!cancelled) setUpdates(updateEntries);
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, pack?.installed]);

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
    Promise.all([
      getProjectDetail(match.projectId),
      listVersions(match.projectId, pack.loaderType, pack.minecraftVersion, cat),
    ])
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

  // Auto-translates the long-form description to Spanish once it loads; falls back
  // to the original silently if translation fails (unofficial keyless endpoint).
  // HTML-aware: tags (badge images, <br>, <details>...) are left untouched, only
  // the text between them gets translated.
  useEffect(() => {
    setShowOriginalDescription(false);
    setTranslatedDescription(null);
    const text = projectDetail?.body;
    if (!text || !text.trim()) return;
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

  /** Downloads a chosen version into the instance — replacing an existing file, or a fresh install
   *  if `path` is a not-yet-installed search result (synthetic "search:<projectId>" key). */
  const handleInstallVersion = async (
    c: Category,
    path: string,
    version: ModrinthUpdate,
    matchInfo: { title: string; iconUrl: string | null; projectId: string }
  ) => {
    if (!pack) return;
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
        await updateInstanceFile(pack.id, path, newPath, version.url, version.sha1);
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
      toast.success(isFresh ? `${matchInfo.title} instalado.` : `Cambiado a v${version.versionNumber}.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setBusyPaths((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
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

  const handleDelete = async (c: Category, path: string) => {
    if (!pack) return;
    setBusyPaths((s) => new Set(s).add(path));
    try {
      await deleteInstanceFile(pack.id, path);
      setOptionalContent((prev) => ({ ...prev, [c]: prev[c].filter((f) => f.path !== path) }));
      setContent((prev) => (prev ? { ...prev, [c]: prev[c].filter((f) => f.path !== path) } : prev));
      if (selectedModPath === path) closeMod();
      toast.success(`${fileName(path)} eliminado.`);
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

  if (!pack) {
    return (
      <div className="min-h-full bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Modpack no encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>
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
    ...(content?.[c] ?? []).map((f): ContentRow => ({ path: f.path, size: f.size, mandatory: f.required !== false })),
    ...optionalContent[c].map((f): ContentRow => ({ path: f.path, size: f.size, mandatory: false })),
  ];

  const titleFor = (path: string) => modrinthMatches.get(path)?.title ?? guessTitle(fileName(path));

  const effectiveCategory = categories.includes(activeCategory) ? activeCategory : categories[0];
  const selectedCategory = selectedModPath ? categoryOf(selectedModPath) ?? effectiveCategory : null;
  const selectedMatch = selectedModPath ? modrinthMatches.get(selectedModPath) : null;
  const selectedRow =
    selectedModPath && selectedCategory ? rowsFor(selectedCategory).find((r) => r.path === selectedModPath) : null;
  const selectedLocked = !!selectedRow?.mandatory;
  const selectedUpdate = selectedModPath && selectedRow && !selectedLocked ? updates.get(selectedModPath) : undefined;
  const selectedUpToDate = !!selectedRow && !selectedLocked && !selectedUpdate;
  const selectedActionable = !selectedLocked && !selectedUpToDate;
  const showHeaderAction = !!selectedModPath && !!selectedMatch && !!selectedCategory;
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
        await deleteInstanceFile(pack.id, existingPath);
      }
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
        toast(resolution.reason);
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
        toast(resolution.reason);
        return;
      }
      if (resolution.kind !== "write") return;
      try {
        await writeInstanceFile(pack.id, resolution.targetPath, write);
        setSchematics((prev) => [
          ...prev,
          { path: resolution.targetPath, size, source: classification.schematicRoot === "worldedit" ? "worldedit" : "litematica" },
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
    const category = classification.category as Category;
    const matches = await identifyModrinthFiles([{ path: targetPath, sha1 }]).catch(() => new Map<string, ModrinthMatch>());
    const match = matches.get(targetPath) ?? null;
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
      toast(resolution.reason);
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

  const dragCounterRef = useRef(0);
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

  return (
    <div
      className="min-h-full bg-background text-foreground relative"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {dropActive && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-accent/10 border-4 border-dashed border-accent/50 flex items-center justify-center">
          <div className="bg-card/90 rounded-lg px-6 py-4 flex items-center gap-3 text-white">
            <UploadCloud className="h-6 w-6 text-accent" />
            <span className="font-semibold">Suelta el archivo para añadirlo</span>
          </div>
        </div>
      )}
      <div ref={headerGroupRef} className="sticky top-0 z-30 bg-background">
        <div className="relative h-32 md:h-40 bg-black/50 overflow-hidden">
          {pack.bannerUrl || pack.imageUrl ? (
            <img src={pack.bannerUrl || pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent/20 to-black" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--background)/0.9)_0%,hsl(var(--background)/0.5)_18%,hsl(var(--background)/0.15)_40%,transparent_65%)]" />
        </div>

        <div className="max-w-5xl mx-auto w-full">
        <div className="px-4 pb-2 -mt-16 relative z-10">
          <div
            className={`flex items-center justify-between gap-4 mr-auto bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4 ${
              !selectedModPath && !searchMode ? "max-w-2xl" : "max-w-full"
            }`}
          >
            {selectedModPath && selectedMatch ? (
                <motion.div
                  key="mod-header"
                  className="flex items-center gap-4 min-w-0 flex-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <button
                    onClick={closeMod}
                    className="h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
                    aria-label="Volver al pack"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
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
                    </div>
                    {!!projectDetail?.description && (
                      <p className="text-sm text-gray-300">{projectDetail.description}</p>
                    )}
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
                  </div>
                </motion.div>
              ) : searchMode ? (
                <motion.div
                  key="search-header"
                  className="flex items-center gap-3 min-w-0 flex-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
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
                  <div className="h-20 w-20 rounded-md border-2 border-background bg-black/70 overflow-hidden shrink-0 shadow-2xl">
                    {pack.imageUrl ? (
                      <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-black text-accent/60">
                        {pack.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <h2 className="text-3xl font-bold text-white truncate">{pack.name}</h2>
                      <span className="text-sm font-normal text-muted-foreground shrink-0">{pack.version}v</span>
                    </div>
                    <p className="text-sm text-gray-300 max-w-3xl">{pack.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{pack.minecraftVersion}</Badge>
                      <Badge variant="secondary" className="uppercase">{pack.loaderType}</Badge>
                      <Badge variant="outline">{pack.totalSizeMb} MB</Badge>
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
            {!selectedModPath && !searchMode && pack.installed && (
              <div className="flex items-center gap-2 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-gray-400 hover:text-white"
                      aria-label="Más opciones"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Button
                    onClick={playLaunch}
                    disabled={playLaunching}
                    className="shrink-0 bg-accent hover:bg-accent/90 text-accent-foreground border-transparent font-bold gap-1.5"
                  >
                    {playLaunching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    {playLaunching ? "" : pack.updateAvailable ? "ACTUALIZAR Y JUGAR" : "JUGAR"}
                  </Button>
                  {totalPlaytimeMs > 0 && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatPlaytime(totalPlaytimeMs)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full">
        <div className="px-4 pt-3 pb-8">
          <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4">
            {/* No overflow-hidden here: it would become the nearest "scrolling" ancestor for
                the sticky tab bars below, so they'd stick to the top of this card (which
                itself scrolls away) instead of the true scroll viewport. The sweep-transition's
                tiny horizontal offset doesn't need clipping — the page already has
                overflow-x-hidden. */}
            <AnimatePresence mode="wait" initial={false} custom={panelDirection}>
              <motion.div
                key={selectedModPath ? "mod" : "pack"}
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
                    <div className="prose prose-sm prose-invert max-w-none prose-img:rounded-md prose-a:text-accent">
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
                        <img
                          key={g.url}
                          src={g.url}
                          alt={g.title || ""}
                          className="w-full aspect-video object-cover rounded-md border border-white/10"
                        />
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
                          const locked = !!selectedRow && selectedRow.mandatory && !isInstalled;
                          const typeMeta = VERSION_TYPE_META[v.versionType];
                          return (
                            <div
                              key={v.versionId}
                              className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full"
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
                      {dependencies.map((dep) => (
                        <div key={dep.projectId} className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full">
                          {dep.iconUrl ? (
                            <img src={dep.iconUrl} alt="" className="h-8 w-8 rounded shrink-0 object-cover bg-black/30" />
                          ) : (
                            <div className="h-8 w-8 rounded shrink-0 bg-black/30 flex items-center justify-center">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <p className="text-gray-100 font-medium text-sm truncate flex-1 min-w-0">{dep.title}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">Obligatoria</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
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
                value={emotesOpen || schematicsOpen ? "" : effectiveCategory}
                onValueChange={(v) => {
                  setEmotesOpen(false);
                  setSchematicsOpen(false);
                  setActiveCategory(v as Category);
                }}
              >
                {!searchMode && (
                  <div
                    ref={tabsRowRef}
                    style={{ top: headerH }}
                    className={`sticky z-20 flex items-center justify-between gap-2 flex-wrap mb-4 bg-gray-500/10 backdrop-blur-md border border-white/10 p-3 ${
                      tabsStuck && sortRowStuck
                        ? "rounded-none"
                        : tabsStuck
                        ? "rounded-b-md"
                        : sortRowStuck
                        ? "rounded-t-md"
                        : "rounded-md"
                    }`}
                  >
                    <TabsList className="bg-card/50 border border-white/5">
                      {categories.map((c) => {
                        const Icon = CATEGORY_META[c].icon;
                        return (
                          <TabsTrigger
                            key={c}
                            value={c}
                            onClick={() => {
                              setEmotesOpen(false);
                              setSchematicsOpen(false);
                            }}
                            className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5"
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {CATEGORY_META[c].label}
                            <span className="opacity-60">({rowsFor(c).length})</span>
                          </TabsTrigger>
                        );
                      })}
                      {emotecraftInstalled && (
                        <button
                          type="button"
                          onClick={() => {
                            setSchematicsOpen(false);
                            setEmotesOpen(true);
                          }}
                          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium gap-1.5 transition-all ${
                            emotesOpen
                              ? "bg-accent text-accent-foreground shadow"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Smile className="h-3.5 w-3.5" />
                          Emotes
                        </button>
                      )}
                      {schematics.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEmotesOpen(false);
                            setSchematicsOpen(true);
                          }}
                          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium gap-1.5 transition-all ${
                            schematicsOpen
                              ? "bg-accent text-accent-foreground shadow"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Box className="h-3.5 w-3.5" />
                          Esquemas
                        </button>
                      )}
                    </TabsList>
                    {pack.installed && (
                      <div className="flex items-center gap-2">
                        {!emotesOpen && !schematicsOpen && (
                          <Button
                            size="sm"
                            onClick={() => setSearchMode(true)}
                            className="bg-green-600 hover:bg-green-500 border-transparent text-white font-bold gap-1.5"
                          >
                            <SiModrinth className="h-3.5 w-3.5" />
                            {`Instalar ${CATEGORY_META[effectiveCategory].label}`}
                          </Button>
                        )}
                      </div>
                    )}
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
                              <div key={hit.projectId} className="flex items-center gap-4 p-4 bg-card/50 rounded-md w-full">
                                <div
                                  onClick={() => openModFromSearch(hit, installed)}
                                  className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer"
                                >
                                  {hit.iconUrl ? (
                                    <img src={hit.iconUrl} alt="" className="h-14 w-14 rounded shrink-0 object-cover bg-black/30" />
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
                ) : emotesOpen ? (
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
                    <div className="grid grid-cols-4 gap-3">
                      {emotes.map((emote) => (
                        <button
                          type="button"
                          key={emote.fileName}
                          onClick={() => setSelectedEmote(emote)}
                          className="flex flex-col items-center gap-2 p-3 rounded-md bg-gray-500/10 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors text-left"
                        >
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
                      ))}
                    </div>
                  )
                ) : schematicsOpen ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-3">
                      <button
                        type="button"
                        onClick={() => setSchematicOnlineMode(false)}
                        className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                          !schematicOnlineMode
                            ? "bg-accent text-accent-foreground border-transparent"
                            : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                        }`}
                      >
                        Instalados
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchematicOnlineMode(true)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                          schematicOnlineMode
                            ? "bg-accent text-accent-foreground border-transparent"
                            : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <Globe className="h-3 w-3" />
                        Buscar online
                      </button>
                    </div>

                    {!schematicOnlineMode ? (
                      schematics.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                          <Box className="h-6 w-6" />
                          <p className="text-sm">No hay esquemas en esta instancia.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-3">
                          {schematics.map((s) => {
                            const displayName = s.path.slice(s.path.lastIndexOf("/") + 1);
                            const folder = s.path.slice(0, s.path.length - displayName.length - 1);
                            return (
                              <button
                                type="button"
                                key={s.path}
                                onClick={() => setSelectedSchematic(s)}
                                className="flex flex-col items-center gap-2 p-3 rounded-md bg-gray-500/10 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors text-left"
                              >
                                <div className="h-16 w-16 rounded bg-black/30 overflow-hidden flex items-center justify-center shrink-0">
                                  <Box className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <span className="text-xs text-gray-200 text-center truncate w-full" title={s.path}>
                                  {displayName}
                                </span>
                                {folder && (
                                  <span className="text-[10px] text-muted-foreground text-center truncate w-full" title={folder}>
                                    {folder}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col gap-3">
                        <Input
                          value={schematicQuery}
                          onChange={(e) => setSchematicQuery(e.target.value)}
                          placeholder="Buscar esquemas online..."
                          className="h-8 bg-card/50 border-white/10 text-xs"
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
                                className="flex items-center gap-3 p-3 bg-card/50 rounded-md w-full text-left hover:bg-white/5 transition-colors"
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
                ) : (
                categories.map((c) => (
                  <TabsContent key={c} value={c} className="mt-4">
                    <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md">
                      <div
                        ref={sortRowElRef}
                        style={{ top: headerH + tabsH }}
                        className={`sticky z-10 flex items-center justify-between px-3 py-2 bg-gray-500/10 backdrop-blur-md border-b border-white/10 ${
                          sortRowStuck ? "" : "rounded-t-md"
                        }`}
                      >
                        <button
                          onClick={() => setSortAsc((v) => !v)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-white transition-colors"
                        >
                          Nombre
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setShowInstalledFirst((v) => !v)}
                          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                            showInstalledFirst
                              ? "bg-accent/15 text-accent border border-accent/30"
                              : "text-muted-foreground hover:text-white"
                          }`}
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                          Instalados
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5 p-3 pt-1.5">
                        {rowsFor(c)
                          .sort((a, b) => {
                            if (showInstalledFirst) {
                              const rank = (r: ContentRow) => (r.mandatory ? 2 : updates.has(r.path) ? 0 : 1);
                              const rankDiff = rank(a) - rank(b);
                              if (rankDiff !== 0) return rankDiff;
                            }
                            const cmp = titleFor(a.path).localeCompare(titleFor(b.path));
                            return sortAsc ? cmp : -cmp;
                          })
                          .map((row) => {
                            const match = modrinthMatches.get(row.path);
                            const update = updates.get(row.path);
                            const busy = busyPaths.has(row.path);
                            const CategoryIcon = CATEGORY_META[c].icon;
                            return (
                              <div
                                key={row.path}
                                className="flex items-center gap-3 px-3 py-2.5 text-xs bg-card/50 rounded-md w-full"
                              >
                                <div
                                  onClick={() => match && openMod(row.path)}
                                  className={`flex items-center gap-3 min-w-0 flex-1 ${match ? "cursor-pointer" : ""}`}
                                >
                                  {match?.iconUrl ? (
                                    <motion.img
                                      layoutId={`icon-${row.path}`}
                                      src={match.iconUrl}
                                      alt=""
                                      className="h-11 w-11 rounded shrink-0 object-cover bg-black/30"
                                    />
                                  ) : match ? (
                                    <motion.div
                                      layoutId={`icon-${row.path}`}
                                      className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center"
                                    >
                                      <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                                    </motion.div>
                                  ) : (
                                    <div className="h-11 w-11 rounded shrink-0 bg-black/30 flex items-center justify-center">
                                      <span className="text-xs font-bold text-muted-foreground">Ms</span>
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    {match ? (
                                      <motion.p layoutId={`title-${row.path}`} className="text-gray-100 font-medium text-base truncate">
                                        {match.title}
                                      </motion.p>
                                    ) : (
                                      <p className="text-gray-100 font-medium text-base truncate">{titleFor(row.path)}</p>
                                    )}
                                    <p className="text-muted-foreground text-[11px] font-mono truncate">{fileName(row.path)}</p>
                                  </div>
                                </div>
                                {!row.mandatory && update && (
                                  <button
                                    onClick={() => match && handleInstallVersion(c, row.path, update, match)}
                                    disabled={busy}
                                    title={`Actualizar a v${update.versionNumber}`}
                                    className="h-7 w-7 flex items-center justify-center rounded-full text-accent hover:bg-accent/10 transition-colors shrink-0 disabled:opacity-50"
                                  >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                  </button>
                                )}
                                {!row.mandatory && (
                                  <button
                                    onClick={() => handleDelete(c, row.path)}
                                    disabled={busy}
                                    title="Eliminar"
                                    className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </TabsContent>
                ))
                )}
              </Tabs>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedEmote} onOpenChange={(open) => !open && setSelectedEmote(null)}>
        <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{selectedEmote?.displayName}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-black/30 rounded-md p-6">
            {myPreviewSkinUrl && emoteAnimation ? (
              <SkinViewer3D
                skinUrl={myPreviewSkinUrl}
                animation={emoteAnimation}
                width={200}
                height={280}
                className="cursor-grab active:cursor-grabbing"
              />
            ) : selectedEmote?.thumbnailBase64 ? (
              <img
                src={`data:image/png;base64,${selectedEmote.thumbnailBase64}`}
                alt={selectedEmote.displayName}
                className="max-h-[50vh] object-contain"
              />
            ) : (
              <Smile className="h-16 w-16 text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {myPreviewSkinUrl && emoteAnimation ? "Arrastra para girar la cámara." : "Cargando vista previa animada..."}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedSchematic} onOpenChange={(open) => !open && setSelectedSchematic(null)}>
        <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedSchematic ? selectedSchematic.path.slice(selectedSchematic.path.lastIndexOf("/") + 1) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-black/30 rounded-md p-6">
            {schematicResources && selectedSchematicStructure ? (
              <SchematicViewer3D
                structure={selectedSchematicStructure}
                resources={schematicResources}
                width={560}
                height={420}
                className="cursor-grab active:cursor-grabbing"
              />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {schematicResourcesError
              ? schematicResourcesError
              : !schematicResources
              ? schematicProgress?.stage === "downloading_client"
                ? `Descargando recursos de Minecraft ${pack?.minecraftVersion}... ${schematicProgress.progress}%`
                : schematicProgress?.stage === "extracting"
                ? `Extrayendo modelos y texturas... ${schematicProgress.progress}%`
                : "Preparando modelos y texturas..."
              : !selectedSchematicStructure
              ? "Cargando esquema..."
              : "Arrastra para girar la cámara, rueda para hacer zoom. Los bloques de mods pueden no mostrarse."}
          </p>
        </DialogContent>
      </Dialog>

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
                    <div className="prose prose-sm prose-invert max-w-none prose-img:rounded-md prose-a:text-accent">
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
                      className="flex items-center gap-3 p-2.5 bg-gray-500/10 rounded-md border border-white/10"
                    >
                      <Box className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-100 truncate">{file.fileName}</p>
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
    </div>
  );
}
