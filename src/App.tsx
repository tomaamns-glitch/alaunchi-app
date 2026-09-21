import { useEffect, useRef } from "react";
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
    setLastView(location);
  }, [location]);

  useEffect(() => {
    if (restored.current || !authChecked) return;
    restored.current = true;
    if (location === "/" && getLastViewPath() === "/hub") {
      setLocation("/hub", { replace: true });
    }
  }, [authChecked, location, setLocation]);

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

function Router() {
  return (
    <Switch>
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
