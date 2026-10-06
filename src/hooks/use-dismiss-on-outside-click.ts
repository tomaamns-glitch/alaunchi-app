import { useEffect, useRef } from "react";

// Things portaled to <body> that still belong to the popup (its own menus,
// dialogs it opened, toasts) — a click there must not count as "outside".
const KEEP_OPEN_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[data-sonner-toaster]",
  "[data-keep-popups-open]",
].join(",");

/**
 * Calls `onDismiss` on any pointerdown outside `refs` while `enabled`.
 *
 * Footer popups used to rely on a `fixed inset-0` backdrop button, but the
 * footer has `backdrop-blur` — and `backdrop-filter` makes an element the
 * containing block of its fixed descendants, so that "full-screen" backdrop only
 * ever covered the footer itself: clicking the carousel (or anything above the
 * footer) never closed the popup. A document listener doesn't care about that.
 */
export function useDismissOnOutsideClick(
  refs: React.RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  enabled: boolean,
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || !target.isConnected) return;
      if (refsRef.current.some((r) => r.current?.contains(target))) return;
      if (target.closest(KEEP_OPEN_SELECTOR)) return;
      // A modal opened on top (e.g. an image lightbox from the chat): clicking
      // its dimmed overlay closes the modal, not the popup underneath.
      if (document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']")) return;
      onDismissRef.current();
    };
    // Capture phase: runs even if something inside stops propagation.
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [enabled]);
}
