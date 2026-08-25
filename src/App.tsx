import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
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
import Settings from "@/pages/settings";
import ModpackDetail from "@/pages/modpack-detail";
import { Titlebar } from "@/components/titlebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuth } from "@/hooks/use-auth";
import { onUpdateInstalled } from "@/services/electron";

const queryClient = new QueryClient();

// Shown while the initial session check (reading the persisted Microsoft/MC
// auth from disk) is in flight, so a returning user never sees a flash of the
// login screen before landing back on the home page.
function AppSplash() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-background">
      <img
        src="/logo.png"
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/:id" component={AdminModpack} />
      <Route path="/settings" component={Settings} />
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
      const audio = new Audio("/sounds/update-ready.mp3");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter hook={useHashLocation}>
          <div className="h-screen flex flex-col overflow-hidden">
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
