import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Clock,
  Download,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { toast, notify } from "@/lib/toast";
import { useModpacks } from "@/hooks/use-modpacks";
import { useLaunchModpack } from "@/hooks/use-launch-modpack";
import { getMySource, repoKey, sameRepo } from "@/lib/sources";
import { OFFLINE_REASON_LABEL } from "@/lib/online-history";
import { installOnlineInstance } from "@/lib/install-online-instance";
import { RedeemCodeDialog } from "@/components/redeem-code-dialog";
import { InstanceLogo } from "@/components/invite-bubbles";
import { useInvites } from "@/hooks/use-invites";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Hint } from "@/components/hint";
import { useRepoCreators } from "@/lib/repo-creators";
import { getInstalledModpacksMeta } from "@/services/electron";
import { formatPlaytime } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Modpack } from "@/services/github";

/** Who's behind a repo, by name (useRepoCreators) — never the GitHub
 *  "owner/repo", which means nothing to the players. */
function creatorLabel(names: Record<string, string>, repoUrl: string | undefined): string {
  const key = repoKey(repoUrl ?? "");
  return (key && names[key]) || "Creador desconocido";
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
  const [removing, setRemoving] = useState<Modpack | null>(null);
  const creators = useRepoCreators();
  // Your own hours on each installed instance (alaunchi-meta.json), reloaded
  // whenever the catalog does (a session may have ended since).
  const [playtime, setPlaytime] = useState<Record<string, number>>({});
  useEffect(() => {
    getInstalledModpacksMeta()
      .then((meta) => {
        const out: Record<string, number> = {};
        for (const [id, m] of Object.entries(meta)) if ((m as any)?.totalPlaytimeMs) out[id] = (m as any).totalPlaytimeMs;
        setPlaytime(out);
      })
      .catch(() => {});
  }, [loaded, loading]);
  const invites = Object.values(useInvites((s) => s.invites)).sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  const inviteBusy = useInvites((s) => s.busyKey);

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
    return am - bm || creatorLabel(creators, a.repoUrl).localeCompare(creatorLabel(creators, b.repoUrl));
  });
  const failed = Object.entries(sourceErrors);

  const row = (mp: Modpack) => {
    const own = !mp.outOfNetwork && sameRepo(mp.repoUrl, mine?.repoUrl);
    return (
      <InstanceRow
        key={mp.id}
        pack={mp}
        creator={mp.outOfNetwork ? creatorLabel(creators, history[mp.id]?.repoUrl) : undefined}
        playtimeMs={playtime[mp.id]}
        archived={isArchived(mp.id)}
        canLeave={!mp.outOfNetwork && !own}
        canRemove={!own}
        onOpen={() => onNavigate(`/modpack/${mp.id}`)}
        onToggleArchive={() => setArchived(mp.id, !isArchived(mp.id))}
        onLeave={() => setLeaving(mp)}
        onRemove={() => setRemoving(mp)}
      />
    );
  };

  const empty = (text: string) => <p className="text-xs text-muted-foreground text-center py-6 px-4">{text}</p>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 shrink-0">
        <Globe className="h-4 w-4 text-accent" />
        <h2 className="flex-1 text-sm font-semibold text-white">Instancias online</h2>
        <Hint label="Recargar">
          <button
            type="button"
            onClick={() => loadModpacks()}
            disabled={loading}
            aria-label="Recargar"
            className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </Hint>
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
            {invites.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Invitaciones ({invites.length})
                </h3>
                {invites.map((inv) => (
                  <div key={inv.key} className="flex items-center gap-2.5 rounded-md border border-accent/30 bg-accent/[0.06] px-2.5 py-2">
                    <InstanceLogo invite={inv} className="h-9 w-9 rounded-md shrink-0" />
                    <p className="min-w-0 flex-1 text-xs text-gray-300 leading-snug">
                      <span className="font-semibold text-white">{inv.fromUsername}</span> te invita a{" "}
                      <span className="font-bold" style={{ color: inv.color || "hsl(205 90% 55%)" }}>
                        {inv.modpackName}
                      </span>
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] border-white/15"
                        disabled={inviteBusy === inv.key}
                        onClick={() => useInvites.getState().reject(inv.key)}
                      >
                        Rechazar
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={inviteBusy === inv.key}
                        onClick={() => useInvites.getState().accept(inv.key)}
                      >
                        {inviteBusy === inv.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aceptar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}
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
                    {sameRepo(g.repoUrl, mine?.repoUrl) ? "Tus instancias" : `De ${creatorLabel(creators, g.repoUrl)}`}
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
                  No se pudieron leer las instancias de <span className="font-semibold">{creatorLabel(creators, url)}</span>:{" "}
                  {message.slice(0, 120)}
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
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent text-accent-foreground text-sm font-bold hover:bg-accent/90 transition-colors"
        >
          <KeyRound className="h-4 w-4" />
          Canjear código
        </button>
      </div>

      <RedeemCodeDialog open={redeemOpen} onOpenChange={setRedeemOpen} onRedeemed={() => loadModpacks()} />
      <LeaveInstanceDialog pack={leaving} onClose={() => setLeaving(null)} />
      <RemoveInstanceDialog pack={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

interface InstanceRowProps {
  pack: Modpack;
  /** Past instances only — their creator, shown since they're not grouped. */
  creator?: string;
  /** Your hours on it (installed instances that have had a session). */
  playtimeMs?: number;
  archived: boolean;
  canLeave: boolean;
  /** Anything but your own repo's instances. */
  canRemove: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
  onLeave: () => void;
  onRemove: () => void;
}

function InstanceRow({
  pack,
  creator,
  playtimeMs,
  archived,
  canLeave,
  canRemove,
  onOpen,
  onToggleArchive,
  onLeave,
  onRemove,
}: InstanceRowProps) {
  const { busy, running, toggle } = useLaunchModpack(pack);
  const [installing, setInstalling] = useState(false);
  const isPast = !!pack.outOfNetwork;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      if (!(await installOnlineInstance(pack))) return; // cancelled in the groups picker
      notify.success(`${pack.name} instalada.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al instalar.");
    } finally {
      setInstalling(false);
    }
  };

  const iconBtn =
    "h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-500 hover:bg-white/10 hover:text-white transition-colors";

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-transparent bg-white/[0.07] px-2 py-1.5 hover:bg-white/[0.14] transition-colors">
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
            ) : !pack.installed ? (
              "Sin instalar"
            ) : (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-2.5 w-2.5 shrink-0 text-accent" />
                {playtimeMs ? formatPlaytime(playtimeMs) : "Sin jugar todavía"}
                {pack.updateAvailable && <span className="text-accent"> · actualización</span>}
              </span>
            )}
          </div>
        </div>
      </button>

      <Hint label={archived ? "Desarchivar" : "Archivar"}>
        <button type="button" onClick={onToggleArchive} aria-label={archived ? "Desarchivar" : "Archivar"} className={iconBtn}>
          {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        </button>
      </Hint>
      {canLeave && (
        <Hint label="Salir de la instancia">
          <button
            type="button"
            onClick={onLeave}
            aria-label="Salir de la instancia"
            className={`${iconBtn} hover:!bg-red-500/15 hover:!text-red-400`}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </Hint>
      )}
      {canRemove && (
        <Hint label="Eliminar">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Eliminar"
            className={`${iconBtn} hover:!bg-red-500/15 hover:!text-red-400`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </Hint>
      )}

      {pack.installed ? (
        <Hint label={running ? "Cerrar Minecraft" : pack.updateAvailable ? "Actualizar y jugar" : "Jugar"}>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-label={running ? "Cerrar Minecraft" : "Jugar"}
            className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-full disabled:opacity-60 transition-colors ${
              running ? "bg-red-600 text-white hover:bg-red-500" : "bg-accent text-accent-foreground hover:bg-accent/90"
            }`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : running ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
          </button>
        </Hint>
      ) : !isPast ? (
        <Hint label="Instalar">
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            aria-label="Instalar"
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-white/[0.07] text-gray-300 hover:text-accent hover:bg-white/[0.14] disabled:opacity-60 transition-colors"
          >
            {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
        </Hint>
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

/** "Eliminar" — takes the instance out of Instancias online altogether (not to
 *  Pasadas): leaves it if it's still online, and asks whether to keep its
 *  files, like deleting a private instance. */
function RemoveInstanceDialog({ pack, onClose }: { pack: Modpack | null; onClose: () => void }) {
  const removeInstance = useModpacks((s) => s.removeInstance);
  const [keepFiles, setKeepFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pack) setKeepFiles(false);
  }, [pack]);

  const remove = async () => {
    if (!pack) return;
    setBusy(true);
    try {
      await removeInstance(pack, keepFiles);
      toast.success(
        keepFiles && pack.installed ? `${pack.name} quitada de la app (archivos conservados).` : `${pack.name} eliminada.`
      );
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar la instancia.");
    } finally {
      setBusy(false);
    }
  };

  const online = !!pack && !pack.outOfNetwork;
  return (
    <AlertDialog open={!!pack} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:rounded-md">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar "{pack?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {online
              ? "Saldrás de la instancia y desaparecerá de Instancias online (no pasará a Pasadas). Para volver necesitarás un código nuevo. "
              : "Desaparecerá de Instancias online y del carrusel. "}
            {pack?.installed
              ? keepFiles
                ? "Sus archivos (mods, partidas guardadas, configuración) se quedarán en el equipo."
                : "Se borrará toda la instancia (mods, partidas guardadas, configuración) de este equipo. Esta acción no se puede deshacer."
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pack?.installed && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Checkbox checked={keepFiles} onCheckedChange={(v) => setKeepFiles(v === true)} disabled={busy} />
            Conservar los archivos de la instancia
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="border-transparent bg-white/[0.07] hover:bg-white/[0.14]">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
