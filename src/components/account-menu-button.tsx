import { useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Shirt, Settings, User, ChevronLeft } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SkinManagerPanel } from "@/components/skin-manager-panel";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useHeaderOverlay } from "@/hooks/use-chat-heads";

interface AccountMenuButtonProps {
  uuid: string | null;
  username: string | null;
}

/** The account button in the bottom bar — opens a menu above it (Skin /
 *  Configuración), coordinated with the other header popups (presence,
 *  chat) via useHeaderOverlay so only one is ever open at a time. */
export function AccountMenuButton({ uuid, username }: AccountMenuButtonProps) {
  const [, setLocation] = useLocation();
  const myHeadUrl = usePlayerHeadUrl(uuid);
  const activePopup = useHeaderOverlay((s) => s.active);
  const openOverlay = useHeaderOverlay((s) => s.open);
  const closeOverlay = useHeaderOverlay((s) => s.close);
  const profileOpen = activePopup === "profile";
  // Which screen the popup shows: the "menu" (Skin / Configuración) it opens
  // on, or the skin manager after picking "Skin". Reset back to the menu
  // whenever the popup closes, so it never reopens mid-skin-editing.
  const [profileView, setProfileView] = useState<"menu" | "skin">("menu");

  const setProfileOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const wasOpen = profileOpen;
    const nextOpen = typeof next === "function" ? next(wasOpen) : next;
    if (nextOpen) openOverlay("profile");
    else {
      closeOverlay();
      setProfileView("menu");
    }
  };

  return (
    <div className="relative">
      {profileOpen && (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => setProfileOpen(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
      <AnimatePresence>
        {profileOpen && uuid && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 z-40 rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto"
          >
            {profileView === "menu" ? (
              <div className="w-48 p-1.5 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    setLocation("/profile");
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors"
                >
                  <User className="h-4 w-4 text-accent" />
                  Perfil
                </button>
                <button
                  type="button"
                  onClick={() => setProfileView("skin")}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors"
                >
                  <Shirt className="h-4 w-4 text-accent" />
                  Skin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    setLocation("/settings");
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors"
                >
                  <Settings className="h-4 w-4 text-accent" />
                  Configuración
                </button>
              </div>
            ) : (
              <div className="p-4">
                <button
                  type="button"
                  onClick={() => setProfileView("menu")}
                  className="flex items-center gap-1 mb-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Volver
                </button>
                <SkinManagerPanel uuid={uuid} username={username} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setProfileOpen((v) => !v)}
        className="relative z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
      >
        <Avatar className="h-6 w-6 rounded-md border border-white/10">
          {myHeadUrl && <AvatarImage src={myHeadUrl} alt={username ?? ""} className="rounded-md" />}
          <AvatarFallback className="rounded-md bg-accent/20 text-accent text-xs font-bold">
            {username?.charAt(0)?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium text-gray-200" data-testid="text-username">
          {username}
        </span>
      </button>
    </div>
  );
}
