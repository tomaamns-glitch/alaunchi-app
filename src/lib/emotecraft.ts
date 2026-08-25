// Parses the .emotecraft binary format (Emotecraft / PlayerAnimationLibrary,
// KosmX/emotes) straight from the network-packet source — there's no public
// byte-level spec, so this was reverse-derived from:
//   https://github.com/KosmX/emotes  (emotesAPI/.../network/objects/*)
//   https://github.com/PlayerAnimationLibrary/PlayerAnimationLibrary
//     (core/.../network/LegacyAnimationBinary.java)
// and validated against a real exported .emotecraft file until every byte
// was accounted for. Container: int32 version, byte purpose, byte moduleCount,
// then moduleCount × { byte id, byte ver, int32 size, byte[size] }. Modules
// used in a FILE-purpose export: 0x00 animation data, 0x11 header, 0x12 icon.

export interface EmoteKeyframe {
  tick: number;
  value: number;
  easing: number;
  easingArg: number | null;
}

export interface EmoteBoneTrack {
  posX: EmoteKeyframe[];
  posY: EmoteKeyframe[];
  posZ: EmoteKeyframe[];
  rotX: EmoteKeyframe[];
  rotY: EmoteKeyframe[];
  rotZ: EmoteKeyframe[];
  bend: EmoteKeyframe[];
  scaleX: EmoteKeyframe[];
  scaleY: EmoteKeyframe[];
  scaleZ: EmoteKeyframe[];
}

export interface ParsedEmote {
  name: string;
  description: string;
  author: string;
  beginTick: number;
  endTick: number;
  stopTick: number;
  isLoop: boolean;
  returnTick: number;
  easeBefore: boolean;
  bones: Record<string, EmoteBoneTrack>;
  iconDataUrl: string | null;
}

// left_item/right_item hold model transforms skinview3d's PlayerObject has no
// slot for — dropped rather than mis-applied to a body part.
const ITEM_BONES = new Set(["left_item", "right_item"]);

function emptyTrack(): EmoteBoneTrack {
  return { posX: [], posY: [], posZ: [], rotX: [], rotY: [], rotZ: [], bend: [], scaleX: [], scaleY: [], scaleZ: [] };
}

// UniversalAnimLoader.getCorrectPlayerBoneName: the file stores camelCase
// ("leftItem"), everything else compares against snake_case ("left_item").
function toCanonicalBoneName(name: string): string {
  return name.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function isBendBone(name: string): boolean {
  return name !== "head" && name !== "left_item" && name !== "right_item";
}

interface BoneTransform {
  /** Position keyframe values are stored as (delta*sign + posDef), not a raw
   *  offset — posDef is that bone's rest position, in the same space Minecraft's
   *  own vanilla ModelPart uses. */
  posDef: [number, number, number];
  /** Only the torso/body bone's position is additionally in "blocks" rather
   *  than the "pixel" units (1/16 block) everything else uses. */
  posMul: number;
  posNegate: [boolean, boolean, boolean];
  rotNegate: [boolean, boolean, boolean];
}

// Per-bone/per-axis decode parameters — reverse-engineered from the library
// Emotecraft's EmoteDataPacket actually serializes with today: PlayerAnimationLibrary
// (github.com/PlayerAnimationLibrary/PlayerAnimationLibrary, package
// com.zigythebird.playeranimcore) — NOT the older dev.kosmx.playerAnim library some
// older docs/mirrors still reference, which has different (and for this purpose,
// misleading) internals.
//
// Two real transforms are folded together here:
//  1. LegacyAnimationBinary.readPart()'s own wire decode: value = (raw - posDef) *
//     (isBody ? 16 : 1) * (formatNegate ? -1 : 1). posDef values come from
//     PlayerAnimatorLoader.DEFAULT_VALUES, Minecraft's own vanilla ModelPart rest
//     offsets for each limb (matches PlayerModelMixin's own hardcoded constants).
//  2. RenderUtil.copyVanillaPart()/translatePartToBone()'s bone-space conversion:
//     the runtime negates Y (only, never Z) when converting between Minecraft's raw
//     ModelPart space and its own internal bone space — for position only, rotation
//     is carried through with no sign change at all.
// The format's own Y-negate and the bone-space Y-negate cancel out for every bone
// except body/cape, which is why most rows below have no sign flips at all once
// posDef is subtracted — only body and cape need any negation.
const BONE_TRANSFORMS: Record<string, BoneTransform> = {
  head: { posDef: [0, 0, 0], posMul: 1, posNegate: [false, false, false], rotNegate: [false, false, false] },
  torso: { posDef: [0, 0, 0], posMul: 1, posNegate: [false, false, false], rotNegate: [false, false, false] },
  right_arm: { posDef: [-5, 2, 0], posMul: 1, posNegate: [false, false, false], rotNegate: [false, false, false] },
  left_arm: { posDef: [5, 2, 0], posMul: 1, posNegate: [false, false, false], rotNegate: [false, false, false] },
  right_leg: { posDef: [-1.9, 12, 0.1], posMul: 1, posNegate: [false, false, false], rotNegate: [false, false, false] },
  left_leg: { posDef: [1.9, 12, 0.1], posMul: 1, posNegate: [false, false, false], rotNegate: [false, false, false] },
  // LegacyAnimationBinary.readPart() does pass mul=isBody (i.e. *16) for the torso's
  // position axes, matching a "value *= 16" step also visible in PlayerAnimatorLoader's
  // JSON-authoring path — but applying that literally here produced a body delta an
  // order of magnitude larger than every other bone's in a real test file (Z decoded
  // to +30.8 units vs. 0-2 for everything else, matching a visibly detached torso in
  // testing). Whatever that *16 is for on the Java side, it isn't "how far to move
  // skinview3d's body bone" in the same units as the rest of this table — so it's
  // deliberately left out here. Revisit if a real emote turns up needing it.
  // Same story for rotation: the "isBody" negate this derived from the wire format
  // (X and Y both) produced a torso that leans the wrong way in testing — dropped
  // for the same reason as posMul above.
  body: { posDef: [0, 0, 0], posMul: 1, posNegate: [true, true, false], rotNegate: [false, false, false] },
  cape: { posDef: [0, 0, 0], posMul: 1, posNegate: [true, false, true], rotNegate: [true, false, true] },
};

function decodePositionAxis(keyframes: EmoteKeyframe[], def: number, mul: number, negate: boolean): EmoteKeyframe[] {
  if (keyframes.length === 0 || (def === 0 && mul === 1 && !negate)) return keyframes;
  const sign = negate ? -1 : 1;
  return keyframes.map((k) => ({ ...k, value: (k.value - def) * mul * sign }));
}

function decodeRotationAxis(keyframes: EmoteKeyframe[], negate: boolean): EmoteKeyframe[] {
  if (!negate || keyframes.length === 0) return keyframes;
  return keyframes.map((k) => ({ ...k, value: -k.value }));
}

/** Applies BONE_TRANSFORMS to a just-parsed track's position/rotation axes in
 *  place — the parser's own keyframe values are the raw wire encoding, not yet
 *  the delta this bone should actually be moved/rotated by. */
function applyBoneTransform(track: EmoteBoneTrack, name: string): void {
  const t = BONE_TRANSFORMS[name];
  if (!t) return;
  track.posX = decodePositionAxis(track.posX, t.posDef[0], t.posMul, t.posNegate[0]);
  track.posY = decodePositionAxis(track.posY, t.posDef[1], t.posMul, t.posNegate[1]);
  track.posZ = decodePositionAxis(track.posZ, t.posDef[2], t.posMul, t.posNegate[2]);
  track.rotX = decodeRotationAxis(track.rotX, t.rotNegate[0]);
  track.rotY = decodeRotationAxis(track.rotY, t.rotNegate[1]);
  track.rotZ = decodeRotationAxis(track.rotZ, t.rotNegate[2]);
}

class Cursor {
  constructor(
    private view: DataView,
    public pos: number
  ) {}
  i32(): number {
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }
  i8(): number {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }
  u8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }
  f32(): number {
    const v = this.view.getFloat32(this.pos, false);
    this.pos += 4;
    return v;
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  str(): string {
    const len = this.i32();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function readKeyframeTrack(c: Cursor, animVersion: number, keyframeSize: number): EmoteKeyframe[] {
  // version>=2 always writes enabled(bool)+count(int); version 1 packs "disabled"
  // as count=-1 with no separate bool (LegacyAnimationBinary.readKeyframes).
  let enabled: boolean;
  let length: number;
  if (animVersion >= 2) {
    enabled = c.bool();
    length = c.i32();
  } else {
    length = c.i32();
    enabled = length >= 0;
  }
  if (!enabled) {
    if (length > 0) c.pos += length * keyframeSize;
    return [];
  }
  const keyframes: EmoteKeyframe[] = [];
  for (let i = 0; i < length; i++) {
    const start = c.pos;
    const tick = c.i32();
    const value = c.f32();
    const easing = c.u8();
    let easingArg: number | null = null;
    if (animVersion >= 4) {
      easingArg = c.f32();
      if (Number.isNaN(easingArg)) easingArg = null;
    }
    keyframes.push({ tick, value, easing, easingArg });
    c.pos = start + keyframeSize; // fields read may be fewer bytes than the slot; jump to the declared size regardless
  }
  return keyframes;
}

function readBoneTrack(c: Cursor, name: string, animVersion: number, keyframeSize: number): EmoteBoneTrack {
  const track = emptyTrack();
  track.posX = readKeyframeTrack(c, animVersion, keyframeSize);
  track.posY = readKeyframeTrack(c, animVersion, keyframeSize);
  track.posZ = readKeyframeTrack(c, animVersion, keyframeSize);
  track.rotX = readKeyframeTrack(c, animVersion, keyframeSize);
  track.rotY = readKeyframeTrack(c, animVersion, keyframeSize);
  track.rotZ = readKeyframeTrack(c, animVersion, keyframeSize);
  if (isBendBone(name)) {
    readKeyframeTrack(c, animVersion, keyframeSize); // discarded legacy Y-axis bend
    track.bend = readKeyframeTrack(c, animVersion, keyframeSize);
  }
  if (animVersion >= 3) {
    track.scaleX = readKeyframeTrack(c, animVersion, keyframeSize);
    track.scaleY = readKeyframeTrack(c, animVersion, keyframeSize);
    track.scaleZ = readKeyframeTrack(c, animVersion, keyframeSize);
  }
  applyBoneTransform(track, name);
  return track;
}

/** Parses a whole .emotecraft file (as raw bytes) into keyframe tracks per
 *  bone, plus header metadata and the embedded icon (if any). */
export function parseEmotecraft(bytes: Uint8Array): ParsedEmote {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const c = new Cursor(view, 0);
  c.i32(); // networking version
  c.u8(); // purpose (0x10 = FILE)
  const moduleCount = c.u8();

  let header = { name: "", description: "", author: "" };
  let anim: ReturnType<typeof parseAnimationData> | null = null;
  let iconDataUrl: string | null = null;

  for (let i = 0; i < moduleCount; i++) {
    const id = c.u8();
    const ver = c.u8();
    const size = c.i32();
    const start = c.pos;
    const slice = bytes.subarray(start, start + size);

    if (id === 0x11) {
      const hc = new Cursor(new DataView(slice.buffer, slice.byteOffset, slice.byteLength), 0);
      header = { name: hc.str(), description: hc.str(), author: hc.str() };
    } else if (id === 0x00) {
      anim = parseAnimationData(slice, ver);
    } else if (id === 0x12) {
      const iv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
      const iconSize = iv.getInt32(0, false);
      if (iconSize > 0) {
        const png = slice.subarray(4, 4 + iconSize);
        iconDataUrl = `data:image/png;base64,${bytesToBase64(png)}`;
      }
    }

    c.pos = start + size;
  }

  if (!anim) {
    anim = { beginTick: 0, endTick: 0, stopTick: 0, isLoop: false, returnTick: 0, easeBefore: false, bones: {} };
  }

  return { ...header, ...anim, iconDataUrl };
}

function parseAnimationData(bytes: Uint8Array, animVersion: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const c = new Cursor(view, 0);
  c.i32(); // tick
  const beginTick = c.i32();
  const endTick = c.i32();
  const stopTick = c.i32();
  const isLoop = c.bool();
  const returnTick = c.i32();
  const easeBefore = c.bool();
  c.bool(); // NSFW
  const keyframeSize = c.i8();

  const bones: Record<string, EmoteBoneTrack> = {};
  if (animVersion >= 2) {
    const boneCount = c.i32();
    for (let i = 0; i < boneCount; i++) {
      const name = toCanonicalBoneName(c.str());
      const track = readBoneTrack(c, name, animVersion, keyframeSize);
      if (!ITEM_BONES.has(name)) bones[name] = track;
    }
  } else {
    for (const name of ["head", "body", "right_arm", "left_arm", "right_leg", "left_leg"]) {
      bones[name] = readBoneTrack(c, name, animVersion, keyframeSize);
    }
  }

  return { beginTick, endTick, stopTick, isLoop, returnTick, easeBefore, bones };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
