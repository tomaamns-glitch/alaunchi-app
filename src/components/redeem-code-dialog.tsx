import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { joinWithCode } from "@/lib/join-instance";

interface RedeemCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a code is successfully redeemed — the caller reloads the catalog. */
  onRedeemed: () => void;
}

/** Shared by the titlebar's "Añadir" button and the empty-carousel CTA —
 *  both just want "ask for a code, unlock the pack it points to". */
export function RedeemCodeDialog({ open, onOpenChange, onRedeemed }: RedeemCodeDialogProps) {
  const { uuid, username } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCode("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!code.trim() || !uuid || !username) return;
    setSubmitting(true);
    setError(null);
    try {
      const access = await joinWithCode(code, uuid, username);
      if (!access) {
        setError("Código no válido.");
        return;
      }
      toast.success("Instancia online añadida.");
      onRedeemed();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      setError(err?.message || "No se pudo comprobar el código.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Añadir instancia online</DialogTitle>
          <DialogDescription>Introduce el código de acceso que te han pasado.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="access-code">Código</Label>
          <Input
            id="access-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="ABCDE-FGH23"
            maxLength={16}
            autoFocus
            className="font-mono tracking-[0.2em] text-center text-lg uppercase"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!code.trim() || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
