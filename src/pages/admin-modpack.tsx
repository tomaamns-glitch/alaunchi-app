import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  Folder,
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
import { getGithubRepo, getModpacksToken } from "@/lib/app-config";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { formatBytes } from "@/lib/format";
import { ChangelogEditor } from "@/components/changelog-editor";
import {
  createAccessCode,
  regenerateAccessCode,
  getAccessCode,
  subscribeAccessGrants,
  revokeAccess,
  type AccessGrant,
} from "@/services/access-codes";

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
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [accessGrants, setAccessGrants] = useState<Record<string, AccessGrant>>({});

  const replaceTargetPath = useRef<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
    else if (!isAdmin) setLocation("/");
  }, [isAuthenticated, isAdmin, setLocation]);

  useEffect(() => {
    if (isAdmin && modpacks.length === 0) loadModpacks();
  }, [isAdmin]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getAccessCode(id).then((code) => {
      if (!cancelled) setAccessCode(code);
    });
    const unsubscribe = subscribeAccessGrants(id, setAccessGrants);
    return () => {
      cancelled = true;
      unsubscribe();
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
    });
    const repoUrl = getGithubRepo();
    const token = getModpacksToken();
    fetchSnapshot(repoUrl, id, token || undefined).then((manifest) => {
      if (cancelled) return;
      setExisting(manifest?.files ?? []);
      setOptionalGroups(manifest?.optionalGroups ?? []);
      setInitialOptionalGroups(manifest?.optionalGroups ?? []);
      setLoadingManifest(false);
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
        out.push({ key: e.path, path: e.path, size: e.size, status: "removed", required });
      } else if (stagedReplacements.has(e.path)) {
        out.push({ key: e.path, path: e.path, size: stagedReplacements.get(e.path)!.size, status: "replaced", required });
      } else {
        out.push({ key: e.path, path: e.path, size: e.size, status: "unchanged", required });
      }
    }
    for (const a of stagedAdds) {
      out.push({ key: a.id, path: a.path, size: a.file.size, status: "added", addId: a.id, editable: a.editable, required: a.required });
    }
    return out.sort((x, y) => x.path.localeCompare(y.path));
  }, [existing, removedPaths, stagedReplacements, stagedAdds, requiredOverrides]);

  const currentLevel = useMemo(() => buildLevel(rows, currentFolder), [rows, currentFolder]);

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
    const token = localStorage.getItem("githubToken") ?? "";
    const repoUrl = getGithubRepo();
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
    if (!id || !uuid || !username) return;
    setAccessCodeLoading(true);
    try {
      const code = accessCode
        ? await regenerateAccessCode(id)
        : await createAccessCode(id, uuid, username);
      setAccessCode(code);
      toast.success(accessCode ? "Código regenerado." : "Código creado.");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el código.");
    } finally {
      setAccessCodeLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!accessCode) return;
    navigator.clipboard.writeText(accessCode).then(
      () => toast.success("Código copiado."),
      () => toast.error("No se pudo copiar.")
    );
  };

  const handleRevokeAccess = async (grantUuid: string, grantUsername: string) => {
    if (!id) return;
    try {
      await revokeAccess(id, grantUuid);
      toast.success(`Acceso de ${grantUsername} eliminado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo quitar el acceso.");
    }
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
    const token = localStorage.getItem("githubToken") ?? "";
    const repoUrl = getGithubRepo();
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
      <div className="min-h-full bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Modpack no encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/admin")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  const statusMeta: Record<RowStatus, { label: string; rowClass: string; textClass: string }> = {
    unchanged: { label: "", rowClass: "bg-card/50", textClass: "text-gray-100" },
    added: { label: "Nuevo", rowClass: "bg-green-500/10 border border-green-500/20", textClass: "text-green-300" },
    replaced: { label: "Reemplazado", rowClass: "bg-amber-500/10 border border-amber-500/20", textClass: "text-amber-300" },
    removed: { label: "Eliminado", rowClass: "bg-red-500/10 border border-red-500/20", textClass: "text-red-300 line-through" },
  };

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
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

      <header className="h-16 border-b border-white/5 bg-card/50 flex items-center px-6 sticky top-0 z-50 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")} className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <img
          src={pack.imageUrl || "./logo.png"}
          alt={pack.name}
          className="h-9 w-9 object-cover rounded bg-black/50"
          onError={(e) => { (e.target as HTMLImageElement).src = "./logo.png"; }}
        />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{pack.name}</h1>
          <p className="text-xs text-muted-foreground">v{pack.version} publicada · {pack.minecraftVersion} · {pack.loaderType}</p>
        </div>
      </header>

      <main className="flex-1 flex gap-6 p-6 max-w-7xl mx-auto w-full min-h-0">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 min-h-0 flex flex-col gap-3">
            <TabsList className="self-start">
              <TabsTrigger value="files">Archivos</TabsTrigger>
              <TabsTrigger value="content" disabled={optionalCount === 0} title={optionalCount === 0 ? "Marca algún archivo como opcional primero" : undefined}>
                Contenido adicional
              </TabsTrigger>
              <TabsTrigger value="changelog">ChangeLog</TabsTrigger>
              <TabsTrigger value="settings">Ajustes</TabsTrigger>
              <TabsTrigger value="access">Acceso</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="flex-1 min-h-0 flex flex-col gap-3 mt-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
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
                  className={`hover:text-white transition-colors ${i === currentFolder.length - 1 ? "text-white font-semibold" : ""}`}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex-1 min-h-0 overflow-y-auto backdrop-blur-md border rounded-md p-3 transition-colors ${
              dragActive ? "bg-accent/10 border-accent/50" : "bg-gray-500/10 border-white/10"
            }`}
          >
            {loadingManifest ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando archivos publicados...
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <UploadCloud className="h-6 w-6" />
                <p className="text-sm">Este modpack no tiene archivos todavía. Añade una carpeta o arrástrala aquí para publicar la primera versión.</p>
              </div>
            ) : currentLevel.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Folder className="h-6 w-6" />
                <p className="text-sm">Carpeta vacía.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {currentLevel.map((entry) =>
                  entry.kind === "folder" ? (
                    <div
                      key={`dir:${entry.name}`}
                      className="flex items-center gap-3 px-3 py-2 text-xs rounded-md w-full bg-card/50 hover:bg-card/80 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentFolder([...currentFolder, entry.name])}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate flex-1 min-w-0 font-mono text-gray-100">{entry.name}/</span>
                        {entry.changeCount > 0 && (
                          <span className="text-[10px] font-semibold text-accent shrink-0">{entry.changeCount} cambio{entry.changeCount !== 1 ? "s" : ""}</span>
                        )}
                        <span className="opacity-50 shrink-0 font-mono">{entry.fileCount} archivo{entry.fileCount !== 1 ? "s" : ""}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFolder([...currentFolder, entry.name].join("/"))}
                        disabled={publishing}
                        title="Eliminar carpeta completa"
                        className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 opacity-50 cursor-pointer"
                        onClick={() => setCurrentFolder([...currentFolder, entry.name])}
                      />
                    </div>
                  ) : (
                    (() => {
                      const row = entry.row;
                      const meta = statusMeta[row.status];
                      return (
                        <div key={row.key} className={`flex items-center gap-3 px-3 py-2 text-xs rounded-md w-full ${meta.rowClass}`}>
                          <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          {row.editable ? (
                            <Input
                              value={row.path}
                              onChange={(e) => handleEditAddPath(row.addId!, e.target.value)}
                              className="h-6 flex-1 min-w-0 bg-background/50 border-white/10 text-white font-mono text-xs px-2 py-0"
                              disabled={publishing}
                            />
                          ) : (
                            <span className={`truncate flex-1 min-w-0 font-mono ${meta.textClass}`}>{entry.name}</span>
                          )}
                          {meta.label && (
                            <span className={`text-[10px] font-semibold uppercase shrink-0 ${meta.textClass}`}>{meta.label}</span>
                          )}
                          <span className="opacity-50 shrink-0 font-mono">{formatBytes(row.size)}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {row.status !== "removed" && (
                              <button
                                type="button"
                                onClick={() =>
                                  row.status === "added"
                                    ? handleToggleAddRequired(row.addId!)
                                    : handleToggleRequired(row.path, row.required)
                                }
                                disabled={publishing}
                                title={row.required ? "Obligatorio — clic para marcar como opcional" : "Opcional — clic para marcar como obligatorio"}
                                className={`h-6 w-6 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                                  row.required
                                    ? "text-muted-foreground hover:text-accent hover:bg-accent/10"
                                    : "text-amber-300 hover:bg-amber-500/10"
                                }`}
                              >
                                {row.required ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {row.status === "unchanged" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleReplaceClick(row.path)}
                                  disabled={publishing}
                                  title="Reemplazar contenido"
                                  className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExisting(row.path)}
                                  disabled={publishing}
                                  title="Eliminar"
                                  className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {row.status === "replaced" && (
                              <button
                                type="button"
                                onClick={() => handleUndoReplace(row.path)}
                                disabled={publishing}
                                title="Deshacer reemplazo"
                                className="h-6 w-6 flex items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {row.status === "removed" && (
                              <button
                                type="button"
                                onClick={() => handleUndoRemove(row.path)}
                                disabled={publishing}
                                title="Deshacer eliminación"
                                className="h-6 w-6 flex items-center justify-center rounded-full text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {row.status === "added" && (
                              <button
                                type="button"
                                onClick={() => handleUndoAdd(row.addId!)}
                                disabled={publishing}
                                title="Quitar"
                                className="h-6 w-6 flex items-center justify-center rounded-full text-green-300 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </button>
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
              <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4 space-y-4">
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
                      <div key={group.id} className="border border-white/10 rounded-md p-3 space-y-2 bg-card/30">
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
                              return (
                                <button
                                  type="button"
                                  key={row.path}
                                  onClick={() => handleToggleGroupPath(group.id, row.path)}
                                  className={`text-[11px] font-mono px-2 py-1 rounded-full border transition-colors ${
                                    inGroup
                                      ? "bg-accent/20 border-accent/40 text-accent"
                                      : "bg-white/5 border-white/10 text-muted-foreground hover:text-white"
                                  }`}
                                >
                                  {row.path}
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
              <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4 space-y-4 max-w-xl">
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
                    <Input
                      value={settingsForm.imageUrl}
                      onChange={(e) => setSettingsForm({ ...settingsForm, imageUrl: e.target.value })}
                      className="bg-background/50 border-white/10 text-white"
                      disabled={settingsSaving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-200">URL de banner</Label>
                    <Input
                      value={settingsForm.bannerUrl}
                      onChange={(e) => setSettingsForm({ ...settingsForm, bannerUrl: e.target.value })}
                      className="bg-background/50 border-white/10 text-white"
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
              <div className="space-y-4 max-w-xl">
                <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4 space-y-3">
                  <Label className="text-gray-200">Código de acceso</Label>
                  <p className="text-xs text-muted-foreground">
                    Quien lo introduzca en "Añadir" verá este modpack en su carrusel. Sin código, el
                    modpack es visible para todos (como antes de este sistema).
                  </p>
                  {accessCode ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg tracking-[0.3em] bg-background/50 border border-white/10 rounded px-3 py-1.5 text-white">
                        {accessCode}
                      </span>
                      <Button variant="outline" size="icon" onClick={handleCopyCode} aria-label="Copiar código">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateOrRegenerateCode}
                        disabled={accessCodeLoading}
                      >
                        {accessCodeLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Regenerar
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={handleGenerateOrRegenerateCode} disabled={accessCodeLoading}>
                      {accessCodeLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="mr-2 h-4 w-4" />
                      )}
                      Crear código
                    </Button>
                  )}
                </div>

                <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4">
                  <Label className="text-gray-200 mb-3 block">Personas con acceso</Label>
                  {Object.keys(accessGrants).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nadie ha usado este código todavía.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Desde</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(accessGrants).map(([grantUuid, grant]) => (
                          <TableRow key={grantUuid}>
                            <TableCell>{grant.username}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {grant.grantedAt ? new Date(grant.grantedAt).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRevokeAccess(grantUuid, grant.username)}
                                aria-label={`Quitar acceso a ${grant.username}`}
                              >
                                <UserX className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="w-80 shrink-0 flex flex-col gap-4">
          <div className="bg-gray-500/10 backdrop-blur-md border border-white/10 rounded-md p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-gray-200">Nueva versión</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="bg-background/50 border-white/10 text-white"
                placeholder="ej: 1.2.0"
                disabled={publishing}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-200">Título de la actualización</Label>
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

            <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-white/5">
              <p>{stagedAdds.length} añadido{stagedAdds.length !== 1 ? "s" : ""}</p>
              <p>{stagedReplacements.size} reemplazado{stagedReplacements.size !== 1 ? "s" : ""}</p>
              <p>{removedPaths.size} eliminado{removedPaths.size !== 1 ? "s" : ""}</p>
              <p>{optionalCount} marcado{optionalCount !== 1 ? "s" : ""} como opcional</p>
            </div>

            {publishProgress && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-gray-200">
                  <span className="font-medium">{stageLabel[publishProgress.stage]}</span>
                  <span className="font-mono tabular-nums">
                    {publishProgress.total > 0 ? `${publishProgress.done} / ${publishProgress.total}` : ""}
                  </span>
                </div>
                <Progress value={progressPct} className="h-2" />
                {publishProgress.currentFile && (
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    {publishProgress.currentFile}
                  </p>
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
        </aside>
      </main>
    </div>
  );
}
