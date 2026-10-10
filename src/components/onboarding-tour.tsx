import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import {
  Box,
  Camera,
  Check,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  MessagesSquare,
  Minus,
  Package,
  Paperclip,
  Send,
  Server as ServerIcon,
  Shirt,
  Smile,
  Sparkles,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InstanceLogo } from "@/components/invite-bubbles";
import { useAuth } from "@/hooks/use-auth";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";

// First-login walkthrough of the Hub, in chapters: private instances, your
// character, chat & friends, and online instances (how they unlock). Steps
// point at elements tagged data-tour="…"; things that may not be on screen
// yet for a new player (chat bubbles, an invite, the chat's share bar) are
// shown as static samples inside the card instead.

const doneKey = (uuid: string) => `alaunchi_tour_done:${uuid}`;
// Set by the login screen for the session in which the device-code login
// happened — the tour only starts on its own after a real sign-in, not for
// players who were already logged in when the update arrived.
const JUST_SIGNED_IN_KEY = "alaunchi_just_signed_in";

export function markJustSignedIn(): void {
  try {
    sessionStorage.setItem(JUST_SIGNED_IN_KEY, "1");
  } catch {}
}

/** True when this player hasn't finished (or skipped) the tour yet. */
export function tourPending(uuid: string): boolean {
  try {
    return localStorage.getItem(doneKey(uuid)) !== "1";
  } catch {
    return false;
  }
}

function markTourDone(uuid: string): void {
  try {
    localStorage.setItem(doneKey(uuid), "1");
  } catch {}
}

interface TourState {
  /** Asked for (from login or Ajustes) but waiting for the Hub to be on screen. */
  requested: boolean;
  active: boolean;
  step: number;
  request: () => void;
  begin: () => void;
  setStep: (step: number) => void;
  end: () => void;
}

export const useTour = create<TourState>((set) => ({
  requested: false,
  active: false,
  step: 0,
  request: () => set({ requested: true }),
  begin: () => set({ requested: false, active: true, step: 0 }),
  setStep: (step) => set({ step }),
  end: () => set({ requested: false, active: false, step: 0 }),
}));

// ── Samples shown inside the card ────────────────────────────────────────────
// Same look as the real thing (chat-bubble-row.tsx, invite-bubbles.tsx,
// chat-window.tsx), just static.

function SampleHead({ name, size = "h-full w-full" }: { name: string; size?: string }) {
  return (
    <Avatar className={`${size} rounded-md`}>
      <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">{name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

function SampleFrame({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">{children}</div>;
}

function ChatBubblesSample() {
  return (
    <SampleFrame>
      <div className="flex items-center gap-1.5">
        <div className="h-9 px-3 flex items-center gap-2 rounded-lg bg-white/5 border border-white/5">
          <User className="h-4 w-4 text-gray-300" />
          <span className="h-2 w-2 rounded-full bg-green-400" />
        </div>
        <div className="relative h-9 w-9 rounded-md border border-accent bg-accent/15">
          <SampleHead name="Alex" />
        </div>
        <div className="relative h-9 w-9 rounded-md border border-white/10 bg-white/5">
          <SampleHead name="Mario" />
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold border border-card flex items-center justify-center">
            2
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Minus className="h-3 w-3" /> minimiza, sigue fijado
        </span>
        <span className="flex items-center gap-1">
          <X className="h-3 w-3" /> lo quita de la barra
        </span>
      </div>
    </SampleFrame>
  );
}

const SHARE_CATEGORIES: { icon: LucideIcon; label: string }[] = [
  { icon: Package, label: "Mods" },
  { icon: Sparkles, label: "Shaders" },
  { icon: ImageIcon, label: "Texturas" },
  { icon: Smile, label: "Emotes" },
  { icon: Box, label: "Esquemas" },
  { icon: Shirt, label: "Skins" },
  { icon: Camera, label: "Capturas" },
];

function ShareBarSample() {
  return (
    <SampleFrame>
      <div className="flex flex-wrap gap-1 mb-2.5">
        {SHARE_CATEGORIES.map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-300">
            <Icon className="h-3 w-3 text-accent" />
            {label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-md bg-accent/20 text-accent flex items-center justify-center ring-1 ring-accent">
          <Paperclip className="h-4 w-4" />
        </span>
        <span className="h-8 w-8 shrink-0 rounded-md bg-accent/20 text-accent flex items-center justify-center ring-1 ring-accent">
          <ServerIcon className="h-4 w-4" />
        </span>
        <span className="flex-1 h-8 rounded-md border border-white/10 bg-background/50 px-2 flex items-center text-xs text-muted-foreground">
          Escribe un mensaje...
        </span>
        <span className="h-8 w-8 shrink-0 rounded-md bg-accent text-accent-foreground flex items-center justify-center">
          <Send className="h-4 w-4" />
        </span>
      </div>
    </SampleFrame>
  );
}

const SAMPLE_INVITE = { modpackName: "Aventura", color: "hsl(140 65% 45%)" };

function InviteSample() {
  return (
    <SampleFrame>
      <div className="flex items-center gap-1.5 mb-3">
        <div className="relative h-9 w-9 rounded-md border border-accent bg-accent/15">
          <InstanceLogo invite={SAMPLE_INVITE} className="h-full w-full rounded-md" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border-2 border-card" />
        </div>
        <span className="text-[11px] text-muted-foreground">← la burbuja aparece junto a tus chats</span>
      </div>
      <div className="rounded-xl bg-card/95 border border-white/10 p-3">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <InstanceLogo invite={SAMPLE_INVITE} className="h-11 w-11 rounded-lg shadow-lg" />
            <span className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-md border-2 border-card overflow-hidden">
              <SampleHead name="Alex" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Globe className="h-3 w-3" /> Invitación a instancia online
            </p>
            <p className="mt-1 text-xs text-gray-200 leading-snug">
              <span className="font-semibold text-white">Alex</span> te ha invitado a su instancia online{" "}
              <span className="font-bold" style={{ color: SAMPLE_INVITE.color }}>
                {SAMPLE_INVITE.modpackName}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 h-7 rounded-lg border border-white/15 text-xs font-semibold text-gray-200 flex items-center justify-center">
            Rechazar
          </span>
          <span className="flex-1 h-7 rounded-lg bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center gap-1">
            <Check className="h-3.5 w-3.5" /> Aceptar
          </span>
        </div>
      </div>
    </SampleFrame>
  );
}

function WelcomeSample() {
  const uuid = useAuth((s) => s.uuid);
  const username = useAuth((s) => s.username) ?? "";
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
      <Avatar className="h-10 w-10 rounded-md">
        {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
        <AvatarFallback className="rounded-md bg-accent/20 text-accent font-bold">{username.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate">{username}</p>
        <p className="text-[11px] text-muted-foreground">Sesión iniciada con tu cuenta de Minecraft</p>
      </div>
    </div>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

interface Chapter {
  label: string;
  icon: LucideIcon;
}

const CH_START: Chapter = { label: "Bienvenida", icon: Sparkles };
const CH_INSTANCES: Chapter = { label: "Tus instancias", icon: LayoutGrid };
const CH_CHARACTER: Chapter = { label: "Tu personaje", icon: Shirt };
const CH_CHAT: Chapter = { label: "Chat y amigos", icon: MessagesSquare };
const CH_ONLINE: Chapter = { label: "Instancias online", icon: Globe };

interface TourStep {
  chapter: Chapter;
  /** data-tour value to spotlight; none = centered card. */
  target?: string;
  title: string;
  body: ReactNode;
  /** Static sample shown under the text. */
  sample?: ReactNode;
  /** Puts the UI in the state the step talks about (e.g. the menu open). */
  enter?: () => void;
}

const openMenu = () => useHeaderOverlay.getState().openProfile("menu");
const closeMenu = () => {
  if (useHeaderOverlay.getState().active) useHeaderOverlay.getState().close();
};

const b = (text: string) => <b className="text-white font-semibold">{text}</b>;

const STEPS: TourStep[] = [
  {
    chapter: CH_START,
    title: "¡Bienvenido a ALaunchi!",
    body: "Te enseñamos lo básico en un par de minutos para que no te pierdas: tus instancias, tu personaje, el chat con tus amigos y las instancias online.",
    sample: <WelcomeSample />,
    enter: closeMenu,
  },
  {
    chapter: CH_INSTANCES,
    target: "hub-instances",
    title: "Tus instancias privadas",
    body: "Aquí aparecen las instancias que creas tú. Cada una tiene su versión de Minecraft, sus mods y su propia Java. Solo las ves tú.",
    enter: closeMenu,
  },
  {
    chapter: CH_INSTANCES,
    target: "hub-new-instance",
    title: "Crea tu primera instancia",
    body: (
      <>
        Con {b("Nueva instancia")} eliges la versión y el modloader (Forge, NeoForge o Fabric). Con los botones de al lado
        también puedes traer modpacks de Modrinth o importarlos de CurseForge.
      </>
    ),
    enter: closeMenu,
  },
  {
    chapter: CH_CHARACTER,
    target: "account-button",
    title: "Tu menú",
    body: "Pulsando en tu nombre se abre tu menú: perfil, amigos, instancias online, servers, biblioteca y configuración.",
    enter: closeMenu,
  },
  {
    chapter: CH_CHARACTER,
    target: "account-customize",
    title: "Personaliza tu personaje",
    body: (
      <>
        En {b("Personalizar")} cambias tu skin y tu capa (se aplican a tu cuenta de Minecraft de verdad) y guardas skins
        en tu biblioteca. En {b("Perfil")} puedes poner banner, biografía y decoraciones.
      </>
    ),
    enter: openMenu,
  },
  {
    chapter: CH_CHAT,
    target: "presence-button",
    title: "Habla con tus amigos",
    body: (
      <>
        Este botón muestra qué amigos están conectados. {b("Pulsa el nombre de un amigo")} para abrir su chat. También
        puedes hacerlo desde tu menú → Amigos.
      </>
    ),
    enter: closeMenu,
  },
  {
    chapter: CH_CHAT,
    target: "presence-button",
    title: "Tus chats se quedan en la barra",
    body: "Cuando abres el chat de un amigo, su cabeza se queda fijada aquí abajo, al lado de este botón, para volver a él con un clic. El número rojo son mensajes sin leer.",
    sample: <ChatBubblesSample />,
    enter: closeMenu,
  },
  {
    chapter: CH_CHAT,
    title: "Comparte contenido",
    body: (
      <>
        Dentro de un chat, el {b("clip")} envía mods, shaders, texturas, skins, capturas y más; tu amigo lo instala con un
        botón. El {b("icono de server")} comparte uno de tus servers. Las instancias se comparten desde su menú en Mis
        instancias.
      </>
    ),
    sample: <ShareBarSample />,
    enter: closeMenu,
  },
  {
    chapter: CH_ONLINE,
    target: "account-online",
    title: "Instancias online",
    body: (
      <>
        Son los modpacks que publica un admin para jugar todos juntos. Están {b("bloqueadas")} hasta que te den acceso:
        canjea un código en {b("Instancias online → Canjear código")}, o acepta una invitación.
      </>
    ),
    enter: openMenu,
  },
  {
    chapter: CH_ONLINE,
    title: "Así llega una invitación",
    body: (
      <>
        Cuando un amigo te invita a una instancia online, te aparece una burbuja junto a tus chats. Ábrela y pulsa{" "}
        {b("Aceptar")}: la instancia se desbloquea al momento.
      </>
    ),
    sample: <InviteSample />,
    enter: closeMenu,
  },
  {
    chapter: CH_ONLINE,
    target: "titlebar-carousel",
    title: "Se desbloquea el carrusel",
    body: "En cuanto tengas tu primera instancia online, aquí arriba aparecerá el botón para ir al carrusel, donde las instalas y juegas con un clic.",
    enter: closeMenu,
  },
  {
    chapter: CH_START,
    title: "¡Listo!",
    body: "Ya sabes lo básico. Si en algún momento quieres repasarlo, tienes este tour en Configuración → Personalización → Tutorial.",
    enter: closeMenu,
  },
];

const TITLEBAR_HEIGHT = 44; // h-11 in titlebar.tsx — left clickable during the tour
const PAD = 6;
const CARD_WIDTH = 360;

type Rect = { top: number; left: number; width: number; height: number };

/** Follows the target's on-screen box every frame — the account menu animates
 *  open and the Hub lays out late, so a one-off measurement would miss. */
function useTargetRect(target: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last = "";
    const tick = () => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      const key = next ? `${next.top}|${next.left}|${next.width}|${next.height}` : "";
      if (key !== last) {
        last = key;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return rect;
}

export function OnboardingTour() {
  const [location] = useLocation();
  const uuid = useAuth((s) => s.uuid);
  const { requested, active, step, begin, setStep, end } = useTour();
  const onHub = location === "/hub";
  const current = STEPS[step];
  const rect = useTargetRect(active ? current?.target : undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(220);

  // Starts on its own after a real sign-in, once the Hub is up.
  useEffect(() => {
    if (!uuid || !onHub || active || requested) return;
    let justSignedIn = false;
    try {
      justSignedIn = sessionStorage.getItem(JUST_SIGNED_IN_KEY) === "1";
    } catch {}
    if (!justSignedIn) return;
    try {
      sessionStorage.removeItem(JUST_SIGNED_IN_KEY);
    } catch {}
    if (tourPending(uuid)) useTour.getState().request();
  }, [uuid, onHub, active, requested]);

  // A request (login or Ajustes) only turns into a running tour on the Hub,
  // after a short beat so the page has finished animating in.
  useEffect(() => {
    if (!requested || !onHub) return;
    const t = setTimeout(begin, 600);
    return () => clearTimeout(t);
  }, [requested, onHub, begin]);

  // Leaving the Hub (e.g. through the titlebar) ends it.
  useEffect(() => {
    if (active && !onHub) end();
  }, [active, onHub, end]);

  useEffect(() => {
    if (active) current?.enter?.();
  }, [active, step, current]);

  // Measured live: each step's card mounts after the previous one leaves
  // (AnimatePresence mode="wait") and a sample can make it much taller — a
  // one-off measurement kept the previous card's height and placed the new
  // one partly below the window.
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const setCardNode = (node: HTMLDivElement | null) => {
    cardRef.current = node;
    setCardEl(node);
  };
  useLayoutEffect(() => {
    if (!cardEl) return;
    setCardHeight(cardEl.offsetHeight);
    const ro = new ResizeObserver(() => setCardHeight(cardEl.offsetHeight));
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [cardEl]);

  // Re-place on window resize too.
  const [, setViewportTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const onResize = () => setViewportTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  const finish = () => {
    if (uuid) markTourDone(uuid);
    closeMenu();
    end();
  };
  const isLast = step === STEPS.length - 1;
  const next = () => (isLast ? finish() : setStep(step + 1));
  const back = () => step > 0 && setStep(step - 1);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!active || !onHub || !current) return null;

  // Card goes under the spotlight if it fits, otherwise above; centered when
  // the step has no target (or it isn't on screen). Whatever the case it's
  // kept fully inside the window (under the titlebar, 16px from the bottom).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minTop = TITLEBAR_HEIGHT + 8;
  const maxTop = Math.max(minTop, vh - cardHeight - 16);
  const clampTop = (t: number) => Math.min(Math.max(t, minTop), maxTop);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const left = Math.min(Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, 16), vw - CARD_WIDTH - 16);
    const below = rect.top + rect.height + PAD + 12;
    const above = rect.top - PAD - 12 - cardHeight;
    const top = below + cardHeight <= vh - 16 ? below : above >= minTop ? above : clampTop(below);
    cardStyle = { top: clampTop(top), left, width: CARD_WIDTH };
  } else {
    cardStyle = { top: clampTop(vh / 2 - cardHeight / 2), left: vw / 2 - CARD_WIDTH / 2, width: CARD_WIDTH };
  }
  // Even taller than the window (tiny window): scroll inside the card.
  cardStyle.maxHeight = vh - minTop - 16;

  const ChapterIcon = current.chapter.icon;
  // Progress as one segment per chapter (filled as you go), not a step count.
  const chapters = STEPS.reduce<Chapter[]>((acc, s) => (acc.includes(s.chapter) ? acc : [...acc, s.chapter]), []).filter(
    (c) => c !== CH_START
  );
  const currentChapterIndex = chapters.indexOf(current.chapter);

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Swallows clicks on the app while it runs; the titlebar stays usable
          (window buttons). */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-auto" style={{ top: TITLEBAR_HEIGHT }} />

      {rect ? (
        <div
          className="absolute rounded-xl ring-2 ring-accent transition-all duration-300 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/65" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          ref={setCardNode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute pointer-events-auto rounded-xl border border-white/10 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col"
          style={cardStyle}
          role="dialog"
          aria-label={current.title}
        >
          <div className="p-5 min-h-0 overflow-y-auto">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent mb-1.5">
              <ChapterIcon className="h-3.5 w-3.5" />
              {current.chapter.label}
            </p>
            <h2 className="text-base font-bold text-white mb-1.5">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>
            {current.sample}
          </div>

          <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-white/5 bg-black/20">
            {currentChapterIndex >= 0 ? (
              <div className="flex gap-1" aria-hidden>
                {chapters.map((c, i) => (
                  <span
                    key={c.label}
                    title={c.label}
                    className={`h-1 w-5 rounded-full transition-colors ${i <= currentChapterIndex ? "bg-accent" : "bg-white/15"}`}
                  />
                ))}
              </div>
            ) : (
              !isLast && (
                <button type="button" onClick={finish} className="text-xs text-muted-foreground hover:text-white transition-colors">
                  Saltar tutorial
                </button>
              )
            )}
            <div className="ml-auto flex gap-2">
              {currentChapterIndex >= 0 && (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" onClick={finish}>
                  Saltar
                </Button>
              )}
              {step > 0 && !isLast && (
                <Button variant="outline" size="sm" className="border-white/10" onClick={back}>
                  Atrás
                </Button>
              )}
              <Button size="sm" onClick={next}>
                {step === 0 ? "Empezar" : isLast ? "Terminar" : "Siguiente"}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
