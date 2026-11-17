import { Hint } from "@/components/hint";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Box, ChevronRight, EyeOff, Server, Share2, Shirt, Smile, Star, TriangleAlert, UploadCloud, X, type LucideIcon } from "lucide-react";
import { useTour } from "@/components/onboarding-tour";
import { useOnlineTour } from "@/components/online-tour";
import { useManagerTour } from "@/components/manager-tour";
import { CURSEFORGE_IMPORT_ENABLED, CurseForgeLogo } from "@/components/curseforge-import-dialog";
import { notify } from "@/lib/toast";

// "Curiosidades": small tips that rotate in the corner of Mis instancias and the
// online instances page, same card as the manager's "Arrastra y suelta" reminder.
// Each stays 30 s, then the next one, until all have been shown or the player
// closes it; then it rests for REAPPEAR_MS and comes back where it left off.
// Clicking the card enlarges it and shows "No mostrar más" (off for good, see
// OFF_KEY; back on from Ajustes → Personalización).

const SHOW_MS = 30_000;
const REAPPEAR_MS = 20 * 60_000;
const FIRST_DELAY_MS = 4_000;
const STATE_KEY = "alaunchi_curiosities";
/** TEMPORAL, para probar: salen ya y en bucle, sin descanso ni memoria. Poner a false para el comportamiento normal. */
const TEST_LOOP = false;

interface Curiosity {
  icon: LucideIcon | typeof CurseForgeLogo;
  title: string;
  text: string;
}

const CURIOSITIES: Curiosity[] = [
  {
    icon: Smile,
    title: "Emotes",
    text: "Si instalas el mod Emotecraft, el gestor de contenido habilita la sección de emotes para previsualizarlos.",
  },
  {
    icon: Box,
    title: "Esquemas",
    text: "Si instalas un mod como Litematica o Schematica, el gestor habilita una sección para gestionar y previsualizar tus estructuras.",
  },
  {
    icon: UploadCloud,
    title: "Arrastra y suelta",
    text: "Si arrastras un archivo descargado de internet (mod, resource pack, esquema…) a la instancia, se guarda solo en su carpeta.",
  },
  {
    icon: TriangleAlert,
    title: "Contenido fuera de Modrinth",
    text: "Lo que importes de fuera de Modrinth no tendrá soporte del launcher: ni actualizaciones ni acceso a su descarga.",
  },
  // Only while the CurseForge import button is shown (CURSEFORGE_IMPORT_ENABLED).
  ...(CURSEFORGE_IMPORT_ENABLED
    ? [
        {
          icon: CurseForgeLogo,
          title: "Trae tus instancias",
          text: "¡Puedes importar tus instancias de CurseForge a ALaunchi!",
        },
      ]
    : []),
  {
    icon: Star,
    title: "Favoritos",
    text: "Con clic derecho en cualquier contenido puedes añadirlo a favoritos y compartirlo en tu perfil para que otros lo disfruten.",
  },
  {
    icon: Shirt,
    title: "Personalízate",
    text: "Cambia tu avatar, skin y banner desde el botón de tu nombre en la barra inferior. ¡Que los demás lo flipen!",
  },
  {
    icon: Share2,
    title: "Comparte instancias",
    text: "Destaca tus instancias en el perfil, o haz clic derecho sobre una y elige a un usuario para enviársela.",
  },
  {
    icon: Server,
    title: "Tus servers",
    text: "Guarda las IPs de tus servers favoritos, añádelos a tus instancias o compártelos con tus amigos desde tu menú.",
  },
];

interface Saved {
  /** The curiosity to show next. */
  next: number;
  /** Not before this time. */
  nextAt: number;
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (v && Number.isInteger(v.next) && typeof v.nextAt === "number") {
      return { next: ((v.next % CURIOSITIES.length) + CURIOSITIES.length) % CURIOSITIES.length, nextAt: v.nextAt };
    }
  } catch {}
  return { next: 0, nextAt: 0 };
}

function save(state: Saved): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

// "No mostrar más" (button on the enlarged card), undone from Ajustes →
// Personalización → Curiosidades.
const OFF_KEY = "alaunchi_curiosities_off";

export function curiositiesDisabled(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCuriositiesDisabled(off: boolean): void {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {}
}

export function CuriositiesCard({ className }: { className?: string }) {
  // Turned off for good ("No mostrar más"): nothing is scheduled at all.
  const [off, setOff] = useState(curiositiesDisabled);
  // null = resting; otherwise the curiosity on screen.
  const [shown, setShown] = useState<number | null>(null);
  // Click on the card: a bit bigger (back to normal with another click or on the next one).
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [shown]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Clicking anywhere else shrinks it back.
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [expanded]);
  const stateRef = useRef<Saved>(load());
  // All three hooks always run: `||` between hooks would change the hook count.
  const tourBusy = useTour((t) => t.active || t.requested);
  const onlineTourBusy = useOnlineTour((t) => t.active || t.requested);
  const managerTourBusy = useManagerTour((t) => !!t.active || !!t.requested);
  const busy = tourBusy || onlineTourBusy || managerTourBusy;

  // Resting → wait for its time, then show the saved one.
  useEffect(() => {
    if (off || shown !== null || busy) return;
    const wait = TEST_LOOP ? 0 : Math.max(FIRST_DELAY_MS, stateRef.current.nextAt - Date.now());
    const t = window.setTimeout(() => setShown(stateRef.current.next), wait);
    return () => window.clearTimeout(t);
  }, [off, shown, busy]);

  // On screen → 30 s, then the next one (or rest after the last). The clock
  // stops while it's enlarged and starts over when it shrinks back.
  useEffect(() => {
    if (shown === null || expanded) return;
    const t = window.setTimeout(() => advance(shown), SHOW_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, expanded]);

  /** Moves on from curiosity `from`: the next one, or rest when it was the last. */
  const advance = (from: number) => {
    const next = from + 1;
    if (TEST_LOOP) {
      setShown(next % CURIOSITIES.length);
    } else if (next >= CURIOSITIES.length) {
      stateRef.current = { next: 0, nextAt: Date.now() + REAPPEAR_MS };
      save(stateRef.current);
      setShown(null);
    } else {
      stateRef.current = { next, nextAt: 0 };
      save(stateRef.current);
      setShown(next);
    }
  };

  /** Closed by the player: rest, and come back with the following one. */
  const close = () => {
    if (shown === null) return;
    if (TEST_LOOP) {
      setShown((shown + 1) % CURIOSITIES.length);
      return;
    }
    stateRef.current = { next: (shown + 1) % CURIOSITIES.length, nextAt: Date.now() + REAPPEAR_MS };
    save(stateRef.current);
    setShown(null);
  };

  /** The player moves to the next one by hand (after the last, back to the first). */
  const skip = () => {
    if (shown === null) return;
    const next = (shown + 1) % CURIOSITIES.length;
    if (!TEST_LOOP) {
      stateRef.current = { next, nextAt: 0 };
      save(stateRef.current);
    }
    setShown(next);
  };

  /** "No mostrar más": never again (until re-enabled in Ajustes). */
  const turnOff = () => {
    setCuriositiesDisabled(true);
    setOff(true);
    setShown(null);
    notify("No volverán a salir curiosidades.", {
      description: "Puedes volver a activarlas en Ajustes → Personalización.",
    });
  };

  const item = !off && shown !== null && !busy ? CURIOSITIES[shown] : null;

  return (
    <AnimatePresence mode="wait">
      {item && (
        <motion.div
          ref={cardRef}
          key={shown}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, width: expanded ? 344 : 264 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={() => setExpanded((v) => !v)}
          className={`group absolute z-20 cursor-pointer overflow-hidden rounded-md border border-accent/20 bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${className ?? ""}`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]"
          />
          <div className="flex items-start gap-3 p-3 pr-14">
            <span className={`mt-0.5 flex shrink-0 items-center justify-center rounded-md bg-accent/15 transition-all duration-200 ${expanded ? "h-10 w-10" : "h-8 w-8"} text-accent shadow-[0_0_14px_hsl(var(--accent)/0.25)]`}>
              <item.icon className={expanded ? "h-5 w-5" : "h-4 w-4"} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                Curiosidad
              </p>
              <p className={`mt-0.5 font-semibold text-white transition-all duration-200 ${expanded ? "text-sm" : "text-xs"}`}>{item.title}</p>
              <p className={`mt-0.5 leading-snug text-muted-foreground transition-all duration-200 ${expanded ? "text-xs" : "text-[11px]"}`}>{item.text}</p>
            </div>
          </div>
          <Hint label="Siguiente">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                skip();
              }}
              aria-label="Siguiente curiosidad"
              className="absolute right-8 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </Hint>
          <Hint label="Cerrar">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label="Cerrar curiosidad"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Hint>
          {/* Only on the enlarged card (after clicking it): turn them off for good. */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="flex justify-end px-3 pb-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      turnOff();
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-gray-200 transition-colors hover:bg-white/[0.12] hover:text-white"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    No mostrar más
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Time left on this one. */}
          <motion.div
            aria-hidden
            initial={{ scaleX: 1 }}
            animate={{ scaleX: expanded ? 1 : 0 }}
            transition={{ duration: expanded ? 0.2 : SHOW_MS / 1000, ease: "linear" }}
            style={{ transformOrigin: "left" }}
            className="h-0.5 bg-accent/60"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
