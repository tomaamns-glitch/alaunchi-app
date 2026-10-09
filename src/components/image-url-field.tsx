import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { uploadBanner } from "@/services/banner";
import { fileToBase64 } from "@/services/skin";

/** Discord attachment links carry an expiry (`ex=`) and stop working after
 *  about a day — players who already saw the image keep it from cache, but
 *  anyone new (a player who just got access) only gets a broken image. */
export function isExpiringImageUrl(url: string): boolean {
  return /^https?:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments\//i.test(url.trim());
}

/**
 * URL input for a modpack's logo/banner with an "upload" button: the file goes
 * to the app's Firebase Storage (same place and path shape as profile banners,
 * so the existing storage rules already allow it) and its permanent public URL
 * fills the field.
 */
export function ImageUrlField({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const uuid = useAuth((s) => s.uuid);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!uuid) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("La imagen pesa demasiado (máximo 8 MB).");
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      onChange(await uploadBanner(uuid, base64));
      toast.success("Imagen subida.");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-background/50 border-white/10 text-white"
          placeholder={placeholder}
          disabled={disabled || uploading}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 border-white/10"
          title="Subir imagen"
          disabled={disabled || uploading || !uuid}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      </div>
      {isExpiringImageUrl(value) && (
        <p className="flex items-start gap-1 text-[11px] text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          Los enlaces de Discord caducan: a quien no la haya visto antes le saldrá rota. Súbela con el botón.
        </p>
      )}
    </div>
  );
}
