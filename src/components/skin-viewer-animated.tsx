import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { inferModelType, loadCapeToCanvas, loadImage, loadSkinToCanvas } from "skinview-utils";
import classicModelUrl from "@/assets/models/classic-player.gltf?url";
import slimModelUrl from "@/assets/models/slim-player.gltf?url";
import { getCherryPetalFrames } from "@/services/electron";

interface SkinViewerAnimatedProps {
  skinUrl: string;
  capeUrl?: string | null;
  variant?: "slim" | "classic" | "auto-detect";
  width?: number;
  height?: number;
  className?: string;
  /**
   * Cosmetic backdrop:
   * - "soul-fire": blue flames rising around the character.
   * - "cherry-petals": pink petals drifting down behind the character.
   */
  effect?: "none" | "soul-fire" | "cherry-petals";
}

interface SceneEffect {
  update(dt: number): void;
  dispose(): void;
}

// The rigged player models (classic-player.gltf / slim-player.gltf) and their
// baked animation clips come from Modrinth's launcher (github.com/modrinth/code,
// packages/assets), which is GPL-3.0-only. See src/assets/models/NOTICE.md.
// The clips: "idle" loops forever; "idle_sub_1..3" are one-shot gestures (look
// around, shift weight, stretch); "interact" fires on click. The scheduler
// below (base loop + a random gesture every few seconds, cross-faded) is a
// re-implementation of the same idea as Modrinth's use-skin-preview-animation.
const BASE_CLIP = "idle";
const GESTURE_CLIPS = ["idle_sub_1", "idle_sub_2", "idle_sub_3"];
const INTERACT_CLIP = "interact";
const GESTURE_INTERVAL_MS = 8000;
const CROSSFADE_S = 0.25;

// GLTFLoader parses the whole model + embedded animation buffer on every call;
// cache the parsed result per URL so remounting (or slim<->classic swaps) is
// just a cheap scene clone. Clips are immutable data and safe to share across
// clones — the AnimationMixer binds them to each cloned scene by node name.
const modelCache = new Map<string, Promise<GLTF>>();
function loadModel(url: string): Promise<GLTF> {
  let p = modelCache.get(url);
  if (!p) {
    p = new Promise<GLTF>((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject));
    modelCache.set(url, p);
  }
  return p;
}

function makePixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  // glTF UV convention (the models were exported for it) — matches what
  // GLTFLoader itself does for embedded textures.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Clones the shared glTF materials so each mesh (and each viewer instance) owns
 *  its own — the source model points every body part at ONE "Mat" material, so
 *  without this the per-mesh tweaks below (and the skin texture itself) would
 *  leak across every part and every mounted viewer. */
function isolateMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
  });
}

/** Points every non-cape mesh at the skin texture; the cape mesh at the cape
 *  texture (hidden when there's no cape). The overlay ("_Layer") meshes get
 *  alpha cutout + a polygon offset so they sit cleanly on top of the base. */
function applySkin(root: THREE.Object3D, skin: THREE.Texture, cape: THREE.Texture | null) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const isLayer = mesh.name.endsWith("_Layer");
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const isCape = mat.name === "cape";
      mat.map = isCape ? cape : skin;
      mat.metalness = 0;
      mat.roughness = 1;
      mat.color.set(0xffffff);
      mat.flatShading = true;
      mat.toneMapped = false;
      mat.depthWrite = true;
      mat.depthTest = true;
      if (isLayer || isCape) {
        // Skin overlays are per-pixel opaque-or-gone — an alpha cutout keeps
        // them crisp and correctly depth-sorted; the offset stops them
        // z-fighting the base layer they're wrapped around.
        mat.transparent = true;
        mat.alphaTest = 0.05;
        mat.side = THREE.DoubleSide;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
      } else {
        mat.transparent = false;
        mat.alphaTest = 0;
        mat.side = THREE.FrontSide;
        mat.polygonOffset = false;
      }
      mat.needsUpdate = true;
      if (isCape) mat.visible = cape !== null;
    }
  });
}

/** Drives one AnimationMixer: keeps the base idle looping and, every few
 *  seconds, cross-fades into a random one-shot gesture then back. `interact`
 *  can be triggered on demand (click). */
class IdleScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastGesture = "";
  private disposed = false;
  private onFinished: (e: { action: THREE.AnimationAction }) => void;

  constructor(
    private mixer: THREE.AnimationMixer,
    private actions: Map<string, THREE.AnimationAction>
  ) {
    for (const [name, action] of actions) {
      if (name === BASE_CLIP) {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
    }
    this.onFinished = ({ action }) => {
      if (this.disposed || action === this.base) return;
      this.returnToBase(action);
      this.schedule();
    };
    this.mixer.addEventListener("finished", this.onFinished as never);
  }

  private get base() {
    return this.actions.get(BASE_CLIP);
  }

  start() {
    this.base?.reset().play();
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const base = this.base;
      if (this.disposed || !base || !base.isRunning()) return this.schedule();
      const pool = GESTURE_CLIPS.filter((n) => n !== this.lastGesture && this.actions.has(n));
      const name = (pool.length ? pool : GESTURE_CLIPS)[Math.floor(Math.random() * (pool.length || GESTURE_CLIPS.length))];
      const gesture = this.actions.get(name);
      if (!gesture) return this.schedule();
      this.lastGesture = name;
      base.fadeOut(CROSSFADE_S);
      gesture.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_S).play();
    }, GESTURE_INTERVAL_MS);
  }

  private returnToBase(from: THREE.AnimationAction) {
    const base = this.base;
    if (!base) return;
    from.fadeOut(CROSSFADE_S);
    base.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_S).play();
  }

  playInteract() {
    const interact = this.actions.get(INTERACT_CLIP);
    const base = this.base;
    if (!interact || !base || !base.isRunning()) return;
    if (this.timer) clearTimeout(this.timer);
    base.fadeOut(CROSSFADE_S);
    interact.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_S).play();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.mixer.removeEventListener("finished", this.onFinished as never);
    this.mixer.stopAllAction();
  }
}

/**
 * A column of blue "soul fire" embers that spawn in a disc at the character's
 * feet, spiral inward as they rise, and fade before head height. Pure
 * `THREE.Points` — a few hundred CPU-updated particles, additively blended and
 * depth-tested so the ones behind the character are occluded by it. Paired with
 * a flickering blue point light so the glow lands on the model too.
 */
const SOUL_FIRE_COUNT = 320;

class SoulFire implements SceneEffect {
  readonly points: THREE.Points;
  readonly light: THREE.PointLight;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private span: Float32Array;
  private aLife: Float32Array;
  private material: THREE.ShaderMaterial;
  private time = 0;

  constructor(private radius: number, sizePx: number) {
    const n = SOUL_FIRE_COUNT;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.span = new Float32Array(n);
    this.aLife = new Float32Array(n);
    for (let i = 0; i < n; i++) this.respawn(i, Math.random());

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geometry.setAttribute("aLife", new THREE.BufferAttribute(this.aLife, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: sizePx },
        uHot: { value: new THREE.Color(0x8fe3ff) },
        uMid: { value: new THREE.Color(0x2f7bff) },
        uCold: { value: new THREE.Color(0x0b1f6e) },
      },
      vertexShader: /* glsl */ `
        attribute float aLife;
        varying float vLife;
        uniform float uSize;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // small at birth, swell, then shrink as it cools
          float grow = mix(0.3, 1.0, smoothstep(0.0, 0.18, aLife)) * (1.0 - 0.6 * aLife);
          gl_PointSize = uSize * grow / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        uniform vec3 uHot;
        uniform vec3 uMid;
        uniform vec3 uCold;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.06, d);
          vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.35, vLife));
          col = mix(col, uCold, smoothstep(0.35, 1.0, vLife));
          float alpha = glow * smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.7, 1.0, vLife));
          gl_FragColor = vec4(col, alpha * 0.55);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;

    this.light = new THREE.PointLight(0x4c9dff, 0, 2.8, 2);
    this.light.position.set(0, 0.35, 0.1);
  }

  private respawn(i: number, startFraction = 0) {
    const angle = Math.random() * Math.PI * 2;
    const r = this.radius * Math.sqrt(Math.random());
    this.pos[i * 3] = Math.cos(angle) * r;
    this.pos[i * 3 + 1] = Math.random() * 0.15;
    this.pos[i * 3 + 2] = Math.sin(angle) * r * 0.7 - 0.04;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.1;
    this.vel[i * 3 + 1] = 1.1 + Math.random() * 0.9;
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    this.span[i] = 1.5 + Math.random() * 1.1;
    this.age[i] = 0;
    this.aLife[i] = 0;
    // Fast-forward so a freshly-mounted viewer shows a full column, not one
    // that visibly builds up from the floor over the first couple of seconds.
    const steps = Math.floor((startFraction * this.span[i]) / 0.04);
    for (let s = 0; s < steps; s++) this.step(i, 0.04);
  }

  private step(i: number, dt: number) {
    const swirl = 0.8 + i * 0.011;
    this.vel[i * 3] += Math.sin(this.time * swirl + i) * 0.3 * dt;
    this.vel[i * 3 + 2] += Math.cos(this.time * swirl * 1.3 + i) * 0.3 * dt;
    this.vel[i * 3 + 1] += 0.25 * dt; // buoyancy
    // gently draw inward toward the column axis as it rises
    this.pos[i * 3] -= this.pos[i * 3] * 0.35 * dt;
    this.pos[i * 3 + 2] -= this.pos[i * 3 + 2] * 0.35 * dt;
    this.pos[i * 3] += this.vel[i * 3] * dt;
    this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
    this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    this.age[i] += dt;
    this.aLife[i] = this.age[i] / this.span[i];
  }

  update(dt: number) {
    this.time += dt;
    const n = SOUL_FIRE_COUNT;
    for (let i = 0; i < n; i++) {
      if (this.age[i] >= this.span[i]) this.respawn(i);
      else this.step(i, dt);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.light.intensity = 1.3 + Math.sin(this.time * 13) * 0.35 + Math.sin(this.time * 6.7) * 0.25;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

function makePetalTexture(canvas: HTMLCanvasElement, frames: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.userData.frames = frames;
  return tex;
}

// Fallback petal: a pixel-art cherry petal in Minecraft's pink palette, drawn
// once at texel resolution, centred on a square so it shares a plane aspect with
// the real 3x3 frames. Used until (or unless) the jar frames load.
let drawnPetalTexture: THREE.Texture | null = null;
function getDrawnPetalTexture(): THREE.Texture {
  if (drawnPetalTexture) return drawnPetalTexture;
  const art = [
    "...aaaa...",
    "..aaaaaa..",
    ".aaaaaaaa.",
    ".aaaabbaa.",
    "aaaabbbaaa",
    "aaabbbbaaa",
    "aaabbccaaa",
    ".aabbccaa.",
    ".aabbcaaa.",
    "..aabaaa..",
    "..aabaa...",
    "...aaa....",
    "....a.....",
  ];
  const palette: Record<string, string> = { a: "#f4bcd6", b: "#e79ac0", c: "#cf7ba6" };
  const size = 14;
  const ox = Math.floor((size - art[0].length) / 2);
  const oy = Math.floor((size - art.length) / 2);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  art.forEach((row, y) =>
    row.split("").forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = palette[ch];
      g.fillRect(ox + x, oy + y, 1, 1);
    })
  );
  drawnPetalTexture = makePetalTexture(c, 1);
  return drawnPetalTexture;
}

// The real Minecraft falling-petal animation: its 12 particle frames (3x3 px
// each, from a cached client jar) stitched into one horizontal strip. Memoised;
// resolves to null when no jar is available (then the drawn petal is kept).
let mcAtlasPromise: Promise<THREE.Texture | null> | null = null;
function getMcPetalAtlas(): Promise<THREE.Texture | null> {
  if (!mcAtlasPromise) {
    mcAtlasPromise = (async () => {
      const frames = await getCherryPetalFrames();
      if (!frames || frames.length !== 12) return null;
      const imgs = await Promise.all(frames.map((src) => loadImage(src)));
      const fw = imgs[0].width;
      const fh = imgs[0].height;
      const c = document.createElement("canvas");
      c.width = fw * imgs.length;
      c.height = fh;
      const g = c.getContext("2d")!;
      imgs.forEach((img, i) => g.drawImage(img, i * fw, 0));
      return makePetalTexture(c, imgs.length);
    })().catch(() => null);
  }
  return mcAtlasPromise;
}

/**
 * Cherry-blossom petals drifting down *behind* the character. Each petal is a
 * real textured quad in an `InstancedMesh` — it tumbles freely in 3D (flipping
 * over a random near-horizontal axis plus a slow spin), so it thins to a sliver
 * edge-on the way a falling petal actually does. Its texture is Minecraft's own
 * cherry-particle frame (pulled from a client jar; a drawn petal until/if that
 * arrives) — a per-instance `aFrame` picks which of the strip's frames to show.
 * The field lives in world space (stays put when the model is spun) and is
 * biased to negative Z so the body occludes most of it. Kept to a narrow column
 * ~the character's width and spawned/despawned outside the framed area, so
 * petals never pop in or clip against the viewport edge. Deliberately sparse.
 */
const PETAL_COUNT = 36;

class CherryPetals implements SceneEffect {
  readonly mesh: THREE.InstancedMesh;
  private baseX = new Float32Array(PETAL_COUNT);
  private baseZ = new Float32Array(PETAL_COUNT);
  private span = new Float32Array(PETAL_COUNT);
  private age = new Float32Array(PETAL_COUNT);
  private scale = new Float32Array(PETAL_COUNT);
  private swayFreq = new Float32Array(PETAL_COUNT);
  private swayAmp = new Float32Array(PETAL_COUNT);
  private swayPhase = new Float32Array(PETAL_COUNT);
  private flipAxis: THREE.Vector3[] = [];
  private flipSpeed = new Float32Array(PETAL_COUNT);
  private flipPhase = new Float32Array(PETAL_COUNT);
  private spinSpeed = new Float32Array(PETAL_COUNT);
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshBasicMaterial;
  private aFrame: THREE.InstancedBufferAttribute;
  private uFrameCount = { value: 1 };
  private frameCount = 1;
  private disposed = false;
  private time = 0;

  // scratch objects reused every frame
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qSpin = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private topY: number,
    private bottomY: number,
    private spread: number
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(PETAL_COUNT), 1);
    this.geometry.setAttribute("aFrame", this.aFrame);
    this.material = new THREE.MeshBasicMaterial({
      map: getDrawnPetalTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    // Remap the map UV per instance so each quad samples one frame of the strip.
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uFrameCount = this.uFrameCount;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aFrame;\nuniform float uFrameCount;")
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv.x = (vMapUv.x + aFrame) / uFrameCount;\n#endif"
        );
    };
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, PETAL_COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PETAL_COUNT; i++) {
      this.flipAxis.push(new THREE.Vector3());
      this.respawn(i, Math.random());
    }
    this.flush();

    getMcPetalAtlas().then((atlas) => {
      if (this.disposed || !atlas) return;
      this.material.map = atlas; // shared, module-cached — never disposed here
      this.material.needsUpdate = true;
      this.frameCount = atlas.userData.frames as number;
      this.uFrameCount.value = this.frameCount;
      for (let i = 0; i < PETAL_COUNT; i++) this.aFrame.setX(i, Math.floor(Math.random() * this.frameCount));
      this.aFrame.needsUpdate = true;
    });
  }

  private respawn(i: number, startFraction = 0) {
    this.baseX[i] = (Math.random() - 0.5) * 2 * this.spread;
    this.baseZ[i] = -0.3 - Math.random() * 0.6; // clearly behind the character
    this.span[i] = 4.5 + Math.random() * 3.5; // seconds to fall — slow
    this.scale[i] = 0.13 + Math.random() * 0.06;
    this.swayFreq[i] = 0.4 + Math.random() * 0.6;
    this.swayAmp[i] = 0.05 + Math.random() * 0.09;
    this.swayPhase[i] = Math.random() * Math.PI * 2;
    // flip over a random near-horizontal axis, plus a lazy spin around vertical
    const a = Math.random() * Math.PI * 2;
    this.flipAxis[i].set(Math.cos(a), (Math.random() - 0.5) * 0.4, Math.sin(a)).normalize();
    this.flipSpeed[i] = 1.4 + Math.random() * 2.2;
    this.flipPhase[i] = Math.random() * Math.PI * 2;
    this.spinSpeed[i] = (Math.random() - 0.5) * 1.3;
    this.age[i] = startFraction * this.span[i];
    this.aFrame.setX(i, Math.floor(Math.random() * this.frameCount));
  }

  private writeMatrix(i: number) {
    const t = this.age[i] / this.span[i];
    this.p.set(
      this.baseX[i] + Math.sin(this.time * this.swayFreq[i] + this.swayPhase[i]) * this.swayAmp[i],
      this.topY - (this.topY - this.bottomY) * t,
      this.baseZ[i] + Math.cos(this.time * this.swayFreq[i] * 0.7 + this.swayPhase[i]) * this.swayAmp[i] * 0.5
    );
    this.q.setFromAxisAngle(this.flipAxis[i], this.flipPhase[i] + this.time * this.flipSpeed[i]);
    this.qSpin.setFromAxisAngle(this.up, this.time * this.spinSpeed[i]);
    this.q.premultiply(this.qSpin);
    this.s.setScalar(this.scale[i]);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
  }

  private flush() {
    for (let i = 0; i < PETAL_COUNT; i++) this.writeMatrix(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    let respawned = false;
    for (let i = 0; i < PETAL_COUNT; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.span[i]) {
        this.respawn(i);
        respawned = true;
      }
    }
    if (respawned) this.aFrame.needsUpdate = true;
    this.flush();
  }

  dispose() {
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Frees the per-instance materials and skin/cape textures of a model clone.
 *  Geometry is deliberately left alone — it's shared with the cached source
 *  glTF (see {@link loadModel}) and outlives any single viewer. */
function disposeModel(root: THREE.Object3D) {
  const seen = new Set<THREE.Texture | THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const map = (mat as THREE.Material & { map?: THREE.Texture | null }).map;
      if (map && !seen.has(map)) {
        seen.add(map);
        map.dispose();
      }
      if (!seen.has(mat)) {
        seen.add(mat);
        mat.dispose();
      }
    }
  });
}

/**
 * A live 3D render of a Minecraft skin that idles like a real player — subtle
 * breathing plus an occasional gesture — instead of walking in place forever.
 * Drag to spin, click to poke it. Heavier than {@link SkinViewer3D} (loads a
 * rigged glTF + runs an AnimationMixer), so use it for the one prominent
 * viewer, not for grids of thumbnails.
 */
export function SkinViewerAnimated({
  skinUrl,
  capeUrl,
  variant = "auto-detect",
  width = 150,
  height = 210,
  className,
  effect = "none",
}: SkinViewerAnimatedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pivotRef = useRef<THREE.Group | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const schedulerRef = useRef<IdleScheduler | null>(null);
  const yawRef = useRef(0);

  // Renderer / scene / camera / render loop — recreated only on resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // updateStyle:true so the canvas' CSS size stays width x height even when
    // the device pixel ratio inflates the drawing buffer.
    renderer.setSize(width, height, true);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-3, 4, 2);
    scene.add(key);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1, 4);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    // Everything animated hangs off this pivot so drag-to-rotate survives a
    // skin/cape swap (which rebuilds the model but not this group).
    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    // Cosmetic backdrop. Soul-fire hangs off the pivot (its column follows the
    // character's feet); cherry petals live in world space so they keep falling
    // straight down and stay *behind* the character even while it's spun.
    let sceneEffect: SceneEffect | null = null;
    if (effect === "soul-fire") {
      const fire = new SoulFire(0.4, height * 0.42);
      pivot.add(fire.points, fire.light);
      sceneEffect = fire;
    } else if (effect === "cherry-petals") {
      // topY / bottomY sit well outside the framed area at every viewer size;
      // spread is a narrow column ~the character's width so nothing hits the edge.
      const petals = new CherryPetals(3.5, -0.7, 0.4);
      scene.add(petals.mesh);
      sceneEffect = petals;
    }

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // requestAnimationFrame already pauses when the window isn't visible;
      // clamp so the first frame after a long pause doesn't lurch the animation.
      const delta = Math.min(clock.getDelta(), 0.1);
      mixerRef.current?.update(delta);
      sceneEffect?.update(delta);
      pivot.rotation.y = yawRef.current;
      renderer.render(scene, camera);
    };
    tick();

    // Drag to rotate; a press that doesn't move is a click -> poke.
    let dragging = false;
    let lastX = 0;
    let moved = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      if (Math.abs(dx) > 1) moved = true;
      yawRef.current += dx * 0.01;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!moved) schedulerRef.current?.playInteract();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
      mixerRef.current = null;
      if (modelRef.current) disposeModel(modelRef.current);
      modelRef.current = null;
      sceneEffect?.dispose();
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      pivotRef.current = null;
    };
  }, [width, height, effect]);

  // Load / swap the model + textures whenever the skin, cape or variant change.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const skinImg = await loadImage(skinUrl);
      if (cancelled) return;

      const skinCanvas = document.createElement("canvas");
      loadSkinToCanvas(skinCanvas, skinImg);
      const model =
        variant === "auto-detect" ? (inferModelType(skinCanvas) === "slim" ? "slim" : "classic") : variant;

      let capeCanvas: HTMLCanvasElement | null = null;
      if (capeUrl) {
        try {
          const capeImg = await loadImage(capeUrl);
          if (cancelled) return;
          capeCanvas = document.createElement("canvas");
          loadCapeToCanvas(capeCanvas, capeImg);
        } catch {
          capeCanvas = null;
        }
      }

      const gltf = await loadModel(model === "slim" ? slimModelUrl : classicModelUrl);
      if (cancelled) return;

      const pivot = pivotRef.current;
      if (!pivot) return;

      // Tear down the previous model/mixer.
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
      mixerRef.current = null;
      if (modelRef.current) {
        pivot.remove(modelRef.current);
        disposeModel(modelRef.current);
        modelRef.current = null;
      }

      const root = gltf.scene.clone(true);
      isolateMaterials(root);
      const skinTex = makePixelTexture(skinCanvas);
      const capeTex = capeCanvas ? makePixelTexture(capeCanvas) : null;
      applySkin(root, skinTex, capeTex);
      pivot.add(root);
      modelRef.current = root;

      // Frame the camera to the model's real bounds (differs a little between
      // slim/classic and with/without a cape).
      const camera = cameraRef.current;
      if (camera) {
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        // Fill ~88% of the viewport height; the ~12% margin leaves room for the
        // gestures that raise an arm above the head.
        const dist = size.y / 2 / (0.88 * Math.tan((camera.fov * Math.PI) / 360));
        camera.position.set(0, center.y, dist);
        camera.lookAt(0, center.y, 0);
        camera.updateProjectionMatrix();
      }

      const mixer = new THREE.AnimationMixer(root);
      const actions = new Map<string, THREE.AnimationAction>();
      for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      const scheduler = new IdleScheduler(mixer, actions);
      scheduler.start();
      mixerRef.current = mixer;
      schedulerRef.current = scheduler;
    })().catch(() => {
      /* bad skin/cape URL or model load failure — leave whatever's on screen */
    });

    return () => {
      cancelled = true;
    };
    // width/height/effect are here too: any of them rebuilds the scene in the
    // other effect, which leaves an empty pivot this effect has to repopulate.
  }, [skinUrl, capeUrl, variant, width, height, effect]);

  return <canvas ref={canvasRef} className={className} />;
}
