import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { duplicateInstance } from "@/services/electron";

/** "<name> - copia", or "- copia 2", "- copia 3"… if that name is taken.
 *  Duplicating a copy builds on the original's name ("X - copia 2", not
 *  "X - copia - copia"). */
function suggestCopyName(name: string, taken: Set<string>): string {
  const base = name.replace(/ - copia( \d+)?$/i, "");
  let candidate = `${base} - copia`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} - copia ${n}`;
  return candidate;
}

/** Duplicar instancia: asks for the new name (pre-filled) and copies the whole
 *  instance — mods, configs, worlds, everything (instances:duplicate in main.js). */
export function DuplicateInstanceDialog({
  instance,
  onOpenChange,
}: {
  instance: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const instances = useCustomInstances((s) => s.instances);
  const loadInstances = useCustomInstances((s) => s.loadInstances);
  const [name, setName] = useState("");
  const [suggested, setSuggested] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!instance) return;
    const s = suggestCopyName(instance.name, new Set(instances.map((i) => i.name.trim().toLowerCase())));
    setSuggested(s);
    setName(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id]);

  const submit = async () => {
    if (!instance || !name.trim()) return;
    setWorking(true);
    try {
      // Renamed here → it's not shown as a plain copy (no ↺ in the Hub).
      const meta = await duplicateInstance(instance.id, name.trim(), name.trim() === suggested);
      await loadInstances();
      toast.success(`${meta.name} creada.`, {
        action: { label: "Abrir", onClick: () => setLocation(`/modpack/${meta.id}`) },
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo duplicar la instancia.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={!!instance} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent className="bg-card border-white/10 text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Duplicar instancia</DialogTitle>
          <DialogDescription className="text-xs">
            Se copia todo lo que tiene {instance?.name}: mods, shaders, resource packs, configuración, mundos… La original no cambia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="duplicate-name">Nombre de la copia</Label>
          <Input
            id="duplicate-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={64}
            autoFocus
            disabled={working}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-white/10" disabled={working} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={working || !name.trim()} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
            {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
            {working ? "Copiando…" : "Duplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
