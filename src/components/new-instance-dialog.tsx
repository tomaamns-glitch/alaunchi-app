import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import instanceVanillaIcon from "@/assets/instance-vanilla.png";
import instanceModdedIcon from "@/assets/instance-modded.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VersionCombobox, VersionOption } from "@/components/version-combobox";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import {
  listMinecraftVersions,
  listForgeVersions,
  listNeoforgeVersions,
  listFabricVersions,
} from "@/services/electron";

type LoaderType = "vanilla" | "forge" | "neoforge" | "fabric";

const LOADER_LABELS: Record<LoaderType, string> = {
  vanilla: "Vanilla",
  forge: "Forge",
  neoforge: "NeoForge",
  fabric: "Fabric",
};

const ICON_SIZE = 192;

// Default cover for a new instance when the user doesn't pick one — one look for
// vanilla, another for anything with a modloader.
const DEFAULT_ICONS: Record<LoaderType, string> = {
  vanilla: instanceVanillaIcon,
  forge: instanceModdedIcon,
  neoforge: instanceModdedIcon,
  fabric: instanceModdedIcon,
};

function drawSquareIcon(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
  return canvas.toDataURL("image/png");
}

/** Crops to a centered square and downscales — keeps alaunchi-meta.json (which
 *  embeds this as a data URL, same as every other instance field) small. */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen no válida."));
      img.onload = () => {
        try {
          resolve(drawSquareIcon(img));
        } catch (err) {
          reject(err);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Same square-crop pipeline for a bundled default image (referenced by URL). */
function urlToIconDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("No se pudo cargar la imagen por defecto."));
    img.onload = () => {
      try {
        resolve(drawSquareIcon(img));
      } catch (err) {
        reject(err);
      }
    };
    img.src = url;
  });
}

const BANNER_W = 1024;
const BANNER_H = 384;

/** Center-crops to a wide banner and re-encodes as JPEG — banners are photos/
 *  art, so the lossy pass keeps alaunchi-meta.json far smaller than a PNG would. */
function resizeBannerToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen no válida."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = BANNER_W;
        canvas.height = BANNER_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
        const targetRatio = BANNER_W / BANNER_H;
        const srcRatio = img.width / img.height;
        let sw = img.width;
        let sh = img.height;
        if (srcRatio > targetRatio) sw = img.height * targetRatio;
        else sh = img.width / targetRatio;
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, BANNER_W, BANNER_H);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface NewInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function NewInstanceDialog({ open, onOpenChange, onCreated }: NewInstanceDialogProps) {
  const { createInstance } = useCustomInstances();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [loaderType, setLoaderType] = useState<LoaderType>("vanilla");
  const [mcVersion, setMcVersion] = useState<string | null>(null);
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [mcVersions, setMcVersions] = useState<VersionOption[]>([]);
  const [mcVersionsLoading, setMcVersionsLoading] = useState(false);
  const [loaderVersions, setLoaderVersions] = useState<VersionOption[]>([]);
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);

  const resetForm = () => {
    setName("");
    setIcon(null);
    setBanner(null);
    setLoaderType("vanilla");
    setMcVersion(null);
    setLoaderVersion(null);
  };

  // Minecraft's release list barely changes and is the same regardless of loader,
  // so it's fetched once per time the dialog opens rather than per field change.
  useEffect(() => {
    if (!open) return;
    setMcVersionsLoading(true);
    listMinecraftVersions()
      .then((versions) => setMcVersions(versions.map((v) => ({ value: v.id, label: v.id }))))
      .catch(() => toast.error("No se pudo cargar la lista de versiones de Minecraft."))
      .finally(() => setMcVersionsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  // Loader build list depends on both the loader and the chosen MC version —
  // refetch whenever either changes, and drop any build picked for a stale pairing.
  useEffect(() => {
    setLoaderVersion(null);
    setLoaderVersions([]);
    if (loaderType === "vanilla" || !mcVersion) return;

    let cancelled = false;
    setLoaderVersionsLoading(true);
    const load = async () => {
      if (loaderType === "forge") {
        const versions = await listForgeVersions(mcVersion);
        return versions.map((v): VersionOption => ({
          value: v.version,
          label: v.version,
          badge: v.recommended ? "Recomendada" : v.latest ? "Última" : undefined,
        }));
      }
      if (loaderType === "neoforge") {
        const versions = await listNeoforgeVersions(mcVersion);
        return versions.map((v): VersionOption => ({ value: v.version, label: v.version }));
      }
      const versions = await listFabricVersions(mcVersion);
      return versions.map((v): VersionOption => ({
        value: v.version,
        label: v.version,
        badge: v.stable ? undefined : "Beta",
      }));
    };

    load()
      .then((options) => {
        if (!cancelled) setLoaderVersions(options);
      })
      .catch(() => {
        if (!cancelled) toast.error(`No se pudo cargar la lista de versiones de ${LOADER_LABELS[loaderType]}.`);
      })
      .finally(() => {
        if (!cancelled) setLoaderVersionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loaderType, mcVersion]);

  const handleIconPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setIcon(await resizeImageToDataUrl(file));
    } catch (err: any) {
      toast.error(err?.message || "No se pudo procesar la imagen.");
    }
  };

  const handleBannerPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBanner(await resizeBannerToDataUrl(file));
    } catch (err: any) {
      toast.error(err?.message || "No se pudo procesar la imagen.");
    }
  };

  const needsLoaderVersion = loaderType !== "vanilla";
  const canSubmit = name.trim().length > 0 && !!mcVersion && (!needsLoaderVersion || !!loaderVersion) && !creating;

  const handleSubmit = async () => {
    if (!canSubmit || !mcVersion) return;
    setCreating(true);
    try {
      const iconDataUrl = icon ?? (await urlToIconDataUrl(DEFAULT_ICONS[loaderType]).catch(() => undefined));
      const instance = await createInstance({
        name: name.trim(),
        loaderType,
        minecraftVersion: mcVersion,
        loaderVersion: needsLoaderVersion ? loaderVersion ?? undefined : undefined,
        iconDataUrl,
        bannerDataUrl: banner ?? undefined,
      });
      toast.success(`${instance.name} creada.`);
      onOpenChange(false);
      onCreated(instance.id);
    } catch (err: any) {
      toast.error(err?.message || "No se pudo crear la instancia.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva instancia</DialogTitle>
          <DialogDescription>Crea una instancia local, como en cualquier launcher.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconPick} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-16 w-16 shrink-0 rounded-md border border-white/10 bg-black/40 overflow-hidden hover:border-accent/50 transition-colors"
              aria-label="Elegir icono"
            >
              <img src={icon ?? DEFAULT_ICONS[loaderType]} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="h-4 w-4 text-white" />
              </span>
            </button>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="instance-name">Nombre</Label>
              <Input
                id="instance-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi instancia"
                maxLength={60}
              />
            </div>
            {icon && (
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setIcon(null)} aria-label="Quitar icono">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Banner (opcional)</Label>
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} />
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="group relative w-full h-24 rounded-md border border-white/10 bg-black/40 overflow-hidden hover:border-accent/50 transition-colors flex items-center justify-center text-xs text-muted-foreground"
            >
              {banner ? (
                <>
                  <img src={banner} alt="" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="h-4 w-4 text-white" />
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1.5">
                  <ImagePlus className="h-4 w-4" />
                  Elegir banner
                </span>
              )}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Sin banner, se usa un degradado del color del icono al entrar en la instancia.
            </p>
            {banner && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setBanner(null)}>
                <X className="mr-1 h-3.5 w-3.5" />
                Quitar banner
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Modloader</Label>
            <ToggleGroup
              type="single"
              value={loaderType}
              onValueChange={(v) => v && setLoaderType(v as LoaderType)}
              className="justify-start flex-wrap"
            >
              {(Object.keys(LOADER_LABELS) as LoaderType[]).map((lt) => (
                <ToggleGroupItem key={lt} value={lt} className="px-4">
                  {LOADER_LABELS[lt]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Versión de Minecraft</Label>
            <VersionCombobox
              value={mcVersion}
              onChange={setMcVersion}
              options={mcVersions}
              loading={mcVersionsLoading}
              placeholder="Elige una versión"
            />
          </div>

          {needsLoaderVersion && (
            <div className="space-y-1.5">
              <Label>Versión de {LOADER_LABELS[loaderType]}</Label>
              <VersionCombobox
                value={loaderVersion}
                onChange={setLoaderVersion}
                options={loaderVersions}
                loading={loaderVersionsLoading}
                disabled={!mcVersion}
                placeholder={mcVersion ? "Elige una versión" : "Elige antes la versión de Minecraft"}
                emptyText="No hay builds para esta versión de Minecraft."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear instancia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
