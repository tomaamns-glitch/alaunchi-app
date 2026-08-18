import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash, Loader2, FileText, CheckCircle2, UploadCloud, Folder } from "lucide-react";
import {
  createModpack,
  deleteModpack,
  publishSnapshot,
  shouldIncludeFile,
  type NewModpackData,
  type WalkedFile,
  type PublishProgress,
} from "@/services/github";
import { getGithubRepo } from "@/lib/app-config";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { formatBytes } from "@/lib/format";

const LOADERS = ["forge", "fabric", "neoforge", "vanilla"] as const;

const emptyForm = (): NewModpackData => ({
  id: "",
  name: "",
  description: "",
  minecraftVersion: "1.20.4",
  loaderType: "fabric",
  version: "1.0.0",
  imageUrl: "",
  bannerUrl: "",
});

function stripFolderPrefix(relPath: string): string {
  const idx = relPath.indexOf("/");
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

export default function Admin() {
  const { isAuthenticated } = useAuth();
  const isAdmin = useIsAdmin();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

  const [selectedModpack, setSelectedModpack] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [walkedFiles, setWalkedFiles] = useState<WalkedFile[]>([]);
  const [folderName, setFolderName] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newForm, setNewForm] = useState<NewModpackData>(emptyForm());
  const [creating, setCreating] = useState(false);

  const [packToDelete, setPackToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
    else if (!isAdmin) setLocation("/");
  }, [isAuthenticated, isAdmin, setLocation]);

  useEffect(() => {
    if (isAdmin && modpacks.length === 0) loadModpacks();
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedModpack) return;
    setWalkedFiles([]);
    setFolderName("");
    const pack = modpacks.find((p) => p.id === selectedModpack);
    if (pack) {
      const parts = pack.version.split(".").map((n) => parseInt(n, 10));
      const major = Number.isFinite(parts[0]) ? parts[0] : 1;
      const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
      const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
      setNewVersion(`${major}.${minor}.${patch + 1}`);
    }
  }, [selectedModpack]);

  const totalBytes = useMemo(
    () => walkedFiles.reduce((s, w) => s + w.file.size, 0),
    [walkedFiles]
  );

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
    const firstRel = (fileList[0] as any).webkitRelativePath as string;
    const root = firstRel ? firstRel.split("/")[0] : "";
    setFolderName(root);
    setWalkedFiles(walked);
  };

  const clearFolder = () => {
    setWalkedFiles([]);
    setFolderName("");
  };

  const handlePublish = async () => {
    if (!selectedModpack) return;
    if (walkedFiles.length === 0) {
      toast.error("Selecciona la carpeta del modpack antes de publicar.");
      return;
    }
    if (!newVersion.trim()) {
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
    setPublishing(true);
    setPublishProgress({ stage: "hashing", done: 0, total: walkedFiles.length });
    try {
      const result = await publishSnapshot(
        token,
        repoUrl,
        selectedModpack,
        walkedFiles,
        newVersion.trim(),
        (p) => setPublishProgress(p)
      );
      toast.success(
        `Publicado v${newVersion} · ${result.uploaded} subido${result.uploaded !== 1 ? "s" : ""} · ${result.reused} reutilizado${result.reused !== 1 ? "s" : ""} de GitHub`
      );
      setSelectedModpack("");
      setWalkedFiles([]);
      setFolderName("");
      setPublishProgress(null);
      loadModpacks();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al publicar");
    } finally {
      setPublishing(false);
      setPublishProgress(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.id || !newForm.name) { toast.error("ID y nombre son obligatorios"); return; }
    const token = localStorage.getItem("githubToken") ?? "";
    const repoUrl = getGithubRepo();
    setCreating(true);
    try {
      await createModpack(token, repoUrl, newForm);
      toast.success(`Modpack "${newForm.name}" creado en GitHub`);
      setShowNewDialog(false);
      setNewForm(emptyForm());
      loadModpacks();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al crear modpack");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteModpack = async () => {
    if (!packToDelete) return;
    const token = localStorage.getItem("githubToken") ?? "";
    const repoUrl = getGithubRepo();
    setDeleting(true);
    try {
      await deleteModpack(token, repoUrl, packToDelete.id);
      toast.success(`Modpack "${packToDelete.name}" eliminado de GitHub.`);
      setPackToDelete(null);
      if (selectedModpack === packToDelete.id) setSelectedModpack("");
      loadModpacks();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al eliminar el modpack");
    } finally {
      setDeleting(false);
    }
  };

  if (!isAdmin) return null;

  const stageLabel: Record<PublishProgress["stage"], string> = {
    hashing: "Calculando hashes (SHA-256)",
    uploading: "Subiendo objetos nuevos a GitHub",
    manifest: "Escribiendo manifiesto",
    done: "Completado",
  };

  const progressPct = publishProgress
    ? publishProgress.total > 0
      ? Math.round((publishProgress.done / publishProgress.total) * 100)
      : 0
    : 0;

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/5 bg-card/50 flex items-center px-6 sticky top-0 z-50 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-white">Panel de Administración</h1>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <Tabs defaultValue="modpacks" className="w-full">
          <TabsList className="bg-card border border-white/5 mb-8">
            <TabsTrigger value="modpacks" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
              Modpacks
            </TabsTrigger>
            <TabsTrigger value="update" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
              Publicar versión
            </TabsTrigger>
          </TabsList>

          <TabsContent value="modpacks">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Catálogo de Modpacks</h2>
              <Button
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo Modpack
              </Button>
            </div>

            {modpacks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                <p className="text-base">No hay modpacks en el repositorio.</p>
                <p className="text-sm">Configura tu repositorio en Ajustes y crea el primero.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {modpacks.map((pack) => (
                  <Card key={pack.id} className="bg-card/50 border-white/5">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={pack.imageUrl || "/logo.png"}
                          alt={pack.name}
                          className="h-14 w-14 object-cover rounded bg-black/50"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                        />
                        <div>
                          <h3 className="font-bold text-white">{pack.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {pack.minecraftVersion} · {pack.loaderType} · v{pack.version}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono opacity-60">id: {pack.id}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-muted-foreground mr-2">
                          {pack.fileCount} archivos · {pack.totalSizeMb} MB
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPackToDelete({ id: pack.id, name: pack.name })}
                          title="Eliminar modpack"
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="update">
            <Card className="bg-card/50 border-white/5">
              <CardHeader>
                <CardTitle className="text-white">Publicar Nueva Versión</CardTitle>
                <CardDescription>
                  Selecciona la carpeta completa del modpack (la que contiene <span className="font-mono text-accent">mods/</span>, <span className="font-mono text-accent">config/</span>, etc.). ALaunchi calcula el hash de cada archivo, sube a GitHub solo los nuevos y actualiza el manifiesto. Los clientes recibirán únicamente los cambios.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-200">Modpack</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
                      value={selectedModpack}
                      onChange={(e) => setSelectedModpack(e.target.value)}
                      disabled={publishing}
                    >
                      <option value="">Selecciona un modpack...</option>
                      {modpacks.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-200">Nueva versión</Label>
                    <Input
                      value={newVersion}
                      onChange={(e) => setNewVersion(e.target.value)}
                      className="bg-background/50 border-white/10 text-white"
                      placeholder="ej: 1.2.0"
                      disabled={publishing}
                    />
                  </div>
                </div>

                {selectedModpack && (
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    {walkedFiles.length === 0 ? (
                      <div className="relative bg-background/50 border border-white/5 border-dashed rounded-md p-8 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors">
                        <UploadCloud className="h-10 w-10 text-accent mb-3" />
                        <p className="text-base font-medium text-gray-100">Selecciona la carpeta del modpack</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-md">
                          La que contiene <span className="font-mono">mods/</span>, <span className="font-mono">config/</span>, <span className="font-mono">resourcepacks/</span>, etc. Tal cual está en tu <span className="font-mono">.minecraft/</span>.
                        </p>
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
                      </div>
                    ) : (
                      <div className="bg-background/50 border border-white/5 rounded-md p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white flex items-center gap-2">
                              <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                              <span className="truncate font-mono">{folderName || "(carpeta)"}</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {walkedFiles.length} archivo{walkedFiles.length !== 1 ? "s" : ""} · {formatBytes(totalBytes)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={clearFolder}
                            disabled={publishing}
                            className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                          >
                            cambiar
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto bg-black/30 rounded p-2 space-y-0.5">
                          {walkedFiles.slice(0, 50).map((w, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs font-mono text-gray-400">
                              <FileText className="h-3 w-3 shrink-0 opacity-50" />
                              <span className="truncate flex-1">{w.relativePath}</span>
                              <span className="opacity-50 shrink-0">{formatBytes(w.file.size)}</span>
                            </div>
                          ))}
                          {walkedFiles.length > 50 && (
                            <div className="text-xs text-muted-foreground text-center pt-1">
                              ... y {walkedFiles.length - 50} archivo{walkedFiles.length - 50 !== 1 ? "s" : ""} más
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {publishProgress && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs text-gray-200">
                      <span className="font-medium">{stageLabel[publishProgress.stage]}</span>
                      <span className="font-mono tabular-nums">
                        {publishProgress.stage === "uploading" && publishProgress.total === 0
                          ? "Nada que subir — todo reutilizado ✨"
                          : publishProgress.total > 0
                          ? `${publishProgress.done} / ${publishProgress.total}`
                          : ""}
                      </span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                    {publishProgress.currentFile && (
                      <p className="text-[11px] font-mono text-muted-foreground truncate">
                        {publishProgress.currentFile}
                      </p>
                    )}
                    {publishProgress.reusedFromGitHub !== undefined && publishProgress.reusedFromGitHub > 0 && (
                      <p className="text-[11px] text-accent">
                        {publishProgress.reusedFromGitHub} objeto{publishProgress.reusedFromGitHub !== 1 ? "s" : ""} ya existían en GitHub — no se vuelven a subir
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <Button
                    onClick={handlePublish}
                    disabled={publishing || !selectedModpack || walkedFiles.length === 0 || !newVersion.trim()}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8"
                  >
                    {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {publishing ? stageLabel[publishProgress?.stage ?? "hashing"] + "..." : "Publicar versión"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="bg-card border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Nuevo Modpack</DialogTitle>
            <DialogDescription>
              Crea una nueva entrada en el catálogo de GitHub.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ID único *</Label>
                <Input
                  value={newForm.id}
                  onChange={(e) => setNewForm({ ...newForm, id: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  className="bg-background/50 border-white/10 text-white font-mono"
                  placeholder="mi-modpack"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="Mi Modpack"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                value={newForm.description}
                onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                className="bg-background/50 border-white/10 text-white"
                placeholder="Descripción corta del modpack"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Versión MC</Label>
                <Input
                  value={newForm.minecraftVersion}
                  onChange={(e) => setNewForm({ ...newForm, minecraftVersion: e.target.value })}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="1.20.4"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Loader</Label>
                <select
                  value={newForm.loaderType}
                  onChange={(e) => setNewForm({ ...newForm, loaderType: e.target.value as any })}
                  className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {LOADERS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Versión inicial</Label>
                <Input
                  value={newForm.version}
                  onChange={(e) => setNewForm({ ...newForm, version: e.target.value })}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="1.0.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>URL de logo</Label>
                <Input
                  value={newForm.imageUrl}
                  onChange={(e) => setNewForm({ ...newForm, imageUrl: e.target.value })}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="https://... o /logo.png"
                />
                <p className="text-[11px] text-muted-foreground">Icono cuadrado — catálogo y detalle.</p>
              </div>
              <div className="space-y-1.5">
                <Label>URL de banner</Label>
                <Input
                  value={newForm.bannerUrl}
                  onChange={(e) => setNewForm({ ...newForm, bannerUrl: e.target.value })}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="https://... o /banner.png"
                />
                <p className="text-[11px] text-muted-foreground">Imagen ancha — pantalla principal.</p>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowNewDialog(false)}
                className="text-gray-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {creating ? "Creando..." : "Crear modpack"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!packToDelete} onOpenChange={(open) => { if (!open && !deleting) setPackToDelete(null); }}>
        <DialogContent className="bg-card border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash className="h-5 w-5 text-destructive" />
              Eliminar modpack
            </DialogTitle>
            <DialogDescription className="text-gray-400 pt-1">
              ¿Seguro que quieres eliminar <span className="text-white font-semibold">"{packToDelete?.name}"</span>?
              <br /><br />
              Esto borrará la entrada del catálogo y su manifiesto de GitHub. El Release con los objetos asociados <span className="text-amber-400">no se elimina</span> automáticamente. La instancia local instalada en los usuarios tampoco se toca.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button
              variant="ghost"
              onClick={() => setPackToDelete(null)}
              disabled={deleting}
              className="text-gray-400 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteModpack}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
