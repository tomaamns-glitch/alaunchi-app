import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  FilePlus,
} from "lucide-react";
import {
  fetchSnapshot,
  publishModpackUpdate,
  shouldIncludeFile,
  type SnapshotEntry,
  type WalkedFile,
  type PublishProgress,
} from "@/services/github";
import { getGithubRepo } from "@/lib/app-config";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { formatBytes } from "@/lib/format";

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
}

type RowStatus = "unchanged" | "added" | "replaced" | "removed";

interface Row {
  key: string;
  path: string;
  size: number;
  status: RowStatus;
  addId?: string;
  editable?: boolean;
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
  const { isAuthenticated } = useAuth();
  const isAdmin = useIsAdmin();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const pack = modpacks.find((p) => p.id === id);

  const [loadingManifest, setLoadingManifest] = useState(true);
  const [existing, setExisting] = useState<SnapshotEntry[]>([]);
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [stagedReplacements, setStagedReplacements] = useState<Map<string, File>>(new Map());
  const [stagedAdds, setStagedAdds] = useState<StagedAdd[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);

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
    if (!id || !pack) return;
    let cancelled = false;
    setLoadingManifest(true);
    setRemovedPaths(new Set());
    setStagedReplacements(new Map());
    setStagedAdds([]);
    setChangelog("");
    setCurrentFolder([]);
    const repoUrl = getGithubRepo();
    const token = localStorage.getItem("githubToken") ?? "";
    fetchSnapshot(repoUrl, id, token || undefined).then((manifest) => {
      if (cancelled) return;
      setExisting(manifest?.files ?? []);
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

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const e of existing) {
      if (removedPaths.has(e.path)) {
        out.push({ key: e.path, path: e.path, size: e.size, status: "removed" });
      } else if (stagedReplacements.has(e.path)) {
        out.push({ key: e.path, path: e.path, size: stagedReplacements.get(e.path)!.size, status: "replaced" });
      } else {
        out.push({ key: e.path, path: e.path, size: e.size, status: "unchanged" });
      }
    }
    for (const a of stagedAdds) {
      out.push({ key: a.id, path: a.path, size: a.file.size, status: "added", addId: a.id, editable: a.editable });
    }
    return out.sort((x, y) => x.path.localeCompare(y.path));
  }, [existing, removedPaths, stagedReplacements, stagedAdds]);

  const currentLevel = useMemo(() => buildLevel(rows, currentFolder), [rows, currentFolder]);

  const hasChanges = removedPaths.size > 0 || stagedReplacements.size > 0 || stagedAdds.length > 0;

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
        .map((w) => ({ id: crypto.randomUUID(), path: w.relativePath, file: w.file, editable: false }));
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
      additions.push({ id: crypto.randomUUID(), path: defaultPath, file, editable: true });
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
    const unchanged = existing.filter((e) => !removedPaths.has(e.path) && !stagedReplacements.has(e.path));
    const files: WalkedFile[] = [
      ...Array.from(stagedReplacements.entries()).map(([path, file]) => ({ file, relativePath: path })),
      ...stagedAdds.map((a) => ({ file: a.file, relativePath: a.path })),
    ];
    setPublishing(true);
    setPublishProgress({ stage: "hashing", done: 0, total: files.length });
    try {
      const result = await publishModpackUpdate(
        token,
        repoUrl,
        id,
        { unchanged, files },
        version.trim(),
        changelog,
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
          src={pack.imageUrl || "/logo.png"}
          alt={pack.name}
          className="h-9 w-9 object-cover rounded bg-black/50"
          onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
        />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{pack.name}</h1>
          <p className="text-xs text-muted-foreground">v{pack.version} publicada · {pack.minecraftVersion} · {pack.loaderType}</p>
        </div>
      </header>

      <main className="flex-1 flex gap-6 p-6 max-w-7xl mx-auto w-full min-h-0">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="relative">
              <Button asChild className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold cursor-pointer">
                <span><UploadCloud className="mr-2 h-4 w-4" /> Añadir carpeta</span>
              </Button>
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) onFolderSelected(e.target.files);
                  e.target.value = "";
                }}
                disabled={publishing}
              />
            </label>
            <label className="relative">
              <Button asChild variant="outline" className="cursor-pointer">
                <span><FilePlus className="mr-2 h-4 w-4" /> Añadir archivos sueltos</span>
              </Button>
              <input
                type="file"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) onLooseFilesSelected(e.target.files);
                  e.target.value = "";
                }}
                disabled={publishing}
              />
            </label>
            <span className="text-[11px] text-muted-foreground">o arrastra archivos/carpetas aquí abajo</span>
          </div>

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
                    <button
                      key={`dir:${entry.name}`}
                      type="button"
                      onClick={() => setCurrentFolder([...currentFolder, entry.name])}
                      className="flex items-center gap-3 px-3 py-2 text-xs rounded-md w-full bg-card/50 hover:bg-card/80 transition-colors text-left"
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate flex-1 min-w-0 font-mono text-gray-100">{entry.name}/</span>
                      {entry.changeCount > 0 && (
                        <span className="text-[10px] font-semibold text-accent shrink-0">{entry.changeCount} cambio{entry.changeCount !== 1 ? "s" : ""}</span>
                      )}
                      <span className="opacity-50 shrink-0 font-mono">{entry.fileCount} archivo{entry.fileCount !== 1 ? "s" : ""}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
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
              <Label className="text-gray-200">Cambios</Label>
              <Textarea
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                className="bg-background/50 border-white/10 text-white min-h-24 resize-none"
                placeholder="Qué cambió en esta versión..."
                disabled={publishing}
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-white/5">
              <p>{stagedAdds.length} añadido{stagedAdds.length !== 1 ? "s" : ""}</p>
              <p>{stagedReplacements.size} reemplazado{stagedReplacements.size !== 1 ? "s" : ""}</p>
              <p>{removedPaths.size} eliminado{removedPaths.size !== 1 ? "s" : ""}</p>
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
                Añade, reemplaza o elimina algún archivo para poder publicar.
              </p>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
