// The shared "fantasy folk" crowd: a clan's bodies, heads, limbs, wings and hand tools as a
// handful of instanced meshes (./folk.ts geometry + ./kit.ts layout/material), posed every frame
// from a `Pose` (what each person is doing right now) resolved into joint angles by `resolveRig`.
// One module, reused by every settlement's folk — Coralcove's Tidewing Folk (buildVillage, below)
// and the Wildlands settlements (world/settlements/) — so a whole new clan is just a palette and a
// routine, not new rigging code. Wings are optional per clan (a clan with none simply never calls
// place() with a wing colour, and no wing mesh is built at all: one fewer draw call).
import * as THREE from "three";
import { addFolkInstanceAttrs, folkDepthMaterial, folkMaterial, type FolkUniforms } from "./kit";
import { BODY_APRON, BODY_DRESS, BODY_ROBE, BODY_TUNIC, HAND_TOOLS, HIP, LEG_X, LIMB_ARM, LIMB_LEG, NECK, SHOULDER, TOOL_IDS, WING_ROOT, WING_SPRITE, buildBody, buildHead, buildLimb, buildTools, buildWing } from "./folk";

export type Anim = "stand" | "walk" | "run" | "sit" | "sit-edge" | "sit-ground" | "sweep" | "bake" | "sell" | "garden" | "wash" | "light" | "flute" | "dance" | "turn" | "jump" | "talk" | "look" | "nets" | "story" | "drum" | "fish";
export type Tool = "none" | "rod" | "broom" | "drum" | "flute" | "tray" | "pole" | "hoe" | "basket" | "rope";
export const TOOLS: Tool[] = ["none", "rod", "broom", "drum", "flute", "tray", "pole", "hoe", "basket", "rope"];

/** the per-villager "what they're doing right now" a routine module fills each frame */
export interface Pose {
  anim: Anim;
  /** walk/run cycle phase (radians) and how much of it shows (0..1) */
  cycle: number;
  gait: number;
  /** 0..1: waving at the Park kid */
  wave: number;
  /** yaw of the head relative to the body (looking at the kid) */
  look: number;
  tool: Tool;
  hidden: boolean;
}

/** the joint angles one pose resolves to (reused, allocation-free) */
export interface Rig {
  hipY: number;
  bob: number;
  lean: number;
  roll: number;
  yawAdd: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  aLs: number;
  aLr: number;
  aRs: number;
  aRr: number;
  lLs: number;
  lRs: number;
  lSpread: number;
  flap: number;
}

export const BODY_VARIANTS = [BODY_TUNIC, BODY_DRESS, BODY_ROBE, BODY_APRON];

/** a fresh, zeroed Rig (one per crowd; reused every frame) */
export function makeRig(): Rig {
  return { hipY: 0, bob: 0, lean: 0, roll: 0, yawAdd: 0, headYaw: 0, headPitch: 0, headRoll: 0, aLs: 0, aLr: 0, aRs: 0, aRr: 0, lLs: 0, lRs: 0, lSpread: 0, flap: 0 };
}

/**
 * Resolve a pose into joint angles: `seed` (the person's own random seed, for idle sway) and
 * `elder` (a little stooped) stand in for the whole villager record, so this has no dependency on
 * any one clan's routine. Exactly Coralcove's original rig (every Anim it ever produces).
 */
export function resolveRig(p: Pose, seed: number, elder: boolean, t: number, r: Rig): void {
  const ph = (seed % 97) * 0.37;
  r.hipY = HIP;
  r.bob = Math.sin(t * 2 + ph) * 0.012;
  r.lean = elder ? 0.12 : 0;
  r.roll = 0;
  r.yawAdd = 0;
  r.headYaw = p.look * 0.85 + Math.sin(t * 0.5 + ph) * 0.15;
  r.headPitch = Math.sin(t * 0.7 + ph) * 0.05;
  r.headRoll = Math.sin(t * 0.9 + ph * 2) * 0.06;
  r.aLs = Math.sin(t * 1.3 + ph) * 0.05;
  r.aRs = -r.aLs;
  r.aLr = 0.08;
  r.aRr = 0.08;
  r.lLs = 0;
  r.lRs = 0;
  r.lSpread = 0;
  r.flap = 0.18 + Math.sin(t * 7 + ph) * 0.12;
  const c = p.cycle;
  switch (p.anim) {
    case "walk": {
      const g = p.gait;
      r.lLs = Math.sin(c) * 0.62 * g;
      r.lRs = -r.lLs;
      r.aLs = -Math.sin(c) * 0.5 * g;
      r.aRs = -r.aLs;
      r.bob = Math.abs(Math.cos(c)) * 0.06 * g;
      r.roll = Math.sin(c) * 0.06 * g;
      r.flap = 0.3 + Math.sin(t * 10 + ph) * 0.2;
      break;
    }
    case "run": {
      const g = Math.max(0.6, p.gait);
      r.lLs = Math.sin(c) * 0.95 * g;
      r.lRs = -r.lLs;
      r.aLs = -Math.sin(c) * 0.95 * g;
      r.aRs = -r.aLs;
      r.aLr = r.aRr = 0.3;
      r.bob = Math.abs(Math.cos(c)) * 0.13 * g;
      r.lean = 0.16;
      r.roll = Math.sin(c) * 0.05;
      r.flap = 0.5 + Math.sin(t * 16 + ph) * 0.35;
      break;
    }
    case "sit":
    case "story": {
      r.hipY = 0.58;
      r.lLs = r.lRs = 1.45;
      r.aLs = r.aRs = 0.45;
      r.aLr = r.aRr = -0.1;
      if (p.anim === "story") {
        // telling a tale: big arm gestures, looking round the circle
        r.aRs = 0.9 + Math.sin(t * 2.2 + ph) * 0.5;
        r.aRr = 0.5 + Math.sin(t * 1.7) * 0.4;
        r.aLs = 0.7 + Math.sin(t * 1.9 + 1) * 0.4;
        r.aLr = 0.3 + Math.sin(t * 1.3 + 2) * 0.3;
        r.headYaw += Math.sin(t * 0.6) * 0.5;
      }
      break;
    }
    case "fish":
    case "sit-edge": {
      r.hipY = 0.12;
      r.lLs = 0.55 + Math.sin(t * 2.1 + ph) * 0.25;
      r.lRs = 0.55 - Math.sin(t * 2.1 + ph) * 0.25;
      r.aRs = 1.05 + Math.max(0, Math.sin(t * 0.4 + ph) - 0.85) * 3;
      r.aLs = 0.95;
      r.aLr = -0.25;
      r.aRr = -0.05;
      r.headPitch = 0.12;
      break;
    }
    case "drum":
    case "sit-ground": {
      r.hipY = 0.14;
      r.lLs = r.lRs = 1.45;
      r.lSpread = 0.35;
      const beat = t * 7.5 + ph;
      r.aLs = 0.85 + Math.max(0, Math.sin(beat)) * 0.45;
      r.aRs = 0.85 + Math.max(0, Math.sin(beat + Math.PI)) * 0.45;
      r.aLr = r.aRr = 0.25;
      r.bob = Math.abs(Math.sin(beat * 0.5)) * 0.03;
      r.headPitch = Math.sin(beat) * 0.08;
      r.headRoll = Math.sin(beat * 0.5) * 0.1;
      break;
    }
    case "sweep": {
      r.aLs = r.aRs = 0.6;
      r.aLr = -0.2;
      r.aRr = -0.1;
      r.yawAdd = Math.sin(t * 2.6 + ph) * 0.35;
      r.lean = 0.12;
      r.headPitch = 0.15;
      break;
    }
    case "bake": {
      const k = Math.sin(t * 1.4 + ph);
      r.aLs = r.aRs = 1.3 + k * 0.15;
      r.aLr = r.aRr = -0.15;
      r.lean = 0.08 + Math.max(0, k) * 0.1;
      r.headPitch = 0.1;
      break;
    }
    case "sell": {
      r.aRs = 0.7 + Math.sin(t * 2.3 + ph) * 0.35;
      r.aRr = 0.35;
      r.aLs = 0.5;
      r.headPitch = Math.sin(t * 3 + ph) * 0.08;
      // now and then: holding something up for the shoppers to see
      if (Math.sin(t * 0.35 + ph) > 0.8) r.aRs = 2.2;
      break;
    }
    case "garden": {
      const k = Math.sin(t * 3.2 + ph);
      r.lean = 0.45;
      r.aLs = r.aRs = 0.95 + k * 0.4;
      r.aLr = -0.15;
      r.aRr = -0.1;
      r.bob = -0.04 + Math.abs(k) * 0.02;
      r.headPitch = 0.3;
      break;
    }
    case "wash": {
      const k = Math.sin(t * 1.8 + ph);
      r.aLs = 2.5 + k * 0.2;
      r.aRs = 2.5 - k * 0.2;
      r.aLr = r.aRr = 0.25;
      r.headPitch = -0.3;
      r.bob = Math.max(0, k) * 0.03;
      break;
    }
    case "light": {
      r.aRs = 0.9;
      r.aLs = 0.9;
      r.aLr = -0.3;
      r.headPitch = -0.35;
      break;
    }
    case "flute": {
      r.aLs = r.aRs = 1.35;
      r.aLr = r.aRr = -0.45;
      r.roll = Math.sin(t * 1.5 + ph) * 0.08;
      r.bob = Math.abs(Math.sin(t * 1.5 + ph)) * 0.03;
      r.headRoll = Math.sin(t * 1.5 + ph) * 0.12;
      break;
    }
    case "dance": {
      const k = t * 4.6 + ph;
      r.bob = Math.abs(Math.sin(k)) * 0.24;
      r.aLr = 1.95 + Math.sin(k) * 0.4;
      r.aRr = 1.95 - Math.sin(k) * 0.4;
      r.aLs = r.aRs = 0.35;
      r.lLs = Math.max(0, Math.sin(k)) * 0.5;
      r.lRs = Math.max(0, -Math.sin(k)) * 0.5;
      r.roll = Math.sin(k * 0.5) * 0.14;
      r.headRoll = Math.sin(k * 0.5) * 0.15;
      r.flap = 0.5 + Math.sin(t * 18 + ph) * 0.4;
      break;
    }
    case "turn": {
      const k = t * 6;
      r.aRs = 1.0 + Math.cos(k) * 0.5;
      r.aRr = 0.35 + Math.sin(k) * 0.35;
      r.aLs = 0.3;
      r.bob = Math.abs(Math.sin(k)) * 0.02;
      break;
    }
    case "jump": {
      const k = t * 6;
      const up = Math.max(0, Math.sin(k));
      r.bob = up * 0.42;
      r.lLs = r.lRs = up * 0.5;
      r.aLr = r.aRr = 0.9 + up * 0.5;
      r.flap = 0.4 + up * 0.6;
      break;
    }
    case "talk": {
      r.aRs = 0.8 + Math.sin(t * 3.4 + ph) * 0.3;
      r.aRr = 0.45 + Math.sin(t * 2.3) * 0.2;
      r.headPitch = Math.sin(t * 4.5) * 0.08;
      break;
    }
    case "look": {
      r.aRs = 1.85;
      r.aRr = 0.4;
      r.headPitch = -0.12;
      r.headYaw += Math.sin(t * 0.35 + ph) * 0.5;
      break;
    }
    case "nets": {
      const k = Math.sin(t * 2.6 + ph);
      r.aLs = 1.05 + k * 0.2;
      r.aRs = 1.05 - k * 0.2;
      r.aLr = r.aRr = -0.1;
      r.headPitch = 0.15;
      break;
    }
    default:
      break;
  }
  // waving at the Park kid (the free hand; or the right one)
  if (p.wave > 0.01) {
    const left = p.tool !== "none" && HAND_TOOLS.has(TOOL_IDS[p.tool]);
    // (out to the side and up, so the hand clears the big head)
    const wv = 2.0 + Math.sin(t * 10 + ph) * 0.38;
    if (left) {
      r.aLr += (wv - r.aLr) * p.wave;
      r.aLs += (0.45 - r.aLs) * p.wave;
    } else {
      r.aRr += (wv - r.aRr) * p.wave;
      r.aRs += (0.45 - r.aRs) * p.wave;
    }
    r.headRoll += Math.sin(t * 5 + ph) * 0.08 * p.wave;
  }
}

// ── one instanced mesh in the folk layout (bodies, heads, limbs, wings, tools — and a clan's
// critters and boats, which use the very same material and attributes) ──

export interface FolkMeshHandle {
  m: THREE.InstancedMesh;
  colB: THREE.InstancedBufferAttribute;
  sel: THREE.InstancedBufferAttribute;
  /** disposes this mesh's own geometry too (the material is shared — the caller disposes that once) */
  dispose(): void;
}

export function folkInstance(group: THREE.Object3D, mat: THREE.Material, depthMat: THREE.Material, geo: THREE.BufferGeometry, count: number, opts: { name: string; shadow?: boolean; lowQuality?: boolean; boundingSphere?: THREE.Sphere }): FolkMeshHandle {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.name = opts.name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.castShadow = !!opts.shadow && !opts.lowQuality;
  m.customDepthMaterial = depthMat;
  if (opts.boundingSphere) m.boundingSphere = opts.boundingSphere;
  else m.frustumCulled = false;
  const a = addFolkInstanceAttrs(m);
  group.add(m);
  return { m, ...a, dispose: () => { geo.dispose(); m.dispose(); } };
}

export interface CrowdOpts {
  lowQuality?: boolean;
  /** false = this clan has no wings: no wing mesh is built at all (one fewer draw call) */
  wings?: boolean;
  /** capacity of the wings mesh, beyond the 2-per-person a clan with wings needs (e.g. Coralcove's
   *  gulls, which share the same mesh) */
  wingCapacity?: number;
  /** capacity of the tools mesh, beyond the 1-per-person most clans need (e.g. Coralcove's
   *  skipping rope, a prop with no villager "holding" it) */
  toolCapacity?: number;
  /** every instanced mesh's name is `${name}-bodies` etc. */
  name: string;
  /** keeps a far-off crowd (in its own local group, like Coralcove's island) from being wrongly
   *  frustum-culled; omit it (and the mesh just skips culling) for a crowd near the world origin */
  boundingSphere?: THREE.Sphere;
}

export interface PersonInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  anim: Anim;
  rig: Rig;
  bodyVariant: number;
  hairStyle: number;
  cloth: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  /** omit for a clan with no wings */
  wing?: THREE.Color;
  tool: Tool;
}

export interface Crowd {
  folkMat: THREE.MeshStandardMaterial;
  depthMat: THREE.MeshDepthMaterial;
  /** the shared glow uniform (night-time emissive on skin/cloth/hair) */
  glow: FolkUniforms;
  /** reset the per-frame instance counters (call once before placing this frame's people) */
  begin(): void;
  /** pose and place one person (writes body, head, 2 arms, 2 legs, wings if this clan has them, and
   *  their tool, if any, into the instanced meshes) */
  place(p: PersonInput): void;
  /** append one more tool instance directly, not tied to any person (Coralcove's skipping rope,
   *  held between two turners at a fixed point, not in anyone's hand) */
  extraTool(m: THREE.Matrix4, cloth: THREE.Color, skin: THREE.Color, toolId: number): void;
  /** append one more wing instance directly (Coralcove's gulls, sharing the wing mesh) */
  extraWing(m: THREE.Matrix4, color: THREE.Color, variant: number): void;
  /** push the frame's instance counts to the meshes (call once after every place()/extra*()) */
  end(): void;
  dispose(): void;
}

export function buildCrowd(group: THREE.Object3D, n: number, opts: CrowdOpts): Crowd {
  const low = !!opts.lowQuality;
  const withWings = opts.wings !== false;
  const toolCap = opts.toolCapacity ?? n;
  const wingCap = opts.wingCapacity ?? n * 2;
  const glow: FolkUniforms = { uGlowK: { value: 0.1 } };
  const folkMat = folkMaterial(glow);
  const depthMat = folkDepthMaterial();
  const inst = (name: string, geo: THREE.BufferGeometry, count: number, shadow: boolean) => folkInstance(group, folkMat, depthMat, geo, count, { name: `${opts.name}-${name}`, shadow, lowQuality: low, boundingSphere: opts.boundingSphere });

  const bodies = inst("bodies", buildBody(low), n, true);
  const heads = inst("heads", buildHead(low), n, true);
  const limbs = inst("limbs", buildLimb(), n * 4, true);
  const wings = withWings ? inst("wings", buildWing(), wingCap, false) : null;
  const tools = inst("tools", buildTools(), toolCap, true);

  // ── scratch (allocation-free update) ──
  const mRoot = new THREE.Matrix4();
  const mLocal = new THREE.Matrix4();
  const mOut = new THREE.Matrix4();
  const mArmR = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3();
  const local = (px: number, py: number, pz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, out: THREE.Matrix4) => {
    e.set(rx, ry, rz, "YXZ");
    return out.compose(vp.set(px, py, pz), q.setFromEuler(e), vs.set(sx, sy, sz));
  };
  const setInst = (o: FolkMeshHandle, i: number, m: THREE.Matrix4, c: THREE.Color, b: THREE.Color | null, sel: number) => {
    o.m.setMatrixAt(i, m);
    o.m.setColorAt(i, c);
    if (b) o.colB.setXYZ(i, b.r, b.g, b.b);
    o.sel.setX(i, sel);
  };

  let nb = 0;
  let nl = 0;
  let nw = 0;
  let nt = 0;
  const ALL = [bodies, heads, limbs, wings, tools].filter((x): x is FolkMeshHandle => !!x);

  return {
    folkMat,
    depthMat,
    glow,
    begin() {
      nb = 0;
      nl = 0;
      nw = 0;
      nt = 0;
    },
    place(p) {
      const s = p.scale;
      const rig = p.rig;
      // root = the hips
      local(p.x, p.y + (rig.hipY + rig.bob) * s, p.z, rig.lean, p.yaw + rig.yawAdd, rig.roll, s, s, s, mRoot);
      setInst(bodies, nb, mRoot, p.cloth, p.skin, p.bodyVariant);
      // head
      mOut.multiplyMatrices(mRoot, local(0, NECK, 0, rig.headPitch, rig.headYaw, rig.headRoll, 1, 1, 1, mLocal));
      setInst(heads, nb, mOut, p.hair, p.skin, p.hairStyle);
      // arms (left +x is the person's left: facing +z, left is +x)
      mOut.multiplyMatrices(mRoot, local(SHOULDER.x, SHOULDER.y, 0, -rig.aLs, 0, rig.aLr, 1, 1, 1, mLocal));
      setInst(limbs, nl++, mOut, p.cloth, p.skin, LIMB_ARM);
      mArmR.multiplyMatrices(mRoot, local(-SHOULDER.x, SHOULDER.y, 0, -rig.aRs, 0, -rig.aRr, 1, 1, 1, mLocal));
      setInst(limbs, nl++, mArmR, p.cloth, p.skin, LIMB_ARM);
      // legs
      mOut.multiplyMatrices(mRoot, local(LEG_X, 0, 0, -rig.lLs, 0, rig.lSpread, 1, 1, 1, mLocal));
      setInst(limbs, nl++, mOut, p.cloth, p.skin, LIMB_LEG);
      mOut.multiplyMatrices(mRoot, local(-LEG_X, 0, 0, -rig.lRs, 0, -rig.lSpread, 1, 1, 1, mLocal));
      setInst(limbs, nl++, mOut, p.cloth, p.skin, LIMB_LEG);
      // wings (the left one mirrored) — only clans that have them
      if (wings && p.wing) {
        for (let sd = 1; sd >= -1; sd -= 2) {
          mOut.multiplyMatrices(mRoot, local(sd * WING_ROOT.x, WING_ROOT.y, WING_ROOT.z, 0.15, sd * (0.55 + rig.flap), sd * 0.2, sd, 1, 1, mLocal));
          setInst(wings, nw++, mOut, p.wing, null, WING_SPRITE);
        }
      }
      // the tool in hand
      const toolId = TOOL_IDS[p.tool];
      if (toolId !== TOOL_IDS.none && toolId !== TOOL_IDS.rope) {
        let tm: THREE.Matrix4;
        if (HAND_TOOLS.has(toolId)) tm = mArmR;
        else if (toolId === TOOL_IDS.pole && p.anim === "light") {
          mOut.multiplyMatrices(mRoot, local(0, 0, 0, 0.45, 0, 0, 1, 1, 1, mLocal));
          tm = mOut;
        } else tm = mRoot;
        setInst(tools, nt++, tm, p.cloth, p.skin, toolId);
      }
      nb++;
    },
    extraTool(m, cloth, skin, toolId) {
      setInst(tools, nt++, m, cloth, skin, toolId);
    },
    extraWing(m, color, variant) {
      if (!wings) return;
      setInst(wings, nw++, m, color, null, variant);
    },
    end() {
      bodies.m.count = nb;
      heads.m.count = nb;
      limbs.m.count = nl;
      if (wings) wings.m.count = nw;
      tools.m.count = nt;
      for (const o of ALL) {
        o.m.instanceMatrix.needsUpdate = true;
        if (o.m.instanceColor) o.m.instanceColor.needsUpdate = true;
        o.colB.needsUpdate = true;
        o.sel.needsUpdate = true;
      }
    },
    dispose() {
      for (const o of ALL) o.dispose();
      folkMat.dispose();
      depthMat.dispose();
    },
  };
}
