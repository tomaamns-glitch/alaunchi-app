import { onPlaytimeSessionEnded } from "./electron";
import { markOffline, updatePlaytime } from "./presence";
import { markAppOnline } from "./user-activity";
import { useAuth } from "@/hooks/use-auth";

/** Call once at startup. When the main process reports a tracked Minecraft
 *  session ended (see playtime tracking in main.js), mark the current user
 *  offline for that modpack in the presence database, publish the fresh
 *  playtime total so others see it (e.g. in the chat header), and drop the
 *  unified activity status back to plain "online" (see markPlayingInstance's
 *  call sites for where it gets set to "playing" in the first place). */
export function initPresenceSync() {
  onPlaytimeSessionEnded(({ modpackId, totalPlaytimeMs }) => {
    const { uuid, username } = useAuth.getState();
    if (!uuid || !username) return;
    markOffline(modpackId, uuid, username).catch(() => {});
    updatePlaytime(modpackId, uuid, totalPlaytimeMs).catch(() => {});
    markAppOnline(uuid, username).catch(() => {});
  });

  // Announce "app is open" as soon as we know who's logged in — not at import
  // time, since loadPersistedAuth() (App.tsx) hasn't resolved yet then. Fires
  // once per login, not on every unrelated auth-store update (isRefreshing
  // toggling, etc.) — the guard only lets it through on the actual
  // logged-out → logged-in transition.
  let announced = false;
  useAuth.subscribe((state) => {
    if (state.authChecked && state.isAuthenticated && state.uuid && state.username && !announced) {
      announced = true;
      markAppOnline(state.uuid, state.username).catch(() => {});
    } else if (!state.isAuthenticated) {
      announced = false;
    }
  });
}
