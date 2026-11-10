import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { toast, notify } from "@/lib/toast";
import { Box, Globe, Image as ImageIcon, LayoutGrid, ListChecks, Lock, Package, Sparkles, Upload, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTour, CH_START, TourRunner, b, type Chapter, type TourStep } from "@/components/onboarding-tour";
import { useOnlineTour } from "@/components/online-tour";
import { Switch } from "@/components/ui/switch";

// Two short walkthroughs of the instance manager (/modpack/:id), the first time
// each kind is opened: a private instance (installing / managing content, and
// dropping files onto the window) and an online one (mandatory vs optional
// content, and the creator's content lock). Steps point at the
// data-tour="manager-…" anchors in pages/modpack-detail.tsx; when one isn't on
// screen (e.g. an instance without optional files) the step is a centered card
// with a static sample instead.

export type ManagerTourKind = "private" | "online";

const doneKey = (kind: ManagerTourKind, uuid: string) => `alaunchi_manager_tour_done:${kind}:${uuid}`;

function pending(kind: ManagerTourKind, uuid: string): boolean {
  try {
    return localStorage.getItem(doneKey(kind, uuid)) !== "1";
  } catch {
    return false;
  }
}

function markDone(kind: ManagerTourKind, uuid: string): void {
  try {
    localStorage.setItem(doneKey(kind, uuid), "1");
  } catch {}
}

interface ManagerTourState {
  /** Asked for (Ajustes → Tutorial); waiting for a manager of that kind to be on screen. */
  requested: ManagerTourKind | null;
  active: ManagerTourKind | null;
  /** The online tour running right after the private one, as a single walkthrough. */
  chained: boolean;
  step: number;
  request: (kind: ManagerTourKind) => void;
  begin: (kind: ManagerTourKind, chained?: boolean) => void;
  setStep: (step: number) => void;
  end: () => void;
}

export const useManagerTour = create<ManagerTourState>((set) => ({
  requested: null,
  active: null,
  chained: false,
  step: 0,
  request: (kind) => set({ requested: kind }),
  begin: (kind, chained = false) => set({ requested: null, active: kind, chained, step: 0 }),
  setStep: (step) => set({ step }),
  end: () => set({ requested: null, active: null, chained: false, step: 0 }),
}));

/** Ajustes → Tutorial: sends the player to an instance of that kind and starts it. */
export async function startManagerTour(
  kind: ManagerTourKind,
  go: (path: string) => void,
  pick: () => Promise<string | undefined>
): Promise<void> {
  const id = await pick();
  if (!id) {
    notify.info(
      kind === "private" ? "Crea o importa una instancia privada para ver este tutorial." : "Instala una instancia online para ver este tutorial."
    );
    return;
  }
  useManagerTour.getState().request(kind);
  go(`/modpack/${id}`);
}

// ── Samples ──────────────────────────────────────────────────────────────────

function SampleFrame({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">{children}</div>;
}

function DropSample() {
  return (
    <SampleFrame>
      <div className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-accent/50 bg-accent/5 py-4">
        <div className="flex items-center gap-3 text-accent">
          <Package className="h-4 w-4" />
          <Sparkles className="h-4 w-4" />
          <ImageIcon className="h-4 w-4" />
          <Box className="h-4 w-4" />
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-gray-300">
          <Upload className="h-3 w-3" /> Suelta aquí el .jar, .zip o esquema
        </span>
      </div>
    </SampleFrame>
  );
}

function SampleRow({ name, tag, locked }: { name: string; tag: string; locked?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-card/50 px-2.5 py-2">
      <div className="h-8 w-8 shrink-0 rounded bg-black/30 flex items-center justify-center">
        <Package className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-gray-100">{name}</p>
        <p className="text-[10px] text-muted-foreground">{tag}</p>
      </div>
      {locked ? (
        <Lock className="h-3.5 w-3.5 opacity-40" />
      ) : (
        <>
          <Switch checked className="scale-75 data-[state=checked]:bg-accent" aria-hidden tabIndex={-1} />
          <X className="h-4 w-4 text-muted-foreground" />
        </>
      )}
    </div>
  );
}

function MandatoryOptionalSample() {
  return (
    <SampleFrame>
      <div className="space-y-1.5">
        <SampleRow name="Mod del modpack" tag="Obligatorio" locked />
        <SampleRow name="Mod que añadiste tú" tag="Opcional" />
      </div>
    </SampleFrame>
  );
}

function LockSample() {
  return (
    <SampleFrame>
      <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-white/10 bg-white/5 text-xs font-semibold text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Contenido bloqueado
      </span>
    </SampleFrame>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

const CH_BROWSE: Chapter = { label: "Tu contenido", icon: LayoutGrid };
const CH_ADD: Chapter = { label: "Añadir contenido", icon: Package };
const CH_RULES: Chapter = { label: "Qué se puede tocar", icon: ListChecks };
const CH_LOCK: Chapter = { label: "Bloqueo", icon: Globe };

const PRIVATE_STEPS: TourStep[] = [
  {
    chapter: CH_START,
    title: "Gestor de instancias",
    body: "Desde aquí controlas todo lo que lleva tu instancia: mods, shaders, resource packs y más. Te lo contamos en un momento.",
  },
  {
    chapter: CH_BROWSE,
    target: "manager-categories",
    title: "Contenido por categorías",
    body: "Cada pestaña es un tipo de contenido y el número es cuántos archivos tienes. Según lo que uses también aparecen Emotes y Esquemas.",
  },
  {
    chapter: CH_BROWSE,
    target: "manager-list",
    title: "Gestiona lo instalado",
    body: (
      <>
        En cada fila puedes {b("activar o desactivar")} un mod sin borrarlo, {b("actualizarlo")} si hay versión nueva o
        quitarlo con la {b("X")}. Pasando el ratón por la fila sale una casilla para marcar varios a la vez, y con el clic
        derecho puedes guardarlo en tu biblioteca o compartirlo.
      </>
    ),
  },
  {
    chapter: CH_ADD,
    target: "manager-install",
    title: "Instalar desde Modrinth",
    body: "Busca mods, shaders o resource packs y se instalan con un clic, con sus dependencias. En los mods tienes además la Biblioteca de mods del grupo.",
  },
  {
    chapter: CH_ADD,
    title: "O arrástralo a la ventana",
    body: (
      <>
        Si tienes el archivo, {b("arrástralo directamente a esta ventana")}: ALaunchi lo reconoce (mod, shader, resource
        pack, esquema, emote…) y lo mete en su sitio dentro de la instancia. No hace falta abrir la carpeta ni
        colocarlo a mano.
      </>
    ),
    sample: <DropSample />,
  },
  {
    chapter: CH_START,
    title: "¡Listo!",
    body: "Puedes volver a ver este recorrido en Configuración → Personalización → Tutorial.",
  },
];

const ONLINE_STEPS: TourStep[] = [
  {
    chapter: CH_START,
    title: "Contenido de una instancia online",
    body: "Una instancia online la prepara un admin. Aquí ves lo que lleva y qué parte puedes cambiar tú.",
  },
  {
    chapter: CH_RULES,
    target: "manager-locked",
    title: "Contenido obligatorio",
    body: (
      <>
        Lo que lleva el {b("candado")} es obligatorio: el admin lo ha puesto para que la instancia funcione como la
        pensó, y todos jueguen con lo mismo. No se puede quitar, desactivar ni cambiar de versión; se actualiza solo
        cuando el admin publica una novedad.
      </>
    ),
    sample: <MandatoryOptionalSample />,
  },
  {
    chapter: CH_RULES,
    target: "manager-optional",
    title: "Contenido opcional",
    body: (
      <>
        Lo opcional es tuyo: puedes {b("desactivarlo, actualizarlo o quitarlo")} cuando quieras, y añadir más con el botón
        de instalar, la Biblioteca o arrastrando el archivo a esta ventana. Lo que añadas no afecta a los demás.
      </>
    ),
    sample: <MandatoryOptionalSample />,
  },
  {
    chapter: CH_LOCK,
    target: "manager-locked-badge",
    title: "Instancias con contenido bloqueado",
    body: (
      <>
        El admin puede {b("bloquear la personalización")} de la instancia: entonces no se puede añadir ni eliminar ningún
        archivo de mods, shaders ni resource packs. Los botones de instalar desaparecen y lo que metas a mano en las
        carpetas se borra. Si ves este aviso, la instancia es exactamente la del admin.
      </>
    ),
    sample: <LockSample />,
  },
  {
    chapter: CH_START,
    title: "¡Listo!",
    body: "Puedes volver a ver este recorrido en Configuración → Personalización → Tutorial.",
  },
];

const STEPS_BY_KIND: Record<ManagerTourKind, TourStep[]> = { private: PRIVATE_STEPS, online: ONLINE_STEPS };

// Someone whose first manager is an online instance never saw the private one:
// its steps (how content is browsed, installed and dropped in) apply here too,
// so both play as one continuous walkthrough instead of being skipped.
const BRIDGE_STEP: TourStep = {
  chapter: CH_START,
  title: "Y en las instancias online…",
  body: "Todo lo anterior vale también para las instancias online, con una diferencia: parte del contenido lo decide el admin. Veamos qué puedes tocar y qué no.",
};
const CHAINED_STEPS: TourStep[] = [...PRIVATE_STEPS.slice(0, -1), BRIDGE_STEP, ...ONLINE_STEPS.slice(1)];

/** Mounted by the instance manager; `kind` is what the open instance is. */
export function ManagerTour({ kind, ready }: { kind: ManagerTourKind; ready: boolean }) {
  const uuid = useAuth((s) => s.uuid);
  const { requested, active, chained, step, begin, setStep, end } = useManagerTour();
  const hubTourBusy = useTour((t) => t.active || t.requested);
  const onlineTourBusy = useOnlineTour((t) => t.active || t.requested);
  const otherBusy = hubTourBusy || onlineTourBusy;
  const steps = useMemo(() => (chained ? CHAINED_STEPS : STEPS_BY_KIND[kind]), [kind, chained]);

  // First time this kind of instance is opened.
  useEffect(() => {
    if (!uuid || !ready || active || requested || otherBusy) return;
    if (pending(kind, uuid)) useManagerTour.getState().request(kind);
  }, [uuid, ready, kind, active, requested, otherBusy]);

  // Starts once the content list is on screen.
  useEffect(() => {
    if (requested !== kind || !ready) return;
    const t = window.setInterval(() => {
      if (document.querySelector('[data-tour="manager-list"]')) {
        window.clearInterval(t);
        // Decided here and kept for the whole run (finishing marks "private" done).
        window.setTimeout(() => begin(kind, kind === "online" && !!uuid && pending("private", uuid)), 500);
      }
    }, 300);
    return () => window.clearInterval(t);
  }, [requested, kind, ready, begin, uuid]);

  // Leaving the manager ends it (this component unmounts with it).
  useEffect(() => () => end(), [end]);

  if (active !== kind) return null;
  const finish = () => {
    if (uuid) {
      markDone(kind, uuid);
      if (chained) markDone("private", uuid);
    }
    end();
  };
  return <TourRunner steps={steps} step={Math.min(step, steps.length - 1)} setStep={setStep} onFinish={finish} skippable={!!uuid && !pending(kind, uuid) && (!chained || !pending("private", uuid))} />;
}
