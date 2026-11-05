import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

interface Geo {
  top: number;
  height: number;
  right: number;
  thumbTop: number;
  thumbH: number;
}

/**
 * A scrollbar of our own for a scroll container whose top part is covered by a
 * sticky band (the instance manager's tabs + filters): the track starts below
 * that band, next to the list, instead of running the container's full height.
 * The app hides native scrollbars everywhere (index.css), and Chromium no longer
 * lets ::-webkit-scrollbar-track be inset once `scrollbar-width` is set.
 *
 * Render it inside a positioned element that also contains the scroll container;
 * it places itself over the container's right edge. Drag the thumb, or click the
 * track to jump there.
 */
export function ListScrollbar({
  scrollRef,
  bandRefs,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  /** Sticky elements at the top of the container: the track starts below the lowest one. */
  bandRefs: RefObject<HTMLElement | null>[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const frame = useRef(0);
  // The caller passes a new array each render: read it through a ref so the
  // listeners below aren't torn down and re-attached on every parent render.
  const bands = useRef(bandRefs);
  bands.current = bandRefs;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    const host = trackRef.current?.offsetParent;
    if (!el || !(host instanceof HTMLElement)) return setGeo(null);
    const maxScroll = el.scrollHeight - el.clientHeight;
    const elRect = el.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    let bandBottom = elRect.top + 1; // no band: just inside the card's top border
    for (const ref of bands.current) {
      const node = ref.current;
      if (node && node.isConnected && el.contains(node)) bandBottom = Math.max(bandBottom, node.getBoundingClientRect().bottom);
    }
    // Rail from right under the band down to the card's bottom border, no gaps.
    const top = bandBottom - hostRect.top;
    const height = elRect.bottom - 1 - hostRect.top - top;
    if (maxScroll <= 1 || height < 48) return setGeo(null);
    const thumbH = Math.max(28, Math.round((height * el.clientHeight) / el.scrollHeight));
    const thumbTop = Math.round((Math.min(el.scrollTop, maxScroll) / maxScroll) * (height - thumbH));
    // right: flush against the card's border (inside its 1px).
    setGeo({ top, height, right: hostRect.right - elRect.right + 1, thumbTop, thumbH });
  }, [scrollRef]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    schedule();
    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The container's size, and its content's (views switching, the band folding, lists loading).
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const mo = new MutationObserver(() => {
      if (el.firstElementChild) ro.observe(el.firstElementChild);
      schedule();
    });
    mo.observe(el, { childList: true });
    return () => {
      cancelAnimationFrame(frame.current);
      el.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollRef, schedule]);

  const drag = useRef<{ startY: number; startScroll: number; id: number } | null>(null);

  const onThumbDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startScroll: el.scrollTop, id: e.pointerId };
  };
  const onThumbMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el || !geo || drag.current?.id !== e.pointerId) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const travel = Math.max(1, geo.height - geo.thumbH);
    el.scrollTop = drag.current.startScroll + ((e.clientY - drag.current.startY) * maxScroll) / travel;
  };
  const onThumbUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onTrackDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !geo || !track) return;
    const y = e.clientY - track.getBoundingClientRect().top - geo.thumbH / 2;
    const ratio = Math.min(1, Math.max(0, y / Math.max(1, geo.height - geo.thumbH)));
    el.scrollTo({ top: ratio * (el.scrollHeight - el.clientHeight), behavior: "smooth" });
  };

  return (
    <div
      ref={trackRef}
      aria-hidden
      onPointerDown={onTrackDown}
      className={cn(
        "group absolute z-20 w-2 transition-opacity duration-200",
        geo ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      style={geo ? { top: geo.top, height: geo.height, right: geo.right } : { top: 0, height: 0, right: 0 }}
    >
      {geo && (
        <div
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
          className="absolute right-0 w-1.5 bg-accent/40 transition-[background-color,width] group-hover:w-2 group-hover:bg-accent/60 active:bg-accent/80"
          style={{ top: geo.thumbTop, height: geo.thumbH }}
        />
      )}
    </div>
  );
}
