import { create } from "zustand";

// Purely organizational metadata (folders, which instance is in which folder,
// drag-reorder position) for the Hub's private-instances grid. Kept entirely
// separate from the instances themselves (use-custom-instances.ts / the
// instance's own alaunchi-meta.json on disk) — this is just "how the user
// likes them arranged on THIS device", localStorage is the right fit, same
// reasoning as the carousel-position/modpack-install-state localStorage keys
// elsewhere in the app.

export interface InstanceFolder {
  id: string;
  name: string;
}

interface PersistedShape {
  folders: InstanceFolder[];
  placement: Record<string, string>; // instanceId -> folderId
  rootOrder: string[]; // "folder:<id>" | "instance:<id>", root-level items only
  folderOrder: Record<string, string[]>; // folderId -> ordered instance ids
}

const STORAGE_KEY = "alaunchi_instance_folders";

function readPersisted(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    return {
      folders: parsed.folders ?? [],
      placement: parsed.placement ?? {},
      rootOrder: parsed.rootOrder ?? [],
      folderOrder: parsed.folderOrder ?? {},
    };
  } catch {
    return { folders: [], placement: {}, rootOrder: [], folderOrder: {} };
  }
}

function persist(state: PersistedShape) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      folders: state.folders,
      placement: state.placement,
      rootOrder: state.rootOrder,
      folderOrder: state.folderOrder,
    })
  );
}

export const FOLDER_PREFIX = "folder:";
export const INSTANCE_PREFIX = "instance:";

interface FoldersState extends PersistedShape {
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  /** Ungroups the folder's instances back to root; never deletes the instances. */
  deleteFolder: (id: string) => void;
  /** Moves an instance into a folder (targetFolderId) or back to root (null). */
  moveInstance: (instanceId: string, targetFolderId: string | null, atIndex?: number) => void;
  reorderRoot: (newOrder: string[]) => void;
  reorderInFolder: (folderId: string, newOrder: string[]) => void;
  /** Call with the live list of instance ids whenever the Hub loads — adds
   *  newly-created instances to root (so they show up without extra wiring)
   *  and prunes anything that no longer exists (deleted instances). */
  syncInstances: (liveInstanceIds: string[]) => void;
}

export const useInstanceFolders = create<FoldersState>((set, get) => ({
  ...readPersisted(),

  createFolder: (name) => {
    const id = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const folders = [...get().folders, { id, name }];
    const rootOrder = [...get().rootOrder, `${FOLDER_PREFIX}${id}`];
    const folderOrder = { ...get().folderOrder, [id]: [] };
    set({ folders, rootOrder, folderOrder });
    persist(get());
    return id;
  },

  renameFolder: (id, name) => {
    const folders = get().folders.map((f) => (f.id === id ? { ...f, name } : f));
    set({ folders });
    persist(get());
  },

  deleteFolder: (id) => {
    const { folders, placement, rootOrder, folderOrder } = get();
    const instanceIds = folderOrder[id] ?? [];
    const newPlacement = { ...placement };
    for (const instId of instanceIds) delete newPlacement[instId];
    const newFolderOrder = { ...folderOrder };
    delete newFolderOrder[id];
    const newRootOrder = rootOrder
      .filter((entry) => entry !== `${FOLDER_PREFIX}${id}`)
      .concat(instanceIds.map((instId) => `${INSTANCE_PREFIX}${instId}`));
    set({
      folders: folders.filter((f) => f.id !== id),
      placement: newPlacement,
      rootOrder: newRootOrder,
      folderOrder: newFolderOrder,
    });
    persist(get());
  },

  moveInstance: (instanceId, targetFolderId, atIndex) => {
    const { placement, rootOrder, folderOrder } = get();
    const currentFolderId = placement[instanceId] ?? null;
    if (currentFolderId === targetFolderId) return;

    const newRootOrder = rootOrder.filter((e) => e !== `${INSTANCE_PREFIX}${instanceId}`);
    const newFolderOrder = { ...folderOrder };
    if (currentFolderId) {
      newFolderOrder[currentFolderId] = (newFolderOrder[currentFolderId] ?? []).filter((id) => id !== instanceId);
    }

    const newPlacement = { ...placement };
    if (targetFolderId) {
      newPlacement[instanceId] = targetFolderId;
      const list = [...(newFolderOrder[targetFolderId] ?? [])];
      list.splice(atIndex ?? list.length, 0, instanceId);
      newFolderOrder[targetFolderId] = list;
    } else {
      delete newPlacement[instanceId];
      const entry = `${INSTANCE_PREFIX}${instanceId}`;
      newRootOrder.splice(atIndex ?? newRootOrder.length, 0, entry);
    }

    set({ placement: newPlacement, rootOrder: newRootOrder, folderOrder: newFolderOrder });
    persist(get());
  },

  reorderRoot: (newOrder) => {
    set({ rootOrder: newOrder });
    persist(get());
  },

  reorderInFolder: (folderId, newOrder) => {
    set({ folderOrder: { ...get().folderOrder, [folderId]: newOrder } });
    persist(get());
  },

  syncInstances: (liveInstanceIds) => {
    const live = new Set(liveInstanceIds);
    const { placement, rootOrder, folderOrder } = get();

    const knownRootInstances = new Set(
      rootOrder.filter((e) => e.startsWith(INSTANCE_PREFIX)).map((e) => e.slice(INSTANCE_PREFIX.length))
    );
    const knownFolderInstances = new Set(Object.values(folderOrder).flat());
    const known = new Set([...knownRootInstances, ...knownFolderInstances]);

    // New instances the store has never seen — append to root.
    const additions = liveInstanceIds.filter((id) => !known.has(id));
    const newRootOrder = [...rootOrder.filter((e) => !e.startsWith(INSTANCE_PREFIX) || live.has(e.slice(INSTANCE_PREFIX.length)))];
    for (const id of additions) newRootOrder.push(`${INSTANCE_PREFIX}${id}`);

    // Deleted instances — drop from wherever they were tracked.
    const newFolderOrder: Record<string, string[]> = {};
    for (const [fid, ids] of Object.entries(folderOrder)) {
      newFolderOrder[fid] = ids.filter((id) => live.has(id));
    }
    const newPlacement: Record<string, string> = {};
    for (const [id, fid] of Object.entries(placement)) {
      if (live.has(id)) newPlacement[id] = fid;
    }

    set({ rootOrder: newRootOrder, folderOrder: newFolderOrder, placement: newPlacement });
    persist(get());
  },
}));
