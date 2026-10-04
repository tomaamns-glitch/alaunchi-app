import { useSyncExternalStore } from "react";

/**
 * Per-instance run state, shared by EVERY Play button of the same instance (home
 * carousel, hub tile, instance manager, profile panels...). The main process is the
 * source of truth (`instances:run-state` in main.js) — it owns the op lock and the
 * pid of each running game. On top of that the renderer adds "pending" for the gaps
 * main can't see (refreshing the Microsoft token right before `mc:launch`), so a
 * button never flashes back to "Jugar" mid-launch.
 *
 *   idle       → "Jugar"
 *   pending / installing / launching / starting → spinner, disabled
 *   running    → "Cerrar" (closes that instance's Minecraft window)
 *   stopping   → spinner "Cerrando..."
 */
export type InstanceRunState =
  | "idle"
  | "pending"
  | "installing"
  | "launching"
  | "starting"
  | "running"
  | "stopping";

const api = (window as any).electronAPI;

let mainState: Record<string, InstanceRunState> = {};
const pending = new Set<string>();
const listeners = new Set<() => void>();
let started = false;

function emit() {
  for (const l of listeners) l();
}

function ensureStarted() {
  if (started || !api?.onInstanceRunState) return;
  started = true;
  api.onInstanceRunState((state: Record<string, InstanceRunState>) => {
    mainState = state || {};
    emit();
  });
  api.getInstanceRunState?.()
    .then((state: Record<string, InstanceRunState>) => {
      mainState = state || {};
      emit();
    })
    .catch(() => {});
}

function subscribe(listener: () => void) {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstanceRunState(modpackId: string): InstanceRunState {
  return mainState[modpackId] ?? (pending.has(modpackId) ? "pending" : "idle");
}

/** Marks a launch the renderer is preparing (before main has taken the op lock). */
export function setInstancePending(modpackId: string, value: boolean) {
  if (value ? pending.has(modpackId) : !pending.has(modpackId)) return;
  if (value) pending.add(modpackId);
  else pending.delete(modpackId);
  emit();
}

export function useInstanceRunState(modpackId: string | undefined): InstanceRunState {
  return useSyncExternalStore(subscribe, () => (modpackId ? getInstanceRunState(modpackId) : "idle"));
}

export function isRunStateBusy(state: InstanceRunState) {
  return state !== "idle" && state !== "running";
}

/** Short label for the in-progress states (spinner text). */
export function runStateBusyLabel(state: InstanceRunState): string {
  switch (state) {
    case "installing":
      return "Actualizando...";
    case "stopping":
      return "Cerrando...";
    case "starting":
      return "Abriendo Minecraft...";
    default:
      return "Iniciando...";
  }
}

export async function stopInstance(modpackId: string): Promise<void> {
  if (!api?.stopInstance) return;
  await api.stopInstance({ modpackId });
}
