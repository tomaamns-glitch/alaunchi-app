import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Package, Plus, Trash, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { VersionCombobox, type VersionOption } from "@/components/version-combobox";
import { LoaderIcon } from "@/components/loader-icon";
import { listMinecraftVersions } from "@/services/electron";
import { formatBytes } from "@/lib/format";
import {
  LIBRARY_LOADERS,
  LIBRARY_LOADER_LABELS,
  buildKey,
  createLibraryMod,
  deleteLibraryBuild,
  deleteLibraryMod,
  imageFileToIconDataUrl,
  updateLibraryBuildVersion,
  updateLibraryModInfo,
  uploadLibraryBuild,
  type LibraryLoader,
  type LibraryMod,
} from "@/services/mod-library";

interface ModLibraryEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The mod being edited (kept live by the caller's subscription), or null to create one. */
  mod: LibraryMod | null;
  author: string;
  /** Called with the new id once a mod is created, so the caller can switch to editing it. */
  onCreated: (id: string) => void;
}

/** Create/edit a library mod: picture, name, description, details, and one jar
 *  per Minecraft version × loader. Info is saved with "Guardar"; jars upload as
 *  soon as they're picked. A new mod has to be created (info first) before jars
 *  can be added — the builds hang off its id. */
export function ModLibraryEditorDialog({ open, onOpenChange, mod, author, onCreated }: ModLibraryEditorDialogProps) {
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const [icon, setIcon] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset the form when the dialog opens or switches to another mod — but not on
  // every live update of the same mod (that would wipe unsaved edits).
  const loadedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!open) {
      loadedFor.current = undefined;
      return;
    }
    const key = mod?.id ?? null;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setIcon(mod?.icon ?? "");
    setName(mod?.name ?? "");
    setDescription(mod?.description ?? "");
    setDetails(mod?.details ?? "");
  }, [open, mod]);

  const dirty =
    !mod || icon !== mod.icon || name !== mod.name || description !== mod.description || details !== mod.details;

  const handleIconPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setIcon(await imageFileToIconDataUrl(file));
    } catch (err: any) {
      toast.error(err?.message || "No se pudo procesar la imagen.");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const info = { icon, name: name.trim(), description: description.trim(), details: details.trim() };
    try {
      if (mod) {
        await updateLibraryModInfo(mod.id, info);
        toast.success("Cambios guardados.");
      } else {
        const id = await createLibraryMod(info, author);
        toast.success(`${info.name} creado. Ahora sube sus versiones.`);
        onCreated(id);
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!mod) return;
    setDeleting(true);
    try {
      await deleteLibraryMod(mod);
      toast.success(`${mod.name} eliminado de la biblioteca.`);
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo eliminar.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mod ? `Editar ${mod.name}` : "Subir mod"}</DialogTitle>
            <DialogDescription>
              {mod
                ? "Edita la información o sube el mod para más versiones de Minecraft y loaders."
                : "Primero la información del mod; después podrás subirlo para cada versión y loader."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4">
            <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconPick} />
            <button
              type="button"
              onClick={() => iconInputRef.current?.click()}
              className="group relative h-24 w-24 shrink-0 rounded-lg border border-dashed border-white/20 bg-black/30 overflow-hidden flex items-center justify-center hover:border-white/40 transition-colors"
              aria-label="Elegir foto del mod"
            >
              {icon ? (
                <img src={icon} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                  Foto
                </span>
              )}
            </button>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lib-name">Nombre</Label>
                <Input id="lib-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi mod" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lib-desc">Descripción</Label>
                <Input
                  id="lib-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Una línea que resuma qué hace"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lib-details">Detalles</Label>
            <Textarea
              id="lib-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Qué añade, cómo se usa, comandos, compatibilidades… (admite Markdown)"
            />
          </div>

          {mod && <BuildsEditor mod={mod} />}

          <DialogFooter className="gap-2 sm:justify-between">
            {mod ? (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash className="mr-2 h-4 w-4" /> Eliminar mod
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button onClick={handleSave} disabled={!name.trim() || saving || !dirty}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mod ? "Guardar" : "Crear"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {mod?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Desaparece de la biblioteca para todos. Quien ya lo tenga instalado en una instancia lo conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Newest Minecraft version first, using the order of Mojang's release list when
 *  it's loaded (string order would put 1.9 above 1.21). */
function sortMcVersions(versions: string[], order: string[]): string[] {
  const rank = new Map(order.map((v, i) => [v, i]));
  return [...versions].sort((a, b) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1) || b.localeCompare(a));
}

function BuildsEditor({ mod }: { mod: LibraryMod }) {
  const [mcOptions, setMcOptions] = useState<VersionOption[]>([]);
  const [mcLoading, setMcLoading] = useState(false);
  // Versions added in this session that don't have a jar yet (nothing to store until one is uploaded).
  const [pendingVersions, setPendingVersions] = useState<string[]>([]);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [versionToRemove, setVersionToRemove] = useState<string | null>(null);

  useEffect(() => {
    setMcLoading(true);
    listMinecraftVersions()
      .then((versions) => setMcOptions(versions.map((v) => ({ value: v.id, label: v.id }))))
      .catch(() => toast.error("No se pudo cargar la lista de versiones de Minecraft."))
      .finally(() => setMcLoading(false));
  }, []);

  const versions = useMemo(() => {
    const fromBuilds = Object.values(mod.builds).map((b) => b.mcVersion);
    return sortMcVersions(
      Array.from(new Set([...fromBuilds, ...pendingVersions])),
      mcOptions.map((o) => o.value)
    );
  }, [mod.builds, pendingVersions, mcOptions]);

  const addVersion = (v: string) => {
    setNewVersion(null);
    if (!versions.includes(v)) setPendingVersions((prev) => [...prev, v]);
  };

  const removeVersion = async (v: string) => {
    setVersionToRemove(null);
    setPendingVersions((prev) => prev.filter((p) => p !== v));
    try {
      for (const loader of LIBRARY_LOADERS) {
        const key = buildKey(v, loader);
        if (mod.builds[key]) await deleteLibraryBuild(mod.id, key);
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo quitar la versión.");
    }
  };

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Versiones de Minecraft</Label>
          <VersionCombobox
            value={newVersion}
            onChange={addVersion}
            options={mcOptions.filter((o) => !versions.includes(o.value))}
            loading={mcLoading}
            placeholder="Añadir versión de Minecraft…"
          />
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/10 py-6 flex flex-col items-center gap-1 text-muted-foreground">
          <Package className="h-5 w-5 opacity-60" />
          <p className="text-xs">Añade una versión de Minecraft para subir el mod.</p>
        </div>
      ) : (
        versions.map((v) => (
          <div key={v} className="rounded-md border border-white/10 bg-card/40">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-sm font-semibold">Minecraft {v}</span>
              <button
                type="button"
                onClick={() => setVersionToRemove(v)}
                className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                title="Quitar esta versión"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col divide-y divide-white/5">
              {LIBRARY_LOADERS.map((loader) => (
                <BuildSlot key={loader} mod={mod} mcVersion={v} loader={loader} />
              ))}
            </div>
          </div>
        ))
      )}

      <AlertDialog open={!!versionToRemove} onOpenChange={(o) => !o && setVersionToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar Minecraft {versionToRemove}?</AlertDialogTitle>
            <AlertDialogDescription>Se quitan de la biblioteca los archivos subidos para esa versión (todos los loaders).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => versionToRemove && void removeVersion(versionToRemove)}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BuildSlot({ mod, mcVersion, loader }: { mod: LibraryMod; mcVersion: string; loader: LibraryLoader }) {
  const key = buildKey(mcVersion, loader);
  const build = mod.builds[key];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [modVersion, setModVersion] = useState(build?.modVersion ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setModVersion(build?.modVersion ?? "");
  }, [build?.modVersion]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await uploadLibraryBuild(mod.id, file, mcVersion, loader, modVersion);
      toast.success(`${file.name} subido para ${mcVersion} · ${LIBRARY_LOADER_LABELS[loader]}.`);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const saveVersion = async () => {
    if (!build || modVersion.trim() === build.modVersion) return;
    try {
      await updateLibraryBuildVersion(mod.id, key, modVersion);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo guardar la versión.");
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await deleteLibraryBuild(mod.id, key);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo quitar el archivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <input ref={fileRef} type="file" accept=".jar" className="hidden" onChange={handleFile} />
      <div className="flex items-center gap-1.5 w-24 shrink-0 text-xs font-medium">
        <LoaderIcon loader={loader} className="h-3.5 w-3.5" />
        {LIBRARY_LOADER_LABELS[loader]}
      </div>
      <div className="flex-1 min-w-0">
        {build ? (
          <>
            <p className="text-xs font-mono truncate" title={build.fileName}>
              {build.fileName}
            </p>
            <p className="text-[10px] text-muted-foreground">{formatBytes(build.size)}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Sin subir</p>
        )}
      </div>
      <Input
        value={modVersion}
        onChange={(e) => setModVersion(e.target.value)}
        onBlur={saveVersion}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Versión"
        className="h-7 w-24 text-xs"
        title="Versión del mod (opcional)"
      />
      <Button size="sm" variant={build ? "outline" : "default"} className="h-7 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : build ? (
          <Upload className="mr-1 h-3.5 w-3.5" />
        ) : (
          <Plus className="mr-1 h-3.5 w-3.5" />
        )}
        {build ? "Reemplazar" : "Subir .jar"}
      </Button>
      {build && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          title="Quitar este archivo"
          className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
