import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { redeemAccessCode } from "@/services/access-codes";
import { fetchSnapshot, cacheSnapshot } from "@/services/github";
import { addGrantedSource, getReadToken } from "@/lib/sources";
import { normalizeCode } from "@/services/access-codes";

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
      const access = await redeemAccessCode(code, uuid, username);
      if (!access) {
        setError("Código no válido.");
        return;
      }
      // The code carries the repo (and its read token, if private) — adding it
      // as a source is what makes the catalog read that repo at all.
      addGrantedSource({ repoUrl: access.repoUrl, readToken: access.readToken, codes: [normalizeCode(code)] });
      const { modpackId, repoUrl } = access;
      toast.success("Instancia online añadida.");
      // Fire-and-forget — by the time the player finds the pack in the
      // carousel and hits "Instalar", the manifest is (usually) already
      // sitting in the cache, so that first click skips straight to
      // downloading files instead of waiting on this fetch too.
      fetchSnapshot(repoUrl, modpackId, getReadToken(repoUrl))
        .then((manifest) => manifest && cacheSnapshot(modpackId, manifest))
        .catch(() => {});
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
