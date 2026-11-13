import { create } from "zustand";

/**
 * Online instances' group chats the player muted (per account, on this PC):
 * no sound in the launcher and no corner notice in the game overlay for new
 * messages there — the unread count still goes up. Separate from muting a
 * person (use-chat-heads.ts mutedUuids): a muted person still pings you when
 * they write in a group, and muting a group silences everyone in it.
 * Keyed by the room's groupKey (lib/group-key, i.e. the instance's grantKey).
 */
const storageKey = (myUuid: string) => `alaunchi_muted_groups_${myUuid}`;

function load(myUuid: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(myUuid)) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

/** For code that only has the account (the overlay, outside React). */
export function isGroupMuted(myUuid: string, groupKey: string): boolean {
  return load(myUuid).has(groupKey);
}

interface MutedGroupsState {
  myUuid: string | null;
  muted: Set<string>;
  init: (myUuid: string) => void;
  toggle: (groupKey: string) => void;
}

export const useMutedGroups = create<MutedGroupsState>((set, get) => ({
  myUuid: null,
  muted: new Set(),
  init: (myUuid) => {
    if (get().myUuid === myUuid) return;
    set({ myUuid, muted: load(myUuid) });
  },
  toggle: (groupKey) => {
    const { myUuid, muted } = get();
    const next = new Set(muted);
    if (!next.delete(groupKey)) next.add(groupKey);
    set({ muted: next });
    if (myUuid) {
      try {
        localStorage.setItem(storageKey(myUuid), JSON.stringify(Array.from(next)));
      } catch {
        /* no storage: muted for this session only */
      }
    }
  },
}));
