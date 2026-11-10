import { Hint } from "@/components/hint";
import { useEffect, useRef, useState } from "react";
import { Check, Frame, Gamepad2, Globe, Heart, Loader2, Lock, PanelLeftClose, PanelLeftOpen, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileCustomizeContent, ProfileDecorationPicker } from "@/components/lazy-heavy";
import { ProfilePreview } from "@/components/profile-preview";
import { refreshProfileLook } from "@/hooks/use-profile-look";
import type { DecorationDraftPatch, ProfileCustomizeContentProps } from "@/components/profile-customize-dialog";
import { useLiveIconColors, useLiveIconDecoration } from "@/components/icon-decoration";
import { toIconDecoration } from "@/lib/decoration-catalog";
import { BannerCropDialog } from "@/components/image-cropper";
import { DEFAULT_PROFILE_BANNER, PRESET_BANNERS, uploadBanner } from "@/services/banner";
import {
  removeRecentBanner,
  setProfileAvatarDecoration,
  setProfileBannerRemembered,
  setProfileFrame,
  setProfileFrameColor,
  setProfileFrameOnCharacter,
  setProfileHidden,
  setProfileIconColors,
  setProfileIconDecoration,
  setProfileBio,
  setProfileVisibility,
  type ProfileVisibility,
} from "@/services/public-profile";
import { BannerMedia } from "@/components/banner-media";

// Editar perfil is being rebuilt step by step: for now, with the account menu's
// preview (`customize` given), the dialog shows ONLY the preview. The editors
// (bio, banner, visibility and the Decoraciones tab) are kept below, switched off.
const SHOW_EDITORS = false;

type SideSection = "character" | "icon" | "banner" | "frame";
const SIDE_SECTIONS: { id: SideSection; label: string; hint: string }[] = [
  { id: "character", label: "Personaje", hint: "El efecto que rodea a tu personaje." },
  { id: "icon", label: "Avatar", hint: "La decoración de tu icono (la cabeza) en listas y perfiles." },
  { id: "banner", label: "Banner", hint: "La imagen de fondo de tu tarjeta." },
  { id: "frame", label: "Marco", hint: "El borde animado de tu tarjeta de perfil." },
];

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
  /** With it, the dialog also has a "Decoraciones" tab (avatar, marco, icono). */
  customize?: ProfileCustomizeContentProps;
  /** The stats row of the preview card (playtime, instances, favorites), for the draft's hide options. */
  previewStats?: (hidden: { hideInstances: boolean; hideFavorites: boolean }) => React.ReactNode;
}

function BannerThumb({
  url,
  selected,
  onSelect,
  onRemove,
}: {
  url: string;
  selected: boolean;
  onSelect: () => void;
  /** Only your own banners (uploaded / recent) can be removed — not the presets. */
  onRemove?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={`relative block w-full aspect-[16/6] rounded-md overflow-hidden border-2 transition-colors ${
          selected ? "border-accent" : "border-transparent hover:border-white/30"
        }`}
      >
        <BannerMedia src={url} className="h-full w-full object-cover" />
        {selected && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>
      {onRemove && (
        <Hint label="Eliminar banner">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Eliminar banner"
            className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-gray-200 opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </Hint>
      )}
    </div>
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
  customize,
  previewStats,
}: ProfileEditDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftBio, setDraftBio] = useState(bio);
  const [savingBio, setSavingBio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [section, setSection] = useState<SideSection>("character");
  // The customization panel can be folded away to look at the preview alone.
  const [panelOpen, setPanelOpen] = useState(true);

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

  const removeBanner = async (url: string) => {
    try {
      const { recent, clearedCurrent } = await removeRecentBanner(uuid, url);
      onChange(clearedCurrent ? { recentBanners: recent, bannerUrl: null } : { recentBanners: recent });
      toast.success(clearedCurrent ? "Banner eliminado. Vuelves a tener el banner por defecto." : "Banner eliminado.");
    } catch {
      toast.error("No se pudo eliminar el banner.");
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
      const url = await uploadBanner(uuid, base64);
      if (customize) {
        // Editar perfil: only in the preview until "Listo".
        setDraft((d) => ({ ...d, bannerUrl: url, recent: [url, ...d.recent.filter((u) => u !== url)] }));
      } else {
        await applyBanner(url, true);
        toast.success("Banner actualizado.");
      }
      setCropSrc(null);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo subir el banner.");
    } finally {
      setUploading(false);
    }
  };

  // ── Draft (Editar perfil with the preview): every change only goes to the
  // preview; "Listo" saves them all, closing any other way throws them away.
  const savedIcon = toIconDecoration(useLiveIconDecoration(uuid));
  const savedIconColors = useLiveIconColors(uuid);
  type Draft = {
    avatarDecoration: string;
    frame: string;
    frameColor: string | null;
    frameOnCharacter: boolean;
    hideInstances: boolean;
    hideFavorites: boolean;
    iconDecoration: string;
    iconColors: string | null;
    bannerUrl: string | null;
    recent: string[];
    removed: string[];
  };
  const initialDraft = (): Draft => ({
    avatarDecoration: customize?.avatarDecoration ?? "none",
    frame: customize?.frame ?? "none",
    frameColor: customize?.frameColor ?? null,
    frameOnCharacter: !!customize?.frameOnCharacter,
    hideInstances: !!customize?.hideInstances,
    hideFavorites: !!customize?.hideFavorites,
    iconDecoration: savedIcon,
    iconColors: savedIconColors,
    bannerUrl,
    recent: recentBanners,
    removed: [],
  });
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [iconTouched, setIconTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(initialDraft());
      setIconTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // The icon's saved values arrive live: follow them until you touch the icon.
  useEffect(() => {
    if (!iconTouched) setDraft((d) => ({ ...d, iconDecoration: savedIcon, iconColors: savedIconColors }));
  }, [savedIcon, savedIconColors, iconTouched]);
  const patchDraft = (patch: Partial<Draft> | DecorationDraftPatch) => {
    if ("iconDecoration" in patch || "iconColors" in patch) setIconTouched(true);
    setDraft((d) => ({ ...d, ...(patch as Partial<Draft>) }));
  };
  const draftBanner = draft.bannerUrl || DEFAULT_PROFILE_BANNER;
  const draftPickerProps = {
    avatarDecoration: draft.avatarDecoration,
    frame: draft.frame,
    frameColor: draft.frameColor,
    draft: { iconDecoration: draft.iconDecoration, iconColors: draft.iconColors, onDraft: patchDraft },
  };
  const draftExtraRecent = draft.recent.filter((u) => !presetUrls.includes(u) && !draft.removed.includes(u));

  const commit = async () => {
    if (!customize) return onOpenChange(false);
    const d = draft;
    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];
      if (d.avatarDecoration !== customize.avatarDecoration) ops.push(setProfileAvatarDecoration(uuid, d.avatarDecoration));
      if (d.frame !== customize.frame) ops.push(setProfileFrame(uuid, d.frame));
      if (d.frameColor && d.frameColor !== (customize.frameColor ?? null)) ops.push(setProfileFrameColor(uuid, d.frameColor));
      if (d.iconDecoration !== savedIcon) ops.push(setProfileIconDecoration(uuid, d.iconDecoration));
      if (d.iconColors && d.iconColors !== savedIconColors) ops.push(setProfileIconColors(uuid, d.iconColors));
      if (d.frameOnCharacter !== !!customize.frameOnCharacter) ops.push(setProfileFrameOnCharacter(uuid, d.frameOnCharacter));
      const hidden: { hideInstances?: boolean; hideFavorites?: boolean } = {};
      if (d.hideInstances !== !!customize.hideInstances) hidden.hideInstances = d.hideInstances;
      if (d.hideFavorites !== !!customize.hideFavorites) hidden.hideFavorites = d.hideFavorites;
      if (Object.keys(hidden).length) ops.push(setProfileHidden(uuid, hidden));
      const status = draftBio.trim();
      if (status !== bio.trim()) ops.push(setProfileBio(uuid, status));
      await Promise.all(ops);

      // Banners: first the ones you removed, then the one chosen.
      let recent = recentBanners;
      let banner = bannerUrl;
      for (const url of d.removed) {
        const r = await removeRecentBanner(uuid, url);
        recent = r.recent;
        if (r.clearedCurrent) banner = null;
      }
      if (d.bannerUrl && d.bannerUrl !== banner) {
        const own = !presetUrls.includes(d.bannerUrl);
        const r = await setProfileBannerRemembered(uuid, d.bannerUrl, own);
        if (own) recent = r;
        banner = d.bannerUrl;
      }

      onChange({ bannerUrl: banner, recentBanners: recent, bio: draftBio.trim() });
      customize.onChange({
        avatarDecoration: d.avatarDecoration,
        frame: d.frame,
        ...(d.frameColor ? { frameColor: d.frameColor } : {}),
        frameOnCharacter: d.frameOnCharacter,
        hideInstances: d.hideInstances,
        hideFavorites: d.hideFavorites,
      });
      refreshProfileLook(uuid);
      onOpenChange(false);
    } catch {
      toast.error("No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
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
      <DialogContent
        className={customize ? "w-auto max-w-none border-0 bg-transparent p-0 shadow-none sm:rounded-none" : "max-w-lg"}
      >
        {!customize && (
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>
        )}

        {/* The account menu's preview, with an extension to its left (a separate
            card): the character's decoration, the avatar and the banner. */}
        {customize && (
          // One block, two containers told apart: the decoration picker on the left
          // (lighter glass, with a line between them), the preview (avatar + banner) on the right.
          <div className="relative flex items-stretch rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {/* A tab sticking out of the block's left edge — the panel's when it's
                open, the preview's when folded — that folds / unfolds the panel. */}
            <Hint label={panelOpen ? "Ocultar personalización" : "Mostrar personalización"}>
              <button
                type="button"
                onClick={() => setPanelOpen((o) => !o)}
                aria-label={panelOpen ? "Ocultar personalización" : "Mostrar personalización"}
                className="absolute -left-[31px] top-5 z-10 flex h-16 w-8 items-center justify-center rounded-l-md bg-gray-500/20 text-muted-foreground shadow-[-6px_4px_16px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-colors hover:bg-gray-500/30 hover:text-accent"
              >
                {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
            </Hint>
            <AnimatePresence initial={false}>
            {panelOpen && (
            // Unmounted when folded: at width 0 its 1px border still left a gap
            // between the tab and the preview.
            <motion.div
              key="customize-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 336, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              // Never taller than the preview beside it: the content sits in an
              // absolute box and its list scrolls inside (it used to run under
              // the panel's bottom edge).
              className="relative shrink-0 overflow-hidden rounded-l-md border-r border-white/10 bg-gray-500/10 backdrop-blur-xl"
            >
              <div className="absolute inset-y-0 left-0 flex w-[21rem] flex-col">
              <div className="flex shrink-0 items-center gap-1 border-b border-white/10 p-1.5">
                {SIDE_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setSection(sec.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                      section === sec.id ? "bg-accent/20 text-accent" : "text-muted-foreground hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-4">
                {section === "character" && <ProfileDecorationPicker section="character" {...customize} {...draftPickerProps} />}
                {section === "icon" && <ProfileDecorationPicker section="icon" {...customize} {...draftPickerProps} />}
                {section === "banner" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
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
                      <div className="grid grid-cols-2 gap-2">
                        {PRESET_BANNERS.map((p) => (
                          <BannerThumb key={p.id} url={p.url} selected={draftBanner === p.url} onSelect={() => patchDraft({ bannerUrl: p.url })} />
                        ))}
                        {draftExtraRecent.map((url) => (
                          <BannerThumb
                            key={url}
                            url={url}
                            selected={draftBanner === url}
                            onSelect={() => patchDraft({ bannerUrl: url })}
                            onRemove={() =>
                              setDraft((d) => ({
                                ...d,
                                removed: [...d.removed, url],
                                bannerUrl: d.bannerUrl === url ? null : d.bannerUrl,
                              }))
                            }
                          />
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
                    </div>
                  </div>
                )}
                {section === "frame" && (
                  <ProfileDecorationPicker section="frame" {...customize} {...draftPickerProps} bannerUrl={draft.bannerUrl} />
                )}
              </div>
              </div>
            </motion.div>
            )}
            </AnimatePresence>

            <div className={`flex flex-col gap-4 bg-gray-500/20 p-6 backdrop-blur-xl ${panelOpen ? "rounded-r-md" : "rounded-md"}`}>
              <DialogHeader>
                <DialogTitle>Editar perfil</DialogTitle>
              </DialogHeader>
              <ProfilePreview
                uuid={uuid}
                username={customize.username}
                bio={draftBio}
                onBioChange={setDraftBio}
                bannerUrl={draft.bannerUrl}
                frame={draft.frame}
                frameColor={draft.frameColor}
                frameOnCharacter={draft.frameOnCharacter}
                iconDecoration={draft.iconDecoration}
                iconColors={draft.iconColors}
                extra={
                  // The options as one tidy list: icon, what it does, a switch.
                  <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-white/[0.04] divide-y divide-white/10">
                    {(
                      [
                        {
                          key: "frameOnCharacter",
                          icon: Frame,
                          label: "Marco en el personaje",
                          hint: "El marco del banner rodea también a tu personaje.",
                          disabled: draft.frame === "none",
                        },
                        { key: "hideInstances", icon: Gamepad2, label: "Ocultar mis instancias", hint: "Nadie verá tus instancias ni su contador." },
                        { key: "hideFavorites", icon: Heart, label: "Ocultar mis favoritos", hint: "Nadie verá tus favoritos ni su contador." },
                      ] as const
                    ).map(({ key, icon: Icon, label, hint, ...rest }) => {
                      const disabled = "disabled" in rest && rest.disabled;
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-3 px-3 py-2.5 select-none transition-colors ${
                            disabled ? "opacity-50" : "cursor-pointer hover:bg-white/[0.04]"
                          }`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-gray-100">{label}</span>
                            <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>
                          </span>
                          <Switch
                            checked={draft[key]}
                            disabled={disabled}
                            onCheckedChange={(on) => patchDraft({ [key]: on })}
                            className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-white/20"
                          />
                        </label>
                      );
                    })}
                  </div>
                }
                avatarDecoration={draft.avatarDecoration}
                skinUrl={customize.skinUrl}
                skinVariant={customize.skinVariant}
                stats={previewStats?.({ hideInstances: draft.hideInstances, hideFavorites: draft.hideFavorites })}
              />
              <DialogFooter className="mt-auto gap-2">
                <Button
                  onClick={commit}
                  disabled={saving}
                  // The app's accent (like Jugar / Nueva instancia), not the theme's orange primary.
                  className="min-w-[6rem] border-transparent bg-accent font-semibold text-accent-foreground shadow-[0_4px_16px_hsl(var(--accent)/0.25)] hover:bg-accent/85"
                >
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Listo
                </Button>
              </DialogFooter>
            </div>
          </div>
        )}

        {customize && !SHOW_EDITORS ? null : customize ? (
          <Tabs defaultValue="profile">
            <TabsList className="w-full">
              <TabsTrigger value="profile" className="flex-1">
                Perfil
              </TabsTrigger>
              <TabsTrigger value="decorations" className="flex-1">
                Decoraciones
              </TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="pt-4">
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
                    <BannerThumb key={url} url={url} selected={currentBanner === url} onSelect={() => applyBanner(url, true)} onRemove={() => removeBanner(url)} />
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
            </TabsContent>
            <TabsContent value="decorations" className="pt-4">
              <ProfileCustomizeContent {...customize} />
            </TabsContent>
          </Tabs>
        ) : (
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
                  <BannerThumb key={url} url={url} selected={currentBanner === url} onSelect={() => applyBanner(url, true)} onRemove={() => removeBanner(url)} />
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
        )}

        {!customize && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Listo</Button>
          </DialogFooter>
        )}
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
