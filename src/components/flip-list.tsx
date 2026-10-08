import { useLayoutEffect, useRef } from "react";

const DURATION_MS = 280;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * A list whose rows glide to their new place when the order changes (FLIP:
 * remember where each row was, let React reorder, then animate each one from
 * its old offset back to zero with a transform — compositor-only, no layout
 * work per frame).
 *
 * Kept cheap for long lists (200+ mods): it only measures when `orderKey`
 * changes, and only animates rows that are on screen before or after the move;
 * a row coming from far away starts at most one screen off instead of flying
 * across the whole list. Rows that weren't in the list before just fade in.
 * Children must carry `data-flip-key`. Honors "reduce motion".
 */
export function FlipList({
  orderKey,
  className,
  children,
}: {
  /** Changes whenever the order (or membership) of the rows changes. */
  orderKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const tops = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rows = Array.from(el.children) as HTMLElement[];
    const next = new Map<string, number>();
    for (const row of rows) {
      const key = row.dataset.flipKey;
      if (key) next.set(key, row.offsetTop);
    }
    const prev = tops.current;
    tops.current = next;
    if (prev.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Viewport, in the container's own coordinates (offsetTop is relative to it).
    const viewTop = -el.getBoundingClientRect().top;
    const viewBottom = viewTop + window.innerHeight;
    const screen = window.innerHeight;

    for (const row of rows) {
      const key = row.dataset.flipKey;
      if (!key) continue;
      const newTop = next.get(key)!;
      const height = row.offsetHeight;
      const visibleNow = newTop + height > viewTop && newTop < viewBottom;
      const oldTop = prev.get(key);
      if (oldTop === undefined) {
        if (visibleNow) row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
        continue;
      }
      const dy = oldTop - newTop;
      if (dy === 0) continue;
      const wasVisible = oldTop + height > viewTop && oldTop < viewBottom;
      if (!visibleNow && !wasVisible) continue;
      const from = Math.max(-screen, Math.min(screen, dy));
      row.animate([{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }], {
        duration: DURATION_MS,
        easing: EASING,
      });
    }
  }, [orderKey]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      {children}
    </div>
  );
}
