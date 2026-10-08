import { useEffect, useRef, useState } from "react";
import { Cpu, ImagePlus, Info, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BannerCropDialog } from "@/components/image-cropper";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useModpacks } from "@/hooks/use-modpacks";
import { getInstalledModpacksMeta, readSettings, updateInstanceSettings } from "@/services/electron";
import { cn } from "@/lib/utils";
import type { Modpack } from "@/services/github";

const BANNER_ASPECT = 16 / 7;
const MIN_RAM = 1024;
const MAX_RAM = 16384;

const formatRam = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(/\.0$/, "")} GB` : `${mb} MB`);

/** "unchanged" until the player touches it, then the new data URL or null (removed). */
type ImageEdit = { kind: "unchanged" } | { kind: "set"; dataUrl: string } | { kind: "removed" };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Gestor de instancia → ⋮ → Configuración: banner, picture, name and the RAM
 * this instance gets. On a private instance all of it is editable. On an online
 * one the name and images belong to the creator and are locked (padlock instead
 * of the change buttons); only the RAM is the player's to set.
 */
export function InstanceSettingsDialog({ pack, open, onOpenChange }: { pack: Modpack; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isCustom = pack.source === "custom";
  // Online instance: name/banner/picture are the creator's, not editable here.
  const looksLocked = !isCustom;
  const [name, setName] = useState(pack.name);
  const [icon, setIcon] = useState<ImageEdit>({ kind: "unchanged" });
  const [banner, setBanner] = useState<ImageEdit>({ kind: "unchanged" });
  const [cropping, setCropping] = useState<{ target: "icon" | "banner"; src: string } | null>(null);
  const [globalRam, setGlobalRam] = useState(2048);
  const [customRam, setCustomRam] = useState(false);
  const [ram, setRam] = useState(4096);
  const [initialRam, setInitialRam] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(pack.name);
    setIcon({ kind: "unchanged" });
    setBanner({ kind: "unchanged" });
    readSettings().then((s) => setGlobalRam(Number(s.maxMemoryMb) >= 512 ? Number(s.maxMemoryMb) : 2048));
    getInstalledModpacksMeta().then((all) => {
      const meta = all[pack.id] ?? {};
      const own = Number(meta.maxMemoryMb) >= 512 ? Number(meta.maxMemoryMb) : null;
      setInitialRam(own);
      setCustomRam(own !== null);
      if (own !== null) setRam(own);
    });
  }, [open, pack.id, pack.name]);

  // Starting the custom value from the global one is the least surprising.
  const toggleCustomRam = (on: boolean) => {
    setCustomRam(on);
    if (on && initialRam === null) setRam(Math.min(MAX_RAM, Math.max(MIN_RAM, globalRam)));
  };

  const pickFile = async (target: "icon" | "banner", file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("La imagen pesa demasiado (máximo 15 MB).");
      return;
    }
    setCropping({ target, src: await readFileAsDataUrl(file) });
  };

  const shownIcon = icon.kind === "set" ? icon.dataUrl : icon.kind === "removed" ? "" : pack.imageUrl;
  const shownBanner = banner.kind === "set" ? banner.dataUrl : banner.kind === "removed" ? "" : pack.bannerUrl;
  const ramChanged = customRam ? ram !== initialRam : initialRam !== null;
  const dirty = name.trim() !== pack.name || icon.kind !== "unchanged" || banner.kind !== "unchanged" || ramChanged;

  const refresh = async () => {
    if (isCustom) await useCustomInstances.getState().loadInstances();
    else await useModpacks.getState().loadModpacks();
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("El nombre no puede estar vacío.");
      return;
    }
    setSaving(true);
    try {
      await updateInstanceSettings({
        id: pack.id,
        ...(name.trim() !== pack.name ? { name: name.trim() } : {}),
        ...(icon.kind !== "unchanged" ? { iconDataUrl: icon.kind === "set" ? icon.dataUrl : null } : {}),
        ...(banner.kind !== "unchanged" ? { bannerDataUrl: banner.kind === "set" ? banner.dataUrl : null } : {}),
        ...(ramChanged ? { maxMemoryMb: customRam ? ram : null } : {}),
      });
      await refresh();
      toast.success("Configuración guardada.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
        <DialogContent className="bg-card border-white/10 text-foreground max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-4 pb-3">
            <DialogTitle className="text-white">Configuración de la instancia</DialogTitle>
            <DialogDescription className="text-xs">
              {isCustom
                ? "Cambia cómo se ve esta instancia y cuánta memoria usa."
                : "El nombre y las imágenes de una instancia online los decide su creador. Aquí puedes ajustar la memoria."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 pb-4 space-y-5 max-h-[68vh] overflow-y-auto">
            {/* Banner with the picture over it, like the instance header. */}
            <div className="space-y-2">
              {looksLocked ? (
              <div className="relative">
                <div
                  className="relative block w-full overflow-hidden rounded-xl border border-white/10 bg-black/30"
                  style={{ aspectRatio: String(BANNER_ASPECT) }}
                >
                  {shownBanner ? (
                    <img src={shownBanner} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Sin banner</span>
                  )}
                  <span
                    className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white/90"
                    title="El banner lo decide el creador de la instancia"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="absolute -bottom-6 left-4 h-20 w-20 overflow-hidden rounded-xl border-2 border-card bg-black/60 shadow-xl">
                  {shownIcon ? (
                    <img src={shownIcon} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-black text-accent/60">
                      {pack.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span
                    className="absolute bottom-1 right-1 h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white/90"
                    title="La foto la decide el creador de la instancia"
                  >
                    <Lock className="h-3 w-3" />
                  </span>
                </div>
              </div>
              ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => bannerInput.current?.click()}
                  className="group relative block w-full overflow-hidden rounded-xl border border-white/10 bg-black/30"
                  style={{ aspectRatio: String(BANNER_ASPECT) }}
                  title="Cambiar banner"
                >
                  {shownBanner ? (
                    <img src={shownBanner} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Sin banner</span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImagePlus className="h-4 w-4" /> Cambiar banner
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => iconInput.current?.click()}
                  className="group absolute -bottom-6 left-4 h-20 w-20 overflow-hidden rounded-xl border-2 border-card bg-black/60 shadow-xl"
                  title="Cambiar foto"
                >
                  {shownIcon ? (
                    <img src={shownIcon} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-black text-accent/60">
                      {(name || pack.name).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImagePlus className="h-5 w-5 text-white" />
                  </span>
                </button>
              </div>
              )}
              <div className="flex justify-end gap-1.5 pt-1 min-h-7">
                {!looksLocked && (
                <>
                {shownIcon && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setIcon({ kind: "removed" })}>
                    <Trash2 className="mr-1 h-3 w-3" /> Quitar foto
                  </Button>
                )}
                {shownBanner && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setBanner({ kind: "removed" })}>
                    <Trash2 className="mr-1 h-3 w-3" /> Quitar banner
                  </Button>
                )}
                </>
                )}
              </div>
              <input ref={iconInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { pickFile("icon", e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { pickFile("banner", e.target.files?.[0]); e.target.value = ""; }} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-200 flex items-center gap-1.5">
                Nombre
                {looksLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                disabled={looksLocked}
                title={looksLocked ? "El nombre lo decide el creador de la instancia" : undefined}
                className="bg-background/50 border-white/10"
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Cpu className="h-4 w-4 text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100">Memoria RAM propia</p>
                  <p className="text-[11px] text-muted-foreground">
                    {customRam ? "Esta instancia usa su propia cantidad." : `Usa la de Ajustes (${formatRam(globalRam)}).`}
                  </p>
                </div>
                <Switch checked={customRam} onCheckedChange={toggleCustomRam} />
              </div>
              <div className={cn("space-y-2 transition-opacity", !customRam && "opacity-40 pointer-events-none")}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Memoria máxima</span>
                  <span className="font-bold text-accent tabular-nums">{formatRam(ram)}</span>
                </div>
                <Slider min={MIN_RAM} max={MAX_RAM} step={512} value={[ram]} onValueChange={([v]) => setRam(v)} />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{formatRam(MIN_RAM)}</span>
                  <span>{formatRam(MAX_RAM)}</span>
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                Se aplica la próxima vez que abras el juego.
              </p>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2">
            <Button variant="outline" className="ml-auto border-white/10" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !dirty} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BannerCropDialog
        src={cropping?.src ?? null}
        aspect={cropping?.target === "icon" ? 1 : BANNER_ASPECT}
        title={cropping?.target === "icon" ? "Encuadrar la foto" : "Encuadrar el banner"}
        exportWidth={cropping?.target === "icon" ? 256 : 1600}
        format={cropping?.target === "icon" ? "png" : "jpeg"}
        onOpenChange={(o) => !o && setCropping(null)}
        onApply={(dataUrl) => {
          if (cropping?.target === "icon") setIcon({ kind: "set", dataUrl });
          else setBanner({ kind: "set", dataUrl });
          setCropping(null);
        }}
      />
    </>
  );
}
