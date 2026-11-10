import { useEffect, useMemo, useState } from "react";
import { Boxes, Info, Loader2, Plus, Search } from "lucide-react";
import { Hint } from "@/components/hint";
import { toast, notify } from "@/lib/toast";
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
  layout = "compact",
}: {
  server: { name: string; ip: string };
  onDone?: () => void;
  /** "panel": Cuenta → Servers' full screen — search, online/private sections
   *  and rows like Instancias online. "compact": the chat card's dropdown. */
  layout?: "compact" | "panel";
}) {
  const online = useModpacks((s) => s.modpacks);
  const custom = useCustomInstances((s) => s.instances);
  useEffect(() => {
    useCustomInstances.getState().loadInstances().catch(() => {});
  }, []);
  const instances = [...online.filter((p) => p.installed), ...custom];

  if (layout === "panel") {
    return <PanelPicker server={server} onDone={onDone} online={online.filter((p) => p.installed)} custom={custom} />;
  }

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
      else notify.info(`${pack.name} ya tenía ${server.ip} en su lista.`);
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

function PanelPicker({
  server,
  onDone,
  online,
  custom,
}: {
  server: { name: string; ip: string };
  onDone?: () => void;
  online: Modpack[];
  custom: Modpack[];
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const sections = useMemo(() => {
    const match = (p: Modpack) => !q || p.name.toLowerCase().includes(q);
    return [
      { title: "Instancias online", packs: online.filter(match) },
      { title: "Instancias privadas", packs: custom.filter(match) },
    ].filter((s) => s.packs.length > 0);
  }, [online, custom, q]);
  const total = online.length + custom.length;

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      {total > 5 && (
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar instancia..."
            className="w-full h-8 rounded-md bg-white/[0.07] pl-8 pr-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:bg-white/[0.14] transition-colors"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">No tienes ninguna instancia instalada.</p>
        ) : sections.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">Ninguna instancia coincide con la búsqueda.</p>
        ) : (
          sections.map((sec) => (
            <section key={sec.title} className="space-y-1.5">
              <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {sec.title} <span className="opacity-60">{sec.packs.length}</span>
              </h3>
              {sec.packs.map((pack) => (
                <PanelRow key={pack.id} pack={pack} server={server} onDone={onDone} />
              ))}
            </section>
          ))
        )}
      </div>

      <p className="shrink-0 flex items-start gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-2 text-[10px] text-muted-foreground leading-snug">
        <Info className="h-3 w-3 shrink-0 mt-px text-accent" />
        Minecraft tiene que estar cerrado en esa instancia. Lo verás en Multijugador la próxima vez que la abras.
      </p>
    </div>
  );
}

/** Same row as Instancias online's: logo, name, version · loader, and the add
 *  button on the right (or "Abierta" while that instance is running). */
function PanelRow({ pack, server, onDone }: { pack: Modpack; server: { name: string; ip: string }; onDone?: () => void }) {
  const runState = useInstanceRunState(pack.id);
  const open = runState !== "idle";
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    setBusy(true);
    try {
      const { added } = await addServerToInstance(pack.id, server.name, server.ip);
      if (added) toast.success(`${server.name} añadido a ${pack.name}.`);
      else notify.info(`${pack.name} ya tenía ${server.ip} en su lista.`);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") || "No se pudo añadir el servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-transparent bg-white/[0.07] px-2 py-1.5 hover:bg-white/[0.14] transition-colors">
      <div className="h-8 w-8 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center shrink-0">
        {pack.imageUrl ? (
          <img src={pack.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-100 truncate">{pack.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {pack.minecraftVersion}
          {pack.loaderType && (
            <>
              {" "}
              · <span className="uppercase">{pack.loaderType}</span>
            </>
          )}
        </div>
      </div>
      {open ? (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">Abierta</span>
      ) : (
        <Hint label={`Añadir a ${pack.name}`}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy}
            aria-label={`Añadir a ${pack.name}`}
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </Hint>
      )}
    </div>
  );
}
