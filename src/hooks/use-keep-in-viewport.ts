import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * For a popup positioned `absolute left-0` against its anchor (e.g. the chat
 * window over the footer's bubble row): how far to move it left so it doesn't
 * run past the window's right edge — it then opens towards the left instead.
 * Never moves it past the left edge either. Re-measured on window resize.
 *
 * Use as `style={{ left: shift }}` on the popup.
 */
export function useKeepInViewport(ref: RefObject<HTMLElement | null>, active: boolean, margin = 12): number {
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!active) {
      setShift(0);
      return;
    }
    const measure = () => {
      const el = ref.current;
      const anchor = el?.offsetParent as HTMLElement | null;
      if (!el || !anchor) return;
      const anchorLeft = anchor.getBoundingClientRect().left;
      // offsetWidth, not the rect: the opening animation scales the popup.
      const overflow = anchorLeft + el.offsetWidth - (window.innerWidth - margin);
      const room = Math.max(0, anchorLeft - margin);
      setShift(overflow > 0 ? -Math.min(overflow, room) : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, ref, margin]);

  return shift;
}
