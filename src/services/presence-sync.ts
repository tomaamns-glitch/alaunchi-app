import { onPlaytimeSessionEnded } from "./electron";
import { markOffline, updatePlaytime } from "./presence";
import { useAuth } from "@/hooks/use-auth";

/** Call once at startup. When the main process reports a tracked Minecraft
 *  session ended (see playtime tracking in main.js), mark the current user
 *  offline for that modpack in the presence database, and publish the fresh
 *  playtime total so others see it (e.g. in the chat header). */
export function initPresenceSync() {
  onPlaytimeSessionEnded(({ modpackId, totalPlaytimeMs }) => {
    const { uuid, username } = useAuth.getState();
    if (!uuid || !username) return;
    markOffline(modpackId, uuid, username).catch(() => {});
    updatePlaytime(modpackId, uuid, totalPlaytimeMs).catch(() => {});
  });
}
