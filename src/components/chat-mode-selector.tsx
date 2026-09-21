import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Globe, Package } from "lucide-react";
import { useModpacks } from "@/hooks/use-modpacks";
import type { ChatMode } from "@/lib/instance-context";
import { cn } from "@/lib/utils";

const tapHover = { whileHover: { scale: 1.08 }, whileTap: { scale: 0.9 } };

interface ChatModeSelectorProps {
  mode: ChatMode;
  onSelect: (mode: ChatMode) => void;
}

/** Trigger + dropdown for switching a conversation between General and one of
 *  the installed carousel instances. Self-contained (owns its own open/closed
 *  state and modpack list) so it can be mounted in two different spots —
 *  chat-window.tsx's own header when the contact rail is collapsed, or inside
 *  the rail itself when expanded — without duplicating this markup. */
export function ChatModeSelector({ mode, onSelect }: ChatModeSelectorProps) {
  const modpacks = useModpacks((s) => s.modpacks);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative w-fit">
      <motion.button
        {...tapHover}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title="Cambiar el contexto de esta conversación"
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-gray-200 transition-colors"
      >
        {mode.type === "carousel" ? (
          <>
            {mode.pack.imageUrl ? (
              <img src={mode.pack.imageUrl} alt="" className="h-5 w-5 rounded-md object-cover shrink-0" />
            ) : (
              <Package className="h-4 w-4 shrink-0" />
            )}
            <span className="max-w-[9rem] truncate normal-case">{mode.pack.name}</span>
          </>
        ) : (
          <>
            <Globe className="h-4 w-4 shrink-0" />
            <span>General</span>
          </>
        )}
        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
      </motion.button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 mt-1 z-50 w-52 max-h-56 overflow-y-auto rounded-lg bg-card border border-white/10 shadow-xl py-1"
          >
            <button
              type="button"
              onClick={() => {
                onSelect({ type: "general" });
                setMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs hover:bg-white/5 transition-colors",
                mode.type === "general" ? "text-accent font-semibold" : "text-gray-200"
              )}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" />
              General
            </button>
            {modpacks
              .filter((p) => p.installed)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect({ type: "carousel", pack: p });
                    setMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs hover:bg-white/5 transition-colors",
                    mode.type === "carousel" && mode.pack.id === p.id ? "text-accent font-semibold" : "text-gray-200"
                  )}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-4 w-4 rounded-md object-cover shrink-0" />
                  ) : (
                    <Package className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
