import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Plus, Trash, PackagePlus } from "lucide-react";
import { ServerIcon } from "@/components/server-icon";
import { toast } from "sonner";
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
        <button
          type="button"
          onClick={() => setTarget(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-200 transition-colors self-start"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Servers
        </button>
        <div className="shrink-0 flex items-center gap-2.5">
          <ServerIcon ip={target.ip} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">¿En qué instancia añades {target.name}?</p>
            <p className="text-[11px] text-muted-foreground font-mono truncate">{target.ip}</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <ServerInstancePicker server={target} onDone={() => setTarget(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className="text-sm font-semibold text-white">Servers guardados</p>
        {!adding && (
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Nuevo server
          </Button>
        )}
      </div>
      <div className="h-px shrink-0 bg-white/10" />

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
            <div key={s.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/5">
              <ServerIcon ip={s.ip} className="h-8 w-8" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-100 truncate">{s.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate select-text">{s.ip}</p>
              </div>
              <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => setTarget(s)} title="Añadir a una instancia">
                <PackagePlus className="mr-1 h-3.5 w-3.5" />
                Agregar
              </Button>
              <button
                type="button"
                onClick={() => {
                  remove(s.id);
                  toast.success(`${s.name} eliminado.`);
                }}
                title="Eliminar"
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-destructive hover:bg-white/5 transition-colors"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
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
      toast.info("Ya tienes guardado un server con esa dirección.");
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
      <div className="space-y-1.5 p-2.5 rounded-lg border border-white/10 bg-white/5">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (el que tú quieras)"
          maxLength={64}
          className="h-8 text-sm bg-background/50 border-white/10"
        />
        <Input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Dirección IP (ej. play.servidor.com)"
          className="h-8 text-sm font-mono bg-background/50 border-white/10"
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
