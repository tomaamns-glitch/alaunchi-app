import { create } from "zustand";

// Purely organizational metadata (folders, which instance is in which folder,
// drag-reorder position, starred instances) for the Hub's private-instances
// grid. Kept entirely separate from the instances themselves
// (use-custom-instances.ts / the instance's own alaunchi-meta.json on disk) —
// this is just "how the user likes them arranged on THIS device", localStorage
// is the right fit, same reasoning as the carousel-position/modpack-install-
// state localStorage keys elsewhere in the app.
//
// Folders are a pure tag, not a container in the display order: `order` always
// holds every instance the user has (that's what "Todas" in the sidebar shows,
// and what drag-reordering acts on) — `placement` separately says which one
// folder (if any) an instance is filed under, for the sidebar's per-folder view.

export interface InstanceFolder {
  id: string;
  name: string;
}

interface PersistedShape {
  folders: InstanceFolder[];
  placement: Record<string, string>; // instanceId -> folderId (absent = unfiled)
  order: string[]; // every instance id, master display/drag order ("Todas")
  folderOrder: Record<string, string[]>; // folderId -> ordered instance ids within it
  pinned: string[]; // instanceIds starred in the Hub sidebar/grid
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
      order: parsed.order ?? parsed.rootOrder?.map((e: string) => e.replace(/^instance:/, "")).filter((e: string) => !e.startsWith("folder:")) ?? [],
      folderOrder: parsed.folderOrder ?? {},
      pinned: parsed.pinned ?? [],
    };
  } catch {
    return { folders: [], placement: {}, order: [], folderOrder: {}, pinned: [] };
  }
}

function persist(state: PersistedShape) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      folders: state.folders,
      placement: state.placement,
      order: state.order,
      folderOrder: state.folderOrder,
      pinned: state.pinned,
    })
  );
}

interface FoldersState extends PersistedShape {
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  /** Ungroups the folder's instances (they stay in `order`, just untagged); never deletes the instances. */
  deleteFolder: (id: string) => void;
  /** Files an instance under a folder (targetFolderId) or clears its folder (null). Never touches `order`. */
  moveInstance: (instanceId: string, targetFolderId: string | null, atIndex?: number) => void;
  reorderAll: (newOrder: string[]) => void;
  reorderInFolder: (folderId: string, newOrder: string[]) => void;
  togglePin: (instanceId: string) => void;
  /** Call with the live list of instance ids whenever the Hub loads — adds
   *  newly-created instances (so they show up without extra wiring) and
   *  prunes anything that no longer exists (deleted instances). */
  syncInstances: (liveInstanceIds: string[]) => void;
}

export const useInstanceFolders = create<FoldersState>((set, get) => ({
  ...readPersisted(),

  createFolder: (name) => {
    const id = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const folders = [...get().folders, { id, name }];
    const folderOrder = { ...get().folderOrder, [id]: [] };
    set({ folders, folderOrder });
    persist(get());
    return id;
  },

  renameFolder: (id, name) => {
    const folders = get().folders.map((f) => (f.id === id ? { ...f, name } : f));
    set({ folders });
    persist(get());
  },

  deleteFolder: (id) => {
    const { folders, placement, folderOrder } = get();
    const newPlacement = { ...placement };
    for (const [instId, fid] of Object.entries(placement)) {
      if (fid === id) delete newPlacement[instId];
    }
    const newFolderOrder = { ...folderOrder };
    delete newFolderOrder[id];
    set({ folders: folders.filter((f) => f.id !== id), placement: newPlacement, folderOrder: newFolderOrder });
    persist(get());
  },

  moveInstance: (instanceId, targetFolderId, atIndex) => {
    const { placement, folderOrder } = get();
    const currentFolderId = placement[instanceId] ?? null;
    if (currentFolderId === targetFolderId) return;

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
    }

    set({ placement: newPlacement, folderOrder: newFolderOrder });
    persist(get());
  },

  reorderAll: (newOrder) => {
    set({ order: newOrder });
    persist(get());
  },

  reorderInFolder: (folderId, newOrder) => {
    set({ folderOrder: { ...get().folderOrder, [folderId]: newOrder } });
    persist(get());
  },

  togglePin: (instanceId) => {
    const { pinned } = get();
    const next = pinned.includes(instanceId) ? pinned.filter((id) => id !== instanceId) : [...pinned, instanceId];
    set({ pinned: next });
    persist(get());
  },

  syncInstances: (liveInstanceIds) => {
    const live = new Set(liveInstanceIds);
    const { placement, order, folderOrder, pinned } = get();

    const known = new Set(order);
    const additions = liveInstanceIds.filter((id) => !known.has(id));
    const newOrder = [...order.filter((id) => live.has(id)), ...additions];

    const newFolderOrder: Record<string, string[]> = {};
    for (const [fid, ids] of Object.entries(folderOrder)) {
      newFolderOrder[fid] = ids.filter((id) => live.has(id));
    }
    const newPlacement: Record<string, string> = {};
    for (const [id, fid] of Object.entries(placement)) {
      if (live.has(id)) newPlacement[id] = fid;
    }
    const newPinned = pinned.filter((id) => live.has(id));

    set({ order: newOrder, folderOrder: newFolderOrder, placement: newPlacement, pinned: newPinned });
    persist(get());
  },
}));
