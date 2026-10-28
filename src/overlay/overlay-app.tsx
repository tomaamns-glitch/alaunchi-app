import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import { X, Package, MessageCircle, Camera, Send, Users } from "lucide-react";
import { LoaderIcon } from "@/components/loader-icon";
import { useDynamicAccent } from "@/hooks/use-dynamic-accent";
import type { OverlayState } from "@/services/electron";
import { useOverlayStore, initOverlayChat, watchOverlayGroup, groupUnread, type OverlayTab } from "./overlay-store";
import { ContentTab } from "./content-tab";
import { ChatTab } from "./chat-tab";
import { ScreenshotsTab } from "./screenshots-tab";
import { ShareScreenshot } from "./share-screenshot";
import { MembersTab } from "./members-tab";
import { ActionButton, IconButton, InstanceAvatar, Kbd, PlayerHead, Segmented } from "./ui";
import { cn } from "@/lib/utils";

const eAPI = (window as any).electronAPI;

const LOADER_LABELS: Record<string, string> = { fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt", vanilla: "Vanilla" };

// A notice (chat message / screenshot) opened within this time jumps straight
// to that conversation / to sharing the screenshot.
const NOTICE_JUMP_MS = 20_000;

// ─── Corner notices ─────────────────────────────────────────────────────────

/** Notice in the corner (game opened, chat message, F2 screenshot). Never
 *  takes focus; only the screenshot one catches clicks (its "Compartir"). */
function Notice({ state }: { state: OverlayState }) {
  const notice = state.toast;
  const message = notice?.kind === "message" ? notice : null;
  const shot = notice?.kind === "screenshot" ? notice : null;

  return (
    <div className="flex h-full items-end justify-end p-2">
      <motion.div
        key={JSON.stringify(notice)}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121214]/95 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 p-3 pr-3.5">
          {shot ? (
            shot.thumbnailDataUrl ? (
              <img src={shot.thumbnailDataUrl} alt="" className="h-[54px] w-24 shrink-0 rounded-lg object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" />
            ) : (
              <span className="flex h-[54px] w-24 shrink-0 items-center justify-center rounded-lg bg-white/5">
                <Camera className="h-5 w-5 text-gray-500" />
              </span>
            )
          ) : message ? (
            <PlayerHead uuid={message.uuid} name={message.title} size={44} />
          ) : (
            <InstanceAvatar imageUrl={state.instance?.imageUrl} loaderType={state.instance?.loaderType} size={44} />
          )}

          <div className="min-w-0 flex-1">
            {shot ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-white">Captura guardada</p>
                  <ActionButton icon={Send} onClick={() => eAPI?.openOverlayPanel()}>
                    Compartir
                  </ActionButton>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-400">Envíasela a tus amigos sin salir del juego.</p>
              </>
            ) : message ? (
              <>
                <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-white">
                  <MessageCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="truncate">{message.title}</span>
                </p>
                <p className="mt-0.5 truncate text-[12px] text-gray-300">{message.body}</p>
              </>
            ) : (
              <>
                <p className="truncate text-[13px] font-semibold text-white">ALaunchi está listo</p>
                <p className="mt-0.5 truncate text-[11px] text-gray-400">{state.instance?.name || "Minecraft"}</p>
              </>
            )}
            {!shot && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
                {state.shortcutActive ? (
                  <>
                    <Kbd keys={state.shortcut} /> {message ? "para responder" : "para abrir el panel"}
                  </>
                ) : (
                  <span className="text-amber-300">El atajo {state.shortcut} no está disponible: cámbialo en Ajustes.</span>
                )}
              </p>
            )}
          </div>
        </div>
        {/* How long the notice stays up. */}
        <motion.span
          key={`bar-${JSON.stringify(notice)}`}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: state.toastMs / 1000, ease: "linear" }}
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent/70"
        />
      </motion.div>
    </div>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

function Panel({ state }: { state: OverlayState }) {
  const instance = state.instance;
  const tab = useOverlayStore((s) => s.tab);
  const setTab = useOverlayStore((s) => s.setTab);
  const shareShot = useOverlayStore((s) => s.shareShot);
  const unread = useOverlayStore(
    (s) => Object.values(s.chatIndex).reduce((n, e) => n + (e.unreadCount || 0), 0) + groupUnread(s.group, s.me?.uuid),
  );
  const online = !!instance?.groupKey;
  const loader = LOADER_LABELS[String(instance?.loaderType || "").toLowerCase()];

  const view = shareShot ? "share" : tab;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#121214]/[0.97] text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
      {/* Soft wash of the instance's color behind the header. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(120%_100%_at_0%_0%,hsl(var(--accent)/0.16),transparent_65%)]" />

      <header className="relative flex items-center gap-3 px-4 pb-3 pt-4">
        <InstanceAvatar imageUrl={instance?.imageUrl} loaderType={instance?.loaderType} size={42} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight tracking-tight">{instance?.name || "Minecraft"}</p>
          <div className="mt-1 flex items-center gap-1.5">
            {instance?.mcVersion && (
              <span className="rounded-md border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                {instance.mcVersion}
              </span>
            )}
            {loader && (
              <span className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                <LoaderIcon loader={instance?.loaderType} className="h-3 w-3" />
                {loader}
              </span>
            )}
          </div>
        </div>
        <span className="flex items-center" title="Atajo para abrir y cerrar el panel">
          <Kbd keys={state.shortcut} />
        </span>
        <IconButton icon={X} label="Volver al juego" onClick={() => eAPI?.closeOverlay()} />
      </header>

      <nav className="relative px-4 pb-3">
        <Segmented<OverlayTab>
          layoutId="overlay-tab"
          value={tab}
          onChange={setTab}
          options={[
            { id: "content", label: "Contenido", icon: Package },
            { id: "chat", label: "Chat", icon: MessageCircle, badge: unread },
            { id: "screenshots", label: "Capturas", icon: Camera },
            // Online instances only.
            ...(online ? [{ id: "members" as const, label: "Participantes", icon: Users }] : []),
          ]}
        />
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.14 }}
          className="relative flex min-h-0 flex-1 flex-col"
        >
          {view === "share" && shareShot ? (
            <ShareScreenshot shot={shareShot} />
          ) : view === "content" ? (
            instance ? <ContentTab key={instance.modpackId} instance={instance} locked={state.contentLocked} /> : null
          ) : view === "chat" ? (
            <ChatTab instance={instance} contentLocked={state.contentLocked} />
          ) : view === "members" ? (
            instance && online ? <MembersTab instance={instance} /> : null
          ) : instance ? (
            <ScreenshotsTab instance={instance} latest={state.screenshot} />
          ) : null}
        </motion.div>
      </AnimatePresence>

      <Toaster
        theme="dark"
        position="bottom-center"
        offset={14}
        visibleToasts={2}
        toastOptions={{
          classNames: {
            toast: "!rounded-xl !border-white/10 !bg-[#1b1b1f]/95 !backdrop-blur !shadow-2xl !text-[12px] !py-2.5 !px-3",
            title: "!font-semibold !text-white",
            description: "!text-gray-400 !text-[11px]",
          },
        }}
      />
    </div>
  );
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState | null>(null);
  // The panel stays mounted once opened, so the search / open chat survive
  // closing and reopening it during the same game session.
  const [panelMounted, setPanelMounted] = useState(false);
  const lastNotice = useRef<{ notice: NonNullable<OverlayState["toast"]>; at: number } | null>(null);

  // The whole overlay takes the running instance's color, like the launcher.
  useDynamicAccent(state?.instance?.imageUrl);

  // Online instance: its group chat is watched for the whole game session.
  const groupKey = state?.instance?.groupKey;
  const instanceName = state?.instance?.name;
  useEffect(() => {
    if (!groupKey) return;
    return watchOverlayGroup(groupKey, instanceName || "la instancia");
  }, [groupKey, instanceName]);

  useEffect(() => {
    if (!eAPI) return;
    eAPI.getOverlayState().then(setState);
    const offState = eAPI.onOverlayState(setState);
    const offChat = initOverlayChat();
    return () => {
      offState();
      offChat();
    };
  }, []);

  const mode = state?.mode ?? "hidden";
  useEffect(() => {
    if (!state) return;
    const { openChat, openShare, setPanelVisible } = useOverlayStore.getState();
    if (mode === "toast" && state.toast) lastNotice.current = { notice: state.toast, at: Date.now() };
    if (mode === "panel") {
      setPanelMounted(true);
      const recent = lastNotice.current;
      if (recent && Date.now() - recent.at < NOTICE_JUMP_MS) {
        if (recent.notice.kind === "message") openChat(recent.notice.chat || recent.notice.uuid);
        else if (state.screenshot) openShare(state.screenshot);
      }
      lastNotice.current = null;
    }
    setPanelVisible(mode === "panel");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, state?.toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") eAPI?.closeOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!state) return null;
  return (
    <>
      {mode === "toast" && <Notice state={state} />}
      {panelMounted && (
        <div className={cn("h-full p-2", mode !== "panel" && "hidden")}>
          <Panel state={state} />
        </div>
      )}
    </>
  );
}
