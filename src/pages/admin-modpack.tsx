import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { ImageUrlField } from "@/components/image-url-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { LoaderIcon } from "@/components/loader-icon";
import { AdminModrinthBrowser, ModrinthGlyph, ProjectIcon, type PresentProject } from "@/components/admin-modrinth-browser";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  UploadCloud,
  FileText,
  Folder,
  FolderUp,
  FilePlus,
  ChevronRight,
  Home as HomeIcon,
  Trash,
  RotateCcw,
  RefreshCw,
  Loader2,
  Lock,
  Unlock,
  Plus,
  Save,
  Copy,
  KeyRound,
  UserX,
  Files,
  Layers,
  ScrollText,
  Settings2,
  Users,
  Link2,
  Ban,
  Send,
  Library,
} from "lucide-react";
import {
  fetchSnapshot,
  publishModpackUpdate,
  updateModpackMetadata,
  shouldIncludeFile,
  type SnapshotEntry,
  type OptionalGroup,
  type WalkedFile,
  type PublishProgress,
} from "@/services/github";
import { identifyModrinthFiles, getVersionsByIds, getProjectInfo, categoryOf, type ModrinthMatch, type ModrinthVersionDependency } from "@/services/modrinth";
import { downloadDependencies, planProjects, sha1Hex, versionLabel, type ModrinthDownload, type PackTarget } from "@/lib/admin-modrinth";
import { getMySource } from "@/lib/sources";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChangelogEditor } from "@/components/changelog-editor";
import {
  createAccessCode,
  regenerateAccessCode,
  getAccessCode,
  subscribeAccessGrants,
  revokeAccess,
  formatCode,
  banFromInstance,
  unbanFromInstance,
  subscribeBans,
  type AccessGrant,
  type AccessBan,
} from "@/services/access-codes";
import { sendInvite, cancelInvite, subscribePendingInvites, updatePendingInviteCodes, type PendingInvite } from "@/services/invites";
import { getInstanceAccentColor } from "@/lib/instance-color";
import { PlayerPicker, Head } from "@/components/player-picker";
import { ModLibraryDialog } from "@/components/mod-library-dialog";
import {
  isLibraryProjectId,
  libraryMatch,
  librarySha1Index,
  subscribeLibraryMods,
  type LibraryBuild,
  type LibraryMod,
} from "@/services/mod-library";

// Minecraft instance top-level folders. When the picked/dropped folder's own name
// matches one of these, it IS the destination folder (e.g. dragging in "shaderpacks"
// should publish as shaderpacks/..., not get unwrapped) — otherwise it's assumed to
// be a modpack root wrapper (e.g. "MyModpack" containing mods/, config/, ...) whose
// own name isn't part of the instance structure and should be stripped off.
const KNOWN_CONTENT_FOLDERS = new Set([
  "mods", "config", "shaderpacks", "resourcepacks", "texturepacks", "defaultconfigs",
  "kubejs", "scripts", "schematics", "saves", "patchouli_books", "datapacks",
]);

function stripFolderPrefix(relPath: string): string {
  const idx = relPath.indexOf("/");
  if (idx === -1) return relPath;
  const first = relPath.slice(0, idx);
  if (KNOWN_CONTENT_FOLDERS.has(first.toLowerCase())) return relPath;
  return relPath.slice(idx + 1);
}

interface StagedAdd {
  id: string;
  path: string;
  file: File;
  editable: boolean;
  required: boolean;
}

interface SettingsForm {
  name: string;
  description: string;
  imageUrl: string;
  bannerUrl: string;
  antiXray: boolean;
  lockContent: boolean;
}

type RowStatus = "unchanged" | "added" | "replaced" | "removed";

interface Row {
  key: string;
  path: string;
  size: number;
  status: RowStatus;
  addId?: string;
  editable?: boolean;
  required: boolean;
  /** sha1 when known: from the manifest, or computed from the staged file. */
  sha1?: string;
}

interface FolderEntry {
  kind: "folder";
  name: string;
  fileCount: number;
  changeCount: number;
}

interface FileEntry {
  kind: "file";
  name: string;
  row: Row;
}

type TreeEntry = FolderEntry | FileEntry;

/** Splits the flat row list into the folders + files visible at exactly `path`. */
function buildLevel(rows: Row[], path: string[]): TreeEntry[] {
  const prefix = path.length > 0 ? path.join("/") + "/" : "";
  const folders = new Map<string, { fileCount: number; changeCount: number }>();
  const files: FileEntry[] = [];
  for (const row of rows) {
    if (prefix && !row.path.startsWith(prefix)) continue;
    const rest = row.path.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) {
      files.push({ kind: "file", name: rest, row });
    } else {
      const folderName = rest.slice(0, slashIdx);
      const meta = folders.get(folderName) ?? { fileCount: 0, changeCount: 0 };
      meta.fileCount++;
      if (row.status !== "unchanged") meta.changeCount++;
      folders.set(folderName, meta);
    }
  }
  const folderEntries: TreeEntry[] = Array.from(folders.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, meta]) => ({ kind: "folder", name, ...meta }));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folderEntries, ...files];
}

/** Recursively reads a dropped FileSystemEntry into WalkedFile-shaped entries, preserving the folder structure. */
function readDirectory(dirEntry: any): Promise<any[]> {
  const reader = dirEntry.createReader();
  const all: any[] = [];
  return new Promise((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries((batch: any[]) => {
        if (batch.length === 0) { resolve(all); return; }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function walkDroppedEntry(entry: any, basePath: string): Promise<WalkedFile[]> {
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [{ file, relativePath: basePath ? `${basePath}/${entry.name}` : entry.name }];
  }
  const children = await readDirectory(entry);
  const nextBase = basePath ? `${basePath}/${entry.name}` : entry.name;
  const nested = await Promise.all(children.map((c) => walkDroppedEntry(c, nextBase)));
  return nested.flat();
}

/** Only content Modrinth can know about is worth hashing/looking up. */
const isIdentifiable = (path: string) => categoryOf(path) !== null;

const GLASS = "rounded-xl border border-white/10 bg-card/40";
const TAB_TRIGGER = "gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground";

export default function AdminModpack() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, uuid, username } = useAuth();
  const isAdmin = useIsAdmin();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const pack = modpacks.find((p) => p.id === id);

  const [loadingManifest, setLoadingManifest] = useState(true);
  const [existing, setExisting] = useState<SnapshotEntry[]>([]);
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [stagedReplacements, setStagedReplacements] = useState<Map<string, File>>(new Map());
  const [requiredOverrides, setRequiredOverrides] = useState<Map<string, boolean>>(new Map());
  const [stagedAdds, setStagedAdds] = useState<StagedAdd[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const [version, setVersion] = useState("");
  const [changelogTitle, setChangelogTitle] = useState("");
  const [changelog, setChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);

  const [activeTab, setActiveTab] = useState<"files" | "content" | "changelog" | "settings" | "access">("files");
  const [optionalGroups, setOptionalGroups] = useState<OptionalGroup[]>([]);
  const [initialOptionalGroups, setInitialOptionalGroups] = useState<OptionalGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");

  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    name: "",
    description: "",
    imageUrl: "",
    bannerUrl: "",
    antiXray: false,
    lockContent: false,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [accessGrants, setAccessGrants] = useState<Record<string, AccessGrant>>({});
  const [bans, setBans] = useState<Record<string, AccessBan>>({});
  const [pendingInvites, setPendingInvites] = useState<Record<string, PendingInvite>>({});

  // Modrinth: sha1 of staged files (computed lazily), matches learned from
  // files downloaded through the browser, the resulting per-row identification
  // and each identified version's dependency list.
  const [fileSha1, setFileSha1] = useState<Map<File, string>>(new Map());
  const [knownMatches, setKnownMatches] = useState<Map<string, ModrinthMatch>>(new Map());
  const [matches, setMatches] = useState<Map<string, ModrinthMatch>>(new Map());
  const [versionDeps, setVersionDeps] = useState<Map<string, ModrinthVersionDependency[]>>(new Map());
  const [missingInfo, setMissingInfo] = useState<Map<string, { title: string; iconUrl: string | null }>>(new Map());
  const [browserOpen, setBrowserOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // The group's mod library (services/mod-library.ts), live: identifies its jars
  // in the file list and feeds "Añadir desde la biblioteca".
  const [libraryMods, setLibraryMods] = useState<LibraryMod[]>([]);
  useEffect(() => subscribeLibraryMods(setLibraryMods, () => setLibraryMods([])), []);
  const [addingDeps, setAddingDeps] = useState<string | null>(null);

  const replaceTargetPath = useRef<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
    else if (!isAdmin) setLocation("/");
  }, [isAuthenticated, isAdmin, setLocation]);

  useEffect(() => {
    if (isAdmin && modpacks.length === 0) loadModpacks();
  }, [isAdmin]);

  useEffect(() => {
    const repoUrl = getMySource()?.repoUrl;
    if (!id || !repoUrl) return;
    let cancelled = false;
    getAccessCode(repoUrl, id).then((code) => {
      if (!cancelled) setAccessCode(code);
    });
    const unsubs = [
      subscribeAccessGrants(repoUrl, id, setAccessGrants),
      subscribeBans(repoUrl, id, setBans),
      subscribePendingInvites(repoUrl, id, setPendingInvites),
    ];
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [id]);

  useEffect(() => {
    if (!id || !pack) return;
    let cancelled = false;
    setLoadingManifest(true);
    setRemovedPaths(new Set());
    setStagedReplacements(new Map());
    setStagedAdds([]);
    setChangelogTitle("");
    setChangelog("");
    setCurrentFolder([]);
    setSettingsForm({
      name: pack.name,
      description: pack.description,
      imageUrl: pack.imageUrl,
      bannerUrl: pack.bannerUrl,
      antiXray: pack.antiXray ?? false,
      lockContent: pack.lockContent ?? false,
    });
    const repoUrl = getMySource()?.repoUrl ?? "";
    const token = getMySource()?.adminToken;
    fetchSnapshot(repoUrl, id, token || undefined)
      .then((manifest) => {
        if (cancelled) return;
        setExisting(manifest?.files ?? []);
        setOptionalGroups(manifest?.optionalGroups ?? []);
        setInitialOptionalGroups(manifest?.optionalGroups ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e?.message || "No se pudo cargar el manifiesto publicado.");
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });
    const parts = pack.version.split(".").map((n) => parseInt(n, 10));
    const major = Number.isFinite(parts[0]) ? parts[0] : 1;
    const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
    const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
    setVersion(`${major}.${minor}.${patch + 1}`);
    return () => {
      cancelled = true;
    };
  }, [id, pack?.id]);

  const existingPaths = useMemo(() => new Set(existing.map((e) => e.path)), [existing]);
  const existingRequiredByPath = useMemo(
    () => new Map(existing.map((e) => [e.path, e.required !== false])),
    [existing]
  );

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const e of existing) {
      const required = requiredOverrides.get(e.path) ?? (e.required !== false);
      if (removedPaths.has(e.path)) {
        out.push({ key: e.path, path: e.path, size: e.size, status: "removed", required, sha1: e.sha1 });
      } else if (stagedReplacements.has(e.path)) {
        const file = stagedReplacements.get(e.path)!;
        out.push({ key: e.path, path: e.path, size: file.size, status: "replaced", required, sha1: fileSha1.get(file) });
      } else {
        out.push({ key: e.path, path: e.path, size: e.size, status: "unchanged", required, sha1: e.sha1 });
      }
    }
    for (const a of stagedAdds) {
      out.push({
        key: a.id,
        path: a.path,
        size: a.file.size,
        status: "added",
        addId: a.id,
        editable: a.editable,
        required: a.required,
        sha1: fileSha1.get(a.file),
      });
    }
    return out.sort((x, y) => x.path.localeCompare(y.path));
  }, [existing, removedPaths, stagedReplacements, stagedAdds, requiredOverrides, fileSha1]);

  const currentLevel = useMemo(() => buildLevel(rows, currentFolder), [rows, currentFolder]);

  // ── Modrinth identification ──────────────────────────────────────────────
  // 1. Hash staged mods/shaders/resourcepacks (the manifest already carries
  //    the sha1 of published files).
  useEffect(() => {
    const pending = [
      ...stagedAdds.filter((a) => isIdentifiable(a.path)).map((a) => a.file),
      ...Array.from(stagedReplacements.entries()).filter(([p]) => isIdentifiable(p)).map(([, f]) => f),
    ].filter((f) => !fileSha1.has(f));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const computed = new Map<File, string>();
      for (const f of pending) computed.set(f, await sha1Hex(await f.arrayBuffer()));
      if (!cancelled) setFileSha1((prev) => new Map([...prev, ...computed]));
    })();
    return () => {
      cancelled = true;
    };
  }, [stagedAdds, stagedReplacements, fileSha1]);

  // 2. sha1 → Modrinth project/version (cached in services/modrinth.ts).
  const identifyKey = rows.filter((r) => r.sha1 && isIdentifiable(r.path)).map((r) => `${r.key}:${r.sha1}`).join("|");
  useEffect(() => {
    let cancelled = false;
    const entries = rows.filter((r) => r.sha1 && isIdentifiable(r.path)).map((r) => ({ path: r.key, sha1: r.sha1! }));
    const known = new Map<string, ModrinthMatch>();
    const unknown = entries.filter((e) => {
      const m = knownMatches.get(e.sha1);
      if (m) known.set(e.path, m);
      return !m;
    });
    identifyModrinthFiles(unknown).then((found) => {
      if (!cancelled) setMatches(new Map([...found, ...known]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifyKey, knownMatches]);

  const activeRows = rows.filter((r) => r.status !== "removed");

  // Library jars, for display only — kept out of `matches`, which feeds the
  // Modrinth-only dependency lookups below.
  const libraryMatches = useMemo(() => {
    const index = librarySha1Index(libraryMods);
    const out = new Map<string, ModrinthMatch>();
    for (const r of rows) {
      const hit = r.sha1 && !matches.has(r.key) ? index.get(r.sha1) : undefined;
      if (hit) out.set(r.key, libraryMatch(hit.mod, hit.build));
    }
    return out;
  }, [rows, matches, libraryMods]);
  /** What a row is, for display: its Modrinth project, else its library mod. */
  const matchFor = (key: string) => matches.get(key) ?? libraryMatches.get(key);

  // What each Modrinth project in the update is, and where.
  const presentProjects = useMemo(() => {
    const out = new Map<string, PresentProject & { row: Row }>();
    for (const r of activeRows) {
      const m = matches.get(r.key);
      if (m) out.set(m.projectId, { versionId: m.versionId, versionNumber: m.versionNumber, path: r.path, row: r });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, rows]);

  // 3. Dependencies of every identified version, in one request.
  const versionIdsKey = Array.from(presentProjects.values()).map((p) => p.versionId).sort().join(",");
  useEffect(() => {
    const ids = versionIdsKey ? versionIdsKey.split(",") : [];
    const missing = ids.filter((v) => !versionDeps.has(v));
    if (missing.length === 0) return;
    let cancelled = false;
    getVersionsByIds(missing).then((versions) => {
      if (cancelled) return;
      setVersionDeps((prev) => {
        const next = new Map(prev);
        for (const v of versions) next.set(v.versionId, v.dependencies);
        for (const v of missing) if (!next.has(v)) next.set(v, []);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionIdsKey]);

  // Who needs whom: projectId → titles of the mods in the update requiring it,
  // plus declared incompatibilities between two things that are both in it.
  const { requiredBy, missingDeps, conflicts } = useMemo(() => {
    const requiredBy = new Map<string, string[]>();
    const conflicts: { a: string; b: string }[] = [];
    for (const [projectId, p] of presentProjects) {
      const title = matches.get(p.row.key)?.title ?? projectId;
      for (const d of versionDeps.get(p.versionId) ?? []) {
        if (!d.projectId || d.projectId === projectId) continue;
        if (d.dependencyType === "required") {
          requiredBy.set(d.projectId, [...(requiredBy.get(d.projectId) ?? []), title]);
        } else if (d.dependencyType === "incompatible" && presentProjects.has(d.projectId)) {
          const other = presentProjects.get(d.projectId)!;
          conflicts.push({ a: title, b: matches.get(other.row.key)?.title ?? d.projectId });
        }
      }
    }
    const missingDeps = Array.from(requiredBy.entries())
      .filter(([projectId]) => !presentProjects.has(projectId))
      .map(([projectId, by]) => ({ projectId, requiredBy: by }));
    return { requiredBy, missingDeps, conflicts };
  }, [presentProjects, versionDeps, matches]);

  useEffect(() => {
    const unknown = missingDeps.map((d) => d.projectId).filter((p) => !missingInfo.has(p));
    if (unknown.length === 0) return;
    let cancelled = false;
    Promise.all(unknown.map(async (p) => [p, await getProjectInfo(p)] as const)).then((pairs) => {
      if (cancelled) return;
      setMissingInfo((prev) => {
        const next = new Map(prev);
        for (const [p, info] of pairs) next.set(p, info ?? { title: p, iconUrl: null });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingDeps.map((d) => d.projectId).join(",")]);

  const packTarget: PackTarget = useMemo(
    () => ({ loader: pack?.loaderType ?? "fabric", minecraftVersion: pack?.minecraftVersion ?? "" }),
    [pack?.loaderType, pack?.minecraftVersion]
  );
  const presentForBrowser = useMemo(
    () => new Map(Array.from(presentProjects.entries()).map(([k, v]) => [k, { versionId: v.versionId, versionNumber: v.versionNumber, path: v.path }])),
    [presentProjects]
  );

  const groupsDirty = JSON.stringify(optionalGroups) !== JSON.stringify(initialOptionalGroups);
  const hasChanges =
    removedPaths.size > 0 ||
    stagedReplacements.size > 0 ||
    stagedAdds.length > 0 ||
    requiredOverrides.size > 0 ||
    groupsDirty;
  const optionalCount = rows.filter((r) => r.status !== "removed" && !r.required).length;
  const optionalRows = rows.filter((r) => r.status !== "removed" && !r.required);

  // Stages a walked folder's files: existing paths become replacements, new paths become adds.
  const stageFolderFiles = (walked: WalkedFile[]) => {
    let addedCount = 0;
    let replacedCount = 0;
    setStagedReplacements((prev) => {
      const next = new Map(prev);
      for (const w of walked) {
        if (existingPaths.has(w.relativePath)) {
          next.set(w.relativePath, w.file);
          replacedCount++;
        }
      }
      return next;
    });
    setRemovedPaths((prev) => {
      const next = new Set(prev);
      for (const w of walked) next.delete(w.relativePath);
      return next;
    });
    setStagedAdds((prev) => {
      const additions = walked
        .filter((w) => !existingPaths.has(w.relativePath))
        .map((w) => ({ id: crypto.randomUUID(), path: w.relativePath, file: w.file, editable: false, required: true }));
      addedCount = additions.length;
      return [...prev, ...additions];
    });
    toast.success(`${addedCount} archivo${addedCount !== 1 ? "s" : ""} nuevo${addedCount !== 1 ? "s" : ""}, ${replacedCount} reemplazo${replacedCount !== 1 ? "s" : ""} preparados.`);
  };

  const onFolderSelected = (fileList: FileList) => {
    const walked: WalkedFile[] = [];
    for (const file of Array.from(fileList)) {
      const rel = (file as any).webkitRelativePath as string;
      if (!rel) continue;
      const inner = stripFolderPrefix(rel);
      if (!inner) continue;
      if (!shouldIncludeFile(inner, file.name)) continue;
      walked.push({ file, relativePath: inner });
    }
    if (walked.length === 0) {
      toast.error("La carpeta seleccionada no contiene archivos válidos.");
      return;
    }
    stageFolderFiles(walked);
  };

  // At the true root (not browsing any folder) we can't assume mods/ for everything —
  // config files, resource packs, etc. don't belong there. Only guess for extensions
  // that are unambiguous; anything else lands at the instance root, fully editable.
  const guessDestFolder = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "jar") return "mods";
    if (["json", "toml", "cfg", "conf", "properties", "ini", "yml", "yaml"].includes(ext ?? "")) return "config";
    return "";
  };

  const onLooseFilesSelected = (fileList: FileList) => {
    const additions: StagedAdd[] = [];
    for (const file of Array.from(fileList)) {
      const destFolder = currentFolder.length > 0 ? currentFolder.join("/") : guessDestFolder(file.name);
      const defaultPath = destFolder ? `${destFolder}/${file.name}` : file.name;
      if (existingPaths.has(defaultPath)) {
        setStagedReplacements((prev) => new Map(prev).set(defaultPath, file));
        continue;
      }
      additions.push({ id: crypto.randomUUID(), path: defaultPath, file, editable: true, required: true });
    }
    if (additions.length > 0) setStagedAdds((prev) => [...prev, ...additions]);
  };

  // Drag-and-drop entry point — handles a mix of dropped files and folders in one go.
  // Folders keep their internal structure (same stripping rule as the folder picker);
  // loose files fall back to the loose-file default-path logic above.
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (publishing) return;
    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((it) => (it as any).webkitGetAsEntry?.())
      .filter((entry): entry is any => !!entry);
    if (entries.length === 0) return;

    const folderWalks: Promise<WalkedFile[]>[] = [];
    const looseFiles: File[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) {
        folderWalks.push(
          walkDroppedEntry(entry, "").then((walked) =>
            walked
              .map((w) => ({ ...w, relativePath: stripFolderPrefix(w.relativePath) }))
              .filter((w) => w.relativePath && shouldIncludeFile(w.relativePath, w.file.name))
          )
        );
      } else {
        const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
        looseFiles.push(file);
      }
    }

    if (folderWalks.length > 0) {
      const walked = (await Promise.all(folderWalks)).flat();
      if (walked.length > 0) stageFolderFiles(walked);
    }
    if (looseFiles.length > 0) {
      const dt = new DataTransfer();
      looseFiles.forEach((f) => dt.items.add(f));
      onLooseFilesSelected(dt.files);
    }
  };

  /**
   * Stages files downloaded from Modrinth. A project already in the update is
   * swapped for the new version (same filename → replacement, different
   * filename → old one removed + new one added); a path that already exists
   * but wasn't identified becomes a replacement; anything else is a new file.
   */
  const stageModrinthDownloads = (downloads: ModrinthDownload[]) => {
    const removeExisting = new Set<string>();
    const dropAddIds = new Set<string>();
    const replacements = new Map<string, File>();
    const swapAdd = new Map<string, File>();
    const additions: StagedAdd[] = [];

    for (const d of downloads) {
      const current = presentProjects.get(d.match.projectId);
      if (current) {
        const r = current.row;
        if (r.path === d.path) {
          if (r.status === "added") swapAdd.set(r.addId!, d.file);
          else replacements.set(r.path, d.file);
          continue;
        }
        if (r.status === "added") dropAddIds.add(r.addId!);
        else removeExisting.add(r.path);
      }
      if (existingPaths.has(d.path)) {
        replacements.set(d.path, d.file);
        continue;
      }
      additions.push({ id: crypto.randomUUID(), path: d.path, file: d.file, editable: false, required: true });
    }

    setFileSha1((prev) => new Map([...prev, ...downloads.map((d) => [d.file, d.sha1] as const)]));
    setKnownMatches((prev) => new Map([...prev, ...downloads.map((d) => [d.sha1, d.match] as const)]));
    if (removeExisting.size > 0) {
      setRemovedPaths((prev) => new Set([...prev, ...removeExisting]));
    }
    setStagedReplacements((prev) => {
      const next = new Map(prev);
      for (const p of removeExisting) next.delete(p);
      for (const [p, f] of replacements) next.set(p, f);
      return next;
    });
    if (replacements.size > 0) {
      setRemovedPaths((prev) => {
        const next = new Set(prev);
        for (const p of replacements.keys()) next.delete(p);
        return next;
      });
    }
    setStagedAdds((prev) => [
      ...prev
        .filter((a) => !dropAddIds.has(a.id))
        .map((a) => (swapAdd.has(a.id) ? { ...a, file: swapAdd.get(a.id)! } : a)),
      ...additions,
    ]);
  };

  /** "Añadir desde la biblioteca": downloads the jar and stages it like a file
   *  added by hand, swapping out another build of the same library mod. */
  const stageLibraryBuild = async (_mod: LibraryMod, build: LibraryBuild, replacePath?: string) => {
    const res = await fetch(build.downloadUrl);
    if (!res.ok) throw new Error(`No se pudo descargar ${build.fileName} (HTTP ${res.status}).`);
    const file = new File([await res.blob()], build.fileName, { type: "application/java-archive" });
    const path = `mods/${build.fileName}`;
    setFileSha1((prev) => new Map(prev).set(file, build.sha1));

    if (replacePath && replacePath !== path) {
      const old = rows.find((r) => r.path === replacePath);
      if (old?.status === "added") setStagedAdds((prev) => prev.filter((a) => a.id !== old.addId));
      else if (old) {
        setRemovedPaths((prev) => new Set(prev).add(replacePath));
        setStagedReplacements((prev) => {
          const next = new Map(prev);
          next.delete(replacePath);
          return next;
        });
      }
    }
    if (existingPaths.has(path)) {
      setStagedReplacements((prev) => new Map(prev).set(path, file));
      setRemovedPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }
    setStagedAdds((prev) =>
      prev.some((a) => a.path === path)
        ? prev.map((a) => (a.path === path ? { ...a, file } : a))
        : [...prev, { id: crypto.randomUUID(), path, file, editable: false, required: true }]
    );
  };

  const handleAddMissingDeps = async (projectIds: string[]) => {
    setAddingDeps(projectIds.length === 1 ? projectIds[0] : "all");
    try {
      const needs = missingDeps.filter((d) => projectIds.includes(d.projectId));
      const planned = await planProjects(needs, new Set(presentProjects.keys()), packTarget);
      const unavailable = planned.filter((p) => !p.version);
      const downloads = await downloadDependencies(planned);
      if (downloads.length > 0) {
        stageModrinthDownloads(downloads);
        toast.success(`${downloads.map((d) => d.match.title).join(", ")} añadid${downloads.length === 1 ? "a" : "as"}.`);
      }
      if (unavailable.length > 0) {
        toast.warning(`${unavailable.map((u) => u.title).join(", ")}: sin versión para Minecraft ${packTarget.minecraftVersion} con ${packTarget.loader}.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron añadir las dependencias.");
    } finally {
      setAddingDeps(null);
    }
  };

  const handleReplaceClick = (path: string) => {
    replaceTargetPath.current = path;
    replaceInputRef.current?.click();
  };

  const handleReplaceFileChosen = (file: File) => {
    const path = replaceTargetPath.current;
    if (!path) return;
    setStagedReplacements((prev) => new Map(prev).set(path, file));
    replaceTargetPath.current = null;
  };

  // Bulk-remove every row currently nested under a folder — the per-file trash icon
  // makes clearing out something like a whole logs/ folder painfully one-at-a-time.
  const handleRemoveFolder = (folderPath: string) => {
    const prefix = `${folderPath}/`;
    const nested = rows.filter((r) => r.path.startsWith(prefix));
    const addIds = new Set(nested.filter((r) => r.status === "added").map((r) => r.addId!));
    const existingPathsToRemove = nested.filter((r) => r.status !== "added").map((r) => r.path);
    setStagedAdds((prev) => prev.filter((a) => !addIds.has(a.id)));
    setRemovedPaths((prev) => {
      const next = new Set(prev);
      existingPathsToRemove.forEach((p) => next.add(p));
      return next;
    });
    setStagedReplacements((prev) => {
      const next = new Map(prev);
      existingPathsToRemove.forEach((p) => next.delete(p));
      return next;
    });
  };

  const handleRemoveExisting = (path: string) => {
    setRemovedPaths((prev) => new Set(prev).add(path));
    setStagedReplacements((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  };

  const handleUndoRemove = (path: string) => {
    setRemovedPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const handleUndoReplace = (path: string) => {
    setStagedReplacements((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  };

  const handleUndoAdd = (addId: string) => {
    setStagedAdds((prev) => prev.filter((a) => a.id !== addId));
  };

  const handleEditAddPath = (addId: string, newPath: string) => {
    setStagedAdds((prev) => prev.map((a) => (a.id === addId ? { ...a, path: newPath } : a)));
  };

  const handleToggleRequired = (path: string, current: boolean) => {
    setRequiredOverrides((prev) => new Map(prev).set(path, !current));
  };

  const handleToggleAddRequired = (addId: string) => {
    setStagedAdds((prev) => prev.map((a) => (a.id === addId ? { ...a, required: !a.required } : a)));
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    setOptionalGroups((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: newGroupName.trim(), description: newGroupDescription.trim(), paths: [] },
    ]);
    setNewGroupName("");
    setNewGroupDescription("");
  };

  const handleDeleteGroup = (groupId: string) => {
    setOptionalGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleRenameGroup = (groupId: string, updates: Partial<Pick<OptionalGroup, "name" | "description">>) => {
    setOptionalGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...updates } : g)));
  };

  const handleToggleGroupPath = (groupId: string, path: string) => {
    setOptionalGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, paths: g.paths.includes(path) ? g.paths.filter((p) => p !== path) : [...g.paths, path] }
          : g
      )
    );
  };

  const handleSaveSettings = async () => {
    if (!id) return;
    const token = getMySource()?.adminToken ?? "";
    const repoUrl = getMySource()?.repoUrl ?? "";
    if (!token) {
      toast.error("Necesitas un token de GitHub en Ajustes antes de guardar.");
      return;
    }
    setSettingsSaving(true);
    try {
      await updateModpackMetadata(token, repoUrl, id, settingsForm);
      toast.success("Ajustes guardados.");
      loadModpacks();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar los ajustes.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleGenerateOrRegenerateCode = async () => {
    const mine = getMySource();
    if (!id || !uuid || !mine) return;
    setAccessCodeLoading(true);
    try {
      const code = accessCode
        ? await regenerateAccessCode(mine.repoUrl, id, uuid, mine.readToken)
        : await createAccessCode(mine.repoUrl, id, uuid, mine.readToken);
      setAccessCode(code);
      // Pending invitations carry the code — keep them working.
      if (accessCode) await updatePendingInviteCodes(mine.repoUrl, id, code).catch(() => {});
      toast.success(accessCode ? "Código regenerado." : "Código creado.");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el código.");
    } finally {
      setAccessCodeLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!accessCode) return;
    navigator.clipboard.writeText(formatCode(accessCode)).then(
      () => toast.success("Código copiado."),
      () => toast.error("No se pudo copiar.")
    );
  };

  const handleRevokeAccess = async (grantUuid: string, grantUsername: string) => {
    const repoUrl = getMySource()?.repoUrl;
    if (!id || !repoUrl) return;
    try {
      await revokeAccess(repoUrl, id, grantUuid);
      toast.success(`Acceso de ${grantUsername} eliminado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo quitar el acceso.");
    }
  };

  /** Invites a player by name. The invitation carries the instance's code, so
   *  one is created first if the instance doesn't have it yet. */
  const handleInvite = async (toUuid: string, toUsername: string) => {
    const mine = getMySource();
    if (!id || !uuid || !username || !mine || !pack) return;
    try {
      let code = accessCode;
      if (!code) {
        code = await createAccessCode(mine.repoUrl, id, uuid, mine.readToken);
        setAccessCode(code);
      }
      const color = await getInstanceAccentColor({ id: pack.id, imageUrl: pack.imageUrl || pack.bannerUrl }).catch(() => undefined);
      await sendInvite({
        repoUrl: mine.repoUrl,
        modpackId: id,
        modpackName: pack.name,
        imageUrl: pack.imageUrl || undefined,
        color,
        code,
        fromUuid: uuid,
        fromUsername: username,
        toUuid,
        toUsername,
      });
      toast.success(`Invitación enviada a ${toUsername}.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar la invitación.");
    }
  };

  const handleCancelInvite = async (toUuid: string, toUsername: string) => {
    const repoUrl = getMySource()?.repoUrl;
    if (!id || !repoUrl) return;
    try {
      await cancelInvite(repoUrl, id, toUuid);
      toast.success(`Invitación a ${toUsername} cancelada.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cancelar la invitación.");
    }
  };

  const handleBan = async (targetUuid: string, targetUsername: string) => {
    const repoUrl = getMySource()?.repoUrl;
    if (!id || !repoUrl) return;
    try {
      await banFromInstance(repoUrl, id, targetUuid, targetUsername);
      toast.success(`${targetUsername} bloqueado: ya no puede entrar ni con código ni por invitación.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo bloquear.");
    }
  };

  const handleUnban = async (targetUuid: string, targetUsername: string) => {
    const repoUrl = getMySource()?.repoUrl;
    if (!id || !repoUrl) return;
    try {
      await unbanFromInstance(repoUrl, id, targetUuid);
      toast.success(`${targetUsername} desbloqueado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo desbloquear.");
    }
  };

  /** Why a player can't be invited (shown in the picker instead of the button). */
  const inviteBlockedReason = (target: string): string | null => {
    if (target === uuid) return "Eres tú";
    if (bans[target]) return "Bloqueado";
    if (accessGrants[target]) return "Ya tiene acceso";
    if (pendingInvites[target]) return "Ya invitado";
    return null;
  };
  const banBlockedReason = (target: string): string | null => {
    if (target === uuid) return "Eres tú";
    if (bans[target]) return "Ya bloqueado";
    return null;
  };

  const stageLabel: Record<PublishProgress["stage"], string> = {
    hashing: "Calculando hashes (SHA-256)",
    uploading: "Subiendo archivos nuevos a GitHub",
    manifest: "Escribiendo manifiesto",
    done: "Completado",
  };

  const progressPct = publishProgress
    ? publishProgress.total > 0
      ? Math.round((publishProgress.done / publishProgress.total) * 100)
      : 0
    : 0;

  const handlePublish = async () => {
    if (!id || !hasChanges) return;
    if (!version.trim()) {
      toast.error("Indica el número de versión.");
      return;
    }
    const token = getMySource()?.adminToken ?? "";
    const repoUrl = getMySource()?.repoUrl ?? "";
    if (!token) {
      toast.error("Necesitas un token de GitHub en Ajustes antes de publicar.");
      return;
    }
    if (!repoUrl) {
      toast.error("Configura la URL del repositorio en Ajustes.");
      return;
    }
    const unchanged = existing
      .filter((e) => !removedPaths.has(e.path) && !stagedReplacements.has(e.path))
      .map((e) => {
        const req = requiredOverrides.get(e.path);
        return req === undefined ? e : { ...e, required: req };
      });
    const files: WalkedFile[] = [
      ...Array.from(stagedReplacements.entries()).map(([path, file]) => ({
        file,
        relativePath: path,
        required: requiredOverrides.get(path) ?? existingRequiredByPath.get(path) ?? true,
      })),
      ...stagedAdds.map((a) => ({ file: a.file, relativePath: a.path, required: a.required })),
    ];
    setPublishing(true);
    setPublishProgress({ stage: "hashing", done: 0, total: files.length });
    try {
      const validOptionalPaths = new Set(optionalRows.map((r) => r.path));
      const cleanedGroups = optionalGroups
        .map((g) => ({ ...g, paths: g.paths.filter((p) => validOptionalPaths.has(p)) }))
        .filter((g) => g.name.trim());
      const result = await publishModpackUpdate(
        token,
        repoUrl,
        id,
        { unchanged, files },
        version.trim(),
        changelog,
        changelogTitle,
        cleanedGroups,
        (p) => setPublishProgress(p)
      );
      toast.success(
        `Publicado v${version} · ${result.uploaded} subido${result.uploaded !== 1 ? "s" : ""} · ${result.reused} reutilizado${result.reused !== 1 ? "s" : ""}`
      );
      loadModpacks();
      setLocation("/admin");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al publicar");
    } finally {
      setPublishing(false);
      setPublishProgress(null);
    }
  };

  if (!isAdmin) return null;

  if (!pack) {
    return (
      <div className="h-full bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Modpack no encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/admin")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  const statusMeta: Record<RowStatus, { label: string; rowClass: string; textClass: string; badgeClass: string }> = {
    unchanged: { label: "", rowClass: "bg-white/[0.03] border-transparent hover:bg-white/[0.06]", textClass: "text-gray-100", badgeClass: "" },
    added: { label: "Nuevo", rowClass: "bg-green-500/[0.07] border-green-500/20", textClass: "text-green-300", badgeClass: "bg-green-500/15 text-green-300" },
    replaced: { label: "Reemplazado", rowClass: "bg-amber-500/[0.07] border-amber-500/20", textClass: "text-amber-300", badgeClass: "bg-amber-500/15 text-amber-300" },
    removed: { label: "Eliminado", rowClass: "bg-red-500/[0.07] border-red-500/20 opacity-70", textClass: "text-red-300 line-through", badgeClass: "bg-red-500/15 text-red-300" },
  };

  const totalFiles = activeRows.length;
  const identifiedCount = activeRows.filter((r) => !!matchFor(r.key)).length;

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleReplaceFileChosen(file);
          e.target.value = "";
        }}
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onLooseFilesSelected(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "" } as any)}
        onChange={(e) => {
          if (e.target.files?.length) onFolderSelected(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex-1 min-h-0 flex flex-col gap-5 px-6 pt-6 pb-5 max-w-7xl mx-auto w-full">
        {/* Header — same glass card as the Hub / Perfil */}
        <div className={cn(GLASS, "relative shrink-0 p-5 overflow-hidden")}>
          {(pack.bannerUrl || pack.imageUrl) && (
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <img src={pack.bannerUrl || pack.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/30" />
            </div>
          )}
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <button
              type="button"
              onClick={() => setLocation("/admin")}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <img
              src={pack.imageUrl || "./logo.png"}
              alt={pack.name}
              className="h-14 w-14 object-cover rounded-lg bg-black/50 shrink-0 shadow-lg"
              onError={(e) => { (e.target as HTMLImageElement).src = "./logo.png"; }}
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight truncate">{pack.name}</h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="font-semibold text-gray-200">v{pack.version}</span>
                <span className="opacity-40">·</span>
                <span>Minecraft {pack.minecraftVersion}</span>
                <span className="opacity-40">·</span>
                <span className="flex items-center gap-1 capitalize">
                  <LoaderIcon loader={pack.loaderType} className="h-3.5 w-3.5" />
                  {pack.loaderType}
                </span>
                <span className="opacity-40">·</span>
                <span>{totalFiles} archivo{totalFiles !== 1 ? "s" : ""}</span>
              </div>
            </div>
            {hasChanges && (
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                {stagedAdds.length > 0 && <ChangeChip className="bg-green-500/15 text-green-300">+{stagedAdds.length} nuevo{stagedAdds.length !== 1 ? "s" : ""}</ChangeChip>}
                {stagedReplacements.size > 0 && <ChangeChip className="bg-amber-500/15 text-amber-300">{stagedReplacements.size} reemplazo{stagedReplacements.size !== 1 ? "s" : ""}</ChangeChip>}
                {removedPaths.size > 0 && <ChangeChip className="bg-red-500/15 text-red-300">−{removedPaths.size} eliminado{removedPaths.size !== 1 ? "s" : ""}</ChangeChip>}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex gap-5">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 min-h-0 flex flex-col gap-3">
              <TabsList className="self-start bg-card/50 border border-white/5">
                <TabsTrigger value="files" className={TAB_TRIGGER}>
                  <Files className="h-3.5 w-3.5" /> Archivos
                </TabsTrigger>
                <TabsTrigger
                  value="content"
                  className={TAB_TRIGGER}
                  disabled={optionalCount === 0}
                  title={optionalCount === 0 ? "Marca algún archivo como opcional primero" : undefined}
                >
                  <Layers className="h-3.5 w-3.5" /> Contenido adicional
                </TabsTrigger>
                <TabsTrigger value="changelog" className={TAB_TRIGGER}>
                  <ScrollText className="h-3.5 w-3.5" /> ChangeLog
                </TabsTrigger>
                <TabsTrigger value="settings" className={TAB_TRIGGER}>
                  <Settings2 className="h-3.5 w-3.5" /> Ajustes
                </TabsTrigger>
                <TabsTrigger value="access" className={TAB_TRIGGER}>
                  <Users className="h-3.5 w-3.5" /> Acceso
                </TabsTrigger>
              </TabsList>

              <TabsContent value="files" className="flex-1 min-h-0 flex flex-col gap-3 mt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setCurrentFolder([])}
                      className={`flex items-center gap-1 hover:text-white transition-colors ${currentFolder.length === 0 ? "text-white font-semibold" : ""}`}
                    >
                      <HomeIcon className="h-3.5 w-3.5" />
                    </button>
                    {currentFolder.map((seg, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 opacity-50" />
                        <button
                          type="button"
                          onClick={() => setCurrentFolder(currentFolder.slice(0, i + 1))}
                          className={`hover:text-white transition-colors font-mono ${i === currentFolder.length - 1 ? "text-white font-semibold" : ""}`}
                        >
                          {seg}
                        </button>
                      </span>
                    ))}
                  </div>
                  {identifiedCount > 0 && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1" title="Archivos reconocidos por su hash en Modrinth">
                      <ModrinthGlyph className="h-3 w-3 text-[#1bd96a]" />
                      {identifiedCount} identificado{identifiedCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => setBrowserOpen(true)}
                      disabled={publishing}
                      className="h-8 bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                    >
                      <ModrinthGlyph className="mr-1.5 h-4 w-4" /> Añadir desde Modrinth
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLibraryOpen(true)}
                      disabled={publishing}
                      className="h-8 border-white/10"
                    >
                      <Library className="mr-1.5 h-3.5 w-3.5" /> Biblioteca
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 border-white/10" disabled={publishing} onClick={() => filesInputRef.current?.click()}>
                      <FilePlus className="mr-1.5 h-3.5 w-3.5" /> Archivos
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 border-white/10" disabled={publishing} onClick={() => folderInputRef.current?.click()}>
                      <FolderUp className="mr-1.5 h-3.5 w-3.5" /> Carpeta
                    </Button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {missingDeps.length > 0 && (
                    <motion.div
                      key="missing-deps"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="shrink-0 overflow-hidden"
                    >
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                          <p className="text-sm font-semibold text-amber-200 flex-1">
                            Faltan {missingDeps.length} dependencia{missingDeps.length !== 1 ? "s" : ""} necesaria{missingDeps.length !== 1 ? "s" : ""}
                          </p>
                          {missingDeps.length > 1 && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-amber-500 hover:bg-amber-500/90 text-black font-bold"
                              disabled={!!addingDeps || publishing}
                              onClick={() => handleAddMissingDeps(missingDeps.map((d) => d.projectId))}
                            >
                              {addingDeps === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Añadir todas"}
                            </Button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {missingDeps.map((d) => {
                            const info = missingInfo.get(d.projectId);
                            return (
                              <div key={d.projectId} className="flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-lg bg-black/20 border border-white/5">
                                <ProjectIcon url={info?.iconUrl} title={info?.title ?? "?"} className="h-6 w-6" />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-gray-100 truncate max-w-[12rem]">{info?.title ?? "Cargando..."}</p>
                                  <p className="text-[10px] text-muted-foreground truncate max-w-[12rem]">Para {d.requiredBy.join(", ")}</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px] text-amber-300 hover:text-amber-200 hover:bg-amber-500/10"
                                  disabled={!!addingDeps || publishing}
                                  onClick={() => handleAddMissingDeps([d.projectId])}
                                >
                                  {addingDeps === d.projectId ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Plus className="h-3 w-3 mr-0.5" />Añadir</>}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {conflicts.length > 0 && (
                    <motion.div
                      key="conflicts"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="shrink-0 overflow-hidden"
                    >
                      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3 flex items-start gap-2">
                        <Ban className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-200 space-y-0.5">
                          {conflicts.map((c, i) => (
                            <p key={i}>
                              <span className="font-semibold">{c.a}</span> es incompatible con <span className="font-semibold">{c.b}</span>.
                            </p>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "flex-1 min-h-0 overflow-y-auto rounded-xl border p-2 transition-colors",
                    dragActive ? "bg-accent/10 border-accent/50" : "bg-card/40 border-white/10"
                  )}
                >
                  {loadingManifest ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando archivos publicados...
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 text-center px-6">
                      <UploadCloud className="h-7 w-7" />
                      <p className="text-sm">Este modpack no tiene archivos todavía.</p>
                      <p className="text-xs">Arrastra aquí la carpeta de la instancia, súbela con "Carpeta" o añade mods desde Modrinth.</p>
                    </div>
                  ) : currentLevel.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <Folder className="h-6 w-6" />
                      <p className="text-sm">Carpeta vacía.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {currentLevel.map((entry) =>
                        entry.kind === "folder" ? (
                          <div
                            key={`dir:${entry.name}`}
                            className="group flex items-center gap-3 px-3 py-2.5 text-xs rounded-lg w-full bg-white/[0.03] hover:bg-white/[0.07] border border-transparent transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => setCurrentFolder([...currentFolder, entry.name])}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <span className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md bg-accent/15 text-accent">
                                <Folder className="h-4 w-4" />
                              </span>
                              <span className="truncate flex-1 min-w-0 font-mono text-sm text-gray-100">{entry.name}</span>
                              {entry.changeCount > 0 && (
                                <span className="text-[10px] font-semibold text-accent shrink-0 px-1.5 py-0.5 rounded-full bg-accent/10">
                                  {entry.changeCount} cambio{entry.changeCount !== 1 ? "s" : ""}
                                </span>
                              )}
                              <span className="opacity-50 shrink-0">{entry.fileCount} archivo{entry.fileCount !== 1 ? "s" : ""}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFolder([...currentFolder, entry.name].join("/"))}
                              disabled={publishing}
                              title="Eliminar carpeta completa"
                              className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50 shrink-0"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight
                              className="h-4 w-4 shrink-0 opacity-50 cursor-pointer"
                              onClick={() => setCurrentFolder([...currentFolder, entry.name])}
                            />
                          </div>
                        ) : (
                          (() => {
                            const row = entry.row;
                            const meta = statusMeta[row.status];
                            const match = matchFor(row.key);
                            const fromLibrary = isLibraryProjectId(match?.projectId);
                            const neededBy = match ? requiredBy.get(match.projectId) : undefined;
                            const hashing = isIdentifiable(row.path) && !row.sha1 && row.status !== "unchanged" && row.status !== "removed";
                            return (
                              <div key={row.key} className={cn("flex items-center gap-3 px-3 py-2 text-xs rounded-lg w-full border transition-colors", meta.rowClass)}>
                                {match && fromLibrary ? (
                                  <span title="Biblioteca de mods" className="shrink-0">
                                    <ProjectIcon url={match.iconUrl} title={match.title} className="h-9 w-9" />
                                  </span>
                                ) : match ? (
                                  <a
                                    href={`https://modrinth.com/project/${match.projectId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Ver en Modrinth"
                                    className="shrink-0"
                                  >
                                    <ProjectIcon url={match.iconUrl} title={match.title} className="h-9 w-9" />
                                  </a>
                                ) : (
                                  <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md bg-black/25">
                                    {hashing ? <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" /> : <FileText className="h-4 w-4 opacity-50" />}
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  {row.editable ? (
                                    <Input
                                      value={row.path}
                                      onChange={(e) => handleEditAddPath(row.addId!, e.target.value)}
                                      className="h-7 bg-background/50 border-white/10 text-white font-mono text-xs px-2 py-0"
                                      disabled={publishing}
                                    />
                                  ) : match ? (
                                    <>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={cn("text-sm font-medium truncate", row.status === "removed" ? meta.textClass : "text-gray-100")}>
                                          {match.title}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[10rem]">{versionLabel(match.versionNumber)}</span>
                                        {fromLibrary && (
                                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                                            <Library className="h-2.5 w-2.5" /> Biblioteca
                                          </span>
                                        )}
                                      </div>
                                      <p className="font-mono text-[10.5px] text-muted-foreground truncate select-text">{entry.name}</p>
                                    </>
                                  ) : (
                                    <span className={cn("block truncate font-mono select-text", meta.textClass)}>{entry.name}</span>
                                  )}
                                </div>
                                {neededBy && row.status !== "removed" && (
                                  <span
                                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300"
                                    title={`Necesaria para: ${neededBy.join(", ")}`}
                                  >
                                    <Link2 className="h-2.5 w-2.5" /> Dependencia
                                  </span>
                                )}
                                {!row.required && row.status !== "removed" && (
                                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300">Opcional</span>
                                )}
                                {meta.label && (
                                  <span className={cn("text-[10px] font-semibold uppercase shrink-0 px-1.5 py-0.5 rounded-full", meta.badgeClass)}>{meta.label}</span>
                                )}
                                <span className="opacity-50 shrink-0 font-mono w-16 text-right">{formatBytes(row.size)}</span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {row.status !== "removed" && (
                                    <IconAction
                                      onClick={() =>
                                        row.status === "added"
                                          ? handleToggleAddRequired(row.addId!)
                                          : handleToggleRequired(row.path, row.required)
                                      }
                                      disabled={publishing}
                                      title={row.required ? "Obligatorio — clic para marcar como opcional" : "Opcional — clic para marcar como obligatorio"}
                                      className={row.required ? "text-muted-foreground hover:text-accent hover:bg-accent/10" : "text-amber-300 hover:bg-amber-500/10"}
                                    >
                                      {row.required ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                    </IconAction>
                                  )}
                                  {row.status === "unchanged" && (
                                    <>
                                      <IconAction onClick={() => handleReplaceClick(row.path)} disabled={publishing} title="Reemplazar contenido" className="text-muted-foreground hover:text-accent hover:bg-accent/10">
                                        <RefreshCw className="h-3.5 w-3.5" />
                                      </IconAction>
                                      <IconAction onClick={() => handleRemoveExisting(row.path)} disabled={publishing} title="Eliminar" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                        <Trash className="h-3.5 w-3.5" />
                                      </IconAction>
                                    </>
                                  )}
                                  {row.status === "replaced" && (
                                    <IconAction onClick={() => handleUndoReplace(row.path)} disabled={publishing} title="Deshacer reemplazo" className="text-amber-300 hover:bg-amber-500/10">
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </IconAction>
                                  )}
                                  {row.status === "removed" && (
                                    <IconAction onClick={() => handleUndoRemove(row.path)} disabled={publishing} title="Deshacer eliminación" className="text-red-300 hover:bg-red-500/10">
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </IconAction>
                                  )}
                                  {row.status === "added" && (
                                    <IconAction onClick={() => handleUndoAdd(row.addId!)} disabled={publishing} title="Quitar" className="text-green-300 hover:bg-green-500/10">
                                      <Trash className="h-3.5 w-3.5" />
                                    </IconAction>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        )
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="content" className="flex-1 min-h-0 overflow-y-auto mt-0">
                <div className={cn(GLASS, "p-4 space-y-4")}>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[10rem] space-y-1.5">
                      <Label className="text-gray-200">Nombre del grupo</Label>
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="bg-background/50 border-white/10 text-white"
                        placeholder="ej: Shaders ligeros"
                      />
                    </div>
                    <div className="flex-1 min-w-[10rem] space-y-1.5">
                      <Label className="text-gray-200">Descripción</Label>
                      <Input
                        value={newGroupDescription}
                        onChange={(e) => setNewGroupDescription(e.target.value)}
                        className="bg-background/50 border-white/10 text-white"
                        placeholder="Opcional"
                      />
                    </div>
                    <Button
                      onClick={handleCreateGroup}
                      disabled={!newGroupName.trim()}
                      className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shrink-0"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Crear grupo
                    </Button>
                  </div>

                  {optionalGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Todavía no hay grupos. Crea uno arriba y asígnale archivos opcionales.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {optionalGroups.map((group) => (
                        <div key={group.id} className="rounded-lg border border-white/10 p-3 space-y-2 bg-white/[0.03]">
                          <div className="flex items-center gap-2">
                            <Input
                              value={group.name}
                              onChange={(e) => handleRenameGroup(group.id, { name: e.target.value })}
                              className="h-8 bg-background/50 border-white/10 text-white font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group.id)}
                              title="Eliminar grupo"
                              className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                          <Input
                            value={group.description}
                            onChange={(e) => handleRenameGroup(group.id, { description: e.target.value })}
                            className="h-8 bg-background/50 border-white/10 text-gray-300 text-xs"
                            placeholder="Descripción"
                          />
                          <div className="flex flex-wrap gap-2 pt-1">
                            {optionalRows.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No hay archivos opcionales.</p>
                            ) : (
                              optionalRows.map((row) => {
                                const inGroup = group.paths.includes(row.path);
                                const match = matchFor(row.key);
                                return (
                                  <button
                                    type="button"
                                    key={row.path}
                                    onClick={() => handleToggleGroupPath(group.id, row.path)}
                                    title={row.path}
                                    className={cn(
                                      "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors",
                                      match ? "" : "font-mono",
                                      inGroup
                                        ? "bg-accent/20 border-accent/40 text-accent"
                                        : "bg-white/5 border-white/10 text-muted-foreground hover:text-white"
                                    )}
                                  >
                                    {match && <ProjectIcon url={match.iconUrl} title={match.title} className="h-4 w-4 rounded-sm" />}
                                    {match?.title ?? row.path}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="changelog" className="flex-1 min-h-0 overflow-y-auto mt-0">
                <ChangelogEditor value={changelog} onChange={setChangelog} disabled={publishing} />
              </TabsContent>

              <TabsContent value="settings" className="flex-1 min-h-0 overflow-y-auto mt-0">
                <div className={cn(GLASS, "p-5 space-y-4 max-w-2xl")}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-200">Nombre</Label>
                      <Input
                        value={settingsForm.name}
                        onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                        className="bg-background/50 border-white/10 text-white"
                        disabled={settingsSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-200">ID</Label>
                      <Input value={pack.id} disabled className="bg-background/30 border-white/10 text-muted-foreground font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-200">Descripción</Label>
                    <Input
                      value={settingsForm.description}
                      onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                      className="bg-background/50 border-white/10 text-white"
                      disabled={settingsSaving}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-200">URL de logo</Label>
                      <ImageUrlField
                        value={settingsForm.imageUrl}
                        onChange={(url) => setSettingsForm((f) => ({ ...f, imageUrl: url }))}
                        disabled={settingsSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-200">URL de banner</Label>
                      <ImageUrlField
                        value={settingsForm.bannerUrl}
                        onChange={(url) => setSettingsForm((f) => ({ ...f, bannerUrl: url }))}
                        disabled={settingsSaving}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
                    <div>
                      <Label className="text-gray-200">Seguridad antiXray</Label>
                      <p className="text-xs text-muted-foreground max-w-sm mt-0.5">
                        Elimina automáticamente, en el cliente de cada jugador, cualquier archivo de mods/shaders/resourcepacks
                        con "xray" en el nombre, y lo filtra también al buscar contenido para añadir.
                      </p>
                    </div>
                    <Switch
                      checked={settingsForm.antiXray}
                      onCheckedChange={(v) => setSettingsForm({ ...settingsForm, antiXray: v })}
                      disabled={settingsSaving}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
                    <div>
                      <Label className="text-gray-200">Bloqueo de contenido</Label>
                      <p className="text-xs text-muted-foreground max-w-sm mt-0.5">
                        Los jugadores no podrán añadir mods, shaders ni resource packs desde el gestor de la instancia, y la
                        app eliminará automáticamente cualquiera que metan a mano en esas carpetas y que no forme parte del
                        modpack. A ti, como creador, no te afecta.
                      </p>
                    </div>
                    <Switch
                      checked={settingsForm.lockContent}
                      onCheckedChange={(v) => setSettingsForm({ ...settingsForm, lockContent: v })}
                      disabled={settingsSaving}
                    />
                  </div>

                  <Button
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                  >
                    {settingsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {settingsSaving ? "Guardando..." : "Guardar ajustes"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="access" className="flex-1 min-h-0 overflow-y-auto mt-0">
                <div className="space-y-4 max-w-2xl">
                  <div className={cn(GLASS, "p-5 space-y-3")}>
                    <Label className="text-gray-200">Código de acceso</Label>
                    <p className="text-xs text-muted-foreground">
                      Quien lo introduzca en "Añadir" verá esta instancia online. Sin código nadie más
                      puede verla. Al regenerarlo, el anterior deja de funcionar.
                    </p>
                    {accessCode ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg tracking-[0.3em] bg-background/50 border border-white/10 rounded-lg px-3 py-1.5 text-white select-text">
                          {formatCode(accessCode)}
                        </span>
                        <Button variant="outline" size="icon" className="border-white/10" onClick={handleCopyCode} aria-label="Copiar código">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-white/10"
                          onClick={handleGenerateOrRegenerateCode}
                          disabled={accessCodeLoading}
                        >
                          {accessCodeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          Regenerar
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={handleGenerateOrRegenerateCode} disabled={accessCodeLoading}>
                        {accessCodeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        Crear código
                      </Button>
                    )}
                  </div>

                  <div className={cn(GLASS, "p-5 space-y-3")}>
                    <div>
                      <Label className="text-gray-200 flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Invitar a alguien
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Le llega una invitación al launcher: si la acepta, entra igual que con el código.
                      </p>
                    </div>
                    <PlayerPicker
                      placeholder="Nombre de Minecraft..."
                      actionLabel="Invitar"
                      blockedReason={inviteBlockedReason}
                      onPick={handleInvite}
                    />
                    {Object.keys(pendingInvites).length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pendientes</p>
                        {Object.entries(pendingInvites).map(([inviteeUuid, inv]) => (
                          <div key={inviteeUuid} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5">
                            <Head uuid={inviteeUuid} username={inv.username} />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-100">{inv.username}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : ""}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-white"
                              onClick={() => handleCancelInvite(inviteeUuid, inv.username)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={cn(GLASS, "p-5")}>
                    <Label className="text-gray-200 mb-3 block">Personas con acceso</Label>
                    {Object.keys(accessGrants).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nadie ha entrado todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(accessGrants).map(([grantUuid, grant]) => (
                          <div key={grantUuid} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5">
                            <Head uuid={grantUuid} username={grant.username} />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-100">{grant.username}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {grant.grantedAt ? new Date(grant.grantedAt).toLocaleDateString() : "—"}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Quitar acceso (podrá volver a entrar con el código)"
                              onClick={() => handleRevokeAccess(grantUuid, grant.username)}
                              aria-label={`Quitar acceso a ${grant.username}`}
                            >
                              <UserX className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Expulsar y bloquear (no podrá volver a entrar)"
                              onClick={() => handleBan(grantUuid, grant.username)}
                              aria-label={`Bloquear a ${grant.username}`}
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={cn(GLASS, "p-5 space-y-3")}>
                    <div>
                      <Label className="text-gray-200 flex items-center gap-1.5">
                        <Ban className="h-3.5 w-3.5" /> Bloqueados
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        No pueden entrar a esta instancia de ninguna forma: ni con el código ni por invitación.
                      </p>
                    </div>
                    <PlayerPicker
                      placeholder="Bloquear a alguien por nombre..."
                      actionLabel="Bloquear"
                      actionVariant="destructive"
                      blockedReason={banBlockedReason}
                      onPick={handleBan}
                    />
                    {Object.keys(bans).length > 0 && (
                      <div className="space-y-1">
                        {Object.entries(bans).map(([bannedUuid, ban]) => (
                          <div key={bannedUuid} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/20">
                            <Head uuid={bannedUuid} username={ban.username} />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-100">{ban.username}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {ban.bannedAt ? new Date(ban.bannedAt).toLocaleDateString() : ""}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-white"
                              onClick={() => handleUnban(bannedUuid, ban.username)}
                            >
                              Desbloquear
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
            <div className={cn(GLASS, "relative p-4 space-y-4 overflow-hidden")}>
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative space-y-4">
                <p className="text-sm font-bold text-white">Nueva actualización</p>
                <div className="space-y-1.5">
                  <Label className="text-gray-200 text-xs">Versión</Label>
                  <Input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="bg-background/50 border-white/10 text-white"
                    placeholder="ej: 1.2.0"
                    disabled={publishing}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-gray-200 text-xs">Título</Label>
                  <Input
                    value={changelogTitle}
                    onChange={(e) => setChangelogTitle(e.target.value)}
                    className="bg-background/50 border-white/10 text-white"
                    placeholder="ej: Optimización de rendimiento"
                    disabled={publishing}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  El texto de la pestaña "ChangeLog" se publica como notas de esta versión.
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  <Stat value={stagedAdds.length} label="añadidos" className="text-green-300" />
                  <Stat value={stagedReplacements.size} label="reemplazados" className="text-amber-300" />
                  <Stat value={removedPaths.size} label="eliminados" className="text-red-300" />
                  <Stat value={optionalCount} label="opcionales" className="text-gray-200" />
                </div>

                {missingDeps.length > 0 && !publishing && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-300 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    Faltan dependencias: algunos mods podrían no arrancar.
                  </p>
                )}

                {publishProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-200">
                      <span className="font-medium">{stageLabel[publishProgress.stage]}</span>
                      <span className="font-mono tabular-nums">
                        {publishProgress.total > 0 ? `${publishProgress.done} / ${publishProgress.total}` : ""}
                      </span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                    {publishProgress.currentFile && (
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{publishProgress.currentFile}</p>
                    )}
                  </div>
                )}

                <Button
                  onClick={handlePublish}
                  disabled={publishing || !hasChanges || !version.trim()}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                >
                  {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {publishing ? stageLabel[publishProgress?.stage ?? "hashing"] + "..." : "Lanzar actualización"}
                </Button>
                {!hasChanges && !publishing && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Añade, reemplaza o elimina algún archivo, o edita los grupos de contenido adicional, para poder publicar.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <AdminModrinthBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        target={packTarget}
        present={presentForBrowser}
        onAdd={stageModrinthDownloads}
      />
      {pack && (
        <ModLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          pack={pack}
          subtitle={`Añadir al modpack ${pack.name}`}
          verbs={{ install: "Añadir", installed: "En el modpack", done: "añadido a la actualización" }}
          installedMods={activeRows
            .filter((r) => r.path.startsWith("mods/"))
            .map((r) => ({ path: r.path, sha1: r.sha1, mandatory: false }))}
          onInstall={stageLibraryBuild}
        />
      )}
    </div>
  );
}

function ChangeChip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("text-[11px] font-semibold px-2 py-1 rounded-full", className)}>{children}</span>;
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/5 px-2.5 py-1.5">
      <p className={cn("text-base font-bold tabular-nums leading-tight", value === 0 ? "text-muted-foreground" : className)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function IconAction({
  onClick,
  disabled,
  title,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn("h-7 w-7 flex items-center justify-center rounded-full transition-colors disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}
