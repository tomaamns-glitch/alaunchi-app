import { Hint } from "@/components/hint";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { invalidatePlayerHead } from "@/hooks/use-player-head";
import { useShowcaseSkin } from "@/hooks/use-showcase-skin";
import { getShowcaseUsernames, addShowcaseUsername, removeShowcaseUsername } from "@/lib/skin-showcase";
import { CharacterCard } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Trash, Check, Store, Plus, X, AlertCircle, Feather, Pause, Play, PersonStanding, Undo2 } from "lucide-react";
import {
  getSkinProfile,
  changeSkin,
  setCape,
  listSkinLibrary,
  saveToSkinLibrary,
  deleteFromSkinLibrary,
  fetchTextureAsDataUrl,
  fileToBase64,
  renderHeadIcon,
  renderBodyIcon,
  renderCapeIcon,
  type SkinProfile,
  type LibrarySkin,
} from "@/services/skin";
import { toast } from "@/lib/toast";

interface SkinManagerPanelProps {
  uuid: string;
  username: string | null;
  /** Rendered right under the character (the account menu puts its "Volver" here). */
  viewerFooter?: React.ReactNode;
  /** Where the Aplicar/descartar buttons go while previewing (the account menu
   *  puts them in its bottom bar). Without one they render under the character. */
  previewActionsSlot?: HTMLElement | null;
}

/** A round icon button under the character; lit in the accent while it's on. */
function ViewerButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={`flex h-9 flex-1 items-center justify-center rounded-md border transition-colors ${
          active
            ? "border-accent/60 bg-accent/20 text-accent"
            : "border-transparent bg-white/[0.07] text-gray-200 hover:bg-white/[0.14]"
        }`}
      >
        {children}
      </button>
    </Hint>
  );
}

export function SkinManagerPanel({ uuid, username, viewerFooter, previewActionsSlot }: SkinManagerPanelProps) {
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

  const [showcaseUsernames, setShowcaseUsernames] = useState<string[]>(() => getShowcaseUsernames());
  const [newShowcaseName, setNewShowcaseName] = useState("");
  const [tab, setTab] = useState("library");

  // Clicking a skin or cape only tries it on the character; nothing reaches the
  // Mojang account until "Aplicar". `previewCapeId` undefined = cape untouched,
  // null = previewing no cape.
  const [previewSkin, setPreviewSkin] = useState<PreviewSkin | null>(null);
  const [previewCapeId, setPreviewCapeId] = useState<string | null | undefined>(undefined);

  const activeSkin = profile?.skins.find((s) => s.state === "ACTIVE") ?? null;
  const activeCape = profile?.capes.find((c) => c.state === "ACTIVE") ?? null;
  const activeSkinBase64 = skinDataUrl ? skinDataUrl.slice(skinDataUrl.indexOf(",") + 1) : null;

  // An uploaded file that's still being named shows on the character too.
  const shownSkin: PreviewSkin | null = pendingBase64
    ? { key: "upload", label: pendingName || "Skin sin nombre", base64: pendingBase64, variant: pendingVariant }
    : previewSkin;
  const shownCapeId = previewCapeId !== undefined ? previewCapeId : activeCape?.id ?? null;
  const shownCape = profile?.capes.find((c) => c.id === shownCapeId) ?? null;
  const [shownCapeDataUrl, setShownCapeDataUrl] = useState<string | null>(null);
  const skinVariant: "slim" | "classic" | null = shownSkin
    ? shownSkin.variant
    : activeSkin ? (activeSkin.variant === "SLIM" ? "slim" : "classic") : null;

  // Viewer controls under the character: elytra on/off, freeze the animation,
  // and swap the arm model (slim ⇄ classic). The model is a real change like a
  // skin or cape: it only reaches the Mojang account (and so every other player's
  // view of you) on "Aplicar".
  const [elytra, setElytra] = useState(false);
  const [paused, setPaused] = useState(false);
  const [modelOverride, setModelOverride] = useState<"slim" | "classic" | null>(null);
  const modelChanged = modelOverride !== null && modelOverride !== skinVariant;
  const hasPreview = shownSkin !== null || previewCapeId !== undefined || modelChanged;
  const shownSkinKey = shownSkin?.key ?? activeSkin?.id ?? null;
  // Another skin on the character: its own model again.
  useEffect(() => setModelOverride(null), [shownSkinKey]);
  const shownVariant = modelOverride ?? skinVariant;
  const viewedModel: "slim" | "classic" = shownVariant ?? "classic";

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

  useEffect(() => {
    let cancelled = false;
    if (!shownCape?.url) {
      setShownCapeDataUrl(null);
    } else if (shownCape.url === activeCape?.url && capeDataUrl) {
      setShownCapeDataUrl(capeDataUrl);
    } else {
      fetchTextureAsDataUrl(shownCape.url)
        .then((url) => { if (!cancelled) setShownCapeDataUrl(url); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [shownCape?.url, activeCape?.url, capeDataUrl]);

  // Backs up whatever skin is equipped the moment you open this panel, so if you
  // then change to something else, the old one is still in your library instead
  // of just gone. Runs once per open; skipped if that exact skin is already saved.
  const autoBackedUpRef = useRef(false);
  useEffect(() => {
    if (autoBackedUpRef.current || !activeSkin || !skinDataUrl) return;
    autoBackedUpRef.current = true;
    const base64 = skinDataUrl.slice(skinDataUrl.indexOf(",") + 1);
    if (library.some((entry) => entry.fileBase64 === base64)) return;
    const baseName = username || "Skin actual";
    let name = baseName;
    let suffix = 2;
    while (library.some((entry) => entry.name === name)) {
      name = `${baseName} (${suffix++})`;
    }
    saveToSkinLibrary(name, activeSkin.variant === "SLIM" ? "slim" : "classic", base64)
      .then((entry) => setLibrary((prev) => [...prev, entry]))
      .catch(() => {});
  }, [activeSkin, skinDataUrl, library, username]);

  const handleFileChosen = async (file: File) => {
    setPreviewSkin(null);
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

  const previewSkinEntry = (entry: PreviewSkin) => {
    clearPending();
    setPreviewSkin((prev) => (prev?.key === entry.key || entry.base64 === activeSkinBase64 ? null : entry));
  };

  const previewCape = (capeId: string) => {
    const next = shownCapeId === capeId ? null : capeId;
    setPreviewCapeId(next === (activeCape?.id ?? null) ? undefined : next);
  };

  const discardPreview = () => {
    clearPending();
    setPreviewSkin(null);
    setPreviewCapeId(undefined);
    setModelOverride(null);
  };

  const handleApplyPreview = async () => {
    if (!mcToken || !hasPreview) return;
    setBusy(true);
    try {
      // A skin being tried on, or just the model of the equipped one changed.
      const skinBase64 = shownSkin?.base64 ?? (modelChanged ? activeSkinBase64 : null);
      if (skinBase64) {
        const updated = await changeSkin(mcToken, viewedModel, skinBase64);
        setProfile(updated);
        invalidatePlayerHead(uuid);
      }
      if (previewCapeId !== undefined) {
        const updated = await setCape(mcToken, previewCapeId);
        setProfile(updated);
      }
      toast.success(
        shownSkin ? `${shownSkin.label} aplicada.` : skinBase64 ? "Modelo actualizado." : "Capa actualizada."
      );
      discardPreview();
    } catch (e: any) {
      toast.error(e?.message || "Error al aplicar los cambios.");
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

  const handleDeleteFromLibrary = async (id: string) => {
    setBusy(true);
    try {
      await deleteFromSkinLibrary(id);
      setLibrary((prev) => prev.filter((e) => e.id !== id));
      setPreviewSkin((prev) => (prev?.key === `lib:${id}` ? null : prev));
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveShowcaseToLibrary = async (label: string, fullDataUrl: string, variant: "slim" | "classic") => {
    setBusy(true);
    try {
      const base64 = fullDataUrl.slice(fullDataUrl.indexOf(",") + 1);
      const entry = await saveToSkinLibrary(label, variant, base64);
      setLibrary((prev) => [...prev, entry]);
      toast.success(`${label} guardada en tu biblioteca.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddShowcaseName = () => {
    if (!newShowcaseName.trim()) return;
    setShowcaseUsernames(addShowcaseUsername(newShowcaseName));
    setNewShowcaseName("");
  };

  const handleRemoveShowcaseName = (name: string) => {
    setShowcaseUsernames(removeShowcaseUsername(name));
    setPreviewSkin((prev) => (prev?.key === `show:${name}` ? null : prev));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 w-72">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewActions = (
    <AnimatePresence>
      {hasPreview && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
          className="flex gap-1.5"
        >
          <Hint label="Deshacer cambios">
            <Button
              onClick={discardPreview}
              disabled={busy}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </Hint>
          <Button
            onClick={handleApplyPreview}
            disabled={busy}
            size="sm"
            className="h-8 px-3 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aplicar"}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="flex gap-6 h-full">
      {/* The same card as the account menu's character (menu, Perfil), so
          switching to "Personalizar" doesn't make it jump. */}
      <CharacterCard
        skinUrl={shownSkin ? `data:image/png;base64,${shownSkin.base64}` : skinDataUrl ?? `https://mc-heads.net/skin/${uuid}`}
        capeUrl={shownCapeDataUrl}
        variant={shownVariant ?? "auto-detect"}
        // Personalizar shows the character bare, on a mesh: the decoration's
        // effect (particles…) would hide the skin and cape being chosen.
        effect="none"
        grid
        viewer={{ elytra, paused }}
      >
        {viewerFooter}
        <div className="flex w-full items-center justify-center gap-1.5">
          <ViewerButton
            label={elytra ? "Quitar la elytra" : "Ver con elytra"}
            active={elytra}
            onClick={() => setElytra((v) => !v)}
          >
            <Feather className="h-4 w-4" />
          </ViewerButton>
          <ViewerButton
            label={paused ? "Reanudar la animación" : "Pausar la animación"}
            active={paused}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </ViewerButton>
          <ViewerButton
            label={viewedModel === "slim" ? "Modelo slim: cambiar a clásico" : "Modelo clásico: cambiar a slim"}
            active={viewedModel === "slim"}
            onClick={() => setModelOverride(viewedModel === "slim" ? "classic" : "slim")}
          >
            <PersonStanding className="h-4 w-4" />
          </ViewerButton>
        </div>
        {previewActionsSlot ? createPortal(previewActions, previewActionsSlot) : previewActions}
      </CharacterCard>

      <div className="w-[27rem] min-h-[300px] min-h-0 flex flex-col">
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          {/* Same segmented tabs as Amigos. */}
          <TabsList className="w-full h-auto gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-transparent">
            <TabsTrigger value="library" className={TAB_TRIGGER}>
              Biblioteca
              {library.length > 0 && <TabCount n={library.length} />}
            </TabsTrigger>
            <TabsTrigger value="showcase" className={TAB_TRIGGER}>
              Escaparate
              {showcaseUsernames.length > 0 && <TabCount n={showcaseUsernames.length} />}
            </TabsTrigger>
            {profile && profile.capes.length > 0 && (
              <TabsTrigger value="capes" className={TAB_TRIGGER}>
                Capas
                <TabCount n={profile.capes.length} />
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="library" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
            <TabBody>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
            />

            {pendingPreviewUrl ? (
              <div className="space-y-3 p-2.5 rounded-md border border-transparent bg-white/[0.07]">
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
                    className="flex-1 bg-white/[0.07] border-transparent text-sm h-8"
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
                <Button onClick={handleSaveToLibrary} disabled={busy} size="sm" variant="outline" className="w-full text-xs">
                  Guardar en biblioteca
                </Button>
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
                className="w-full h-10 flex items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-white/[0.02] text-muted-foreground hover:text-gray-200 hover:border-accent/50 hover:bg-accent/[0.06] transition-colors text-xs font-medium"
              >
                <Upload className="h-4 w-4" />
                Subir nueva skin
              </button>
            )}

            {library.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aún no has guardado ninguna skin.</p>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, ${TILE_WIDTH})` }}>
                {library.map((entry) => {
                  const key = `lib:${entry.id}`;
                  const equipped = entry.fileBase64 === activeSkinBase64;
                  const shown = shownSkin ? shownSkin.key === key : equipped;
                  const preview = () =>
                    previewSkinEntry({ key, label: entry.name, base64: entry.fileBase64, variant: entry.variant });
                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={preview}
                      onKeyDown={(e) => e.key === "Enter" && preview()}
                      title={equipped ? "Skin actual" : "Probar esta skin"}
                      className={`relative group flex flex-col items-center gap-1 p-2 rounded-md border cursor-pointer transition-colors ${tileClass(shown)}`}
                    >
                      <LibrarySkinHead fileBase64={entry.fileBase64} variant={entry.variant} alt={entry.name} />
                      <span className={`text-[10px] truncate w-full text-center ${shown ? "text-accent font-semibold" : "text-gray-300"}`}>
                        {entry.name}
                      </span>
                      {equipped ? (
                        <EquippedBadge />
                      ) : (
                        <Hint label="Eliminar">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteFromLibrary(entry.id); }}
                            disabled={busy}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash className="h-3 w-3" />
                          </button>
                        </Hint>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </TabBody>
          </TabsContent>

          <TabsContent value="showcase" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
            <TabBody>
            <div className="flex gap-2">
              <Input
                value={newShowcaseName}
                onChange={(e) => setNewShowcaseName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddShowcaseName()}
                placeholder="Nombre de Minecraft..."
                className="flex-1 bg-white/[0.07] border-transparent text-sm h-8"
              />
              <Hint label="Añadir nombre">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddShowcaseName}
                  disabled={!newShowcaseName.trim()}
                  className="h-8 px-2.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </Hint>
            </div>

            {showcaseUsernames.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 max-w-[15rem] mx-auto">
                Añade un nombre de Minecraft para ver su skin actual aquí.
              </p>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, ${TILE_WIDTH})` }}>
                {showcaseUsernames.map((name) => (
                  <ShowcaseEntry
                    key={name}
                    username={name}
                    busy={busy}
                    selected={shownSkin?.key === `show:${name}`}
                    onPreview={(fullDataUrl, variant) =>
                      previewSkinEntry({
                        key: `show:${name}`,
                        label: `Skin de ${name}`,
                        base64: fullDataUrl.slice(fullDataUrl.indexOf(",") + 1),
                        variant,
                      })
                    }
                    onSave={handleSaveShowcaseToLibrary}
                    onRemove={() => handleRemoveShowcaseName(name)}
                  />
                ))}
              </div>
            )}
            </TabBody>
          </TabsContent>

          {profile && profile.capes.length > 0 && (
            <TabsContent value="capes" className="mt-3">
              <TabBody>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, ${TILE_WIDTH})` }}>
                {profile.capes.map((cape) => {
                  const shown = cape.id === shownCapeId;
                  return (
                    <button
                      key={cape.id}
                      type="button"
                      onClick={() => previewCape(cape.id)}
                      disabled={busy}
                      title={shown ? "Probar sin capa" : "Probar esta capa"}
                      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-md border transition-colors ${tileClass(shown)}`}
                    >
                      <CapePreview url={cape.url} alt={cape.alias || "Capa"} />
                      <span
                        className={`text-[10px] truncate w-full text-center ${
                          shown ? "text-accent font-semibold" : "text-gray-300"
                        }`}
                      >
                        {cape.alias || "Capa"}
                      </span>
                      {cape.state === "ACTIVE" && <EquippedBadge />}
                    </button>
                  );
                })}
              </div>
              </TabBody>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

interface PreviewSkin {
  /** Which tile it came from ("lib:<id>", "show:<name>", "upload"), to highlight it. */
  key: string;
  label: string;
  base64: string;
  variant: "slim" | "classic";
}

/** Highlighted = what the character is wearing right now (preview or not).
 *  Same tile look as the account menu's buttons: hairline border, faint fill. */
function tileClass(shown: boolean): string {
  return shown
    ? "bg-accent/15 border-accent/60 shadow-[0_0_12px_hsl(var(--accent)/0.25)]"
    : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/20";
}

const TAB_TRIGGER =
  "flex-1 h-7 gap-1.5 rounded-[5px] text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.07] data-[state=active]:bg-white/[0.14] data-[state=active]:text-white data-[state=active]:shadow-none";

function TabCount({ n }: { n: number }) {
  return (
    <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-white/10 text-[10px] font-bold leading-none text-gray-300">
      {n}
    </span>
  );
}

/** Marks what's actually equipped on the account, as opposed to just previewed. */
function EquippedBadge() {
  return (
    <span
      title="Equipada en tu cuenta"
      className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-accent text-accent-foreground"
    >
      <Check className="h-3 w-3" />
    </span>
  );
}

// Every tile is the same fixed width, so a tab's width is fully decided by how
// many columns it has — which is what lets the panel grow sideways (not up/down)
// when switching tabs.
const TILE_WIDTH = "4.5rem";

/** Columns that fit the fixed 29rem panel; more items scroll down. */
const GRID_COLS = 5;

/** Fixed height (fills the 300px panel under the tabs, like the other menu views) so switching
 *  tabs never moves the panel up or down; each tab slides in from the right. */
function TabBody({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="h-[252px] overflow-y-auto overflow-x-hidden p-1.5 space-y-3"
    >
      {children}
    </motion.div>
  );
}

/** Small full-body figure of a saved skin (falls back to the face while it
 *  renders, or if WebGL fails). */
function LibrarySkinHead({ fileBase64, variant, alt }: { fileBase64: string; variant?: string; alt: string }) {
  const [bodyUrl, setBodyUrl] = useState<string | null>(null);
  const [headUrl, setHeadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const dataUrl = `data:image/png;base64,${fileBase64}`;
    const v = variant?.toLowerCase() === "slim" ? "slim" : variant?.toLowerCase() === "classic" ? "classic" : "auto-detect";
    renderBodyIcon(dataUrl, v)
      .then((url) => { if (!cancelled) setBodyUrl(url); })
      .catch(() => {
        renderHeadIcon(dataUrl, 48)
          .then((url) => { if (!cancelled) setHeadUrl(url); })
          .catch(() => {});
      });
    return () => { cancelled = true; };
  }, [fileBase64, variant]);

  if (bodyUrl) return <img src={bodyUrl} alt={alt} className="h-[72px] w-12 object-contain" />;
  if (headUrl) return <img src={headUrl} alt={alt} className="h-[72px] w-12 object-contain" style={{ imageRendering: "pixelated" }} />;
  return <div className="h-[72px] w-12 rounded bg-black/30" />;
}

/** Back face of a cape (the side with the design), fetched through the
 *  texture proxy — textures.minecraft.net has no CORS headers. */
function CapePreview({ url, alt }: { url: string; alt: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTextureAsDataUrl(url)
      .then((dataUrl) => renderCapeIcon(dataUrl))
      .then((png) => { if (!cancelled) setPreviewUrl(png); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="h-16 w-10 flex items-center justify-center">
      {previewUrl ? (
        <img src={previewUrl} alt={alt} className="h-16 w-10 rounded-sm shadow-md" style={{ imageRendering: "pixelated" }} />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

interface ShowcaseEntryProps {
  username: string;
  busy: boolean;
  selected: boolean;
  onPreview: (fullDataUrl: string, variant: "slim" | "classic") => void;
  onSave: (label: string, fullDataUrl: string, variant: "slim" | "classic") => void;
  onRemove: () => void;
}

function ShowcaseEntry({ username, busy, selected, onPreview, onSave, onRemove }: ShowcaseEntryProps) {
  const { loading, error, headUrl, fullDataUrl, variant } = useShowcaseSkin(username);
  const ready = !loading && !!headUrl && !!fullDataUrl;
  const preview = () => {
    if (ready) onPreview(fullDataUrl!, variant);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={preview}
      onKeyDown={(e) => e.key === "Enter" && preview()}
      title={ready ? "Probar esta skin" : undefined}
      className={`relative group flex flex-col items-center gap-1 p-2 rounded-md border transition-colors ${
        ready ? "cursor-pointer" : ""
      } ${tileClass(selected)}`}
    >
      <Hint label="Quitar del escaparate">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1.5 -left-1.5 h-4 w-4 flex items-center justify-center rounded-full bg-white/10 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </Hint>

      {loading ? (
        <div className="h-[72px] w-12 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : error || !headUrl || !fullDataUrl ? (
        <div className="h-[72px] w-12 flex items-center justify-center" title={error ?? "No disponible"}>
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : (
        <LibrarySkinHead
          fileBase64={fullDataUrl.replace(/^data:image\/png;base64,/, "")}
          variant={variant}
          alt={username}
        />
      )}

      <span className={`text-[10px] truncate w-full text-center ${selected ? "text-accent font-semibold" : "text-gray-300"}`}>
        {username}
      </span>

      {ready && (
        <Hint label="Guardar en biblioteca">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSave(username, fullDataUrl!, variant); }}
            disabled={busy}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-white/10 text-gray-200 hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Store className="h-3 w-3" />
          </button>
        </Hint>
      )}
    </div>
  );
}
