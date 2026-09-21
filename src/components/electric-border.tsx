import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Animated "electric" border: a rounded-rect outline drawn on a canvas whose
 * points are pushed around by time-scrolling value noise, so the edge crackles
 * like a current running through it. Plus three blurred copies for the glow.
 *
 * Adapted from react-bits' <ElectricBorder> (github.com/DavidHDev/react-bits,
 * ts-tailwind variant) by David Haz — MIT + Commons Clause. Used here as part of
 * an application, which the licence allows; we just can't republish the
 * component itself. Trimmed to our needs (tighter outer glow so it doesn't
 * overflow the page, prefers-reduced-motion guard).
 */

function hexToRgba(hex: string, alpha = 1): string {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(h.slice(0, 6), 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

interface ElectricBorderProps {
  children?: ReactNode;
  /** Hex colour of the arc + glow. */
  color?: string;
  /** Time multiplier for the crackle. */
  speed?: number;
  /** How far the noise pushes the outline (0.05 calm … 0.25 wild). */
  chaos?: number;
  /** Corner radius in px — match the wrapped card. */
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
}

export function ElectricBorder({
  children,
  color = "#ff9436",
  speed = 1,
  chaos = 0.1,
  borderRadius = 24,
  className,
  style,
}: ElectricBorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);

  const random = useCallback((x: number) => (Math.sin(x * 12.9898) * 43758.5453) % 1, []);

  const noise2D = useCallback(
    (x: number, y: number) => {
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;
      const a = random(i + j * 57);
      const b = random(i + 1 + j * 57);
      const c = random(i + (j + 1) * 57);
      const d = random(i + 1 + (j + 1) * 57);
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    },
    [random]
  );

  const octavedNoise = useCallback(
    (x: number, time: number, seed: number, baseAmplitude: number) => {
      const octaves = 10;
      const lacunarity = 1.6;
      const gain = 0.7;
      let y = 0;
      let amplitude = baseAmplitude;
      let frequency = 10;
      for (let i = 0; i < octaves; i++) {
        // the first octave is flattened out (baseFlatness 0 in the original)
        if (i > 0) y += amplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
        frequency *= lacunarity;
        amplitude *= gain;
      }
      return y;
    },
    [noise2D]
  );

  const roundedRectPoint = useCallback(
    (t: number, left: number, top: number, width: number, height: number, radius: number) => {
      const straightW = width - 2 * radius;
      const straightH = height - 2 * radius;
      const arc = (Math.PI * radius) / 2;
      const perimeter = 2 * straightW + 2 * straightH + 4 * arc;
      const dist = t * perimeter;
      const corner = (cx: number, cy: number, start: number, progress: number) => ({
        x: cx + radius * Math.cos(start + progress * (Math.PI / 2)),
        y: cy + radius * Math.sin(start + progress * (Math.PI / 2)),
      });
      let acc = 0;
      if (dist <= acc + straightW) return { x: left + radius + ((dist - acc) / straightW) * straightW, y: top };
      acc += straightW;
      if (dist <= acc + arc) return corner(left + width - radius, top + radius, -Math.PI / 2, (dist - acc) / arc);
      acc += arc;
      if (dist <= acc + straightH) return { x: left + width, y: top + radius + ((dist - acc) / straightH) * straightH };
      acc += straightH;
      if (dist <= acc + arc) return corner(left + width - radius, top + height - radius, 0, (dist - acc) / arc);
      acc += arc;
      if (dist <= acc + straightW) return { x: left + width - radius - ((dist - acc) / straightW) * straightW, y: top + height };
      acc += straightW;
      if (dist <= acc + arc) return corner(left + radius, top + height - radius, Math.PI / 2, (dist - acc) / arc);
      acc += arc;
      if (dist <= acc + straightH) return { x: left, y: top + height - radius - ((dist - acc) / straightH) * straightH };
      acc += straightH;
      return corner(left + radius, top + radius, Math.PI, (dist - acc) / arc);
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Kept tight so the canvas stays within a typical page gutter and doesn't
    // trigger a horizontal scrollbar on the scroll container it lives in.
    const displacement = 42;
    const borderOffset = 24;
    let width = 0;
    let height = 0;
    let lastDpr = Math.min(window.devicePixelRatio || 1, 2);

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width + borderOffset * 2;
      height = rect.height + borderOffset * 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    updateSize();

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (dpr !== lastDpr) {
        lastDpr = dpr;
        updateSize();
      }
      timeRef.current += ((now - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = now;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const bw = width - 2 * borderOffset;
      const bh = height - 2 * borderOffset;
      const radius = Math.min(borderRadius, Math.min(bw, bh) / 2);
      const perimeter = 2 * (bw + bh) + 2 * Math.PI * radius;
      const samples = Math.max(64, Math.floor(perimeter / 2));

      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const p = i / samples;
        const pt = roundedRectPoint(p, borderOffset, borderOffset, bw, bh, radius);
        const x = pt.x + octavedNoise(p * 8, timeRef.current, 0, chaos) * displacement;
        const y = pt.y + octavedNoise(p * 8, timeRef.current, 1, chaos) * displacement;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [color, speed, chaos, borderRadius, octavedNoise, roundedRectPoint]);

  return (
    <div
      ref={containerRef}
      className={`relative isolate overflow-visible ${className ?? ""}`}
      style={{ borderRadius, ...style }}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
        <canvas ref={canvasRef} className="block" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]">
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ border: `2px solid ${hexToRgba(color, 0.6)}`, filter: "blur(1px)" }}
        />
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ border: `2px solid ${color}`, filter: "blur(4px)" }}
        />
      </div>
      {/* box-shadow ambient glow — ink-only, so it can't push a scrollbar */}
      <div
        className="relative z-[1] rounded-[inherit]"
        style={{ boxShadow: `0 0 22px ${hexToRgba(color, 0.22)}, 0 0 4px ${hexToRgba(color, 0.35)}` }}
      >
        {children}
      </div>
    </div>
  );
}
