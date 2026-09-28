import * as THREE from "three";
import { loadImage } from "skinview-utils";
import { getParticleFrames } from "@/services/electron";

// Data-driven avatar decorations built from Minecraft's own particles. Each
// effect is one or more layers; a layer is a pool of textured quads (one
// `InstancedMesh`) whose texture is the vanilla particle's frames, pulled at
// runtime from a client jar the user already downloaded (mc:get-particle-frames
// — never shipped with the app). Many vanilla particle textures are greyscale
// and get tinted by the game (spores, portal, runes, notes…); `tints` does the
// same here. Quads live in world space — the viewer's camera always looks
// straight down -Z, so an unrotated plane is already a camera-facing billboard.
// Depth-tested but not depth-writing, so the character hides whatever passes
// behind it.

type Range = [number, number];

export interface ParticleLayer {
  /** Vanilla particle id — its particles/<id>.json decides the frames. */
  particle: string;
  count: number;
  /** "sprite" = flat billboard (optionally rolling); "tumble" = a falling leaf
   *  flipping over in 3D, thinning to a sliver edge-on. */
  mode?: "sprite" | "tumble";
  blend?: "normal" | "additive";
  /** Colours multiplied into the texture, one picked per particle. */
  tints?: number[];
  /** Random brightness multiplier per particle (>1 brightens). */
  shade?: Range;
  /** "life" plays the frames over the particle's lifetime (the game's order);
   *  "random" (default) gives each particle one random frame. */
  frames?: "random" | "life";
  life: Range;
  size: Range;
  sizeOverLife?: [number, number];
  /** Fraction of the life spent fading in / out. */
  fade?: [number, number];
  opacity?: number;
  spawn: {
    radius: Range;
    y: Range;
    /** Centre offset on Z — negative puts the cloud behind the character. */
    z?: number;
  };
  velocity?: [number, number, number];
  jitter?: [number, number, number];
  gravity?: number;
  drag?: number;
  /** Random acceleration — aimless drifting. */
  wander?: number;
  /** Side-to-side sway: amplitude, frequency. */
  sway?: [number, number];
  /** Pull toward (0, y, z) — runes flying to the table, portal motes. */
  attract?: { strength: number; y: number; z?: number };
  /** Roll speed range (rad/s) for sprites. */
  spin?: Range;
  /** 0..1 — how hard the alpha twinkles. */
  flicker?: number;
  /** Solid colour drawn when no cached jar has this particle. */
  fallback: number;
}

export interface ParticleEffectDef {
  layers: ParticleLayer[];
  /** Coloured, flickering point light near the feet (fire). */
  light?: { color: number; intensity: number };
  /** Dimmer, bluish scene lighting so glowing particles read better. */
  night?: boolean;
}

const FOLIAGE = [0x59ae30, 0x48b518, 0x6a9c2c, 0x77ab2f, 0x4f9a28];

export const PARTICLE_EFFECTS = {
  "pale-garden": {
    layers: [
      {
        particle: "pale_oak_leaves",
        count: 30,
        mode: "tumble",
        shade: [1.25, 1.6],
        life: [5, 8],
        size: [0.15, 0.21],
        fade: [0.03, 0.05],
        spawn: { radius: [0, 0.85], y: [2.6, 2.9], z: -0.35 },
        velocity: [0, -0.55, 0],
        jitter: [0.04, 0.1, 0.04],
        sway: [0.08, 0.8],
        fallback: 0xa6ab9f,
      },
    ],
  },
  "falling-leaves": {
    layers: [
      {
        particle: "tinted_leaves",
        count: 30,
        mode: "tumble",
        tints: FOLIAGE,
        shade: [1.6, 2.1],
        life: [5, 8],
        size: [0.15, 0.21],
        fade: [0.03, 0.05],
        spawn: { radius: [0, 0.85], y: [2.6, 2.9], z: -0.35 },
        velocity: [0, -0.55, 0],
        jitter: [0.04, 0.1, 0.04],
        sway: [0.08, 0.8],
        fallback: 0x59ae30,
      },
    ],
  },
  "spore-blossom": {
    layers: [
      {
        particle: "spore_blossom_air",
        count: 45,
        tints: [0x528038],
        shade: [1.6, 2.2],
        life: [4, 8],
        size: [0.24, 0.3],
        fade: [0.25, 0.3],
        spawn: { radius: [0.15, 0.85], y: [0, 2.2], z: -0.1 },
        velocity: [0, -0.02, 0],
        wander: 0.25,
        drag: 1.2,
        fallback: 0x7cc050,
      },
      {
        particle: "falling_spore_blossom",
        count: 10,
        tints: [0x528038],
        shade: [1.3, 2],
        life: [6, 8],
        size: [0.16, 0.22],
        fade: [0.03, 0.05],
        spawn: { radius: [0, 0.8], y: [2.5, 2.8], z: -0.2 },
        velocity: [0, -0.4, 0],
        sway: [0.04, 1],
        fallback: 0x7cc050,
      },
    ],
  },
  snowfall: {
    layers: [
      {
        particle: "snowflake",
        count: 45,
        frames: "life",
        life: [5, 8],
        size: [0.12, 0.17],
        fade: [0.03, 0.08],
        spawn: { radius: [0, 0.85], y: [2.5, 2.8], z: -0.35 },
        velocity: [0, -0.5, 0],
        jitter: [0.05, 0.1, 0.05],
        sway: [0.07, 1.1],
        fallback: 0xffffff,
      },
    ],
  },
  "crimson-spores": {
    layers: [
      {
        particle: "crimson_spore",
        count: 70,
        tints: [0xe02020, 0xb81818, 0xff4a3a],
        life: [4, 8],
        size: [0.28, 0.36],
        fade: [0.25, 0.3],
        spawn: { radius: [0.1, 0.85], y: [-0.1, 2.3] },
        velocity: [0, -0.08, 0],
        wander: 0.15,
        drag: 0.8,
        fallback: 0xe02020,
      },
    ],
  },
  "warped-spores": {
    layers: [
      {
        particle: "warped_spore",
        count: 70,
        tints: [0x3fd0e0, 0x2a9fd6, 0x4ae8c8],
        life: [4, 8],
        size: [0.28, 0.36],
        fade: [0.25, 0.3],
        spawn: { radius: [0.1, 0.85], y: [-0.1, 2.3] },
        velocity: [0, 0.08, 0],
        wander: 0.15,
        drag: 0.8,
        fallback: 0x3fd0e0,
      },
    ],
  },
  ash: {
    layers: [
      {
        particle: "ash",
        count: 40,
        tints: [0x3c3c3c, 0x555555],
        life: [4, 7],
        size: [0.3, 0.36],
        fade: [0.2, 0.3],
        spawn: { radius: [0.1, 0.85], y: [0, 2.4] },
        velocity: [0.05, -0.18, 0],
        wander: 0.12,
        drag: 0.6,
        fallback: 0x4a4a4a,
      },
      {
        particle: "white_ash",
        count: 25,
        tints: [0xc8c8c8, 0xe6e6e6],
        life: [4, 7],
        size: [0.3, 0.36],
        fade: [0.2, 0.3],
        spawn: { radius: [0.1, 0.85], y: [0, 2.4] },
        velocity: [0.05, -0.18, 0],
        wander: 0.12,
        drag: 0.6,
        fallback: 0xd0d0d0,
      },
    ],
  },
  souls: {
    layers: [
      {
        particle: "soul",
        count: 10,
        frames: "life",
        life: [1.6, 2.4],
        size: [0.3, 0.38],
        fade: [0.05, 0.2],
        spawn: { radius: [0.2, 0.7], y: [0, 1.2] },
        velocity: [0, 0.35, 0],
        jitter: [0.05, 0.1, 0.05],
        fallback: 0x5fd8e6,
      },
    ],
  },
  enchant: {
    layers: [
      {
        particle: "enchant",
        count: 30,
        tints: [0xe6e6ff],
        shade: [0.6, 1],
        life: [1.4, 2.2],
        size: [0.16, 0.2],
        fade: [0.1, 0.25],
        spawn: { radius: [0.6, 0.85], y: [0.4, 1.9] },
        velocity: [0, 0.25, 0],
        drag: 0.8,
        attract: { strength: 2.2, y: 1.1, z: 0.4 },
        fallback: 0xe6e6ff,
      },
    ],
  },
  portal: {
    layers: [
      {
        particle: "portal",
        count: 60,
        tints: [0xe64dff],
        shade: [0.75, 1.25],
        life: [1, 1.8],
        size: [0.2, 0.28],
        sizeOverLife: [1, 0.3],
        fade: [0.1, 0.2],
        spawn: { radius: [0.55, 0.85], y: [0, 2] },
        attract: { strength: 1.5, y: 1 },
        drag: 0.5,
        fallback: 0xb03cd0,
      },
    ],
  },
  "end-rod": {
    layers: [
      {
        particle: "end_rod",
        count: 24,
        frames: "life",
        blend: "additive",
        life: [2.5, 4],
        size: [0.18, 0.24],
        fade: [0.1, 0.35],
        flicker: 0.6,
        spawn: { radius: [0.2, 0.85], y: [0, 2.1] },
        velocity: [0, 0.02, 0],
        wander: 0.12,
        drag: 1,
        fallback: 0xffffff,
      },
    ],
  },
  glow: {
    night: true,
    layers: [
      {
        particle: "glow",
        count: 30,
        blend: "additive",
        tints: [0x99ffcc, 0x4fd6c6, 0x2aa7a0],
        life: [2, 4],
        size: [0.2, 0.28],
        sizeOverLife: [1, 0.6],
        fade: [0.2, 0.4],
        spawn: { radius: [0.2, 0.85], y: [0, 2.1] },
        velocity: [0, 0.05, 0],
        wander: 0.2,
        drag: 1.2,
        fallback: 0x7fe8c8,
      },
    ],
  },
  "sculk-souls": {
    night: true,
    layers: [
      {
        particle: "sculk_soul",
        count: 16,
        frames: "life",
        blend: "additive",
        life: [1.4, 2],
        size: [0.36, 0.44],
        fade: [0.05, 0.2],
        spawn: { radius: [0.25, 0.75], y: [0, 1.4] },
        velocity: [0, 0.4, 0],
        fallback: 0x2fe0e8,
      },
    ],
  },
  notes: {
    layers: [
      {
        particle: "note",
        count: 12,
        tints: [0x5bff3c, 0xffe33c, 0xff6a3c, 0xff3cb4, 0xb43cff, 0x3c7bff, 0x3cf0ff],
        shade: [1.4, 1.8],
        life: [1.2, 1.8],
        size: [0.2, 0.26],
        fade: [0.1, 0.35],
        spawn: { radius: [0.3, 0.8], y: [1.2, 2] },
        velocity: [0, 0.35, 0],
        drag: 1.5,
        fallback: 0x5bff3c,
      },
    ],
  },
  "electric-spark": {
    layers: [
      {
        particle: "electric_spark",
        count: 30,
        blend: "additive",
        tints: [0xffffff, 0xd7f2ff, 0xfff5b0],
        life: [0.2, 0.5],
        size: [0.1, 0.16],
        fade: [0, 0.5],
        flicker: 0.8,
        spawn: { radius: [0.2, 0.8], y: [0, 2.1] },
        jitter: [0.8, 0.8, 0.8],
        drag: 4,
        fallback: 0xd7f2ff,
      },
    ],
  },
  hearts: {
    layers: [
      {
        particle: "heart",
        count: 7,
        life: [1.6, 2.4],
        size: [0.2, 0.24],
        fade: [0.1, 0.3],
        spawn: { radius: [0.3, 0.75], y: [0.8, 1.5] },
        velocity: [0, 0.3, 0],
        jitter: [0.05, 0.05, 0.05],
        drag: 0.5,
        fallback: 0xd32a2a,
      },
    ],
  },
  "dragon-breath": {
    layers: [
      {
        particle: "dragon_breath",
        count: 40,
        frames: "life",
        opacity: 0.55,
        tints: [0xc04dff, 0xe060ff, 0x9a3dff],
        shade: [0.8, 1.1],
        life: [2, 3.5],
        size: [0.25, 0.4],
        sizeOverLife: [0.6, 1.2],
        fade: [0.2, 0.4],
        spawn: { radius: [0.1, 0.8], y: [0, 0.5] },
        velocity: [0, 0.06, 0],
        jitter: [0.12, 0.03, 0.12],
        drag: 0.6,
        fallback: 0xc04dff,
      },
    ],
  },
  campfire: {
    light: { color: 0xff9a3c, intensity: 0.5 },
    layers: [
      {
        particle: "campfire_cosy_smoke",
        count: 10,
        frames: "life",
        opacity: 0.85,
        life: [4, 6],
        size: [0.6, 0.9],
        sizeOverLife: [0.7, 1.3],
        fade: [0.15, 0.5],
        spawn: { radius: [0, 0.5], y: [0, 0.6], z: -0.3 },
        velocity: [0, 0.35, 0],
        wander: 0.05,
        spin: [-0.3, 0.3],
        fallback: 0x6b6661,
      },
      {
        particle: "flame",
        count: 18,
        life: [0.6, 1.1],
        size: [0.16, 0.22],
        sizeOverLife: [1, 0.2],
        fade: [0, 0.3],
        spawn: { radius: [0.3, 0.7], y: [0, 0.25] },
        velocity: [0, 0.25, 0],
        jitter: [0.03, 0.05, 0.03],
        fallback: 0xff8a00,
      },
    ],
  },
} satisfies Record<string, ParticleEffectDef>;

export type ParticleEffectId = keyof typeof PARTICLE_EFFECTS;

export function isParticleEffectId(id: string): id is ParticleEffectId {
  return Object.prototype.hasOwnProperty.call(PARTICLE_EFFECTS, id);
}

// ─── Textures ────────────────────────────────────────────────────────────────

function makeStripTexture(canvas: HTMLCanvasElement, frames: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.userData.frames = frames;
  return tex;
}

// A plain square, tinted per layer — shown until (or unless) the jar frames load.
let fallbackTexture: THREE.Texture | null = null;
function getFallbackTexture(): THREE.Texture {
  if (fallbackTexture) return fallbackTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(3, 3, 2, 2);
  fallbackTexture = makeStripTexture(c, 1);
  return fallbackTexture;
}

// Every frame of a particle stitched into one horizontal strip. Memoised per
// particle; resolves to null when no cached jar has it.
const atlasCache = new Map<string, Promise<THREE.Texture | null>>();
function getParticleAtlas(particleId: string): Promise<THREE.Texture | null> {
  let p = atlasCache.get(particleId);
  if (!p) {
    p = (async () => {
      const frames = await getParticleFrames(particleId);
      if (!frames?.length) return null;
      const imgs = await Promise.all(frames.map((src) => loadImage(src)));
      const fw = Math.max(...imgs.map((i) => i.width));
      const fh = Math.max(...imgs.map((i) => i.height));
      const c = document.createElement("canvas");
      c.width = fw * imgs.length;
      c.height = fh;
      const g = c.getContext("2d")!;
      imgs.forEach((img, i) => g.drawImage(img, i * fw, 0));
      return makeStripTexture(c, imgs.length);
    })().catch(() => null);
    atlasCache.set(particleId, p);
  }
  return p;
}

// ─── Simulation ──────────────────────────────────────────────────────────────

const rand = ([a, b]: Range) => a + Math.random() * (b - a);

class ParticleLayerSystem {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private phase: Float32Array;
  private spinSpeed: Float32Array;
  private flipAxis: THREE.Vector3[] = [];
  private flipSpeed: Float32Array;
  private tintIdx: Uint8Array;
  private shade: Float32Array;
  private aFrame: THREE.InstancedBufferAttribute;
  private aAlpha: THREE.InstancedBufferAttribute;
  private uFrameCount = { value: 1 };
  private frameCount = 1;
  private usingAtlas = false;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshBasicMaterial;
  private disposed = false;
  private time = 0;

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private static Z = new THREE.Vector3(0, 0, 1);
  private static Y = new THREE.Vector3(0, 1, 0);

  constructor(private def: ParticleLayer) {
    const n = (this.n = def.count);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.spinSpeed = new Float32Array(n);
    this.flipSpeed = new Float32Array(n);
    this.tintIdx = new Uint8Array(n);
    this.shade = new Float32Array(n);

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.geometry.setAttribute("aFrame", this.aFrame);
    this.geometry.setAttribute("aAlpha", this.aAlpha);

    this.material = new THREE.MeshBasicMaterial({
      map: getFallbackTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: def.blend === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uFrameCount = this.uFrameCount;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float aFrame;\nattribute float aAlpha;\nuniform float uFrameCount;\nvarying float vAlpha;"
        )
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv.x = (vMapUv.x + aFrame) / uFrameCount;\n#endif\n\tvAlpha = aAlpha;"
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vAlpha;")
        .replace("#include <alphatest_fragment>", "diffuseColor.a *= vAlpha;\n\tif (diffuseColor.a < 0.01) discard;\n#include <alphatest_fragment>");
    };

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      this.flipAxis.push(new THREE.Vector3());
      this.respawn(i, Math.random());
    }
    this.writeColors();
    this.flush();

    getParticleAtlas(def.particle).then((atlas) => {
      if (this.disposed || !atlas) return;
      this.material.map = atlas; // shared, module-cached — never disposed here
      this.material.needsUpdate = true;
      this.frameCount = atlas.userData.frames as number;
      this.uFrameCount.value = this.frameCount;
      this.usingAtlas = true;
      for (let i = 0; i < n; i++) this.pickFrame(i);
      this.writeColors();
      this.aFrame.needsUpdate = true;
    });
  }

  private pickFrame(i: number) {
    // "random" is the default — only "life" drives the frame from age instead
    if (this.def.frames !== "life") this.aFrame.setX(i, Math.floor(Math.random() * this.frameCount));
  }

  private respawn(i: number, prefill = 0) {
    const d = this.def;
    const angle = Math.random() * Math.PI * 2;
    const r = rand(d.spawn.radius);
    this.pos[i * 3] = Math.cos(angle) * r;
    this.pos[i * 3 + 1] = rand(d.spawn.y);
    this.pos[i * 3 + 2] = Math.sin(angle) * r * 0.8 + (d.spawn.z ?? 0);
    const [vx, vy, vz] = d.velocity ?? [0, 0, 0];
    const [jx, jy, jz] = d.jitter ?? [0, 0, 0];
    this.vel[i * 3] = vx + (Math.random() * 2 - 1) * jx;
    this.vel[i * 3 + 1] = vy + (Math.random() * 2 - 1) * jy;
    this.vel[i * 3 + 2] = vz + (Math.random() * 2 - 1) * jz;
    this.life[i] = rand(d.life);
    this.size[i] = rand(d.size);
    this.phase[i] = Math.random() * Math.PI * 2;
    this.spinSpeed[i] = d.spin ? rand(d.spin) : 0;
    this.tintIdx[i] = d.tints ? Math.floor(Math.random() * d.tints.length) : 0;
    this.shade[i] = d.shade ? rand(d.shade) : 1;
    if (d.mode === "tumble") {
      const a = Math.random() * Math.PI * 2;
      this.flipAxis[i].set(Math.cos(a), (Math.random() - 0.5) * 0.4, Math.sin(a)).normalize();
      this.flipSpeed[i] = 1.4 + Math.random() * 2.2;
      this.spinSpeed[i] = (Math.random() - 0.5) * 1.3;
    }
    this.age[i] = 0;
    this.pickFrame(i);
    // Fast-forward a random way into the life so a freshly-mounted viewer
    // starts full, instead of visibly filling up over the first seconds.
    const target = prefill * this.life[i];
    while (this.age[i] + 0.05 < target) this.step(i, 0.05);
  }

  private step(i: number, dt: number) {
    const d = this.def;
    const k = i * 3;
    if (d.gravity) this.vel[k + 1] += d.gravity * dt;
    if (d.wander) {
      this.vel[k] += (Math.random() * 2 - 1) * d.wander * dt * 4;
      this.vel[k + 1] += (Math.random() * 2 - 1) * d.wander * dt * 2;
      this.vel[k + 2] += (Math.random() * 2 - 1) * d.wander * dt * 4;
    }
    if (d.attract) {
      this.vel[k] += -this.pos[k] * d.attract.strength * dt;
      this.vel[k + 1] += (d.attract.y - this.pos[k + 1]) * d.attract.strength * dt;
      this.vel[k + 2] += ((d.attract.z ?? 0) - this.pos[k + 2]) * d.attract.strength * dt;
    }
    if (d.drag) {
      const f = Math.max(0, 1 - d.drag * dt);
      this.vel[k] *= f;
      this.vel[k + 2] *= f;
      // velocity/gravity-driven motion keeps its base vertical drift
      const vy = d.velocity?.[1] ?? 0;
      this.vel[k + 1] = vy + (this.vel[k + 1] - vy) * f;
    }
    this.pos[k] += this.vel[k] * dt;
    this.pos[k + 1] += this.vel[k + 1] * dt;
    this.pos[k + 2] += this.vel[k + 2] * dt;
    this.age[i] += dt;
  }

  private writeColors() {
    const d = this.def;
    for (let i = 0; i < this.n; i++) {
      if (this.usingAtlas) this.c.setHex(d.tints ? d.tints[this.tintIdx[i]] : 0xffffff);
      else this.c.setHex(d.fallback);
      this.c.multiplyScalar(this.shade[i]);
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private flush() {
    const d = this.def;
    const [fadeIn, fadeOut] = d.fade ?? [0.15, 0.3];
    const [s0, s1] = d.sizeOverLife ?? [1, 1];
    for (let i = 0; i < this.n; i++) {
      const t = Math.min(1, this.age[i] / this.life[i]);
      let alpha = (d.opacity ?? 1) * Math.min(1, fadeIn > 0 ? t / fadeIn : 1) * Math.min(1, fadeOut > 0 ? (1 - t) / fadeOut : 1);
      if (d.flicker) alpha *= 1 - d.flicker * 0.5 * (1 + Math.sin(this.time * 17 + this.phase[i] * 5));
      this.aAlpha.setX(i, Math.max(0, alpha));
      if (d.frames === "life") this.aFrame.setX(i, Math.min(this.frameCount - 1, Math.floor(t * this.frameCount)));

      const k = i * 3;
      let x = this.pos[k];
      let z = this.pos[k + 2];
      if (d.sway) {
        x += Math.sin(this.time * d.sway[1] + this.phase[i]) * d.sway[0];
        z += Math.cos(this.time * d.sway[1] * 0.7 + this.phase[i]) * d.sway[0] * 0.5;
      }
      this.p.set(x, this.pos[k + 1], z);
      if (d.mode === "tumble") {
        this.q.setFromAxisAngle(this.flipAxis[i], this.phase[i] + this.time * this.flipSpeed[i]);
        this.q2.setFromAxisAngle(ParticleLayerSystem.Y, this.time * this.spinSpeed[i]);
        this.q.premultiply(this.q2);
      } else {
        this.q.setFromAxisAngle(ParticleLayerSystem.Z, this.spinSpeed[i] ? this.phase[i] + this.age[i] * this.spinSpeed[i] : 0);
      }
      this.s.setScalar(this.size[i] * (s0 + (s1 - s0) * t));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
    this.aFrame.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    let respawned = false;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) {
        this.respawn(i);
        respawned = true;
      } else {
        this.step(i, dt);
      }
    }
    if (respawned) this.writeColors();
    this.flush();
  }

  dispose() {
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** One avatar decoration: all its particle layers plus an optional light. */
export class ParticleEffect {
  readonly object = new THREE.Group();
  private layers: ParticleLayerSystem[];
  private light: THREE.PointLight | null = null;
  private baseIntensity = 0;
  private time = 0;

  constructor(def: ParticleEffectDef) {
    this.layers = def.layers.map((l) => new ParticleLayerSystem(l));
    for (const l of this.layers) this.object.add(l.mesh);
    if (def.light) {
      this.baseIntensity = def.light.intensity;
      this.light = new THREE.PointLight(def.light.color, def.light.intensity, 2.8, 2);
      this.light.position.set(0, 0.15, 0.7);
      this.object.add(this.light);
    }
  }

  update(dt: number) {
    this.time += dt;
    for (const l of this.layers) l.update(dt);
    if (this.light) {
      this.light.intensity =
        this.baseIntensity * (1 + Math.sin(this.time * 13) * 0.2 + Math.sin(this.time * 6.7) * 0.15);
    }
  }

  dispose() {
    for (const l of this.layers) l.dispose();
  }
}
