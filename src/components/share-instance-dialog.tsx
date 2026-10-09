import { useEffect, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { SendToFriendDialog } from "@/components/send-to-friend-dialog";
import { LoaderIcon } from "@/components/loader-icon";
import { useAuth } from "@/hooks/use-auth";
import { buildInstanceRecipe } from "@/lib/instance-recipe";
import { sendSharedInstance, type SharedInstance } from "@/services/chat";
import { assertImageAllowed } from "@/services/image-moderation";
import type { RecipeEntry } from "@/services/public-profile";

// A custom instance's picture is a data URL kept in its meta; past this size it
// stays out of the chat message (the card falls back to the initial).
const MAX_ICON_CHARS = 150_000;

export interface ShareableInstance {
  id: string;
  name: string;
  minecraftVersion: string;
  loaderType: string;
  imageUrl?: string;
}

/** "Compartir" on a private instance: builds its recipe once, then sends it to
 *  the friend you pick — they get a card in the chat to install it. */
export function ShareInstanceDialog({
  instance,
  onOpenChange,
}: {
  instance: ShareableInstance | null;
  onOpenChange: (open: boolean) => void;
}) {
  const myUuid = useAuth((s) => s.uuid);
  const myUsername = useAuth((s) => s.username);
  const [recipe, setRecipe] = useState<{ recipe: RecipeEntry[]; unresolvedCount: number } | null>(null);

  useEffect(() => {
    if (!instance) return;
    let cancelled = false;
    setRecipe(null);
    buildInstanceRecipe(instance.id)
      .then((r) => !cancelled && setRecipe(r))
      .catch(() => {
        if (cancelled) return;
        toast.error("No se pudo leer el contenido de la instancia.");
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id]);

  const send = async (uuid: string, username: string) => {
    if (!instance || !recipe || !myUuid || !myUsername) return;
    const loaderType = (["vanilla", "forge", "neoforge", "fabric"].includes(instance.loaderType)
      ? instance.loaderType
      : "vanilla") as SharedInstance["loaderType"];
    const icon = instance.imageUrl && instance.imageUrl.length <= MAX_ICON_CHARS ? instance.imageUrl : undefined;
    // The icon travels inside the chat message, so it never hits Storage —
    // check it here. A rejected icon blocks the send with the reason, rather
    // than silently dropping it.
    if (icon?.startsWith("data:image/")) {
      await assertImageAllowed(icon.slice(icon.indexOf(",") + 1));
    }
    // No undefined values: RTDB rejects them.
    const shared: SharedInstance = {
      name: instance.name,
      minecraftVersion: instance.minecraftVersion,
      loaderType,
      unresolvedCount: recipe.unresolvedCount,
      ...(recipe.recipe.length > 0 ? { recipe: recipe.recipe } : {}),
      ...(icon ? { iconDataUrl: icon } : {}),
    };
    await sendSharedInstance(myUuid, myUsername, uuid, username, shared);
    toast.success(`${instance.name} compartida con ${username}.`);
  };

  return (
    <SendToFriendDialog
      open={!!instance}
      onOpenChange={onOpenChange}
      title="Compartir instancia"
      description="Le llegará por el chat con un botón para instalarla. Se descarga desde Modrinth: lo que Modrinth no reconoce (mods añadidos a mano, configs, mundos) no viaja."
      disabled={!recipe}
      preview={
        instance && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            {instance.imageUrl ? (
              <img src={instance.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" />
            ) : (
              <div className="h-10 w-10 rounded-md bg-accent/20 text-accent font-bold flex items-center justify-center shrink-0">
                {instance.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{instance.name}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {instance.minecraftVersion} · <LoaderIcon loader={instance.loaderType} className="h-3 w-3" />{" "}
                <span className="capitalize">{instance.loaderType}</span>
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {recipe ? (
                  <>
                    <Package className="h-3 w-3" />
                    {recipe.recipe.length} elemento{recipe.recipe.length === 1 ? "" : "s"}
                    {recipe.unresolvedCount > 0 && (
                      <span className="text-amber-300">· {recipe.unresolvedCount} no se compartirán</span>
                    )}
                  </>
                ) : (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Preparando…
                  </>
                )}
              </p>
            </div>
          </div>
        )
      }
      onSend={send}
    />
  );
}
