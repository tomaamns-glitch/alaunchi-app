import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SkinViewer3D } from "@/components/skin-viewer-3d";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Trash, Check, Shirt } from "lucide-react";
import {
  getSkinProfile,
  changeSkin,
  setCape,
  listSkinLibrary,
  saveToSkinLibrary,
  deleteFromSkinLibrary,
  fetchTextureAsDataUrl,
  fileToBase64,
  type SkinProfile,
  type LibrarySkin,
} from "@/services/skin";
import { toast } from "sonner";

interface SkinManagerPanelProps {
  uuid: string;
  username: string | null;
}

export function SkinManagerPanel({ uuid, username }: SkinManagerPanelProps) {
  const { mcToken } = useAuth();
  const [profile, setProfile] = useState<SkinProfile | null>(null);
  const [library, setLibrary] = useState<LibrarySkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [pendingVariant, setPendingVariant] = useState<"slim" | "classic">("classic");
  const [pendingName, setPendingName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [skinDataUrl, setSkinDataUrl] = useState<string | null>(null);
  const [capeDataUrl, setCapeDataUrl] = useState<string | null>(null);

  const activeSkin = profile?.skins.find((s) => s.state === "ACTIVE") ?? null;
  const activeCape = profile?.capes.find((c) => c.state === "ACTIVE") ?? null;

  const refresh = useCallback(async () => {
    if (!mcToken) return;
    const [p, lib] = await Promise.all([getSkinProfile(mcToken), listSkinLibrary()]);
    setProfile(p);
    setLibrary(lib);
  }, [mcToken]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Load the currently-equipped skin/cape textures through the main-process
  // proxy — textures.minecraft.net sends no CORS headers, so the WebGL viewer
  // can't load them directly.
  useEffect(() => {
    let cancelled = false;
    if (activeSkin?.url) {
      fetchTextureAsDataUrl(activeSkin.url)
        .then((url) => { if (!cancelled) setSkinDataUrl(url); })
        .catch(() => {});
    } else {
      setSkinDataUrl(null);
    }
    return () => { cancelled = true; };
  }, [activeSkin?.url]);

  useEffect(() => {
    let cancelled = false;
    if (activeCape?.url) {
      fetchTextureAsDataUrl(activeCape.url)
        .then((url) => { if (!cancelled) setCapeDataUrl(url); })
        .catch(() => {});
    } else {
      setCapeDataUrl(null);
    }
    return () => { cancelled = true; };
  }, [activeCape?.url]);

  const handleFileChosen = async (file: File) => {
    setPendingName(file.name.replace(/\.png$/i, ""));
    const base64 = await fileToBase64(file);
    setPendingBase64(base64);
    setPendingPreviewUrl(`data:image/png;base64,${base64}`);
  };

  const clearPending = () => {
    setPendingBase64(null);
    setPendingPreviewUrl(null);
    setPendingName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleApply = async () => {
    if (!mcToken || !pendingBase64) return;
    setBusy(true);
    try {
      const updated = await changeSkin(mcToken, pendingVariant, pendingBase64);
      setProfile(updated);
      toast.success("Skin actualizada en tu cuenta.");
      clearPending();
    } catch (e: any) {
      toast.error(e?.message || "Error al cambiar la skin.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!pendingBase64) return;
    setBusy(true);
    try {
      const entry = await saveToSkinLibrary(pendingName || "Skin sin nombre", pendingVariant, pendingBase64);
      setLibrary((prev) => [...prev, entry]);
      toast.success("Guardada en tu biblioteca.");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar.");
    } finally {
      setBusy(false);
    }
  };

  const handleApplyFromLibrary = async (entry: LibrarySkin) => {
    if (!mcToken) return;
    setBusy(true);
    try {
      const updated = await changeSkin(mcToken, entry.variant, entry.fileBase64);
      setProfile(updated);
      toast.success(`${entry.name} aplicada.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al aplicar la skin.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFromLibrary = async (id: string) => {
    setBusy(true);
    try {
      await deleteFromSkinLibrary(id);
      setLibrary((prev) => prev.filter((e) => e.id !== id));
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCape = async (capeId: string) => {
    if (!mcToken) return;
    setBusy(true);
    try {
      const isActive = activeCape?.id === capeId;
      const updated = await setCape(mcToken, isActive ? null : capeId);
      setProfile(updated);
    } catch (e: any) {
      toast.error(e?.message || "Error al cambiar la capa.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 w-72">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-[28rem] flex gap-4">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <SkinViewer3D
          skinUrl={skinDataUrl ?? `https://mc-heads.net/skin/${uuid}`}
          capeUrl={capeDataUrl}
          variant={activeSkin ? (activeSkin.variant === "SLIM" ? "slim" : "classic") : "auto-detect"}
          width={140}
          height={190}
          className="cursor-grab active:cursor-grabbing"
        />
        <span className="text-sm font-medium text-gray-200">{username}</span>
        {activeSkin && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Modelo {activeSkin.variant === "SLIM" ? "slim" : "clásico"}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <Tabs defaultValue="library">
          <TabsList className="w-full bg-card/50 border border-white/5">
            <TabsTrigger value="library" className="flex-1 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
              Biblioteca ({library.length})
            </TabsTrigger>
            {profile && profile.capes.length > 0 && (
              <TabsTrigger value="capes" className="flex-1 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                Capas
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="library" className="pt-3 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
            />

            {pendingPreviewUrl ? (
              <div className="space-y-3 p-2.5 rounded-md border border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <img
                    src={pendingPreviewUrl}
                    alt="Vista previa"
                    className="h-12 w-12 rounded bg-black/30 object-contain shrink-0"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <Input
                    value={pendingName}
                    onChange={(e) => setPendingName(e.target.value)}
                    placeholder="Nombre de la skin"
                    className="flex-1 bg-background/50 border-white/10 text-sm h-8"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={pendingVariant === "classic" ? "default" : "outline"}
                    onClick={() => setPendingVariant("classic")}
                    className="flex-1 text-xs"
                  >
                    Clásico
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={pendingVariant === "slim" ? "default" : "outline"}
                    onClick={() => setPendingVariant("slim")}
                    className="flex-1 text-xs"
                  >
                    Slim
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleApply}
                    disabled={busy}
                    size="sm"
                    className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aplicar ahora"}
                  </Button>
                  <Button onClick={handleSaveToLibrary} disabled={busy} size="sm" variant="outline" className="flex-1 text-xs">
                    Guardar en biblioteca
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={clearPending}
                  className="text-xs text-muted-foreground hover:text-gray-200 w-full text-center"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-dashed border-white/15 text-muted-foreground hover:text-gray-200 hover:border-white/30 transition-colors text-xs"
              >
                <Upload className="h-4 w-4" />
                Subir nueva skin
              </button>
            )}

            {library.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aún no has guardado ninguna skin.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {library.map((entry) => (
                  <div
                    key={entry.id}
                    className="relative group flex flex-col items-center gap-1 p-2 rounded-md bg-white/5 border border-white/5"
                  >
                    <img
                      src={`data:image/png;base64,${entry.fileBase64}`}
                      alt={entry.name}
                      className="h-10 w-10 object-contain bg-black/30 rounded"
                      style={{ imageRendering: "pixelated" }}
                    />
                    <span className="text-[10px] text-gray-300 truncate w-full text-center">{entry.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1.5 -right-1.5">
                      <button
                        type="button"
                        onClick={() => handleApplyFromLibrary(entry)}
                        disabled={busy}
                        title="Aplicar"
                        className="h-5 w-5 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFromLibrary(entry.id)}
                        disabled={busy}
                        title="Eliminar"
                        className="h-5 w-5 flex items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90"
                      >
                        <Trash className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {profile && profile.capes.length > 0 && (
            <TabsContent value="capes" className="pt-3 space-y-2">
              {profile.capes.map((cape) => (
                <button
                  key={cape.id}
                  type="button"
                  onClick={() => handleToggleCape(cape.id)}
                  disabled={busy}
                  className={`w-full flex items-center gap-3 p-2 rounded-md border text-left transition-colors ${
                    cape.state === "ACTIVE"
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <Shirt className="h-4 w-4 shrink-0" />
                  <span className="text-sm flex-1 truncate">{cape.alias || "Capa"}</span>
                  {cape.state === "ACTIVE" && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))}
              <p className="text-[10px] text-muted-foreground pt-1">Pulsa una capa activa para quitártela.</p>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
