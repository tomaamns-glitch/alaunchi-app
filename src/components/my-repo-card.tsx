import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Github, Loader2, Lock, Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMySource, useIsCreator } from "@/hooks/use-my-source";
import { useModpacks } from "@/hooks/use-modpacks";
import { useAuth } from "@/hooks/use-auth";
import { fetchModpacks } from "@/services/github";
import { reencryptAccessCodes } from "@/services/access-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

/** Ajustes → Mi repositorio: where a creator plugs in their own GitHub repo.
 *  Saving verifies it against GitHub first (hooks/use-my-source.ts); passing
 *  that is what shows the ADMIN button. */
export function MyRepoCard() {
  const stored = useMySource();
  const isCreator = useIsCreator();
  const loadModpacks = useModpacks((s) => s.loadModpacks);
  const uuid = useAuth((s) => s.uuid);

  const [repoUrl, setRepoUrl] = useState(stored.repoUrl);
  const [adminToken, setAdminToken] = useState(stored.adminToken);
  const [isPrivate, setIsPrivate] = useState(stored.isPrivate);
  const [readToken, setReadToken] = useState(stored.readToken);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Re-sync the form when the stored config changes underneath (save/clear).
  useEffect(() => {
    setRepoUrl(stored.repoUrl);
    setAdminToken(stored.adminToken);
    setIsPrivate(stored.isPrivate);
    setReadToken(stored.readToken);
  }, [stored.repoUrl, stored.adminToken, stored.isPrivate, stored.readToken]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await stored.save({ repoUrl, adminToken, isPrivate, readToken });
      setWarnings(result.warnings);
      // Codes carry the read token encrypted inside — after a token change (or
      // the repo turning private/public) every existing code gets the current
      // one, so players refreshing through their code aren't locked out.
      if (uuid) {
        try {
          const packs = await fetchModpacks(result.repoUrl, adminToken.trim());
          await reencryptAccessCodes(
            result.repoUrl,
            packs.map((p) => p.id),
            uuid,
            result.isPrivate ? readToken.trim() : undefined
          );
        } catch {
          toast.warning("No se pudieron actualizar tus códigos de acceso con el nuevo token. Vuelve a guardar más tarde.");
        }
      }
      if (result.isPrivate !== isPrivate) {
        toast.info(
          result.isPrivate
            ? "GitHub dice que el repo es privado: se ha marcado como privado."
            : "GitHub dice que el repo es público: no hace falta token de lectura."
        );
      }
      toast.success(
        result.initialized
          ? "Repositorio conectado y preparado (se creó modpacks.json vacío)."
          : "Repositorio conectado. Ya puedes publicar desde ADMIN."
      );
      loadModpacks();
    } catch (e: any) {
      setError(e?.message || "No se pudo comprobar el repositorio.");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    stored.clear();
    setError(null);
    setWarnings([]);
    toast.success("Repositorio quitado.");
    loadModpacks();
  };

  const dirty =
    repoUrl !== stored.repoUrl ||
    adminToken !== stored.adminToken ||
    isPrivate !== stored.isPrivate ||
    (isPrivate && readToken !== stored.readToken);

  return (
    <Card className="bg-card/50 border-white/5">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Github className="h-5 w-5 text-amber-400" /> Mi repositorio
        </CardTitle>
        <CardDescription>
          Solo si quieres crear tus propias instancias online. Conecta un repositorio de GitHub tuyo y te
          aparecerá el botón ADMIN para publicarlas. Para jugar a las de otros no hace falta: basta con su
          código de acceso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isCreator && !dirty && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="flex-1 min-w-0 truncate">
              Conectado a <span className="font-semibold">{stored.repoUrl.replace("https://github.com/", "")}</span> ·{" "}
              {stored.isPrivate ? "privado" : "público"}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="repo">Repositorio</Label>
          <Input
            id="repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="bg-background/50 border-white/10 text-white"
            placeholder="https://github.com/usuario/mis-modpacks"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="adminToken">Token de administrador</Label>
          <Input
            id="adminToken"
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            className="bg-background/50 border-white/10 text-white"
            placeholder="github_pat_..."
          />
          <p className="text-xs text-muted-foreground">
            Token <em>fine-grained</em> con acceso solo a este repositorio y permiso{" "}
            <strong>Contents: Read and write</strong>. Sirve para publicar y editar; se guarda solo en este equipo y
            nunca se comparte.{" "}
            <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
              Crear token <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border border-white/10 bg-background/30 px-3 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="isPrivate" className="flex items-center gap-1.5">
              {isPrivate ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Globe className="h-3.5 w-3.5 text-emerald-400" />}
              Repositorio privado
            </Label>
            <p className="text-xs text-muted-foreground">
              {isPrivate
                ? "Los jugadores necesitarán un token de lectura para descargar."
                : "Los jugadores descargan directamente, sin token."}
            </p>
          </div>
          <Switch id="isPrivate" checked={isPrivate} onCheckedChange={setIsPrivate} />
        </div>

        {isPrivate && (
          <div className="space-y-2">
            <Label htmlFor="readToken">Token de lectura para jugadores</Label>
            <Input
              id="readToken"
              type="password"
              value={readToken}
              onChange={(e) => setReadToken(e.target.value)}
              className="bg-background/50 border-white/10 text-white"
              placeholder="github_pat_..."
            />
            <p className="text-xs text-muted-foreground">
              <strong className="text-amber-400">Se comparte</strong> con quien tenga un código de acceso a tus
              instancias. Créalo aparte, con acceso solo a este repositorio y permiso{" "}
              <strong>Contents: Read-only</strong>. Si pegas uno que pueda escribir, no se guardará.{" "}
              <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                Crear token <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {warnings.map((w) => (
          <div key={w} className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{w}</span>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || !repoUrl.trim() || !adminToken.trim() || (isPrivate && !readToken.trim())}
            className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {saving ? "Comprobando con GitHub..." : "Comprobar y guardar"}
          </Button>
          {(stored.repoUrl || stored.adminToken) && (
            <Button variant="outline" onClick={handleClear} disabled={saving} title="Quitar repositorio">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
