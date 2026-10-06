import { focusWindow, getAppIconDataUrl } from "@/services/electron";
import { getPlayerHeadDataUrl } from "@/hooks/use-player-head";
import { playNotificationSound } from "@/lib/notification-sound";

/** True while the launcher window can actually be seen — Electron reports the
 *  document as hidden when the window is minimized or closed to the tray. */
export function isAppVisible(): boolean {
  return document.visibilityState === "visible";
}

/**
 * Something happened that the player should hear about (chat message, friend
 * request…). The sound always plays; the Windows notification only shows when
 * the launcher is minimized or in the tray — with it open on screen, a toast
 * popping up over the app you're looking at is just noise.
 *
 * The OS notification is always requested silent so the user's chosen sound
 * (notification-sound.ts) is the only audio.
 */
export async function notifyUser(opts: { title: string; body: string; iconUuid?: string }): Promise<void> {
  playNotificationSound();
  if (typeof Notification === "undefined" || isAppVisible()) return;
  const icon =
    (opts.iconUuid ? await getPlayerHeadDataUrl(opts.iconUuid).catch(() => null) : null) ||
    (await getAppIconDataUrl().catch(() => null));
  const n = new Notification(opts.title, { body: opts.body, icon: icon ?? undefined, silent: true });
  n.onclick = () => focusWindow();
}
