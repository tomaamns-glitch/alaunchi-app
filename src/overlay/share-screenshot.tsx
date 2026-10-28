import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, Search, Send, Users } from "lucide-react";
import { subscribeFriends, type FriendEntry } from "@/services/friends";
import { sendSharedContent } from "@/services/chat";
import { uploadSharedContent, type SharedContent } from "@/services/content-share";
import { readInstanceFile } from "@/services/electron";
import { getNicknames } from "@/lib/nicknames";
import { useOverlayStore, type ShareableShot } from "./overlay-store";
import { shotLabel } from "./screenshots-tab";
import { ActionButton, EmptyState, Field, IconButton, PlayerHead } from "./ui";

/** "Compartir captura": the screenshot goes to the friends you pick, as the
 *  same "Captura" chat card the launcher sends (share-image-dialog.tsx) —
 *  moderated upload included, done once however many people get it. */
export function ShareScreenshot({ shot }: { shot: ShareableShot }) {
  const me = useOverlayStore((s) => s.me);
  const chatIndex = useOverlayStore((s) => s.chatIndex);
  const activity = useOverlayStore((s) => s.activity);
  const openShare = useOverlayStore((s) => s.openShare);
  const [friends, setFriends] = useState<Record<string, FriendEntry> | null>(null);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const nicknames = useMemo(() => getNicknames(), []);

  useEffect(() => {
    if (!me) return;
    return subscribeFriends(me.uuid, setFriends);
  }, [me]);

  useEffect(() => {
    setUploadedUrl(null);
    setSent(new Set());
  }, [shot.fileName]);

  // Online first, then by most recent conversation, then alphabetically.
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (uuid: string) => (activity[uuid]?.status === "playing" || activity[uuid]?.status === "online" ? 1 : 0);
    return Object.entries(friends ?? {})
      .map(([uuid, f]) => ({ uuid, username: f.username || "", name: nicknames[uuid] || f.username || "Jugador" }))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          rank(b.uuid) - rank(a.uuid) ||
          (chatIndex[b.uuid]?.lastTimestamp || 0) - (chatIndex[a.uuid]?.lastTimestamp || 0) ||
          a.name.localeCompare(b.name),
      );
  }, [friends, chatIndex, activity, nicknames, query]);

  const send = async (uuid: string, username: string, name: string) => {
    if (!me || sending) return;
    setSending(uuid);
    try {
      let url = uploadedUrl;
      if (!url) {
        url = await uploadSharedContent(await readInstanceFile(shot.modpackId, `screenshots/${shot.fileName}`), shot.sha1);
        setUploadedUrl(url);
      }
      const content: SharedContent = {
        category: "screenshots",
        fileName: shot.fileName,
        displayName: shot.fileName,
        iconUrl: shot.thumbnailDataUrl,
        sha1: shot.sha1,
        size: shot.size,
        downloadUrl: url,
      };
      await sendSharedContent(me.uuid, me.username, uuid, username, content);
      setSent((s) => new Set(s).add(uuid));
      toast.success(`Captura enviada a ${name}`);
    } catch (e: any) {
      toast.error("No se pudo enviar la captura", { description: e?.message });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-4 pb-3">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-2 pr-3">
          <IconButton icon={ArrowLeft} label="Volver a las capturas" onClick={() => openShare(null)} />
          {shot.thumbnailDataUrl ? (
            <img
              src={shot.thumbnailDataUrl}
              alt=""
              draggable={false}
              className="aspect-video w-32 shrink-0 rounded-lg object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            />
          ) : (
            <span className="flex aspect-video w-32 shrink-0 items-center justify-center rounded-lg bg-black/40">
              <Camera className="h-5 w-5 text-gray-600" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white">Compartir captura</p>
            <p className="mt-0.5 text-[11px] text-gray-400">{shotLabel(shot.fileName)}</p>
            <p className="mt-1 text-[10px] leading-snug text-gray-500">Llega por el chat y se guarda en su galería.</p>
          </div>
        </div>
        <Field icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar amigo" autoFocus />
      </div>

      <div className="flex items-center justify-between px-5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Amigos</span>
        {sent.size > 0 && <span className="normal-case tracking-normal text-emerald-400">Enviada a {sent.size}</span>}
      </div>
      <div className="overlay-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!me ? (
          <EmptyState icon={Users} title="Inicia sesión en ALaunchi">
            Para compartir hace falta tu cuenta del launcher.
          </EmptyState>
        ) : friends && people.length === 0 ? (
          <EmptyState icon={Users} title={query ? "Nadie con ese nombre" : "Aún no tienes amigos"}>
            {query ? undefined : "Añade amigos desde ALaunchi para compartir con ellos."}
          </EmptyState>
        ) : (
          people.map((p) => {
            const a = activity[p.uuid];
            const isSent = sent.has(p.uuid);
            return (
              <div key={p.uuid} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
                <PlayerHead
                  uuid={p.uuid}
                  name={p.name}
                  size={34}
                  status={a?.status === "playing" ? "playing" : a?.status === "online" ? "online" : "offline"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-gray-100">{p.name}</p>
                  {a?.status === "playing" ? (
                    <p className="truncate text-[10px] text-accent">Jugando a {a.instanceName || "Minecraft"}</p>
                  ) : a?.status === "online" ? (
                    <p className="text-[10px] text-emerald-400">En línea</p>
                  ) : (
                    <p className="text-[10px] text-gray-500">Desconectado</p>
                  )}
                </div>
                {isSent ? (
                  <ActionButton tone="success" icon={Check} disabled className="w-[84px] !opacity-100">
                    Enviada
                  </ActionButton>
                ) : (
                  <ActionButton
                    icon={Send}
                    loading={sending === p.uuid}
                    disabled={!!sending && sending !== p.uuid}
                    onClick={() => send(p.uuid, p.username, p.name)}
                    className="w-[84px]"
                  >
                    {sending === p.uuid ? "" : "Enviar"}
                  </ActionButton>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
