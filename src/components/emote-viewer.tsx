import { Hint } from "@/components/hint";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Vector3,
  type Box3,
} from "three";
import { SkinViewer } from "skinview3d";
import { Pause, Play, RotateCcw } from "lucide-react";
import { EmoteAnimation } from "@/lib/emote-animation";
import type { ParsedEmote } from "@/lib/emotecraft";
import { cn } from "@/lib/utils";

interface EmoteViewerProps {
  skinUrl: string;
  emote: ParsedEmote;
  width: number;
  height: number;
  /** Just the animated player (chat picker): no timeline or buttons. */
  compact?: boolean;
  className?: string;
}

const SPEEDS = [0.5, 1, 2] as const;
/** skinview3d units: 16 = one block. The player's feet sit at y = -16. */
const FLOOR_Y = -16;
/** Camera angle: a little to the side and from slightly above, so lying and
 *  crouched poses read as clearly as standing ones. */
const VIEW_YAW = 0.42;
const VIEW_PITCH = 0.26;

function accentColor(): Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const color = new Color("#e8862a");
  if (raw) {
    try {
      color.setStyle(`hsl(${raw.split(/\s+/).join(", ")})`);
    } catch {
      /* keep the fallback */
    }
  }
  return color;
}

/** A floor of faint block-sized tiles that fades out, with a soft shadow in
 *  the middle — one canvas texture on one disc. */
function makeFloor(radius: number, center: Vector3): Mesh {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const px = size / (radius * 2);
  const accent = accentColor();
  const rgb = `${Math.round(accent.r * 255)}, ${Math.round(accent.g * 255)}, ${Math.round(accent.b * 255)}`;

  // Block grid, aligned so a line runs under the player's feet.
  ctx.strokeStyle = `rgba(${rgb}, 0.55)`;
  ctx.lineWidth = 1.5;
  const cell = 16 * px;
  const offX = (size / 2 - (center.x % 16) * px - 8 * px) % cell;
  const offZ = (size / 2 - (center.z % 16) * px - 8 * px) % cell;
  ctx.beginPath();
  for (let x = offX; x <= size; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
  }
  for (let z = offZ; z <= size; z += cell) {
    ctx.moveTo(0, z);
    ctx.lineTo(size, z);
  }
  ctx.stroke();
  // Fade the grid out towards the rim.
  ctx.globalCompositeOperation = "destination-in";
  const fade = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fade.addColorStop(0, "rgba(0,0,0,0.9)");
  fade.addColorStop(0.55, "rgba(0,0,0,0.35)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  // Contact shadow.
  ctx.globalCompositeOperation = "source-over";
  const shadowR = Math.min(size / 2, 14 * px);
  const shadow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, shadowR);
  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  const mesh = new Mesh(
    new CircleGeometry(radius, 64),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, FLOOR_Y - 0.05, center.z);
  mesh.renderOrder = -1;
  return mesh;
}

function formatSeconds(ticks: number): string {
  return `${(ticks / 20).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** Plays a parsed .emotecraft on the player's skin, exactly as Minecraft does
 *  (see emote-animation.ts), framed so the whole emote stays in view. */
export function EmoteViewer({ skinUrl, emote, width, height, compact = false, className }: EmoteViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const animRef = useRef<EmoteAnimation | null>(null);
  /** Whole emote (lead-in included) and, for looping emotes, just the loop. */
  const boundsRef = useRef<{ all: Box3; loop: Box3 | null } | null>(null);
  /** Camera move in progress (to the loop's framing once the loop starts). */
  const tweenRef = useRef<{ fromTarget: Vector3; fromDist: number; toTarget: Vector3; toDist: number; start: number } | null>(null);
  const loopFramedRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  /** Camera distance that fits the box's 8 corners in the frustum when looking
   *  from `back` — much tighter than a bounding sphere for a lying or a tall,
   *  thin pose. */
  const fitDistance = useCallback(
    (viewer: SkinViewer, box: Box3, back: Vector3) => {
      const center = box.getCenter(new Vector3());
      const tanV = Math.tan((viewer.camera.fov * Math.PI) / 360);
      const tanH = tanV * viewer.camera.aspect;
      const right = new Vector3(0, 1, 0).cross(back).normalize();
      const up = back.clone().cross(right);
      let distance = 0;
      const corner = new Vector3();
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
        const toward = corner.dot(back);
        distance = Math.max(distance, toward + Math.abs(corner.dot(right)) / tanH, toward + Math.abs(corner.dot(up)) / tanV);
      }
      return Math.max(distance, 24) * (compact ? 1.02 : 1.05);
    },
    [compact]
  );

  /** Back to the default angle, framing what's playing now. */
  const frameCamera = useCallback(() => {
    const viewer = viewerRef.current;
    const bounds = boundsRef.current;
    const anim = animRef.current;
    if (!viewer || !bounds || !anim) return;
    const box = bounds.loop && loopFramedRef.current ? bounds.loop : bounds.all;
    const back = new Vector3(
      Math.sin(VIEW_YAW) * Math.cos(VIEW_PITCH),
      Math.sin(VIEW_PITCH),
      Math.cos(VIEW_YAW) * Math.cos(VIEW_PITCH)
    );
    const center = box.getCenter(new Vector3());
    const distance = fitDistance(viewer, box, back);
    tweenRef.current = null;
    viewer.controls.target.copy(center);
    viewer.camera.position.copy(back).multiplyScalar(distance).add(center);
    const radius = bounds.all.getSize(new Vector3()).length() / 2;
    viewer.controls.minDistance = Math.max(10, radius * 0.6);
    viewer.controls.maxDistance = fitDistance(viewer, bounds.all, back) * 2.5;
    viewer.controls.update();
  }, [fitDistance]);

  // Viewer: created once per size; the emote/skin effects below plug into it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new SkinViewer({ canvas, width, height, enableControls: true, fov: 40 });
    viewer.controls.enablePan = false;
    viewer.controls.enableDamping = true;
    viewer.controls.dampingFactor = 0.12;
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [width, height]);

  useEffect(() => {
    viewerRef.current?.loadSkin(skinUrl).catch(() => {});
  }, [skinUrl, width, height]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const anim = new EmoteAnimation(emote);
    animRef.current = anim;
    const all = EmoteAnimation.bounds(emote, viewer.playerObject, "all");
    const loop = emote.isLoop ? EmoteAnimation.bounds(emote, viewer.playerObject, "loop") : null;
    // Always frame the floor too, so a jump reads as a jump.
    for (const box of [all, loop]) box?.expandByPoint(new Vector3(box.min.x, FLOOR_Y, box.min.z));
    boundsRef.current = { all, loop };
    loopFramedRef.current = false;
    const center = all.getCenter(new Vector3());
    const floorRadius = Math.max(28, Math.hypot(all.max.x - all.min.x, all.max.z - all.min.z) / 2 + 20);
    const floor = makeFloor(floorRadius, center);
    viewer.scene.add(floor);
    viewer.animation = anim;
    frameCamera();
    setPlaying(true);
    return () => {
      viewer.scene.remove(floor);
      floor.geometry.dispose();
      const mat = floor.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      viewer.animation = null;
      animRef.current = null;
      tweenRef.current = null;
    };
  }, [emote, width, height, frameCamera]);

  useEffect(() => {
    if (animRef.current) animRef.current.paused = !playing;
  }, [playing, emote]);

  useEffect(() => {
    if (animRef.current) animRef.current.speed = speed;
  }, [speed, emote]);

  // Per frame, outside React: the timeline (written straight to the DOM) and
  // the camera easing in on the loop once the lead-in is over.
  useEffect(() => {
    let id = 0;
    const tick = (now: number) => {
      const anim = animRef.current;
      const viewer = viewerRef.current;
      const bounds = boundsRef.current;
      if (anim && viewer && bounds) {
        if (bounds.loop && !loopFramedRef.current && anim.progress * 20 >= emote.endTick + 1) {
          loopFramedRef.current = true;
          const target = viewer.controls.target.clone();
          const back = viewer.camera.position.clone().sub(target);
          const toTarget = bounds.loop.getCenter(new Vector3());
          tweenRef.current = {
            fromTarget: target,
            fromDist: back.length(),
            toTarget,
            toDist: fitDistance(viewer, bounds.loop, back.normalize()),
            start: now,
          };
        }
        const tw = tweenRef.current;
        if (tw) {
          const t = Math.min(1, (now - tw.start) / 900);
          const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          // Keep whatever angle the player has dragged to; only move in.
          const back = viewer.camera.position.clone().sub(viewer.controls.target).normalize();
          viewer.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
          viewer.camera.position
            .copy(back)
            .multiplyScalar(tw.fromDist + (tw.toDist - tw.fromDist) * k)
            .add(viewer.controls.target);
          if (t >= 1) tweenRef.current = null;
        }
        if (!compact) {
          const total = anim.totalTicks;
          const cur = anim.currentTick();
          const shown = cur === null ? total : Math.min(cur, total);
          if (fillRef.current) fillRef.current.style.width = `${(shown / total) * 100}%`;
          if (timeRef.current) timeRef.current.textContent = `${formatSeconds(shown)} / ${formatSeconds(total)}`;
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [compact, emote, fitDistance]);

  const seekFromPointer = (clientX: number) => {
    const bar = barRef.current;
    const anim = animRef.current;
    const viewer = viewerRef.current;
    if (!bar || !anim || !viewer) return;
    const rect = bar.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    anim.seek(viewer.playerObject, f * (anim.totalTicks - 0.001));
  };

  const loopStart = emote.isLoop ? emote.returnTick / (emote.endTick + 1) : null;

  return (
    <div className={cn("flex min-w-0 flex-col", className)} style={{ width }}>
      <div
        className="relative overflow-hidden rounded-md bg-[radial-gradient(ellipse_at_50%_38%,hsl(var(--accent)/0.16),transparent_62%),linear-gradient(to_bottom,rgba(255,255,255,0.03),rgba(0,0,0,0.42))]"
        style={{ width, height }}
      >
        <canvas
          ref={canvasRef}
          className="block cursor-grab active:cursor-grabbing"
          onDoubleClick={frameCamera}
        />
        {!compact && (
          <Hint label="Recolocar la cámara">
            <button
              type="button"
              onClick={frameCamera}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/35 text-gray-300 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </Hint>
        )}
      </div>

      {!compact && (
        <div className="mt-3 flex w-full min-w-0 items-center gap-3">
          <Hint label={playing ? "Pausar" : "Reproducir"}>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_0_14px_hsl(var(--accent)/0.35)] transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5 translate-x-px" fill="currentColor" />}
            </button>
          </Hint>

          <div
            ref={barRef}
            className="relative h-6 min-w-0 flex-1 cursor-pointer touch-none"
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId);
              seekFromPointer(ev.clientX);
            }}
            onPointerMove={(ev) => {
              if (ev.currentTarget.hasPointerCapture(ev.pointerId)) seekFromPointer(ev.clientX);
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
              {loopStart !== null && (
                // The stretch that repeats once the emote starts looping.
                <div
                  className="absolute inset-y-0 right-0 bg-white/[0.07]"
                  style={{ left: `${loopStart * 100}%` }}
                />
              )}
              <div ref={fillRef} className="absolute inset-y-0 left-0 rounded-full bg-accent" />
            </div>
            {loopStart !== null && loopStart > 0.01 && (
              <div
                title="Aquí vuelve el bucle"
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-white/50"
                style={{ left: `${loopStart * 100}%` }}
              />
            )}
          </div>

          <span ref={timeRef} className="min-w-[88px] shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground" />

          <div className="flex shrink-0 overflow-hidden rounded-md bg-white/[0.06]">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  "px-1.5 py-1 text-[10px] font-semibold tabular-nums transition-colors",
                  speed === s ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-gray-200"
                )}
              >
                {s.toLocaleString("es-ES")}×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
