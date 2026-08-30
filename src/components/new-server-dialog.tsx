import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { addServer, updateServer, type ServerEntry, type ServerProtocol } from "@/services/servers";

const DEFAULT_PORT: Record<ServerProtocol, number> = { sftp: 22, ftp: 21 };

interface NewServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing server instead of creating one. */
  editing?: ServerEntry | null;
  onSaved: (server: ServerEntry) => void;
}

export function NewServerDialog({ open, onOpenChange, editing, onSaved }: NewServerDialogProps) {
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<ServerProtocol>("sftp");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(String(DEFAULT_PORT.sftp));
  const [portTouched, setPortTouched] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rootPath, setRootPath] = useState("/");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setProtocol(editing.protocol);
      setHost(editing.host);
      setPort(String(editing.port));
      setPortTouched(true);
      setUsername(editing.username);
      setRootPath(editing.rootPath || "/");
    } else {
      setName("");
      setProtocol("sftp");
      setHost("");
      setPort(String(DEFAULT_PORT.sftp));
      setPortTouched(false);
      setUsername("");
      setRootPath("/");
    }
    setPassword("");
  }, [open, editing]);

  const handleProtocolChange = (next: ServerProtocol) => {
    setProtocol(next);
    // Only follow the protocol's default port while the user hasn't typed
    // their own — a host with a nonstandard port shouldn't get clobbered.
    if (!portTouched) setPort(String(DEFAULT_PORT[next]));
  };

  const canSubmit =
    name.trim().length > 0 &&
    host.trim().length > 0 &&
    !!port &&
    username.trim().length > 0 &&
    (editing ? true : password.length > 0) &&
    !saving;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        protocol,
        host: host.trim(),
        port: Number(port),
        username: username.trim(),
        password: password || undefined,
        rootPath: rootPath.trim() || "/",
      };
      const saved = editing ? await updateServer(editing.id, input) : await addServer(input);
      toast.success(editing ? "Servidor actualizado." : "Servidor añadido.");
      onSaved(saved);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar el servidor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar servidor" : "Nuevo servidor"}</DialogTitle>
          <DialogDescription>Acceso FTP/SFTP al servidor de Minecraft — se guarda solo en este equipo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi servidor SMP" />
          </div>

          <div className="space-y-1.5">
            <Label>Protocolo</Label>
            <ToggleGroup type="single" value={protocol} onValueChange={(v) => v && handleProtocolChange(v as ServerProtocol)} className="justify-start">
              <ToggleGroupItem value="sftp" className="px-4 data-[state=on]:bg-accent/15 data-[state=on]:text-accent">
                SFTP
              </ToggleGroupItem>
              <ToggleGroupItem value="ftp" className="px-4 data-[state=on]:bg-accent/15 data-[state=on]:text-accent">
                FTP
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="mi-servidor.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Puerto</Label>
              <Input
                value={port}
                onChange={(e) => {
                  setPort(e.target.value.replace(/\D/g, ""));
                  setPortTouched(true);
                }}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Usuario</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </div>

          <div className="space-y-1.5">
            <Label>Contraseña{editing && <span className="text-muted-foreground font-normal"> (déjalo en blanco para no cambiarla)</span>}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>

          <div className="space-y-1.5">
            <Label>Carpeta raíz <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input value={rootPath} onChange={(e) => setRootPath(e.target.value)} placeholder="/" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {editing ? "Guardar" : "Añadir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
