import { create } from "zustand";

/**
 * Which instance the crash diagnosis dialog is open for (components/crash-watcher.tsx
 * mounts it once in App.tsx), and a counter the instance manager watches to reload
 * its file lists after a fix disabled mods or reset a config.
 */
export interface CrashDiagnosisTarget {
  modpackId: string;
  name: string;
  mcVersion?: string;
  loaderType?: string;
}

interface CrashDiagnosisState {
  target: CrashDiagnosisTarget | null;
  fixesApplied: number;
}

export const useCrashDiagnosis = create<CrashDiagnosisState>(() => ({ target: null, fixesApplied: 0 }));

export function openCrashDiagnosis(target: CrashDiagnosisTarget) {
  useCrashDiagnosis.setState({ target });
}

export function closeCrashDiagnosis() {
  useCrashDiagnosis.setState({ target: null });
}

export function noteCrashFixApplied() {
  useCrashDiagnosis.setState((s) => ({ fixesApplied: s.fixesApplied + 1 }));
}

/** From the 3rd crash in a row ("más de dos veces") the player is asked about a diagnosis. */
export const CRASHES_BEFORE_ASKING = 3;
