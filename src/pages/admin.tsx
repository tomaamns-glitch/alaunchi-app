import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash, Loader2 } from "lucide-react";
import { createModpack, deleteModpack, type NewModpackData } from "@/services/github";
import { getGithubRepo } from "@/lib/app-config";
import { useIsAdmin } from "@/hooks/use-is-admin";

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
  antiXray: false,
});

export default function Admin() {
  const { isAuthenticated } = useAuth();
  const isAdmin = useIsAdmin();
  const [, setLocation] = useLocation();
  const { modpacks, loadModpacks } = useModpacks();

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
      loadModpacks();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al eliminar el modpack");
    } finally {
      setDeleting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/5 bg-card/50 flex items-center px-6 sticky top-0 z-50 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-white">Panel de Administración</h1>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Modpacks</h2>
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
              <Card
                key={pack.id}
                className="bg-card/50 border-white/5 hover:bg-card/80 hover:border-white/10 transition-colors cursor-pointer"
                onClick={() => setLocation(`/admin/${pack.id}`)}
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <img
                      src={pack.imageUrl || "/logo.png"}
                      alt={pack.name}
                      className="h-14 w-14 object-cover rounded bg-black/50 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                    />
                    <div className="min-w-0">
                      <h3 className="font-bold text-white truncate">{pack.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {pack.minecraftVersion} · {pack.loaderType} · v{pack.version}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono opacity-60">id: {pack.id}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <span className="text-xs text-muted-foreground mr-2">
                      {pack.fileCount} archivos · {pack.totalSizeMb} MB
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); setPackToDelete({ id: pack.id, name: pack.name }); }}
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
      </main>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="bg-card border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Nuevo Modpack</DialogTitle>
            <DialogDescription>
              Crea una nueva entrada en el catálogo de GitHub. Después podrás abrirla para subir sus archivos.
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
