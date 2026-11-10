import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BookmarkPlus, Loader2, Pencil, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast, notify } from "@/lib/toast";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { SendToFriendDialog } from "@/components/send-to-friend-dialog";
import { useAuth } from "@/hooks/use-auth";
import { sendSharedContent } from "@/services/chat";
import { uploadSharedContent, type SharedContent } from "@/services/content-share";
import { readInstanceFile } from "@/services/electron";

/** Thin accent line along the top edge of a glass panel (like the emote viewer). */
const ACCENT_LINE =
  "pointer-events-none absolute top-0 inset-x-0 h-px bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]";
/** The same line for the menus, whose content is the panel itself. */
export const GLASS_MENU_LINE =
  "before:pointer-events-none before:absolute before:top-0 before:inset-x-0 before:h-px before:content-[''] before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.8),transparent)]";

/** Right-click on an installed file (mod, shader, resource pack, schematic):
 *  save a copy to the personal library, or send it to a friend. `child` must be
 *  a single element — it becomes the trigger itself, no wrapper in the DOM. */
export function ContentContextMenu({
  children,
  onSave,
  onShare,
  onRename,
}: {
  children: ReactNode;
  onSave: () => void;
  onShare: () => void;
  /** Only for content whose name is its file name (emotes, schematics). */
  onRename?: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={`relative w-52 ${GLASS_MENU_LINE}`}>
        {onRename && (
          <ContextMenuItem onSelect={() => setTimeout(onRename, 0)}>
            <Pencil className="mr-2 h-4 w-4" />
            Cambiar nombre
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={onSave}>
          <BookmarkPlus className="mr-2 h-4 w-4" />
          Guardar en la biblioteca
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => setTimeout(onShare, 0)}>
          <Share2 className="mr-2 h-4 w-4" />
          Compartir con un amigo
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** "Cambiar nombre": asks for the new name (the extension stays) and hands it to
 *  `onRename`, which does the rename and throws a readable error if it can't. */
export function RenameContentDialog({
  target,
  onOpenChange,
  onRename,
}: {
  target: { currentName: string } | null;
  onOpenChange: (open: boolean) => void;
  onRename: (newName: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (target) setName(target.currentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.currentName]);

  const submit = async () => {
    const next = name.trim();
    if (!target || !next) return;
    if (next === target.currentName) return onOpenChange(false);
    setWorking(true);
    try {
      await onRename(next);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cambiar el nombre.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent className="border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-foreground sm:max-w-sm sm:rounded-md">
        <div aria-hidden className={ACCENT_LINE} />
        <DialogHeader>
          <DialogTitle className="text-white">Cambiar nombre</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          maxLength={100}
          autoFocus
          disabled={working}
        />
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => void submit()}
            disabled={working || !name.trim()}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
          >
            {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What "Compartir" needs to know about the file (bytes are read when sending). */
export interface ContentToShare {
  modpackId: string;
  /** Path on disk, relative to the instance (a disabled mod keeps ".disabled"). */
  path: string;
  /** Hash of the file as it is on disk. */
  sha1: string;
  size: number;
  category: SharedContent["category"];
  displayName: string;
  fileName: string;
  iconUrl: string | null;
  modrinthProjectId?: string;
  schematicSource?: "litematica" | "worldedit";
}

export function ShareContentDialog({
  item,
  onOpenChange,
}: {
  item: ContentToShare | null;
  onOpenChange: (open: boolean) => void;
}) {
  const myUuid = useAuth((s) => s.uuid);
  const myUsername = useAuth((s) => s.username);

  const send = async (uuid: string, username: string) => {
    if (!item || !myUuid || !myUsername) return;
    const downloadUrl = await uploadSharedContent(await readInstanceFile(item.modpackId, item.path), item.sha1);
    const content: SharedContent = {
      category: item.category,
      fileName: item.fileName,
      displayName: item.displayName,
      iconUrl: item.iconUrl,
      sha1: item.sha1,
      size: item.size,
      downloadUrl,
      modpackId: item.modpackId,
      ...(item.schematicSource ? { schematicSource: item.schematicSource } : {}),
      ...(item.modrinthProjectId ? { modrinthProjectId: item.modrinthProjectId } : {}),
    };
    await sendSharedContent(myUuid, myUsername, uuid, username, content);
    notify.success(`${item.displayName} enviado a ${username}.`);
  };

  return (
    <SendToFriendDialog
      open={!!item}
      onOpenChange={onOpenChange}
      title="Compartir contenido"
      description={item ? `Se envía “${item.displayName}” por el chat al amigo que elijas.` : ""}
      onSend={send}
    />
  );
}
