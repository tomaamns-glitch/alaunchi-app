import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { create } from "zustand";
import { GalleryHorizontal, Globe, LayoutGrid, MessagesSquare, Package } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCarouselModpacks } from "@/hooks/use-modpacks";
import { useOnlineViewMode } from "@/lib/online-view-mode";
import { CH_START, TourRunner, b, closeMenu, useTour, type Chapter, type TourStep } from "@/components/onboarding-tour";

// Walkthrough of Inicio's online-instance carousel, the first time a player
// lands on it: the instance's chat, Novedades, Participantes, Contenido, how to
// move between instances and the drawer view. Same machinery as the Hub tour
// (TourRunner); steps point at data-tour="online-…" anchors in pages/home.tsx.

const doneKey = (uuid: string) => `alaunchi_online_tour_done:${uuid}`;

function onlineTourPending(uuid: string): boolean {
  try {
    return localStorage.getItem(doneKey(uuid)) !== "1";
  } catch {
    return false;
  }
}

function markDone(uuid: string): void {
  try {
    localStorage.setItem(doneKey(uuid), "1");
  } catch {}
}

interface OnlineTourState {
  /** Asked for (Ajustes → Tutorial) and waiting for the carousel to be on screen. */
  requested: boolean;
  active: boolean;
  step: number;
  request: () => void;
  begin: () => void;
  setStep: (step: number) => void;
  end: () => void;
}

export const useOnlineTour = create<OnlineTourState>((set) => ({
  requested: false,
  active: false,
  step: 0,
  request: () => set({ requested: true }),
  begin: () => set({ requested: false, active: true, step: 0 }),
  setStep: (step) => set({ step }),
  end: () => set({ requested: false, active: false, step: 0 }),
}));

const CH_PLAY: Chapter = { label: "Tu instancia", icon: Globe };
const CH_PANELS: Chapter = { label: "Chat y paneles", icon: MessagesSquare };
const CH_MOVE: Chapter = { label: "Moverte", icon: GalleryHorizontal };

/** The tour needs the carousel view: a replay from the drawer view switches to it. */
const showCarousel = () => {
  closeMenu();
  if (useOnlineViewMode.getState().mode !== "carousel") useOnlineViewMode.getState().toggle();
};

function ViewModeSample() {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3 text-gray-300">
      <GalleryHorizontal className="h-4 w-4" />
      <span className="text-[11px] text-muted-foreground">⇄</span>
      <LayoutGrid className="h-4 w-4" />
      <span className="text-[11px] text-muted-foreground">carrusel ⇄ cajón</span>
    </div>
  );
}

function ContentSample() {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3 text-gray-300">
      <Package className="h-4 w-4 text-accent" />
      <span className="text-[11px] text-muted-foreground">Contenido es donde viven los paneles que muevas</span>
    </div>
  );
}

function buildSteps(multiple: boolean): TourStep[] {
  const steps: TourStep[] = [
    {
      chapter: CH_START,
      title: "Tu instancia online",
      body: "Esta es la pantalla de tus instancias online: las que publica un admin para jugar todos juntos. Te enseñamos qué hay en ella en un momento.",
      enter: showCarousel,
    },
    {
      chapter: CH_PLAY,
      target: "online-play",
      title: "Instalar y jugar",
      body: (
        <>
          Con este botón instalas la instancia, la actualizas cuando el admin publica algo nuevo y la lanzas. Ya dentro
          del juego, {b("F10")} abre el panel de ALaunchi encima de Minecraft si lo activas en Ajustes.
        </>
      ),
      enter: closeMenu,
    },
    {
      chapter: CH_PANELS,
      target: "online-group-chat",
      title: "Chat de la instancia",
      body: (
        <>
          Cada instancia online tiene su {b("propio chat grupal")}, con todos los participantes. Es independiente de tus
          chats privados y el número rojo son los mensajes sin leer. Con el {b("clic derecho")} sobre el botón lo mueves
          a la pantalla de Contenido.
        </>
      ),
      enter: closeMenu,
    },
    {
      chapter: CH_PANELS,
      target: "online-changelog",
      title: "Novedades",
      body: "Aquí ves qué ha cambiado en cada actualización de la instancia: mods nuevos, quitados o actualizados. También se muestra antes de actualizar, para que sepas qué vas a recibir.",
      enter: closeMenu,
    },
    {
      chapter: CH_PANELS,
      target: "online-members",
      title: "Participantes",
      body: "Quién tiene acceso a la instancia, quién está jugando ahora mismo y cuándo jugó cada uno por última vez. Desde ahí puedes abrir el perfil o escribir a cualquiera.",
      enter: closeMenu,
    },
    {
      chapter: CH_PANELS,
      target: "online-content",
      title: "Contenido",
      body: "Abre el gestor de la instancia: mods, shaders, resource packs, capturas y más, con búsqueda e instalación desde Modrinth y la Biblioteca. Los paneles de Novedades, Participantes y el chat también se pueden colocar ahí, arrastrándolos a otra columna.",
      enter: closeMenu,
    },
  ];
  if (multiple) {
    steps.push({
      chapter: CH_MOVE,
      target: "online-next",
      title: "Pasar entre instancias",
      body: (
        <>
          Tienes varias instancias online. Cambia de una a otra con las {b("flechas")} de los lados, {b("arrastrando")} el
          banner o con los puntos que aparecen abajo al moverte. Se recuerda en cuál te quedaste.
        </>
      ),
      enter: closeMenu,
    });
  }
  steps.push(
    {
      chapter: CH_MOVE,
      target: "titlebar-view-mode",
      title: "Modo cajón",
      body: (
        <>
          Este botón cambia entre el {b("carrusel")} (una instancia grande cada vez) y el {b("cajón")}: todas tus
          instancias online juntas en cuadrícula, con quién está jugando en cada una. Se recuerda en este equipo y
          puedes volver cuando quieras.
        </>
      ),
      sample: <ViewModeSample />,
      enter: closeMenu,
    },
    {
      chapter: CH_START,
      title: "¡Eso es todo!",
      body: (
        <>
          Puedes repasar este recorrido cuando quieras en Configuración → Personalización → Tutorial. Para mover un panel
          del pie a Contenido: {b("clic derecho")} sobre su botón.
        </>
      ),
      sample: <ContentSample />,
      enter: closeMenu,
    }
  );
  return steps;
}

export function OnlineTour() {
  const [location] = useLocation();
  const uuid = useAuth((s) => s.uuid);
  const { requested, active, step, begin, setStep, end } = useOnlineTour();
  const packs = useCarouselModpacks();
  const mode = useOnlineViewMode((s) => s.mode);
  const onHome = location === "/";
  const hasPack = packs.length > 0;
  const multiple = packs.length > 1;
  const steps = useMemo(() => buildSteps(multiple), [multiple]);

  // The first time they reach the carousel with something in it (never while
  // the Hub walkthrough is running, so the two don't stack).
  const hubTourBusy = useTour((t) => t.active || t.requested);
  useEffect(() => {
    if (!uuid || !onHome || !hasPack || mode !== "carousel" || active || requested || hubTourBusy) return;
    if (!onlineTourPending(uuid)) return;
    useOnlineTour.getState().request();
  }, [uuid, onHome, hasPack, mode, active, requested, hubTourBusy]);

  // Starts once the footer's buttons exist (the catalog loads after the page).
  useEffect(() => {
    if (!requested || !onHome || !hasPack) return;
    const t = window.setInterval(() => {
      if (document.querySelector('[data-tour="online-play"]')) {
        window.clearInterval(t);
        window.setTimeout(begin, 500);
      }
    }, 300);
    return () => window.clearInterval(t);
  }, [requested, onHome, hasPack, begin]);

  // Leaving Inicio ends it.
  useEffect(() => {
    if ((active || requested) && !onHome) end();
  }, [active, requested, onHome, end]);

  if (!active || !onHome) return null;
  const finish = () => {
    if (uuid) markDone(uuid);
    closeMenu();
    end();
  };
  return <TourRunner steps={steps} step={Math.min(step, steps.length - 1)} setStep={setStep} onFinish={finish} skippable={!!uuid && !onlineTourPending(uuid)} />;
}
