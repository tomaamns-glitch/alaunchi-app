import { useEffect, useRef } from "react";
import { isVideoBanner } from "@/services/banner";

/**
 * A profile banner: an <img>, or — for the bundled video presets — a muted,
 * looping <video>. Videos only play while on screen (lists show one per row),
 * and start from a still first frame so nothing flashes while they load.
 */
export function BannerMedia({
  src,
  className,
  draggable,
}: {
  src: string;
  className?: string;
  draggable?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const video = isVideoBanner(src);

  useEffect(() => {
    const v = ref.current;
    if (!video || !v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [video, src]);

  if (!video) return <img src={src} alt="" draggable={draggable} className={className} />;
  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden
      className={className}
    />
  );
}
