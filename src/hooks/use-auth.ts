import { create } from "zustand";
import { AuthData, isElectron, silentRefresh, mcTokenIsExpiredOrNearExpiry } from "@/services/auth";

const eAPI = (window as any).electronAPI;

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  uuid: string | null;
  mcToken: string | null;
  isRefreshing: boolean;
  setAuth: (data: AuthData) => Promise<void>;
  logout: () => Promise<void>;
  loadPersistedAuth: () => Promise<void>;
  /** Returns fresh auth data for launch, silently refreshing if needed. Returns null if auth is lost. */
  getValidTokenForLaunch: () => Promise<{ mcToken: string; username: string; uuid: string; xuid: string } | null>;
}

function loadFromLocalStorage(): AuthData | null {
  try {
    const raw = localStorage.getItem("alaunchi_auth");
    if (!raw) return null;
    const data: AuthData = JSON.parse(raw);
    return data;
  } catch {
    return null;
  }
}

function saveToLocalStorage(data: AuthData) {
  localStorage.setItem("alaunchi_auth", JSON.stringify(data));
}

async function readAuthData(): Promise<AuthData | null> {
  if (isElectron) {
    try {
      return await eAPI.readAuth();
    } catch {
      return null;
    }
  }
  return loadFromLocalStorage();
}

async function writeAuthData(data: AuthData): Promise<void> {
  if (isElectron) {
    await eAPI.writeAuth(data);
  } else {
    saveToLocalStorage(data);
  }
}

function applyToState(data: AuthData) {
  return {
    isAuthenticated: true,
    username: data.username,
    uuid: data.uuid,
    mcToken: data.mcToken,
    isRefreshing: false,
  };
}

export const useAuth = create<AuthState>((set) => ({
  isAuthenticated: false,
  username: null,
  uuid: null,
  mcToken: null,
  isRefreshing: false,

  loadPersistedAuth: async () => {
    const data = await readAuthData();
    if (!data) return;

    const refreshTokenStillValid =
      data.msRefreshToken && data.msRefreshTokenExpiresAt > Date.now();

    if (!mcTokenIsExpiredOrNearExpiry(data)) {
      set(applyToState(data));
      return;
    }

    if (!refreshTokenStillValid) {
      // Token expired and no way to refresh — force re-login.
      await writeAuthData({ ...data, mcToken: "", mcTokenExpiresAt: 0 });
      set({ isAuthenticated: false, username: null, uuid: null, mcToken: null, isRefreshing: false });
      return;
    }

    set({ isRefreshing: true });
    const refreshed = await silentRefresh(data);

    if (refreshed) {
      await writeAuthData(refreshed);
      set(applyToState(refreshed));
    } else {
      // Token expired and refresh failed — invalidate the session so the user
      // is forced to log in again instead of launching with a stale token.
      await writeAuthData({ ...data, mcToken: "", mcTokenExpiresAt: 0 });
      set({ isAuthenticated: false, username: null, uuid: null, mcToken: null, isRefreshing: false });
    }
  },

  setAuth: async (data: AuthData) => {
    await writeAuthData(data);
    set(applyToState(data));
  },

  logout: async () => {
    if (isElectron) {
      try {
        await eAPI.clearAuth();
      } catch {}
    } else {
      localStorage.removeItem("alaunchi_auth");
    }
    set({ isAuthenticated: false, username: null, uuid: null, mcToken: null, isRefreshing: false });
  },

  getValidTokenForLaunch: async () => {
    // Always read from disk so we get the most recent data even if the in-memory
    // state is stale (e.g. token was refreshed by loadPersistedAuth earlier).
    const data = await readAuthData();
    if (!data) return null;

    // If the MC token was obtained very recently (< 15 min) and the refresh token
    // has plenty of life left, use the cached token without hitting the network.
    // This avoids Microsoft rate limits when the user is testing quickly.
    // BUT: if xuid is missing (legacy auth.json from before xuid was tracked),
    // force a refresh so we capture it — without xuid, online servers reject
    // the join with "Sesión no válida".
    const mcTokenObtainedAt = data.mcTokenObtainedAt || data.mcTokenExpiresAt - 86_400_000;
    const mcTokenVeryRecent = Date.now() - mcTokenObtainedAt < 15 * 60 * 1000;
    const msRefreshTokenPlenty =
      data.msRefreshToken && data.msRefreshTokenExpiresAt > Date.now() + 24 * 60 * 60 * 1000;
    if (mcTokenVeryRecent && msRefreshTokenPlenty && data.xuid) {
      return { mcToken: data.mcToken, username: data.username, uuid: data.uuid, xuid: data.xuid };
    }

    // The MC token is expired or will expire soon, or the refresh token is also
    // running low. Always try to refresh the MS token chain before launching —
    // this is what Prism Launcher / MultiMC do, and it prevents the "Invalid
    // session" error on online servers.
    if (data.msRefreshToken && data.msRefreshTokenExpiresAt > Date.now()) {
      const refreshed = await silentRefresh(data);
      if (refreshed) {
        await writeAuthData(refreshed);
        set(applyToState(refreshed));
        return { mcToken: refreshed.mcToken, username: refreshed.username, uuid: refreshed.uuid, xuid: refreshed.xuid || "" };
      }
    }

    // Refresh failed. If we have a xuid (we know online-server join can work)
    // and the MC token hasn't hard-expired, fall back to the cached token.
    // If xuid is missing, do NOT launch — online servers will reject with
    // "Sesión no válida" and the user will blame the game instead of re-login.
    if (data.xuid && data.mcToken && data.mcTokenExpiresAt > Date.now()) {
      return { mcToken: data.mcToken, username: data.username, uuid: data.uuid, xuid: data.xuid };
    }

    // Truly unrecoverable — force re-login.
    return null;
  },
}));
