import { PlayerAnimation, type PlayerObject } from "skinview3d";
import type { EmoteBoneTrack, EmoteKeyframe, ParsedEmote } from "@/lib/emotecraft";

// Minecraft ticks per second — progress accumulates in seconds (skinview3d
// feeds PlayerAnimation.update() a THREE.Clock delta), so tick = progress*20.
const TICKS_PER_SECOND = 20;

function ease(id: number, t: number): number {
  switch (id) {
    case 1: // constant — holds the start value until the very end of the segment
      return 0;
    case 6:
      return 1 - Math.cos((t * Math.PI) / 2); // ease-in sine
    case 7:
      return Math.sin((t * Math.PI) / 2); // ease-out sine
    case 8:
      return -(Math.cos(Math.PI * t) - 1) / 2; // ease-in-out sine
    case 12:
      return t * t; // ease-in quad
    case 13:
      return 1 - (1 - t) * (1 - t); // ease-out quad
    case 14:
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out quad
    case 9:
      return t * t * t; // ease-in cubic
    case 10:
      return 1 - Math.pow(1 - t, 3); // ease-out cubic
    case 11:
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out cubic
    case 0: // linear
    default: // unsupported curve (back/elastic/bounce/catmullrom/bezier/step) — falls back to linear
      return t;
  }
}

/** Value of one axis' keyframe track at a given (fractional) tick, linearly
 *  interpolating between the surrounding keyframes with the destination
 *  keyframe's easing curve — matches how Emotecraft/PlayerAnimator read the
 *  binary (easeBefore off, the common case, means keyframe[i+1]'s easing
 *  describes the transition arriving at it). Returns null for a disabled/empty
 *  track (PlayerAnimator's own Axis.getValueAtCurrentTick falls through to
 *  whatever the ModelPart was already set to in that case — see applyTrack). */
function sampleAxis(track: EmoteKeyframe[], tick: number): number | null {
  if (track.length === 0) return null;
  if (tick <= track[0].tick) return track[0].value;
  const last = track[track.length - 1];
  if (tick >= last.tick) return last.value;

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (tick >= a.tick && tick <= b.tick) {
      const span = b.tick - a.tick;
      const t = span > 0 ? (tick - a.tick) / span : 1;
      return a.value + (b.value - a.value) * ease(b.easing, t);
    }
  }
  return last.value;
}

type BoneTarget = {
  rotation: { x: number; y: number; z: number; order: string };
  position: { x: number; y: number; z: number };
};

function boneTarget(player: PlayerObject, name: string): BoneTarget | null {
  switch (name) {
    case "head":
      return player.skin.head;
    case "body":
    case "torso":
      return player.skin.body;
    case "right_arm":
      return player.skin.rightArm;
    case "left_arm":
      return player.skin.leftArm;
    case "right_leg":
      return player.skin.rightLeg;
    case "left_leg":
      return player.skin.leftLeg;
    case "cape":
      return player.cape;
    default:
      return null;
  }
}

// The real runtime (PlayerAnimationLibrary) treats every keyframed axis as a
// DELTA layered on top of whatever the bone's current pose already is — it
// copies the model's current (vanilla) transform into its own "bone" space,
// adds the animation's contribution, then writes the result back — never a
// standalone absolute value. emotecraft.ts's BONE_TRANSFORMS already converts
// each keyframe's raw wire value into that delta (undoing the per-bone default
// offset the format encodes it against), so applying an emote here is just
// "start from resetJoints()'s rest pose, then add whatever's keyframed" — an
// axis with no track contributes nothing, leaving the rest-pose value as-is.
function applyAxis(current: number, track: EmoteKeyframe[], tick: number): number {
  const sampled = sampleAxis(track, tick);
  return sampled === null ? current : current + sampled;
}

// three.js/skinview3d's default Euler order ('XYZ') doesn't match the order
// Minecraft composes a part's rotation in, so for a pose that rotates all three
// axes by a large amount at once (Euler composition isn't commutative) the result
// ends up in a visibly different — bent, crossed — orientation. Confirmed against
// a real T-pose emote (arms should extend straight out to the sides): computing
// the resulting arm direction for every possible three.js Euler order against
// that emote's actual right_arm/left_arm keyframe values, only "YZX" both mirrors
// correctly between the two arms and points them away from the body rather than
// crossed in front of it.
function applyTrack(target: BoneTarget, track: EmoteBoneTrack, tick: number) {
  target.rotation.order = "YZX";
  target.rotation.x = applyAxis(target.rotation.x, track.rotX, tick);
  target.rotation.y = applyAxis(target.rotation.y, track.rotY, tick);
  target.rotation.z = applyAxis(target.rotation.z, track.rotZ, tick);
  target.position.x = applyAxis(target.position.x, track.posX, tick);
  target.position.y = applyAxis(target.position.y, track.posY, tick);
  target.position.z = applyAxis(target.position.z, track.posZ, tick);
}

/** Plays a parsed .emotecraft animation on a skinview3d PlayerObject. Always
 *  loops beginTick..endTick for preview purposes, regardless of the emote's
 *  own isLoop/returnTick — a one-shot preview freezing forever isn't useful
 *  here; playing the actual emote in-game (out of scope) would need to honor
 *  those instead. */
export class EmoteAnimation extends PlayerAnimation {
  constructor(private emote: ParsedEmote) {
    super();
  }

  protected animate(player: PlayerObject): void {
    const { beginTick, endTick, bones } = this.emote;
    const span = Math.max(1, endTick - beginTick);
    const elapsedTicks = this.progress * TICKS_PER_SECOND;
    const tick = beginTick + (((elapsedTicks % span) + span) % span);

    player.resetJoints();
    for (const [name, track] of Object.entries(bones)) {
      const target = boneTarget(player, name);
      if (target) applyTrack(target, track, tick);
    }
  }
}
