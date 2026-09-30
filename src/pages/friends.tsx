import { useEffect } from "react";
import { useLocation } from "wouter";
import { Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { FriendsPanel } from "@/components/friends-panel";

export default function Friends() {
  const { isAuthenticated, uuid, username } = useAuth();
  const [, setLocation] = useLocation();
  const openChat = useChatHeads((s) => s.openChat);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated || !uuid || !username) return null;

  return (
    <div className="h-full bg-background text-foreground flex flex-col">
      <main className="flex-1 min-h-0 px-6 py-6 flex flex-col">
        <div className="max-w-3xl w-full mx-auto flex-1 min-h-0 flex flex-col gap-4">
          <h1 className="text-xl font-bold leading-tight flex items-center gap-2 shrink-0">
            <Users className="h-5 w-5 text-accent" />
            Amigos
          </h1>
          <div className="flex-1 min-h-0">
            <FriendsPanel
              uuid={uuid}
              username={username}
              onOpenProfile={(id) =>
                id === uuid ? useHeaderOverlay.getState().openProfile("profile") : useHeaderOverlay.getState().openUserProfile(id)
              }
              onChat={(id) => {
                openChat(id);
                setLocation("/hub");
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
