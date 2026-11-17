import { Hint } from "@/components/hint";
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
import { toast, notify } from "@/lib/toast";
import {
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
  Compass,
  Gamepad2,
  Joystick,
  Trash2,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { useTour } from "@/components/onboarding-tour";
import { useOnlineTour } from "@/components/online-tour";
import { startManagerTour } from "@/components/manager-tour";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useModpacks } from "@/hooks/use-modpacks";
import { Switch } from "@/components/ui/switch";
import { readSettings, writeSettings, isElectron, getDataDir, chooseDataDir, openDataDir, checkOverlayShortcut, DEFAULT_OVERLAY_SHORTCUT } from "@/services/electron";
import {
  NOTIFICATION_SOUNDS,
  getNotificationSound,
  setNotificationSound,
  playNotificationSound,
  type NotificationSoundId,
} from "@/lib/notification-sound";
import { Panel } from "@/components/launcher-appearance";
import { cn } from "@/lib/utils";
import { DeleteMyDataDialog } from "@/components/delete-my-data-dialog";
import { curiositiesDisabled, setCuriositiesDisabled } from "@/components/curiosities-card";

type SectionId = "storage" | "personalization" | "developer" | "account";

const SECTIONS: { id: SectionId; label: string; description: string; icon: LucideIcon }[] = [
  { id: "storage", label: "Archivos y RAM", description: "Dónde se guarda todo y cuánta memoria usa Minecraft", icon: HardDrive },
  { id: "personalization", label: "Personalización", description: "Apariencia, sonidos y avisos", icon: Palette },
  { id: "developer", label: "Modo desarrollador", description: "Tu repositorio para publicar instancias online", icon: Code2 },
  { id: "account", label: "Mi cuenta", description: "Tu cuenta de Minecraft y de Microsoft", icon: UserCircle2 },
];

const GLASS = "rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md";
const SECTION_KEY = "alaunchi_settings_section";

export default function Settings() {
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
          {/* "Volver" lives in the titlebar, same as every other page. */}
          <div className="relative flex items-center gap-3">
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
      notify.success("Carpeta actualizada. Reinicia ALaunchi para aplicar el cambio.");
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
  return (
    <>
    <BackgroundPanel />
    <DiscordPanel />
    <IngameOverlayPanel />
    <TourPanel />
    <CuriositiesPanel />
    </>
  );
}

/** The rotating tips in Mis instancias / online instances (curiosities-card.tsx);
 *  "No mostrar más" on an enlarged one turns them off, this turns them back on. */
function CuriositiesPanel() {
  const [enabled, setEnabled] = useState(() => !curiositiesDisabled());
  return (
    <Panel
      icon={Lightbulb}
      title="Curiosidades"
      description="Consejos sobre ALaunchi que salen de vez en cuando en la esquina de Mis instancias y de las instancias online."
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="curiosities" className="text-sm text-gray-100">
          Mostrar curiosidades
        </Label>
        <Switch
          id="curiosities"
          checked={enabled}
          onCheckedChange={(on) => {
            setCuriositiesDisabled(!on);
            setEnabled(on);
          }}
        />
      </div>
    </Panel>
  );
}

function TourPanel() {
  const [, setLocation] = useLocation();
  return (
    <Panel
      icon={Compass}
      title="Tutorial"
      description="El recorrido rápido por ALaunchi que sale la primera vez que inicias sesión: instancias, tu menú, el personaje y las instancias online."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-white/10"
          onClick={() => {
            useTour.getState().request();
            setLocation("/hub");
          }}
        >
          Ver el tutorial de nuevo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/10"
          onClick={() => {
            useOnlineTour.getState().request();
            setLocation("/");
          }}
        >
          Instancias online
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/10"
          onClick={() =>
            startManagerTour("private", setLocation, async () => {
              await useCustomInstances.getState().loadInstances().catch(() => {});
              return useCustomInstances.getState().instances[0]?.id;
            })
          }
        >
          Gestor de instancias privadas
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/10"
          onClick={() =>
            startManagerTour("online", setLocation, async () => useModpacks.getState().modpacks.find((m) => m.installed)?.id)
          }
        >
          Contenido de instancias online
        </Button>
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

/** Discord Rich Presence ("Jugando a Minecraft · <instancia>") — settings.json
 *  `discordPresence`, read by electron/main.js. */
function DiscordPanel() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readSettings()
      .then((s) => setEnabled(s.discordPresence !== false))
      .finally(() => setLoaded(true));
  }, []);

  const handleChange = async (on: boolean) => {
    setEnabled(on);
    try {
      const current = await readSettings();
      await writeSettings({ ...current, discordPresence: on });
    } catch {
      setEnabled(!on);
      toast.error("No se pudo guardar el ajuste.");
    }
  };

  return (
    <Panel
      icon={Gamepad2}
      title="Actividad en Discord"
      description="Muestra en tu perfil de Discord que tienes ALaunchi abierto y, mientras juegas, la instancia a la que juegas. Necesita la app de Discord abierta en este equipo."
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="discord-presence" className="text-sm text-gray-100">
          Mostrar en Discord
        </Label>
        <Switch id="discord-presence" checked={enabled} disabled={!loaded || !isElectron} onCheckedChange={handleChange} />
      </div>
    </Panel>
  );
}

/** Turns a keydown into an Electron accelerator ("Alt+X", "Ctrl+Shift+F8"...),
 *  or null while only modifiers are held / for keys we don't map. */
function acceleratorFromEvent(e: React.KeyboardEvent): string | null {
  const { code } = e;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code;
  else if (/^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`;
  else key = ({ Space: "Space", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown" } as Record<string, string>)[code] ?? null;
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
  // A bare letter/number would be stolen from the game itself (movement, hotbar...).
  if (!mods.length && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join("+");
}

/** Overlay over Minecraft (notice in the corner + panel on a shortcut) —
 *  settings.json `ingameOverlay` (off by default) and `ingameOverlayShortcut`,
 *  read by electron/main.js. */
function IngameOverlayPanel() {
  const [enabled, setEnabled] = useState(false);
  const [shortcut, setShortcut] = useState(DEFAULT_OVERLAY_SHORTCUT);
  const [recording, setRecording] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readSettings()
      .then((s) => {
        setEnabled(s.ingameOverlay === true);
        if (typeof s.ingameOverlayShortcut === "string" && s.ingameOverlayShortcut.trim()) setShortcut(s.ingameOverlayShortcut);
      })
      .finally(() => setLoaded(true));
  }, []);

  const save = async (patch: Record<string, unknown>) => {
    const current = await readSettings();
    await writeSettings({ ...current, ...patch });
  };

  const handleToggle = async (on: boolean) => {
    setEnabled(on);
    try {
      await save({ ingameOverlay: on });
    } catch {
      setEnabled(!on);
      toast.error("No se pudo guardar el ajuste.");
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    e.preventDefault();
    if (e.key === "Escape") return setRecording(false);
    const accel = acceleratorFromEvent(e);
    if (!accel) return;
    setRecording(false);
    if (accel === shortcut) return;
    if (/(^|\+)F12$/.test(accel)) {
      toast.error("Windows reserva F12 para depuradores: elige otra tecla.");
      return;
    }
    const check = await checkOverlayShortcut(accel);
    if (!check.ok) {
      toast.error(check.reason === "taken" ? `${accel} ya lo usa otra aplicación.` : `${accel} no se puede usar como atajo.`);
      return;
    }
    const previous = shortcut;
    setShortcut(accel);
    try {
      await save({ ingameOverlayShortcut: accel });
    } catch {
      setShortcut(previous);
      toast.error("No se pudo guardar el atajo.");
    }
  };

  return (
    <Panel
      icon={Joystick}
      title="ALaunchi dentro del juego"
      description="Al abrir Minecraft aparece un aviso en la esquina, y con el atajo se abre una ventana de ALaunchi encima del juego. Funciona en modo ventana o pantalla completa sin bordes."
    >
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="ingame-overlay" className="text-sm text-gray-100">
          Activar en el juego
        </Label>
        <Switch id="ingame-overlay" checked={enabled} disabled={!loaded || !isElectron} onCheckedChange={handleToggle} />
      </div>
      <div className={cn("flex items-center justify-between gap-3", !enabled && "opacity-50")}>
        <div className="min-w-0">
          <p className="text-sm text-gray-100">Atajo</p>
          <p className="text-xs text-muted-foreground">
            {recording ? "Pulsa la combinación (Esc para cancelar)" : "Combina Ctrl, Alt o Shift con una tecla, o usa F1–F12."}
          </p>
        </div>
        <button
          type="button"
          disabled={!enabled || !loaded || !isElectron}
          onClick={() => setRecording(true)}
          onKeyDown={recording ? handleKeyDown : undefined}
          onBlur={() => setRecording(false)}
          className={cn(
            "shrink-0 min-w-24 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors",
            recording ? "border-accent text-accent animate-pulse" : "border-white/15 text-gray-100 hover:border-white/30",
          )}
        >
          {recording ? "…" : shortcut}
        </button>
      </div>
    </Panel>
  );
}

function AccountSection() {
  const { isAuthenticated, username, uuid, email, gamertag, signedInAt, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);

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

        <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-100">Borrar mis datos</p>
            <p className="text-xs text-muted-foreground">
              Elimina de los servidores de ALaunchi tu perfil, amigos, chats y accesos. No se puede deshacer.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Borrar datos
          </Button>
        </div>
      </div>
      <DeleteMyDataDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
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
