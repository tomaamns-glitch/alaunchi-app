import { useEffect, useState } from "react";
import { pingServer } from "@/services/electron";

// Icons are cached by address in localStorage so the list shows them right
// away (even with the server down); a fresh ping refreshes them at most every
// few minutes per address and app session.
const CACHE_KEY = "alaunchi_server_icons";
const REFRESH_MS = 5 * 60 * 1000;

type Cache = Record<string, { favicon: string | null; at: number }>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

const inFlight = new Map<string, Promise<string | null>>();
const listeners = new Map<string, Set<(favicon: string | null) => void>>();
const pingedAt = new Map<string, number>();

function refresh(address: string) {
  if (inFlight.has(address)) return;
  const p = pingServer(address)
    .then((status) => {
      const cache = readCache();
      // A server that didn't answer keeps its last known icon.
      const favicon = status.online ? status.favicon : cache[address]?.favicon ?? null;
      cache[address] = { favicon, at: Date.now() };
      writeCache(cache);
      listeners.get(address)?.forEach((l) => l(favicon));
      return favicon;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(address));
  inFlight.set(address, p);
  pingedAt.set(address, Date.now());
}

/** The server's own icon (as in Minecraft's server list), or null. */
export function useServerIcon(ip: string): string | null {
  const address = ip.trim().toLowerCase();
  const [favicon, setFavicon] = useState<string | null>(() => readCache()[address]?.favicon ?? null);

  useEffect(() => {
    setFavicon(readCache()[address]?.favicon ?? null);
    const set = listeners.get(address) ?? new Set();
    set.add(setFavicon);
    listeners.set(address, set);
    if (Date.now() - (pingedAt.get(address) ?? 0) > REFRESH_MS) refresh(address);
    return () => {
      set.delete(setFavicon);
    };
  }, [address]);

  return favicon;
}
