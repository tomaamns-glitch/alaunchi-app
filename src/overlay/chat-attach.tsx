import { Hint } from "@/components/hint";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast, notify } from "@/lib/toast";
import { ArrowLeft, Box, Camera, Image as ImageIcon, Loader2, Package, Smile, Sparkles } from "lucide-react";
import {
  DISABLED_SUFFIX,
  listEmotes,
  listInstanceFiles,
  listSchematics,
  listScreenshots,
  readInstanceFile,
} from "@/services/electron";
import { categoryOf, fileName, guessTitle, identifyModrinthFiles } from "@/services/modrinth";
import { uploadSharedContent, type ContentCategory, type SharedContent } from "@/services/content-share";
import type { RunningTarget } from "./chat-cards";

// "Adjuntar" in the overlay's chat: share something from the instance being
// played (the launcher's ChatContentPicker, scoped to that one instance — it
// can't be reused as is, it loads the whole catalog and every instance).

type AttachCategory = Exclude<ContentCategory, "skins">;

const CATEGORIES: { id: AttachCategory; label: string; icon: typeof Package }[] = [
  { id: "mods", label: "Mods", icon: Package },
  { id: "shaderpacks", label: "Shaders", icon: Sparkles },
  { id: "resourcepacks", label: "Texturas", icon: ImageIcon },
  { id: "emotes", label: "Emotes", icon: Smile },
  { id: "schematics", label: "Esquemas", icon: Box },
  { id: "screenshots", label: "Capturas", icon: Camera },
];

interface Item {
  path: string;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string;
  size: number;
  schematicSource?: "litematica" | "worldedit";
  modrinthProjectId?: string;
}

async function loadItems(modpackId: string, category: AttachCategory): Promise<Item[]> {
  if (category === "emotes") {
    const emotes = await listEmotes(modpackId);
    return emotes
      .filter((e) => e.sha1)
      .map((e) => ({
        path: `emotes/${e.fileName}`,
        fileName: e.fileName,
        displayName: e.displayName,
        iconUrl: e.thumbnailBase64 ? `data:image/png;base64,${e.thumbnailBase64}` : null,
        sha1: e.sha1 as string,
        size: 0,
      }));
  }
  if (category === "schematics") {
    const files = await listSchematics(modpackId);
    return files
      .filter((s) => s.sha1)
      .map((s) => {
        const name = s.path.slice(s.path.lastIndexOf("/") + 1);
        return { path: s.path, fileName: name, displayName: name, iconUrl: null, sha1: s.sha1 as string, size: s.size, schematicSource: s.source };
      });
  }
  if (category === "screenshots") {
    const shots = await listScreenshots(modpackId);
    return shots
      .filter((s) => s.sha1)
      .map((s) => ({
        path: `screenshots/${s.fileName}`,
        fileName: s.fileName,
        displayName: s.fileName,
        iconUrl: s.thumbnailDataUrl,
        sha1: s.sha1 as string,
        size: s.size,
      }));
  }
  const files = await listInstanceFiles(modpackId);
  // Switched-off mods (".jar.disabled") would reach the recipient switched off.
  const catFiles = files.filter((f) => categoryOf(f.path) === category && f.sha1 && !f.path.endsWith(DISABLED_SUFFIX));
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
      modrinthProjectId: match?.projectId,
    };
  });
}

export function AttachPicker({
  target,
  onSend,
  onClose,
}: {
  target: RunningTarget;
  onSend: (content: SharedContent) => Promise<void>;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<AttachCategory | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingPath, setSendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    setLoading(true);
    setItems([]);
    loadItems(target.modpackId, category)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && toast.error("No se pudo leer el contenido de la instancia"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category, target.modpackId]);

  const share = async (item: Item) => {
    if (!category || sendingPath) return;
    setSendingPath(item.path);
    try {
      const base64 = await readInstanceFile(target.modpackId, item.path);
      const downloadUrl = await uploadSharedContent(base64, item.sha1);
      await onSend({
        category,
        fileName: item.fileName,
        displayName: item.displayName,
        iconUrl: item.iconUrl,
        sha1: item.sha1,
        size: item.size,
        downloadUrl,
        modpackId: target.modpackId,
        ...(item.schematicSource ? { schematicSource: item.schematicSource } : {}),
        ...(item.modrinthProjectId ? { modrinthProjectId: item.modrinthProjectId } : {}),
      });
      notify.success(`${item.displayName} compartido`);
      onClose();
    } catch (e: any) {
      toast.error("No se pudo compartir", { description: e?.message });
    } finally {
      setSendingPath(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute bottom-[64px] left-3 z-30 w-[280px] overflow-hidden rounded-md border border-white/[0.08] bg-[#1b1b1f] shadow-2xl"
    >
      {!category ? (
        <div className="p-2.5">
          <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">De {target.name}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className="flex flex-col items-center gap-1.5 rounded-md bg-white/[0.05] py-2.5 text-gray-200 transition-colors hover:bg-white/[0.1]"
              >
                <Icon className="h-4 w-4 text-accent" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex max-h-[300px] flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] p-2">
            <Hint label="Volver">
              <button
                type="button"
                onClick={() => setCategory(null)}
                aria-label="Volver"
                className="flex h-6 w-6 items-center justify-center rounded text-gray-300 hover:bg-white/10"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            </Hint>
            <span className="truncate text-xs font-semibold text-white">{CATEGORIES.find((c) => c.id === category)?.label}</span>
          </div>
          <div className="overlay-scroll min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-500">No hay nada de esto en la instancia.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  disabled={!!sendingPath}
                  onClick={() => share(item)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                >
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded bg-black/30 object-cover" style={{ imageRendering: "pixelated" }} />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/5 text-[10px] text-gray-500">?</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-200">{item.displayName}</span>
                  {sendingPath === item.path && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
