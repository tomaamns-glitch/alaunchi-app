import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, RotateCw } from "lucide-react";
import "./call-chip.css";

/**
 * Call Chip, adapted from React Bits (https://reactbits.dev/micro/call-chip,
 * MIT + Commons Clause): a pill with a tool icon, a name, an argument and a
 * timer, a fill that crawls while it runs, a green wipe + check when done and
 * a shake + retry glyph on error. Changes from the original: lucide icons
 * instead of hugeicons, `progress` (0..1) to drive the fill with a real value,
 * and `startedAt` so a chip that remounts mid-operation keeps its timer.
 */
export type CallChipStatus = "idle" | "running" | "done" | "error";

const HOLD_AT = 0.9;
const SHAKE = [0, -1, 1, -0.66, 0.66, -0.33, 0];

const fmt = (ms: number) => {
  if (ms < 10000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const glyphOf = (s: CallChipStatus) => (s === "done" ? "check" : s === "error" ? "retry" : "tool");

export interface CallChipProps {
  icon: ReactNode;
  name: string;
  argument?: string;
  status?: CallChipStatus;
  /** Real progress (0..1). Without it the fill crawls to 90% over `expectedMs`. */
  progress?: number | null;
  expectedMs?: number;
  /** performance.now() of when the operation started (keeps the timer across remounts). */
  startedAt?: number;
  size?: number;
  radius?: number;
  color?: string;
  surfaceColor?: string;
  progressColor?: string;
  progressOpacity?: number;
  doneColor?: string;
  errorColor?: string;
  washOpacity?: number;
  shake?: number;
  showTimer?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function CallChip({
  icon,
  name,
  argument = "",
  status = "running",
  progress = null,
  expectedMs = 2500,
  startedAt,
  size = 34,
  radius = 10,
  color = "currentColor",
  surfaceColor = "#27272a",
  progressColor = "currentColor",
  progressOpacity = 0.08,
  doneColor = "#22c55e",
  errorColor = "#ef4444",
  washOpacity = 0.14,
  shake = 6,
  showTimer = true,
  className = "",
  style,
}: CallChipProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);
  const fraction = useRef(0);
  const clock = useRef({ ms: 0 });
  const shakeAnim = useRef<Animation | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [mounted, setMounted] = useState(false);
  const roll = useRef<{ cur: string; prev: string | null }>({ cur: glyphOf(status), prev: null });
  if (glyphOf(status) !== roll.current.cur) roll.current = { cur: glyphOf(status), prev: roll.current.cur };

  const measured = progress !== null && progress !== undefined;

  const setFraction = (f: number, instant: boolean) => {
    const fill = fillRef.current;
    if (!fill) return;
    fraction.current = f;
    if (instant) fill.style.transition = "none";
    fill.style.transform = `scaleX(${f})`;
    if (instant) {
      void fill.getBoundingClientRect();
      fill.style.transition = "";
    }
  };
  const apply = (s: CallChipStatus, animate: boolean) => {
    if (s === "running") {
      shakeAnim.current?.cancel();
      const p = progressRef.current;
      if (p !== null && p !== undefined) {
        setFraction(Math.min(1, Math.max(0, p)), !animate);
        return;
      }
      setFraction(0, true);
      if (animate) setFraction(HOLD_AT, false);
    } else if (s === "done") {
      setFraction(1, !animate);
    } else if (s === "error") {
      const fill = fillRef.current;
      const live = fill ? new DOMMatrix(getComputedStyle(fill).transform).a : fraction.current;
      setFraction(Math.min(1, Math.max(0, live)), true);
      if (animate && shake > 0 && !reduceMotion() && rootRef.current) {
        shakeAnim.current = rootRef.current.animate(
          SHAKE.map((k) => ({ transform: `translateX(${k * shake}px)`, easing: "cubic-bezier(0.77, 0, 0.175, 1)" })),
          { duration: 450, composite: "add" }
        );
      }
    } else setFraction(0, true);
  };

  useEffect(() => {
    mountedRef.current = true;
    setMounted(true);
    apply(statusRef.current, statusRef.current === "running");
    return () => {
      mountedRef.current = false;
      shakeAnim.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (mountedRef.current) apply(status, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  // Real progress moves while still "running".
  useLayoutEffect(() => {
    if (mountedRef.current && statusRef.current === "running" && measured) setFraction(Math.min(1, Math.max(0, progress!)), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  useEffect(() => {
    const write = (ms: number) => {
      clock.current.ms = ms;
      if (timerRef.current) timerRef.current.textContent = fmt(ms);
    };
    if (status !== "running") {
      if ((status === "idle" || !clock.current.ms) && timerRef.current) timerRef.current.textContent = "—";
      return undefined;
    }
    const origin = startedAt ?? performance.now();
    write(performance.now() - origin);
    if (reduceMotion()) {
      const id = setInterval(() => write(performance.now() - origin), 100);
      return () => {
        clearInterval(id);
        write(performance.now() - origin);
      };
    }
    let raf = 0;
    const tick = () => {
      write(performance.now() - origin);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      write(performance.now() - origin);
    };
  }, [status, startedAt]);

  // Capped so a big chip (the home Play button) still fits "Actualizando 100% 1m 05s".
  const font = Math.min(17, Math.max(11, Math.round(size * 0.38)));
  const glyphState = (g: string) => (g === roll.current.cur ? "in" : g === roll.current.prev ? "out" : undefined);

  return (
    <span
      ref={rootRef}
      role="status"
      aria-busy={status === "running" || undefined}
      aria-label={`${name} ${argument}`.trim()}
      data-status={status}
      data-measured={measured ? "" : undefined}
      data-mounted={mounted ? "" : undefined}
      className={`call-chip${className ? ` ${className}` : ""}`}
      style={
        {
          "--cc-size": `${size}px`,
          "--cc-font": `${font}px`,
          "--cc-pad": `${Math.round(size * 0.35)}px`,
          "--cc-gap": `${Math.round(font * 0.55)}px`,
          "--cc-radius": `${radius}px`,
          "--cc-color": color,
          "--cc-surface": surfaceColor,
          "--cc-progress": progressColor,
          "--cc-progress-pct": `${progressOpacity * 100}%`,
          "--cc-done": doneColor,
          "--cc-error": errorColor,
          "--cc-wash-pct": `${washOpacity * 100}%`,
          "--cc-expected": `${expectedMs}ms`,
          ...style,
        } as CSSProperties
      }
    >
      <span ref={fillRef} className="call-chip__fill" aria-hidden="true" />
      <span className="call-chip__slot" aria-hidden="true">
        <span className="call-chip__glyph" data-state={glyphState("tool")}>
          {icon}
        </span>
        <span className="call-chip__glyph" data-state={glyphState("check")}>
          <Check strokeWidth={2.6} />
        </span>
        <span className="call-chip__glyph" data-state={glyphState("retry")}>
          <RotateCw strokeWidth={2.2} />
        </span>
      </span>
      <span className="call-chip__name" aria-hidden="true">
        {name}
      </span>
      {argument && (
        <span className="call-chip__arg" aria-hidden="true">
          {argument}
        </span>
      )}
      {showTimer ? (
        <span ref={timerRef} className="call-chip__timer" aria-hidden="true">
          0 ms
        </span>
      ) : null}
    </span>
  );
}
