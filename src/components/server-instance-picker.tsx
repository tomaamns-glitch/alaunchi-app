import { useEffect, useState } from "react";
import { Boxes, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { useInstanceRunState } from "@/hooks/use-instance-run-state";
import { addServerToInstance } from "@/services/electron";
import type { Modpack } from "@/services/github";

/**
 * "¿En qué instancia lo añades?" — every installed instance (online and
 * private). Writes the server into that instance's Multijugador list; ones
 * that are open right now can't be picked (see instances:add-server in main.js).
 */
export function ServerInstancePicker({
  server,
  onDone,
}: {
  server: { name: string; ip: string };
  onDone?: () => void;
}) {
  const online = useModpacks((s) => s.modpacks);
  const custom = useCustomInstances((s) => s.instances);
  useEffect(() => {
    useCustomInstances.getState().loadInstances().catch(() => {});
  }, []);
  const instances = [...online.filter((p) => p.installed), ...custom];

  return (
    <div className="space-y-1.5">
      <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-snug">
        <Info className="h-3 w-3 shrink-0 mt-px" />
        Para que se aplique, Minecraft tiene que estar cerrado en esa instancia. Lo verás en Multijugador la próxima vez que la abras.
      </p>
      {instances.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-3">No tienes ninguna instancia instalada.</p>
      ) : (
        <div className="space-y-0.5">
          {instances.map((pack) => (
            <InstanceRow key={pack.id} pack={pack} server={server} onDone={onDone} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceRow({ pack, server, onDone }: { pack: Modpack; server: { name: string; ip: string }; onDone?: () => void }) {
  const runState = useInstanceRunState(pack.id);
  const open = runState !== "idle";
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    setBusy(true);
    try {
      const { added } = await addServerToInstance(pack.id, server.name, server.ip);
      if (added) toast.success(`${server.name} añadido a ${pack.name}.`);
      else toast.info(`${pack.name} ya tenía ${server.ip} en su lista.`);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo añadir el servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={open || busy}
      title={open ? "Cierra Minecraft en esta instancia para poder añadirlo" : `Añadir a ${pack.name}`}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs text-gray-200 hover:bg-white/5 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
    >
      {pack.imageUrl ? (
        <img src={pack.imageUrl} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
      ) : (
        <span className="h-5 w-5 rounded-sm bg-white/10 flex items-center justify-center shrink-0">
          <Boxes className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
      <span className="flex-1 min-w-0 truncate">{pack.name}</span>
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      ) : open ? (
        <span className="text-[9px] uppercase tracking-wide text-amber-400 shrink-0">Abierta</span>
      ) : null}
    </button>
  );
}
