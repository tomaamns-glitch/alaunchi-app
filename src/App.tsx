import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient();

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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter hook={useHashLocation}>
          <div className="h-screen flex flex-col overflow-hidden">
            <Titlebar />
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <Router />
            </div>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
