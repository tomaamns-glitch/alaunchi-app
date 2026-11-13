import { useEffect, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { useAuth } from "@/hooks/use-auth";
import { REPORT_REASONS, submitReport, type ReportReason } from "@/services/reports";
import { cn } from "@/lib/utils";

/**
 * "Reportar" (chat ⋮ and someone's profile ⋮): a reason, an optional comment,
 * and a notice that the conversation's last messages go with it — they're
 * attached by the server (functions/src/reports.ts), so the moderator sees
 * what really happened. Only the moderator can read reports.
 */
export function ReportDialog({
  open,
  onOpenChange,
  targetUuid,
  targetName,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUuid: string;
  targetName: string;
  source: "chat" | "profile";
}) {
  const myUsername = useAuth((s) => s.username);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(null);
      setComment("");
    }
  }, [open]);

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await submitReport({
        targetUuid,
        targetName,
        reporterName: myUsername ?? "",
        reason,
        comment: comment.trim(),
        source,
      });
      toast.success("Reporte enviado. Gracias: el moderador lo revisará.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo enviar el reporte.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-destructive" />
            Reportar a {targetName}
          </DialogTitle>
          <DialogDescription>
            Solo lo verá el moderador del grupo. Se adjuntarán automáticamente los últimos mensajes de vuestra conversación
            para que pueda ver lo que pasó.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReason(r.id)}
              aria-pressed={reason === r.id}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors",
                reason === r.id ? "border-destructive/60 bg-destructive/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
              )}
            >
              <span className="block text-sm font-medium text-gray-100">{r.label}</span>
              <span className="block text-[11px] text-muted-foreground">{r.hint}</span>
            </button>
          ))}
        </div>

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 1000))}
          placeholder="Cuéntale al moderador qué ha pasado (opcional)"
          className="min-h-[80px] bg-white/[0.05] border-white/10"
        />

        <DialogFooter>
          <Button variant="ghost" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!reason || sending}
            onClick={() => void send()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
