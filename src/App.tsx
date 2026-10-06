import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Home from "@/pages/home";
import Admin from "@/pages/admin";
import AdminModpack from "@/pages/admin-modpack";
import Servers from "@/pages/servers";
import Settings from "@/pages/settings";
import Profile from "@/pages/profile";
import PublicProfile from "@/pages/public-profile";
import Friends from "@/pages/friends";
import Hub from "@/pages/hub";
import ModpackDetail from "@/pages/modpack-detail";
import { Titlebar } from "@/components/titlebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { getLastViewPath, setLastView } from "@/lib/last-view";
import { useAuth } from "@/hooks/use-auth";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { onUpdateInstalled } from "@/services/electron";

const queryClient = new QueryClient();

// Shown while the initial session check (reading the persisted Microsoft/MC
// auth from disk) is in flight, so a returning user never sees a flash of the
// login screen before landing back on the home page.
function AppSplash() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-background">
      <img
        src="./logo.png"
        alt="ALaunchi"
        className="h-14 object-contain opacity-90"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <Loader2 className="h-5 w-5 animate-spin text-accent" />
    </div>
  );
}

// Tracks the last "home view" (see src/lib/last-view.ts) and, on the first
// launch of the session, drops you back on it.
function StartupView() {
  const [location, setLocation] = useLocation();
  const authChecked = useAuth((s) => s.authChecked);
  const restored = useRef(false);
  const previousLocation = useRef(location);

  useEffect(() => {
    if (restored.current || !authChecked) return;
    restored.current = true;
    if (location === "/" && getLastViewPath() === "/hub") {
      setLocation("/hub", { replace: true });
    }
  }, [authChecked, location, setLocation]);

  // Only once the startup view has been restored — otherwise the initial "/"
  // gets saved first and the restore above would always read back "home"
  // (and a first-ever launch would never land on the Hub).
  useEffect(() => {
    if (restored.current) setLastView(location);
  }, [location, authChecked]);

  // A chat panel/presence popup lives in global state (useChatHeads/
  // useHeaderOverlay), not tied to whichever page mounted it — without this,
  // switching between Inicio and Hub left it "stuck" open instead of closing,
  // since the new page's own copy of the component just picks up the same
  // still-open state. Scoped to exactly that pair of routes (not "any
  // navigation"): friends.tsx/public-profile.tsx call openChat(uuid) and then
  // navigate to /hub to show it, and that transition must NOT be undone here.
  useEffect(() => {
    const prev = previousLocation.current;
    const isHomeHubSwitch = (prev === "/" && location === "/hub") || (prev === "/hub" && location === "/");
    if (isHomeHubSwitch) {
      useChatHeads.getState().minimizeChat();
      useHeaderOverlay.getState().close();
    }
    previousLocation.current = location;
  }, [location]);

  return null;
}

/**
 * Screen transitions, by "depth":
 *   0 — carousel (/) and Hub (/hub): sliding between them horizontally, the
 *       carousel on the left;
 *   1 — an instance's content (/modpack/:id), Ajustes, Admin, perfiles,
 *       amigos, servers;
 *   2 — a modpack inside Admin (/admin/:id).
 * Going deeper zooms in, coming back zooms out, and anything else (same depth,
 * or the login screen) cross-fades.
 */
type TransitionKind = "toHub" | "toHome" | "forward" | "back" | "fade" | "none";

function routeDepth(path: string): number | null {
  if (path === "/" || path === "/hub") return 0;
  if (path.startsWith("/admin/")) return 2;
  if (
    path.startsWith("/modpack/") ||
    path === "/settings" ||
    path === "/servers" ||
    path === "/friends" ||
    path === "/admin" ||
    path === "/profile" ||
    path.startsWith("/profile/")
  ) {
    return 1;
  }
  return null; // login, not found
}

function transitionFor(from: string, to: string): TransitionKind {
  if (from === "/" && to === "/hub") return "toHub";
  if (from === "/hub" && to === "/") return "toHome";
  const a = routeDepth(from);
  const b = routeDepth(to);
  if (a === null || b === null || a === b) return "fade";
  return b > a ? "forward" : "back";
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const EXIT = { duration: 0.14, ease: "easeIn" } as const;

const screenVariants: Variants = {
  initial: (k: TransitionKind) =>
    k === "toHub" ? { opacity: 0, x: 48 }
    : k === "toHome" ? { opacity: 0, x: -48 }
    : k === "forward" ? { opacity: 0, scale: 0.97, y: 10 }
    : k === "back" ? { opacity: 0, scale: 1.02 }
    : k === "fade" ? { opacity: 0 }
    : { opacity: 1 },
  animate: (k: TransitionKind) => ({
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: k === "none" ? { duration: 0 } : { duration: k === "fade" ? 0.2 : 0.26, ease: EASE_OUT },
  }),
  exit: (k: TransitionKind) =>
    k === "toHub" ? { opacity: 0, x: -48, transition: EXIT }
    : k === "toHome" ? { opacity: 0, x: 48, transition: EXIT }
    : k === "forward" ? { opacity: 0, scale: 1.02, transition: EXIT }
    : k === "back" ? { opacity: 0, scale: 0.97, y: 10, transition: EXIT }
    : k === "fade" ? { opacity: 0, transition: { duration: 0.12, ease: "easeIn" } }
    : { opacity: 0, transition: { duration: 0 } },
};

function Router() {
  const [location] = useLocation();
  // Which transition the change to `location` gets. StartupView restoring the
  // last screen (/ → /hub right after the app opens) isn't a navigation the
  // user made, so that one doesn't animate.
  const previous = useRef(location);
  const mountedAt = useRef(Date.now());
  const kind = useMemo<TransitionKind>(() => {
    const from = previous.current;
    if (from === location) return "none";
    const isStartupRestore = from === "/" && location === "/hub" && Date.now() - mountedAt.current < 1500;
    return isStartupRestore ? "none" : transitionFor(from, location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  useEffect(() => {
    previous.current = location;
  }, [location]);

  return (
    // mode="wait": the old screen leaves before the new one mounts, so two
    // full pages (WebGL viewers, Firebase listeners…) never run at once.
    // Each screen renders its own frozen `location`, which keeps the leaving
    // one on its route while it animates out.
    <AnimatePresence mode="wait" initial={false} custom={kind}>
      <motion.div
        key={location}
        custom={kind}
        variants={screenVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="h-full"
      >
        <RouteSwitch location={location} />
      </motion.div>
    </AnimatePresence>
  );
}

function RouteSwitch({ location }: { location: string }) {
  return (
    <Switch location={location}>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/:id" component={AdminModpack} />
      <Route path="/servers" component={Servers} />
      <Route path="/settings" component={Settings} />
      <Route path="/profile" component={Profile} />
      <Route path="/profile/:uuid" component={PublicProfile} />
      <Route path="/friends" component={Friends} />
      <Route path="/hub" component={Hub} />
      <Route path="/modpack/:id" component={ModpackDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const authChecked = useAuth((s) => s.authChecked);
  const loadPersistedAuth = useAuth((s) => s.loadPersistedAuth);

  useEffect(() => {
    loadPersistedAuth();
  }, [loadPersistedAuth]);

  // Little "ta-da" the moment the silently-updated app reopens — see
  // onUpdateInstalled's doc comment. Fires at most once per launch, and never
  // on a normal cold start (no update happened).
  useEffect(() => {
    return onUpdateInstalled(() => {
      // Relative, not "/sounds/..." — the packaged app loads index.html via
      // file://, where a leading slash resolves against the filesystem root
      // instead of the dist/ folder next to this document.
      const audio = new Audio("./sounds/update-ready.mp3");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter hook={useHashLocation}>
          <div className="h-screen flex flex-col overflow-hidden">
            <StartupView />
            <Titlebar />
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <ErrorBoundary>
                {authChecked ? <Router /> : <AppSplash />}
              </ErrorBoundary>
            </div>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
