import * as THREE from "three";
import { buildPlayerClips } from "@/lib/player-animations";

/**
 * Our own rigged player model, built in code (no glTF): the standard Minecraft
 * player shape — head, body, arms, legs, each with its outer layer, plus the
 * cape — UV-mapped to a 64x64 skin texture. Written from scratch for ALaunchi,
 * so it carries no third-party licence (it replaced GPL-3.0 glTF models).
 *
 * The bone names are what the viewer and the clips look up (the elytra hangs
 * on "Body", the cape material is "cape", overlays end in "_Layer"):
 *
 *   Root (turned half a revolution: the model faces the camera)
 *   └ Orbit            hips, 12 px up
 *     ├ Body           (pivot at the hips, so the torso leans from there)
 *     │ ├ Head         neck, 24 px up
 *     │ ├ Right_Arm    shoulder (5 px out, 2 px under the neck)
 *     │ ├ Left_Arm
 *     │ └ Cape         top of the back
 *     ├ Right_Leg      hip joint (1.9 px out)
 *     └ Left_Leg
 *
 * Bone frames are y-up, 1 unit = 1 block (16 px), front = -z and +x = the
 * player's right (the frame the viewer's elytra code assumes). The boxes
 * themselves are written in the game's own model units (y DOWN from the pivot,
 * as in PlayerModel) and turned half a revolution around z into the bone frame
 * — exactly what the game does when it renders a model.
 */

const PX = 1 / 16;
const SKIN_TEX = { w: 64, h: 64 };
const CAPE_TEX = { w: 64, h: 32 };

type FaceCorner = [number, number, number, number, number];

/** A Minecraft-style box (game units, y down) with the game's UV layout:
 *  [right side][front][left side][back] under [top][bottom], from (u, v). */
function boxGeometry(
  x: number, y: number, z: number, w: number, h: number, d: number, grow: number,
  u: number, v: number, tex: { w: number; h: number }
): THREE.BufferGeometry {
  const x0 = x - grow, x1 = x + w + grow;
  const y0 = y - grow, y1 = y + h + grow;
  const z0 = z - grow, z1 = z + d + grow;
  const [wa, wb] = [u, u + d];
  const [fa, fb] = [u + d, u + d + w];
  const [ea, eb] = [u + d + w, u + 2 * d + w];
  const [ba, bb] = [u + 2 * d + w, u + 2 * d + 2 * w];
  const [ta, tb] = [u + d, u + d + w];
  const [ma, mb] = [u + d + w, u + d + 2 * w];
  const [sv0, sv1] = [v + d, v + d + h];
  const [tv0, tv1] = [v, v + d];
  const faces: FaceCorner[][] = [
    // back (+z)
    [[x0, y0, z1, bb, sv0], [x1, y0, z1, ba, sv0], [x1, y1, z1, ba, sv1], [x0, y1, z1, bb, sv1]],
    // front (-z)
    [[x1, y0, z0, fb, sv0], [x0, y0, z0, fa, sv0], [x0, y1, z0, fa, sv1], [x1, y1, z0, fb, sv1]],
    // +x side
    [[x1, y0, z1, eb, sv0], [x1, y0, z0, ea, sv0], [x1, y1, z0, ea, sv1], [x1, y1, z1, eb, sv1]],
    // -x side
    [[x0, y0, z0, wb, sv0], [x0, y0, z1, wa, sv0], [x0, y1, z1, wa, sv1], [x0, y1, z0, wb, sv1]],
    // top (y0)
    [[x0, y0, z0, ta, tv1], [x1, y0, z0, tb, tv1], [x1, y0, z1, tb, tv0], [x0, y0, z1, ta, tv0]],
    // bottom (y1)
    [[x0, y1, z1, ma, tv1], [x1, y1, z1, mb, tv1], [x1, y1, z0, mb, tv0], [x0, y1, z0, ma, tv0]],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const f of faces) {
    const base = pos.length / 3;
    for (const [px, py, pz, pu, pv] of f) {
      pos.push(px, py, pz);
      uv.push(pu / tex.w, pv / tex.h);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface BoxDef {
  name: string;
  /** Box origin and size, game units relative to the bone's pivot. */
  box: [number, number, number, number, number, number];
  uv: [number, number];
  grow?: number;
  material?: string;
  tex?: { w: number; h: number };
}

/** A mesh in the game's frame (y down) hung on a bone (y up). */
function partMesh(def: BoxDef): THREE.Mesh {
  const [x, y, z, w, h, d] = def.box;
  const geometry = boxGeometry(x, y, z, w, h, d, def.grow ?? 0, def.uv[0], def.uv[1], def.tex ?? SKIN_TEX);
  const material = new THREE.MeshStandardMaterial({ name: def.material ?? "Mat" });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = def.name;
  mesh.rotation.z = Math.PI;
  mesh.scale.setScalar(PX);
  return mesh;
}

function bone(name: string, x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.add(...children);
  return g;
}

function buildScene(slim: boolean): THREE.Group {
  const armW = slim ? 3 : 4;
  // PlayerModel: slim arms hang half a pixel lower.
  const armY = slim ? 2.5 : 2;

  const head = bone(
    "Head", 0, 12 * PX, 0,
    partMesh({ name: "Head_2", box: [-4, -8, -4, 8, 8, 8], uv: [0, 0] }),
    partMesh({ name: "Hat_Layer", box: [-4, -8, -4, 8, 8, 8], uv: [32, 0], grow: 0.5 })
  );
  // Arms: pivot 5 px out and `armY` px under the neck (game x is mirrored: the
  // player's right arm is at game -5, our +x).
  const rightArm = bone(
    "Right_Arm", 5 * PX, 12 * PX - armY * PX, 0,
    partMesh({ name: "Right_Arm_2", box: [-armW + 1, -2, -2, armW, 12, 4], uv: [40, 16] }),
    partMesh({ name: "Right_Arm_Layer", box: [-armW + 1, -2, -2, armW, 12, 4], uv: [40, 32], grow: 0.25 })
  );
  const leftArm = bone(
    "Left_Arm", -5 * PX, 12 * PX - armY * PX, 0,
    partMesh({ name: "Left_Arm_2", box: [-1, -2, -2, armW, 12, 4], uv: [32, 48] }),
    partMesh({ name: "Left_Arm_Layer", box: [-1, -2, -2, armW, 12, 4], uv: [48, 48], grow: 0.25 })
  );
  // The cape: CapeLayer's 10x16x1 box, turned to face backwards, hanging from
  // the top of the back (2 px behind the body's centre).
  const capeHolder = new THREE.Group();
  capeHolder.rotation.y = Math.PI;
  capeHolder.add(partMesh({ name: "Cape_2", box: [-5, 0, -1, 10, 16, 1], uv: [0, 0], material: "cape", tex: CAPE_TEX }));
  const cape = bone("Cape", 0, 12 * PX, 2 * PX, capeHolder);

  const body = bone(
    "Body", 0, 0, 0,
    // The torso box hangs from the neck, 12 px above the hips.
    bone(
      "Body_Mesh", 0, 12 * PX, 0,
      partMesh({ name: "Body_2", box: [-4, 0, -2, 8, 12, 4], uv: [16, 16] }),
      partMesh({ name: "Body_Layer", box: [-4, 0, -2, 8, 12, 4], uv: [16, 32], grow: 0.25 })
    ),
    head,
    rightArm,
    leftArm,
    cape
  );
  const rightLeg = bone(
    "Right_Leg", 1.9 * PX, 0, 0,
    partMesh({ name: "Right_Leg_2", box: [-2, 0, -2, 4, 12, 4], uv: [0, 16] }),
    partMesh({ name: "Right_Leg_Layer", box: [-2, 0, -2, 4, 12, 4], uv: [0, 32], grow: 0.25 })
  );
  const leftLeg = bone(
    "Left_Leg", -1.9 * PX, 0, 0,
    partMesh({ name: "Left_Leg_2", box: [-2, 0, -2, 4, 12, 4], uv: [16, 48] }),
    partMesh({ name: "Left_Leg_Layer", box: [-2, 0, -2, 4, 12, 4], uv: [0, 48], grow: 0.25 })
  );

  const orbit = bone("Orbit", 0, 12 * PX, 0, body, rightLeg, leftLeg);
  const root = bone("Root", 0, 0, 0, orbit);
  root.rotation.y = Math.PI;
  return root;
}

export interface PlayerRig {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

// Built once per variant and cloned per viewer, like the parsed glTF was:
// clones share the geometry (never disposed by the viewer) and get their own
// materials through the viewer's isolateMaterials().
const rigCache = new Map<"slim" | "classic", PlayerRig>();

export function getPlayerRig(variant: "slim" | "classic"): PlayerRig {
  let rig = rigCache.get(variant);
  if (!rig) {
    rig = { scene: buildScene(variant === "slim"), animations: buildPlayerClips() };
    rigCache.set(variant, rig);
  }
  return rig;
}
