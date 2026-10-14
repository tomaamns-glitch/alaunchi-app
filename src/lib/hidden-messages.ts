import { create } from "zustand";

// "Eliminar para mí" on someone else's chat message: hidden only for this
// user, the message stays in RTDB for everyone else. Per user and per PC
// (localStorage), like the group chat's unread marker — a display preference,
// not shared state. Keys are `<scope>:<messageId>`, scope = the 1:1
// conversation id or the group chat's groupKey.

const storageKey = (myUuid: string) => `alaunchi_hidden_msgs:${myUuid}`;

function load(myUuid: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(myUuid)) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

interface HiddenMessagesState {
  uuid: string | null;
  hidden: Set<string>;
  /** Loads `myUuid`'s list (no-op if already loaded for that user). */
  init: (myUuid: string) => void;
  hide: (myUuid: string, scope: string, messageId: string) => void;
}

export const useHiddenMessages = create<HiddenMessagesState>((set, get) => ({
  uuid: null,
  hidden: new Set(),
  init: (myUuid) => {
    if (get().uuid === myUuid) return;
    set({ uuid: myUuid, hidden: load(myUuid) });
  },
  hide: (myUuid, scope, messageId) => {
    get().init(myUuid);
    const next = new Set(get().hidden);
    next.add(`${scope}:${messageId}`);
    set({ hidden: next });
    try {
      // Capped so years of hidden messages can't grow it without bound.
      localStorage.setItem(storageKey(myUuid), JSON.stringify(Array.from(next).slice(-2000)));
    } catch {}
  },
}));

export const hiddenKey = (scope: string, messageId: string) => `${scope}:${messageId}`;
