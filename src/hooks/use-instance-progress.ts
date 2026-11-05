import { useEffect, useState, useSyncExternalStore } from "react";
import { useInstanceRunState, isRunStateBusy, isInstancePending } from "@/hooks/use-instance-run-state";
import { onInstallProgress, onLaunchStatus, type InstanceProgressEvent } from "@/services/electron";

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
  /** What it's doing right now ("Descargando Minecraft 1.20.1"), from main. */
  label?: string;
  /** 0..1 of the current phase only (the label's %), null when it has no real measure. */
  phaseProgress?: number | null;
  /** 0..1 of the whole operation (the bar), or null when there's no real measure. */
  progress: number | null;
  /** Launch after an update: the part of the bar the update already filled. */
  progressOffset?: number;
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

/**
 * "Actualizar y jugar" is one operation with one bar: the update fills the
 * first part and the launch the rest, instead of each going 0 → 100. It's an
 * update the renderer started inside a launch flow (setInstancePending).
 */
const UPDATE_SHARE_BEFORE_LAUNCH = 0.5;
const chained = new Set<string>();

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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The event's whole-operation 0..1 (older flows only send a 0..100 `progress`). */
function overallOf(d: InstanceProgressEvent): number | null {
  if (typeof d.overallProgress === "number") return clamp01(d.overallProgress);
  if (typeof d.progress === "number") return clamp01(d.progress / 100);
  return null;
}

function phaseOf(d: InstanceProgressEvent): number | null {
  return typeof d.phaseProgress === "number" ? clamp01(d.phaseProgress) : null;
}

/**
 * Whether this event starts a new operation instead of continuing `prev` — an
 * install that failed leaves its entry unfinished (no event says so), so main's
 * first phase also counts as a fresh start.
 */
function startsNew(prev: InstanceProgress | undefined, kind: ProgressKind, firstStage: string, d: InstanceProgressEvent) {
  if (!prev || prev.doneAt || prev.errorAt || prev.kind !== kind) return true;
  return d.stage === firstStage && prev.stage !== firstStage;
}

/** Never lets the bar go backwards within one operation. */
function forward(prev: InstanceProgress | undefined, p: number | null): number | null {
  if (p === null || !prev || prev.progress === null) return p;
  return Math.max(prev.progress, p);
}

function ensureStarted() {
  if (started) return;
  started = true;
  onInstallProgress((d) => {
    if (!d?.modpackId) return;
    const id = d.modpackId;
    const prev = state[id];
    const fresh = startsNew(prev, "install", "checking", d);
    // First event of a new install: is it the update half of "actualizar y jugar"?
    if (fresh) {
      if (isInstancePending(id)) chained.add(id);
      else chained.delete(id);
    }
    const chain = chained.has(id);
    const overall = overallOf(d);
    const scaled = overall === null ? null : chain ? overall * UPDATE_SHARE_BEFORE_LAUNCH : overall;
    if (d.stage === "done") {
      update(id, chain
        // The launch picks up from here: no "Actualizado" check in between.
        ? { kind: "install", stage: "done", label: "Preparando", phaseProgress: null, progress: UPDATE_SHARE_BEFORE_LAUNCH }
        : { kind: "install", stage: "done", label: d.label, phaseProgress: 1, progress: 1, doneAt: performance.now() });
      return;
    }
    update(id, { kind: "install", stage: d.stage, label: d.label, phaseProgress: phaseOf(d), progress: fresh ? scaled : forward(prev, scaled) });
  });
  onLaunchStatus((d) => {
    if (!d?.modpackId) return;
    const id = d.modpackId;
    const prev = state[id];
    // The update of the same "actualizar y jugar" ended just before.
    const chain = chained.has(id) && prev?.kind === "install" && prev.stage === "done" && !prev.doneAt;
    chained.delete(id);
    if (d.stage === "error") {
      update(id, {
        kind: "launch",
        stage: "error",
        label: prev?.label,
        progress: prev?.progress ?? null,
        errorAt: performance.now(),
        error: d.message,
      });
      return;
    }
    const overall = overallOf(d);
    const fresh = !chain && startsNew(prev, "launch", "preparing", d);
    // Where the launch's own 0..1 starts on the bar (after the update, if chained).
    const base = chain ? UPDATE_SHARE_BEFORE_LAUNCH : fresh ? 0 : prev?.progressOffset ?? 0;
    const p = overall === null ? null : base + (1 - base) * overall;
    update(id, {
      kind: "launch",
      stage: d.stage,
      label: d.label,
      phaseProgress: phaseOf(d),
      progress: fresh ? p : forward(prev, p) ?? prev?.progress ?? null,
      progressOffset: base,
    });
  });
  // The game window is up → the launch went well.
  api?.onInstanceRunState?.((runStates: Record<string, string>) => {
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
