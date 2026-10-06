import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { CAROUSEL, CAROUSEL_SEATS, carouselMountHeight, carouselMountPose, carouselRiderPose, nearestCarouselSeat } from "./carousel";
import { CAROUSEL_MOUNT_ART, CAROUSEL_SURFACE_ART } from "./carouselArt";
import { PLACES } from "./places";
import { nearTrail } from "./island";

describe("the Grand Carousel", () => {
  it("stands where its place entry says, clear of the trails and every other place", () => {
    const place = PLACES.find((p) => p.id === "carousel")!;
    expect(place.x).toBe(CAROUSEL.x);
    expect(place.z).toBe(CAROUSEL.z);
    // the kid is kept off the turning deck, and the walk-up prompt reaches past the steps
    expect(place.radius).toBeGreaterThan(CAROUSEL.deckR + 1);
    expect(place.doorRadius).toBeGreaterThan(place.radius + 2);
    expect(nearTrail(CAROUSEL.x, CAROUSEL.z, CAROUSEL.canopyR + 2)).toBe(false);
    for (const p of PLACES) {
      if (p.id === "carousel" || p.sky) continue;
      expect(Math.hypot(p.x - CAROUSEL.x, p.z - CAROUSEL.z), p.id).toBeGreaterThan(CAROUSEL.canopyR + Math.max(p.radius, 1.5) + 1);
    }
  });

  it("every animal has its artwork, rides on the deck under the crown, clear of the drum and its neighbours", () => {
    expect(CAROUSEL_MOUNT_ART.length).toBeGreaterThanOrEqual(8);
    const crownBottom = CAROUSEL.deckY + CAROUSEL.canopyY + 0.32 - CAROUSEL.boardH;
    for (let i = 0; i < CAROUSEL_SEATS.length; i++) {
      const s = CAROUSEL_SEATS[i];
      expect(CAROUSEL_MOUNT_ART[s.art], `seat ${i}`).toBeTruthy();
      expect(s.r + 0.4).toBeLessThan(CAROUSEL.deckR);
      expect(s.r - 0.4).toBeGreaterThan(CAROUSEL.drumR);
      for (const spin of [0, 0.5, 1.1, 2.3, 4]) {
        const p = carouselMountPose(i, spin);
        expect(p.y, "feet above the deck").toBeGreaterThan(CAROUSEL.deckY + 0.3);
        expect(p.y + carouselMountHeight(s), "head under the crown").toBeLessThan(crownBottom + 0.4);
        const rider = carouselRiderPose(i, spin);
        expect(rider.y).toBeGreaterThan(p.y);
        expect(Math.hypot(rider.x, rider.z)).toBeLessThan(CAROUSEL.deckR);
      }
    }
    // nose to tail: neighbours in a ring never overlap
    for (const outer of [true, false]) {
      const ring = CAROUSEL_SEATS.filter((s) => s.outer === outer);
      const gap = (2 * Math.PI * ring[0].r) / ring.length;
      expect(gap, outer ? "outer ring" : "inner ring").toBeGreaterThan(ring[0].len + 0.4);
    }
  });

  it("the nearest animal to where a kid walks up is on the outer ring, on their side", () => {
    for (const a of [0, 1, 2.5, 4, 5.5]) {
      const i = nearestCarouselSeat(Math.sin(a) * 11, Math.cos(a) * 11, 1.7);
      expect(CAROUSEL_SEATS[i].outer).toBe(true);
      const p = carouselMountPose(i, 1.7);
      expect(Math.hypot(p.x - Math.sin(a) * 11, p.z - Math.cos(a) * 11)).toBeLessThan(7);
    }
  });

  it("its artwork ships small: every file is there, and the whole set stays light", () => {
    const files = [...CAROUSEL_MOUNT_ART.flatMap((m) => [m.file, m.edgeFile]), ...Object.values(CAROUSEL_SURFACE_ART).map((s) => s.file)];
    let total = 0;
    for (const f of files) {
      const path = `public/park-assets/carousel/${f}`;
      expect(existsSync(path), f).toBe(true);
      total += statSync(path).size;
    }
    for (const id of ["rounding-board", "scenery-panel", "canopy", "floor", "organ-front"]) expect(CAROUSEL_SURFACE_ART[id], id).toBeTruthy();
    expect(total).toBeLessThan(1_600_000);
  });
});
