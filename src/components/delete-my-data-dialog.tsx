import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { DELETE_CONFIRM_WORD, deleteMyData } from "@/services/delete-my-data";

/**
 * "Borrar mis datos" (Ajustes → Mi cuenta). Spells out what goes and what
 * stays (kept in sync with functions/src/account.ts) and asks to type
 * BORRAR, since it can't be undone.
 */
export function DeleteMyDataDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await deleteMyData();
      toast.success("Tus datos se han borrado de los servidores de ALaunchi.");
      onOpenChange(false);
      setLocation("/login");
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron borrar tus datos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" /> Borrar mis datos
          </DialogTitle>
          <DialogDescription>
            Se borra todo lo que ALaunchi guarda de ti en sus servidores. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
            <p className="font-medium text-gray-100 mb-1">Se borra</p>
            <ul className="list-disc pl-5 space-y-0.5 text-gray-300 text-xs">
              <li>Tu perfil, apodo, estado y tiempo jugado.</li>
              <li>Tus amigos y solicitudes de amistad.</li>
              <li>Tus conversaciones privadas enteras (también para la otra persona).</li>
              <li>Tus mensajes en los chats de grupo.</li>
              <li>Tus accesos e invitaciones a instancias online (tendrás que volver a canjear un código).</li>
              <li>Los banners y logos que hayas subido (también los de tus instancias publicadas).</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2.5">
            <p className="font-medium text-gray-100 mb-1">Se conserva</p>
            <ul className="list-disc pl-5 space-y-0.5 text-gray-300 text-xs">
              <li>Los reportes y bloqueos de instancia en los que aparezcas (moderación).</li>
              <li>Tu cuenta de Microsoft y de Minecraft: no son nuestras, no se tocan.</li>
              <li>Lo que hay en este PC: instancias, biblioteca personal y ajustes.</li>
              <li>Tus modpacks en GitHub: están en tu repositorio, bórralos allí si quieres.</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Después se cierra la sesión. Si vuelves a entrar empezarás de cero.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-300">
              Escribe <span className="font-mono font-bold text-white">{DELETE_CONFIRM_WORD}</span> para confirmar
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              disabled={busy}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={run} disabled={!confirmed || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Borrar mis datos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
