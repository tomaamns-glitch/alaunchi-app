import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { AccountMenuButton } from "@/components/account-menu-button";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { ChatWindow } from "@/components/chat-window";
import { NewInstanceDialog } from "@/components/new-instance-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CAROUSEL_POSITION_KEY } from "@/pages/home";

export default function Hub() {
  const { isAuthenticated, username, uuid } = useAuth();
  const [, setLocation] = useLocation();
  const { instances, loadInstances } = useCustomInstances();
  const [dialogOpen, setDialogOpen] = useState(false);
  // The chat window needs a modpack to scope presence/sharing to — reuse
  // whichever pack was last showing in the Inicio carousel rather than
  // requiring this page to pick one of its own.
  const [lastPackId] = useState(() => localStorage.getItem(CAROUSEL_POSITION_KEY));

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (isAuthenticated) loadInstances();
  }, [isAuthenticated, loadInstances]);

  if (!isAuthenticated) return null;

  return (
    <div className="relative min-h-full bg-background text-foreground flex flex-col overflow-hidden">
      {/* Relative, not "/backgrounds/..." — the packaged app loads index.html via
          file://, where a leading slash resolves against the filesystem root
          instead of the dist/ folder next to this document (same reason App.tsx's
          splash logo and the notification sounds use relative paths). */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.14]"
        style={{ backgroundImage: "url('./backgrounds/hub-bg.png')" }}
      />

      <main className="relative z-10 flex-1 px-4 py-4 max-w-5xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Mis instancias</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva instancia
          </Button>
        </div>
        <Separator className="mt-3 mb-6" />

        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
            <p>Aún no tienes instancias.</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Crea la primera
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {instances.map((inst) => (
              <button
                key={inst.id}
                onClick={() => setLocation(`/modpack/${inst.id}`)}
                className="group flex flex-col items-start gap-2 rounded-md border border-white/10 bg-card/50 p-3 text-left hover:border-accent/50 hover:bg-card/80 transition-colors"
              >
                <div className="relative w-full aspect-square rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-4xl font-black text-accent/60">
                  {inst.imageUrl ? (
                    <img src={inst.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    inst.name.charAt(0)
                  )}
                  <span className="absolute bottom-1 right-1 max-w-[calc(100%-8px)] truncate rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold leading-none text-white backdrop-blur-sm">
                    {inst.minecraftVersion} · {inst.loaderType.toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-semibold truncate w-full">{inst.name}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <NewInstanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => setLocation(`/modpack/${id}`)}
      />

      <footer className="h-20 border-t border-white/5 bg-card/50 backdrop-blur flex items-center px-6 shrink-0">
        <div className="flex items-center gap-1">
          <AccountMenuButton uuid={uuid} username={username} />
          {uuid && lastPackId && (
            <div className="relative">
              <ChatBubbleRow />
              <ChatWindow myUuid={uuid} myUsername={username ?? ""} currentPackId={lastPackId} />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
