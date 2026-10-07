import { useEffect, useState, useSyncExternalStore } from "react";
import { useInstanceRunState, isRunStateBusy } from "@/hooks/use-instance-run-state";

/**
 * What an instance is doing right now (downloading, updating, opening), from
 * main's `install-progress` / `launch-status` events and its run state — shared
 * by every Play button of the instance, like use-instance-run-state.ts, so they
 * all show the same chip (components/instance-progress-chip.tsx).
 */
export type ProgressKind = "install" | "launch";

export interface InstanceProgress {
  kind: ProgressKind;
  stage: string;
  /** 0..1, or null when there's no real measure for this stage. */
  progress: number | null;
  /** performance.now() of the operation's start. */
  startedAt: number;
  /** performance.now() when it finished well / failed — the chip holds that look for a moment. */
  doneAt?: number;
  errorAt?: number;
  error?: string;
}

/** How long a finished chip stays up (check / error) before the button comes back. */
export const DONE_HOLD_MS = 1400;
export const ERROR_HOLD_MS = 3000;

const LAUNCH_PROGRESS: Record<string, number> = {
  preparing: 0.05,
  downloading_client: 0.2,
  downloading_assets: 0.5,
  downloading_libraries: 0.7,
  installing_loader: 0.85,
  extracting_natives: 0.92,
  installing_java: 0.94,
  launching: 0.97,
  launched: 0.99,
};

const api = (window as any).electronAPI;
let state: Record<string, InstanceProgress> = {};
const listeners = new Set<() => void>();
let started = false;

function emit() {
  state = { ...state };
  for (const l of listeners) l();
}

/** A new event for `id`: continue its operation, or start a new one if the last finished a while ago. */
function update(id: string, next: Omit<InstanceProgress, "startedAt">) {
  const now = performance.now();
  const prev = state[id];
  const finished = prev && (prev.doneAt || prev.errorAt);
  // "Actualizar y jugar" is one operation: the launch right after an update keeps the clock.
  const keepClock = prev && (!finished || now - (prev.doneAt ?? prev.errorAt ?? 0) < 3000);
  state[id] = { ...next, startedAt: keepClock ? prev.startedAt : now };
  emit();
}

function ensureStarted() {
  if (started || !api) return;
  started = true;
  api.onInstallProgress?.((d: any) => {
    if (!d?.modpackId) return;
    const pct = typeof d.progress === "number" ? Math.min(1, Math.max(0, d.progress / 100)) : null;
    update(d.modpackId, {
      kind: "install",
      stage: d.stage,
      progress: d.stage === "done" ? 1 : pct,
      ...(d.stage === "done" ? { doneAt: performance.now() } : {}),
    });
  });
  api.onLaunchStatus?.((d: any) => {
    if (!d?.modpackId) return;
    if (d.stage === "error") {
      const prev = state[d.modpackId];
      update(d.modpackId, {
        kind: "launch",
        stage: "error",
        progress: prev?.progress ?? null,
        errorAt: performance.now(),
        error: d.message,
      });
      return;
    }
    const javaPct = d.stage === "installing_java" && typeof d.progress === "number" ? d.progress / 100 : null;
    update(d.modpackId, {
      kind: "launch",
      stage: d.stage,
      progress: javaPct ?? LAUNCH_PROGRESS[d.stage] ?? null,
    });
  });
  // The game window is up → the launch went well.
  api.onInstanceRunState?.((runStates: Record<string, string>) => {
    let changed = false;
    for (const [id, p] of Object.entries(state)) {
      if (p.doneAt || p.errorAt) continue;
      if (runStates?.[id] === "running" && p.kind === "launch") {
        state[id] = { ...p, stage: "launched", progress: 1, doneAt: performance.now() };
        changed = true;
      }
    }
    if (changed) emit();
  });
}

function subscribe(l: () => void) {
  ensureStarted();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useInstanceProgressEntry(id: string | undefined): InstanceProgress | undefined {
  return useSyncExternalStore(subscribe, () => (id ? state[id] : undefined));
}

/**
 * Whether the instance's chip should be showing, and its entry. Also true for a
 * moment after the operation ends, so the green check / the error get seen.
 */
export function useInstanceProgress(id: string | undefined) {
  const entry = useInstanceProgressEntry(id);
  const runState = useInstanceRunState(id);
  const busy = isRunStateBusy(runState);
  const [, force] = useState(0);
  const now = performance.now();
  const holdingDone = !!entry?.doneAt && now - entry.doneAt < DONE_HOLD_MS;
  const holdingError = !!entry?.errorAt && now - entry.errorAt < ERROR_HOLD_MS;
  const holdLeft = holdingDone
    ? DONE_HOLD_MS - (now - entry!.doneAt!)
    : holdingError
      ? ERROR_HOLD_MS - (now - entry!.errorAt!)
      : 0;

  // Re-render when the hold runs out.
  useEffect(() => {
    if (holdLeft <= 0) return;
    const t = setTimeout(() => force((n) => n + 1), holdLeft + 20);
    return () => clearTimeout(t);
  }, [holdLeft > 0, entry?.doneAt, entry?.errorAt]);

  // An entry left over from a finished operation means nothing for a new one.
  const live = busy && entry && !entry.doneAt && !entry.errorAt ? entry : undefined;
  return {
    runState,
    entry: holdingDone || holdingError ? entry : live,
    /** True while busy or holding the end result. */
    active: busy || holdingDone || holdingError,
    status: (holdingError ? "error" : holdingDone && !busy ? "done" : "running") as "running" | "done" | "error",
  };
}
