import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Download,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useModpacks } from "@/hooks/use-modpacks";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { getMySource, repoKey, sameRepo } from "@/lib/sources";
import { OFFLINE_REASON_LABEL } from "@/lib/online-history";
import { installOnlineInstance } from "@/lib/install-online-instance";
import { RedeemCodeDialog } from "@/components/redeem-code-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Modpack } from "@/services/github";

/** "owner/repo" for display — the creator behind a group of instances. */
function repoLabel(repoUrl: string | undefined): string {
  return repoUrl?.replace("https://github.com/", "") || "Desconocido";
}

type Tab = "online" | "past" | "archived";

const TABS: { id: Tab; label: string }[] = [
  { id: "online", label: "En línea" },
  { id: "past", label: "Pasadas" },
  { id: "archived", label: "Archivadas" },
];

/** "Instancias online" screen of the account menu, in three tabs:
 *  - En línea: every online instance you can reach — your own repo's plus the
 *    ones given to you by code — grouped by the repo (creator) they come from.
 *  - Pasadas: ones you left, were removed from, or that got deleted
 *    (lib/online-history.ts) — still playable if their files are kept.
 *  - Archivadas: either kind, hidden from the carousel.
 *  `onNavigate` closes the menu and goes to the path. */
export function OnlineInstancesPanel({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { modpacks, pastModpacks, history, loading, loaded, sourceErrors, loadModpacks, setArchived } = useModpacks();
  const [tab, setTab] = useState<Tab>("online");
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [leaving, setLeaving] = useState<Modpack | null>(null);

  // Nothing loaded yet and nobody tried (e.g. opened from the Hub) — load once.
  useEffect(() => {
    const { loaded: done, loading: busy } = useModpacks.getState();
    if (!done && !busy) loadModpacks();
  }, [loadModpacks]);

  const mine = getMySource();
  const isArchived = (id: string) => !!history[id]?.archived;
  const online = modpacks.filter((mp) => !isArchived(mp.id));
  const past = pastModpacks.filter((mp) => !isArchived(mp.id));
  const archived = [...modpacks, ...pastModpacks].filter((mp) => isArchived(mp.id));
  const counts: Record<Tab, number> = { online: online.length, past: past.length, archived: archived.length };

  const groups = new Map<string, { repoUrl: string; packs: Modpack[] }>();
  for (const mp of online) {
    const key = repoKey(mp.repoUrl ?? "") ?? "?";
    if (!groups.has(key)) groups.set(key, { repoUrl: mp.repoUrl ?? "", packs: [] });
    groups.get(key)!.packs.push(mp);
  }
  // Your own repo first, then the rest alphabetically.
  const ordered = [...groups.values()].sort((a, b) => {
    const am = sameRepo(a.repoUrl, mine?.repoUrl) ? 0 : 1;
    const bm = sameRepo(b.repoUrl, mine?.repoUrl) ? 0 : 1;
    return am - bm || repoLabel(a.repoUrl).localeCompare(repoLabel(b.repoUrl));
  });
  const failed = Object.entries(sourceErrors);

  const row = (mp: Modpack) => (
    <InstanceRow
      key={mp.id}
      pack={mp}
      creator={mp.outOfNetwork ? repoLabel(history[mp.id]?.repoUrl) : undefined}
      archived={isArchived(mp.id)}
      canLeave={!mp.outOfNetwork && !sameRepo(mp.repoUrl, mine?.repoUrl)}
      onOpen={() => onNavigate(`/modpack/${mp.id}`)}
      onToggleArchive={() => setArchived(mp.id, !isArchived(mp.id))}
      onLeave={() => setLeaving(mp)}
    />
  );

  const empty = (text: string) => <p className="text-xs text-muted-foreground text-center py-6 px-4">{text}</p>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 shrink-0">
        <Globe className="h-4 w-4 text-accent" />
        <h2 className="flex-1 text-sm font-semibold text-white">Instancias online</h2>
        <button
          type="button"
          onClick={() => loadModpacks()}
          disabled={loading}
          title="Recargar"
          aria-label="Recargar"
          className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-1 pb-2 border-b border-white/5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
              tab === t.id ? "bg-accent/15 text-accent" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="text-[10px] opacity-70">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-2 space-y-3">
        {tab === "online" ? (
          <>
            {loading && !loaded ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            ) : ordered.length === 0 ? (
              empty("No tienes ninguna instancia online en línea. Pide un código de acceso a quien la haya creado y canjéalo abajo.")
            ) : (
              ordered.map((g) => (
                <section key={g.repoUrl} className="space-y-1.5">
                  <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                    {sameRepo(g.repoUrl, mine?.repoUrl) ? "Tus instancias" : repoLabel(g.repoUrl)}
                  </h3>
                  {g.packs.map(row)}
                </section>
              ))
            )}

            {failed.map(([url, message]) => (
              <div
                key={url}
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  No se pudo leer <span className="font-semibold">{repoLabel(url)}</span>: {message.slice(0, 120)}
                </span>
              </div>
            ))}
          </>
        ) : tab === "past" ? (
          past.length === 0 ? (
            empty("Aquí aparecerán las instancias de las que salgas, de las que te quiten o que su creador elimine.")
          ) : (
            <div className="space-y-1.5">{past.map(row)}</div>
          )
        ) : archived.length === 0 ? (
          empty("Las instancias que archives se ocultan del carrusel y aparecen aquí.")
        ) : (
          <div className="space-y-1.5">{archived.map(row)}</div>
        )}
      </div>

      <div className="pt-2 border-t border-white/5 shrink-0">
        <button
          type="button"
          onClick={() => setRedeemOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-bold hover:bg-accent/90 transition-colors"
        >
          <KeyRound className="h-4 w-4" />
          Canjear código
        </button>
      </div>

      <RedeemCodeDialog open={redeemOpen} onOpenChange={setRedeemOpen} onRedeemed={() => loadModpacks()} />
      <LeaveInstanceDialog pack={leaving} onClose={() => setLeaving(null)} />
    </div>
  );
}

interface InstanceRowProps {
  pack: Modpack;
  /** Past instances only — their repo, shown since they're not grouped. */
  creator?: string;
  archived: boolean;
  canLeave: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
  onLeave: () => void;
}

function InstanceRow({ pack, creator, archived, canLeave, onOpen, onToggleArchive, onLeave }: InstanceRowProps) {
  const { launching, launch } = useLaunchModpack(pack);
  const [installing, setInstalling] = useState(false);
  const isPast = !!pack.outOfNetwork;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await installOnlineInstance(pack);
      toast.success(`${pack.name} instalada.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setInstalling(false);
    }
  };

  const iconBtn =
    "h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-500 hover:bg-white/10 hover:text-white transition-colors";

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.07] hover:border-white/10 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        disabled={isPast && !pack.installed}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left disabled:cursor-default"
      >
        <div
          className={`h-8 w-8 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center text-[10px] font-black text-accent/60 shrink-0 ${
            isPast ? "grayscale opacity-70" : ""
          }`}
        >
          {pack.imageUrl ? <img src={pack.imageUrl} alt="" className="h-full w-full object-cover" /> : pack.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-100 truncate">{pack.name}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {isPast ? (
              <>
                <span className="text-red-400/90">{OFFLINE_REASON_LABEL[pack.outOfNetwork!]}</span>
                {!pack.installed ? " · sin archivos" : creator ? ` · ${creator}` : ""}
              </>
            ) : (
              <>
                {pack.minecraftVersion} · <span className="uppercase">{pack.loaderType}</span>
                {pack.updateAvailable ? <span className="text-accent"> · actualización</span> : pack.installed ? "" : " · sin instalar"}
              </>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onToggleArchive}
        title={archived ? "Desarchivar (volver a mostrar en el carrusel)" : "Archivar (ocultar del carrusel)"}
        aria-label={archived ? "Desarchivar" : "Archivar"}
        className={iconBtn}
      >
        {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
      </button>
      {canLeave && (
        <button
          type="button"
          onClick={onLeave}
          title="Salir de la instancia"
          aria-label="Salir de la instancia"
          className={`${iconBtn} hover:!bg-red-500/15 hover:!text-red-400`}
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      )}

      {pack.installed ? (
        <button
          type="button"
          onClick={launch}
          disabled={launching}
          title={pack.updateAvailable ? "Actualizar y jugar" : "Jugar"}
          aria-label="Jugar"
          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60 transition-colors"
        >
          {launching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
        </button>
      ) : !isPast ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          title="Instalar"
          aria-label="Instalar"
          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-gray-300 hover:text-accent hover:border-accent/50 disabled:opacity-60 transition-colors"
        >
          {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

/** "Salir de la instancia" — asks whether to keep its files, then leaves. */
function LeaveInstanceDialog({ pack, onClose }: { pack: Modpack | null; onClose: () => void }) {
  const leaveInstance = useModpacks((s) => s.leaveInstance);
  const [busy, setBusy] = useState<"keep" | "delete" | null>(null);

  const leave = async (keepFiles: boolean) => {
    if (!pack) return;
    setBusy(keepFiles ? "keep" : "delete");
    try {
      await leaveInstance(pack, keepFiles);
      toast.success(`Has salido de ${pack.name}.`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo salir de la instancia.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!pack} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Salir de {pack?.name}</DialogTitle>
          <DialogDescription>
            Pasará a tus instancias pasadas: dejarás de recibir actualizaciones y no tendrás el chat cooperativo con
            sus jugadores. Para volver necesitarás un código nuevo.
          </DialogDescription>
        </DialogHeader>
        {pack?.installed && (
          <p className="text-sm text-gray-300">
            ¿Quieres conservar los archivos de la instancia (mundos, configuración…)? Si los conservas podrás seguir
            jugándola sin conexión a la red de la instancia.
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={!!busy}>
            Cancelar
          </Button>
          {pack?.installed ? (
            <>
              <Button variant="destructive" onClick={() => leave(false)} disabled={!!busy}>
                {busy === "delete" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Borrar archivos
              </Button>
              <Button onClick={() => leave(true)} disabled={!!busy}>
                {busy === "keep" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conservar archivos
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={() => leave(false)} disabled={!!busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
