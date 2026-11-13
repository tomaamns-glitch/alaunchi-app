import { create } from "zustand";
import { blockUser, subscribeBlockedBy, subscribeMyBlocks, unblockUser } from "@/services/blocks";

/** Live block lists of the signed-in player (services/blocks.ts). Started in
 *  App.tsx (and the game overlay) with the account; read anywhere. */
interface BlocksState {
  myUuid: string | null;
  /** Players I blocked. */
  blocked: Set<string>;
  /** Players who blocked me. */
  blockedBy: Set<string>;
  init: (myUuid: string) => void;
  block: (uuid: string) => Promise<void>;
  unblock: (uuid: string) => Promise<void>;
}

let unsubs: (() => void)[] = [];

export const useBlocks = create<BlocksState>((set, get) => ({
  myUuid: null,
  blocked: new Set(),
  blockedBy: new Set(),
  init: (myUuid) => {
    if (get().myUuid === myUuid) return;
    for (const u of unsubs) u();
    set({ myUuid, blocked: new Set(), blockedBy: new Set() });
    unsubs = [
      subscribeMyBlocks(myUuid, (blocked) => set({ blocked })),
      subscribeBlockedBy(myUuid, (blockedBy) => set({ blockedBy })),
    ];
  },
  block: async (uuid) => {
    const { myUuid } = get();
    if (myUuid) await blockUser(myUuid, uuid);
  },
  unblock: async (uuid) => {
    const { myUuid } = get();
    if (myUuid) await unblockUser(myUuid, uuid);
  },
}));

/** Either of us blocked the other (no messages, no shared content). */
export function isBlockedEitherWay(uuid: string): boolean {
  const { blocked, blockedBy } = useBlocks.getState();
  return blocked.has(uuid) || blockedBy.has(uuid);
}
