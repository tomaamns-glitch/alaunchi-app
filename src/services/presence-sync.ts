import { onPlaytimeSessionEnded } from "./electron";
import { markOffline, addPlaytime } from "./presence";
import { addProfilePlaytime } from "./public-profile";
import { normUuid } from "@/lib/playtime";
import { markAppOnline } from "./user-activity";
import { useAuth } from "@/hooks/use-auth";

/** Call once at startup. When the main process reports a tracked Minecraft
 *  session ended (see playtime tracking in main.js), mark the current user
 *  offline for that modpack in the presence database, publish the fresh
 *  playtime total so others see it (e.g. in the chat header), and drop the
 *  unified activity status back to plain "online" (see markPlayingInstance's
 *  call sites for where it gets set to "playing" in the first place). */
export function initPresenceSync() {
  onPlaytimeSessionEnded(({ modpackId, totalPlaytimeMs, sessionMs, accountUuid }) => {
    const { uuid, username } = useAuth.getState();
    if (!uuid || !username) return;
    // The session belongs to the account that launched it, which may not be the
    // one signed in now (account switched while playing): if it's another one,
    // its time is not ours to add.
    if (accountUuid && normUuid(accountUuid) !== normUuid(uuid)) return;
    markOffline(modpackId, uuid, username).catch(() => {});
    addPlaytime(modpackId, uuid, sessionMs ?? 0, totalPlaytimeMs).catch(() => {});
    addProfilePlaytime(uuid, sessionMs ?? 0).catch(() => {});
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
