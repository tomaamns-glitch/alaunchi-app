import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { AccountMenuButton } from "@/components/account-menu-button";
import { ChatBubbleRow } from "@/components/chat-bubble-row";
import { ChatWindow } from "@/components/chat-window";
import { CAROUSEL_POSITION_KEY } from "@/pages/home";

export default function Hub() {
  const { isAuthenticated, username, uuid } = useAuth();
  const [, setLocation] = useLocation();
  // The chat window needs a modpack to scope presence/sharing to — reuse
  // whichever pack was last showing in the Inicio carousel rather than
  // requiring this page to pick one of its own.
  const [lastPackId] = useState(() => localStorage.getItem(CAROUSEL_POSITION_KEY));

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Próximamente</p>
      </main>

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
