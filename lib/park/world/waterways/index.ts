// Rainbow Falls, the river, Rainbow Lake and the outlet to the sea, built from the waterways registry
// (lib/park/registry/waterways.ts — the terrain carves the beds from the same shapes):
//   ./water.ts     one flow-mapped water surface for all of them
//   ./falls.ts     the waterfall, its mist, spray and rainbow
//   ./props.ts     bridges, the ford, boulders, reeds, irises, lily pads, lotus, weed, the willow
//   ./fish.ts      koi, perch and trout (a leaping fish now and then)
//   ./critters.ts  frogs, turtles, a heron, a kingfisher, dragonflies
// Eight draw calls in all; every update loop is allocation-free.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { WATER_Y } from "../../registry/terrain";
import { waterSdf } from "../../registry/waterways";
import { addJungleCut, type JungleCut } from "../jungle/cutaway";
import { buildWaterSurface, MAX_SPLASH, waterSurfaceJob, type WaterSurface } from "./water";
import { buildFalls, type Falls } from "./falls";
import { WILD_FALLS, WILD_FALLS_SECTIONS, WILD_WATER_BOUNDS } from "../../registry/wildWater";
import { buildVicBridge, buildFallsIslands, type WildBridge } from "./wildBridge";
import { buildWaterProps, type WaterSpots } from "./props";
import { addSplash, buildLakeFish } from "./fish";
import { buildLakeCritters } from "./critters";

export interface Waterways {
  /** boulders on the banks, the willow's trunk */
  obstacles: { x: number; z: number; r: number }[];
  spots: WaterSpots;
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number }): void;
  stats: { calls: number; tris: number; fish: number; critters: number };
  dispose(): void;
}

export function buildWaterways(scene: THREE.Scene, opts: { lowQuality?: boolean; cut: JungleCut }): Waterways {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "waterways";
  const disposables: { dispose(): void }[] = [];
  let calls = 0;
  let tris = 0;
  const camPos = new THREE.Vector3();
  let haveCam = false;

  const water = buildWaterSurface({ lowQuality: low });
  disposables.push(water);
  water.mesh.onBeforeRender = (_r, _s, cam) => {
    camPos.setFromMatrixPosition(cam.matrixWorld);
    haveCam = true;
  };
  group.add(water.mesh);
  calls++;
  tris += water.tris;

  const falls = buildFalls({ lowQuality: low });
  disposables.push(falls);
  group.add(falls.group);
  calls += 3;
  tris += falls.tris;

  // ── the Wildlands' Great Falls, Wild River and Great Lake: built only once the kid heads that way
  //    (a little each frame, so nothing waits on it — and the park loads none of it), shown when near ──
  const wild = new THREE.Group();
  wild.name = "wild-water";
  wild.visible = false;
  group.add(wild);
  let wildWater: WaterSurface | null = null;
  let wildFalls: Falls[] = [];
  let wildBridge: WildBridge | null = null;
  let wildIslands: WildBridge | null = null;
  let wildFish: ReturnType<typeof buildLakeFish> | null = null;
  let wildJob: Generator<void, WaterSurface> | null = null;
  const wildU = makeUniforms();
  wildU.uSway.value = 0;
  wildU.uGlowK.value = 0;
  const stepWild = (kid: THREE.Vector3) => {
    const wx = Math.max(WILD_WATER_BOUNDS.x0 - kid.x, 0, kid.x - WILD_WATER_BOUNDS.x1);
    const wz = Math.max(WILD_WATER_BOUNDS.z0 - kid.z, 0, kid.z - WILD_WATER_BOUNDS.z1);
    const away = Math.hypot(wx, wz);
    if (!wildWater && away < 900) {
      if (!wildJob) wildJob = waterSurfaceJob({ lowQuality: low, bounds: WILD_WATER_BOUNDS, cell: low ? 3.4 : 2.4, falls: { x: WILD_FALLS.lip.x + Math.sin(WILD_FALLS.heading) * 4, z: WILD_FALLS.lip.z + Math.cos(WILD_FALLS.heading) * 4 } });
      // (right beside it already — a jump there — finish now; otherwise ~2 ms a frame)
      const until = away < 120 ? Infinity : performance.now() + 2;
      let r = wildJob.next();
      while (!r.done && performance.now() < until) r = wildJob.next();
      if (r.done) {
        wildWater = r.value;
        disposables.push(wildWater);
        wild.add(wildWater.mesh);
        // Victoria Falls: one very wide curtain in several sections (Devil's Cataract, Main Falls,
        // Horseshoe Falls…), rocky islands between them, and the candy-red arch bridge downstream
        wildFalls = WILD_FALLS_SECTIONS.map((def, i) => buildFalls({ lowQuality: low, def, name: `great-falls-${i}`, spray: i === 0 }));
        for (const f of wildFalls) {
          disposables.push(f);
          wild.add(f.group);
        }
        wildIslands = buildFallsIslands(wildU);
        disposables.push(wildIslands);
        wild.add(wildIslands.group);
        wildBridge = buildVicBridge(wildU);
        disposables.push(wildBridge);
        wild.add(wildBridge.group);
        wildFish = buildLakeFish({ lowQuality: low, wild: true });
        disposables.push(wildFish);
        wild.add(wildFish.mesh);
        wildJob = null;
      }
    }
    wild.visible = !!wildWater && away < 650;
  };

  const U = makeUniforms();
  U.uSway.value = 0.1;
  U.uGlowK.value = 0;
  const props = buildWaterProps({ lowQuality: low });
  const propMat = addJungleCut(fxMaterial(U, { roughness: 0.85, metalness: 0 }), opts.cut);
  const propMesh = new THREE.Mesh(props.geo, propMat);
  propMesh.name = "waterways-props";
  propMesh.receiveShadow = !low;
  propMesh.castShadow = !low;
  propMesh.onBeforeRender = (_r, _s, cam) => void opts.cut.uJCam.value.setFromMatrixPosition(cam.matrixWorld);
  group.add(propMesh);
  disposables.push(props.geo, propMat);
  calls++;
  tris += (props.geo.attributes.position.count / 3) | 0;

  const fish = buildLakeFish({ lowQuality: low });
  disposables.push(fish);
  group.add(fish.mesh);
  calls++;
  tris += fish.tris;

  const critters = buildLakeCritters(props.spots, { lowQuality: low });
  disposables.push(critters);
  group.add(critters.mesh);
  calls++;
  tris += critters.tris;

  scene.add(group);
  let tNow = 0;
  const splash = (x: number, z: number, k: number) => addSplash(fish.world, x, z, tNow, k);

  return {
    obstacles: props.spots.obstacles,
    spots: props.spots,
    stats: { calls, tris: Math.round(tris), fish: fish.world.fish.length, critters: critters.count },
    update(dt, t, o) {
      tNow = t;
      water.uniforms.uTime.value = t;
      water.uniforms.uGlow.value = o.glow;
      U.uTime.value = t;
      falls.update(dt, t, o.glow, haveCam ? camPos : null);
      // (the Wildlands' water: built as the kid heads that way, shown when within sight of its box)
      stepWild(o.kid);
      if (wild.visible && wildWater && wildFalls.length && wildFish) {
        wildWater.uniforms.uTime.value = t;
        wildWater.uniforms.uGlow.value = o.glow;
        wildU.uTime.value = t;
        wildU.uGlow.value = o.glow;
        for (const f of wildFalls) f.update(dt, t, o.glow, haveCam ? camPos : null);
        wildFish.update(dt, t, o.kid, o.kid.y < WATER_Y - 0.4 && waterSdf(o.kid.x, o.kid.z) < 0);
        const WS = wildFish.world.splash;
        for (let k = 0; k < MAX_SPLASH; k++) wildWater.uniforms.uSplash.value[k].set(WS[k * 4], WS[k * 4 + 1], WS[k * 4 + 2], WS[k * 4 + 3]);
      }
      const swimming = o.kid.y < WATER_Y - 0.4 && waterSdf(o.kid.x, o.kid.z) < 0;
      fish.update(dt, t, o.kid, swimming);
      critters.update(dt, t, o.kid, splash);
      const S = fish.world.splash;
      for (let k = 0; k < MAX_SPLASH; k++) water.uniforms.uSplash.value[k].set(S[k * 4], S[k * 4 + 1], S[k * 4 + 2], S[k * 4 + 3]);
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
