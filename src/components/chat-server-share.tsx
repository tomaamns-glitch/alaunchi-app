import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Check, PackagePlus } from "lucide-react";
import { ServerIcon } from "@/components/server-icon";
import { toast } from "sonner";
import { sendSharedServer, type SharedServer } from "@/services/chat";
import { useSavedServers } from "@/lib/saved-servers";
import { ServerInstancePicker } from "@/components/server-instance-picker";
import { cn } from "@/lib/utils";

const popover = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: 0.12 },
};

/** Chat input's "Compartir server" popover: pick one of your saved servers. */
export function ChatServerPicker({
  myUuid,
  myUsername,
  otherUuid,
  otherUsername,
  carouselInstanceId,
  onClose,
}: {
  myUuid: string;
  myUsername: string;
  otherUuid: string;
  otherUsername: string;
  carouselInstanceId?: string;
  onClose: () => void;
}) {
  const servers = useSavedServers((s) => s.servers);

  const share = (server: SharedServer) => {
    sendSharedServer(myUuid, myUsername, otherUuid, otherUsername, { name: server.name, ip: server.ip }, carouselInstanceId).catch(() =>
      toast.error("No se pudo enviar el server.")
    );
    onClose();
  };

  return (
    <motion.div
      {...popover}
      className="absolute bottom-full left-0 mb-2 z-50 w-64 max-h-64 overflow-y-auto rounded-lg bg-card border border-white/10 shadow-xl py-1"
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-2.5 pt-1 pb-1.5">Compartir server</p>
      {servers.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-2.5 pb-2">
          No tienes servers guardados. Guárdalos en tu menú de cuenta → Servers.
        </p>
      ) : (
        servers.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => share(s)}
            className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 hover:bg-white/5 transition-colors"
          >
            <ServerIcon ip={s.ip} className="h-6 w-6" iconClassName="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-gray-100 truncate">{s.name}</span>
              <span className="block text-[10px] text-muted-foreground font-mono truncate">{s.ip}</span>
            </span>
          </button>
        ))
      )}
    </motion.div>
  );
}

/** A server someone shared in the chat: save it to your list, or add it
 *  directly to one of your instances. */
export function SharedServerCard({ server }: { server: SharedServer }) {
  const saved = useSavedServers((s) => s.servers.some((x) => x.ip.toLowerCase() === server.ip.toLowerCase()));
  const add = useSavedServers((s) => s.add);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="max-w-[85%] flex items-center gap-2.5 rounded-2xl px-3 py-2.5 bg-white/10 shadow-sm">
      <ServerIcon ip={server.ip} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-100 truncate font-medium">{server.name}</p>
        <p className="text-[10px] text-muted-foreground font-mono truncate select-text">{server.ip}</p>
      </div>
      <motion.button
        whileHover={saved ? undefined : { scale: 1.05 }}
        whileTap={saved ? undefined : { scale: 0.95 }}
        type="button"
        disabled={saved}
        onClick={() => {
          if (add(server.name, server.ip)) toast.success(`${server.name} guardado en tus servers.`);
        }}
        title={saved ? "Ya está en tus servers" : "Guardar en mis servers"}
        className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold bg-white/10 text-gray-200 hover:bg-white/15 disabled:opacity-60 disabled:hover:bg-white/10 transition-colors"
      >
        {saved ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
        {saved ? "Guardado" : "Guardar"}
      </motion.button>
      <div className="relative shrink-0">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          title="Añadir a una instancia"
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors",
            showPicker ? "bg-accent/20 text-accent" : "bg-accent hover:bg-accent/90 text-accent-foreground"
          )}
        >
          <PackagePlus className="h-3 w-3" />
          Añadir
        </motion.button>
        <AnimatePresence>
          {showPicker && (
            <motion.div
              {...popover}
              className="absolute bottom-full right-0 mb-1 z-50 w-60 max-h-64 overflow-y-auto rounded-lg bg-card border border-white/10 shadow-xl p-2"
            >
              <ServerInstancePicker server={server} onDone={() => setShowPicker(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
