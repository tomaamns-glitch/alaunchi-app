import { useEffect, useRef } from "react";
import { mat4 } from "gl-matrix";
import { Structure, StructureRenderer, type Resources } from "deepslate";

interface SchematicViewer3DProps {
  structure: Structure | null;
  resources: Resources | null;
  width?: number;
  height?: number;
  className?: string;
}

// deepslate ships no orbit controls of its own (unlike skinview3d's
// enableControls) — this mirrors the drag-to-rotate/wheel-to-zoom scheme from
// deepslate's own official demo (misode/deepslate, demo/main.ts), rewritten
// against this component's lifecycle instead of copied verbatim.
class OrbitCamera {
  private xRotation = 0.8;
  private yRotation = 0.5;
  private viewDist = 4;
  private center: [number, number, number] = [0, 0, 0];
  private dragPos: [number, number] | null = null;
  private dragButton: number | null = null;
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private onRender: (view: mat4) => void
  ) {
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 2) {
      this.dragPos = [e.clientX, e.clientY];
      this.dragButton = e.button;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.dragPos) return;
    const dx = e.clientX - this.dragPos[0];
    const dy = e.clientY - this.dragPos[1];
    this.dragPos = [e.clientX, e.clientY];
    if (this.dragButton === 2) {
      this.pan(dx, dy);
    } else {
      this.yRotation += dx / 100;
      this.xRotation += dy / 100;
    }
    this.redraw();
  };

  private onMouseUp = () => {
    this.dragPos = null;
    this.dragButton = null;
  };

  // Right-click drives panning (see onMouseDown/onMouseMove), so the OS/
  // Electron context menu popping up on release would be a jarring surprise.
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  /** Moves the look-at target across the camera's own right/up plane instead
   *  of orbiting around it — lets you look around the build instead of always
   *  being stuck orbiting its fixed center. Speed scales with viewDist so a
   *  drag feels the same whether zoomed in or way out. */
  private pan(dx: number, dy: number) {
    const cosY = Math.cos(this.yRotation);
    const sinY = Math.sin(this.yRotation);
    const cosX = Math.cos(this.xRotation);
    const sinX = Math.sin(this.xRotation);
    const right: [number, number, number] = [cosY, 0, -sinY];
    const up: [number, number, number] = [sinY * sinX, cosX, cosY * sinX];
    const speed = this.viewDist / 300;
    for (let i = 0; i < 3; i++) {
      this.center[i] -= dx * right[i] * speed - dy * up[i] * speed;
    }
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.viewDist += e.deltaY / 100;
    this.redraw();
  };

  /** Recenters the camera on a (possibly new) structure's midpoint, with a
   *  view distance scaled to its size so both tiny and huge builds fit in frame. */
  setCenter(center: [number, number, number], viewDist: number) {
    this.center = center;
    this.viewDist = viewDist;
    this.redraw();
  }

  redraw() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.renderImmediately());
  }

  private renderImmediately() {
    this.yRotation = this.yRotation % (Math.PI * 2);
    this.xRotation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.xRotation));
    this.viewDist = Math.max(1, this.viewDist);

    const view = mat4.create();
    mat4.translate(view, view, [0, 0, -this.viewDist]);
    mat4.rotate(view, view, this.xRotation, [1, 0, 0]);
    mat4.rotate(view, view, this.yRotation, [0, 1, 0]);
    mat4.translate(view, view, [-this.center[0], -this.center[1], -this.center[2]]);
    this.onRender(view);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }
}

/** A live, rotatable 3D render of a parsed schematic Structure. Left-drag to
 *  orbit, right-drag to pan, scroll to zoom. Unlike SkinViewer3D (which wraps skinview3d's own
 *  SkinViewer lifecycle), this drives deepslate's raw-WebGL StructureRenderer
 *  directly, since deepslate has no three.js layer. */
export function SchematicViewer3D({ structure, resources, width = 400, height = 300, className }: SchematicViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StructureRenderer | null>(null);
  const cameraRef = useRef<OrbitCamera | null>(null);

  // StructureRenderer only accepts `resources` in its constructor (no
  // setResources()), so the GL context/renderer is recreated only when
  // resources actually change — in practice, once, when loading finishes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !resources) return;
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const renderer = new StructureRenderer(gl, structure ?? Structure.EMPTY, resources);
    renderer.setViewport(0, 0, width, height);
    rendererRef.current = renderer;

    const camera = new OrbitCamera(canvas, (view) => renderer.drawStructure(view));
    cameraRef.current = camera;
    camera.redraw();

    return () => {
      camera.dispose();
      // deepslate exposes no renderer.dispose() — force the context to
      // actually release its GPU resources so repeatedly opening/closing the
      // preview dialog doesn't pile up contexts (Chromium caps at ~16 live).
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, [width, height, resources]);

  // Cheap swap for changing which file is displayed, without touching the
  // canvas/GL context.
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    const s = structure ?? Structure.EMPTY;
    renderer.setStructure(s);
    const size = s.getSize();
    const maxDim = Math.max(size[0], size[1], size[2], 1);
    camera.setCenter([size[0] / 2, size[1] / 2, size[2] / 2], maxDim * 1.5);
  }, [structure]);

  return <canvas ref={canvasRef} width={width} height={height} className={className} />;
}
