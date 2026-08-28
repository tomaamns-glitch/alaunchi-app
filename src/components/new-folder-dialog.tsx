import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NewFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
}

export function NewFolderDialog({ open, onOpenChange, onCreate }: NewFolderDialogProps) {
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setName("");
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="folder-name">Nombre</Label>
          <Input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Mis packs de aventura"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
