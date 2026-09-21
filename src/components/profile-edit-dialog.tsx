import { useEffect, useRef, useState } from "react";
import { Check, Globe, Loader2, Lock, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BannerCropDialog } from "@/components/image-cropper";
import { DEFAULT_PROFILE_BANNER, PRESET_BANNERS, uploadBanner } from "@/services/banner";
import {
  setProfileBannerRemembered,
  setProfileBio,
  setProfileVisibility,
  type ProfileVisibility,
} from "@/services/public-profile";

const BIO_MAX = 160;
// Roughly the shape of the banner strip behind the profile card, so the crop
// preview matches what actually shows.
const BANNER_ASPECT = 1600 / 300;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uuid: string;
  bio: string;
  bannerUrl: string | null;
  recentBanners: string[];
  visibility: ProfileVisibility;
  onChange: (patch: {
    bio?: string;
    bannerUrl?: string | null;
    recentBanners?: string[];
    visibility?: ProfileVisibility;
  }) => void;
}

function BannerThumb({
  url,
  selected,
  onSelect,
}: {
  url: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative aspect-[16/6] rounded-md overflow-hidden border-2 transition-colors ${
        selected ? "border-accent" : "border-transparent hover:border-white/30"
      }`}
    >
      <img src={url} alt="" className="h-full w-full object-cover" />
      {selected && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

export function ProfileEditDialog({
  open,
  onOpenChange,
  uuid,
  bio,
  bannerUrl,
  recentBanners,
  visibility,
  onChange,
}: ProfileEditDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftBio, setDraftBio] = useState(bio);
  const [savingBio, setSavingBio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    if (open) setDraftBio(bio);
  }, [open, bio]);

  const currentBanner = bannerUrl || DEFAULT_PROFILE_BANNER;
  const presetUrls = PRESET_BANNERS.map((p) => p.url);
  const extraRecent = recentBanners.filter((u) => !presetUrls.includes(u));

  const applyBanner = async (url: string, remember: boolean) => {
    onChange({ bannerUrl: url });
    try {
      const recent = await setProfileBannerRemembered(uuid, url, remember);
      if (remember) onChange({ recentBanners: recent });
    } catch {
      toast.error("No se pudo cambiar el banner.");
    }
  };

  const handlePick = async (file: File) => {
    try {
      setCropSrc(await readFileAsDataUrl(file));
    } catch {
      toast.error("No se pudo leer la imagen.");
    }
  };

  const handleCropped = async (dataUrl: string) => {
    setUploading(true);
    try {
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const url = await uploadBanner(uuid, base64, "image/jpeg");
      await applyBanner(url, true);
      setCropSrc(null);
      toast.success("Banner actualizado.");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo subir el banner.");
    } finally {
      setUploading(false);
    }
  };

  const saveBio = async () => {
    if (draftBio.trim() === bio.trim()) return;
    setSavingBio(true);
    try {
      await setProfileBio(uuid, draftBio);
      onChange({ bio: draftBio.trim() });
      toast.success("Biografía guardada.");
    } catch {
      toast.error("No se pudo guardar la biografía.");
    } finally {
      setSavingBio(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="bio">Biografía</Label>
            <Textarea
              id="bio"
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="Algo sobre ti — sale debajo de tu nombre."
              rows={2}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {draftBio.length}/{BIO_MAX}
              </span>
              <Button size="sm" variant="secondary" className="h-7" onClick={saveBio} disabled={savingBio || draftBio.trim() === bio.trim()}>
                {savingBio && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Guardar biografía
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Banner</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handlePick(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-3 gap-2">
              {PRESET_BANNERS.map((p) => (
                <BannerThumb key={p.id} url={p.url} selected={currentBanner === p.url} onSelect={() => applyBanner(p.url, false)} />
              ))}
              {extraRecent.map((url) => (
                <BannerThumb key={url} url={url} selected={currentBanner === url} onSelect={() => applyBanner(url, true)} />
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="aspect-[16/6] rounded-md border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground hover:border-accent/50 hover:text-white transition-colors disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Subir
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Presets de la app, tus últimos banners y la opción de subir uno nuevo.</p>
          </div>

          <div className="space-y-2">
            <Label>Quién puede ver tus instancias y favoritos</Label>
            <ToggleGroup
              type="single"
              value={visibility}
              onValueChange={(v) => {
                if (!v) return;
                const next = v as ProfileVisibility;
                onChange({ visibility: next });
                setProfileVisibility(uuid, next).catch(() => toast.error("No se pudo cambiar la visibilidad."));
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="everyone" className="h-8 px-3 text-xs gap-1.5 data-[state=on]:bg-accent/15 data-[state=on]:text-accent">
                <Globe className="h-3.5 w-3.5" />
                Todos
              </ToggleGroupItem>
              <ToggleGroupItem value="friends" className="h-8 px-3 text-xs gap-1.5 data-[state=on]:bg-accent/15 data-[state=on]:text-accent">
                <Lock className="h-3.5 w-3.5" />
                Solo amigos
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <BannerCropDialog
      src={cropSrc}
      aspect={BANNER_ASPECT}
      applying={uploading}
      onOpenChange={(o) => !o && setCropSrc(null)}
      onApply={handleCropped}
    />
    </>
  );
}
