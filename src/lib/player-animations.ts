import * as THREE from "three";

/**
 * The player's idle animations, written from scratch for ALaunchi (no
 * third-party clips). Each clip is a function of time giving every bone's
 * rotation (degrees, in the bone frame of lib/player-rig.ts: y up, front = -z,
 * +x = the player's right) and the hips' offset, sampled into keyframe tracks
 * the AnimationMixer plays like any glTF clip. Clip names the viewer's
 * scheduler expects:
 *   idle        — loops forever (breathing)
 *   idle_sub_N  — one-shot gestures, one every few seconds
 *   interact    — on click
 *
 * Rotation cheat sheet (bone frame):
 *   arm    x+ → swings forward       z+ → right arm out to the side (left arm: z-)
 *   head   y+ → turns to the player's left    x+ → looks up    z- → tilts to the right
 *   body   x+ → leans back           z- → leans to the right
 *   leg    z+ → foot moves to the player's right
 *   cape   x- → its bottom lifts away from the back
 */

type Euler = [number, number, number];
type BoneName = "Body" | "Head" | "Right_Arm" | "Left_Arm" | "Right_Leg" | "Left_Leg" | "Cape";
type Pose = Partial<Record<BoneName, Euler>> & {
  /** Hips offset from rest, in pixels (1/16 block). */
  Hips?: Euler;
};

const BONES: BoneName[] = ["Body", "Head", "Right_Arm", "Left_Arm", "Right_Leg", "Left_Leg", "Cape"];
const FPS = 30;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const PX = 1 / 16;
/** Rest height of the hips bone ("Orbit"). */
const HIPS_Y = 12 * PX;
/** Hip joint to sole. */
const LEG_PX = 12;

/** Samples `pose(t)` over `duration` seconds: one quaternion track per bone
 *  plus the hips' position. */
function sampleClip(name: string, duration: number, pose: (t: number) => Pose): THREE.AnimationClip {
  const frames = Math.round(duration * FPS);
  const times: number[] = [];
  const rot = new Map<BoneName, number[]>(BONES.map((b) => [b, []]));
  const hips: number[] = [];
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * duration;
    times.push(t);
    const p = pose(t);
    for (const b of BONES) {
      const [x, y, z] = p[b] ?? [0, 0, 0];
      // ZXY: a raised arm (z) still swings (x) around its own length.
      euler.set(x * DEG, y * DEG, z * DEG, "ZXY");
      q.setFromEuler(euler);
      rot.get(b)!.push(q.x, q.y, q.z, q.w);
    }
    const [hx, hy, hz] = p.Hips ?? [0, 0, 0];
    hips.push(hx * PX, HIPS_Y + hy * PX, hz * PX);
  }
  const tracks: THREE.KeyframeTrack[] = BONES.map(
    (b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, rot.get(b)!)
  );
  tracks.push(new THREE.VectorKeyframeTrack("Orbit.position", times, hips));
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Smooth 0→1 (ease in and out). */
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Softer start and end than `ease` (for big moves like raising the arms). */
const easeSoft = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));

/** Piecewise value through [time, value] keys, eased between each pair. */
function keys(t: number, ks: [number, number][], curve = ease): number {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1] = ks[i];
    if (t <= t1) {
      const [t0, v0] = ks[i - 1];
      return v0 + (v1 - v0) * curve((t - t0) / (t1 - t0));
    }
  }
  return ks[ks.length - 1][1];
}

/** 0 outside [a, d], 1 inside [b, c], eased ramps between. */
const window4 = (t: number, a: number, b: number, c: number, d: number) => ease((t - a) / (b - a)) * ease((d - t) / (d - c));

/** Rate of change of `f` at `t` (per second). */
const speed = (f: (t: number) => number, t: number) => (f(t + 0.04) - f(t - 0.04)) / 0.08;

const add = (a: Euler | undefined, b: Euler): Euler => [(a?.[0] ?? 0) + b[0], (a?.[1] ?? 0) + b[1], (a?.[2] ?? 0) + b[2]];

/** Both legs tilted so the feet stay where they were while the hips move
 *  `dx` px sideways and `dz` px backwards (+z); the hips drop by what the tilt
 *  lifts the soles. */
function plantFeet(pose: Pose, dx: number, dz = 0): Pose {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const side = -Math.asin(clamp(dx / LEG_PX));
  const fore = Math.asin(clamp(dz / LEG_PX));
  const drop = -LEG_PX * (1 - Math.cos(side) * Math.cos(fore));
  return {
    ...pose,
    Hips: add(pose.Hips, [dx, drop, dz]),
    Right_Leg: add(pose.Right_Leg, [fore / DEG, 0, side / DEG]),
    Left_Leg: add(pose.Left_Leg, [fore / DEG, 0, side / DEG]),
  };
}

// ── idle ────────────────────────────────────────────────────────────────────
// One breath every 4 s, inhaling a little faster than exhaling: the chest lifts
// (a slight lean back), the shoulders open so the arms drift off the body, the
// head counters the lean to keep the gaze level, the cape sways a beat behind.
// Under it a very slow weight drift from foot to foot. Only whole multiples of
// the base frequency, so the loop closes without a seam.
const IDLE_S = 4;

function idlePose(t: number): Pose {
  const w = (TAU * t) / IDLE_S;
  // Skewed sine: rises faster than it falls.
  const breath = Math.sin(w + 0.35 * Math.sin(w));
  const open = (breath + 1) / 2;
  const sway = Math.sin(w + 0.9);
  const drift = Math.sin(w - 1.2);
  const pose: Pose = {
    Body: [0.9 * breath, 0.5 * Math.sin(w + 2), -0.5 * drift],
    Head: [-0.7 * breath - 0.8, 1.2 * Math.sin(w + 0.5), 0.6 * Math.sin(2 * w) + 0.4 * drift],
    Right_Arm: [1.4 * sway, 0, 2.5 + 1.8 * open],
    Left_Arm: [-1.4 * sway, 0, -(2.5 + 1.8 * open)],
    Right_Leg: [0, 0, 0.5],
    Left_Leg: [0, 0, -0.5],
    Cape: [-7 - 2.2 * (sway + 1) * 0.5, 0, 0.8 * drift],
  };
  return plantFeet(pose, 0.25 * drift);
}

/** Idle running underneath a gesture, so the chest never stops while one plays. */
const under = (t: number) => idlePose(t % IDLE_S);

// ── idle_sub_1: look around ─────────────────────────────────────────────────
// Turns to look over one side, holds, sweeps across to the other, back to
// front. The body follows the head a little; the cape trails the turns.
const LOOK_S = 4.4;
const lookYaw = (t: number) => keys(t, [[0, 0], [0.75, 38], [1.8, 38], [2.65, -32], [3.6, -32], [4.4, 0]]);

function lookAroundPose(t: number): Pose {
  const base = under(t);
  const yaw = lookYaw(t);
  // A small dip of the chin while turning, level again while holding.
  const pitch = keys(t, [[0, 0], [0.4, -5], [0.75, 0], [2.2, -6], [2.65, 0], [4.0, -4], [4.4, 0]]);
  const turnSpeed = Math.abs(speed(lookYaw, t));
  return {
    ...base,
    Head: add(base.Head, [pitch, yaw, 0]),
    Body: add(base.Body, [0, yaw * 0.22, 0]),
    // The arms counter-swing slightly with the turn of the body.
    Right_Arm: add(base.Right_Arm, [yaw * -0.06, 0, 0]),
    Left_Arm: add(base.Left_Arm, [yaw * 0.06, 0, 0]),
    // The cape lags the body's turn and lifts a little while it's moving.
    Cape: add(base.Cape, [-0.035 * turnSpeed, yaw * -0.08, 0]),
  };
}

// ── idle_sub_2: stretch ─────────────────────────────────────────────────────
// Both arms up over the head, a lean back looking up, up on the toes for a
// moment with a little tremble, then the arms come down wide to the sides.
const STRETCH_S = 4.6;

function stretchPose(t: number): Pose {
  const base = under(t);
  const up = keys(t, [[0, 0], [1.1, 1], [2.3, 1], [3.4, 0]], easeSoft);
  // On the way down the arms open wider than on the way up.
  const wide = window4(t, 2.2, 2.8, 3.0, 3.8);
  const tremble = Math.sin(t * TAU * 7) * 1.2 * window4(t, 1.0, 1.3, 2.0, 2.3);
  const toes = window4(t, 0.8, 1.2, 2.0, 2.5);
  const settle = Math.sin((t - 3.4) * TAU * 1.4) * 1.5 * window4(t, 3.3, 3.5, 3.9, 4.6);
  const pose: Pose = {
    ...base,
    // A V over the head (not straight up: the hands would leave the frame).
    Right_Arm: add(base.Right_Arm, [-8 * up + 6 * wide, 0, 152 * up + 18 * wide + tremble]),
    Left_Arm: add(base.Left_Arm, [-8 * up + 6 * wide, 0, -(152 * up + 18 * wide) - tremble]),
    Body: add(base.Body, [7 * up + settle, 0, 0]),
    Head: add(base.Head, [16 * up - 3 * wide, 0, 0]),
    Cape: add(base.Cape, [3 * up, 0, 0]),
    Hips: add(base.Hips, [0, 0.9 * toes, 0]),
  };
  return pose;
}

// ── idle_sub_3: shift weight ────────────────────────────────────────────────
// Puts the weight on the left foot (hips out to that side, shoulders lean the
// other way to balance), rests there a while, then comes back to centre.
const SHIFT_S = 5.2;

function shiftWeightPose(t: number): Pose {
  const base = under(t);
  const shift = keys(t, [[0, 0], [0.9, 1], [3.4, 1], [4.5, 0]], easeSoft);
  // A small settle when the weight lands.
  const bob = Math.sin((t - 0.9) * TAU * 1.2) * 0.25 * window4(t, 0.8, 1.0, 1.3, 1.8);
  const dx = -1.3 * shift;
  const pose: Pose = {
    ...base,
    Body: add(base.Body, [0, -4 * shift, 2.4 * dx]),
    Head: add(base.Head, [0, 5 * shift, -1.6 * dx]),
    // The loaded side's arm hangs; the other one rests a little forward.
    Right_Arm: add(base.Right_Arm, [5 * shift, 0, 2 * shift]),
    Left_Arm: add(base.Left_Arm, [-2 * shift, 0, 1.5 * shift]),
    Hips: add(base.Hips, [0, bob, 0]),
  };
  return plantFeet(pose, dx);
}

// ── idle_sub_4: scratch the head ────────────────────────────────────────────
// The right hand goes up onto the head and scratches it while the
// head tilts into it and looks down a bit, then the arm comes back down.
const SCRATCH_S = 4.2;

function scratchPose(t: number): Pose {
  const base = under(t);
  const reach = keys(t, [[0, 0], [0.75, 1], [2.5, 1], [3.3, 0]], easeSoft);
  const scratching = window4(t, 0.75, 0.95, 2.3, 2.5);
  const scratch = Math.sin((t - 0.75) * TAU * 4.5) * scratching;
  return {
    ...base,
    // Swung forward and up over the top (x), tipped in a little (z): the hand
    // lands on the right side of the crown, just in front.
    Right_Arm: add(base.Right_Arm, [165 * reach + 4 * scratch, 0, 9 * reach + 5 * scratch]),
    Head: add(base.Head, [-6 * reach, -9 * reach, -10 * reach + 1.5 * scratch]),
    Body: add(base.Body, [0, -4 * reach, -2 * reach]),
    Left_Arm: add(base.Left_Arm, [3 * reach, 0, -1 * reach]),
  };
}

// ── idle_sub_5: look at the hand ────────────────────────────────────────────
// Brings the right hand up in front of the chest, looks down at it and turns
// it over twice (a roll around the arm's own length), then lowers it.
const INSPECT_S = 4.4;

function inspectHandPose(t: number): Pose {
  const base = under(t);
  const lift = keys(t, [[0, 0], [0.8, 1], [3.4, 1], [4.2, 0]], easeSoft);
  // Palm up, palm down, palm up again.
  const roll = keys(t, [[0.8, 0], [1.4, 70], [2.1, 70], [2.6, -20], [3.1, -20], [3.4, 0]]);
  const look = keys(t, [[0, 0], [0.9, 1], [3.3, 1], [4.0, 0]]);
  return {
    ...base,
    Right_Arm: add(base.Right_Arm, [78 * lift, roll * lift, -22 * lift]),
    Head: add(base.Head, [-20 * look, -12 * look, -3 * look + 0.04 * roll * look]),
    Body: add(base.Body, [-2 * look, -5 * look, 0]),
    Left_Arm: add(base.Left_Arm, [2 * lift, 0, 1 * lift]),
  };
}

// ── idle_sub_6: tap the foot ────────────────────────────────────────────────
// Hands out on the hips, impatient: the right foot taps four times, the head
// nods along with it, the weight on the left leg.
const TAP_S = 4.4;

function tapFootPose(t: number): Pose {
  const base = under(t);
  const pose = keys(t, [[0, 0], [0.7, 1], [3.6, 1], [4.4, 0]], easeSoft);
  const tapping = window4(t, 0.75, 0.9, 3.1, 3.35);
  // Four taps at 1.6 Hz, each a quick lift and drop.
  const phase = ((t - 0.85) * 1.6) % 1;
  const tap = t > 0.85 && t < 3.35 ? Math.pow(Math.sin(Math.PI * Math.min(1, phase * 1.6)), 2) * tapping : 0;
  const p: Pose = {
    ...base,
    // On the hips: out to the sides, a little back.
    Right_Arm: add(base.Right_Arm, [-14 * pose, 0, 22 * pose]),
    Left_Arm: add(base.Left_Arm, [-14 * pose, 0, -22 * pose]),
    Head: add(base.Head, [-3 * tap - 2 * pose, 8 * pose, 4 * pose]),
    Body: add(base.Body, [0, 3 * pose, 0]),
  };
  const planted = plantFeet(p, -0.7 * pose);
  return { ...planted, Right_Leg: add(planted.Right_Leg, [9 * tap, 0, 0]) };
}

// ── idle_sub_7: roll the neck ───────────────────────────────────────────────
// Chin down, then the head goes round in a slow circle (down, right, back,
// left, down) and comes back up; the shoulders give a little with it.
const NECK_S = 4.2;

function neckRollPose(t: number): Pose {
  const base = under(t);
  const amount = keys(t, [[0, 0], [0.7, 1], [3.3, 1], [4.0, 0]], easeSoft);
  // One full circle over the middle of the clip, starting at "chin down".
  const a = keys(t, [[0.7, 0], [3.3, TAU]], (x) => x);
  const pitch = -14 * Math.cos(a) * amount;
  const tilt = -12 * Math.sin(a) * amount;
  return {
    ...base,
    Head: add(base.Head, [pitch - 4 * amount, 0, tilt]),
    Body: add(base.Body, [0.15 * pitch, 0, -0.15 * tilt]),
    Right_Arm: add(base.Right_Arm, [0, 0, -0.1 * tilt]),
    Left_Arm: add(base.Left_Arm, [0, 0, -0.1 * tilt]),
  };
}

// ── idle_sub_8: kick a pebble ───────────────────────────────────────────────
// Spots something on the floor, draws the right leg back and kicks it, arms
// swinging against the leg, then follows it with the eyes and settles.
const KICK_S = 3.6;

function kickPebblePose(t: number): Pose {
  const base = under(t);
  const down = keys(t, [[0, 0], [0.5, 1], [1.2, 1], [1.5, 0.2], [2.4, 0.2], [3.2, 0]]);
  // Back-swing, a fast kick, a little follow-through, back to standing.
  const leg = keys(t, [[0.5, 0], [0.95, -16], [1.15, -18], [1.32, 34], [1.5, 30], [2.1, 0]]);
  const lean = keys(t, [[0, 0], [0.6, 1], [2.2, 1], [2.8, 0]], easeSoft);
  // The head follows the pebble out and away to the player's left.
  const follow = keys(t, [[1.3, 0], [1.8, 1], [2.5, 1], [3.2, 0]]);
  // The kick goes out on a diagonal (and the body turns into it), so it reads
  // from the front too, not only from the side.
  const out = Math.max(0, leg) / 34;
  const p: Pose = {
    ...base,
    Head: add(base.Head, [-22 * down + 6 * follow, 14 * follow - 6 * out, 0]),
    Body: add(base.Body, [-3 * down + 0.08 * leg, -9 * out, 2 * lean]),
    Right_Arm: add(base.Right_Arm, [-0.45 * leg, 0, 4 * lean]),
    Left_Arm: add(base.Left_Arm, [0.45 * leg, 0, -6 * lean]),
  };
  // Weight onto the left foot while the right one swings.
  const planted = plantFeet(p, -0.8 * lean);
  return { ...planted, Right_Leg: add(planted.Right_Leg, [leg, 0, 2 * lean + 16 * out]) };
}

// ── idle_sub_9: rock on the heels ───────────────────────────────────────────
// Hands clasped behind the back, rocks forward onto the toes and back onto the
// heels a few times, looking around idly.
const ROCK_S = 5.0;

function rockHeelsPose(t: number): Pose {
  const base = under(t);
  const pose = keys(t, [[0, 0], [0.8, 1], [4.2, 1], [5.0, 0]], easeSoft);
  const rocking = window4(t, 0.7, 1.1, 3.8, 4.3);
  // Three rocks; forward = onto the toes (the body tips forward a bit and rises).
  const r = Math.sin((t - 0.9) * TAU * 0.95) * rocking;
  const p: Pose = {
    ...base,
    // Behind the back, the hands meeting at the small of it.
    Right_Arm: add(base.Right_Arm, [-24 * pose, 0, -6 * pose]),
    Left_Arm: add(base.Left_Arm, [-24 * pose, 0, 6 * pose]),
    Body: add(base.Body, [-2.2 * r, 0, 0]),
    Head: add(base.Head, [5 * pose + 1.5 * r, 6 * Math.sin(t * 1.3) * pose, 0]),
    Cape: add(base.Cape, [2.5 * r, 0, 0]),
    Hips: add(base.Hips, [0, 0.45 * Math.max(0, r), 0]),
  };
  return plantFeet(p, 0, 0.55 * r);
}

// ── interact: wave ──────────────────────────────────────────────────────────
// Raises the right hand to the side, waves it three times, lowers it. The head
// tilts towards the viewer and the body leans away from the raised arm.
const WAVE_S = 2.2;

function wavePose(t: number): Pose {
  const base = under(t);
  const raise = keys(t, [[0, 0], [0.38, 1], [1.7, 1], [2.2, 0]], easeSoft);
  // The wave itself, only while the arm is up.
  const wave = Math.sin(((t - 0.38) / 0.42) * TAU) * 22 * window4(t, 0.3, 0.45, 1.6, 1.8);
  return {
    ...base,
    Right_Arm: add(base.Right_Arm, [-12 * raise, 0, 140 * raise + wave]),
    Head: add(base.Head, [4 * raise, -8 * raise, 7 * raise]),
    Body: add(base.Body, [0, -6 * raise, -3 * raise]),
    Left_Arm: add(base.Left_Arm, [0, 0, -3 * raise]),
    Cape: add(base.Cape, [0, 3 * raise, 0]),
  };
}

export function buildPlayerClips(): THREE.AnimationClip[] {
  return [
    sampleClip("idle", IDLE_S, idlePose),
    sampleClip("idle_sub_1", LOOK_S, lookAroundPose),
    sampleClip("idle_sub_2", STRETCH_S, stretchPose),
    sampleClip("idle_sub_3", SHIFT_S, shiftWeightPose),
    sampleClip("idle_sub_4", SCRATCH_S, scratchPose),
    sampleClip("idle_sub_5", INSPECT_S, inspectHandPose),
    sampleClip("idle_sub_6", TAP_S, tapFootPose),
    sampleClip("idle_sub_7", NECK_S, neckRollPose),
    sampleClip("idle_sub_8", KICK_S, kickPebblePose),
    sampleClip("idle_sub_9", ROCK_S, rockHeelsPose),
    sampleClip("interact", WAVE_S, wavePose),
  ];
}

/** DEV: every clip's name and length, for the rig lab's buttons. */
export const PLAYER_CLIP_NAMES = [
  "idle_sub_1", "idle_sub_2", "idle_sub_3", "idle_sub_4", "idle_sub_5",
  "idle_sub_6", "idle_sub_7", "idle_sub_8", "idle_sub_9", "interact",
] as const;
