import { lazy, Suspense, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkinViewerAnimated } from "@/components/skin-viewer-animated";
import {
  DEFAULT_ELECTRIC_COLOR,
  DEFAULT_TRACED,
  ELECTRIC_COLORS,
  TRACED_COMBOS,
  ProfileFrame,
  parseFrameColors,
  serializeFrameColors,
  type FrameColors,
} from "@/components/profile-frame";
import { EffectSwatch } from "@/components/effect-swatch";
import { BannerMedia } from "@/components/banner-media";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import {
  AVATAR_DECORATIONS,
  FRAME_DECORATIONS,
  ICON_DECORATIONS,
  toIconDecoration,
  toSkinEffect,
} from "@/lib/decoration-catalog";
import {
  setProfileAvatarDecoration,
  setProfileFrame,
  setProfileFrameColor,
  setProfileIconColors,
  setProfileIconDecoration,
} from "@/services/public-profile";
import { DecoratedIcon, useLiveIconColors, useLiveIconDecoration } from "@/components/icon-decoration";
import {
  ICON_SINGLE_COLORS,
  ICON_TRACED_COMBOS,
  RECOLORABLE_ICONS,
  iconColorsFor,
  parseIconColors,
  serializeIconColors,
  type RecolorableIcon,
} from "@/lib/icon-colors";
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

export interface ProfileCustomizeContentProps {
  uuid: string;
  username: string;
  skinUrl: string | null;
  skinVariant: "slim" | "classic";
  avatarDecoration: string;
  frame: string;
  /** Colour of the electric frame; null = default. */
  frameColor?: string | null;
  /** The frame is also drawn round the character's card. */
  frameOnCharacter?: boolean;
  /** Your instances / favorites hidden from everyone else. */
  hideInstances?: boolean;
  hideFavorites?: boolean;
  onChange: (patch: {
    avatarDecoration?: string;
    frame?: string;
    frameColor?: string;
    frameOnCharacter?: boolean;
    hideInstances?: boolean;
    hideFavorites?: boolean;
  }) => void;
}

interface ProfileCustomizeDialogProps extends ProfileCustomizeContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

/** Saving and optimistic state of the three decorations (character effect,
 *  banner frame, head icon), shared by every picker below. */
function useDecorationPicks({
  uuid,
  avatarDecoration,
  frame,
  frameColor,
  onChange,
}: Pick<ProfileCustomizeContentProps, "uuid" | "avatarDecoration" | "frame" | "frameColor" | "onChange">) {
  const [busy, setBusy] = useState(false);
  // Icon decoration: read live here (callers don't pass it), shown optimistically.
  const savedIcon = useLiveIconDecoration(uuid);
  const [iconDecoration, setIconDecoration] = useState("none");
  useEffect(() => setIconDecoration(toIconDecoration(savedIcon)), [savedIcon]);

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

  /** Sets one frame's colours (keeping the other frames') and selects that frame. */
  const pickFrameColor = async (target: "electric" | "traced", colors: Partial<FrameColors>) => {
    const value = serializeFrameColors({ ...parseFrameColors(frameColor), ...colors });
    onChange({ frameColor: value, frame: target });
    try {
      await Promise.all([setProfileFrameColor(uuid, value), frame === target ? null : setProfileFrame(uuid, target)]);
      refreshProfileLook(uuid);
    } catch {
      toast.error("No se pudo guardar el color.");
    }
  };

  // Icon decoration colours: live from the profile, shown optimistically.
  const savedIconColors = useLiveIconColors(uuid);
  const [iconColors, setIconColors] = useState<string | null>(null);
  useEffect(() => setIconColors(savedIconColors), [savedIconColors]);

  /** Sets one icon decoration's colours (keeping the others') and selects it. */
  const pickIconColor = async (id: RecolorableIcon, colors: string[]) => {
    const value = serializeIconColors({ ...parseIconColors(iconColors), [id]: colors });
    setIconColors(value);
    setIconDecoration(id);
    try {
      await Promise.all([setProfileIconColors(uuid, value), id === iconDecoration ? null : setProfileIconDecoration(uuid, id)]);
      refreshProfileLook(uuid);
    } catch {
      setIconColors(savedIconColors);
      toast.error("No se pudo guardar el color.");
    }
  };

  return { iconDecoration, pickIcon, pickAvatar, pickFrame, pickFrameColor, iconColors, pickIconColor };
}

/** The decoration pickers (Avatar / Marco / Icono) without a dialog around them:
 *  used by ProfileCustomizeDialog and as the "Decoraciones" tab of Editar perfil. */
export function ProfileCustomizeContent({
  uuid,
  username,
  skinUrl,
  skinVariant,
  avatarDecoration,
  frame,
  onChange,
}: ProfileCustomizeContentProps) {
  const { iconDecoration, pickIcon, pickAvatar, pickFrame } = useDecorationPicks({ uuid, avatarDecoration, frame, onChange });
  const headUrl = usePlayerHeadUrl(uuid);

  return (
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
            <div className="rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md px-4 py-6 text-center">
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
  );
}

export function ProfileCustomizeDialog({ open, onOpenChange, ...content }: ProfileCustomizeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personalizar perfil</DialogTitle>
          <DialogDescription>Los cambios los verán también tus amigos al abrir tu perfil.</DialogDescription>
        </DialogHeader>
        <ProfileCustomizeContent {...content} />
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

/** Just the option cards of one decoration, for the side panel of Editar perfil
 *  (the live preview there is the viewer, so no viewers here). */
/** A change made in Editar perfil, kept as a draft until "Listo". */
export interface DecorationDraftPatch {
  avatarDecoration?: string;
  frame?: string;
  frameColor?: string;
  iconDecoration?: string;
  iconColors?: string;
}

export function ProfileDecorationPicker({
  section,
  bannerUrl,
  draft,
  ...props
}: Pick<ProfileCustomizeContentProps, "uuid" | "avatarDecoration" | "frame" | "frameColor" | "onChange"> & {
  section: "character" | "icon" | "frame";
  /** Frame previews are drawn over your own banner. */
  bannerUrl?: string | null;
  /** Draft mode (Editar perfil): picks only go to `onDraft`, nothing is saved
   *  here; the icon's values come from the draft too. */
  draft?: { iconDecoration: string; iconColors: string | null; onDraft: (patch: DecorationDraftPatch) => void };
}) {
  const live = useDecorationPicks(props);
  const iconDecoration = draft ? draft.iconDecoration : live.iconDecoration;
  const iconColors = draft ? draft.iconColors : live.iconColors;
  const pickAvatar = draft ? (id: string) => draft.onDraft({ avatarDecoration: id }) : live.pickAvatar;
  const pickFrame = draft ? (id: string) => draft.onDraft({ frame: id }) : live.pickFrame;
  const pickIcon = draft ? (id: string) => draft.onDraft({ iconDecoration: id }) : live.pickIcon;
  const pickFrameColor = draft
    ? (target: "electric" | "traced", colors: Partial<FrameColors>) =>
        draft.onDraft({ frame: target, frameColor: serializeFrameColors({ ...parseFrameColors(props.frameColor), ...colors }) })
    : live.pickFrameColor;
  const pickIconColor = draft
    ? (id: RecolorableIcon, colors: string[]) =>
        draft.onDraft({ iconDecoration: id, iconColors: serializeIconColors({ ...parseIconColors(iconColors), [id]: colors }) })
    : live.pickIconColor;
  const headUrl = usePlayerHeadUrl(props.uuid);
  const list =
    section === "character"
      ? { items: AVATAR_DECORATIONS, selected: props.avatarDecoration, pick: pickAvatar }
      : section === "icon"
        ? { items: ICON_DECORATIONS, selected: iconDecoration, pick: pickIcon }
        : { items: FRAME_DECORATIONS, selected: props.frame, pick: pickFrame };
  if (section === "frame") {
    // Each frame drawn for real around a small card with your banner.
    return (
      <div className="space-y-2.5">
        {FRAME_DECORATIONS.map((d) => {
          const selected = props.frame === d.id;
          const electric = d.id === "electric";
          const traced = d.id === "traced";
          const colors = parseFrameColors(props.frameColor);
          const current = colors.electric || DEFAULT_ELECTRIC_COLOR;
          const combo = colors.traced ?? DEFAULT_TRACED;
          return (
            <div
              key={d.id}
              className={`group relative rounded-md border transition-colors ${
                selected ? "border-accent bg-accent/10" : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <button type="button" title={d.description} onClick={() => pickFrame(d.id)} className="block w-full p-2 text-left">
                <ProfileFrame frame={d.id} color={props.frameColor} borderRadius={6}>
                  <div className={`relative h-14 overflow-hidden rounded-[6px] border ${electric ? "border-transparent" : "border-accent/40"}`}>
                    <BannerMedia src={bannerUrl || DEFAULT_PROFILE_BANNER} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/10" />
                    <span className="relative flex h-full items-center px-3 text-xs font-semibold text-white">{d.label}</span>
                  </div>
                </ProfileFrame>
              </button>
              {selected && (
                <span className="pointer-events-none absolute right-3 top-3 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {electric && (
                // Hovering the electric preview unfolds its colour palette.
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                      {ELECTRIC_COLORS.map((opt) => {
                        const on = current.toLowerCase() === opt.color.toLowerCase();
                        return (
                          <button
                            key={opt.color}
                            type="button"
                            title={opt.label}
                            aria-label={`Color ${opt.label}`}
                            onClick={() => pickFrameColor("electric", { electric: opt.color })}
                            className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                              on ? "border-white" : "border-transparent"
                            }`}
                            style={{ background: opt.color, boxShadow: `0 0 8px ${opt.color}` }}
                          />
                        );
                      })}
                      <label
                        title="Otro color"
                        className="relative ml-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-dashed border-white/40 text-[10px] text-gray-300 hover:border-white"
                      >
                        +
                        <input
                          type="color"
                          value={current}
                          onChange={(e) => pickFrameColor("electric", { electric: e.target.value })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
              {traced && (
                // Hovering the trace preview unfolds its colour combinations.
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <div className="grid grid-cols-4 gap-1.5 px-2 pb-2">
                      {TRACED_COMBOS.map((opt) => {
                        const on = combo.from.toLowerCase() === opt.from.toLowerCase() && combo.to.toLowerCase() === opt.to.toLowerCase();
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            title={opt.label}
                            aria-label={`Combinación ${opt.label}`}
                            onClick={() => pickFrameColor("traced", { traced: { from: opt.from, to: opt.to } })}
                            className={`h-5 rounded-full border-2 transition-transform hover:scale-105 ${
                              on ? "border-white" : "border-transparent"
                            }`}
                            style={{ background: `linear-gradient(90deg, ${opt.from}, ${opt.to})` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (section === "icon") {
    // Same grid as the character's: your own head with each decoration.
    return (
      <div className="grid grid-cols-3 gap-2">
        {ICON_DECORATIONS.map((d) => {
          const selected = iconDecoration === d.id;
          const recolorable = (RECOLORABLE_ICONS as readonly string[]).includes(d.id);
          const current = iconColorsFor(d.id, iconColors) ?? [];
          const same = (a: string[]) => a.length === current.length && a.every((x, i) => x.toLowerCase() === current[i]?.toLowerCase());
          return (
            <div
              key={d.id}
              className={`group relative overflow-hidden rounded-md border transition-colors ${
                selected ? "border-accent bg-accent/10" : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <button type="button" title={d.description} onClick={() => pickIcon(d.id)} className="block w-full text-left">
                <div className="flex h-16 w-full items-center justify-center bg-black/40">
                  <DecoratedIcon decoration={d.id} colors={iconColors} size={36} radius={7}>
                    <IconHead url={headUrl} size={36} radius={7} />
                  </DecoratedIcon>
                </div>
                <span className="block truncate px-1.5 py-1 text-[10px] font-medium text-gray-200">{d.label}</span>
              </button>
              {selected && (
                <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {recolorable && (
                // Hovering unfolds its colours: gradient pairs for Trazo, single colours for the rest.
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <div className="grid grid-cols-4 gap-1 px-1.5 pb-1.5">
                      {(d.id === "traced"
                        ? ICON_TRACED_COMBOS.map((o) => ({ label: o.label, colors: [o.from, o.to] }))
                        : ICON_SINGLE_COLORS.map((o) => ({ label: o.label, colors: [o.color] }))
                      ).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          title={opt.label}
                          aria-label={`Color ${opt.label}`}
                          onClick={() => pickIconColor(d.id as RecolorableIcon, opt.colors)}
                          className={`h-3.5 rounded-full border transition-transform hover:scale-110 ${
                            same(opt.colors) ? "border-white" : "border-transparent"
                          }`}
                          style={{
                            background: opt.colors.length === 2 ? `linear-gradient(90deg, ${opt.colors[0]}, ${opt.colors[1]})` : opt.colors[0],
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (section === "character") {
    // A grid of live previews instead of text descriptions (the description
    // stays as the tile's tooltip).
    return (
      <div className="grid grid-cols-3 gap-2">
        {AVATAR_DECORATIONS.map((d) => {
          const selected = props.avatarDecoration === d.id;
          return (
            <button
              key={d.id}
              type="button"
              title={d.description}
              onClick={() => pickAvatar(d.id)}
              className={`group relative overflow-hidden rounded-md border text-left transition-colors ${
                selected ? "border-accent bg-accent/10" : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <EffectSwatch id={d.id} className="h-16 w-full" />
              {selected && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <span className="block truncate px-1.5 py-1 text-[10px] font-medium text-gray-200">{d.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {list.items.map((d) => (
        <OptionCard
          key={d.id}
          label={d.label}
          description={d.description}
          selected={list.selected === d.id}
          onSelect={() => list.pick(d.id)}
        />
      ))}
    </div>
  );
}
