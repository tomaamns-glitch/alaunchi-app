import { Box3, BoxGeometry, BufferAttribute, Euler, Group, Matrix4, Mesh, Quaternion, Vector3, type Material } from "three";
import { PlayerAnimation, type PlayerObject } from "skinview3d";
import type { EmoteAxis, EmoteBoneTrack, EmoteKeyframe, ParsedEmote } from "@/lib/emotecraft";

// A faithful port of how Emotecraft 2.4 actually plays an emote in-game, so the
// preview matches Minecraft frame by frame. Sources (read, not guessed):
//  - playerAnimator (github.com/KosmX/minecraftPlayerAnimator, branch 1.21):
//    KeyframeAnimationPlayer (timeline/interpolation), Ease/Easing,
//    PlayerModelMixin + AnimationApplier (per-part values, rest pose),
//    PlayerRendererMixin.applyBodyTransforms (the "body" part = whole player),
//    BipedEntityModelMixin + IBendHelper.rotateMatrixStack (upper body follows
//    the body bend).
//  - bendy-lib (github.com/KosmX/bendy-lib): IBendable.applyBend /
//    BendableCuboid (how elbows, knees and the waist bend).
// Everything below works in Minecraft's own model space (pixels, Y down, the
// model facing -Z) with Minecraft's own numbers; only the root of the rig
// converts that into skinview3d's space, the same way Minecraft's renderer does.

const TICKS_PER_SECOND = 20;
/** Pause between plays of a non-looping emote, in ticks. */
const REPLAY_GAP_TICKS = 20;

// ───────────────────────── Easing (core/util/Ease + Easing) ─────────────────

type EaseFn = (t: number) => number;
const easeOut = (f: EaseFn): EaseFn => (t) => 1 - f(1 - t);
const easeInOut =
  (f: EaseFn): EaseFn =>
  (t) =>
    t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2;

const sine: EaseFn = (n) => 1 - Math.cos((n * Math.PI) / 2);
const cubic: EaseFn = (n) => n * n * n;
const quadratic: EaseFn = (n) => n * n;
const pow =
  (p: number): EaseFn =>
  (t) =>
    Math.pow(t, p);
const exp: EaseFn = (n) => Math.pow(2, 10 * (n - 1));
const circle: EaseFn = (n) => 1 - Math.sqrt(1 - n * n);
function back(arg: number | null): EaseFn {
  const n2 = arg == null ? 1.70158 : arg * 1.70158;
  return (t) => t * t * ((n2 + 1) * t - n2);
}
function elastic(arg: number | null): EaseFn {
  const n2 = arg == null ? 1 : arg;
  return (t) => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * n2 * Math.PI);
}
function bounce(arg: number | null): EaseFn {
  const n2 = arg == null ? 0.5 : arg;
  return (x) =>
    Math.min(
      Math.min((121 / 16) * x * x, (121 / 4) * n2 * Math.pow(x - 6 / 11, 2) + 1 - n2),
      Math.min(121 * n2 * n2 * Math.pow(x - 9 / 11, 2) + 1 - n2 * n2, 484 * n2 * n2 * n2 * Math.pow(x - 10.5 / 11, 2) + 1 - n2 * n2 * n2)
    );
}
function step(arg: number | null): EaseFn {
  const steps = Math.max(2, Math.floor(arg == null ? 2 : arg));
  const stepLength = 1 / steps;
  return (t) => {
    if (t < 0) return 0;
    const last = (steps - 1) * stepLength;
    if (t > last) return last;
    return Math.floor(t / stepLength) * stepLength;
  };
}
// Easing.catmullRom simplifies to n + 2 — kept literally, odd as it is.
const catmullRom: EaseFn = (n) => n + 2;

function easeFor(id: number, arg: number | null): EaseFn {
  switch (id) {
    case 1: return () => 0; // CONSTANT
    case 6: return sine;
    case 7: return easeOut(sine);
    case 8: return easeInOut(sine);
    case 9: return cubic;
    case 10: return easeOut(cubic);
    case 11: return easeInOut(cubic);
    case 12: return quadratic;
    case 13: return easeOut(quadratic);
    case 14: return easeInOut(quadratic);
    case 15: return pow(4);
    case 16: return easeOut(pow(4));
    case 17: return easeInOut(pow(4));
    case 18: return pow(5);
    case 19: return easeOut(pow(5));
    case 20: return easeInOut(pow(5));
    case 21: return exp;
    case 22: return easeOut(exp);
    case 23: return easeInOut(exp);
    case 24: return circle;
    case 25: return easeOut(circle);
    case 26: return easeInOut(circle);
    case 27: return back(arg);
    case 28: return easeOut(back(arg));
    case 29: return easeInOut(back(arg));
    case 30: return elastic(arg);
    case 31: return easeOut(elastic(arg));
    case 32: return easeInOut(elastic(arg));
    case 33: return bounce(arg);
    case 34: return easeOut(bounce(arg));
    case 35: return easeInOut(bounce(arg));
    case 36: return easeInOut(catmullRom);
    case 37: return step(arg);
    case 0:
    default:
      return (t) => t; // LINEAR (also Ease.getEase's fallback for unknown ids)
  }
}

// ───────────────────── Timeline (KeyframeAnimationPlayer.Axis) ──────────────

interface PlayState {
  /** KeyframeAnimationPlayer.currentTick */
  tick: number;
  /** partial tick (0..1) */
  delta: number;
  isLoopStarted: boolean;
}

const EASE_INOUTSINE = 8; // KeyFrame(int, float)'s default ease for virtual frames
function frame(tick: number, value: number, easing = EASE_INOUTSINE, easingArg: number | null = null): EmoteKeyframe {
  return { tick, value, easing, easingArg };
}

/** State.findAtTick: index of the last keyframe at or before `tick`, -1 if none. */
function findAtTick(kfs: EmoteKeyframe[], tick: number): number {
  let lo = 0;
  let hi = kfs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].tick <= tick) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Axis.getValueAtCurrentTick — `current` is the vanilla value the part
 *  already has this frame, `def` the part's default (rest) value. */
function axisValue(axis: EmoteAxis, def: number, current: number, e: ParsedEmote, s: PlayState): number {
  if (axis === null) return current;
  const kfs = axis;

  const findBefore = (pos: number): EmoteKeyframe => {
    if (pos === -1) {
      return s.tick < e.beginTick ? frame(0, current) : s.tick < e.endTick ? frame(e.beginTick, def) : frame(e.endTick, def);
    }
    const f = kfs[pos];
    if (!e.isLoop && s.tick >= e.endTick && pos === kfs.length - 1 && f.tick < e.endTick) {
      return { ...f, tick: e.endTick };
    }
    return f;
  };

  const findAfter = (pos: number): EmoteKeyframe => {
    if (kfs.length > pos + 1) return kfs[pos + 1];
    if (e.isLoop) return frame(e.endTick + 1, def);
    if (s.tick < e.endTick && kfs.length > 0) return { ...kfs[kfs.length - 1], tick: e.endTick };
    return s.tick >= e.endTick ? frame(e.stopTick, current) : s.tick >= e.beginTick ? frame(e.endTick, def) : frame(e.beginTick, def);
  };

  const pos = findAtTick(kfs, s.tick);
  let before = findBefore(pos);
  if (s.isLoopStarted && before.tick < e.returnTick) before = findBefore(findAtTick(kfs, e.endTick));
  let after = findAfter(pos);
  if (e.isLoop && after.tick > e.endTick) after = findAfter(findAtTick(kfs, e.returnTick - 1));

  let tickBefore = before.tick;
  let tickAfter = after.tick;
  if (tickBefore >= tickAfter) {
    if (s.tick < tickBefore) tickBefore -= e.endTick - e.returnTick + 1;
    else tickAfter += e.endTick - e.returnTick + 1;
  }
  if (tickBefore === tickAfter) return before.value;
  const f = (s.tick + s.delta - tickBefore) / (tickAfter - tickBefore);
  // Note: NOT the destination's easing — with isEasingBefore off (every file
  // seen so far) the curve is the one stored on the keyframe it leaves.
  const from = e.easeBefore ? after : before;
  return before.value + easeFor(from.easing, from.easingArg)(f) * (after.value - before.value);
}

/** MathHelper.clampToRadian: wraps into [-π, π). */
function clampToRadian(f: number): number {
  const a = Math.PI * 2;
  let b = (f + Math.PI) % a;
  if (b < 0) b += a;
  return b - Math.PI;
}

/** RotationAxis.getValueAtCurrentTick */
function rotationValue(axis: EmoteAxis, def: number, current: number, e: ParsedEmote, s: PlayState): number {
  return clampToRadian(axisValue(axis, def, clampToRadian(current), e, s));
}

// ─────────────────────────────── Model ──────────────────────────────────────

type Vec3 = [number, number, number];

interface CuboidDef {
  /** Minecraft texture origin (64×64 skin) */
  uv: [number, number];
  /** Box min corner and size, in the part's own space (Minecraft addBox) */
  from: Vec3;
  size: Vec3;
  dilation: number;
}

interface PartDef {
  name: "head" | "torso" | "right_arm" | "left_arm" | "right_leg" | "left_leg";
  /** Rest pivot (setDefaultPivot / HumanoidModel.setupAnim, standing) */
  pivot: Vec3;
  inner: CuboidDef;
  outer: CuboidDef;
  /** bendy-lib bend direction: UP for limbs, DOWN for the torso, none for the head */
  bend: "up" | "down" | null;
  /** Rendered inside the body-bend matrix (IUpperPartHelper) */
  upper: boolean;
}

function partDefs(slim: boolean): PartDef[] {
  const armW = slim ? 3 : 4;
  return [
    {
      name: "head",
      pivot: [0, 0, 0],
      inner: { uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8], dilation: 0 },
      outer: { uv: [32, 0], from: [-4, -8, -4], size: [8, 8, 8], dilation: 0.5 },
      bend: null,
      upper: true,
    },
    {
      name: "torso",
      pivot: [0, 0, 0],
      inner: { uv: [16, 16], from: [-4, 0, -2], size: [8, 12, 4], dilation: 0 },
      outer: { uv: [16, 32], from: [-4, 0, -2], size: [8, 12, 4], dilation: 0.25 },
      bend: "down",
      upper: false,
    },
    {
      name: "right_arm",
      pivot: [-5, 2, 0],
      inner: { uv: [40, 16], from: [slim ? -2 : -3, -2, -2], size: [armW, 12, 4], dilation: 0 },
      outer: { uv: [40, 32], from: [slim ? -2 : -3, -2, -2], size: [armW, 12, 4], dilation: 0.25 },
      bend: "up",
      upper: true,
    },
    {
      name: "left_arm",
      pivot: [5, 2, 0],
      inner: { uv: [32, 48], from: [-1, -2, -2], size: [armW, 12, 4], dilation: 0 },
      outer: { uv: [48, 48], from: [-1, -2, -2], size: [armW, 12, 4], dilation: 0.25 },
      bend: "up",
      upper: true,
    },
    {
      name: "right_leg",
      pivot: [-1.9, 12, 0.1],
      inner: { uv: [0, 16], from: [-2, 0, -2], size: [4, 12, 4], dilation: 0 },
      outer: { uv: [0, 32], from: [-2, 0, -2], size: [4, 12, 4], dilation: 0.25 },
      bend: "up",
      upper: false,
    },
    {
      name: "left_leg",
      pivot: [1.9, 12, 0.1],
      inner: { uv: [16, 48], from: [-2, 0, -2], size: [4, 12, 4], dilation: 0 },
      outer: { uv: [0, 48], from: [-2, 0, -2], size: [4, 12, 4], dilation: 0.25 },
      bend: "up",
      upper: false,
    },
  ];
}

/** skinview3d's setUVs, returning the 4 corner UVs of each BoxGeometry face
 *  (order px, nx, py, ny, pz, nz) instead of writing them. */
function skinCornerUVs(u: number, v: number, width: number, height: number, depth: number): [number, number][][] {
  const W = 64;
  const H = 64;
  const face = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [
    [x1 / W, 1 - y2 / H],
    [x2 / W, 1 - y2 / H],
    [x2 / W, 1 - y1 / H],
    [x1 / W, 1 - y1 / H],
  ];
  const top = face(u + depth, v, u + width + depth, v + depth);
  const bottom = face(u + width + depth, v, u + width * 2 + depth, v + depth);
  const left = face(u, v + depth, u + depth, v + depth + height);
  const front = face(u + depth, v + depth, u + width + depth, v + depth + height);
  const right = face(u + width + depth, v + depth, u + width + depth * 2, v + height + depth);
  const back = face(u + width + depth * 2, v + depth, u + width * 2 + depth * 2, v + height + depth);
  return [
    [right[3], right[2], right[0], right[1]],
    [left[3], left[2], left[0], left[1]],
    [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    [front[3], front[2], front[0], front[1]],
    [back[3], back[2], back[0], back[1]],
  ];
}

interface BendData {
  dir: Vector3;
  inverted: boolean;
  center: Vector3;
  baseN: Vector3;
  baseD: number;
  otherN: Vector3;
  otherD: number;
  halfSize: number;
}

interface Cuboid {
  mesh: Mesh;
  original: Float32Array;
  originalNormals: Float32Array;
  bend: BendData | null;
  bent: boolean;
}

/** A box subdivided per texel like bendy-lib's BendableCuboid (so the bend
 *  deforms smoothly), with skinview3d's skin UVs, in Minecraft part space. */
function buildCuboid(def: CuboidDef, bendDir: "up" | "down" | null, material: Material): Cuboid {
  const [w, h, d] = def.size;
  const dil = def.dilation;
  const geo = new BoxGeometry(w + dil * 2, h + dil * 2, d + dil * 2, w, h, d);

  // UVs: bilinear remap of each face's 0..1 grid onto skinview3d's corner UVs.
  const corners = skinCornerUVs(def.uv[0], def.uv[1], w, h, d);
  const faceGrids: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const uv = geo.attributes.uv as BufferAttribute;
  let vi = 0;
  faceGrids.forEach(([gx, gy], f) => {
    const [k0, k1, k2, k3] = corners[f];
    const count = (gx + 1) * (gy + 1);
    for (let i = 0; i < count; i++, vi++) {
      const s = uv.getX(vi);
      const t = uv.getY(vi);
      const bu = k2[0] + (k3[0] - k2[0]) * s;
      const bv = k2[1] + (k3[1] - k2[1]) * s;
      const tu = k0[0] + (k1[0] - k0[0]) * s;
      const tv = k0[1] + (k1[1] - k0[1]) * s;
      uv.setXY(vi, bu + (tu - bu) * t, bv + (tv - bv) * t);
    }
  });

  // Positions: skinview3d space (Y up, front +Z) → Minecraft part space
  // (Y down, front -Z), a 180° turn about X, centred on the cube.
  const cx = def.from[0] + w / 2;
  const cy = def.from[1] + h / 2;
  const cz = def.from[2] + d / 2;
  const pos = geo.attributes.position as BufferAttribute;
  const nrm = geo.attributes.normal as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, cx + pos.getX(i), cy - pos.getY(i), cz - pos.getZ(i));
    nrm.setXYZ(i, nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  }
  pos.needsUpdate = true;

  const mesh = new Mesh(geo, material);
  let bend: BendData | null = null;
  if (bendDir) {
    // Direction.UP = (0,1,0), DOWN = (0,-1,0) — in model space (Y down).
    const dir = new Vector3(0, bendDir === "up" ? 1 : -1, 0);
    const v1 = new Vector3(def.from[0] - dil, def.from[1] - dil, def.from[2] - dil);
    const v7 = new Vector3(def.from[0] + w + dil, def.from[1] + h + dil, def.from[2] + d + dil);
    const inverted = bendDir === "up";
    const aD = -dir.dot(v7);
    const bD = -dir.dot(v1);
    bend = {
      dir,
      inverted,
      center: new Vector3(cx, cy, cz),
      baseN: dir.clone(),
      baseD: inverted ? aD : bD,
      otherN: dir.clone(),
      otherD: inverted ? bD : aD,
      halfSize: (-dir.dot(v1) + dir.dot(v7)) / 2,
    };
  }
  return {
    mesh,
    original: Float32Array.from(pos.array as ArrayLike<number>),
    originalNormals: Float32Array.from(nrm.array as ArrayLike<number>),
    bend,
    bent: false,
  };
}

const tmpAxis = new Vector3();
const tmpCross = new Vector3();
const tmpP = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();
const tmpT = new Matrix4();

/** bendy-lib IBendable.applyBend, applied to the cuboid's vertices. */
function applyBend(c: Cuboid, bendAxis: number, bendValue: number) {
  const pos = c.mesh.geometry.attributes.position as BufferAttribute;
  const nrm = c.mesh.geometry.attributes.normal as BufferAttribute;
  // BendHelper: no bend below epsilon → the plain cuboid.
  if (!c.bend || Math.abs(bendValue) < 0.0001) {
    if (c.bent) {
      (pos.array as Float32Array).set(c.original);
      (nrm.array as Float32Array).set(c.originalNormals);
      pos.needsUpdate = true;
      nrm.needsUpdate = true;
      c.bent = false;
    }
    return;
  }
  const b = c.bend;
  // axis = (cos a, 0, sin a) rotated by the direction's quaternion (DOWN = 180° about X).
  tmpAxis.set(Math.cos(bendAxis), 0, Math.sin(bendAxis));
  if (b.dir.y < 0) tmpAxis.z = -tmpAxis.z;

  tmpQ.setFromAxisAngle(tmpAxis, bendValue);
  tmpM.makeTranslation(b.center.x, b.center.y, b.center.z);
  tmpM.multiply(tmpT.makeRotationFromQuaternion(tmpQ));
  tmpM.multiply(tmpT.makeTranslation(-b.center.x, -b.center.y, -b.center.z));

  tmpCross.crossVectors(b.dir, tmpAxis).normalize();
  const bendD = -tmpCross.dot(b.center);
  const tanHalf = Math.tan(bendValue / 2);
  const o = c.original;
  for (let i = 0; i < pos.count; i++) {
    tmpP.set(o[i * 3], o[i * 3 + 1], o[i * 3 + 2]);
    const planeDist = tmpCross.dot(tmpP) + bendD;
    const distFromBend = b.inverted ? -planeDist : planeDist;
    const distFromBase = b.baseN.dot(tmpP) + b.baseD;
    const distFromOther = b.otherN.dot(tmpP) + b.otherD;
    const s = tanHalf * distFromBend;
    if (Math.abs(distFromBase) < Math.abs(distFromOther)) {
      tmpP.addScaledVector(b.dir, (-distFromBase / b.halfSize) * s);
      tmpP.applyMatrix4(tmpM);
    } else {
      tmpP.addScaledVector(b.dir, (-distFromOther / b.halfSize) * s);
    }
    pos.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
  }
  pos.needsUpdate = true;
  c.mesh.geometry.computeVertexNormals();
  c.bent = true;
}

interface RigPart {
  def: PartDef;
  group: Group;
  inner: Cuboid;
  outer: Cuboid;
}

interface Rig {
  root: Group;
  body: Group;
  upper: Group;
  parts: Map<PartDef["name"], RigPart>;
  slim: boolean;
}

const RIG_KEY = "alaunchiEmoteRig";

function layerMaterials(player: PlayerObject, name: PartDef["name"]): [Material, Material] {
  const skin = player.skin;
  const part =
    name === "head" ? skin.head
    : name === "torso" ? skin.body
    : name === "right_arm" ? skin.rightArm
    : name === "left_arm" ? skin.leftArm
    : name === "right_leg" ? skin.rightLeg
    : skin.leftLeg;
  return [(part.innerLayer as Mesh).material as Material, (part.outerLayer as Mesh).material as Material];
}

function disposeRigParts(rig: Rig) {
  for (const p of rig.parts.values()) {
    p.group.removeFromParent();
    p.inner.mesh.geometry.dispose();
    p.outer.mesh.geometry.dispose();
  }
  rig.parts.clear();
}

function buildParts(rig: Rig, player: PlayerObject, slim: boolean, model: Group) {
  disposeRigParts(rig);
  for (const def of partDefs(slim)) {
    const [m1, m2] = layerMaterials(player, def.name);
    const group = new Group();
    group.rotation.order = "ZYX"; // ModelPart: rotationZYX(zRot, yRot, xRot)
    const inner = buildCuboid(def.inner, def.bend, m1);
    const outer = buildCuboid(def.outer, def.bend, m2);
    group.add(inner.mesh, outer.mesh);
    (def.upper ? rig.upper : model).add(group);
    rig.parts.set(def.name, { def, group, inner, outer });
  }
  rig.slim = slim;
}

/** The emote rig lives inside skinview3d's PlayerObject, replacing (hiding)
 *  its own skin meshes but sharing their materials, so skin changes still
 *  apply. Chain, outermost first — exactly Minecraft's render order:
 *    feet origin, facing → [body transforms, blocks] → scale(-1,-1,1)·0.9375·
 *    translate(0,-1.501,0)·1/16 (model space) → [body bend, upper parts] → parts. */
function ensureRig(player: PlayerObject): Rig {
  const slim = player.skin.modelType === "slim";
  let rig = player.userData[RIG_KEY] as Rig | undefined;
  if (!rig) {
    const root = new Group();
    // skinview3d: feet at y=-16, facing +Z; 2 blocks tall = 32 units, while
    // Minecraft draws the player at 0.9375 scale (1.875 blocks).
    root.position.set(0, -16, 0);
    root.rotation.y = Math.PI;
    root.scale.setScalar(16 / 0.9375);
    const body = new Group();
    body.matrixAutoUpdate = false;
    const model = new Group();
    model.matrixAutoUpdate = false;
    model.matrix
      .makeRotationZ(Math.PI)
      .multiply(tmpT.makeScale(0.9375, 0.9375, 0.9375))
      .multiply(tmpT.makeTranslation(0, -1.501, 0))
      .multiply(tmpT.makeScale(1 / 16, 1 / 16, 1 / 16));
    const upper = new Group();
    upper.matrixAutoUpdate = false;
    root.add(body);
    body.add(model);
    model.add(upper);
    player.add(root);
    rig = { root, body, upper, parts: new Map(), slim };
    buildParts(rig, player, slim, model);
    player.userData[RIG_KEY] = rig;
  } else if (rig.slim !== slim) {
    buildParts(rig, player, slim, rig.upper.parent as Group);
  }
  return rig;
}

// ─────────────────────────────── Posing ─────────────────────────────────────

/** Default values per part (AnimationBuilder's StateCollection defaults). */
const PART_DEFAULT_POS: Record<string, Vec3> = {
  head: [0, 0, 0],
  torso: [0, 0, 0],
  body: [0, 0, 0],
  right_arm: [-5, 2, 0],
  left_arm: [5, 2, 0],
  right_leg: [-1.9, 12, 0.1],
  left_leg: [1.9, 12, 0.1],
};

const bodyQ = new Quaternion();
const bodyEuler = new Euler();
const bendQ = new Quaternion();
const vS = new Vector3();
const vT = new Vector3();

export class EmoteAnimation extends PlayerAnimation {
  constructor(private emote: ParsedEmote) {
    super();
  }

  /** Length of the timeline a player scrubs through: a looping emote's first
   *  pass (0..endTick), a one-shot's whole play including the ease back. */
  get totalTicks(): number {
    const e = this.emote;
    return e.isLoop ? e.endTick + 1 : e.stopTick;
  }

  /** Where the emote is right now on that timeline (fractional ticks), or
   *  null during the pause between plays of a one-shot emote. */
  currentTick(): number | null {
    const s = this.playState();
    return s ? s.tick + s.delta : null;
  }

  /** Jumps to a tick and poses the player there at once (works while paused). */
  seek(player: PlayerObject, tick: number) {
    this.progress = Math.max(0, tick) / TICKS_PER_SECOND;
    this.animate(player);
  }

  /** World-space box the player occupies over the whole emote (sampled), so a
   *  viewer can frame jumps, spins and lying poses without cutting them off.
   *  Leaves the player posed at the start. */
  static bounds(emote: ParsedEmote, player: PlayerObject, part: "all" | "loop" = "all"): Box3 {
    const anim = new EmoteAnimation(emote);
    // "loop": just the repeating stretch of a looping emote (sampled from its
    // second pass, once the loop has started) — where it spends nearly all its
    // time. "all": the lead-in from the standing pose too, or a whole one-shot.
    const loopLength = emote.endTick - emote.returnTick + 1;
    const first = emote.isLoop && part === "loop" ? emote.endTick + 1 : 0;
    const last = emote.isLoop ? emote.endTick + loopLength : emote.stopTick;
    const step = Math.max(1, Math.ceil((last - first) / 160));
    const box = new Box3();
    const rig = () => player.userData[RIG_KEY] as Rig;
    for (let tick = first; tick <= last; tick += step) {
      anim.seek(player, tick);
      player.updateMatrixWorld(true);
      box.expandByObject(rig().root, true);
    }
    anim.seek(player, 0);
    player.updateMatrixWorld(true);
    return box;
  }

  private playState(): PlayState | null {
    const e = this.emote;
    const elapsed = Math.max(0, this.progress * TICKS_PER_SECOND);
    if (e.isLoop) {
      const n = Math.floor(elapsed);
      const delta = elapsed - n;
      if (n <= e.endTick) return { tick: n, delta, isLoopStarted: false };
      const period = e.endTick - e.returnTick + 1;
      return { tick: e.returnTick + ((n - e.endTick - 1) % period), delta, isLoopStarted: true };
    }
    // One-shot emotes: play to stopTick (eased back to rest), wait a moment, replay.
    const cycle = elapsed % (e.stopTick + REPLAY_GAP_TICKS);
    if (cycle >= e.stopTick) return null;
    const n = Math.floor(cycle);
    return { tick: n, delta: cycle - n, isLoopStarted: false };
  }

  protected animate(player: PlayerObject): void {
    const e = this.emote;
    const rig = ensureRig(player);
    player.skin.visible = false;
    const state = this.playState();
    const age = this.progress * TICKS_PER_SECOND;

    const track = (name: string): EmoteBoneTrack | undefined => (state ? e.bones[name] : undefined);
    const val = (axis: EmoteAxis | undefined, def: number, current: number) =>
      axis === undefined || !state ? current : axisValue(axis, def, current, e, state);
    const rot = (axis: EmoteAxis | undefined, current: number) =>
      axis === undefined || !state ? current : rotationValue(axis, 0, current, e, state);

    // Whole-body transform (PlayerRendererMixin.applyBodyTransforms), in blocks,
    // in the entity's facing frame: scale · translate(p + 0.7 up) · Rz·Ry·Rx · translate(-0.7).
    const bt = track("body");
    const sx = val(bt?.scaleX, 1, 1);
    const sy = val(bt?.scaleY, 1, 1);
    const sz = val(bt?.scaleZ, 1, 1);
    const bx = val(bt?.posX, 0, 0);
    const by = val(bt?.posY, 0, 0);
    const bz = val(bt?.posZ, 0, 0);
    const bp = rot(bt?.rotX, 0);
    const byaw = rot(bt?.rotY, 0);
    const br = rot(bt?.rotZ, 0);
    bodyQ.setFromEuler(bodyEuler.set(bp, byaw, br, "ZYX"));
    rig.body.matrix
      .makeScale(sx, sy, sz)
      .multiply(tmpT.makeTranslation(bx, by + 0.7, bz))
      .multiply(tmpT.makeRotationFromQuaternion(bodyQ))
      .multiply(tmpT.makeTranslation(0, -0.7, 0));
    rig.body.matrixWorldNeedsUpdate = true;

    // Body bend: the torso bends by torso+body, the upper parts (head, arms)
    // only follow the "body" bend (BipedEntityModelMixin.renderToBuffer).
    const bodyBendAxis = rot(bt?.bendAxis, 0);
    const bodyBend = rot(bt?.bend, 0);
    tmpAxis.set(Math.cos(-bodyBendAxis), 0, Math.sin(-bodyBendAxis));
    bendQ.setFromAxisAngle(tmpAxis, bodyBend);
    rig.upper.matrix
      .makeTranslation(0, 6, 0)
      .multiply(tmpT.makeRotationFromQuaternion(bendQ))
      .multiply(tmpT.makeTranslation(0, -6, 0));
    rig.upper.matrixWorldNeedsUpdate = true;

    // Vanilla idle arm sway (AnimationUtils.bobArms) — the "current" value
    // an emote eases in from / leaves untouched on disabled axes.
    const swayZ = Math.cos(age * 0.09) * 0.05 + 0.05;
    const swayX = Math.sin(age * 0.067) * 0.05;

    for (const part of rig.parts.values()) {
      const name = part.def.name;
      const t = track(name);
      const restPos = PART_DEFAULT_POS[name];
      const cur = part.def.pivot;
      const curRot: Vec3 =
        name === "right_arm" ? [swayX, 0, swayZ]
        : name === "left_arm" ? [-swayX, 0, -swayZ]
        : [0, 0, 0];

      vT.set(val(t?.posX, restPos[0], cur[0]), val(t?.posY, restPos[1], cur[1]), val(t?.posZ, restPos[2], cur[2]));
      part.group.position.copy(vT);
      part.group.rotation.set(rot(t?.rotX, curRot[0]), rot(t?.rotY, curRot[1]), rot(t?.rotZ, curRot[2]), "ZYX");
      vS.set(val(t?.scaleX, 1, 1), val(t?.scaleY, 1, 1), val(t?.scaleZ, 1, 1));
      part.group.scale.copy(vS);

      if (part.def.bend) {
        let axis = rot(t?.bendAxis, 0);
        let bend = rot(t?.bend, 0);
        if (name === "torso") {
          axis += bodyBendAxis;
          bend += bodyBend;
        }
        applyBend(part.inner, axis, bend);
        applyBend(part.outer, axis, bend);
      }
    }
  }
}
