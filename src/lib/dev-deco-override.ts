import { create } from "zustand";

// DEV ONLY — the third-party avatar decoration currently picked in the Pruebas
// lab, shown temporarily around your head in the account menu. Never persisted
// or published; in a production build nothing ever sets it, so it stays null.

interface DevDecoOverride {
  name: string | null;
  square: boolean;
  set: (name: string, square: boolean) => void;
  clear: () => void;
}

export const useDevDecoOverride = create<DevDecoOverride>((set) => ({
  name: null,
  square: true,
  set: (name, square) => set({ name, square }),
  clear: () => set({ name: null }),
}));
