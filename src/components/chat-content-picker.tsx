import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Package, Sparkles, Image as ImageIcon, Smile, Loader2, ArrowLeft, Send, Box, Shirt, Camera, Star } from "lucide-react";
import { listInstanceFiles, listEmotes, listSchematics, listScreenshots, readInstanceFile } from "@/services/electron";
import { identifyModrinthFiles, categoryOf, fileName, guessTitle } from "@/services/modrinth";
import { uploadSharedContent, type ContentCategory, type SharedContent } from "@/services/content-share";
import { sendSharedContent } from "@/services/chat";
import { listSkinLibrary } from "@/services/skin";
import { getFavorites } from "@/services/favorites";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { usePlayerSkinUrl } from "@/hooks/use-player-head";
import { useEmotePreview } from "@/hooks/use-emote-preview";
import { EmoteAnimation } from "@/lib/emote-animation";
import { SkinViewer3D } from "@/components/skin-viewer-3d";
import type { ChatMode } from "@/components/chat-window";
import type { Modpack } from "@/services/github";
import { toast } from "sonner";

interface ChatContentPickerProps {
  myUuid: string;
  myUsername: string;
  otherUuid: string;
  otherUsername: string;
  mode: ChatMode;
  onClose: () => void;
}

const CATEGORY_META: Record<ContentCategory, { label: string; icon: typeof Package }> = {
  mods: { label: "Mods", icon: Package },
  shaderpacks: { label: "Shaders", icon: Sparkles },
  resourcepacks: { label: "Texturas", icon: ImageIcon },
  emotes: { label: "Emotes", icon: Smile },
  schematics: { label: "Esquemas", icon: Box },
  skins: { label: "Skins", icon: Shirt },
  screenshots: { label: "Capturas", icon: Camera },
};

const INSTALLABLE_CATEGORIES = new Set<ContentCategory>(["mods", "shaderpacks", "resourcepacks"]);

// General mode can list the same relative path (e.g. "mods/jei.jar") from
// several different source instances — item.path alone is no longer a unique
// identity on its own, so every place that keys off "which item is this"
// (React's key, the sending/disabled spinner) uses this composite instead.
function itemKey(item: { sourceInstanceId?: string; path: string }): string {
  return `${item.sourceInstanceId ?? ""}:${item.path}`;
}

interface PickerItem {
  path: string;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string;
  size: number;
  /** Only set for category === "schematics". */
  schematicSource?: "litematica" | "worldedit";
  /** Only set for category === "skins" — bytes are already in hand from
   *  listSkinLibrary(), no readInstanceFile needed at share time. */
  skinFileBase64?: string;
  skinVariant?: "slim" | "classic";
  /** Which of the user's own instances this item's bytes live in — absent for
   *  skins (account-wide) and favorites (no local file at all). In carousel
   *  mode this is always that one instance; in general mode it varies per item
   *  since content is aggregated across every instance the user has. */
  sourceInstanceId?: string;
  sourceInstanceName?: string;
  /** Modrinth project id, when identifyModrinthFiles found a match (or this
   *  is a favorite, which is nothing BUT a project id). Carried into the
   *  shared message so the recipient can run compatibility detection. */
  modrinthProjectId?: string;
  /** A favorites.ts bookmark rather than something actually installed — no
   *  local bytes, shared as a Modrinth reference instead (content-compat.ts
   *  resolves the real file once the recipient picks a destination). */
  isFavorite?: boolean;
}

/** Popup (opens upward, next to "Enviar contenido") to browse local content
 *  and share one item in the chat. In carousel mode, scoped to that one
 *  instance exactly like before. In general mode, aggregates across every
 *  instance the user owns (catalog + local/custom) plus their Modrinth
 *  favorites — there's no single "current modpack" to scope to. */
export function ChatContentPicker({
  myUuid,
  myUsername,
  otherUuid,
  otherUsername,
  mode,
  onClose,
}: ChatContentPickerProps) {
  const [category, setCategory] = useState<ContentCategory | null>(null);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingPath, setSendingPath] = useState<string | null>(null);
  const [previewingEmote, setPreviewingEmote] = useState<PickerItem | null>(null);

  // Select the raw array (a stable reference that only changes when the store
  // actually updates) and filter separately — selecting `s.modpacks.filter(...)`
  // directly returns a brand-new array on every single render regardless of
  // whether the underlying data changed, which fed into scopedInstances' and
  // the fetch effect's dependency arrays below and caused an infinite
  // render → effect → setState → render loop (crashed the whole picker).
  const modpacks = useModpacks((s) => s.modpacks);
  const catalogInstalled = useMemo(() => modpacks.filter((p) => p.installed), [modpacks]);
  const customInstances = useCustomInstances((s) => s.instances);

  // Custom instances only load reliably once the Hub has been visited this
  // session — force it here too so general-mode sharing works from a chat
  // opened straight from the home carousel, which never touches that store.
  useEffect(() => {
    useCustomInstances.getState().loadInstances().catch(() => {});
  }, []);

  const scopedInstances: Modpack[] = useMemo(
    () => (mode.type === "carousel" ? [mode.pack] : [...catalogInstalled, ...customInstances]),
    [mode, catalogInstalled, customInstances]
  );

  const myPreviewSkinUrl = usePlayerSkinUrl(myUuid);
  const previewEmoteData = useEmotePreview(previewingEmote?.sourceInstanceId, previewingEmote?.fileName);
  const previewAnimation = useMemo(
    () => (previewEmoteData ? new EmoteAnimation(previewEmoteData) : null),
    [previewEmoteData]
  );

  useEffect(() => {
    setPreviewingEmote(null);
    if (!category) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      if (category === "skins") {
        // Account-wide — ignores mode/scopedInstances entirely, same as before.
        const skins = await listSkinLibrary();
        if (cancelled) return;
        setItems(
          skins
            .filter((s) => s.sha1)
            .map((s) => ({
              path: `skin:${s.id}`,
              fileName: `${s.name}.png`,
              displayName: s.name,
              iconUrl: `data:image/png;base64,${s.fileBase64}`,
              sha1: s.sha1 as string,
              size: 0,
              skinFileBase64: s.fileBase64,
              skinVariant: s.variant,
            }))
        );
      } else if (category === "emotes" || category === "schematics" || category === "screenshots") {
        // No Modrinth-based compatibility concept for these — aggregated across
        // every scoped instance (just this one in carousel mode), tagged with
        // their source so a general-mode share still knows which instance to
        // read the bytes from.
        const perInstance = await Promise.all(
          scopedInstances.map(async (pack): Promise<PickerItem[]> => {
            if (category === "emotes") {
              const emotes = await listEmotes(pack.id);
              return emotes
                .filter((e) => e.sha1)
                .map((e) => ({
                  path: `emotes/${e.fileName}`,
                  fileName: e.fileName,
                  displayName: e.displayName,
                  iconUrl: e.thumbnailBase64 ? `data:image/png;base64,${e.thumbnailBase64}` : null,
                  sha1: e.sha1 as string,
                  size: 0,
                  sourceInstanceId: pack.id,
                  sourceInstanceName: pack.name,
                }));
            }
            if (category === "schematics") {
              const files = await listSchematics(pack.id);
              return files
                .filter((s) => s.sha1)
                .map((s) => ({
                  path: s.path,
                  fileName: s.path.slice(s.path.lastIndexOf("/") + 1),
                  displayName: s.path.slice(s.path.lastIndexOf("/") + 1),
                  iconUrl: null,
                  sha1: s.sha1 as string,
                  size: s.size,
                  schematicSource: s.source,
                  sourceInstanceId: pack.id,
                  sourceInstanceName: pack.name,
                }));
            }
            const shots = await listScreenshots(pack.id);
            return shots
              .filter((s) => s.sha1)
              .map((s) => ({
                path: `screenshots/${s.fileName}`,
                fileName: s.fileName,
                displayName: s.fileName,
                iconUrl: s.thumbnailDataUrl,
                sha1: s.sha1 as string,
                size: s.size,
                sourceInstanceId: pack.id,
                sourceInstanceName: pack.name,
              }));
          })
        );
        if (!cancelled) setItems(perInstance.flat());
      } else {
        // mods / shaderpacks / resourcepacks — identified against Modrinth
        // (for compatibility detection on the receiving end) and, in general
        // mode, joined with favorited-but-not-installed projects too.
        const perInstance = await Promise.all(
          scopedInstances.map(async (pack): Promise<PickerItem[]> => {
            const files = await listInstanceFiles(pack.id);
            const catFiles = files.filter((f) => categoryOf(f.path) === category && f.sha1);
            const matches = await identifyModrinthFiles(catFiles);
            return catFiles.map((f) => {
              const match = matches.get(f.path);
              const name = fileName(f.path);
              return {
                path: f.path,
                fileName: name,
                displayName: match?.title ?? guessTitle(name),
                iconUrl: match?.iconUrl ?? null,
                sha1: f.sha1 as string,
                size: f.size,
                sourceInstanceId: pack.id,
                sourceInstanceName: pack.name,
                modrinthProjectId: match?.projectId,
              };
            });
          })
        );
        const installedItems = perInstance.flat();

        let favoriteItems: PickerItem[] = [];
        if (mode.type === "general" && category !== undefined && INSTALLABLE_CATEGORIES.has(category)) {
          favoriteItems = getFavorites(category as "mods" | "shaderpacks" | "resourcepacks").map((f) => ({
            path: `favorite:${f.projectId}`,
            fileName: f.title,
            displayName: f.title,
            iconUrl: f.iconUrl ?? null,
            sha1: "",
            size: 0,
            modrinthProjectId: f.projectId,
            isFavorite: true,
          }));
        }
        if (!cancelled) setItems([...installedItems, ...favoriteItems]);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [category, scopedInstances, mode.type]);

  const handleShare = async (item: PickerItem) => {
    if (!category) return;
    setSendingPath(itemKey(item));
    try {
      const carouselInstanceId = mode.type === "carousel" ? mode.pack.id : undefined;
      let content: SharedContent;

      if (category === "skins") {
        const downloadUrl = await uploadSharedContent(item.skinFileBase64!, item.sha1);
        content = {
          category,
          fileName: item.fileName,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          sha1: item.sha1,
          size: item.size,
          downloadUrl,
          ...(item.skinVariant ? { skinVariant: item.skinVariant } : {}),
        };
      } else if (item.isFavorite) {
        // No bytes to upload — just the Modrinth reference. The recipient's
        // client resolves and downloads the real file once they pick where
        // to install it (see content-compat.ts + SharedContentCard).
        content = {
          category,
          fileName: item.fileName,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          sha1: "",
          size: 0,
          downloadUrl: "",
          modrinthProjectId: item.modrinthProjectId,
          isReference: true,
        };
      } else {
        const base64 = await readInstanceFile(item.sourceInstanceId!, item.path);
        const downloadUrl = await uploadSharedContent(base64, item.sha1);
        content = {
          category,
          fileName: item.fileName,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          sha1: item.sha1,
          size: item.size,
          downloadUrl,
          ...(item.sourceInstanceId ? { modpackId: item.sourceInstanceId } : {}),
          ...(item.schematicSource ? { schematicSource: item.schematicSource } : {}),
          ...(item.modrinthProjectId ? { modrinthProjectId: item.modrinthProjectId } : {}),
        };
      }

      await sendSharedContent(myUuid, myUsername, otherUuid, otherUsername, content, carouselInstanceId);
      toast.success(`${item.displayName} compartido.`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Error al compartir.");
    } finally {
      setSendingPath(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute bottom-full left-0 mb-2 z-40 w-72 rounded-lg bg-card/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden"
    >
      {!category ? (
        <div className="p-3 grid grid-cols-2 gap-2">
          {(Object.keys(CATEGORY_META) as ContentCategory[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <motion.button
                key={cat}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setCategory(cat)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-md bg-white/5 hover:bg-white/10 text-gray-200 transition-colors"
              >
                <Icon className="h-5 w-5 text-accent" />
                <span className="text-xs font-medium">{meta.label}</span>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col max-h-80">
          <div className="flex items-center gap-2 p-2 border-b border-white/10 shrink-0">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={() => (previewingEmote ? setPreviewingEmote(null) : setCategory(null))}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </motion.button>
            <span className="text-xs font-semibold text-white truncate">
              {previewingEmote ? previewingEmote.displayName : CATEGORY_META[category].label}
            </span>
          </div>

          {previewingEmote ? (
            <div className="p-3 flex flex-col items-center gap-3">
              <div className="flex items-center justify-center bg-black/30 rounded-md w-full h-48">
                {myPreviewSkinUrl && previewAnimation ? (
                  <SkinViewer3D
                    skinUrl={myPreviewSkinUrl}
                    animation={previewAnimation}
                    width={130}
                    height={182}
                    className="cursor-grab active:cursor-grabbing"
                  />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                disabled={sendingPath === itemKey(previewingEmote)}
                onClick={() => handleShare(previewingEmote)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold disabled:opacity-60 transition-colors"
              >
                {sendingPath === itemKey(previewingEmote) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Compartir
              </motion.button>
            </div>
          ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-4">
                {mode.type === "general"
                  ? "No tienes nada de esto instalado en ninguna instancia."
                  : "No tienes nada de esto instalado en este modpack."}
              </p>
            ) : (
              items.map((item) => (
                <motion.button
                  key={itemKey(item)}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={sendingPath === itemKey(item)}
                  onClick={() => (category === "emotes" ? setPreviewingEmote(item) : handleShare(item))}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt=""
                      className="h-8 w-8 rounded shrink-0 object-cover bg-black/30"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded shrink-0 bg-white/5 flex items-center justify-center text-[10px] text-muted-foreground">
                      ?
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-200 truncate">{item.displayName}</p>
                    {mode.type === "general" && (item.isFavorite || item.sourceInstanceName) && (
                      <p className="text-[9px] text-muted-foreground truncate flex items-center gap-1">
                        {item.isFavorite ? (
                          <>
                            <Star className="h-2.5 w-2.5 shrink-0 fill-current" /> Favorito
                          </>
                        ) : (
                          item.sourceInstanceName
                        )}
                      </p>
                    )}
                  </div>
                  {sendingPath === itemKey(item) && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent shrink-0" />}
                </motion.button>
              ))
            )}
          </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
