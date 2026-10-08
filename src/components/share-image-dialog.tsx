import { toast } from "sonner";
import { SendToFriendDialog } from "@/components/send-to-friend-dialog";
import { useAuth } from "@/hooks/use-auth";
import { uploadSharedContent, type SharedContent } from "@/services/content-share";
import { sendSharedContent } from "@/services/chat";

export interface ShareableImage {
  fileName: string;
  sha1: string;
  size: number;
  thumbnailDataUrl: string | null;
  /** Full-resolution PNG bytes, base64 — read only when actually sending. */
  readBase64: () => Promise<string>;
}

/** "Compartir imagen": pick a friend and the image goes to them as a chat
 *  message (a "Captura" card — on their side it lands in their gallery). */
export function ShareImageDialog({
  image,
  onOpenChange,
}: {
  image: ShareableImage | null;
  onOpenChange: (open: boolean) => void;
}) {
  const myUuid = useAuth((s) => s.uuid);
  const myUsername = useAuth((s) => s.username);

  const send = async (uuid: string, username: string) => {
    if (!image || !myUuid || !myUsername) return;
    const downloadUrl = await uploadSharedContent(await image.readBase64(), image.sha1);
    const content: SharedContent = {
      category: "screenshots",
      fileName: image.fileName,
      displayName: image.fileName,
      iconUrl: image.thumbnailDataUrl,
      sha1: image.sha1,
      size: image.size,
      downloadUrl,
    };
    await sendSharedContent(myUuid, myUsername, uuid, username, content);
    toast.success(`Imagen enviada a ${username}.`);
  };

  return (
    <SendToFriendDialog
      open={!!image}
      onOpenChange={onOpenChange}
      title="Compartir imagen"
      description="Se envía por el chat al amigo que elijas."
      preview={
        image?.thumbnailDataUrl ? (
          <img src={image.thumbnailDataUrl} alt="" className="w-full max-h-40 object-contain rounded-md bg-black/30" />
        ) : null
      }
      onSend={send}
    />
  );
}
