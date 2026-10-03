// Wildlands settlements, streamed in round the kid: Lakeside, the Reedling Folk's fishing village
// on the Great Lake's shore (registry/settlements.ts SETTLEMENTS[0]), and however many follow it —
// every entry in that registry is built and disposed the very same way, so a new settlement never
// needs new engine code, only a new style builder here (see `buildPropsFor`) and a new registry
// entry.
//
// Cheap by construction: nothing is built until the kid is within BUILD_R of a settlement, and it's
// torn down again past DISPOSE_R (the kid starts the visit ~1.5 km from the nearest one). Once
// built, a settlement is ≤ 6 draw calls (one merged mesh for every hut/prop/pier, a handful of
// instanced meshes for its folk, shared with Coralcove's rig — world/village/crowd.ts — and one
// instanced mesh for its canoes), deterministic, allocation-free per frame.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { SETTLEMENTS, settlementDeckY, type SettlementDef } from "../../registry/settlements";
import { groundY } from "../../registry/terrain";
import { buildCanoe } from "../village/folk";
import { BODY_VARIANTS, buildCrowd, folkInstance, makeRig, resolveRig, type Crowd, type FolkMeshHandle, type Rig } from "../village/crowd";
import { buildLakesidePropsGeometry } from "./props";
import { makeSettlementSim, stepSettlement, type SettlementSim, type TalkOut } from "./routine";

/** the Reedling Folk's palette — earthy and reed-green, distinct from Coralcove's sea pastels */
const SKINS = ["#d9b98a", "#c9a476", "#e8caa0", "#b88c5e", "#f0d6ab", "#a97b52", "#dcbb8e"];
const HAIRS = ["#5a3a22", "#2f2416", "#8a5a2c", "#1f1a12", "#6e4a2a", "#3a2a18", "#4a3420", "#7a5633"];
const CLOTHS = ["#2a9d8f", "#3a6ea5", "#4a8f3c", "#e8893c", "#1f7a8c", "#5e9c4a", "#d9a441"];

export interface SettlementTalkOut {
  id: string;
  name: string;
  line: string;
  emoji: string;
}
export interface ActivityOffer {
  settlement: string;
  id: string;
  label: string;
  emoji: string;
}
export interface Settlements {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number }): { talk: SettlementTalkOut | null; activity: ActivityOffer | null };
  dispose(): void;
}

/** built within this of a settlement's centre; torn down again past this */
const BUILD_R = 550;
const DISPOSE_R = 750;

interface CanoeState {
  loop: number;
  phase: number;
  beached: boolean;
  x: number;
  z: number;
  yaw: number;
  hull: THREE.Color;
}

interface BuiltSettlement {
  group: THREE.Group;
  def: SettlementDef;
  sim: SettlementSim;
  crowd: Crowd;
  canoes: FolkMeshHandle;
  canoeState: CanoeState[];
  propsMesh: THREE.Mesh;
  propMat: THREE.Material;
  PU: ReturnType<typeof makeUniforms>;
  skin: THREE.Color[];
  hair: THREE.Color[];
  cloth: THREE.Color[];
  scaleOf: number[];
  bodyVar: number[];
}

function buildPropsFor(def: SettlementDef, low: boolean): THREE.BufferGeometry {
  // (style dispatch: every later settlement style gets its own builder here)
  switch (def.style) {
    case "lakeside":
    default:
      return buildLakesidePropsGeometry(def, low);
  }
}

function buildOne(scene: THREE.Scene, def: SettlementDef, low: boolean): BuiltSettlement {
  const group = new THREE.Group();
  group.name = `settlement-${def.id}`;
  scene.add(group);

  const sim = makeSettlementSim(def);
  const N = def.roster.length;
  const crowd = buildCrowd(group, N, { lowQuality: low, wings: false, name: `settlement-${def.id}` });
  const skin = def.roster.map((v) => new THREE.Color(SKINS[v.skin % SKINS.length]));
  const hair = def.roster.map((v) => new THREE.Color(HAIRS[v.hair % HAIRS.length]));
  const cloth = def.roster.map((v) => new THREE.Color(CLOTHS[v.cloth % CLOTHS.length]));
  const scaleOf = def.roster.map((v) => (v.kid ? 0.7 : v.elder ? 0.92 : 1) * (0.96 + ((v.seed * 13) % 9) / 100));
  const bodyVar = def.roster.map((v) => BODY_VARIANTS[v.body] ?? BODY_VARIANTS[0]);

  const PU = makeUniforms();
  PU.uSway.value = 0.12;
  const propGeo = buildPropsFor(def, low);
  const propMat = fxMaterial(PU, { roughness: 0.88, metalness: 0, flatShading: true });
  const propsMesh = new THREE.Mesh(propGeo, propMat);
  propsMesh.name = `${def.id}-props`;
  propsMesh.castShadow = !low;
  propsMesh.receiveShadow = !low;
  group.add(propsMesh);

  // canoes: the ones pulled up on the sand (static) plus one paddling each of the village's loops
  const beached = def.props.filter((p) => p.kind === "canoe-beached");
  const canoeState: CanoeState[] = beached.map((p, i) => ({ loop: -1, phase: 0, beached: true, x: p.x, z: p.z, yaw: p.yaw, hull: new THREE.Color(["#8a5a36", "#6e8f5a", "#b0834a"][i % 3]) }));
  def.canoeLoops.forEach((loop, i) => {
    if (loop.length < 2) return;
    canoeState.push({ loop: i, phase: (i / Math.max(1, def.canoeLoops.length)) * loop.length, beached: false, x: loop[0].x, z: loop[0].z, yaw: 0, hull: new THREE.Color(["#4a7a6a", "#7a5a3a"][i % 2]) });
  });
  const canoes = folkInstance(group, crowd.folkMat, crowd.depthMat, buildCanoe(), Math.max(1, canoeState.length), { name: `${def.id}-canoes`, shadow: true, lowQuality: low });

  return { group, def, sim, crowd, canoes, canoeState, propsMesh, propMat, PU, skin, hair, cloth, scaleOf, bodyVar };
}

function disposeOne(b: BuiltSettlement) {
  b.group.parent?.remove(b.group);
  b.crowd.dispose();
  b.canoes.dispose();
  b.propsMesh.geometry.dispose();
  b.propMat.dispose();
}

export function buildSettlements(scene: THREE.Scene, opts: { lowQuality?: boolean } = {}): Settlements {
  const low = !!opts.lowQuality;
  const built = new Map<string, BuiltSettlement | null>();
  const rig: Rig = makeRig();
  const talk: TalkOut = { id: "", name: "", line: "", emoji: "" };
  const result: { talk: SettlementTalkOut | null; activity: ActivityOffer | null } = { talk: null, activity: null };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const vpos = new THREE.Vector3();
  const vscale = new THREE.Vector3();

  return {
    update(dt, t, o) {
      result.talk = null;
      result.activity = null;
      for (const def of SETTLEMENTS) {
        const d = Math.hypot(o.kid.x - def.x, o.kid.z - def.z);
        let b = built.get(def.id) ?? null;
        if (!b && d < BUILD_R) {
          b = buildOne(scene, def, low);
          built.set(def.id, b);
        } else if (b && d > DISPOSE_R) {
          disposeOne(b);
          built.set(def.id, null);
          b = null;
        }
        if (!b) continue;

        const fog = scene.fog as THREE.Fog | null;
        if (fog) {
          b.PU.uGlowK.value = 0.08 + o.glow * 1.4;
        }
        b.PU.uTime.value = t;
        b.PU.uPulse.value = o.glow;
        b.crowd.glow.uGlowK.value = 0.12 + o.glow * 1.2;

        const talker = stepSettlement(def, b.sim, dt, t, o.hour, { x: o.kid.x, z: o.kid.z }, talk);
        if (talker >= 0) result.talk = { id: talk.id, name: talk.name, line: talk.line, emoji: talk.emoji };

        b.crowd.begin();
        for (let i = 0; i < def.roster.length; i++) {
          const v = b.sim.villagers[i];
          const p = v.pose;
          if (p.hidden) continue;
          resolveRig(p, v.def.seed, v.def.elder, t, rig);
          const y = settlementDeckY(v.x, v.z) ?? groundY(v.x, v.z);
          b.crowd.place({ x: v.x, y, z: v.z, yaw: v.yaw, scale: b.scaleOf[i], anim: p.anim, rig, bodyVariant: b.bodyVar[i], hairStyle: v.def.hairStyle, cloth: b.cloth[i], skin: b.skin[i], hair: b.hair[i], tool: p.tool });
        }
        b.crowd.end();

        // ── canoes: pulled up on the sand, or paddling a slow loop over the lake ──
        for (let i = 0; i < b.canoeState.length; i++) {
          const c = b.canoeState[i];
          if (!c.beached) {
            const loop = def.canoeLoops[c.loop];
            c.phase = (c.phase + dt * 1.1) % loop.length;
            const k0 = Math.floor(c.phase);
            const k1 = (k0 + 1) % loop.length;
            const f = c.phase - k0;
            const ax = loop[k0].x;
            const az = loop[k0].z;
            const bx = loop[k1].x;
            const bz = loop[k1].z;
            c.x = ax + (bx - ax) * f;
            c.z = az + (bz - az) * f;
            c.yaw = Math.atan2(bx - ax, bz - az);
          }
          const y = c.beached ? groundY(c.x, c.z) + 0.05 : -0.25 + 0.03 * Math.sin(t * 1.4 + i);
          e.set(0, c.yaw, 0, "YXZ");
          m4.compose(vpos.set(c.x, y, c.z), q.setFromEuler(e), vscale.set(1, 1, 1));
          b.canoes.m.setMatrixAt(i, m4);
          b.canoes.m.setColorAt(i, c.hull);
          b.canoes.colB.setXYZ(i, 0.85, 0.9, 0.95);
          b.canoes.sel.setX(i, -1);
        }
        b.canoes.m.count = b.canoeState.length;
        b.canoes.m.instanceMatrix.needsUpdate = true;
        if (b.canoes.m.instanceColor) b.canoes.m.instanceColor.needsUpdate = true;
        b.canoes.colB.needsUpdate = true;
        b.canoes.sel.needsUpdate = true;

        // ── something to do here: the fishing spot at the end of the pier ──
        for (const act of def.activities) {
          const ad = Math.hypot(o.kid.x - act.x, o.kid.z - act.z);
          if (ad < act.r) result.activity = { settlement: def.name, id: act.id, label: act.label, emoji: act.emoji };
        }
      }
      return result;
    },
    dispose() {
      for (const b of built.values()) if (b) disposeOne(b);
      built.clear();
    },
  };
}
