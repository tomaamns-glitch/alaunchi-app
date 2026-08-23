import { onPlaytimeSessionEnded } from "./electron";
import { markOffline } from "./presence";
import { useAuth } from "@/hooks/use-auth";

/** Call once at startup. When the main process reports a tracked Minecraft
 *  session ended (see playtime tracking in main.js), mark the current user
 *  offline for that modpack in the presence database. */
export function initPresenceSync() {
  onPlaytimeSessionEnded(({ modpackId }) => {
    const { uuid, username } = useAuth.getState();
    if (!uuid || !username) return;
    markOffline(modpackId, uuid, username).catch(() => {});
  });
}
