import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe, Loader2, Minus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useBarInvites, useInvites } from "@/hooks/use-invites";
import { useChatHeads, useHeaderOverlay } from "@/hooks/use-chat-heads";
import { useDismissOnOutsideClick } from "@/hooks/use-dismiss-on-outside-click";
import type { Invite } from "@/services/invites";

const FALLBACK_COLOR = "hsl(205 90% 55%)";

/** One bubble per pending invitation, next to the chat heads: the instance's
 *  logo with a red dot. Clicking it opens (or minimizes) its card. */
export function InviteBubbles() {
  const invites = useBarInvites();
  const openKey = useInvites((s) => s.openKey);
  const open = useInvites((s) => s.open);
  const minimize = useInvites((s) => s.minimize);

  return (
    <AnimatePresence>
      {invites.map((inv) => {
        const active = openKey === inv.key;
        return (
          <motion.button
            key={inv.key}
            layout
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.15 }}
            type="button"
            onClick={() => {
              if (active) return minimize();
              // Only one footer popup at a time.
              useChatHeads.getState().minimizeChat();
              useHeaderOverlay.getState().close();
              open(inv.key);
            }}
            title={`Invitación a ${inv.modpackName}`}
            aria-label={`Invitación de ${inv.fromUsername} a ${inv.modpackName}`}
            className={`relative h-9 w-9 shrink-0 rounded-md border transition-colors ${
              active ? "border-accent bg-accent/15" : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <InstanceLogo invite={inv} className="h-full w-full rounded-md" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border-2 border-card" />
          </motion.button>
        );
      })}
    </AnimatePresence>
  );
}

/** The open invitation's card, floating above the bubble row (same spot as a
 *  chat window). */
export function InviteCard() {
  const openKey = useInvites((s) => s.openKey);
  const invite = useInvites((s) => (s.openKey ? s.invites[s.openKey] : undefined));
  const busyKey = useInvites((s) => s.busyKey);
  const { minimize, dismissFromBar, accept, reject } = useInvites.getState();
  const chatOpen = useChatHeads((s) => s.openUuid);
  const overlay = useHeaderOverlay((s) => s.active);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Opening a chat or a footer menu takes the spot — the invitation minimizes.
  useEffect(() => {
    if (chatOpen || overlay) minimize();
  }, [chatOpen, overlay, minimize]);
  useDismissOnOutsideClick([cardRef], minimize, !!openKey);

  const busy = !!invite && busyKey === invite.key;

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          ref={cardRef}
          key={invite.key}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full left-0 mb-2 z-40 w-80 rounded-xl bg-card/95 backdrop-blur border border-white/10 shadow-2xl overflow-hidden"
        >
          {invite.imageUrl && (
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <img src={invite.imageUrl} alt="" className="w-full h-full object-cover blur-sm scale-110" />
              <div className="absolute inset-0 bg-gradient-to-b from-card/40 to-card" />
            </div>
          )}
          <div className="relative p-4">
            <div className="absolute top-2 right-2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={minimize}
                title="Minimizar"
                className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => dismissFromBar(invite.key)}
                title="Cerrar (seguirá pendiente en Instancias online)"
                className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 pr-12">
              <div className="relative shrink-0">
                <InstanceLogo invite={invite} className="h-14 w-14 rounded-lg shadow-lg" />
                <SenderHead uuid={invite.fromUuid} username={invite.fromUsername} />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" /> Invitación a instancia online
              </p>
            </div>

            <p className="mt-3 text-sm text-gray-200 leading-snug">
              <span className="font-semibold text-white">{invite.fromUsername}</span> te ha invitado a su instancia online{" "}
              <span className="font-bold" style={{ color: invite.color || FALLBACK_COLOR }}>
                {invite.modpackName}
              </span>
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => reject(invite.key)}
                disabled={busy}
                className="flex-1 h-9 rounded-lg border border-white/15 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-60 transition-colors"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => accept(invite.key)}
                disabled={busy}
                className="flex-1 h-9 rounded-lg bg-accent text-accent-foreground text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Aceptar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function InstanceLogo({ invite, className }: { invite: Pick<Invite, "imageUrl" | "modpackName" | "color">; className?: string }) {
  return invite.imageUrl ? (
    <img src={invite.imageUrl} alt="" draggable={false} className={`object-cover bg-black/30 ${className ?? ""}`} />
  ) : (
    <span
      className={`flex items-center justify-center bg-black/30 text-sm font-black ${className ?? ""}`}
      style={{ color: invite.color || FALLBACK_COLOR }}
    >
      {invite.modpackName.charAt(0).toUpperCase()}
    </span>
  );
}

function SenderHead({ uuid, username }: { uuid: string; username: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <Avatar className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-md border-2 border-card" title={username}>
      {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-sm" />}
      <AvatarFallback className="rounded-sm bg-accent/20 text-accent text-[10px] font-bold">
        {username.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
