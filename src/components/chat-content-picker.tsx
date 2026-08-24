import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Package, Sparkles, Image as ImageIcon, Smile, Loader2, ArrowLeft } from "lucide-react";
import { listInstanceFiles, listEmotes, readInstanceFile } from "@/services/electron";
import { identifyModrinthFiles, categoryOf, fileName, guessTitle } from "@/services/modrinth";
import { uploadSharedContent, type ContentCategory, type SharedContent } from "@/services/content-share";
import { sendSharedContent } from "@/services/chat";
import { toast } from "sonner";

interface ChatContentPickerProps {
  myUuid: string;
  myUsername: string;
  otherUuid: string;
  otherUsername: string;
  currentPackId: string;
  onClose: () => void;
}

const CATEGORY_META: Record<ContentCategory, { label: string; icon: typeof Package }> = {
  mods: { label: "Mods", icon: Package },
  shaderpacks: { label: "Shaders", icon: Sparkles },
  resourcepacks: { label: "Texturas", icon: ImageIcon },
  emotes: { label: "Emotes", icon: Smile },
};

interface PickerItem {
  path: string;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string;
  size: number;
}

/** Popup (opens upward, next to "Enviar contenido") to browse the current
 *  modpack's local mods/shaders/textures/emotes and share one in the chat. */
export function ChatContentPicker({
  myUuid,
  myUsername,
  otherUuid,
  otherUsername,
  currentPackId,
  onClose,
}: ChatContentPickerProps) {
  const [category, setCategory] = useState<ContentCategory | null>(null);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingPath, setSendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!category) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      if (category === "emotes") {
        const emotes = await listEmotes(currentPackId);
        if (cancelled) return;
        setItems(
          emotes
            .filter((e) => e.sha1)
            .map((e) => ({
              path: `emotes/${e.fileName}`,
              fileName: e.fileName,
              displayName: e.displayName,
              iconUrl: e.thumbnailBase64 ? `data:image/png;base64,${e.thumbnailBase64}` : null,
              sha1: e.sha1 as string,
              size: 0,
            }))
        );
      } else {
        const files = await listInstanceFiles(currentPackId);
        const catFiles = files.filter((f) => categoryOf(f.path) === category && f.sha1);
        const matches = await identifyModrinthFiles(catFiles);
        if (cancelled) return;
        setItems(
          catFiles.map((f) => {
            const match = matches.get(f.path);
            const name = fileName(f.path);
            return {
              path: f.path,
              fileName: name,
              displayName: match?.title ?? guessTitle(name),
              iconUrl: match?.iconUrl ?? null,
              sha1: f.sha1 as string,
              size: f.size,
            };
          })
        );
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [category, currentPackId]);

  const handleShare = async (item: PickerItem) => {
    if (!category) return;
    setSendingPath(item.path);
    try {
      const base64 = await readInstanceFile(currentPackId, item.path);
      const downloadUrl = await uploadSharedContent(base64, item.sha1);
      const content: SharedContent = {
        category,
        fileName: item.fileName,
        displayName: item.displayName,
        iconUrl: item.iconUrl,
        sha1: item.sha1,
        size: item.size,
        modpackId: currentPackId,
        downloadUrl,
      };
      await sendSharedContent(myUuid, myUsername, otherUuid, otherUsername, content);
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
              onClick={() => setCategory(null)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </motion.button>
            <span className="text-xs font-semibold text-white">{CATEGORY_META[category].label}</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-4">
                No tienes nada de esto instalado en este modpack.
              </p>
            ) : (
              items.map((item) => (
                <motion.button
                  key={item.path}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={sendingPath === item.path}
                  onClick={() => handleShare(item)}
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
                  <span className="text-xs text-gray-200 truncate flex-1">{item.displayName}</span>
                  {sendingPath === item.path && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent shrink-0" />}
                </motion.button>
              ))
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
