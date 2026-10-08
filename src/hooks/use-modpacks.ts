import { useMemo } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { Modpack, fetchModpacks } from "../services/github";
import { addGrantedSource, getGrantedSource, getGrantedSources, getMySource, getReadToken, repoKey, sameRepo } from "../lib/sources";
import { purgeXrayFiles, setContentLocks } from "../services/electron";
import { getUserAccessSet, grantKey, refreshAccess, revokeAccess } from "../services/access-codes";
import {
  type OnlineHistory,
  historyEntryFrom,
  markPast,
  pastEntryToModpack,
  readOnlineHistory,
  writeOnlineHistory,
} from "../lib/online-history";
import { useAuth } from "./use-auth";

const eAPI = (window as any).electronAPI;
const isElectron = !!eAPI;

interface InstalledState {
  installed: boolean;
  installedVersion?: string;
}

// Online instances always show the creator's name and images. Older versions
// let players set their own (`overrides` in the instance's meta); those are
// deliberately no longer applied — only the creator decides how a pack looks.

async function getInstalledState(): Promise<Record<string, InstalledState>> {
  if (isElectron) {
    try {
      const meta: Record<string, any> = await eAPI.getInstalledModpacks();
      const result: Record<string, InstalledState> = {};
      for (const [id, m] of Object.entries(meta)) {
        result[id] = { installed: true, installedVersion: (m as any).version };
      }
      return result;
    } catch {
      return {};
    }
  }
  try {
    const raw = localStorage.getItem("modpackState");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Runs on every load (so it always sees the freshest antiXray flag from the
// catalog, not a value cached from install/update time) — best-effort, never
// blocks or fails the modpack list load.
function sweepXrayContent(modpacks: Modpack[]) {
  for (const mp of modpacks) {
    if (!mp.installed || !mp.antiXray) continue;
    purgeXrayFiles(mp.id)
      .then((deleted) => {
        if (deleted.length > 0) {
          toast.warning(`${mp.name}: se eliminaron ${deleted.length} archivo(s) con nombre sospechoso de X-ray.`);
        }
      })
      .catch(() => {});
  }
}


/** Bloqueo de contenido: hands main the set of this player's locked instances
 *  (installed, lockContent on, and not their own — a creator is never locked
 *  out of their own pack). Runs on every load, like the xray sweep, so turning
 *  the option on or off reaches players with the next catalog read. */
function applyContentLocks(modpacks: Modpack[]) {
  const myRepo = getMySource()?.repoUrl;
  const locked = modpacks.filter((mp) => mp.installed && mp.lockContent && !sameRepo(mp.repoUrl, myRepo));
  // What gets removed is announced through the content-lock:purged event
  // (App.tsx), which also covers removals while the launcher keeps running.
  setContentLocks(locked.map((mp) => mp.id)).catch(() => {});
}

// Which online instances of a repo this user may see: all of them in their
// own repo (they're its creator and manage every pack), only the granted ones
// in a repo they reached through access codes. `accessKnown` is false when the
// grants couldn't be read — then a missing pack says nothing about being removed.
async function filterByAccess(modpacks: Modpack[]): Promise<{ accessible: Modpack[]; accessKnown: boolean }> {
  const mine = getMySource();
  const uuid = useAuth.getState().uuid;
  const needsGrant = modpacks.some((mp) => !sameRepo(mp.repoUrl, mine?.repoUrl));
  if (!needsGrant) return { accessible: modpacks, accessKnown: true };
  let access = new Set<string>();
  let accessKnown = false;
  if (uuid) {
    try {
      access = await getUserAccessSet(uuid);
      accessKnown = true;
    } catch {
      // Firebase hiccup — keep only your own repo's packs rather than guessing.
    }
  }
  const accessible = modpacks.filter(
    (mp) => sameRepo(mp.repoUrl, mine?.repoUrl) || (!!mp.repoUrl && access.has(grantKey(mp.repoUrl, mp.id)))
  );
  return { accessible, accessKnown };
}

/** Brings the online-instance history up to date with what was just read:
 *  visible packs are (again) "online"; a previously online one is now "past" if
 *  its repo was read fine and it's gone from the catalog (deleted by its
 *  creator) or still there but no longer granted to you (removed). Repos that
 *  failed to load this time are left alone — a network error is not a removal. */
function reconcileHistory(
  previous: OnlineHistory,
  accessible: Modpack[],
  catalogIdsByRepo: Map<string, Set<string>>,
  accessKnown: boolean
): OnlineHistory {
  const next: OnlineHistory = { ...previous };
  const accessibleIds = new Set(accessible.map((mp) => mp.id));
  for (const mp of accessible) next[mp.id] = historyEntryFrom(mp, previous[mp.id]);
  for (const entry of Object.values(next)) {
    if (entry.status !== "online" || accessibleIds.has(entry.id)) continue;
    const ids = catalogIdsByRepo.get(repoKey(entry.repoUrl) ?? "");
    if (!ids) continue;
    if (!ids.has(entry.id)) next[entry.id] = markPast(entry, "deleted");
    else if (accessKnown) next[entry.id] = markPast(entry, "kicked");
  }
  return next;
}

/** A granted private repo answering 401/403/404 usually means its creator
 *  rotated the read token — fetch the current one again through a code we
 *  redeemed for that repo and retry once. */
async function fetchSourceCatalog(url: string): Promise<Modpack[]> {
  try {
    return await fetchModpacks(url, getReadToken(url));
  } catch (e: any) {
    const granted = getGrantedSource(url);
    if (![401, 403, 404].includes(e?.status) || !granted?.codes?.length) throw e;
    for (const code of granted.codes) {
      const fresh = await refreshAccess(code).catch(() => null);
      if (fresh?.readToken && fresh.readToken !== granted.readToken) {
        addGrantedSource({ repoUrl: url, readToken: fresh.readToken });
        return fetchModpacks(url, fresh.readToken);
      }
    }
    throw e;
  }
}

/** Every repo to read a catalog from: yours (if you're a creator) plus every
 *  one reached through an access code, de-duplicated. */
function allSourceUrls(): string[] {
  const urls: string[] = [];
  const mine = getMySource();
  if (mine) urls.push(mine.repoUrl);
  for (const g of getGrantedSources()) {
    if (!urls.some((u) => sameRepo(u, g.repoUrl))) urls.push(g.repoUrl);
  }
  return urls;
}

/** Repo + read token of an online instance (by object or by id, looked up in
 *  the loaded catalog), or null if it isn't known — best-effort callers. */
export function findPackSource(pack: Modpack | string | undefined): { repoUrl: string; token?: string } | null {
  const mp = typeof pack === "string" ? useModpacks.getState().modpacks.find((m) => m.id === pack) : pack;
  if (!mp?.repoUrl) return null;
  return { repoUrl: mp.repoUrl, token: getReadToken(mp.repoUrl) };
}

/** Same as findPackSource, but for install/update paths that can't go on
 *  without knowing which repo to download from. */
export function requirePackSource(pack: Modpack | string | undefined): { repoUrl: string; token?: string } {
  const source = findPackSource(pack);
  if (!source) throw new Error("No se sabe de qué repositorio viene esta instancia online. Recarga la lista.");
  return source;
}

function persistLocalState(modpacks: Modpack[]) {
  if (isElectron) return;
  const stateToSave = modpacks.reduce(
    (acc, mp) => {
      acc[mp.id] = {
        installed: mp.installed,
        installedVersion: mp.installedVersion,
        updateAvailable: mp.updateAvailable,
      };
      return acc;
    },
    {} as Record<string, any>
  );
  localStorage.setItem("modpackState", JSON.stringify(stateToSave));
}

interface ModpackState {
  /** Online instances currently reachable ("en línea") — the catalog. */
  modpacks: Modpack[];
  /** "Pasadas": online instances you left / were removed from / got deleted,
   *  as Modpacks with `outOfNetwork` set and no repoUrl. Installed or not. */
  pastModpacks: Modpack[];
  /** Per-user record behind pastModpacks + the archived flags (lib/online-history.ts). */
  history: OnlineHistory;
  /** True once loadModpacks has finished at least once. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Repos whose catalog failed to load on the last loadModpacks, by repo URL
   *  (the rest still loaded fine). */
  sourceErrors: Record<string, string>;
  loadModpacks: () => Promise<void>;
  updateModpackStatus: (id: string, updates: Partial<Modpack>) => void;
  /** Leaves an online instance: drops your grant in Firebase, optionally deletes
   *  its files, and moves it to "past" (reason "left"). */
  leaveInstance: (pack: Modpack, keepFiles: boolean) => Promise<void>;
  /** Hides/shows an instance (online or past) in the carousel. */
  setArchived: (id: string, archived: boolean) => void;
}

function pastFromHistory(history: OnlineHistory, installedState: Record<string, InstalledState>): Modpack[] {
  return Object.values(history)
    .filter((e) => e.status === "past")
    .sort((a, b) => (b.since ?? 0) - (a.since ?? 0))
    .map((e) =>
      pastEntryToModpack(e, installedState[e.id]?.installed ? installedState[e.id].installedVersion : undefined)
    );
}

export const useModpacks = create<ModpackState>((set, get) => ({
  modpacks: [],
  pastModpacks: [],
  history: readOnlineHistory(useAuth.getState().uuid),
  loaded: false,
  loading: false,
  error: null,
  sourceErrors: {},

  loadModpacks: async () => {
    set({ loading: true, error: null, sourceErrors: {} });
    const uuid = useAuth.getState().uuid;

    try {
      const sources = allSourceUrls();
      // One catalog per repo, in parallel — a repo that fails (revoked token,
      // deleted repo, GitHub hiccup) only drops ITS packs, never the others.
      const [results, installedState] = await Promise.all([
        Promise.allSettled(sources.map(fetchSourceCatalog)),
        getInstalledState(),
      ]);

      const sourceErrors: Record<string, string> = {};
      const remoteModpacks: Modpack[] = [];
      const catalogIdsByRepo = new Map<string, Set<string>>();
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          remoteModpacks.push(...r.value);
          const key = repoKey(sources[i]);
          if (key) catalogIdsByRepo.set(key, new Set(r.value.map((mp) => mp.id)));
        } else {
          sourceErrors[sources[i]] = r.reason?.message ?? "Error al cargar el repositorio";
        }
      });
      // Only a full-screen error when nothing could be read at all.
      if (sources.length > 0 && Object.keys(sourceErrors).length === sources.length) {
        // Past instances are local — still show them even with the network down.
        const history = readOnlineHistory(uuid);
        set({ history, pastModpacks: pastFromHistory(history, installedState) });
        throw new Error(Object.values(sourceErrors)[0]);
      }

      const merged = remoteModpacks.map((mp) => {
        const local = installedState[mp.id];
        if (!local) return mp;
        const updateAvailable =
          local.installed && local.installedVersion !== undefined && local.installedVersion !== mp.version;
        return {
          ...mp,
          installed: local.installed,
          installedVersion: local.installedVersion,
          updateAvailable,
        };
      });

      // Instance folders are named by id — two visible instances from different
      // repos with the same id would share one folder, so only the first is
      // kept (new ids get a unique suffix at creation, lib/sources.ts'
      // uniqueModpackId, so this is rare). After filtering, so an instance you
      // can't see never hides one you can.
      const { accessible, accessKnown } = await filterByAccess(merged);
      const visible: Modpack[] = [];
      for (const mp of accessible) {
        if (visible.some((other) => other.id === mp.id)) {
          console.warn(`[modpacks] id "${mp.id}" repetido en ${mp.repoUrl}; se ignora.`);
          continue;
        }
        visible.push(mp);
      }

      // The user may have switched accounts since the last load — always
      // reconcile against THEIR history, not whatever the store held.
      const history = reconcileHistory(readOnlineHistory(uuid), accessible, catalogIdsByRepo, accessKnown);
      writeOnlineHistory(uuid, history);

      set({
        modpacks: visible,
        pastModpacks: pastFromHistory(history, installedState),
        history,
        loaded: true,
        loading: false,
        sourceErrors,
      });
      sweepXrayContent(visible);
      applyContentLocks(visible);
    } catch (e: any) {
      set({ loaded: true, loading: false, error: e?.message ?? "Error al cargar modpacks" });
    }
  },

  updateModpackStatus: (id, updates) => {
    const newModpacks = get().modpacks.map((mp) => (mp.id === id ? { ...mp, ...updates } : mp));
    set({ modpacks: newModpacks });
    persistLocalState(newModpacks);
  },

  leaveInstance: async (pack, keepFiles) => {
    const uuid = useAuth.getState().uuid;
    if (!uuid || !pack.repoUrl) throw new Error("No se puede salir de esta instancia.");
    if (sameRepo(pack.repoUrl, getMySource()?.repoUrl)) {
      throw new Error("Es una instancia tuya: no puedes salir de ella (puedes archivarla).");
    }
    // Files first: if the game is running this fails, and nothing has changed yet.
    if (!keepFiles && pack.installed && isElectron) {
      await eAPI.deleteOnlineInstanceFiles({ id: pack.id });
    }
    await revokeAccess(pack.repoUrl, pack.id, uuid);
    const history = readOnlineHistory(uuid);
    history[pack.id] = markPast(history[pack.id] ?? historyEntryFrom(pack), "left");
    writeOnlineHistory(uuid, history);
    set({ history });
    await get().loadModpacks();
  },

  setArchived: (id, archived) => {
    const uuid = useAuth.getState().uuid;
    const history = readOnlineHistory(uuid);
    if (!history[id]) return;
    history[id] = { ...history[id], archived };
    writeOnlineHistory(uuid, history);
    set({ history });
  },
}));

/** What the home carousel shows: online instances plus past ones that still
 *  have their files, minus anything archived. */
export function useCarouselModpacks(): Modpack[] {
  const modpacks = useModpacks((s) => s.modpacks);
  const pastModpacks = useModpacks((s) => s.pastModpacks);
  const history = useModpacks((s) => s.history);
  return useMemo(
    () => [...modpacks, ...pastModpacks.filter((p) => p.installed)].filter((p) => !history[p.id]?.archived),
    [modpacks, pastModpacks, history]
  );
}
