import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { mat4 } from "gl-matrix";
import { Structure, StructureRenderer, type Mesh, type Resources } from "deepslate";

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

/** Above this many blocks the 3D preview isn't attempted at all: meshing and
 *  the GPU buffers grow with it, and a weak PC could run out of memory. */
export const MAX_RENDER_BLOCKS = 400_000;

/** Blocks meshed per step of the progressive build (one chunk is never split). */
const BLOCKS_PER_STEP = 400;
/** Work per frame before handing control back to the page. */
const FRAME_BUDGET_MS = 14;

type PlacedBlock = ReturnType<Structure["getBlocks"]>[number];

// deepslate's chunk builder, reached through the renderer's (TS-private)
// fields: the progressive build feeds it a few chunks at a time.
interface ChunkBuilderInternals {
  gl: WebGLRenderingContext;
  structure: unknown;
  chunks: { mesh: Mesh; transparentMesh: Mesh }[][][];
  updateStructureBuffers(chunkPositions?: [number, number, number][]): void;
}

const MESH_BUFFERS = { pos: true, color: true, texture: true, normal: true, blockPos: true } as const;

/** Frees the GL buffers of whatever was built before and forgets its chunks. */
function resetChunks(builder: ChunkBuilderInternals) {
  builder.chunks.forEach((x) =>
    x?.forEach((y) =>
      y?.forEach((chunk) => {
        if (!chunk) return;
        chunk.mesh.clear().rebuild(builder.gl, MESH_BUFFERS);
        chunk.transparentMesh.clear().rebuild(builder.gl, MESH_BUFFERS);
      })
    )
  );
  builder.chunks = [];
}

/** The structure's blocks grouped into steps of whole chunks (CHUNK³ each). */
function planSteps(structure: Structure, chunk: number): { blocks: PlacedBlock[]; chunks: [number, number, number][] }[] {
  const byChunk = new Map<string, { pos: [number, number, number]; blocks: PlacedBlock[] }>();
  for (const b of structure.getBlocks()) {
    const pos: [number, number, number] = [
      Math.floor(b.pos[0] / chunk),
      Math.floor(b.pos[1] / chunk),
      Math.floor(b.pos[2] / chunk),
    ];
    const key = pos.join(",");
    let entry = byChunk.get(key);
    if (!entry) byChunk.set(key, (entry = { pos, blocks: [] }));
    entry.blocks.push(b);
  }
  // Bottom up, so the build visibly grows from the ground.
  const ordered = [...byChunk.values()].sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2]);
  const steps: { blocks: PlacedBlock[]; chunks: [number, number, number][] }[] = [];
  let current = { blocks: [] as PlacedBlock[], chunks: [] as [number, number, number][] };
  for (const c of ordered) {
    current.blocks.push(...c.blocks);
    current.chunks.push(c.pos);
    if (current.blocks.length >= BLOCKS_PER_STEP) {
      steps.push(current);
      current = { blocks: [], chunks: [] };
    }
  }
  if (current.chunks.length > 0) steps.push(current);
  return steps;
}

const CHUNK_SIZE = 8;

/** A live, rotatable 3D render of a parsed schematic Structure. Left-drag to
 *  orbit, right-drag to pan, scroll to zoom. Unlike SkinViewer3D (which wraps skinview3d's own
 *  SkinViewer lifecycle), this drives deepslate's raw-WebGL StructureRenderer
 *  directly, since deepslate has no three.js layer.
 *
 *  Built progressively — a few chunks per frame, with a progress bar — so a big
 *  build never blocks the app, and closing the dialog cancels it. Too big a
 *  build, or the GPU giving up (context lost), shows a message instead. */
export function SchematicViewer3D({ structure, resources, width = 400, height = 300, className }: SchematicViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StructureRenderer | null>(null);
  const cameraRef = useRef<OrbitCamera | null>(null);
  /** 0–1 while building, null when done. */
  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // StructureRenderer only accepts `resources` in its constructor (no
  // setResources()), so the GL context/renderer is recreated only when
  // resources actually change — in practice, once, when loading finishes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !resources) return;
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext("webgl");
    if (!gl) {
      setFailure("Este equipo no puede mostrar vistas 3D (WebGL no disponible).");
      return;
    }
    // Out of GPU memory (or a driver reset): say so rather than leave a frozen picture.
    const onLost = (e: Event) => {
      e.preventDefault();
      setFailure("La tarjeta gráfica no ha podido mostrar esta construcción.");
      setProgress(null);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    // Built empty: the structure goes in in the effect below, a few chunks at a
    // time. 8-block chunks: deepslate indexes each chunk with 16 bits (≤16384
    // faces), which a dense 16³ chunk of redstone could overflow. No "invisible
    // blocks" buffer: it's a debug overlay we never draw, yet deepslate builds a
    // 12-line cube for every EMPTY cell of the box — ~2.8M lines and ~2 GB for
    // a 46×89×68 farm, which is what froze the app.
    const renderer = new StructureRenderer(gl, Structure.EMPTY, resources, {
      chunkSize: CHUNK_SIZE,
      useInvisibleBlockBuffer: false,
    });
    renderer.setViewport(0, 0, width, height);
    rendererRef.current = renderer;

    const camera = new OrbitCamera(canvas, (view) => renderer.drawStructure(view));
    cameraRef.current = camera;
    camera.redraw();

    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      camera.dispose();
      // deepslate exposes no renderer.dispose() — force the context to
      // actually release its GPU resources so repeatedly opening/closing the
      // preview dialog doesn't pile up contexts (Chromium caps at ~16 live).
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, [width, height, resources]);

  // Swaps which file is displayed without touching the canvas/GL context. Also
  // runs when the renderer is (re)created, which always starts empty.
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    const r = renderer as unknown as { structure: Structure; gridMesh: unknown; getGridMesh(): unknown; chunkBuilder: ChunkBuilderInternals };
    const builder = r.chunkBuilder;
    const s = structure ?? Structure.EMPTY;
    let cancelled = false;
    setFailure(null);

    resetChunks(builder);
    const size = s.getSize();
    const maxDim = Math.max(size[0], size[1], size[2], 1);

    const blockCount = s.getBlocks().length;
    if (blockCount > MAX_RENDER_BLOCKS) {
      setProgress(null);
      setFailure(
        `Esta construcción es demasiado grande para la vista 3D (${blockCount.toLocaleString("es-ES")} bloques; máximo ${MAX_RENDER_BLOCKS.toLocaleString("es-ES")}).`
      );
      camera.redraw();
      return;
    }

    // The renderer's own structure: its size draws the floor grid and outline.
    r.structure = s;
    r.gridMesh = r.getGridMesh();
    camera.setCenter([size[0] / 2, size[1] / 2, size[2] / 2], maxDim * 1.5);

    const steps = planSteps(s, CHUNK_SIZE);
    if (steps.length === 0) {
      setProgress(null);
      return;
    }
    setProgress(0);

    // Each step shows the builder only that step's blocks (getBlocks), while
    // neighbour lookups for face culling still see the whole structure (getBlock).
    const run = async () => {
      // Let the dialog paint the progress bar before the first step.
      await new Promise((res) => setTimeout(res, 0));
      let i = 0;
      while (i < steps.length) {
        if (cancelled) return;
        const frameStart = performance.now();
        do {
          const step = steps[i++];
          builder.structure = { getBlocks: () => step.blocks, getBlock: (p: [number, number, number]) => s.getBlock(p), getSize: () => size };
          try {
            builder.updateStructureBuffers(step.chunks);
          } catch (e) {
            console.error("[schematic-viewer-3d] build step failed:", e);
          }
        } while (i < steps.length && performance.now() - frameStart < FRAME_BUDGET_MS);
        builder.structure = s;
        camera.redraw();
        setProgress(i / steps.length);
        await new Promise((res) => setTimeout(res, 0));
      }
      if (!cancelled) setProgress(null);
    };
    run();

    return () => {
      cancelled = true;
      builder.structure = s;
    };
  }, [structure, resources, width, height]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvasRef} width={width} height={height} className={className} />
      {progress !== null && !failure && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
          <div className="flex items-center gap-2 rounded-md bg-background/60 backdrop-blur-xl px-3 py-1.5 text-xs text-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            Generando vista 3D… {Math.round(progress * 100)}%
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      {failure && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
          <p className="max-w-sm text-sm text-gray-200">{failure}</p>
        </div>
      )}
    </div>
  );
}
