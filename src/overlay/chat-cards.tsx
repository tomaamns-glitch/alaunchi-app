import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Package,
  Sparkles,
  Image as ImageIcon,
  Smile,
  Box,
  Shirt,
  Camera,
  Check,
  Download,
  ImagePlus,
  Copy,
  Bookmark,
  Maximize2,
  Loader2,
  Ban,
  Layers,
} from "lucide-react";
import type { ContentCategory, SharedContent } from "@/services/content-share";
import { fetchAsBase64 } from "@/services/content-share";
import type { SharedInstance, SharedServer } from "@/services/chat";
import { downloadInstanceFile } from "@/services/electron";
import { addToGallery, usePersonalLibrary } from "@/services/personal-library";
import { saveToSkinLibrary } from "@/services/skin";
import { useSavedServers } from "@/lib/saved-servers";
import { ServerIcon } from "@/components/server-icon";
import { LoaderIcon } from "@/components/loader-icon";
import { ActionButton } from "./ui";
import { cn } from "@/lib/utils";

// Chat message cards in the overlay — the same cards the launcher's chat shows
// (chat-window.tsx), with the actions that make sense from inside the game:
// installing goes straight into the instance being played.

const CATEGORY_ICON: Record<ContentCategory, typeof Package> = {
  mods: Package,
  shaderpacks: Sparkles,
  resourcepacks: ImageIcon,
  emotes: Smile,
  schematics: Box,
  skins: Shirt,
  screenshots: Camera,
};

const CATEGORY_LABEL: Record<ContentCategory, string> = {
  mods: "Mod",
  shaderpacks: "Shader",
  resourcepacks: "Resource pack",
  emotes: "Emote",
  schematics: "Esquema",
  skins: "Skin",
  screenshots: "Captura",
};

// After installing mid-game: what it takes for the game to use it.
const AFTER_INSTALL: Partial<Record<ContentCategory, string>> = {
  mods: "Se cargará la próxima vez que abras el juego.",
  shaderpacks: "Actívalo en el menú de shaders de Iris u OptiFine.",
  resourcepacks: "Actívalo en Opciones → Paquetes de recursos.",
  emotes: "Aparecerá en tu menú de emotes.",
  schematics: "Ya puedes cargarlo con Litematica / WorldEdit.",
};

const LOCKABLE = new Set<ContentCategory>(["mods", "shaderpacks", "resourcepacks"]);

export interface RunningTarget {
  modpackId: string;
  name: string;
  contentLocked: boolean;
  /** sha1 of every mod/shader/resource pack in it (mc:list-instance-files). */
  installedHashes: Set<string>;
  onInstalled: (sha1: string) => void;
}

function CardShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-[300px] max-w-[88%] rounded-2xl border border-white/[0.07] bg-white/[0.06] shadow-sm", className)}>{children}</div>
  );
}

function CardHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-gray-50">{title}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function CardActions({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1.5 border-t border-white/[0.06] p-2">{children}</div>;
}

/** Mod / shader / resource pack / emote / schematic / skin someone sent. */
export function ContentCard({ content, target }: { content: SharedContent; target: RunningTarget | null }) {
  const [busy, setBusy] = useState(false);
  const [skinSaved, setSkinSaved] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const Icon = CATEGORY_ICON[content.category];
  const isSkin = content.category === "skins";
  const installed = !!target && target.installedHashes.has(content.sha1);
  const locked = !!target?.contentLocked && LOCKABLE.has(content.category);

  const install = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const folder =
        content.category === "schematics"
          ? content.schematicSource === "worldedit"
            ? "config/worldedit/schematics"
            : "schematics"
          : content.category;
      await downloadInstanceFile(target.modpackId, `${folder}/${content.fileName}`, content.downloadUrl, content.sha1);
      target.onInstalled(content.sha1);
      toast.success(`${content.displayName} instalado en ${target.name}`, { description: AFTER_INSTALL[content.category] });
    } catch (e: any) {
      toast.error("No se pudo instalar", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const saveSkin = async () => {
    setBusy(true);
    try {
      const base64 = await fetchAsBase64(content.downloadUrl);
      await saveToSkinLibrary(content.displayName, content.skinVariant ?? "classic", base64);
      setSkinSaved(true);
      toast.success(`${content.displayName} guardada`, { description: "Está en tus skins de ALaunchi." });
    } catch (e: any) {
      toast.error("No se pudo guardar la skin", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardShell>
      <CardHeader
        icon={
          content.iconUrl && !iconFailed ? (
            <img
              src={content.iconUrl}
              alt=""
              draggable={false}
              onError={() => setIconFailed(true)}
              className="h-10 w-10 shrink-0 rounded-lg bg-black/30 object-cover"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Icon className="h-4.5 w-4.5" />
            </span>
          )
        }
        title={content.displayName}
        subtitle={
          <>
            <Icon className="h-3 w-3" /> {CATEGORY_LABEL[content.category]}
          </>
        }
      />
      <CardActions>
        {isSkin ? (
          skinSaved ? (
            <ActionButton tone="success" icon={Check} disabled className="flex-1 !opacity-100">
              Guardada en tus skins
            </ActionButton>
          ) : (
            <ActionButton icon={Download} loading={busy} onClick={saveSkin} className="flex-1">
              Guardar en mis skins
            </ActionButton>
          )
        ) : !target ? null : locked ? (
          <ActionButton tone="neutral" icon={Ban} disabled className="flex-1">
            Contenido bloqueado en esta instancia
          </ActionButton>
        ) : installed ? (
          <ActionButton tone="success" icon={Check} disabled className="flex-1 !opacity-100">
            Instalado en {target.name}
          </ActionButton>
        ) : (
          <ActionButton icon={Download} loading={busy} onClick={install} className="min-w-0 flex-1">
            <span className="truncate">Instalar en {target.name}</span>
          </ActionButton>
        )}
      </CardActions>
    </CardShell>
  );
}

/** A screenshot someone sent: the picture (click → full size) and "Agregar a
 *  la galería". */
export function ScreenshotCard({
  content,
  senderUsername,
  onOpen,
}: {
  content: SharedContent;
  senderUsername: string;
  onOpen: (src: string, title: string) => void;
}) {
  const inGallery = usePersonalLibrary((s) => s.gallery.some((g) => g.sha1 === content.sha1));
  const galleryLoaded = usePersonalLibrary((s) => s.loaded);
  useEffect(() => {
    if (!galleryLoaded) usePersonalLibrary.getState().refresh().catch(() => {});
  }, [galleryLoaded]);
  const [saving, setSaving] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const preview = fullLoaded && !fullFailed ? content.downloadUrl : content.iconUrl;

  const save = async () => {
    setSaving(true);
    try {
      const { alreadySaved } = await addToGallery(
        { kind: "url", url: content.downloadUrl, sha1: content.sha1 },
        content.fileName,
        { kind: "chat", username: senderUsername },
      );
      toast.success(alreadySaved ? "Ya estaba en tu galería" : "Guardada en tu galería");
    } catch (e: any) {
      toast.error("No se pudo guardar la imagen", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CardShell className="overflow-hidden p-1.5">
      <button
        type="button"
        onClick={() => onOpen(fullFailed ? content.iconUrl || content.downloadUrl : content.downloadUrl, content.displayName)}
        className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-black/40"
      >
        {preview ? (
          <img src={preview} alt="" draggable={false} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          </span>
        )}
        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3 w-3" />
        </span>
        {!fullLoaded && !fullFailed && (
          <img src={content.downloadUrl} alt="" className="hidden" onLoad={() => setFullLoaded(true)} onError={() => setFullFailed(true)} />
        )}
      </button>
      <div className="mt-1.5">
        {inGallery ? (
          <ActionButton tone="success" icon={Check} disabled className="w-full !opacity-100">
            En tu galería
          </ActionButton>
        ) : (
          <ActionButton icon={ImagePlus} loading={saving} onClick={save} className="w-full">
            Agregar a la galería
          </ActionButton>
        )}
      </div>
    </CardShell>
  );
}

/** A server address: copy it (to paste in Multijugador → Conexión directa)
 *  or keep it in the launcher's saved servers. */
export function ServerCard({ server }: { server: SharedServer }) {
  const saved = useSavedServers((s) => s.servers.some((x) => x.ip.toLowerCase() === server.ip.toLowerCase()));
  const add = useSavedServers((s) => s.add);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(server.ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Dirección copiada", { description: "Pégala en Multijugador → Conexión directa." });
    } catch {
      toast.error("No se pudo copiar la dirección");
    }
  };

  return (
    <CardShell>
      <CardHeader
        icon={<ServerIcon ip={server.ip} className="h-10 w-10 rounded-lg" />}
        title={server.name}
        subtitle={<span className="select-text font-mono">{server.ip}</span>}
      />
      <CardActions>
        <ActionButton icon={copied ? Check : Copy} onClick={copy} className="flex-1">
          {copied ? "Copiada" : "Copiar dirección"}
        </ActionButton>
        <ActionButton
          tone={saved ? "success" : "neutral"}
          icon={saved ? Check : Bookmark}
          disabled={saved}
          onClick={() => add(server.name, server.ip) && toast.success(`${server.name} guardado en tus servers`)}
          className={cn(saved && "!opacity-100")}
        >
          {saved ? "Guardado" : "Guardar"}
        </ActionButton>
      </CardActions>
    </CardShell>
  );
}

/** A private instance shared as a recipe — it's recreated from the launcher. */
export function InstanceCard({ instance }: { instance: SharedInstance }) {
  const count = instance.recipe ? Object.values(instance.recipe).length : 0;
  return (
    <CardShell>
      <CardHeader
        icon={
          instance.iconDataUrl ? (
            <img src={instance.iconDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-black/30 object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-bold text-accent">
              {instance.name.charAt(0).toUpperCase()}
            </span>
          )
        }
        title={instance.name}
        subtitle={
          <>
            <LoaderIcon loader={instance.loaderType} className="h-3 w-3" />
            {instance.minecraftVersion} · {count} elemento{count === 1 ? "" : "s"}
          </>
        }
      />
      <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-2.5 py-2 text-[10px] text-gray-400">
        <Layers className="h-3 w-3 shrink-0" /> Instálala desde ALaunchi cuando cierres el juego.
      </div>
    </CardShell>
  );
}
