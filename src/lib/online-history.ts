import type { Modpack, OfflineReason } from "@/services/github";

/**
 * Every online instance this user has had, so one that disappears from the
 * catalog (you left, the creator removed you, the creator deleted it) can be
 * kept as "past" instead of silently vanishing — its files are still on disk
 * and playable, just without updates or instance chat/presence.
 *
 * Local only (per Minecraft uuid): what matters is what's on this machine.
 * Reconciled against the catalog on every loadModpacks (hooks/use-modpacks.ts).
 */

export interface OnlineHistoryEntry {
  id: string;
  repoUrl: string;
  name: string;
  imageUrl: string;
  bannerUrl: string;
  minecraftVersion: string;
  loaderType: Modpack["loaderType"];
  status: "online" | "past";
  /** Only for status "past". */
  reason?: OfflineReason;
  /** When it became past (epoch ms). */
  since?: number;
  /** Hidden from the carousel — applies to both online and past instances. */
  archived?: boolean;
}

export type OnlineHistory = Record<string, OnlineHistoryEntry>;

const keyFor = (uuid: string) => `alaunchi_online_history:${uuid}`;

export function readOnlineHistory(uuid: string | null): OnlineHistory {
  if (!uuid) return {};
  try {
    const raw = localStorage.getItem(keyFor(uuid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeOnlineHistory(uuid: string | null, history: OnlineHistory): void {
  if (!uuid) return;
  localStorage.setItem(keyFor(uuid), JSON.stringify(history));
}

/** What's worth remembering about a catalog pack to still show it once it's gone. */
export function historyEntryFrom(mp: Modpack, previous?: OnlineHistoryEntry): OnlineHistoryEntry {
  return {
    id: mp.id,
    repoUrl: mp.repoUrl ?? previous?.repoUrl ?? "",
    name: mp.name,
    imageUrl: mp.imageUrl,
    bannerUrl: mp.bannerUrl,
    minecraftVersion: mp.minecraftVersion,
    loaderType: mp.loaderType,
    status: "online",
    // Still online → keep the archive choice; coming back from past (a new
    // code redeemed) → it's a fresh start, show it again.
    archived: previous?.status === "online" ? previous.archived : false,
  };
}

export function markPast(entry: OnlineHistoryEntry, reason: OfflineReason): OnlineHistoryEntry {
  return { ...entry, status: "past", reason, since: Date.now() };
}

/** A past entry as a Modpack the carousel/detail page can render. No repoUrl on
 *  purpose: nothing will try to update it or read its catalog again. */
export function pastEntryToModpack(entry: OnlineHistoryEntry, installedVersion: string | undefined): Modpack {
  return {
    id: entry.id,
    name: entry.name,
    description: "",
    minecraftVersion: entry.minecraftVersion,
    loaderType: entry.loaderType,
    version: installedVersion ?? "",
    imageUrl: entry.imageUrl,
    bannerUrl: entry.bannerUrl,
    installed: installedVersion !== undefined,
    installedVersion,
    updateAvailable: false,
    fileCount: 0,
    totalSizeMb: 0,
    source: "github",
    outOfNetwork: entry.reason ?? "deleted",
  };
}

export const OFFLINE_REASON_LABEL: Record<OfflineReason, string> = {
  left: "Saliste de la instancia",
  kicked: "El creador te quitó el acceso",
  deleted: "El creador eliminó la instancia",
};
