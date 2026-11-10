import { useState } from "react";
import { Bell, Check, Droplets, Layers, Moon, Palette, Sparkles, Sun, Volume2, type LucideIcon } from "lucide-react";
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
import { useTheme, type Theme } from "@/lib/theme";
import { useAnimatedBackground } from "@/lib/animated-background";
import { useGlass } from "@/lib/glass";
import { useAdaptiveColor } from "@/lib/adaptive-color";
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
];

export function ThemePanel() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  return (
    <Panel icon={Palette} title="Apariencia" description="El tema de toda la app. Se guarda en este equipo.">
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                "relative rounded-xl border p-2 text-left transition-colors",
                active ? "border-accent ring-2 ring-accent/30" : "border-white/10 hover:border-white/25"
              )}
            >
              <ThemePreview theme={t.id} />
              <div className="mt-2 flex items-center gap-1.5 px-1 text-sm font-medium text-gray-100">
                <t.icon className="h-4 w-4 text-accent" />
                {t.label}
                {active && <Check className="ml-auto h-4 w-4 text-accent" />}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** A tiny drawing of the app in that theme — fixed colors on purpose, so both
 *  previews look right whichever theme is active. */
function ThemePreview({ theme }: { theme: Theme }) {
  const c =
    theme === "dark"
      ? { bg: "#0d0d0d", card: "#1a1a1a", line: "#2a2a2a", text: "#e5e7eb", soft: "#3a3a3a" }
      : { bg: "#eef0f4", card: "#ffffff", line: "#dde1e8", text: "#1f2937", soft: "#cfd5de" };
  return (
    <div className="h-24 rounded-lg overflow-hidden flex flex-col gap-1.5 p-2" style={{ background: c.bg }}>
      <div className="h-4 rounded flex items-center gap-1 px-1.5" style={{ background: c.card, border: `1px solid ${c.line}` }}>
        <span className="h-1.5 w-8 rounded-full" style={{ background: c.text }} />
      </div>
      <div className="flex-1 flex gap-1.5">
        <div className="w-1/3 rounded flex flex-col gap-1 p-1" style={{ background: c.card, border: `1px solid ${c.line}` }}>
          <span className="h-1.5 rounded-full" style={{ background: "hsl(205 85% 50%)" }} />
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
