import { describe, expect, it } from "vitest";
import { bandFor, clampCamera, clampView, lerpCamera, minPriorityForBand, pan, scaleOf, screenToWorld, worldToScreen, zoomAt, VIEW_MIN, setViewMax, VIEW_MAX } from "./camera";

describe("camera projection", () => {
  it("round-trips world -> screen -> world", () => {
    const cam = { cx: 12, cz: -340, view: 180 };
    for (const [x, z] of [[0, 0], [12, -340], [-900, 1200], [500.5, -0.25]] as const) {
      const [sx, sz] = worldToScreen(cam, 800, 600, x, z);
      const [wx, wz] = screenToWorld(cam, 800, 600, sx, sz);
      expect(wx).toBeCloseTo(x, 6);
      expect(wz).toBeCloseTo(z, 6);
    }
  });

  it("centres the camera's own (cx,cz) at the middle of the screen", () => {
    const cam = { cx: 50, cz: -20, view: 100 };
    expect(worldToScreen(cam, 400, 400, 50, -20)).toEqual([200, 200]);
  });

  it("clampView keeps the view within [VIEW_MIN, VIEW_MAX]", () => {
    expect(clampView(1)).toBe(VIEW_MIN);
    expect(clampView(VIEW_MAX * 10)).toBe(VIEW_MAX);
    expect(clampView(200)).toBe(200);
  });

  it("setViewMax changes the ceiling", () => {
    setViewMax(5000);
    expect(clampView(4000)).toBe(4000);
    expect(clampView(6000)).toBe(5000);
    setViewMax(900); // restore for later tests in this file
  });

  it("zoomAt keeps the world point under the focal pixel fixed", () => {
    const cam = { cx: 0, cz: 0, view: 200 };
    const focal: [number, number] = [550, 240];
    const [wxBefore, wzBefore] = screenToWorld(cam, 800, 600, ...focal);
    const zoomed = zoomAt(cam, 800, 600, 2, ...focal);
    const [wxAfter, wzAfter] = screenToWorld(zoomed, 800, 600, ...focal);
    expect(wxAfter).toBeCloseTo(wxBefore, 4);
    expect(wzAfter).toBeCloseTo(wzBefore, 4);
    expect(zoomed.view).toBeCloseTo(100, 4);
  });

  it("zoomAt out (factor < 1) widens the view and clamps at VIEW_MAX", () => {
    const cam = { cx: 0, cz: 0, view: VIEW_MAX - 1 };
    const zoomed = zoomAt(cam, 800, 600, 0.1, 400, 300);
    expect(zoomed.view).toBe(VIEW_MAX);
  });

  it("pan moves the centre opposite the drag, scaled by zoom", () => {
    const cam = { cx: 0, cz: 0, view: 100 };
    const s = scaleOf(cam, 400, 400);
    const after = pan(cam, 400, 400, 40, 0);
    expect(after.cx).toBeCloseTo(0 - 40 / s, 6);
    expect(after.cz).toBeCloseTo(0, 6);
  });

  it("lerpCamera(a,b,0) = a and lerpCamera(a,b,1) = b", () => {
    const a = { cx: 0, cz: 0, view: 100 };
    const b = { cx: 100, cz: -50, view: 20 };
    expect(lerpCamera(a, b, 0)).toEqual(a);
    expect(lerpCamera(a, b, 1)).toEqual(b);
    const mid = lerpCamera(a, b, 0.5);
    expect(mid.cx).toBeGreaterThan(0);
    expect(mid.cx).toBeLessThan(100);
  });

  it("bandFor moves close -> park -> island -> world as the view widens", () => {
    const islandView = 1600;
    const worldView = 3700;
    expect(bandFor(40, islandView, worldView)).toBe("close");
    expect(bandFor(500, islandView, worldView)).toBe("park");
    expect(bandFor(1500, islandView, worldView)).toBe("island");
    expect(bandFor(3800, islandView, worldView)).toBe("world");
  });

  it("minPriorityForBand only raises the bar once you've zoomed out past the park", () => {
    expect(minPriorityForBand("close")).toBe(0);
    expect(minPriorityForBand("park")).toBe(0);
    expect(minPriorityForBand("island")).toBeGreaterThan(0);
    expect(minPriorityForBand("world")).toBeGreaterThanOrEqual(minPriorityForBand("island"));
  });

  it("clampCamera pads the centre a bit past the world edge, never unbounded", () => {
    const cam = clampCamera({ cx: 1e9, cz: -1e9, view: 50 }, 900);
    expect(Math.abs(cam.cx)).toBeLessThanOrEqual(900 * 1.4);
    expect(Math.abs(cam.cz)).toBeLessThanOrEqual(900 * 1.4);
  });
});
