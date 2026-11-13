import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, Flag, Loader2, MessageSquare, RefreshCw, RotateCcw, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChatHeads } from "@/hooks/use-chat-heads";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { isModerator } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { listReports, setReportStatus, REPORT_REASON_LABEL, type Report, type ReportStatus } from "@/services/reports";

const TABS: { id: ReportStatus; label: string }[] = [
  { id: "open", label: "Abiertos" },
  { id: "resolved", label: "Resueltos" },
  { id: "dismissed", label: "Descartados" },
];

/** Admin → Reportes: player reports, only for the moderator (lib/moderation.ts).
 *  Read and updated through the listReports / setReportStatus functions. */
export default function AdminReports() {
  const { isAuthenticated, uuid } = useAuth();
  const allowed = isModerator(uuid);
  const [, setLocation] = useLocation();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ReportStatus>("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
    else if (!allowed) setLocation("/admin");
  }, [isAuthenticated, allowed, setLocation]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReports(await listReports());
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar los reportes.");
      setReports((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const counts = useMemo(() => {
    const c: Record<ReportStatus, number> = { open: 0, resolved: 0, dismissed: 0 };
    for (const r of reports ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reports]);
  const shown = (reports ?? []).filter((r) => r.status === tab);

  const changeStatus = async (r: Report, status: ReportStatus) => {
    setBusyId(r.id);
    try {
      await setReportStatus(r.id, status);
      setReports((list) => list?.map((x) => (x.id === r.id ? { ...x, status, reviewedAt: Date.now() } : x)) ?? null);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar el reporte.");
    } finally {
      setBusyId(null);
    }
  };

  if (!allowed) return null;

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-5 px-6 pt-6 pb-6 max-w-5xl mx-auto w-full">
          <div className="relative shrink-0 rounded-md border border-transparent bg-gray-500/10 backdrop-blur-md p-5 overflow-hidden">
            <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-destructive/10 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight">Reportes</h1>
                <p className="text-xs text-muted-foreground">
                  {reports === null ? "Cargando…" : `${counts.open} abierto${counts.open === 1 ? "" : "s"} · solo los ves tú`}
                </p>
              </div>
              <Button variant="outline" className="shrink-0" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-md bg-gray-500/10 w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  tab === t.id ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-gray-200"
                )}
              >
                {t.label}
                <span className="ml-1.5 opacity-70">{counts[t.id]}</span>
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {reports === null ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando reportes…
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Flag className="h-7 w-7 opacity-60" />
              <p className="text-sm">{tab === "open" ? "No hay reportes pendientes." : "Nada por aquí."}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((r) => (
                <ReportCard key={r.id} report={r} busy={busyId === r.id} onStatus={(s) => void changeStatus(r, s)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ report: r, busy, onStatus }: { report: Report; busy: boolean; onStatus: (s: ReportStatus) => void }) {
  const [showMessages, setShowMessages] = useState(false);
  const openChat = useChatHeads((s) => s.openChat);
  const [, setLocation] = useLocation();
  const messages = r.messages ?? [];
  const nameOf = (uuid: string) => (uuid === r.targetUuid ? r.targetName || "Reportado" : uuid === r.reporterUuid ? r.reporterName || "Quien reporta" : "?");

  return (
    <div className="rounded-md border border-white/10 bg-gray-500/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-white">{r.reporterName || "Alguien"}</span>
            <span className="text-muted-foreground"> ha reportado a </span>
            <span className="font-semibold text-destructive">{r.targetName || r.targetUuid}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {REPORT_REASON_LABEL[r.reason] ?? r.reason} · desde {r.source === "profile" ? "su perfil" : "el chat"} ·{" "}
            {r.createdAt ? formatDistanceToNow(r.createdAt, { locale: es, addSuffix: true }) : "fecha desconocida"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLocation("/");
              openChat(r.targetUuid);
            }}
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Abrir chat
          </Button>
          {r.status === "open" ? (
            <>
              <Button size="sm" disabled={busy} className="bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => onStatus("resolved")}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />} Resuelto
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("dismissed")}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Descartar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("open")}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reabrir
            </Button>
          )}
        </div>
      </div>

      {r.comment ? (
        <p className="text-sm text-gray-200 whitespace-pre-wrap rounded bg-white/[0.04] px-3 py-2">{r.comment}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Sin comentario.</p>
      )}

      {messages.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowMessages((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-gray-200"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMessages ? "" : "-rotate-90")} />
            Últimos {messages.length} mensajes de su conversación
          </button>
          {showMessages && (
            <div className="mt-2 max-h-72 overflow-y-auto space-y-1 rounded bg-black/20 p-2">
              {messages.map((m, i) => (
                <div key={i} className="text-xs">
                  <span className="text-muted-foreground">{m.timestamp ? format(m.timestamp, "d MMM HH:mm", { locale: es }) : ""} </span>
                  <span className={cn("font-semibold", m.senderUuid === r.targetUuid ? "text-destructive" : "text-gray-300")}>
                    {nameOf(m.senderUuid)}:
                  </span>{" "}
                  <span className="text-gray-200 whitespace-pre-wrap">{m.text}</span>
                  {m.attachment && <span className="text-muted-foreground"> 📎 {m.attachment}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No tenían mensajes entre ellos.</p>
      )}
    </div>
  );
}
