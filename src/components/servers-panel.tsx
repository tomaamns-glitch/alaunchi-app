import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Plus, Trash2, PackagePlus, Server } from "lucide-react";
import { ServerIcon } from "@/components/server-icon";
import { Hint } from "@/components/hint";
import { toast, notify } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ServerInstancePicker } from "@/components/server-instance-picker";
import { useSavedServers, isValidServerAddress, type SavedServer } from "@/lib/saved-servers";

/** Cuenta → Servers: saved server addresses (custom name + IP), each one can be
 *  added to an instance's Multijugador list or deleted. */
export function ServersPanel() {
  const servers = useSavedServers((s) => s.servers);
  const remove = useSavedServers((s) => s.remove);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<SavedServer | null>(null);

  if (target) {
    return (
      <div className="h-full flex flex-col gap-2 min-h-0">
        {/* Header like the list's: back, the server, and what's being done. */}
        <div className="flex items-center gap-2 px-1 pb-2 border-b border-white/5 shrink-0">
          <Hint label="Volver a Servers">
            <button
              type="button"
              onClick={() => setTarget(null)}
              aria-label="Volver a Servers"
              className="h-7 w-7 -ml-1 flex items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Hint>
          <ServerIcon ip={target.ip} className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">Añadir {target.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{target.ip}</p>
          </div>
        </div>
        <p className="shrink-0 px-1 text-xs text-gray-300">¿En qué instancia lo quieres?</p>
        <div className="flex-1 min-h-0">
          <ServerInstancePicker server={target} onDone={() => setTarget(null)} layout="panel" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      {/* Same header as Instancias online: icon, title, icon actions. */}
      <div className="flex items-center gap-2 px-1 pb-2 border-b border-white/5 shrink-0">
        <Server className="h-4 w-4 text-accent" />
        <h2 className="flex-1 text-sm font-semibold text-white">Servers guardados</h2>
        {!adding && (
          <Hint label="Nuevo server">
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Nuevo server"
              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </Hint>
        )}
      </div>

      <AnimatePresence initial={false}>
        {adding && <NewServerForm onClose={() => setAdding(false)} />}
      </AnimatePresence>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {servers.length === 0 ? (
          !adding && (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              Aún no has guardado ningún server. Guarda uno para añadirlo a tus instancias en un clic.
            </p>
          )
        ) : (
          servers.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded-md border border-transparent bg-white/[0.07] px-2 py-1.5 hover:bg-white/[0.14] transition-colors"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <ServerIcon ip={s.ip} className="h-8 w-8" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-100 truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate select-text">{s.ip}</p>
                </div>
              </div>
              <Hint label="Eliminar">
                <button
                  type="button"
                  onClick={() => {
                    remove(s.id);
                    toast.success(`${s.name} eliminado.`);
                  }}
                  aria-label="Eliminar"
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-500 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Hint>
              <Hint label="Añadir a una instancia">
                <button
                  type="button"
                  onClick={() => setTarget(s)}
                  aria-label="Añadir a una instancia"
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                </button>
              </Hint>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NewServerForm({ onClose }: { onClose: () => void }) {
  const add = useSavedServers((s) => s.add);
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const valid = name.trim().length > 0 && isValidServerAddress(ip);

  const save = () => {
    if (!valid) return;
    if (!add(name, ip)) {
      notify.info("Ya tienes guardado un server con esa dirección.");
      return;
    }
    toast.success(`${name.trim()} guardado.`);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="shrink-0 overflow-hidden"
    >
      <div className="space-y-1.5 p-2.5 rounded-md border border-transparent bg-white/[0.07]">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (el que tú quieras)"
          maxLength={64}
          className="h-8 text-sm bg-white/[0.07] border-transparent"
        />
        <Input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Dirección IP (ej. play.servidor.com)"
          className="h-8 text-sm font-mono bg-white/[0.07] border-transparent"
        />
        {ip.trim() && !isValidServerAddress(ip) && (
          <p className="text-[10px] text-amber-400">Esa dirección no parece válida.</p>
        )}
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs" disabled={!valid} onClick={save}>
            Guardar
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
