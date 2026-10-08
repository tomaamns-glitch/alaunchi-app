import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { MyRepoCard } from "@/components/my-repo-card";
import { Head } from "@/components/player-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  LogOut,
  Cpu,
  FolderOpen,
  FolderCog,
  Bell,
  Volume2,
  HardDrive,
  Palette,
  Code2,
  UserCircle2,
  Moon,
  Sun,
  Check,
  MonitorDown,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { readSettings, writeSettings, isElectron, getDataDir, chooseDataDir, openDataDir } from "@/services/electron";
import {
  NOTIFICATION_SOUNDS,
  getNotificationSound,
  setNotificationSound,
  playNotificationSound,
  type NotificationSoundId,
} from "@/lib/notification-sound";
import { getLastViewPath } from "@/lib/last-view";
import { useTheme, type Theme } from "@/lib/theme";
import { useAnimatedBackground } from "@/lib/animated-background";
import { cn } from "@/lib/utils";

type SectionId = "storage" | "personalization" | "developer" | "account";

const SECTIONS: { id: SectionId; label: string; description: string; icon: LucideIcon }[] = [
  { id: "storage", label: "Archivos y RAM", description: "Dónde se guarda todo y cuánta memoria usa Minecraft", icon: HardDrive },
  { id: "personalization", label: "Personalización", description: "Apariencia, sonidos y avisos", icon: Palette },
  { id: "developer", label: "Modo desarrollador", description: "Tu repositorio para publicar instancias online", icon: Code2 },
  { id: "account", label: "Mi cuenta", description: "Tu cuenta de Minecraft y de Microsoft", icon: UserCircle2 },
];

const GLASS = "rounded-xl border border-white/10 bg-card/40";
const SECTION_KEY = "alaunchi_settings_section";

export default function Settings() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<SectionId>(() => {
    try {
      const saved = sessionStorage.getItem(SECTION_KEY) as SectionId | null;
      return saved && SECTIONS.some((s) => s.id === saved) ? saved : "storage";
    } catch {
      return "storage";
    }
  });
  const current = SECTIONS.find((s) => s.id === section)!;

  const pick = (id: SectionId) => {
    setSection(id);
    try {
      sessionStorage.setItem(SECTION_KEY, id);
    } catch {}
  };

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col gap-5 px-6 pt-6 pb-5 max-w-6xl mx-auto w-full">
        {/* Same glass header card as the Hub / Admin */}
        <div className={cn(GLASS, "relative shrink-0 p-5 overflow-hidden")}>
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLocation(getLastViewPath())}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">Ajustes</h1>
              <p className="text-xs text-muted-foreground">Configura ALaunchi a tu gusto</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex gap-5">
          {/* Section buttons */}
          <nav className="w-60 shrink-0 flex flex-col gap-1.5">
            {SECTIONS.map((s) => {
              const active = s.id === section;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s.id)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors",
                    active
                      ? "bg-accent/15 border-accent/40"
                      : "bg-white/[0.04] border-white/5 hover:bg-white/10 hover:border-white/10"
                  )}
                >
                  <span
                    className={cn(
                      "h-8 w-8 shrink-0 flex items-center justify-center rounded-md transition-colors",
                      active ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent group-hover:bg-accent/25"
                    )}
                  >
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className={cn("text-sm font-medium", active ? "text-white" : "text-gray-200")}>{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Section content */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto pr-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={section}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4 max-w-2xl"
              >
                <div className="px-1">
                  <h2 className="text-lg font-bold text-white">{current.label}</h2>
                  <p className="text-xs text-muted-foreground">{current.description}</p>
                </div>
                {section === "storage" && <StorageSection />}
                {section === "personalization" && <PersonalizationSection />}
                {section === "developer" && <MyRepoCard />}
                {section === "account" && <AccountSection />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
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

function StorageSection() {
  const [maxMemoryMb, setMaxMemoryMb] = useState(2048);
  const [dataDir, setDataDir] = useState("");
  const [dataDirCustom, setDataDirCustom] = useState(false);
  const [changingDataDir, setChangingDataDir] = useState(false);

  useEffect(() => {
    readSettings().then((s) => {
      if (s.maxMemoryMb) setMaxMemoryMb(s.maxMemoryMb);
    });
    getDataDir().then((d) => {
      if (d) {
        setDataDir(d.dataDir);
        setDataDirCustom(d.isCustom);
      }
    });
  }, []);

  const handleSavePerformance = async () => {
    const current = await readSettings();
    await writeSettings({ ...current, maxMemoryMb });
    toast.success(`RAM guardada: ${maxMemoryMb} MB`);
  };

  const handleChangeDataDir = async () => {
    setChangingDataDir(true);
    try {
      const result = await chooseDataDir();
      if (result.canceled) return;
      setDataDir(result.path || dataDir);
      setDataDirCustom(true);
      toast.success("Carpeta actualizada. Reinicia ALaunchi para aplicar el cambio.");
    } finally {
      setChangingDataDir(false);
    }
  };

  if (!isElectron) {
    return <p className="text-sm text-muted-foreground px-1">Solo disponible en la app de escritorio.</p>;
  }

  return (
    <>
      <Panel icon={Cpu} title="Rendimiento" description="Memoria RAM asignada a Minecraft. Recomendado: 2–4 GB para modpacks grandes.">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Memoria máxima</Label>
            <span className="text-accent font-bold text-sm tabular-nums">
              {maxMemoryMb >= 1024 ? `${(maxMemoryMb / 1024).toFixed(1)} GB` : `${maxMemoryMb} MB`}
            </span>
          </div>
          <Slider min={512} max={16384} step={512} value={[maxMemoryMb]} onValueChange={([v]) => setMaxMemoryMb(v)} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>512 MB</span>
            <span>16 GB</span>
          </div>
        </div>
        <Button onClick={handleSavePerformance} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
          <Save className="mr-2 h-4 w-4" /> Guardar
        </Button>
      </Panel>

      <Panel icon={FolderCog} title="Ubicación de datos" description="Carpeta raíz donde ALaunchi guarda instancias, caché, Java y objetos descargados.">
        <div className="bg-background/50 border border-white/10 rounded-lg px-3 py-2.5 font-mono text-xs text-gray-300 break-all select-text">
          {dataDir || "Cargando..."}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="border-white/10" onClick={() => openDataDir()}>
            <FolderOpen className="mr-2 h-3.5 w-3.5" /> Abrir carpeta
          </Button>
          <Button variant="outline" size="sm" className="border-white/10" onClick={handleChangeDataDir} disabled={changingDataDir}>
            {changingDataDir ? "Eligiendo..." : "Cambiar carpeta..."}
          </Button>
        </div>
        {dataDirCustom && (
          <p className="text-xs text-muted-foreground">
            Los datos ya existentes no se mueven automáticamente — solo cambia dónde se guardan las cosas nuevas a partir
            del próximo reinicio.
          </p>
        )}
      </Panel>
    </>
  );
}

function PersonalizationSection() {
  const [notificationSound, setNotificationSoundState] = useState<NotificationSoundId>(() => getNotificationSound());

  const handleChange = (id: NotificationSoundId) => {
    setNotificationSoundState(id);
    setNotificationSound(id);
    playNotificationSound(id);
  };

  return (
    <>
    <ThemePanel />
    <AnimatedBackgroundPanel />
    <BackgroundPanel />
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
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="border-white/10"
          onClick={() => playNotificationSound(notificationSound)}
          disabled={notificationSound === "none"}
          title="Probar sonido"
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
    </>
  );
}

function AnimatedBackgroundPanel() {
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

/** Whether closing the window leaves ALaunchi running in the tray (default) or
 *  quits it — settings.json `closeToTray`, read by electron/main.js. */
function BackgroundPanel() {
  const [closeToTray, setCloseToTray] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readSettings()
      .then((s) => setCloseToTray(s.closeToTray !== false))
      .finally(() => setLoaded(true));
  }, []);

  const handleChange = async (on: boolean) => {
    setCloseToTray(on);
    try {
      const current = await readSettings();
      await writeSettings({ ...current, closeToTray: on });
    } catch {
      setCloseToTray(!on);
      toast.error("No se pudo guardar el ajuste.");
    }
  };

  return (
    <Panel
      icon={MonitorDown}
      title="Al cerrar la ventana"
      description={
        closeToTray
          ? "ALaunchi sigue en segundo plano (icono junto al reloj): el chat, los avisos y el tiempo jugado siguen funcionando. Para salir del todo: clic derecho en el icono → Cerrar."
          : "Cerrar la ventana cierra ALaunchi del todo. Si cierras mientras juegas, esa partida no sumará tiempo jugado y no te llegarán mensajes ni avisos."
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="close-to-tray" className="text-sm text-gray-100">
          Seguir en segundo plano
        </Label>
        <Switch id="close-to-tray" checked={closeToTray} disabled={!loaded || !isElectron} onCheckedChange={handleChange} />
      </div>
    </Panel>
  );
}

const THEMES: { id: Theme; label: string; icon: LucideIcon }[] = [
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "light", label: "Claro", icon: Sun },
];

function ThemePanel() {
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

function AccountSection() {
  const { isAuthenticated, username, uuid, email, gamertag, signedInAt, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  if (!isAuthenticated || !username || !uuid) {
    return <p className="text-sm text-muted-foreground px-1">No has iniciado sesión.</p>;
  }

  return (
    <section className={cn(GLASS, "relative p-5 overflow-hidden")}>
      <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex items-center gap-4">
          <Head uuid={uuid} username={username} className="h-16 w-16 rounded-lg shadow-lg" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Minecraft</p>
            <p className="text-xl font-bold text-white truncate">{username}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate select-text">{uuid}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <InfoTile label="Cuenta de Microsoft" value={gamertag ?? "—"} hint={gamertag ? "Gamertag de Xbox" : "Se mostrará al renovarse la sesión"} />
          <InfoTile label="Correo electrónico" value={email ?? "—"} selectable />
          <InfoTile
            label="Último inicio de sesión"
            value={
              signedInAt
                ? new Date(signedInAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })
                : "Antes de la versión 1.9.11"
            }
            hint={signedInAt ? undefined : "Se registra a partir del próximo inicio de sesión"}
          />
        </div>

        <div className="pt-1 border-t border-white/5">
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="mt-4 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
          >
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </Button>
        </div>
      </div>
    </section>
  );
}

function InfoTile({ label, value, hint, selectable }: { label: string; value: string; hint?: string; selectable?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium text-gray-100 truncate", selectable && "select-text")} title={value}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
    </div>
  );
}
