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

/** One animated axis. `null` = disabled in the file: Minecraft leaves that axis
 *  at whatever the vanilla pose already had. An enabled axis with no keyframes
 *  is NOT the same — it holds the part's default value (see emote-animation.ts). */
export type EmoteAxis = EmoteKeyframe[] | null;

/** Raw values exactly as stored in the file, which are exactly what
 *  playerAnimator (dev.kosmx.playerAnim) feeds the model: absolute ModelPart
 *  values in Minecraft's own model space (pixels, Y down, rest offsets
 *  included — e.g. right_arm x ≈ -5, y ≈ 2), rotations in radians. The "body"
 *  part is the whole player (position in blocks), "torso" is the body cuboid. */
export interface EmoteBoneTrack {
  posX: EmoteAxis;
  posY: EmoteAxis;
  posZ: EmoteAxis;
  rotX: EmoteAxis;
  rotY: EmoteAxis;
  rotZ: EmoteAxis;
  /** Direction of the bend axis around the part's vertical axis ("axis" in Emotecraft JSON). */
  bendAxis: EmoteAxis;
  bend: EmoteAxis;
  scaleX: EmoteAxis;
  scaleY: EmoteAxis;
  scaleZ: EmoteAxis;
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

// Held items have no model in the preview.
const ITEM_BONES = new Set(["left_item", "right_item"]);

function emptyTrack(): EmoteBoneTrack {
  return {
    posX: null,
    posY: null,
    posZ: null,
    rotX: null,
    rotY: null,
    rotZ: null,
    bendAxis: null,
    bend: null,
    scaleX: null,
    scaleY: null,
    scaleZ: null,
  };
}

// UniversalAnimLoader.getCorrectPlayerBoneName: the file stores camelCase
// ("leftItem"), everything else compares against snake_case ("left_item").
function toCanonicalBoneName(name: string): string {
  return name.replace(/([A-Z])/g, "_$1").toLowerCase();
}

// AnimationBuilder: head and the item parts are the only non-bendable ones —
// any other name (incl. unknown parts, via getOrCreatePart) carries bend axes.
function isBendBone(name: string): boolean {
  return name !== "head" && name !== "left_item" && name !== "right_item";
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

function readKeyframeTrack(c: Cursor, animVersion: number, keyframeSize: number): EmoteAxis {
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
    return null;
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
  // State.addKeyFrame inserts after any keyframe with the same tick: a stable sort by tick.
  return keyframes.map((k, i) => [k, i] as const).sort((a, b) => a[0].tick - b[0].tick || a[1] - b[1]).map(([k]) => k);
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
    track.bendAxis = readKeyframeTrack(c, animVersion, keyframeSize);
    track.bend = readKeyframeTrack(c, animVersion, keyframeSize);
  }
  if (animVersion >= 3) {
    track.scaleX = readKeyframeTrack(c, animVersion, keyframeSize);
    track.scaleY = readKeyframeTrack(c, animVersion, keyframeSize);
    track.scaleZ = readKeyframeTrack(c, animVersion, keyframeSize);
  }
  return track;
}

/** Emotecraft writes these header strings as JSON text (Gson's
 *  JsonElement.toString), so they usually arrive wrapped in quotes. */
function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const v: unknown = JSON.parse(s);
      if (typeof v === "string") return v;
    } catch {
      /* not JSON after all */
    }
  }
  return s;
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
      header = { name: unquote(hc.str()), description: unquote(hc.str()), author: unquote(hc.str()) };
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

  // KeyframeAnimation's constructor normalizes the timing the same way.
  const begin = Math.max(beginTick, 0);
  const end = Math.max(begin + 1, endTick);
  const stop = stopTick <= endTick ? end + 3 : stopTick;
  const ret = isLoop ? Math.min(Math.max(returnTick, 0), end) : returnTick;
  return { beginTick: begin, endTick: end, stopTick: stop, isLoop, returnTick: ret, easeBefore, bones };
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
