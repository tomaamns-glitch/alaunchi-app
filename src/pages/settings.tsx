import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { ArrowLeft, Save, LogOut, Cpu, FolderOpen, FolderCog, ShieldCheck } from "lucide-react";
import { readSettings, writeSettings, isElectron, getDataDir, chooseDataDir, openDataDir } from "@/services/electron";

export default function Settings() {
  const { isAuthenticated, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const [, setLocation] = useLocation();

  const [maxMemoryMb, setMaxMemoryMb] = useState(2048);

  const [dataDir, setDataDir] = useState("");
  const [dataDirCustom, setDataDirCustom] = useState(false);
  const [changingDataDir, setChangingDataDir] = useState(false);

  const [azureClientId, setAzureClientId] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    readSettings().then((s) => { if (s.maxMemoryMb) setMaxMemoryMb(s.maxMemoryMb); });
    getDataDir().then((d) => { if (d) { setDataDir(d.dataDir); setDataDirCustom(d.isCustom); } });
    if (isAdmin) {
      setAzureClientId(localStorage.getItem("azureClientId") || "");
      setRepoUrl(localStorage.getItem("githubRepo") || "");
      setToken(localStorage.getItem("githubToken") || "");
    }
  }, [isAdmin]);

  const handleSavePerformance = async () => {
    const current = await readSettings();
    await writeSettings({ ...current, maxMemoryMb });
    toast.success(`RAM guardada: ${maxMemoryMb} MB`);
  };

  const handleChangeDataDir = async () => {
    setChangingDataDir(true);
    try {
      const result = await chooseDataDir();
      if (result.canceled) return;
      setDataDir(result.path || dataDir);
      setDataDirCustom(true);
      toast.success("Carpeta actualizada. Reinicia ALaunchi para aplicar el cambio.");
    } finally {
      setChangingDataDir(false);
    }
  };

  const handleSaveAdmin = () => {
    localStorage.setItem("azureClientId", azureClientId);
    localStorage.setItem("githubRepo", repoUrl);
    localStorage.setItem("githubToken", token);
    toast.success("Configuración privada guardada");
  };

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-full bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/5 bg-card/50 flex items-center px-6 sticky top-0 z-50 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-white">Ajustes</h1>
      </header>

      <main className="flex-1 p-8 max-w-2xl mx-auto w-full space-y-6">

        {isElectron && (
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Cpu className="h-5 w-5 text-amber-400" /> Rendimiento
              </CardTitle>
              <CardDescription>
                Memoria RAM asignada a Minecraft. Recomendado: 2–4 GB para modpacks grandes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Memoria máxima</Label>
                  <span className="text-amber-400 font-bold text-sm">{maxMemoryMb >= 1024 ? `${(maxMemoryMb / 1024).toFixed(1)} GB` : `${maxMemoryMb} MB`}</span>
                </div>
                <Slider
                  min={512}
                  max={16384}
                  step={512}
                  value={[maxMemoryMb]}
                  onValueChange={([v]) => setMaxMemoryMb(v)}
                  className="accent-amber-400"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>512 MB</span>
                  <span>16 GB</span>
                </div>
              </div>
              <Button onClick={handleSavePerformance} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold">
                <Save className="mr-2 h-4 w-4" /> Guardar
              </Button>
            </CardContent>
          </Card>
        )}

        {isElectron && (
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FolderCog className="h-5 w-5 text-amber-400" /> Ubicación de datos
              </CardTitle>
              <CardDescription>
                Carpeta raíz donde ALaunchi guarda instancias, caché, Java y objetos descargados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-background/50 border border-white/10 rounded-md px-3 py-2.5 font-mono text-xs text-gray-300 break-all">
                {dataDir || "Cargando..."}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openDataDir()}>
                  <FolderOpen className="mr-2 h-3.5 w-3.5" /> Abrir carpeta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleChangeDataDir}
                  disabled={changingDataDir}
                >
                  {changingDataDir ? "Eligiendo..." : "Cambiar carpeta..."}
                </Button>
              </div>
              {dataDirCustom && (
                <p className="text-xs text-muted-foreground">
                  Los datos ya existentes no se mueven automáticamente — solo cambia dónde se
                  guardan las cosas nuevas a partir del próximo reinicio.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="bg-card/50 border-amber-500/20 border">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                Configuración privada (admin)
              </CardTitle>
              <CardDescription>
                Solo visible para cuentas en la whitelist de administración. Los usuarios normales
                nunca ven ni tocan esto — vienen configurados por defecto en la app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="azureClientId">Azure Client ID</Label>
                <Input
                  id="azureClientId"
                  value={azureClientId}
                  onChange={(e) => setAzureClientId(e.target.value)}
                  className="bg-background/50 border-white/10 text-white font-mono"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground">
                  Déjalo vacío para usar el valor por defecto embebido en la app.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="repo">Repositorio de modpacks</Label>
                <Input
                  id="repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="usuario/modpacks-repo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="token">Token GitHub</Label>
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-background/50 border-white/10 text-white"
                  placeholder="ghp_..."
                />
                <p className="text-xs text-muted-foreground">
                  Necesario para publicar modpacks desde el panel de admin, y para leer el
                  repositorio si es privado.
                </p>
              </div>

              <Button onClick={handleSaveAdmin} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold w-full">
                <Save className="mr-2 h-4 w-4" /> Guardar configuración privada
              </Button>
            </CardContent>
          </Card>
        )}

        {isAuthenticated && (
          <div className="pt-2">
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
            >
              <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
            </Button>
          </div>
        )}

      </main>
    </div>
  );
}
