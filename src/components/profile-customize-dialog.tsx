import { lazy, Suspense, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkinViewerAnimated } from "@/components/skin-viewer-animated";
import { ProfileFrame } from "@/components/profile-frame";
import {
  AVATAR_DECORATIONS,
  FRAME_DECORATIONS,
  ICON_DECORATIONS,
  toIconDecoration,
  toSkinEffect,
} from "@/lib/decoration-catalog";
import { setProfileAvatarDecoration, setProfileFrame, setProfileIconDecoration } from "@/services/public-profile";
import { DecoratedIcon, useLiveIconDecoration } from "@/components/icon-decoration";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { refreshProfileLook } from "@/hooks/use-profile-look";

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
  // Icon decoration: read live here (callers don't pass it), shown optimistically.
  const savedIcon = useLiveIconDecoration(uuid);
  const [iconDecoration, setIconDecoration] = useState("none");
  useEffect(() => setIconDecoration(toIconDecoration(savedIcon)), [savedIcon]);
  const headUrl = usePlayerHeadUrl(uuid);

  const pickIcon = async (id: string) => {
    if (id === iconDecoration || busy) return;
    setIconDecoration(id);
    setBusy(true);
    try {
      await setProfileIconDecoration(uuid, id);
      refreshProfileLook(uuid);
    } catch {
      setIconDecoration(toIconDecoration(savedIcon));
      toast.error("No se pudo guardar la decoración del icono.");
    } finally {
      setBusy(false);
    }
  };

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
      refreshProfileLook(uuid);
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
              Avatar
            </TabsTrigger>
            <TabsTrigger value="frame" className="flex-1">
              Marco del banner
            </TabsTrigger>
            {/* Banner and Icono: still test-only (dev builds) until we have
                our own designs — the lab packs are third-party. */}
            {DevBannerLab && (
              <TabsTrigger value="banner" className="flex-1 text-amber-400">
                Banner
              </TabsTrigger>
            )}
            <TabsTrigger value="icon" className="flex-1">
              Icono
            </TabsTrigger>
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

          {DevBannerLab && (
            <TabsContent value="banner" className="pt-4">
              <Suspense fallback={null}>
                <DevBannerLab uuid={uuid} username={username} />
              </Suspense>
            </TabsContent>
          )}
          <TabsContent value="icon" className="pt-4">
            <div className="flex gap-4">
              {/* Your head at the sizes it's shown at: profile, account menu, lists. */}
              <div className="shrink-0 w-[170px] rounded-lg bg-black/30 border border-white/10 flex flex-col items-center justify-center gap-5 py-6">
                <DecoratedIcon key={`${iconDecoration}-64`} decoration={iconDecoration} size={64} radius={10}>
                  <IconHead url={headUrl} size={64} radius={10} />
                </DecoratedIcon>
                <div className="flex items-end gap-5">
                  <DecoratedIcon key={`${iconDecoration}-40`} decoration={iconDecoration} size={40} radius={8}>
                    <IconHead url={headUrl} size={40} radius={8} />
                  </DecoratedIcon>
                  <DecoratedIcon key={`${iconDecoration}-24`} decoration={iconDecoration} size={24} radius={6}>
                    <IconHead url={headUrl} size={24} radius={6} />
                  </DecoratedIcon>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2 content-start max-h-[300px] overflow-y-auto pr-1">
                {ICON_DECORATIONS.map((d) => (
                  <OptionCard
                    key={d.id}
                    label={d.label}
                    description={d.description}
                    selected={iconDecoration === d.id}
                    onSelect={() => pickIcon(d.id)}
                  />
                ))}
              </div>
            </div>
            {/* DEV ONLY: the third-party pack lab, for trying more styles. */}
            {DevDecoLab && (
              <details className="mt-4 rounded-lg border border-amber-400/30 p-3">
                <summary className="cursor-pointer text-xs text-amber-400">Pruebas (pack de terceros, solo dev)</summary>
                <div className="pt-3">
                  <Suspense fallback={null}>
                    <DevDecoLab uuid={uuid} />
                  </Suspense>
                </div>
              </details>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function IconHead({ url, size, radius }: { url: string | null; size: number; radius: number }) {
  return (
    <div
      className="overflow-hidden border border-white/10 bg-accent/20"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {url && <img src={url} alt="" className="h-full w-full" style={{ imageRendering: "pixelated" }} />}
    </div>
  );
}
