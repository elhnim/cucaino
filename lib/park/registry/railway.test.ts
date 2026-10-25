import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RAIL_LENGTH, RAIL_POINTS, STATIONS, nearestRail, railAt, stationAt } from "./railway";
import { WATER_Y, groundY, railHeights, railY } from "./terrain";
import { ISLAND_R, seaDist } from "./island";
import { waterSdf } from "./waterways";
import { PLACES } from "./places";
import { WILD_LAKE } from "./wildWater";
import { DWELL, buildRailway } from "../world/railway";

describe("the Wildlands Railway", () => {
  it("is a long loop out across the Wildlands, on the island the whole way", () => {
    expect(RAIL_LENGTH).toBeGreaterThan(3500);
    for (const [x, z] of RAIL_POINTS) {
      expect(seaDist(x, z), `${x},${z}`).toBeLessThan(-20);
      // (never through the park's buildings)
      for (const p of PLACES) if (!p.sky) expect(Math.hypot(x - p.x, z - p.z)).toBeGreaterThan(p.radius + 6);
    }
    // it reaches far out: the Great Lake's shore and the lone peak's foot
    expect(Math.min(...RAIL_POINTS.map(([x, z]) => Math.hypot(x - WILD_LAKE.x, z - WILD_LAKE.z)))).toBeLessThan(280);
  });

  it("runs on gentle grades, at the ground under it or on trestles above it — and bridges water well clear of it", () => {
    const H = railHeights();
    const n = RAIL_POINTS.length;
    let bridges = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = RAIL_POINTS[i];
      const [bx, bz] = RAIL_POINTS[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az);
      expect(Math.abs(H[(i + 1) % n] - H[i]) / L, `grade at ${i}`).toBeLessThan(0.045);
      const gy = groundY(ax, az);
      // never buried in the ground
      expect(H[i] - gy, `buried at ${ax.toFixed(0)},${az.toFixed(0)}`).toBeGreaterThan(-0.5);
      if (waterSdf(ax, az) < 0) {
        bridges++;
        expect(H[i] - WATER_Y).toBeGreaterThan(3);
      }
    }
    // it crosses the Wild River and the outlet
    expect(bridges).toBeGreaterThan(4);
  });

  it("has five stations on dry, level ground beside the track, in the train's order", () => {
    expect(STATIONS.length).toBe(5);
    for (let i = 1; i < STATIONS.length; i++) expect(STATIONS[i].s).toBeGreaterThan(STATIONS[i - 1].s);
    for (const st of STATIONS) {
      expect(stationAt(st.x, st.z)).toBe(st);
      expect(groundY(st.x, st.z)).toBeGreaterThan(WATER_Y + 0.5);
      expect(Math.abs(groundY(st.x, st.z) - (railY(st.s) - 0.3))).toBeLessThan(0.6);
      expect(nearestRail(st.x, st.z).d).toBeLessThan(6);
      expect(waterSdf(st.x, st.z)).toBeGreaterThan(8);
    }
    // the first is just outside the park, the rest far out in the Wildlands
    expect(Math.hypot(STATIONS[0].x, STATIONS[0].z)).toBeLessThan(ISLAND_R + 120);
    for (const st of STATIONS.slice(1)) expect(Math.hypot(st.x, st.z)).toBeGreaterThan(800);
  });

  it("the train runs the loop, stopping at every station; called, it comes to the platform", () => {
    const scene = new THREE.Scene();
    const rw = buildRailway(scene, { lowQuality: true });
    // (looked at from far off: no station boards are drawn in a test)
    const focus = new THREE.Vector3(9e4, 0, 9e4);
    const stops = new Set<string>();
    let t = 0;
    for (let k = 0; k < 20 * 260; k++) {
      t += 1 / 20;
      rw.update(1 / 20, t, focus);
      if (rw.train.at) stops.add(rw.train.at.id);
    }
    expect(stops.size).toBe(5);
    // called to the Great Lake from wherever it is: there within ~25 s, and it waits while called
    const lake = STATIONS.find((s) => s.id === "lake-station")!;
    rw.call(lake);
    let arrived = -1;
    for (let k = 0; k < 20 * 40 && arrived < 0; k++) {
      t += 1 / 20;
      rw.update(1 / 20, t, focus);
      if (rw.train.at === lake) arrived = k / 20;
    }
    expect(arrived).toBeGreaterThan(0);
    expect(arrived).toBeLessThan(25);
    for (let k = 0; k < 20 * (DWELL - 1); k++) rw.update(1 / 20, (t += 1 / 20), focus);
    expect(rw.train.at).toBe(lake);
    // the cars sit on the rails
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    rw.carPose(1, pose);
    const n = nearestRail(pose.x, pose.z);
    expect(n.d).toBeLessThan(0.5);
    expect(Math.abs(pose.y - 0.35 - railY(n.s))).toBeLessThan(0.3);
    void railAt;
    rw.dispose();
  });
});
