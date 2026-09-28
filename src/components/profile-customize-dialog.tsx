import { lazy, Suspense, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkinViewerAnimated } from "@/components/skin-viewer-animated";
import { ProfileFrame } from "@/components/profile-frame";
import {
  AVATAR_DECORATIONS,
  FRAME_DECORATIONS,
  toSkinEffect,
} from "@/lib/decoration-catalog";
import { setProfileAvatarDecoration, setProfileFrame } from "@/services/public-profile";

// DEV ONLY: preview lab for a third-party decoration pack — lazy + gated on
// import.meta.env.DEV so it isn't even part of the production bundle.
const DevDecoLab = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-deco-lab").then((m) => ({ default: m.DevDecoLab })))
  : null;
const DevBannerLab = import.meta.env.DEV
  ? lazy(() => import("@/components/dev-banner-lab").then((m) => ({ default: m.DevBannerLab })))
  : null;

interface ProfileCustomizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uuid: string;
  username: string;
  skinUrl: string | null;
  skinVariant: "slim" | "classic";
  avatarDecoration: string;
  frame: string;
  onChange: (patch: { avatarDecoration?: string; frame?: string }) => void;
}

function OptionCard({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-white/10 bg-white/5 hover:border-white/25"
      }`}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{description}</div>
    </button>
  );
}

export function ProfileCustomizeDialog({
  open,
  onOpenChange,
  uuid,
  username,
  skinUrl,
  skinVariant,
  avatarDecoration,
  frame,
  onChange,
}: ProfileCustomizeDialogProps) {
  const [busy, setBusy] = useState(false);

  const pickAvatar = async (id: string) => {
    if (id === avatarDecoration || busy) return;
    onChange({ avatarDecoration: id });
    setBusy(true);
    try {
      await setProfileAvatarDecoration(uuid, id);
    } catch {
      toast.error("No se pudo guardar la decoración.");
    } finally {
      setBusy(false);
    }
  };

  const pickFrame = async (id: string) => {
    if (id === frame || busy) return;
    onChange({ frame: id });
    setBusy(true);
    try {
      await setProfileFrame(uuid, id);
    } catch {
      toast.error("No se pudo guardar el marco.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personalizar perfil</DialogTitle>
          <DialogDescription>Los cambios los verán también tus amigos al abrir tu perfil.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="avatar">
          <TabsList className="w-full">
            <TabsTrigger value="avatar" className="flex-1">
              Decoración del avatar
            </TabsTrigger>
            <TabsTrigger value="frame" className="flex-1">
              Marco
            </TabsTrigger>
            {DevDecoLab && (
              <TabsTrigger value="dev-lab" className="flex-1 text-amber-400">
                Pruebas
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="avatar" className="pt-4">
            <div className="flex gap-4">
              <div className="shrink-0 rounded-lg bg-black/30 border border-white/10 overflow-hidden" style={{ width: 170, height: 240 }}>
                {skinUrl && (
                  <SkinViewerAnimated
                    key={avatarDecoration}
                    skinUrl={skinUrl}
                    variant={skinVariant}
                    width={170}
                    height={240}
                    effect={toSkinEffect(avatarDecoration)}
                  />
                )}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2 content-start max-h-[300px] overflow-y-auto pr-1">
                {AVATAR_DECORATIONS.map((d) => (
                  <OptionCard
                    key={d.id}
                    label={d.label}
                    description={d.description}
                    selected={avatarDecoration === d.id}
                    onSelect={() => pickAvatar(d.id)}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="frame" className="pt-4">
            <div className="space-y-3">
              <ProfileFrame frame={frame}>
                <div className="rounded-xl border border-white/10 bg-card/60 px-4 py-6 text-center">
                  <div className="text-sm font-semibold">{/* preview */}Vista previa</div>
                  <div className="text-[11px] text-muted-foreground">Así se verá el borde de tu tarjeta.</div>
                </div>
              </ProfileFrame>
              <div className="space-y-2">
                {FRAME_DECORATIONS.map((f) => (
                  <OptionCard
                    key={f.id}
                    label={f.label}
                    description={f.description}
                    selected={frame === f.id}
                    onSelect={() => pickFrame(f.id)}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          {DevDecoLab && DevBannerLab && (
            <TabsContent value="dev-lab" className="pt-4">
              <Tabs defaultValue="deco">
                <TabsList className="h-8">
                  <TabsTrigger value="deco" className="text-xs">
                    Decoraciones
                  </TabsTrigger>
                  <TabsTrigger value="banners" className="text-xs">
                    Banners
                  </TabsTrigger>
                </TabsList>
                <Suspense fallback={null}>
                  <TabsContent value="deco" className="pt-3">
                    <DevDecoLab uuid={uuid} />
                  </TabsContent>
                  <TabsContent value="banners" className="pt-3">
                    <DevBannerLab uuid={uuid} username={username} />
                  </TabsContent>
                </Suspense>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
