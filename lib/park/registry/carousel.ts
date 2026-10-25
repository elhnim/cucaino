// The Grand Carousel: a fairground merry-go-round just outside Ride Land. This file is its plan —
// where it stands, how big it is, where every animal rides and how it moves (pure maths, tested);
// lib/park/world/carousel.ts builds it, wrapping the painted artwork in
// public/park-assets/carousel/ (see scripts/carousel-art.mjs) round the model.
import { CAROUSEL_MOUNT_ART } from "./carouselArt";

/** the crown is this many flat painted boards; the centre drum has this many flat painted sides */
export const CAROUSEL_BOARDS = 18;
export const CAROUSEL_DRUM_FACES = 6;
const CANOPY_R = 8.3;
export const CAROUSEL = {
  x: -64,
  z: -40,
  /** the turning deck's radius and its height above the ground */
  deckR: 7.2,
  deckY: 0.8,
  /** the centre drum's corner radius (six flat sides, each one a 2:3 painted panel) */
  drumR: 2.4,
  /** the canopy: its rim radius, the height of its rim above the deck and of the canvas above that */
  canopyR: CANOPY_R,
  canopyY: 5.6,
  canopyRise: 2.3,
  /** the crown's boards: each is a 3:2 painted panel exactly one side of the 18-sided rim wide */
  boardH: (2 * CANOPY_R * Math.sin(Math.PI / CAROUSEL_BOARDS)) / 1.5,
} as const;

/** how fast it turns (radians a second): ticking over on its own, and with a rider aboard */
export const CAROUSEL_IDLE_TURN = 0.2;
export const CAROUSEL_RIDE_TURN = 0.52;
/** a ride is this many times round */
export const CAROUSEL_RIDE_TURNS = 3;
/** each animal rises and falls this far, this many times a turn */
const BOB = 0.34;
const BOBS_PER_TURN = 3;

export interface CarouselSeat {
  /** which painted animal (index into CAROUSEL_MOUNT_ART) */
  art: number;
  /** distance from the centre and angle round the deck (at spin 0) */
  r: number;
  a: number;
  /** the animal's length nose to tail, in world units */
  len: number;
  /** where in its rise and fall it starts */
  phase: number;
  outer: boolean;
}

const N_ART = Math.max(1, CAROUSEL_MOUNT_ART.length);
export const CAROUSEL_SEATS: CarouselSeat[] = [
  // the outer ring: ten big gallopers
  ...Array.from({ length: 10 }, (_, i) => ({
    art: i % N_ART,
    r: 5.75,
    a: (i / 10) * Math.PI * 2,
    len: 2.7,
    phase: (i % 2) * Math.PI,
    outer: true,
  })),
  // the inner ring: six smaller ones, set between them
  ...Array.from({ length: 6 }, (_, i) => ({
    art: (i * 3 + 5) % N_ART,
    r: 3.75,
    a: ((i + 0.5) / 6) * Math.PI * 2,
    len: 2.25,
    phase: ((i + 1) % 2) * Math.PI,
    outer: false,
  })),
];

/** an animal's picture height in world units */
export function carouselMountHeight(seat: CarouselSeat): number {
  const art = CAROUSEL_MOUNT_ART[seat.art];
  return art ? seat.len / art.aspect : seat.len * 0.8;
}

/** how high an animal's feet are off the deck, in the middle of its travel */
const FEET = 0.5;

export interface CarouselPose {
  x: number;
  y: number;
  z: number;
  /** heading (radians about +Y; forward = (sin yaw, cos yaw)) */
  yaw: number;
}

/** where seat `i`'s animal is (the bottom-centre of its picture), relative to the carousel's centre
 *  on the ground, once the deck has turned through `spin` radians */
export function carouselMountPose(
  i: number,
  spin: number,
  out: CarouselPose = { x: 0, y: 0, z: 0, yaw: 0 },
): CarouselPose {
  const s = CAROUSEL_SEATS[i];
  const a = s.a + spin;
  out.x = Math.sin(a) * s.r;
  out.z = Math.cos(a) * s.r;
  out.y =
    CAROUSEL.deckY +
    FEET +
    BOB +
    Math.sin(spin * BOBS_PER_TURN + s.phase) * BOB;
  // it gallops the way the deck turns
  out.yaw = a + Math.PI / 2;
  return out;
}

/** where a rider sits on seat `i`'s animal (on its saddle), same frame as carouselMountPose */
export function carouselRiderPose(
  i: number,
  spin: number,
  out: CarouselPose = { x: 0, y: 0, z: 0, yaw: 0 },
): CarouselPose {
  const s = CAROUSEL_SEATS[i];
  const art = CAROUSEL_MOUNT_ART[s.art];
  carouselMountPose(i, spin, out);
  const along = ((art?.seat[0] ?? 0.47) - 0.5) * s.len;
  out.x += Math.sin(out.yaw) * along;
  out.z += Math.cos(out.yaw) * along;
  out.y += (art?.seat[1] ?? 0.58) * carouselMountHeight(s) - 0.12;
  return out;
}

/** the outer-ring seat nearest a point given relative to the carousel's centre */
export function nearestCarouselSeat(
  x: number,
  z: number,
  spin: number,
): number {
  let best = 0;
  let bd = Infinity;
  const p: CarouselPose = { x: 0, y: 0, z: 0, yaw: 0 };
  for (let i = 0; i < CAROUSEL_SEATS.length; i++) {
    if (!CAROUSEL_SEATS[i].outer) continue;
    carouselMountPose(i, spin, p);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
