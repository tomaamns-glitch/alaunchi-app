import { useEffect, useState } from "react";
import {
  ArrowUp,
  Download,
  File as FileIcon,
  FolderOpen,
  FolderPlus,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Server as ServerIcon,
  Trash2,
  Unplug,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  connectServer,
  createServerDirectory,
  deleteServer,
  deleteServerDirectory,
  deleteServerFile,
  disconnectServer,
  downloadServerFile,
  isTextFile,
  joinRemotePath,
  listServerDirectory,
  listServers,
  parentPath,
  readServerTextFile,
  renameServerPath,
  uploadServerFile,
  writeServerTextFile,
  type ServerEntry,
  type ServerFileEntry,
} from "@/services/servers";
import { NewServerDialog } from "@/components/new-server-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Single-input dialog reused for both "Nueva carpeta" and "Renombrar". */
function PromptDialog({
  open,
  title,
  initialValue,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  initialValue: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const confirm = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirm()} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={!value.trim()}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Servers() {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<ServerFileEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerEntry | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ServerFileEntry | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<ServerFileEntry | null>(null);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [editingFileLoading, setEditingFileLoading] = useState(false);
  const [editingFileSaving, setEditingFileSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const selectedServer = servers.find((s) => s.id === selectedId) ?? null;

  const refreshServers = () => listServers().then(setServers).catch(() => {});
  useEffect(() => {
    refreshServers();
  }, []);

  const loadDirectory = async (id: string, remotePath: string) => {
    setLoadingEntries(true);
    try {
      const list = await listServerDirectory(id, remotePath);
      setEntries(list);
      setCurrentPath(remotePath);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo listar la carpeta.");
    } finally {
      setLoadingEntries(false);
    }
  };

  const handleSelectServer = async (server: ServerEntry) => {
    setSelectedId(server.id);
    if (connectedId === server.id) return;
    if (connectedId) await disconnectServer(connectedId).catch(() => {});
    setConnectedId(null);
    setEntries([]);
    setConnecting(true);
    try {
      await connectServer(server.id);
      setConnectedId(server.id);
      await loadDirectory(server.id, server.rootPath || "/");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo conectar.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    await disconnectServer(id).catch(() => {});
    if (connectedId === id) {
      setConnectedId(null);
      setEntries([]);
    }
  };

  const handleDeleteServer = async () => {
    if (!deleteTarget) return;
    try {
      await deleteServer(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setConnectedId(null);
        setEntries([]);
      }
      await refreshServers();
      toast.success("Servidor eliminado.");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleEntryClick = async (entry: ServerFileEntry) => {
    if (!connectedId) return;
    const path = joinRemotePath(currentPath, entry.name);
    if (entry.type === "dir") {
      await loadDirectory(connectedId, path);
      return;
    }
    if (isTextFile(entry.name)) {
      setEditingFile({ path, content: "" });
      setEditingFileLoading(true);
      try {
        const content = await readServerTextFile(connectedId, path);
        setEditingFile({ path, content });
      } catch (e: any) {
        toast.error(e?.message || "No se pudo abrir el archivo.");
        setEditingFile(null);
      } finally {
        setEditingFileLoading(false);
      }
    }
  };

  const handleDownload = async (entry: ServerFileEntry) => {
    if (!connectedId) return;
    const path = joinRemotePath(currentPath, entry.name);
    try {
      const saved = await downloadServerFile(connectedId, path);
      if (saved) toast.success(`${entry.name} descargado.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo descargar.");
    }
  };

  const handleUpload = async () => {
    if (!connectedId) return;
    try {
      const name = await uploadServerFile(connectedId, currentPath);
      if (name) {
        toast.success(`${name} subido.`);
        await loadDirectory(connectedId, currentPath);
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo subir el archivo.");
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!connectedId) return;
    setBusyAction(true);
    try {
      await createServerDirectory(connectedId, joinRemotePath(currentPath, name));
      await loadDirectory(connectedId, currentPath);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo crear la carpeta.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleRename = async (newName: string) => {
    if (!connectedId || !renameTarget) return;
    setBusyAction(true);
    try {
      await renameServerPath(connectedId, joinRemotePath(currentPath, renameTarget.name), joinRemotePath(currentPath, newName));
      await loadDirectory(connectedId, currentPath);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo renombrar.");
    } finally {
      setBusyAction(false);
      setRenameTarget(null);
    }
  };

  const handleDeleteEntry = async () => {
    if (!connectedId || !deleteEntryTarget) return;
    const path = joinRemotePath(currentPath, deleteEntryTarget.name);
    setBusyAction(true);
    try {
      if (deleteEntryTarget.type === "dir") await deleteServerDirectory(connectedId, path);
      else await deleteServerFile(connectedId, path);
      await loadDirectory(connectedId, currentPath);
      toast.success(`${deleteEntryTarget.name} eliminado.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar.");
    } finally {
      setBusyAction(false);
      setDeleteEntryTarget(null);
    }
  };

  const handleSaveFile = async () => {
    if (!connectedId || !editingFile) return;
    setEditingFileSaving(true);
    try {
      await writeServerTextFile(connectedId, editingFile.path, editingFile.content);
      toast.success("Archivo guardado.");
      setEditingFile(null);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar.");
    } finally {
      setEditingFileSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl w-full mx-auto flex gap-6" style={{ minHeight: "70vh" }}>
          <aside className="w-64 shrink-0 rounded-xl border border-white/10 bg-card/40 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 pb-1">
              <h1 className="text-sm font-bold flex items-center gap-1.5">
                <ServerIcon className="h-4 w-4 text-accent" />
                Servidores
              </h1>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setEditingServer(null);
                  setDialogOpen(true);
                }}
                aria-label="Nuevo servidor"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {servers.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-4 text-center">
                Sin servidores todavía. Añade uno con el botón +.
              </p>
            ) : (
              <div className="space-y-1">
                {servers.map((server) => {
                  const isSelected = selectedId === server.id;
                  const isConnected = connectedId === server.id;
                  return (
                    <div
                      key={server.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectServer(server)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelectServer(server)}
                      className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors ${
                        isSelected ? "bg-accent/15" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <ServerIcon className={`h-4 w-4 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                        {isConnected && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-green-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{server.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{server.host}</div>
                      </div>
                      <Badge variant="secondary" className="text-[9px] shrink-0 uppercase">
                        {server.protocol}
                      </Badge>
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
                          {isConnected ? (
                            <DropdownMenuItem onClick={() => handleDisconnect(server.id)}>
                              <Unplug className="mr-2 h-3.5 w-3.5" />
                              Desconectar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleSelectServer(server)}>
                              <Plug className="mr-2 h-3.5 w-3.5" />
                              Conectar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingServer(server);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(server)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-card/40 flex flex-col overflow-hidden">
            {!selectedServer ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <ServerIcon className="h-8 w-8" />
                <p className="text-sm">Elige un servidor de la lista, o añade uno nuevo.</p>
              </div>
            ) : connecting ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Conectando con {selectedServer.name}...</p>
              </div>
            ) : connectedId !== selectedServer.id ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Lock className="h-8 w-8" />
                <p className="text-sm">No se pudo mantener la conexión.</p>
                <Button size="sm" variant="outline" onClick={() => handleSelectServer(selectedServer)}>
                  <Plug className="mr-1.5 h-3.5 w-3.5" />
                  Reintentar
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-white/10 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={currentPath === "/"}
                    onClick={() => loadDirectory(connectedId, parentPath(currentPath))}
                    aria-label="Subir un nivel"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <code className="flex-1 min-w-0 truncate text-xs text-muted-foreground">{currentPath}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => loadDirectory(connectedId, currentPath)} aria-label="Refrescar">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setNewFolderOpen(true)}>
                    <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                    Carpeta
                  </Button>
                  <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleUpload}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Subir
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loadingEntries ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-16">Carpeta vacía.</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {entries.map((entry) => (
                        <div
                          key={entry.name}
                          className="group flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => handleEntryClick(entry)}
                        >
                          {entry.type === "dir" ? (
                            <FolderOpen className="h-4 w-4 text-accent shrink-0" />
                          ) : (
                            <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="flex-1 min-w-0 truncate text-sm">{entry.name}</span>
                          {entry.type === "file" && (
                            <span className="text-[11px] text-muted-foreground shrink-0 w-16 text-right">{formatSize(entry.size)}</span>
                          )}
                          <span className="text-[11px] text-muted-foreground shrink-0 w-20 text-right">{formatDate(entry.modifiedAt)}</span>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {entry.type === "file" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(entry);
                                }}
                                aria-label="Descargar"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10"
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem onClick={() => setRenameTarget(entry)}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" />
                                  Renombrar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteEntryTarget(entry)}>
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <NewServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editingServer}
        onSaved={() => refreshServers()}
      />

      <PromptDialog
        open={newFolderOpen}
        title="Nueva carpeta"
        initialValue=""
        onOpenChange={setNewFolderOpen}
        onConfirm={handleCreateFolder}
      />
      <PromptDialog
        open={!!renameTarget}
        title="Renombrar"
        initialValue={renameTarget?.name ?? ""}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onConfirm={handleRename}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se olvida la conexión guardada (host, usuario, contraseña) — no borra nada del servidor en sí.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteServer}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEntryTarget} onOpenChange={(open) => !open && setDeleteEntryTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteEntryTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntryTarget?.type === "dir"
                ? "Se borra la carpeta y todo su contenido del servidor. No se puede deshacer."
                : "Se borra del servidor. No se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busyAction}
              onClick={handleDeleteEntry}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{editingFile?.path}</DialogTitle>
          </DialogHeader>
          {editingFileLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Textarea
              value={editingFile?.content ?? ""}
              onChange={(e) => setEditingFile((f) => (f ? { ...f, content: e.target.value } : f))}
              className="font-mono text-xs min-h-[24rem] resize-none"
              spellCheck={false}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFile(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFile} disabled={editingFileLoading || editingFileSaving}>
              {editingFileSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
