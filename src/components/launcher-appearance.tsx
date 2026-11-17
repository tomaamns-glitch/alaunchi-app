import { useState } from "react";
import { Bell, Check, Droplets, Flame, Gem, Layers, Lock, Moon, Palette, Sparkles, Sun, TreePine, Trees, Volume2, type LucideIcon } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  NOTIFICATION_SOUNDS,
  getNotificationSound,
  setNotificationSound,
  playNotificationSound,
  type NotificationSoundId,
} from "@/lib/notification-sound";
import { isThemeLocked, useTheme, type Theme } from "@/lib/theme";
import { useAnimatedBackground } from "@/lib/animated-background";
import { useGlass } from "@/lib/glass";
import { useAdaptiveColor } from "@/lib/adaptive-color";
import { useChristmasActive, useChristmasPrefs } from "@/lib/christmas";
import { cn } from "@/lib/utils";

// The launcher's look & feel panels (theme, animated background, notification
// sound): shared by Configuración → Personalización and the brush button's
// "Personalizar" window in the title bar.

export const GLASS = "rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md";

export function Panel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(GLASS, "p-5 space-y-4")}>
      <div>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" /> {title}
        </h3>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}


export function AnimatedBackgroundPanel() {
  const enabled = useAnimatedBackground((s) => s.enabled);
  const setEnabled = useAnimatedBackground((s) => s.setEnabled);
  return (
    <Panel
      icon={Sparkles}
      title="Fondo animado"
      description={
        enabled
          ? "La luz en movimiento detrás de Mis instancias y del gestor de cada instancia."
          : "Fondo quieto: una nube suave del mismo color, sin movimiento. Gasta menos."
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="animated-background" className="text-sm text-gray-100">
          Fondo en movimiento
        </Label>
        <Switch id="animated-background" checked={enabled} onCheckedChange={setEnabled} />
      </div>
    </Panel>
  );
}


/** Sound of the app's notices (messages, friend requests, invitations…). */
export function NotificationSoundPanel() {
  const [notificationSound, setNotificationSoundState] = useState<NotificationSoundId>(() => getNotificationSound());

  const handleChange = (id: NotificationSoundId) => {
    setNotificationSoundState(id);
    setNotificationSound(id);
    playNotificationSound(id);
  };

  return (
    <Panel
      icon={Bell}
      title="Notificaciones"
      description="Sonido de los avisos: mensajes, solicitudes de amistad, invitaciones y quién se conecta. Con ALaunchi minimizado, además, sale la notificación de Windows."
    >
      <div className="flex items-center gap-2">
        <Select value={notificationSound} onValueChange={(v) => handleChange(v as NotificationSoundId)}>
          <SelectTrigger className="bg-background/50 border-white/10 text-white flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_SOUNDS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Hint label="Probar sonido">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="border-white/10"
            onClick={() => playNotificationSound(notificationSound)}
            disabled={notificationSound === "none"}
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </Hint>
      </div>
    </Panel>
  );
}

const THEMES: { id: Theme; label: string; icon: LucideIcon }[] = [
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "light", label: "Claro", icon: Sun },
  { id: "midnight", label: "Medianoche", icon: Sparkles },
  { id: "forest", label: "Bosque", icon: Trees },
  { id: "ember", label: "Brasa", icon: Flame },
  { id: "amethyst", label: "Amatista", icon: Gem },
];

export function ThemePanel() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  return (
    <Panel icon={Palette} title="Apariencia" description="El tema de toda la app. Se guarda en este equipo.">
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const active = theme === t.id;
          // Not available yet (lib/theme.ts LOCKED_THEMES): a padlock, no click.
          const locked = isThemeLocked(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => !locked && setTheme(t.id)}
              disabled={locked}
              title={locked ? "Todavía no disponible" : undefined}
              className={cn(
                "relative rounded-xl border p-2 text-left transition-colors",
                locked
                  ? "border-white/10 cursor-not-allowed"
                  : active
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-white/10 hover:border-white/25"
              )}
            >
              <div className={cn(locked && "opacity-40 grayscale-[60%]")}>
                <ThemePreview theme={t.id} />
              </div>
              {locked && (
                <span className="absolute inset-x-2 top-2 h-24 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                    <Lock className="h-4 w-4" />
                  </span>
                </span>
              )}
              <div className={cn("mt-2 flex items-center gap-1.5 px-1 text-sm font-medium", locked ? "text-gray-400" : "text-gray-100")}>
                <t.icon className={cn("h-4 w-4", locked ? "text-gray-500" : "text-accent")} />
                {t.label}
                {active && !locked && <Check className="ml-auto h-4 w-4 text-accent" />}
                {locked && <Lock className="ml-auto h-3.5 w-3.5 text-gray-500" />}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** Fixed colors for each preview (roughly each theme's background, cards and accent). */
const PREVIEW_COLORS: Record<Theme, { bg: string; card: string; line: string; text: string; soft: string; accent: string }> = {
  dark: { bg: "#0d0d0d", card: "#1a1a1a", line: "#2a2a2a", text: "#e5e7eb", soft: "#3a3a3a", accent: "hsl(205 85% 50%)" },
  light: { bg: "#eef0f4", card: "#ffffff", line: "#dde1e8", text: "#1f2937", soft: "#cfd5de", accent: "hsl(208 92% 44%)" },
  midnight: { bg: "#071225", card: "#0e1b31", line: "#1c2d4a", text: "#e2e8f0", soft: "#26385a", accent: "hsl(206 92% 56%)" },
  forest: { bg: "#08140f", card: "#0f2019", line: "#1c3529", text: "#e2efe8", soft: "#24423a", accent: "hsl(148 62% 47%)" },
  ember: { bg: "#130c08", card: "#1f150f", line: "#33241a", text: "#f1e8e2", soft: "#3d2c20", accent: "hsl(30 94% 55%)" },
  amethyst: { bg: "#0e0a18", card: "#181128", line: "#2a2142", text: "#ebe6f5", soft: "#332850", accent: "hsl(266 82% 67%)" },
};

/** A tiny drawing of the app in that theme — fixed colors on purpose, so both
 *  previews look right whichever theme is active. */
function ThemePreview({ theme }: { theme: Theme }) {
  const c = PREVIEW_COLORS[theme];
  return (
    <div className="h-24 rounded-lg overflow-hidden flex flex-col gap-1.5 p-2" style={{ background: c.bg }}>
      <div className="h-4 rounded flex items-center gap-1 px-1.5" style={{ background: c.card, border: `1px solid ${c.line}` }}>
        <span className="h-1.5 w-8 rounded-full" style={{ background: c.text }} />
      </div>
      <div className="flex-1 flex gap-1.5">
        <div className="w-1/3 rounded flex flex-col gap-1 p-1" style={{ background: c.card, border: `1px solid ${c.line}` }}>
          <span className="h-1.5 rounded-full" style={{ background: c.accent }} />
          <span className="h-1.5 rounded-full" style={{ background: c.soft }} />
          <span className="h-1.5 rounded-full" style={{ background: c.soft }} />
        </div>
        <div className="flex-1 rounded p-1.5 flex flex-col gap-1" style={{ background: c.card, border: `1px solid ${c.line}` }}>
          <span className="h-1.5 w-2/3 rounded-full" style={{ background: c.text }} />
          <span className="h-1.5 w-full rounded-full" style={{ background: c.soft }} />
          <span className="h-1.5 w-4/5 rounded-full" style={{ background: c.soft }} />
        </div>
      </div>
    </div>
  );
}


/** Christmas decorations: on for everyone by date (1 December – 1 January,
 *  lib/christmas.ts). This section only shows while they're on, to switch off
 *  the fairy lights and/or the snow on this device. */
export function ChristmasPanel() {
  const active = useChristmasActive();
  const lights = useChristmasPrefs((s) => s.lights);
  const snow = useChristmasPrefs((s) => s.snow);
  const setLights = useChristmasPrefs((s) => s.setLights);
  const setSnow = useChristmasPrefs((s) => s.setSnow);
  if (!active) return null;
  return (
    <Panel
      icon={TreePine}
      title="Decoración navideña"
      description="ALaunchi se viste de Navidad hasta el 1 de enero. Si te molesta algo, puedes quitar las luces o la nieve en este equipo."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="christmas-lights" className="text-sm text-gray-100">
            Luces
          </Label>
          <Switch id="christmas-lights" checked={lights} onCheckedChange={setLights} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="christmas-snow" className="text-sm text-gray-100">
            Nieve
          </Label>
          <Switch id="christmas-snow" checked={snow} onCheckedChange={setSnow} />
        </div>
      </div>
    </Panel>
  );
}

/** The blurred, translucent "glass" panels, on or off. */
export function GlassPanel() {
  const glass = useGlass((s) => s.glass);
  const setGlass = useGlass((s) => s.setGlass);
  return (
    <Panel
      icon={Layers}
      title="Efecto glass"
      description={
        glass
          ? "Los paneles son translúcidos y desenfocan lo que hay detrás."
          : "Paneles más sólidos y sin desenfoque: se leen mejor sobre fondos recargados y gastan menos."
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="glass-effect" className="text-sm text-gray-100">
          Efecto glass
        </Label>
        <Switch id="glass-effect" checked={glass} onCheckedChange={setGlass} />
      </div>
    </Panel>
  );
}

/** Whether the accent (buttons, highlights, background glow) follows the open instance's image. */
export function AdaptiveColorPanel() {
  const enabled = useAdaptiveColor((s) => s.enabled);
  const setEnabled = useAdaptiveColor((s) => s.setEnabled);
  return (
    <Panel
      icon={Droplets}
      title="Adaptar colores a la instancia"
      description={
        enabled
          ? "Los botones, los resaltes y el fondo toman el color de la imagen de la instancia que miras."
          : "La app usa siempre sus propios colores, sea cual sea la instancia."
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="adaptive-color" className="text-sm text-gray-100">
          Colores adaptativos
        </Label>
        <Switch id="adaptive-color" checked={enabled} onCheckedChange={setEnabled} />
      </div>
    </Panel>
  );
}
