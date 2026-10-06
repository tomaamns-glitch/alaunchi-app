import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useModpacks } from "@/hooks/use-modpacks";
import { Button } from "@/components/ui/button";
import { ImageUrlField } from "@/components/image-url-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderIcon } from "@/components/loader-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Package, Plus, Trash, Loader2 } from "lucide-react";
import { createModpack, deleteModpack, type NewModpackData } from "@/services/github";
import { getMySource, uniqueModpackId } from "@/lib/sources";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { createAccessCode } from "@/services/access-codes";

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
  const { isAuthenticated, uuid, username } = useAuth();
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
    const mine = getMySource();
    const token = mine?.adminToken ?? "";
    const repoUrl = mine?.repoUrl ?? "";
    const id = uniqueModpackId(newForm.id);
    setCreating(true);
    try {
      await createModpack(token, repoUrl, { ...newForm, id });
      toast.success(`Modpack "${newForm.name}" creado en GitHub`);
      // Best-effort — a Firebase hiccup here shouldn't undo the GitHub creation
      // that just succeeded. Worst case the pack is left without a code for now
      // (nobody else can reach it until one is generated in the Acceso tab).
      if (uuid) {
        try {
          await createAccessCode(repoUrl, id, uuid, mine?.readToken);
        } catch {
          toast.warning("No se pudo generar el código de acceso. Puedes crearlo luego desde la pestaña Acceso.");
        }
      }
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
    const token = getMySource()?.adminToken ?? "";
    const repoUrl = getMySource()?.repoUrl ?? "";
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
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-5 px-6 pt-6 pb-6 max-w-5xl mx-auto w-full">
          {/* Same glass header card as the Hub / Perfil */}
          <div className="relative shrink-0 rounded-xl border border-white/10 bg-card/40 p-5 overflow-hidden">
            <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLocation("/")}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Volver"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight">Panel de administración</h1>
                <p className="text-xs text-muted-foreground">
                  {modpacks.length} instancia{modpacks.length === 1 ? "" : "s"} online en tu repositorio
                </p>
              </div>
              <Button
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shrink-0"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo modpack
              </Button>
            </div>
          </div>

          {modpacks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Package className="h-7 w-7 opacity-60" />
              <p className="text-sm">No hay modpacks en tu repositorio.</p>
              <p className="text-xs">Crea el primero con "Nuevo modpack".</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {modpacks.map((pack) => (
                <div
                  key={pack.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLocation(`/admin/${pack.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && setLocation(`/admin/${pack.id}`)}
                  className="group relative rounded-xl border border-white/10 bg-card/40 hover:bg-card/60 hover:border-white/20 transition-colors cursor-pointer overflow-hidden"
                >
                  {(pack.bannerUrl || pack.imageUrl) && (
                    <div className="pointer-events-none absolute inset-0 opacity-15 group-hover:opacity-25 transition-opacity">
                      <img
                        src={pack.bannerUrl || pack.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/40" />
                    </div>
                  )}
                  <div className="relative flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <img
                        src={pack.imageUrl || "./logo.png"}
                        alt={pack.name}
                        className="h-14 w-14 object-cover rounded-lg bg-black/50 shrink-0 shadow-lg"
                        onError={(e) => { (e.target as HTMLImageElement).src = "./logo.png"; }}
                      />
                      <div className="min-w-0">
                        <h3 className="font-bold text-white truncate">{pack.name}</h3>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-gray-200">v{pack.version}</span>
                          <span className="opacity-40">·</span>
                          <span>{pack.minecraftVersion}</span>
                          <span className="opacity-40">·</span>
                          <span className="flex items-center gap-1 capitalize">
                            <LoaderIcon loader={pack.loaderType} className="h-3.5 w-3.5" />
                            {pack.loaderType}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-mono truncate">{pack.id}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center shrink-0">
                      <span className="text-xs text-muted-foreground mr-1 text-right">
                        {pack.fileCount} archivos
                        <br />
                        {pack.totalSizeMb} MB
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
                <Label>ID *</Label>
                <Input
                  value={newForm.id}
                  onChange={(e) => setNewForm({ ...newForm, id: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  className="bg-background/50 border-white/10 text-white font-mono"
                  placeholder="mi-modpack"
                  required
                />
                <p className="text-[11px] text-muted-foreground">Se le añade un sufijo único (p. ej. mi-modpack-k3f9).</p>
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
                <ImageUrlField
                  value={newForm.imageUrl}
                  onChange={(url) => setNewForm((f) => ({ ...f, imageUrl: url }))}
                  placeholder="https://... o /logo.png"
                />
                <p className="text-[11px] text-muted-foreground">Icono cuadrado — catálogo y detalle.</p>
              </div>
              <div className="space-y-1.5">
                <Label>URL de banner</Label>
                <ImageUrlField
                  value={newForm.bannerUrl}
                  onChange={(url) => setNewForm((f) => ({ ...f, bannerUrl: url }))}
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
