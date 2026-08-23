import { useEffect, useRef } from "react";
import { SkinViewer, WalkingAnimation } from "skinview3d";

interface SkinViewer3DProps {
  skinUrl: string;
  capeUrl?: string | null;
  variant?: "slim" | "classic" | "auto-detect";
  width?: number;
  height?: number;
  className?: string;
}

/** A live, rotatable 3D render of a Minecraft skin, walking in place. Drag to spin it. */
export function SkinViewer3D({
  skinUrl,
  capeUrl,
  variant = "auto-detect",
  width = 150,
  height = 210,
  className,
}: SkinViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  // The viewer instance itself is created once and reused — swapping skin/cape
  // textures below (instead of recreating it) keeps the walking progress and
  // whatever rotation the user dragged to, instead of resetting on every change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const animation = new WalkingAnimation();
    animation.speed = 0.8;
    const viewer = new SkinViewer({ canvas, width, height, animation, enableControls: true });
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [width, height]);

  useEffect(() => {
    if (!skinUrl) return;
    // skinview3d/Mojang naming mismatch: the app (and Mojang's own API) call the
    // non-slim model "classic", but skinview-utils' ModelType calls it "default".
    const model = variant === "classic" ? "default" : variant;
    viewerRef.current?.loadSkin(skinUrl, { model }).catch(() => {});
  }, [skinUrl, variant]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (capeUrl) viewer.loadCape(capeUrl).catch(() => {});
    else viewer.loadCape(null);
  }, [capeUrl]);

  return <canvas ref={canvasRef} className={className} />;
}
