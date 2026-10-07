// Wildlands settlements, streamed in round the kid: Lakeside, the Reedling Folk's fishing village
// on the Great Lake's shore (registry/settlements.ts SETTLEMENTS[0]), and however many follow it —
// every entry in that registry is built and disposed the very same way, so a new settlement never
// needs new engine code, only a new style builder here (see `buildPropsFor`) and a new registry
// entry.
//
// Cheap by construction: nothing is built until the kid is within BUILD_R of a settlement, and it's
// torn down again past DISPOSE_R (the kid starts the visit ~1.5 km from the nearest one). Once
// built, a settlement stays well under the budget (world/settlements/index.test.ts caps it at 12
// draw calls): one merged mesh for every hut/prop/pier, a handful of instanced meshes for its folk
// (shared with Coralcove's rig — world/village/crowd.ts), one instanced mesh for its canoes/fauna,
// and one more for its small life (critters.ts) — deterministic, allocation-free per frame.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { SETTLEMENTS, settlementDeckY, type SettlementDef } from "../../registry/settlements";
import { groundY } from "../../registry/terrain";
import { buildCanoe } from "../village/folk";
import { BODY_VARIANTS, buildCrowd, folkInstance, makeRig, resolveRig, type Crowd, type FolkMeshHandle, type Rig } from "../village/crowd";
import { buildLakesidePropsGeometry, lakesidePainted } from "./styles/lakeside";
import { buildTreetopPropsGeometry, treetopPainted } from "./styles/treetop";
import { buildMountainPropsGeometry, mountainPainted, buildYakGeometry } from "./styles/mountain";
import { buildTownMoving, buildTownPropsGeometry, townPainted, type TownMoving } from "./styles/town";
import { buildPaintedHouses, type PaintedHouses } from "./styles/paintedHouses";
import { buildBaseCampPropsGeometry, basecampPainted } from "./styles/basecamp";
import { buildFarmPropsGeometry, farmPainted } from "./styles/farm";
import { makeSettlementSim, stepSettlement, type SettlementSim, type TalkOut } from "./routine";
import { buildCanopy, type Canopy } from "./canopy";
import { buildCrittersGeometry, critterGroundY, makeCritters, stepCritters, type CritterState } from "./critters";

/** every clan's own palette, keyed by settlement id (falls back to the Reedling Folk's earthy
 *  reed-green below if a new settlement doesn't list one — never happens, but keeps this total) */
interface ClanPalette {
  skins: string[];
  hairs: string[];
  cloths: string[];
}
/** the Reedling Folk's palette — earthy and reed-green, distinct from Coralcove's sea pastels */
const LAKESIDE_PALETTE: ClanPalette = {
  skins: ["#d9b98a", "#c9a476", "#e8caa0", "#b88c5e", "#f0d6ab", "#a97b52", "#dcbb8e"],
  hairs: ["#5a3a22", "#2f2416", "#8a5a2c", "#1f1a12", "#6e4a2a", "#3a2a18", "#4a3420", "#7a5633"],
  cloths: ["#2a9d8f", "#3a6ea5", "#4a8f3c", "#e8893c", "#1f7a8c", "#5e9c4a", "#d9a441"],
};
/** the Canopy Folk — greens, orange, magenta, yellow cloth */
const TREETOP_PALETTE: ClanPalette = {
  skins: ["#c9955f", "#b87f49", "#d9ab7a", "#a06a3a", "#e0bd8e", "#8c5a34", "#cf9c68"],
  hairs: ["#2a1f14", "#3a2818", "#1a140e", "#4a3420", "#241a10", "#352619", "#1e1610", "#4a3020"],
  cloths: ["#3f8a3f", "#ff8a3c", "#e03c8a", "#e8c23c", "#4e9e52", "#2f7a4a", "#6fae3f"],
};
/** the Peakfolk — warm reds, deep blue, purple, mustard; hair colours read as knitted caps */
const HIGHSTONE_PALETTE: ClanPalette = {
  skins: ["#e0b088", "#d19a6e", "#c98a5c", "#eac29a", "#b87c52", "#d6a476", "#c08458"],
  hairs: ["#6e2a2a", "#2a3a6e", "#4a2a6e", "#7a5a1a", "#3a2a2a", "#2a4a5a", "#5a2a3a", "#6a4a1a"],
  cloths: ["#c0392b", "#2a4a8a", "#6a2a8a", "#c9972a", "#8a2a3a", "#2a6a8a", "#a8582a"],
};
/** the Sunflower Folk — bright yellows, sky blues, poppy reds, leaf greens */
const TOWN_PALETTE: ClanPalette = {
  skins: ["#e0b088", "#d19a6e", "#c98a5c", "#eac29a", "#b87c52", "#d6a476", "#c08458"],
  hairs: ["#c9972a", "#7a5a2a", "#4a3420", "#2a2420", "#8a5a2c", "#6e4a2a", "#5a3a22", "#3a2a18"],
  cloths: ["#f7d774", "#8fc7e8", "#e8705f", "#7fb86a", "#f0905a", "#9a5a9a", "#e6e2c8"],
};
/** the Climbers' Guild — bright puffy-jacket colours (reds/oranges/blues/yellows), easy to spot
 *  against snow, same as any real expedition's kit */
const BASECAMP_PALETTE: ClanPalette = {
  skins: ["#d9b98a", "#c9a476", "#e8caa0", "#b88c5e", "#f0d6ab", "#a97b52", "#8a5a3a"],
  hairs: ["#2a1f18", "#4a3420", "#1a140e", "#5a3a22", "#241a10", "#3a2818", "#6e4a2a", "#1e1610"],
  cloths: ["#c0392b", "#e8893c", "#2a6a8a", "#f2c23d", "#8a2a8a", "#2a9d8f", "#d94f6e"],
};
/** the Pulido family and their volcanologist guest — earthy farm cottons, a bright red/white for
 *  fiesta-day colour, straw-gold accents */
const FARM_PALETTE: ClanPalette = {
  skins: ["#d6a476", "#c08458", "#e0b088", "#b07048", "#eac29a", "#a56a40", "#cf9868"],
  hairs: ["#1f1812", "#3a2818", "#241a10", "#4a3420", "#1a140e", "#2a2018", "#5a3a22"],
  cloths: ["#c0392b", "#f2c23d", "#3f6ea8", "#e8e2d0", "#5a8f3a", "#8a4a2e", "#d94f6e"],
};
const PALETTE_OF: Record<string, ClanPalette> = { lakeside: LAKESIDE_PALETTE, treetop: TREETOP_PALETTE, highstone: HIGHSTONE_PALETTE, town: TOWN_PALETTE, basecamp: BASECAMP_PALETTE, "paricutin-farm": FARM_PALETTE };
/** yaks/goats: shaggy browns, blacks and creams (goats a touch paler) */
const YAK_COLORS = ["#6e4a2e", "#2a221c", "#e8ddc4", "#4a3824"];
const GOAT_COLORS = ["#e8e2d4", "#c9c2b0"];
/** sheep share the yak's own geometry (a shaggy quadruped reads fine as either) — just a creamier
 *  wool colour and a touch smaller, no new mesh or draw call needed */
const SHEEP_COLORS = ["#f5f0e0", "#e8e2d0", "#fbf7ec"];

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

interface FaunaState {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  color: THREE.Color;
  seed: number;
}

interface BuiltSettlement {
  group: THREE.Group;
  def: SettlementDef;
  sim: SettlementSim;
  crowd: Crowd;
  canoes: FolkMeshHandle | null;
  canoeState: CanoeState[];
  fauna: FolkMeshHandle | null;
  faunaState: FaunaState[];
  /** small life: chickens, a cat, ducks (Lakeside), a dog, butterflies (Treetop) — null for a
   *  settlement whose style has none picked for it (never happens today, every style gets a dog) */
  critters: FolkMeshHandle | null;
  critterState: CritterState[];
  /** Treetop's giant-tree crowns (layered, see-through near the kid/camera) — null everywhere else */
  canopy: Canopy | null;
  /** Sunnybrook's clock hands + windmill sails (its own tiny unmerged meshes) — null everywhere else */
  moving: TownMoving | null;
  /** the village's painted houses (one mesh, one picture) — null for a village without any */
  painted: PaintedHouses | null;
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
    case "treehouse":
      return buildTreetopPropsGeometry(def);
    case "mountain":
      return buildMountainPropsGeometry(def);
    case "town":
      return buildTownPropsGeometry(def, low);
    case "basecamp":
      return buildBaseCampPropsGeometry(def);
    case "farm":
      return buildFarmPropsGeometry(def);
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
  const pal = PALETTE_OF[def.id] ?? LAKESIDE_PALETTE;
  const skin = def.roster.map((v) => new THREE.Color(pal.skins[v.skin % pal.skins.length]));
  const hair = def.roster.map((v) => new THREE.Color(pal.hairs[v.hair % pal.hairs.length]));
  const cloth = def.roster.map((v) => new THREE.Color(pal.cloths[v.cloth % pal.cloths.length]));
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

  // the town's houses and shops: painted buildings (real artwork), each standing on its own ground
  let painted: PaintedHouses | null = null;
  const plan =
    def.style === "town"
      ? townPainted(def)
      : def.style === "mountain"
        ? mountainPainted(def)
        : def.style === "farm"
          ? farmPainted(def)
          : def.style === "treehouse"
            ? treetopPainted(def)
            : def.style === "basecamp"
              ? basecampPainted(def)
              : def.style === "lakeside"
                ? lakesidePainted(def)
                : null;
  if (plan && plan.houses.length) {
    for (const h of plan.houses) if (!h.fixedY) h.y = groundY(h.x, h.z);
    painted = buildPaintedHouses(plan.houses, plan.atlas, { lowQuality: low });
    group.add(painted.mesh);
  }

  // canoes: the ones pulled up on the sand (static) plus one paddling each of the village's loops —
  // only built at all for a settlement that actually has any (one fewer draw call elsewhere)
  const beached = def.props.filter((p) => p.kind === "canoe-beached");
  const canoeState: CanoeState[] = beached.map((p, i) => ({ loop: -1, phase: 0, beached: true, x: p.x, z: p.z, yaw: p.yaw, hull: new THREE.Color(["#8a5a36", "#6e8f5a", "#b0834a"][i % 3]) }));
  def.canoeLoops.forEach((loop, i) => {
    if (loop.length < 2) return;
    canoeState.push({ loop: i, phase: (i / Math.max(1, def.canoeLoops.length)) * loop.length, beached: false, x: loop[0].x, z: loop[0].z, yaw: 0, hull: new THREE.Color(["#4a7a6a", "#7a5a3a"][i % 2]) });
  });
  const canoes = canoeState.length ? folkInstance(group, crowd.folkMat, crowd.depthMat, buildCanoe(), canoeState.length, { name: `${def.id}-canoes`, shadow: true, lowQuality: low }) : null;

  // static grazers (Highstone's yaks/goats/sheep): idle in place, sharing the crowd's own material
  // (sheep reuse the very same geometry as yaks — just a creamier colour and a touch smaller)
  const faunaColorsOf = (kind: string) => (kind === "goat" ? GOAT_COLORS : kind === "sheep" ? SHEEP_COLORS : YAK_COLORS);
  const faunaState: FaunaState[] = def.fauna.map((f, i) => {
    const cs = faunaColorsOf(f.kind);
    return { x: f.x, z: f.z, yaw: f.yaw, scale: f.scale, color: new THREE.Color(cs[i % cs.length]), seed: i * 37 + (f.kind === "goat" ? 500 : f.kind === "sheep" ? 900 : 0) };
  });
  const fauna = faunaState.length ? folkInstance(group, crowd.folkMat, crowd.depthMat, buildYakGeometry(), faunaState.length, { name: `${def.id}-fauna`, shadow: true, lowQuality: low }) : null;

  // small life: chickens, a cat, ducks (Lakeside only), a dog, butterflies (Treetop only) — one
  // instanced mesh, sharing the crowd's own material (no new draw-call TYPE, same as canoes/fauna)
  const critterState: CritterState[] = makeCritters(def);
  const critters = critterState.length ? folkInstance(group, crowd.folkMat, crowd.depthMat, buildCrittersGeometry(), critterState.length, { name: `${def.id}-critters`, shadow: !low, lowQuality: low }) : null;

  // Treetop's giant-tree crowns: their own small mesh (layered tiers, faded near the kid/camera via
  // the jungle's own see-through cut), sharing the village's wind-sway uniforms (PU)
  const canopy =
    def.style === "treehouse"
      ? buildCanopy(
          group,
          def.props.filter((p) => p.kind === "giant-tree").map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, scale: p.scale, elev: p.elev ?? 0 })),
          low,
          PU
        )
      : null;

  // Sunnybrook's clock hands + windmill sails: their own tiny unmerged meshes (need their own
  // per-frame rotation), sharing the village's wind/glow uniforms (PU) like the canopy above
  const moving = def.style === "town" ? buildTownMoving(group, def, low, PU) : null;

  return { group, def, sim, crowd, canoes, canoeState, fauna, faunaState, critters, critterState, canopy, moving, painted, propsMesh, propMat, PU, skin, hair, cloth, scaleOf, bodyVar };
}

function disposeOne(b: BuiltSettlement) {
  b.group.parent?.remove(b.group);
  b.crowd.dispose();
  b.canoes?.dispose();
  b.fauna?.dispose();
  b.critters?.dispose();
  b.canopy?.dispose();
  b.moving?.dispose();
  b.painted?.dispose();
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
        b.painted?.setGlow(o.glow);
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

        // ── Treetop's giant-tree crowns: feed the kid's position so leaves near the kid/camera fade ──
        b.canopy?.update(o.kid);

        // ── Sunnybrook's clock hands (follow the park hour) and windmill sails (spin steadily) ──
        b.moving?.update(t, o.hour);

        // ── canoes: pulled up on the sand, or paddling a slow loop over the lake ──
        if (b.canoes) {
          const canoes = b.canoes;
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
            canoes.m.setMatrixAt(i, m4);
            canoes.m.setColorAt(i, c.hull);
            canoes.colB.setXYZ(i, 0.85, 0.9, 0.95);
            canoes.sel.setX(i, -1);
          }
          canoes.m.count = b.canoeState.length;
          canoes.m.instanceMatrix.needsUpdate = true;
          if (canoes.m.instanceColor) canoes.m.instanceColor.needsUpdate = true;
          canoes.colB.needsUpdate = true;
          canoes.sel.needsUpdate = true;
        }

        // ── Highstone's yaks and goats: idle in the pasture, a slow head-dip and a little sway,
        // never moving from their own fixed spot (a static push-out obstacle, like a hut) ──
        if (b.fauna) {
          const fauna = b.fauna;
          for (let i = 0; i < b.faunaState.length; i++) {
            const f = b.faunaState[i];
            const ph = t * 0.6 + f.seed;
            const dip = Math.max(0, Math.sin(ph)) * 0.1;
            const sway = Math.sin(ph * 0.7) * 0.06;
            const y = groundY(f.x, f.z) - dip * 0.3;
            e.set(dip * 0.35, f.yaw + sway, 0, "YXZ");
            m4.compose(vpos.set(f.x, y, f.z), q.setFromEuler(e), vscale.set(f.scale, f.scale, f.scale));
            fauna.m.setMatrixAt(i, m4);
            fauna.m.setColorAt(i, f.color);
            fauna.colB.setXYZ(i, 0.9, 0.9, 0.9);
            fauna.sel.setX(i, -1);
          }
          fauna.m.count = b.faunaState.length;
          fauna.m.instanceMatrix.needsUpdate = true;
          if (fauna.m.instanceColor) fauna.m.instanceColor.needsUpdate = true;
          fauna.colB.needsUpdate = true;
          fauna.sel.needsUpdate = true;
        }

        // ── small life: chickens pecking, a cat asleep, ducks paddling, a dog trotting (and
        // ambling over when the kid's close), butterflies looping over the flowers ──
        if (b.critters) {
          stepCritters(b.critterState, dt, t, { x: o.kid.x, z: o.kid.z });
          const critters = b.critters;
          for (let i = 0; i < b.critterState.length; i++) {
            const c = b.critterState[i];
            const y = critterGroundY(c);
            e.set(0, c.yaw, c.roll, "YXZ");
            m4.compose(vpos.set(c.x, y, c.z), q.setFromEuler(e), vscale.set(c.scale, c.scale, c.scale));
            critters.m.setMatrixAt(i, m4);
            critters.m.setColorAt(i, c.color);
            critters.colB.setXYZ(i, 1, 1, 1);
            critters.sel.setX(i, c.kind);
          }
          critters.m.count = b.critterState.length;
          critters.m.instanceMatrix.needsUpdate = true;
          if (critters.m.instanceColor) critters.m.instanceColor.needsUpdate = true;
          critters.colB.needsUpdate = true;
          critters.sel.needsUpdate = true;
        }

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
