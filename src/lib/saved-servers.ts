import { create } from "zustand";

/** A Minecraft server address saved in Cuenta → Servers (name is whatever the
 *  user chose, not the server's MOTD). */
export interface SavedServer {
  id: string;
  name: string;
  ip: string;
  addedAt: number;
}

// Per account, like the pinned chats — the same PC can be shared by more than
// one Microsoft login. Not a secret, so plain localStorage is fine.
const storageKey = (uuid: string) => `alaunchi_saved_servers:${uuid}`;

function load(uuid: string): SavedServer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(uuid)) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => s && typeof s.ip === "string" && typeof s.name === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeServerAddress(ip: string): string {
  return ip.trim().replace(/^minecraft:\/\//i, "").replace(/\/+$/, "");
}

/** Loose check — host (name or IPv4/[IPv6]) with an optional :port. */
export function isValidServerAddress(ip: string): boolean {
  const v = normalizeServerAddress(ip);
  return /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i.test(v) && v.length <= 255;
}

interface SavedServersState {
  uuid: string | null;
  servers: SavedServer[];
  init: (uuid: string) => void;
  /** Returns false if that address is already saved. */
  add: (name: string, ip: string) => boolean;
  remove: (id: string) => void;
}

export const useSavedServers = create<SavedServersState>((set, get) => {
  const persist = (servers: SavedServer[]) => {
    const { uuid } = get();
    if (uuid) localStorage.setItem(storageKey(uuid), JSON.stringify(servers));
    set({ servers });
  };
  return {
    uuid: null,
    servers: [],
    init: (uuid) => {
      if (get().uuid === uuid) return;
      set({ uuid, servers: load(uuid) });
    },
    add: (name, ip) => {
      const address = normalizeServerAddress(ip);
      if (get().servers.some((s) => s.ip.toLowerCase() === address.toLowerCase())) return false;
      persist([
        ...get().servers,
        { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || address, ip: address, addedAt: Date.now() },
      ]);
      return true;
    },
    remove: (id) => persist(get().servers.filter((s) => s.id !== id)),
  };
});
