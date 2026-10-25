// Cucaino Park runtime: one renderer, the candy park scene, the kid's animal + pet, input,
// camera and effects. React (components/park/*) owns every 2D overlay and talks to this
// class through a few methods + callbacks.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { TexturePass } from "three/examples/jsm/postprocessing/TexturePass.js";
import { makeDioramaPass } from "./dioramaPass";
import { ParkAssets, type AnimalId } from "../assets/loader";
import { DEFAULT_CANDY, THEME_CANDY_HUE } from "../assets/candy";
import { buildPark, type BuiltPark } from "../world/buildPark";
import { createDreamPark, type DreamParkView } from "../world/dreamPark";
import { zoneBounds, type Placed } from "../builder/rules";
import { SPAWN, PARK_RADIUS, type PlaceDef } from "../registry/places";
import { emojiSprite, labelSprite } from "@/lib/game3d/buildingKit";
import { PARK_ANIMALS } from "../registry/animals";
import { createTreasures, type TreasureView } from "../world/treasures";
import type { Interior } from "@/lib/game3d/interiors/types";

/**
 * A ride takes over the screen with its own scene (Mini Golf, Quiz Coaster...). It uses the
 * same contract as the original 3D world's mini-game rooms, plus an optional `camera` hook for
 * rides that fly the camera themselves (e.g. riding a coaster).
 */
export type Ride = Interior & {
  camera?: (cam: THREE.PerspectiveCamera, dt: number) => void;
  hideKid?: boolean;
  /** shrink (or grow) the kid and pet while in this ride, e.g. to golfer size next to a tiny ball */
  actorScale?: number;
};
import { makeSparkleTexture } from "@/lib/game3d/textures";
import { buildWizardModel, nameTag, type WizardModel } from "../wizards/wizardModel";
import { buildChibi, type ChibiAction, type ChibiRig } from "../characters/chibi";
import { BOAT_CAPS, MOUNT_BODY, MOUNT_CAPS, MOUNT_SEA_DRAFT, MOUNT_VIEW, SUB_CAPS, buildMount, isBoat, isCraft, isSub, mountLean, type MountKind, type MountRig, type MountSkin } from "../characters/mounts";
import { HARBOUR_OBSTACLES, worldFloorY } from "../registry/harbours";
import { BUMP_DEEP, boatCanMove, boatClearance, hullTilt, landingSpot, moveBoat, seaWave, steer, subAltRange, subCanMove, swellDamp, type Helm, type SeaBody, type Tilt } from "../world/rideables/craft";
import type { DrivenCraft } from "../world/rideables/fleet";
import type { RidePin } from "../world/rideables";
import { createDragonFlight, type DragonFlight } from "../world/rideables/dragonFlight";
import { hintsReady } from "../world/rideables/dragonSpace";
import { bigFrame, forEachBigSea, setOccluderFocus, type BigBody } from "../world/sea/bigSea";
import { RIDEABLE_SPOTS } from "../registry/rideables";
import { DRAGON_BREEDS, type DragonBreed } from "../characters/mounts";
import { groundY, WATER_Y, wrapWorld } from "../registry/terrain";
import { seaDist } from "../registry/island";
import { stationAt, type Station } from "../registry/railway";
import { findWalkPath, pushOutOfThicket, thicketSdf, underCanopy } from "../registry/jungle";
import { waterSdf } from "../registry/waterways";
import { VILLAGE_ISLAND } from "../registry/villageIsland";
import { settlementAt, settlementDeckY } from "../registry/settlements";
import { wonderAt, wonderSignAt, type WonderDef } from "../registry/wonders";
import { wildBridgeDeckY } from "../registry/wildWater";
import { roadConfine, roadDeckY, inWildlandsZone, carRoadBound, tunnelCeilingAt, levelCrossingBlocks } from "../registry/roads";
import { FLY_LAND_R } from "../map/tripMachine";
import { CAROUSEL, CAROUSEL_RIDE_TURNS } from "../registry/carousel";
import { newPetBrain, stepPetBrain, type PetBrain } from "../pet/followBrain";
import { canyonVisualFloorY, canyonWalkY, grandCanyonDeckY, nearGrandCanyon } from "../registry/grandCanyon";
import { rawHeight } from "../registry/landform";
import { climbRouteById, type ClimbRouteDef } from "../registry/climbRoutes";
import { FROST_ISLAND } from "../registry/frostIsland";
import { makeKidSlide, petSlidePose, slideName, slideSplashS, stepKidSlide, type KidSlide } from "../world/frost/kidSlide";
import { makeKidSki, stepKidSki, type KidSki } from "../world/frost/kidSki";
import { KL_DONE, KL_RIDE, KL_WAIT } from "../world/frost/ski";
import { FROST_SKI } from "../registry/frostIsland";
import { DINO_ISLAND, dinoShoreDist } from "../registry/dinoIsland";
import { CAR_GAP, RIDE_CAR } from "../world/steamTrain";
import { SKY_ISLANDS, SKY_OBSTACLES, SKY_SPOTS, skyIslandById, skyStreamEnd, skyTopY, type SkySpot } from "../registry/skyIslands";
import { applySafeShaders } from "./safeShaders";

// (before any material compiles: flat-shaded faces too thin to shade must never output NaN)
applySafeShaders();

/** each floating island's obstacles (trees, rocks, its peak), for walking about up there */
const SKY_OBSTACLES_BY = new Map<string, { x: number; z: number; r: number }[]>();
for (const o of SKY_OBSTACLES) {
  const list = SKY_OBSTACLES_BY.get(o.id) ?? [];
  list.push(o);
  SKY_OBSTACLES_BY.set(o.id, list);
}

export type QualityTier = "standard" | "low";

export function detectQuality(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3 || reduced ? "low" : "standard";
}

export interface ParkWorldOptions {
  /** the hour of day (0–24) that drives the day <-> twilight cycle; defaults to the real clock */
  hour?: () => number;
  kidAnimal: AnimalId;
  petAnimal?: AnimalId | null;
  themeId?: string;
  /** the kid's favourite colour: their chibi's scarf and backpack */
  accent?: string;
  quality?: QualityTier;
  /** kid walked into / tapped a place */
  onPlace?: (place: PlaceDef) => void;
  /** kid walked back out of a place's door area (e.g. to dismiss an "enter?" prompt) */
  onLeavePlace?: (placeId: string) => void;
  /** today's hidden treasures (lib/park/world/treasures.ts) and which are already found */
  treasures?: { spots: { id: number; x: number; z: number }[]; found: number[] };
  onTreasure?: (id: number) => void;
  /** fetch game: the pet brought the ball back */
  onFetchCatch?: () => void;
  /** build mode: kid tapped the lawn at world (x, z) */
  onBuildTap?: (x: number, z: number) => void;
  /** build mode: kid tapped one of their placed pieces */
  onPieceTap?: (uid: string) => void;
  /** first frame is on screen */
  onReady?: () => void;
  /** landed on a floating mountain (id, "land") or stepped off an edge ("glide", id null) */
  onSkyIsland?: (id: string | null, what: "land" | "glide") => void;
  /** a Coralcove villager says something to the kid (null = nobody talking now) */
  onVillageTalk?: (talk: { id: string; name: string; line: string; emoji?: string } | null) => void;
  /** arrived at Coralcove Isle (or another village/settlement/far island) for the first time this
   *  visit; `id` is its registry id (Coralcove/Dino/Frost pass a stable literal) — the map's
   *  found-set (lib/park/map/foundSet.ts) uses it to remember the discovery between visits */
  onVillage?: (name: string, clan: string, id?: string) => void;
  /** walked within discovery range of a Natural Wonder of the World (./registry/wonders.ts) for the
   *  first time: a big "you found it!" toast, then its first fact */
  onWonder?: (def: WonderDef) => void;
  /** discovered something on a floating mountain (a cave, a nest, a rune circle solved …) */
  onSkySpot?: (spot: SkySpot) => void;
  /** opened a floating mountain's treasure chest */
  onSkyTreasure?: (id: string) => void;
  /** boarded (true) or stepped off (false) the Sky Coaster */
  onSkyCoaster?: (riding: boolean) => void;
  /** hopped on (true) or stepped off (false) the Grand Carousel */
  onCarousel?: (riding: boolean) => void;
  /** step quality down on devices that keep dropping frames (default true; smoke harnesses turn it off) */
  adaptiveQuality?: boolean;
  /** the finish: "diorama" (default — outlines, stepped colour, chunky pixels) or "smooth" */
  look?: "diorama" | "smooth";
  /** crossed the edge of the ocean and came back round from the other side */
  onWrap?: () => void;
  /** the T-rex on Dino Isle roared (the kid's close by) */
  onRoar?: () => void;
  /** close to a rare or extinct creature (or a place): the Midnight Rift, Frostpeak Isle, Dino Isle */
  onAbyssSpot?: (spot: { id: string; name: string; text: string }) => void;
  /** a Sea Pearl was collected from a giant clam on the reef */
  onPearl?: (id: number) => void;
  /** the kid waded into deep water (true) or climbed back onto the beach (false) */
  onSwim?: (inSea: boolean) => void;
  /** a one-off hint about a ride close by ("A dragon! Walk up to it and tap Hop on") */
  onRideHint?: (text: string) => void;
  /** the kid has just made friends with a dragon (keep it: friends stay friends) */
  onDragonBond?: (id: string) => void;
  /** a Star Shard was collected (id 0..29) */
  onShard?: (id: number) => void;
  /** flew through Sky Ring `passed` of 12; `lap` = seconds when the course is complete */
  onRing?: (passed: number, lap?: number) => void;
  /** Frostpeak's penguin slides: set off ("start"), waiting for the penguin ahead ("wait"), SPLASH ("splash") */
  onSlide?: (what: "start" | "wait" | "splash", name: string) => void;
  /** Frostpeak's ski run: skis on ("start"), a slalom gate ("gate", passed, of), the bottom
   *  ("finish", passed, of), on the chairlift ("lift"), off at the top ("top"), at the viewpoint ("view") */
  onSki?: (what: "start" | "gate" | "finish" | "lift" | "top" | "view", n?: number, of?: number) => void;
  onError?: (err: unknown) => void;
}

const WALK_SPEED = 7;
/** device pixels per CSS pixel in the diorama look (~1.6 CSS px per drawn pixel: chunky but readable) */
const DIORAMA_PIXEL_RATIO = 0.62;
/** how far out to sea you can swim (the reef, and the edge of the deep blue) */
const SEA_LIMIT = 200; // (unused now the ocean wraps round — kept for the landing clamp)
/** water deeper than this and you swim instead of wading */
const SWIM_DEPTH = 0.9;
/** how deep the sea is at (x, z) (<= 0 on land) */
/** the ground under (x, z): the main island's terrain, Coralcove Isle's land and decks, or the sea
 *  floor round them (the same surfaces the art draws) */
// (Coralcove's land and decks, Frostpeak's and Dino Isle's land, decks and jetties - their
// under-sea slopes come in through seaFloorY - and the harbours' jetties and the Rift Dock:
// lib/park/registry/harbours.worldFloorY)
const worldFloor = (x: number, z: number) => {
  // the island's road network (Agent R): a bridge deck or a tunnel floor, where either exists —
  // same fold-in pattern as worldFloorY's own settlement/Victoria-Falls/Grand-Canyon decks
  const r = roadDeckY(x, z);
  if (r !== null) return Math.max(r, worldFloorY(x, z));
  return worldFloorY(x, z);
};
const seaDepth = (x: number, z: number) => WATER_Y - worldFloor(x, z);
/** the ground (or sea floor) under (x, z) */
const floorY0 = (x: number, z: number) => worldFloor(x, z);
/** a walkway step the kid can take from deck height `fromY`: the deck height at (x, z) if there's
 *  walkway there at about that level (or the ground's right there too — the walkway's foot), else
 *  null (it would be a step off the edge) */
function raisedDeckAt(x: number, z: number, fromY: number): number | null {
  const y = settlementDeckY(x, z) ?? wildBridgeDeckY(x, z) ?? grandCanyonDeckY(x, z) ?? roadDeckY(x, z);
  if (y !== null && Math.abs(y - fromY) < 0.9) return y;
  const g = groundY(x, z);
  return Math.abs(g - fromY) < 0.9 ? g : null;
}
const CAM_OFFSET = new THREE.Vector3(0, 12, 14);
const MAX_DT = 1 / 20;
/** soft, alpha-blended atmospheric effects (mist, spray plumes, a rainbow — see falls.ts) go on this
 *  render layer as well as the default one: the diorama's ink-outline pass reads a colour jump
 *  anywhere a soft translucent shape fades against its background, drawing an unwanted outline
 *  round it, so each frame also renders just this layer alone into a small mask (renderFxMask) that
 *  the outline pass checks and skips over — the objects themselves still render normally, in the
 *  same pass as everything else, so they're depth-tested and composited exactly as before. Any new
 *  soft/additive fx should follow the same convention: `thing.layers.set(FX_NO_OUTLINE_LAYER)`
 *  instead of leaving it on the default layer (the camera sees both, so it still renders). */
export const FX_NO_OUTLINE_LAYER = 1;

interface Actor {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  /** hand-made chibi character (procedural animation) — used instead of the mixer when set */
  rig?: ChibiRig;
  /** chibi: where it was last frame (speed drives walk/run), and how long a one-shot action holds */
  last?: THREE.Vector3;
  /** its speed, smoothed (see tickActor) */
  speedSm?: number;
  hold?: number;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  facing: number;
}

function blobShadow(size: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(120,40,110,0.4)");
  g.addColorStop(1, "rgba(120,40,110,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  return m;
}

type HopNear = { id: string; kind: MountKind; label: string; x: number; y: number; z: number; yaw: number; breed?: DragonBreed };

export class ParkWorld {
  readonly quality: QualityTier;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  private assets: ParkAssets;
  private park: BuiltPark | null = null;
  private dream: DreamParkView | null = null;
  private building = false;
  private treasures: TreasureView | null = null;
  private ride: Ride | null = null;
  private rideReturn: THREE.Vector3 | null = null;
  // ── pet behaviour ──
  private petMode: "follow" | "goto" | "sleep" | "fetch" = "follow";
  private petTarget: THREE.Vector3 | null = null;
  private petArrive: (() => void) | null = null;
  private petBubble: { sprite: THREE.Sprite; until: number } | null = null;
  private petStatus: THREE.Sprite | null = null;
  private petZzz: THREE.Sprite | null = null;
  private fetch: { ball: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; phase: "idle" | "flying" | "chasing" | "returning" } | null = null;
  // ── wandering park visitors ──
  private npcs: { actor: Actor; target: THREE.Vector3; wait: number }[] = [];
  private kid: Actor | null = null;
  private pet: Actor | null = null;
  // ── wizards: placed somewhere new each day; they act like little walk-up places ──
  // (each wizard lives up on a floating mountain: `island` is its id, so it bobs along with it)
  private wizards: { model: WizardModel; place: PlaceDef; sign: THREE.Sprite; star: THREE.Sprite | null; island: string | null }[] = [];
  /** how big the pet has grown (it grows with the kid's chores; see setPetGrowth) */
  private petGrowth = 1;
  /** time until the next magic footstep sparkle (twilight only) */
  private stepSparkle = 0;
  /** a soft warm light that follows the kid at twilight, so faces stay cute and readable */
  private heroLight = new THREE.PointLight("#ffe2f6", 0, 9, 1.6);
  /** after standing still a moment the kid turns to the camera and waves (once per stop) */
  private waved = false;
  private clock = new THREE.Clock();
  private time = 0;
  private move = { x: 0, y: 0 };
  private walkTarget: THREE.Vector3 | null = null;
  private walkQueue: THREE.Vector3[] = [];
  /** following a route from the map: jog a bit faster (the island is big) */
  private routing = false;
  // ── riding: a mount the kid (and pet) sit on; fliers climb to `altTarget` ──
  private mount: MountRig | null = null;
  // where the kid stood last frame when up on a raised settlement walkway (a treehouse platform,
  // its ramp, a rope bridge): the walkways have invisible railings — see raisedDeckAt
  private deckPrev = { on: false, x: 0, z: 0, y: 0 };
  private alt = 0;
  private altTarget = 0;
  private flyInput = 0;
  /** flying a dragon (or another flier) to a spot picked on the map: it steers itself, climbs to
   *  cruise, goes a good bit faster, then glides down and lands there (the joystick takes over) */
  private autoFly: { x: number; z: number; label: string } | null = null;
  // ── swimming: depth below the surface (0 = paddling at the top), eased toward swimTarget ──
  private swimDepth = 0;
  private swimTarget = 0;
  private swimPitch = 0;
  private swimVX = 0;
  private swimVZ = 0;
  private wasInSea = false;
  private camUnder = false;
  /** under water: how much further back (units) / wider (degrees) the camera is for a giant nearby */
  private camBigX = 0;
  private camBigFov = 0;
  private uwPull = 1;
  private readonly bigBuf: BigBody[] = [];
  private readonly bigOut = { dist: 0, fov: 0, w: 0 };
  /** what's afloat round a boat you're driving (other boats, sea friends, whales and orcas at the surface) */
  private readonly afloat: SeaBody[] = [];
  private readonly afloatBig: SeaBody[] = [];
  private deepHintT = 0;
  // ── the Sky Coaster: riding the train round the island (speed follows the drops) ──
  /** riding the Sky Coaster — or, with `train`, the Wildlands Railway */
  private sky: { v: number; dist: number; cheered: boolean; train?: boolean; /** riding the carousel: which animal, and the deck's turn when they got on */ carousel?: { seat: number; from: number } } | null = null;
  private carouselPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private skySeated = false;
  private walkVX = 0;
  private walkVZ = 0;
  /** the kid's body lean on foot: forward into a run / back as they pull up, and banking into a turn */
  private leanX = 0;
  private leanAccel = 0;
  private leanZ = 0;
  private leanSpeed = 0;
  private leanFacing = 0;
  /** the pet's own body and mind while it is just following its kid (../pet/followBrain) */
  private petBrain: PetBrain | null = null;
  private petKid = { x: 0, z: 0, facing: 0, speed: 0 };
  private petKidLast = new THREE.Vector3(NaN, 0, 0);
  private camWant = new THREE.Vector3();
  /** standing on a station's platform, waiting for the train we called */
  private trainWait: Station | null = null;
  /** where the kid stood last frame, for the canyon's cliff walls (see the walking code) */
  private cliffPrev = { x: 0, z: 0, ok: false };
  private trainPose = { x: 0, y: 0, z: 0, yaw: 0 };
  // ── a guided route climb (Climb Everest!, Climb to the crater!): walked on the REAL mountain
  // (registry/climbRoutes.ts picks the route — registry/everestRoute.ts or paricutinRoute.ts), not a
  // separate scene — same idea as the train, just following a hiking route instead of the rails.
  // `u` is the displayed (eased) progress; `targetU` is what the HUD last set; `phase` carries the
  // kid from the climb itself into the top's orbiting celebration and then the swoop/hop back down.
  private climb: { route: ClimbRouteDef; u: number; targetU: number; phase: "climbing" | "summit" | "flyDown"; timer: number; guide: ChibiRig | null } | null = null;
  private climbSnow: THREE.Points | null = null;
  // ── Frostpeak's penguin slides: the kid tobogganing down a chute (null = not), the chute whose start
  // the kid is standing at (-1), how far the lying kid's belly sits below its middle, the flop (0..1) ──
  private slide: KidSlide | null = null;
  private slideNear = -1;
  private slideDepth = 0.5;
  private slideFlop = 0;
  private slideWaitSaid = false;
  private slideCam = new THREE.Vector3();
  // ── Frostpeak's ski run: the kid skiing (null = not), riding the chairlift, the viewpoint ──
  private ski: KidSki | null = null;
  private skiFrom = new THREE.Vector3();
  private skiNear = false;
  private liftNear = false;
  private lifting = false;
  private skiGear: THREE.Group | null = null;
  /** 0..1: how far the camera has swung round to frame the whole run from the lodge's viewpoint */
  private skiView = 0;
  private skiViewSaid = false;
  private skiSaved = { p: new THREE.Vector3(), q: new THREE.Quaternion(), on: false };
  /** the pet's own slide down the chute once the kid has splashed in (it's a few metres behind) */
  private petSlide: KidSlide | null = null;
  private petSlideS = 0;
  private petSlideOut = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  // ── floating mountains: standing on one (its id), gliding down off an edge, flight's reference height ──
  private onSky: string | null = null;
  private gliding = false;
  private fallV = 0;
  private flyBase = 0;
  private skyOpened = new Set<string>();
  /** the world ride we're on (bikes, unicorns … are found round the world, not summoned) */
  private rideId: string | null = null;
  private prevFacing = 0;
  private hopNear: HopNear | null = null;
  // the last ride the HUD's "Hop on" offered and when (the button is refreshed a few times a
  // second, the nearest ride every frame: a tap honours what the button showed if it's still close)
  private hopLast: HopNear | null = null;
  private hopLastT = -Infinity;
  // a dragon making friends after "Say hi": once it's done, the kid climbs straight on
  private bondRide: HopNear | null = null;
  private hopStyle: { accent?: string; skin?: MountSkin } = {};
  /** parked dragons we've already told the kid about (once each per visit) */
  private dragonHints = new Set<string>();
  /** on skis or on the chairlift: the joystick steers the skis (or does nothing on the lift) */
  private get skiLock(): boolean {
    return !!this.ski || this.lifting;
  }
  /** the "a dragon!" hints wait for the welcome toasts and a few steps (../world/rideables/dragonSpace hintsReady) */
  private readyAt = Infinity;
  private hintWalk = 0;
  /** the way the kid last walked (kept while they stand and turn to wave at the camera): the dragon
   *  they walked up to is the one they mean */
  private headFacing = Math.PI;
  private hintLast = new THREE.Vector3(Number.NaN, 0, 0);
  /** dragons this kid has made friends with (see setBondedDragons) */
  private bondedDragons = new Set<string>();
  /** flying a dragon: banks, dives, rolls, fire puffs and the clouds (made the first time) */
  private dragonFx: DragonFlight | null = null;
  private dragonPrevAlt = 0;
  private bondSync = true;
  // ── boats and subs: momentum, how they sit on the swell, and what the fleet draws behind them ──
  private helm: Helm = { yaw: 0, speed: 0, reverse: false, revT: 0 };
  private craftPitch = 0;
  private craftRoll = 0;
  private craftSpeed = 0;
  private prevAlt = 0;
  private craftTilt: Tilt = { pitch: 0, roll: 0, y: 0 };
  private subRange = { lo: 0, hi: 0 };
  private landAt = { x: 0, z: 0, y: 0 };
  private driven: DrivenCraft = { kind: "pedalo", x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0 };
  private spotsFound = new Set<string>();
  private lastTalk = "";
  private abyssSpot: string | null = null;
  private frostSpot: string | null = null;
  private metFrost = false;
  private dinoSpot: string | null = null;
  private metDino = false;
  private metVillage = false;
  private metSettlements = new Set<string>();
  private metWonders = new Set<string>();
  /** flung by a sky cannon towards another island: from -> to over `dur` seconds */
  private launch: { fx: number; fy: number; fz: number; tx: number; tz: number; to: string; t: number; dur: number } | null = null;
  /** a telescope's peek at another island (the camera looks there for a moment) */
  private peek: { x: number; y: number; z: number; until: number } | null = null;
  private landing = false;
  private flySparkle = 0;
  private inputOn = true;
  private nearPlace: string | null = null;
  private idleT = 0;
  private beacons = new Map<string, { sprite: THREE.Sprite; base: number }>();
  private bursts: { pts: THREE.Points; vel: Float32Array; life: number }[] = [];
  private sparkTex = makeSparkleTexture();
  private raycaster = new THREE.Raycaster();
  private downAt: { x: number; y: number; t: number } | null = null;
  // ── free camera: drag to look around, pinch / wheel to zoom ──
  private camYaw = 0;
  /** when a finger last turned the view (auto-follow waits a moment after that) */
  private userTurnAt = -99;
  /** camera height angle: drag up/down to look from low (almost eye level) to high overhead */
  private camPitch = 0.46; // ~26°: the horizon, mountains and floating islands are in the view
  /** extra camera height to see over a hill between the camera and the kid (eased) */
  private camLift = 0;
  /** eased camera distance when something blocks the view (see the tree check in tick) */
  private camPull = 99;
  private camBase = new THREE.Vector3(SPAWN.x, 12, SPAWN.z + 14);
  private lookAtPt = new THREE.Vector3(SPAWN.x, 1.2, SPAWN.z);
  private camZoom = 1;
  /** 0..1 eased: the camera's dropped down under the rainforest's canopy */
  private forestCam = 0;
  private forestPull = 30;
  /** 0..1 eased: the camera's ducked down and pulled in because the kid is inside one of the
   *  island's road tunnels (registry/roads.ts's tunnelCeilingAt) — a low, dark bore the normal
   *  12-up/14-back chase offset would poke straight through */
  private tunnelCam = 0;
  /** 1 = full boom length, down to a short safe length — eased, like camPull/forestPull/uwPull.
   *  The Grand Canyon's own height field (registry/grandCanyon.ts's grandCanyonGroundY) is
   *  deliberately softened since round 3 so the streamed terrain mesh never has to hold a
   *  near-vertical step; the real rock the kid SEES is drawn proud of that, as decor
   *  (canyonVisualFloorY — the cliff walls and the butte mesas). The normal "keep the view clear
   *  over hills" lift (below) only ever checks the soft height field, so the chase camera could
   *  happily end up behind/inside the visual rock whenever the soft ground it's floating above
   *  doesn't match the crisp wall right next to it — a full screen of the wall's own unlit back
   *  face, which reads as a black frame. This eases the boom in toward the kid whenever the
   *  camera-kid sightline would dip inside that visual rock, the same shape as uwPull's own
   *  "slide in to the last clear point" rather than an instant snap. */
  private canyonPull = 1;
  private dragging = false;
  private lastDrag: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; zoom: number } | null = null;
  private frame = 0;
  private running = false;
  private paused = false;
  private disposed = false;
  private ro: ResizeObserver;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private diorama: ShaderPass | null = null;
  // ── frame-rate safeguard: if a device keeps struggling, quietly step the quality down ──
  private frameAvg = 1 / 60;
  private slowFor = 0;
  private sinceStep = 0;
  private qualityStep = 0;
  /** the diorama look draws the scene here first (HDR colour + its own depth) so outlines can read depth */
  private sceneRT: THREE.WebGLRenderTarget | null = null;
  /** a second, tiny render of just the FX_NO_OUTLINE_LAYER objects alone, so the outline pass knows
   *  where to skip them (see FX_NO_OUTLINE_LAYER, renderFxMask) */
  private fxMaskRT: THREE.WebGLRenderTarget | null = null;
  private fxMaskClear = new THREE.Color();
  /** "diorama": ink outlines, stepped colour and chunky pixels; "smooth": the plain filmic render */
  private look: "diorama" | "smooth";

  constructor(private container: HTMLElement, private opts: ParkWorldOptions) {
    this.quality = opts.quality ?? detectQuality();
    const low = this.quality === "low";
    this.look = opts.look ?? "smooth";
    const dio = this.look === "diorama" && !low;
    // look down on the island from higher up (~42°), the way you'd look at a model on a table
    if (dio) this.camPitch = 0.56;
    // the diorama look draws chunky pixels on purpose: a low pixel ratio, no antialiasing, and the
    // canvas upscaled with crisp nearest-neighbour (which also makes each frame much cheaper)
    this.renderer = new THREE.WebGLRenderer({ antialias: !low && !dio, powerPreference: low ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(dio ? DIORAMA_PIXEL_RATIO : Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // filmic colour + soft sun shadows + bloom: a rich, magical fantasy look
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (!low) {
      this.composer = new EffectComposer(this.renderer);
      if (dio) {
        // our own scene target: later passes can't clear its depth (the composer's own targets
        // get their depth cleared along the way, which left the outlines with nothing to read)
        const depth = new THREE.DepthTexture(1, 1);
        depth.type = THREE.UnsignedIntType;
        this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: depth });
        this.composer.addPass(new TexturePass(this.sceneRT.texture));
        // soft, alpha-blended fx (mist, spray plumes, a rainbow — FX_NO_OUTLINE_LAYER) render into
        // the main pass as normal (so they're still depth-tested and composited correctly), but are
        // ALSO captured alone here so the outline pass can skip drawing a line round their fading
        // edges, which it would otherwise read as a colour jump
        this.fxMaskRT = new THREE.WebGLRenderTarget(1, 1);
      } else this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.6, 1.02); // only HDR magic (>1) blooms, not white signs
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      if (dio && this.sceneRT && this.fxMaskRT) {
        this.diorama = makeDioramaPass(this.sceneRT.depthTexture!, this.camera, this.fxMaskRT.texture);
        this.composer.addPass(this.diorama);
      }
    }
    this.camera.layers.enable(FX_NO_OUTLINE_LAYER);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
    Object.assign(this.renderer.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", imageRendering: dio ? "pixelated" : "auto" });
    this.assets = new ParkAssets({ ...DEFAULT_CANDY, neutralHue: THEME_CANDY_HUE[opts.themeId ?? ""] ?? DEFAULT_CANDY.neutralHue });
    this.camera.position.set(SPAWN.x, 0, SPAWN.z).add(CAM_OFFSET);
    this.camera.lookAt(SPAWN.x, 1, SPAWN.z);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    this.renderer.domElement.addEventListener("pointermove", this.onMove);
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    void this.boot();
  }

  // ── public API ──
  setMove(x: number, y: number) {
    this.move = { x, y };
    if (Math.hypot(x, y) > 0.1) {
      this.walkTarget = null;
      this.walkQueue = [];
    }
  }
  setInputEnabled(on: boolean) {
    this.inputOn = on;
    if (!on) {
      this.move = { x: 0, y: 0 };
      this.walkTarget = null;
      this.walkQueue = [];
    }
  }
  setPaused(on: boolean) {
    this.paused = on;
    if (on) this.stop();
    else if (!document.hidden) this.start();
  }
  /** Juicy celebration around the kid (quest done, prize claimed...). */
  celebrate(big = false) {
    if (!this.kid) return;
    this.play(this.kid, "dance", true);
    if (this.pet) this.play(this.pet, "gesture-positive", true);
    this.burst(this.kid.root.position.clone().setY(2.2), big ? 70 : 40);
  }
  /** A fireworks show over the plaza — the reward for finishing every quest today. */
  fireworks(seconds = 5) {
    const shots = Math.round(seconds * 2.4);
    for (let i = 0; i < shots; i++) {
      window.setTimeout(() => {
        if (this.disposed) return;
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 10;
        this.burst(new THREE.Vector3(Math.sin(a) * r, 12 + Math.random() * 8, -6 + Math.cos(a) * r), 60);
      }, i * (1000 / 2.4));
    }
    if (this.kid) this.play(this.kid, "dance", true);
  }

  /** Floating emoji marker over a place ("❗" quests waiting, "🍖" pet hungry...). */
  setBeacon(placeId: string, emoji: string | null) {
    const old = this.beacons.get(placeId);
    if (old) {
      this.scene.remove(old.sprite);
      old.sprite.material.map?.dispose();
      old.sprite.material.dispose();
      this.beacons.delete(placeId);
    }
    const place = this.allPlaces().find((p) => p.id === placeId);
    if (!emoji || !place) return;
    const s = badgeSprite(emoji, 2.2);
    const base = groundY(place.x, place.z) + place.signY + 2;
    s.position.set(place.x, base, place.z);
    this.scene.add(s);
    this.beacons.set(placeId, { sprite: s, base });
  }
  // ── pet behaviour API (Pet Meadow stations) ──
  /** Send the pet to a spot; resolves when it gets there (or after 4s). */
  petGoTo(x: number, z: number): Promise<void> {
    if (!this.pet) return Promise.resolve();
    this.clearZzz();
    this.petMode = "goto";
    this.petTarget = new THREE.Vector3(x, 0, z);
    return new Promise((resolve) => {
      const done = () => {
        this.petArrive = null;
        resolve();
      };
      this.petArrive = done;
      window.setTimeout(() => this.petArrive === done && done(), 4000);
    });
  }
  /** Play one of the pet's animations (eat, dance, gesture-positive, run...). */
  petAnim(name: string) {
    if (this.pet) this.play(this.pet, name, true);
  }
  /** Pet goes back to following the kid. */
  petFollow() {
    this.clearZzz();
    this.petMode = "follow";
    this.petTarget = null;
  }
  /** Speech bubble over the pet's head. */
  petSay(text: string, seconds = 3.2) {
    if (!this.pet) return;
    this.clearBubble();
    const s = labelSprite(text.length > 34 ? text.slice(0, 33) + "…" : text);
    s.scale.multiplyScalar(0.62);
    this.scene.add(s);
    this.petBubble = { sprite: s, until: this.time + seconds };
  }
  /** Four little need bars (hunger, fun, energy, clean) floating over the pet. */
  setPetStatus(stats: { hunger: number; happiness: number; energy: number; cleanliness: number } | null) {
    if (this.petStatus) {
      this.scene.remove(this.petStatus);
      this.petStatus.material.map?.dispose();
      this.petStatus.material.dispose();
      this.petStatus = null;
    }
    if (!stats || !this.pet) return;
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 96;
    const c = cv.getContext("2d")!;
    const rows: [string, number, string][] = [
      ["🍎", stats.hunger, "#ff6b8a"],
      ["😊", stats.happiness, "#ffc83d"],
      ["⚡", stats.energy, "#4cc9ff"],
      ["🫧", stats.cleanliness, "#7be0b0"],
    ];
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    c.roundRect(2, 2, 252, 92, 22);
    c.fill();
    rows.forEach(([icon, v, col], i) => {
      const x = 12 + i * 61;
      c.font = "26px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
      c.fillText(icon, x + 12, 34);
      c.fillStyle = "#f3dbe8";
      c.beginPath();
      c.roundRect(x, 50, 52, 16, 8);
      c.fill();
      c.fillStyle = v < 30 ? "#ff4f6d" : col;
      c.beginPath();
      c.roundRect(x, 50, Math.max(8, (52 * Math.max(0, Math.min(100, v))) / 100), 16, 8);
      c.fill();
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(2.6, 0.97, 1);
    this.scene.add(sprite);
    this.petStatus = sprite;
  }
  /** Pet snoozes in its bed (stops following) until woken. */
  /** is the pet asleep (in the park, or napping in its bed at home)? */
  get petSleeping(): boolean {
    return this.petMode === "sleep";
  }
  setPetSleeping(on: boolean, bed?: { x: number; z: number }) {
    if (!this.pet) return;
    if (on) {
      this.petMode = "sleep";
      if (bed) this.pet.root.position.set(bed.x, 0.45, bed.z);
      this.play(this.pet, this.pet.rig ? "sleep" : "idle");
      if (!this.petZzz) {
        this.petZzz = emojiSprite("💤", 1.2);
        this.scene.add(this.petZzz);
      }
    } else {
      this.pet.root.position.y = 0;
      this.petFollow();
    }
  }
  /** Fetch game: kid taps the field, the ball flies, the pet races for it and brings it back. */
  startFetch(field: { x: number; z: number }) {
    if (!this.pet) return;
    this.clearZzz();
    this.petMode = "fetch";
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshToonMaterial({ color: "#e6ff5c" }));
    ball.visible = false;
    this.scene.add(ball);
    this.fetch = { ball, from: new THREE.Vector3(), to: new THREE.Vector3(field.x, 0, field.z), t: 0, phase: "idle" };
    this.pet.root.position.set(field.x + 1.5, 0, field.z + 3);
  }
  throwBall(x: number, z: number) {
    const f = this.fetch;
    if (!f || !this.kid || f.phase !== "idle") return;
    f.from.copy(this.kid.root.position).setY(1.4);
    f.to.set(x, 0.32, z);
    f.t = 0;
    f.phase = "flying";
    f.ball.visible = true;
    this.play(this.kid, "gesture-positive", true);
  }
  stopFetch() {
    if (this.fetch) {
      this.scene.remove(this.fetch.ball);
      this.fetch.ball.geometry.dispose();
      (this.fetch.ball.material as THREE.Material).dispose();
    }
    this.fetch = null;
    this.petFollow();
  }
  /** Kid-sized walk up to a spot (used by stations so the kid stands next to them). */
  walkKidTo(x: number, z: number) {
    this.endSlide(false);
    this.endSki();
    this.endLift();
    this.walkQueue = [];
    this.walkTarget = new THREE.Vector3(x, 0, z);
  }
  /** Walk the kid along a route of points (e.g. the park paths to a land). */
  walkKidPath(points: [number, number][]) {
    this.routing = points.length > 2;
    const q = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.walkTarget = q.shift() ?? null;
    this.walkQueue = q;
  }
  /** Stop whatever a guided trip set going (its walk along a route, or the dragon's autopilot):
   *  the kid cancelled the trip. A dragon in the air simply stays where it is, the kid's to fly. */
  stopGuidedMove() {
    this.walkTarget = null;
    this.walkQueue = [];
    this.routing = false;
    this.autoFly = null;
  }
  private clearBubble() {
    if (!this.petBubble) return;
    this.scene.remove(this.petBubble.sprite);
    this.petBubble.sprite.material.map?.dispose();
    this.petBubble.sprite.material.dispose();
    this.petBubble = null;
  }
  private clearZzz() {
    if (!this.petZzz) return;
    this.scene.remove(this.petZzz);
    this.petZzz.material.map?.dispose();
    this.petZzz.material.dispose();
    this.petZzz = null;
  }

  // ── rides ──
  /** Enter a ride scene: the kid (and pet) travel into it, the park pauses behind it. */
  enterRide(build: (accent: string) => Ride) {
    if (this.ride || !this.kid) return;
    this.endSlide(false);
    this.endSki();
    this.endLift();
    this.dismount(true);
    const ride = build("#ff5fa8");
    this.ride = ride;
    this.rideReturn = this.kid.root.position.clone();
    this.scene.remove(this.kid.root);
    if (this.pet) this.scene.remove(this.pet.root);
    this.kid.root.position.copy(ride.spawnPoint);
    this.kid.root.scale.setScalar(ride.actorScale ?? 1);
    this.pet?.root.scale.setScalar((ride.actorScale ?? 1) * this.petGrowth);
    if (!ride.hideKid) ride.scene.add(this.kid.root);
    if (this.pet && !ride.hideKid) {
      this.pet.root.position.copy(ride.spawnPoint).add(new THREE.Vector3(1.2, 0, 0.8));
      ride.scene.add(this.pet.root);
    }
    this.walkTarget = null;
    this.walkQueue = [];
    this.move = { x: 0, y: 0 };
  }
  exitRide() {
    const ride = this.ride;
    if (!ride || !this.kid) return;
    ride.scene.remove(this.kid.root);
    if (this.pet) ride.scene.remove(this.pet.root);
    ride.dispose();
    this.ride = null;
    this.kid.root.scale.setScalar(1);
    this.pet?.root.scale.setScalar(this.petGrowth);
    this.kid.root.position.copy(this.rideReturn ?? new THREE.Vector3(SPAWN.x, 0, SPAWN.z));
    this.kid.root.position.y = 0;
    this.scene.add(this.kid.root);
    if (this.pet) {
      this.pet.root.position.copy(this.kid.root.position).add(new THREE.Vector3(1.6, 0, 1));
      this.pet.root.position.y = 0;
      this.scene.add(this.pet.root);
    }
    this.nearPlace = null;
  }
  get inRide() {
    return !!this.ride;
  }

  // ── Dream Park builder ──
  async setLayout(layout: Placed[]) {
    await this.dream?.setLayout(layout);
  }
  /** Build mode: camera swoops overhead the Dream Park lawn and taps go to the builder. */
  setBuildMode(on: boolean) {
    if (on) this.endSlide(false);
    this.building = on;
    this.walkTarget = null;
    this.walkQueue = [];
    this.move = { x: 0, y: 0 };
    if (!on) {
      this.dream?.setGhost(null);
      this.dream?.highlight(null);
    }
  }
  setGhost(pieceId: string | null, x?: number, z?: number, r?: number, ignoreUid?: string) {
    return this.dream?.setGhost(pieceId, x, z, r, ignoreUid) ?? null;
  }
  highlightPiece(uid: string | null) {
    this.dream?.highlight(uid);
  }
  /** Big celebration at a spot in the Dream Park (a new piece just landed). */
  cheerAt(x: number, z: number) {
    this.burst(new THREE.Vector3(x, 2.5, z), 45);
  }

  /** Bring a (newly adopted) pet into the park, or change how it looks. */
  async setPetAnimal(id: AnimalId) {
    const next = await this.makeActor(id, 1.25, "pet");
    if (this.disposed) return;
    if (this.pet) {
      next.root.position.copy(this.pet.root.position);
      this.scene.remove(this.pet.root);
      this.pet.rig?.dispose();
    } else if (this.kid) {
      next.root.position.copy(this.kid.root.position).add(new THREE.Vector3(1.8, 0, 1));
    }
    this.pet = next;
    next.root.scale.setScalar(this.petGrowth);
    this.scene.add(next.root);
    this.play(next, "gesture-positive", true);
    this.burst(next.root.position.clone().setY(1.4), 40);
  }

  /** Swap the kid's animal live (dress-up). */
  async setKidAnimal(id: AnimalId) {
    const next = await this.makeActor(id, 2.1, "kid");
    if (this.disposed) return;
    if (this.kid) {
      next.root.position.copy(this.kid.root.position);
      next.facing = this.kid.facing;
      this.scene.remove(this.kid.root);
      this.kid.rig?.dispose();
    }
    this.kid = next;
    this.scene.add(next.root);
    this.play(next, "gesture-positive", true);
    this.burst(next.root.position.clone().setY(1.6), 30);
  }

  // ── boot ──
  private async boot() {
    try {
      const [park, dream, kid, pet] = await Promise.all([
        buildPark(this.scene, this.assets, { hour: this.opts.hour, lowQuality: this.quality === "low", look: this.quality === "low" ? "smooth" : this.look }),
        createDreamPark(this.scene, this.assets),
        this.makeActor(this.opts.kidAnimal, 2.1, "kid"),
        this.opts.petAnimal ? this.makeActor(this.opts.petAnimal, 1.25, "pet") : Promise.resolve(null),
      ]);
      if (this.disposed) return;
      this.park = park;
      // (walk round the harbours' beacons too)
      park.obstacles.push(...HARBOUR_OBSTACLES);
      this.dream = dream;
      this.kid = kid;
      kid.root.position.set(SPAWN.x, 0, SPAWN.z);
      kid.facing = Math.atan2(-SPAWN.x, -SPAWN.z); // (towards the plaza)
      this.scene.add(kid.root);
      if (pet) {
        this.pet = pet;
        pet.root.scale.setScalar(this.petGrowth);
        pet.root.position.set(SPAWN.x + 1.8, 0, SPAWN.z + 1);
        this.scene.add(pet.root);
      }
      this.play(kid, "gesture-positive", true);
      try {
        await Promise.race([this.renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 2500))]);
      } catch {
        // compile on first render instead
      }
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
      this.readyAt = this.time;
      this.opts.onReady?.();
      this.start();
      void this.spawnVisitors();
      if (this.opts.treasures) {
        void createTreasures(this.scene, this.assets, this.opts.treasures.spots, new Set(this.opts.treasures.found)).then((t) => {
          if (this.disposed) t.dispose();
          else this.treasures = t;
        });
      }
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  /** A handful of other animals strolling the park so it feels busy and alive. */
  private async spawnVisitors() {
    if (!this.park || this.quality === "low") return;
    const taken = new Set([this.opts.kidAnimal, this.opts.petAnimal]);
    const pool = PARK_ANIMALS.filter((a) => !taken.has(a.id)).sort(() => Math.random() - 0.5).slice(0, 6);
    for (const a of pool) {
      if (this.disposed) return;
      try {
        const actor = await this.makeActor(a.id, 1.5 + Math.random() * 0.6);
        const pts = this.park.pathPoints;
        const start = pts[Math.floor(Math.random() * pts.length)];
        actor.root.position.copy(start);
        this.scene.add(actor.root);
        this.npcs.push({ actor, target: start.clone(), wait: Math.random() * 3 });
      } catch {
        // a visitor failing to load is harmless
      }
    }
  }

  private async makeActor(id: AnimalId, height: number, role: "kid" | "pet" | "visitor" = "visitor"): Promise<Actor> {
    const rig = buildChibi(id, {
      height,
      role,
      accent: role === "kid" ? (this.opts.accent ?? "#ff5fa8") : role === "pet" ? "#ffb020" : undefined,
      seed: Math.floor(Math.random() * 1e6),
    });
    const root = new THREE.Group();
    rig.root.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
    root.add(rig.root, blobShadow(height * 1.3));
    return { root, mixer: null, actions: new Map(), current: "", facing: 0, rig, last: new THREE.Vector3(Number.NaN, 0, 0), hold: 0 };
  }

  /** Advance an actor's animation: chibi rigs are driven by how fast they're moving. */
  private tickActor(a: Actor, dt: number, forceSpeed?: number, snap = true) {
    if (snap && !this.ride && a === this.pet && (this.onSky || this.gliding || this.launch) && this.kid) {
      const kp = this.kid.root.position;
      const s = this.onSky ? skyTopY(a.root.position.x, a.root.position.z, this.time) : null;
      if (this.onSky && (!s || (s.id !== this.onSky && !s.bridge))) {
        // never let the pet wander off the edge: hop back beside the kid
        a.root.position.set(kp.x + 1.2, kp.y, kp.z + 0.8);
      } else a.root.position.y = s ? s.y : kp.y;
    } else if (snap && !this.ride) {
      const gy = worldFloor(a.root.position.x, a.root.position.z);
      // in deep water everyone paddles at the surface
      a.root.position.y = WATER_Y - gy > SWIM_DEPTH ? WATER_Y - 0.95 + Math.sin(this.time * 2.4 + a.root.position.x) * 0.06 : gy + (a === this.pet && this.petMode === "sleep" ? 0.45 : 0);
    }
    if (!a.rig) {
      a.mixer?.update(dt);
      return;
    }
    const p = a.root.position;
    // (how fast it is really going, SMOOTHED: measured frame to frame it jitters — a short frame,
    //  a nudge off a wall, the ground's steps — and a jittery speed flips the walk between poses,
    //  which is what made heads nod up and down like mad)
    const raw = Number.isNaN(a.last!.x) || dt <= 0 ? 0 : Math.hypot(p.x - a.last!.x, p.z - a.last!.z) / dt;
    a.last!.copy(p);
    a.speedSm = (a.speedSm ?? 0) + ((raw > 40 ? 0 : raw) - (a.speedSm ?? 0)) * Math.min(1, dt * 9);
    if (a.speedSm < 0.05) a.speedSm = 0;
    const speed = forceSpeed ?? a.speedSm;
    // the pet (and visitors) paddle when they're in the sea
    if (a !== this.kid) a.rig.setSwim(!this.ride && WATER_Y - worldFloor(p.x, p.z) > SWIM_DEPTH && p.y < WATER_Y, speed > 0.4);
    a.rig.update(dt, speed);
    a.rig.setGlow(this.park?.atmosphere.glow ?? 0);
    if (a.hold && a.hold > 0) {
      a.hold -= dt;
      if (a.hold <= 0) a.current = ""; // the one-shot is done: walk/idle take over again
    }
  }

  private play(a: Actor, name: string, once = false) {
    if (a.rig) {
      const base = name === "idle" || name === "walk" || name === "run" || name === "";
      if (base) {
        if (a.current === name) return;
        // walking/running is automatic from speed; idle clears any looping action (e.g. sleep)
        if (name === "idle" && a.current && !["idle", "walk", "run"].includes(a.current)) a.rig.play("idle");
        a.current = name;
        return;
      }
      const map: Record<string, ChibiAction> = { "gesture-positive": "cheer", "gesture-negative": "sad", dance: "dance", eat: "eat", fetch: "fetch", sleep: "sleep", wave: "wave", cheer: "cheer" };
      const act = map[name];
      if (!act) return;
      a.rig.play(act, once);
      a.current = name;
      a.hold = once ? 1.3 : 0;
      return;
    }
    const next = a.actions.get(name);
    if (!next || a.current === name) return;
    const prev = a.actions.get(a.current);
    next.reset();
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = false;
      const onDone = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== next) return;
        a.mixer?.removeEventListener("finished", onDone);
        a.current = "";
        this.play(a, "idle");
      };
      a.mixer?.addEventListener("finished", onDone);
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    next.fadeIn(0.18).play();
    prev?.fadeOut(0.18);
    a.current = name;
  }

  // ── input ──
  private rayAt(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    return this.raycaster.ray;
  }
  private onDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging = false;
    this.lastDrag = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.camZoom };
    }
    if (this.ride?.pointer) this.ride.pointer("down", this.rayAt(e));
  };
  private onMove = (e: PointerEvent) => {
    if (this.ride?.pointer) {
      this.ride.pointer("move", this.rayAt(e));
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.camZoom = Math.max(0.55, Math.min(1.8, this.pinchStart.zoom * (this.pinchStart.dist / Math.max(20, d))));
      this.dragging = true;
      return;
    }
    if (this.building || this.fetch || !this.lastDrag || !this.downAt) return;
    const dx = e.clientX - this.lastDrag.x;
    const dy = e.clientY - this.lastDrag.y;
    if (!this.dragging && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 10) this.dragging = true;
    if (this.dragging) {
      this.camYaw -= dx * 0.009; // drag sideways to turn the view
      this.userTurnAt = this.time;
      this.camPitch = Math.max(0.16, Math.min(1.38, this.camPitch + dy * 0.006)); // drag up/down to tilt it
    }
    this.lastDrag = { x: e.clientX, y: e.clientY };
  };
  private onWheel = (e: WheelEvent) => {
    if (this.ride) return;
    this.camZoom = Math.max(0.55, Math.min(1.8, this.camZoom * (e.deltaY > 0 ? 1.08 : 0.92)));
  };
  /** Turn the view left/right (HUD buttons). */
  rotateView(delta: number) {
    this.camYaw += delta;
    this.userTurnAt = this.time;
  }
  private onUp = (e: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    const wasDrag = this.dragging;
    this.dragging = false;
    this.lastDrag = null;
    if (wasDrag && !this.ride) return; // that was looking around, not a tap
    if (this.ride) {
      this.ride.pointer?.("up", this.rayAt(e));
      return;
    }
    if (!d || !this.park || (!this.inputOn && !this.building && !this.fetch)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || performance.now() - d.t > 500) return; // a drag, not a tap
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.fetch) {
      const g = new THREE.Vector3();
      if (this.groundHit(g)) this.throwBall(g.x, g.z);
      return;
    }
    if (this.building) {
      const pieceHit = this.dream ? this.raycaster.intersectObjects(this.dream.tappables(), true)[0] : undefined;
      const uid = pieceHit?.object.userData.pieceUid as string | undefined;
      if (uid) {
        this.opts.onPieceTap?.(uid);
        return;
      }
      const g = new THREE.Vector3();
      if (this.groundHit(g)) this.opts.onBuildTap?.(g.x, g.z);
      return;
    }
    const hit = this.raycaster.intersectObjects(this.park.tappables, true)[0];
    const placeId = hit?.object.userData.placeId as string | undefined;
    if (placeId) {
      const place = this.allPlaces().find((p) => p.id === placeId);
      if (place) {
        // walk to the door, it opens on arrival
        const dir = new THREE.Vector3(-place.x, 0, -place.z).normalize();
        const door = new THREE.Vector3(place.x, 0, place.z).addScaledVector(dir, place.radius + 1.4);
        this.walkRouted(door.x, door.z);
        this.nearPlace = null;
        return;
      }
    }
    const ground = new THREE.Vector3();
    if (this.groundHit(ground)) this.walkRouted(ground.x, ground.z);
  };
  /** tap-to-walk: straight there, or round the rainforest's thicket along its trails */
  private walkRouted(x: number, z: number) {
    const k = this.kid?.root.position;
    const path = k && !this.mount?.flies ? findWalkPath(k.x, k.z, x, z) : null;
    if (path && path.length) {
      const q = path.map(([px, pz]) => new THREE.Vector3(px, 0, pz));
      this.walkTarget = q.shift() ?? null;
      this.walkQueue = q;
      this.routing = q.length > 1;
    } else {
      this.walkTarget = new THREE.Vector3(x, 0, z);
      this.walkQueue = [];
    }
  }
  private onVisibility = () => {
    if (document.hidden) this.stop();
    else if (!this.paused) this.start();
  };

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    // portrait phones: widen the view so the plaza still fits
    // (the diorama look uses a longer lens from further up, like looking at a model railway)
    // (wide enough that the top of the view reaches the misty painted hills on the horizon)
    this.camera.fov = this.look === "diorama" ? (this.camera.aspect < 0.8 ? 56 : 38) : this.camera.aspect < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); // CSS keeps it at 100% x 100%
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
    if (this.diorama) {
      const pr = this.renderer.getPixelRatio();
      this.sceneRT?.setSize(Math.round(w * pr), Math.round(h * pr));
      this.fxMaskRT?.setSize(Math.max(1, Math.round((w * pr) / 2)), Math.max(1, Math.round((h * pr) / 2)));
      (this.diorama.uniforms.uRes.value as THREE.Vector2).set(Math.round(w * pr), Math.round(h * pr));
    }
  }

  private start() {
    if (this.running || this.disposed || this.paused || !this.park) return;
    this.running = true;
    this.clock.getDelta();
    this.frame = requestAnimationFrame(this.tick);
  }
  private stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private burst(at: THREE.Vector3, n: number) {
    const colors = [0xff5fa8, 0xffd23f, 0x5ee6a8, 0x6cc6ff, 0xc38bff, 0xff9a52].map((c) => new THREE.Color(c));
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      vel.set([(Math.random() - 0.5) * 7, Math.random() * 6 + 3, (Math.random() - 0.5) * 7], i * 3);
      const c = colors[i % colors.length];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: this.sparkTex, size: 0.9, vertexColors: true, transparent: true, depthWrite: false }));
    this.scene.add(pts);
    this.bursts.push({ pts, vel, life: 1.4 });
  }

  private tick = () => {
    if (!this.running || this.disposed || !this.park || !this.kid) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, MAX_DT);
    this.governFrameRate(rawDt);
    this.time += dt;
    const kid = this.kid;
    const pos = kid.root.position;

    if (this.ride) {
      const ride = this.ride;
      const anchor = ride.playerAnchor?.();
      if (anchor) {
        pos.lerp(anchor.position, Math.min(1, dt * 8));
        kid.facing = anchor.facing;
      }
      turnTowards(kid, dt);
      this.tickActor(kid, dt);
      if (this.pet) {
        const pt = ride.petAnchor?.() ?? pos.clone().add(new THREE.Vector3(1.3, 0, 1.1).multiplyScalar(ride.actorScale ?? 1));
        // (a pet with a seat of its own rides ON it: it keeps up with the car instead of trailing behind)
        this.pet.root.position.lerp(pt, Math.min(1, dt * (ride.petAnchor ? 14 : 3)));
        this.tickActor(this.pet, dt);
      }
      ride.update?.(dt, pos);
      if (ride.camera) ride.camera(this.camera, dt);
      else {
        const focus = ride.cameraFocus ? ride.cameraFocus() : pos;
        const off = ride.cameraOffset ?? new THREE.Vector3(0, 9, 9);
        this.camera.position.lerp(focus.clone().add(off), Math.min(1, dt * 4));
        this.camera.lookAt(focus.x, focus.y + 0.8, focus.z);
      }
      // (the same diorama finish as the park: ink outlines and colour steps on interiors and rides too)
      if (this.sceneRT && this.composer) {
        this.renderer.setRenderTarget(this.sceneRT);
        this.renderer.render(ride.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.composer.render();
      } else this.renderer.render(ride.scene, this.camera);
      this.frame = requestAnimationFrame(this.tick);
      return;
    }

    // movement: joystick first, else tap-to-walk target
    let vx = 0;
    let vz = 0;
    // (flying somewhere picked on the map, until the joystick takes over)
    if (this.autoFly && (!this.mount?.flies || this.landing || Math.hypot(this.move.x, this.move.y) > 0.12)) this.autoFly = null;
    if (this.autoFly) {
      const dx = this.autoFly.x - pos.x;
      const dz = this.autoFly.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < FLY_LAND_R) {
        this.autoFly = null;
        this.dismount();
      } else {
        vx = dx / d;
        vz = dz / d;
        // cruise well up (over the Great Ridge's crags), coming down as it nears
        const cruise = Math.min(55, 18 + d * 0.08);
        this.altTarget += (cruise - this.altTarget) * Math.min(1, dt * 0.8);
      }
    } else if (this.inputOn) {
      const mag = Math.hypot(this.move.x, this.move.y);
      if (mag > 0.12) {
        // joystick "up" = away from the camera, whichever way the kid has turned the view
        const jx = (this.move.x / mag) * Math.min(1, mag);
        const jz = (-this.move.y / mag) * Math.min(1, mag);
        const c = Math.cos(this.camYaw);
        const sn = Math.sin(this.camYaw);
        vx = jx * c + jz * sn;
        vz = -jx * sn + jz * c;
      } else if (this.walkTarget) {
        const dx = this.walkTarget.x - pos.x;
        const dz = this.walkTarget.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) this.walkTarget = this.walkQueue.shift() ?? null;
        else {
          vx = dx / d;
          vz = dz / d;
        }
      }
    }
    if (this.sky || this.slide || this.skiLock) {
      vx = 0;
      vz = 0;
    }
    // On foot the kid has a little weight: they ease up to speed, take a step or two to stop, and
    // curve into a change of direction instead of snapping to it (the stick used to BE the
    // velocity: full speed on the first frame, a dead stop on the last, instant about-turns).
    // Quick enough that the controls still feel immediate.
    if (!this.mount && !this.ride && !this.building) {
      const want = Math.hypot(vx, vz);
      const k = 1 - Math.exp(-dt * (want > 0.01 ? 10 : 13));
      this.walkVX += (vx - this.walkVX) * k;
      this.walkVZ += (vz - this.walkVZ) * k;
      if (want <= 0.01 && Math.hypot(this.walkVX, this.walkVZ) < 0.04) this.walkVX = this.walkVZ = 0;
      vx = this.walkVX;
      vz = this.walkVZ;
    } else this.walkVX = this.walkVZ = 0;
    const moving = Math.hypot(vx, vz) > 0.01;
    const swimmingNow = !this.mount && !this.onSky && !this.gliding && !this.sky && !this.climb && !this.slide && !this.skiLock && seaDepth(pos.x, pos.z) > SWIM_DEPTH;
    const craft = this.mount && isCraft(this.mount.kind) ? this.mount.kind : null;
    if (craft) {
      // boats and subs have momentum: they take a moment to get going, coast when you let go,
      // and turn in arcs. Boats keep to water deep enough for their hull (no beaches, no
      // jetties, no ice floes); subs keep off the walls and the floor.
      // (the bow turns at its own pace and the speed builds up along it; pull back from standing
      // to go astern, e.g. to back out of a mooring)
      const caps = isBoat(craft) ? BOAT_CAPS[craft] : SUB_CAPS[craft as "sub"];
      const h = this.helm;
      const yaw0 = kid.root.rotation.y;
      h.yaw = yaw0;
      steer(h, vx, vz, WALK_SPEED * MOUNT_CAPS[craft].speed, caps.accel, caps.turn, dt);
      // a boat's bow can't swing through a jetty or onto the sand
      if (isBoat(craft) && h.yaw !== yaw0) {
        const c1 = boatClearance(craft, pos.x, pos.z, h.yaw, seaDepth);
        if (c1 < 0 && c1 < boatClearance(craft, pos.x, pos.z, yaw0, seaDepth)) h.yaw = yaw0;
      }
      kid.facing = h.yaw;
      kid.root.rotation.y = h.yaw;
      if (isBoat(craft)) {
        // (the whole hull keeps to deep enough water, the pedalo near the shore - a gentle bounce
        // and a hint when it noses too far out - and it bumps softly off other boats, the sea
        // friends and the whales and orcas at the surface: ../world/rideables/craft moveBoat)
        if (moveBoat(craft, h, pos, dt, seaDepth, this.afloatNear(pos)) === BUMP_DEEP && this.time > this.deepHintT) {
          this.deepHintT = this.time + 8;
          this.opts.onRideHint?.(craft === "pedalo" ? "\u{1F986} The duck pedalo likes to stay near the shore!" : `${MOUNT_CAPS[craft].emoji} The ${MOUNT_CAPS[craft].label} likes to stay near the shore!`);
        }
      } else {
        const nx = pos.x + Math.sin(h.yaw) * h.speed * dt;
        const nz = pos.z + Math.cos(h.yaw) * h.speed * dt;
        if (this.craftOk(craft, pos, nx, nz)) {
          pos.x = nx;
          pos.z = nz;
        } else if (this.craftOk(craft, pos, nx, pos.z)) {
          pos.x = nx;
          h.speed *= 0.6;
        } else if (this.craftOk(craft, pos, pos.x, nz)) {
          pos.z = nz;
          h.speed *= 0.6;
        } else {
          // a gentle bump: stop, and bounce back a touch
          h.speed *= -0.2;
        }
      }
      this.craftSpeed = Math.abs(h.speed);
      if (moving) {
        this.idleT = 0;
        this.waved = false;
        if (!this.walkTarget) this.routing = false;
      }
    } else if (swimmingNow) {
      // water has momentum: strokes build up speed and you glide on for a moment when you stop
      const sp = WALK_SPEED * (this.swimDepth > 0.6 ? 1.1 : 0.85);
      const k = Math.min(1, dt * (moving ? 2.4 : 1.1));
      this.swimVX += (vx * sp - this.swimVX) * k;
      this.swimVZ += (vz * sp - this.swimVZ) * k;
      pos.x += this.swimVX * dt;
      pos.z += this.swimVZ * dt;
      if (Math.hypot(this.swimVX, this.swimVZ) > 0.4) kid.facing = Math.atan2(this.swimVX, this.swimVZ);
      if (moving) {
        if (!this.walkTarget) this.routing = false;
        this.idleT = 0;
      } else this.idleT += dt;
    } else if (moving) {
      this.swimVX = this.swimVZ = 0;
      if (!this.walkTarget) this.routing = false;
      const swimming = !this.mount && seaDepth(pos.x, pos.z) > SWIM_DEPTH;
      const caps = this.mount ? MOUNT_CAPS[this.mount.kind] : null;
      const sp = WALK_SPEED * (caps ? caps.speed * (this.autoFly ? 2.6 : 1) : swimming ? (this.swimDepth > 0.6 ? 1.05 : 0.8) : this.routing && this.walkTarget ? 1.6 : 1);
      const px = pos.x;
      const pz = pos.z;
      pos.x += vx * sp * dt;
      pos.z += vz * sp * dt;
      // every ride keeps to its element: bikes, buggies and unicorns stop at the shore, mantas stay
      // under the sea, whales and dolphins in deep water (a flying dragon goes anywhere)
      if (caps && !(caps.medium === "air" && this.alt > 1)) {
        const depth = seaDepth(pos.x, pos.z);
        const blocked = caps.medium === "land" ? depth > 0.45 : caps.medium === "under" || caps.medium === "sea" ? depth < 2.6 : false;
        if (blocked) {
          pos.x = px;
          pos.z = pz;
        }
      }
      // out in the Wildlands, a car is road-bound (registry/roads.ts): trying to leave the road
      // slides it back along the edge, never a hard stop and never a teleport — the same idea as
      // the raised decks' own invisible railings a few lines below. Park-island buggies (the
      // car-gate/rides/dream/golf ones) and the Dino Isle jeeps keep roaming free as they always
      // have (they never leave the park/Dino Isle anyway — they already can't cross water), but once
      // ANY car strays out into the Wildlands proper it's held to the road same as a Wildlands jeep.
      if (caps && caps.medium === "land" && this.mount!.kind === "car" && carRoadBound(pos.x, pos.z)) {
        const c = roadConfine(pos.x, pos.z, px, pz);
        // held to the road (an edge, or a roundabout's island): the jeep points the way it really
        // goes, so it turns with the ring instead of sliding round it sideways
        if ((c.x !== pos.x || c.z !== pos.z) && Math.hypot(c.x - px, c.z - pz) > 0.004) {
          vx = c.x - px;
          vz = c.z - pz;
        }
        pos.x = c.x;
        pos.z = c.z;
        // the one level crossing's boom: when it's down (the train's within ~8s, registry/
        // roads.ts's crossingBoomDown), a car stops right at the line rather than driving through
        if (this.park && levelCrossingBlocks(pos.x, pos.z, this.park.railway.train.s)) {
          pos.x = px;
          pos.z = pz;
        }
      }
      kid.facing = Math.atan2(vx, vz);
      this.headFacing = kid.facing;
      this.idleT = 0;
      this.waved = false;
    } else {
      this.swimVX = this.swimVZ = 0;
      this.idleT += dt;
      // stood still for a moment: turn round to face the camera and give a little wave
      if (this.idleT > 2.2 && !this.building && !this.fetch && !this.mount) {
        kid.facing = Math.atan2(this.camera.position.x - pos.x, this.camera.position.z - pos.z);
        if (!this.waved) {
          this.waved = true;
          this.play(kid, "wave", true);
        }
      }
    }
    // riding: climb/dive/land, and the mount follows us
    if (this.mount) {
      const m = this.mount;
      // over the sea a manta can dive under the waves, down to just above the reef
      const sea = seaDepth(pos.x, pos.z);
      const minAlt = m.kind === "manta" && sea > 2.4 ? -(sea - 1.6) : 0;
      const lowAlt = minAlt < 0 ? minAlt : 4;
      // fliers can climb high enough to reach the floating mountains (~115 m up)
      const maxAlt = 115 - Math.max(floorY0(pos.x, pos.z), WATER_Y);
      const medium = MOUNT_CAPS[m.kind].medium;
      if (isBoat(m.kind)) {
        this.alt = this.altTarget = 0;
      } else if (isSub(m.kind)) {
        // ▼ dives, ▲ comes up: from bobbing at the surface down to just above the floor (the
        // Deep Explorer all the way down the Midnight Rift)
        const r = subAltRange(m.kind, floorY0(pos.x, pos.z), this.subRange);
        const rate = SUB_CAPS[m.kind].rate;
        this.altTarget = Math.max(r.lo, Math.min(r.hi, this.altTarget + this.flyInput * rate * dt));
        this.alt += (this.altTarget - this.alt) * Math.min(1, dt * 1.8);
        this.alt = Math.max(r.lo, Math.min(r.hi, this.alt));
      } else if (medium === "under") {
        // a manta swims under the waves only: from just below the surface down to the reef
        this.altTarget = Math.max(minAlt < 0 ? minAlt : -1.2, Math.min(-1.2, this.altTarget + this.flyInput * 9 * dt));
      } else if (medium === "sea") {
        // whales and dolphins swim at the surface and dive with ▼
        this.altTarget = Math.max(-Math.max(0, sea - 3), Math.min(0, this.altTarget + this.flyInput * 6 * dt));
      } else if (m.flies && !this.landing) this.altTarget = Math.max(lowAlt, Math.min(maxAlt, this.altTarget + this.flyInput * 12 * dt));
      if (!isCraft(m.kind)) {
        if (medium !== "sea" && this.altTarget < minAlt) this.altTarget = minAlt;
        this.alt += (this.altTarget - this.alt) * Math.min(1, dt * (this.landing ? 1.6 : 2.2));
        if (medium !== "sea" && this.alt < minAlt) this.alt = minAlt;
      }
      if (this.landing && this.alt < 0.25) this.dismount(true);
    }
    const aloft = this.alt > 3;
    // keep inside the park (fliers may roam out over the sea) and out of buildings
    // the ocean has no edge: past WRAP_R you come back in from the far side of the world,
    // heading home (the camera, pet and mount jump with you, so it's seamless in the fog)
    const beforeX = pos.x;
    const beforeZ = pos.z;
    if (wrapWorld(pos)) {
      const dx = pos.x - beforeX;
      const dz = pos.z - beforeZ;
      for (const v of [this.camBase, this.lookAtPt, this.camera.position]) {
        v.x += dx;
        v.z += dz;
      }
      if (this.pet) {
        this.pet.root.position.x += dx;
        this.pet.root.position.z += dz;
      }
      this.walkTarget = null;
      this.walkQueue = [];
      this.opts.onWrap?.();
      if (this.slide) this.endSlide(false);
    }
    // walk round the grassy hills
    for (const o of aloft ? [] : this.onSky ? (SKY_OBSTACLES_BY.get(this.onSky) ?? []) : this.gliding ? [] : this.park.obstacles) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 0.001) {
        pos.x = o.x + (dx / d) * o.r;
        pos.z = o.z + (dz / d) * o.r;
      }
    }
    // the Wildlands' trunks and boulders
    if (!aloft && !this.onSky && !this.gliding) {
      const kr = this.mount ? 0.9 : 0.45;
      // (and the big animals: the park's and the Wildlands')
      this.park.fauna.pushKid(pos, kr, pos.y);
      this.park.wildlife.pushKid(pos, kr, pos.y);
      this.park.trade.pushKid(pos, kr, pos.y);
      for (let k = 0; k < 2; k++) {
        const t = this.park.wildTrunkAt(pos.x, pos.z, kr);
        if (!t) break;
        const dx = pos.x - t.x;
        const dz = pos.z - t.z;
        const d = Math.hypot(dx, dz) || 1;
        pos.x = t.x + (dx / d) * (t.r + kr);
        pos.z = t.z + (dz / d) * (t.r + kr);
      }
    }
    // the rainforest's undergrowth is too thick to push through (and nobody climbs the falls' cliffs):
    // slide along its edge
    if (!aloft && !this.onSky && !this.gliding && !this.launch && !this.sky && !this.climb) pushOutOfThicket(pos, this.mount ? 0.9 : 0.55);
    for (const p of aloft || this.gliding ? [] : this.onSky ? this.park.places.filter((q) => q.sky === this.onSky) : this.allPlaces().filter((q) => !q.sky)) {
      if (p.radius <= 0) continue;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < p.radius && d > 0.001) {
        pos.x = p.x + (dx / d) * p.radius;
        pos.z = p.z + (dz / d) * p.radius;
      }
    }
    // raised walkways (Treetop's platforms, ramp and rope bridges) have invisible railings: up on one,
    // a step that would take the kid off its side isn't taken (they slide along the edge instead) —
    // they leave only where it meets the ground or another walkway, never by toppling off
    if (!this.mount && !this.onSky && !this.gliding && !aloft) {
      const dp = this.deckPrev;
      if (dp.on && raisedDeckAt(pos.x, pos.z, dp.y) === null) {
        if (raisedDeckAt(pos.x, dp.z, dp.y) !== null) pos.z = dp.z;
        else if (raisedDeckAt(dp.x, pos.z, dp.y) !== null) pos.x = dp.x;
        else {
          pos.x = dp.x;
          pos.z = dp.z;
        }
        this.walkTarget = null;
        this.walkQueue = [];
      }
      const y = settlementDeckY(pos.x, pos.z) ?? wildBridgeDeckY(pos.x, pos.z) ?? grandCanyonDeckY(pos.x, pos.z);
      dp.on = y !== null && y > groundY(pos.x, pos.z) + 0.8;
      dp.x = pos.x;
      dp.z = pos.z;
      dp.y = y ?? 0;
    } else this.deckPrev.on = false;
    // the Grand Canyon's cliffs are walls: on foot (or on a land mount) a step that would change
    // height by more than a real step — up a sheer face, or off a ledge — isn't taken; the kid slides
    // along the foot or the edge instead and goes up and down by the trail's ramps
    if (!this.climb && !this.onSky && !this.gliding && !aloft && !this.mount?.flies) {
      const cp = this.cliffPrev;
      const step = Math.hypot(pos.x - cp.x, pos.z - cp.z);
      if (cp.ok && step > 0 && step < 3 && (canyonWalkY(pos.x, pos.z) !== null || canyonWalkY(cp.x, cp.z) !== null)) {
        const y0 = worldFloor(cp.x, cp.z);
        const wall = (x: number, z: number) => Math.abs(worldFloor(x, z) - y0) > 1.2 + 1.5 * Math.hypot(x - cp.x, z - cp.z);
        if (wall(pos.x, pos.z)) {
          if (!wall(pos.x, cp.z)) pos.z = cp.z;
          else if (!wall(cp.x, pos.z)) pos.x = cp.x;
          else {
            pos.x = cp.x;
            pos.z = cp.z;
          }
          this.walkTarget = null;
          this.walkQueue = [];
        }
      }
      cp.x = pos.x;
      cp.z = pos.z;
      cp.ok = true;
    } else this.cliffPrev.ok = false;
    turnTowards(kid, dt);
    if (kid.current === "idle" || kid.current === "walk" || kid.current === "run" || kid.current === "") this.play(kid, moving && !this.mount ? "walk" : "idle");
    const floorY = worldFloor(pos.x, pos.z);
    const seaHere = WATER_Y - floorY;
    const skyHere = skyTopY(pos.x, pos.z, this.time);
    if (this.mount) {
      const m = this.mount;
      if (m.flies) {
        // fliers measure height from what's under them: the ground, the sea — or a floating
        // island's top once they're up level with it (flying into its side lifts you on top)
        let base = Math.max(floorY, WATER_Y);
        if (skyHere) {
          const isl = skyIslandById(skyHere.id);
          if (pos.y >= skyHere.y - 0.3 - (isl?.depth ?? 12)) base = skyHere.y;
        }
        if (base !== this.flyBase) {
          this.alt += this.flyBase - base;
          this.altTarget += this.flyBase - base;
          this.flyBase = base;
          // (ground that rises faster than the flier climbs — a cliff, the canyon's rim — must
          // never leave it below the surface: it rides up over the edge instead)
          if (this.alt < 0) this.alt = 0;
          if (!this.landing && this.altTarget < 4) this.altTarget = 4;
        }
        pos.y = base + this.alt;
      } else if (isBoat(m.kind)) {
        // a boat rides the swell: up and down with it, pitching over the crests and rolling
        const [hl, hw] = MOUNT_BODY[m.kind];
        const tl = hullTilt(pos.x, pos.z, kid.root.rotation.y, hl * 2, hw * 2, this.time, this.craftTilt);
        pos.y = tl.y;
        this.craftPitch += (tl.pitch - this.craftPitch) * Math.min(1, dt * 4);
        this.craftRoll += (tl.roll - this.craftRoll) * Math.min(1, dt * 4);
      } else if (isSub(m.kind)) {
        // a sub bobs on the swell at the surface; it noses down as it dives, up as it climbs
        const surf = SUB_CAPS[m.kind].surf;
        const k = Math.max(0, 1 - (surf - this.alt) / 1.5);
        pos.y = WATER_Y + this.alt + seaWave(pos.x, pos.z, this.time) * swellDamp(pos.x, pos.z) * k * 0.8;
        const climb = (this.alt - this.prevAlt) / Math.max(dt, 1e-3);
        this.craftPitch += (Math.max(-0.35, Math.min(0.35, -climb * 0.06)) - this.craftPitch) * Math.min(1, dt * 3);
        this.craftRoll = 0;
      } else if (MOUNT_CAPS[m.kind].medium === "sea") {
        pos.y = WATER_Y - (MOUNT_SEA_DRAFT as Record<string, number>)[m.kind] + this.alt;
      } else pos.y = seaHere > SWIM_DEPTH ? WATER_Y - 0.85 : floorY;
      this.prevAlt = this.alt;
      m.root.position.set(pos.x, pos.y, pos.z);
      m.root.rotation.y = kid.root.rotation.y;
      // bikes lean into turns; fliers sway; boats bank (the Rocket Boat hard) and subs bank like planes
      let dYaw = kid.facing - this.prevFacing;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      this.prevFacing = kid.facing;
      const isC = isCraft(m.kind);
      const rideSpeed = isC ? this.craftSpeed : moving ? WALK_SPEED * MOUNT_CAPS[m.kind].speed : 0;
      if (isC) {
        // (smoothed: kid.facing jumps, the boat eases round)
        const yawRate = dYaw / Math.max(dt, 1e-3);
        const lean = mountLean(m.kind, Math.max(-2.5, Math.min(2.5, yawRate)), rideSpeed);
        m.root.rotation.order = "YXZ";
        m.root.rotation.x = this.craftPitch;
        m.root.rotation.z += (this.craftRoll + lean - m.root.rotation.z) * Math.min(1, dt * 3);
        // the kid sways with the deck
        kid.root.rotation.order = "YXZ";
        kid.root.rotation.x = m.root.rotation.x;
        kid.root.rotation.z = m.root.rotation.z;
      } else m.root.rotation.z = MOUNT_CAPS[m.kind].medium === "land" ? mountLean(m.kind, dYaw / Math.max(dt, 1e-3), rideSpeed) : moving && m.flies ? Math.sin(this.time * 1.5) * 0.06 : 0;
      // a dragon banks, dives, rolls and beats its wings (./world/rideables/dragonFlight)
      if (m.kind === "dragon") {
        const climb = (this.alt - this.dragonPrevAlt) / Math.max(dt, 1e-3);
        this.dragonPrevAlt = this.alt;
        this.dragonFlight().apply(dt, { mount: m, kidRig: kid.rig?.root ?? null, pos, dYaw, alt: this.alt, climb, moving, cam: this.camera.position });
      }
      // wings beat under water too; the shadow measures down to the real ground / sea floor
      m.update(dt, isC ? rideSpeed : moving ? WALK_SPEED * 2 : 0, m.flies && Math.abs(this.alt) > 0.4, this.park.atmosphere.glow, pos.y - floorY);
      if (kid.rig) kid.rig.root.position.copy(m.seat);
      this.tickActor(kid, dt, 0, false);
      // a sparkly trail behind fliers
      if (m.flies && this.alt > 1 && moving) {
        this.flySparkle -= dt;
        if (this.flySparkle <= 0) {
          this.flySparkle = 0.12;
          this.burst(pos.clone().setY(pos.y + 0.4), 4);
        }
      }
    } else if (this.slide) {
      this.tickSlide(dt, kid);
    } else if (this.ski) {
      this.tickSki(dt, kid);
    } else if (this.lifting) {
      this.tickLift(dt, kid);
    } else if (this.onSky || this.gliding || this.launch) {
      // up on a floating mountain; step off the edge and you float gently down (steering as you go)
      if (this.launch) {
        // flying through the air from a sky cannon, in a big arc
        const L = this.launch;
        L.t += dt;
        const u = Math.min(1, L.t / L.dur);
        const toY = skyTopY(L.tx, L.tz, this.time)?.y ?? L.fy;
        pos.x = L.fx + (L.tx - L.fx) * u;
        pos.z = L.fz + (L.tz - L.fz) * u;
        pos.y = L.fy + (toY - L.fy) * u + Math.sin(Math.PI * u) * (18 + Math.hypot(L.tx - L.fx, L.tz - L.fz) * 0.12);
        kid.facing = Math.atan2(L.tx - L.fx, L.tz - L.fz);
        if (Math.floor(L.t * 12) !== Math.floor((L.t - dt) * 12)) this.burst(pos.clone().setY(pos.y + 0.6), 3);
        if (u >= 1) {
          this.launch = null;
          this.onSky = L.to;
          this.gliding = false;
          pos.y = toY;
          this.burst(pos.clone().setY(pos.y + 0.8), 60);
          this.opts.onSkyIsland?.(L.to, "land");
        }
      } else if (this.onSky && skyHere && (skyHere.id === this.onSky || skyHere.bridge)) {
        // (walking a rope bridge hands you over to the far island quietly)
        this.onSky = skyHere.id;
        pos.y = skyHere.y;
      }
      else {
        if (this.onSky) {
          this.onSky = null;
          this.gliding = true;
          this.fallV = 0;
          this.burst(pos.clone().setY(pos.y + 1), 30);
          this.opts.onSkyIsland?.(null, "glide");
        }
        this.fallV = Math.min(5.5, this.fallV + 6 * dt);
        pos.y -= this.fallV * dt;
        // (glide onto another island top on the way down)
        const landY = skyHere && pos.y >= skyHere.y - 0.5 ? skyHere.y : seaHere > SWIM_DEPTH ? WATER_Y - 0.95 : floorY;
        if (pos.y <= landY) {
          pos.y = landY;
          this.gliding = false;
          if (skyHere && landY === skyHere.y) {
            this.onSky = skyHere.id;
            this.opts.onSkyIsland?.(skyHere.id, "land");
          }
          this.burst(pos.clone().setY(pos.y + 0.6), 24);
        }
      }
      this.tickActor(kid, dt, this.sky ? 0 : undefined, false);
    } else {
      if (seaHere > SWIM_DEPTH) {
        // swimming: the up/down buttons swim up and dive; the depth follows gently
        const maxD = Math.max(0, seaHere - 1.1);
        this.swimTarget = Math.max(0, Math.min(maxD, this.swimTarget - this.flyInput * 4.5 * dt));
        this.swimDepth += (this.swimTarget - this.swimDepth) * Math.min(1, dt * 3);
        this.swimDepth = Math.min(this.swimDepth, maxD);
        const bob = this.swimDepth < 0.3 ? Math.sin(this.time * 2.2) * 0.07 : Math.sin(this.time * 1.4) * 0.12;
        pos.y = WATER_Y - 0.95 - this.swimDepth + bob;
        if (!this.wasInSea) {
          this.wasInSea = true;
          this.burst(pos.clone().setY(WATER_Y + 0.3), 26);
          this.opts.onSwim?.(true);
        }
      } else {
        pos.y = floorY;
        this.swimDepth = this.swimTarget = 0;
        if (this.wasInSea) {
          this.wasInSea = false;
          this.opts.onSwim?.(false);
        }
      }
      this.tickActor(kid, dt, this.sky ? 0 : undefined, false);
    }
    // lean into a swim: flat out and kicking under water, head up paddling at the top
    const swimNow = !this.mount && this.wasInSea;
    const swimMove = swimNow && Math.hypot(this.swimVX, this.swimVZ) > 1.2;
    // flat out and streamlined when swimming along (under water, or front crawl at the top);
    // upright-ish and treading water when still
    const pitchWant = swimNow ? (swimMove ? (this.swimDepth > 0.6 ? 1.35 : 1.15) : this.swimDepth > 0.6 ? 0.4 : 0.2) : 0;
    this.swimPitch += (pitchWant - this.swimPitch) * Math.min(1, dt * 4);
    // (no blob shadow on the ground while swimming — it floated under the kid like a pink ring)
    const blob = kid.root.children[1];
    if (blob && !this.mount) blob.visible = !swimNow && !this.slide && !this.lifting;
    if (kid.rig && !this.mount && !this.slide && !this.skiLock) {
      // (on foot: lean into speeding up, sit back when pulling up, bank into a turn — small, but it is
      // what makes a run read as a body with weight rather than a figure sliding along)
      const onFoot = !this.mount && !this.sky && !this.slide && !this.skiLock && !this.climb && !this.wasInSea;
      const spNow = onFoot ? Math.hypot(this.walkVX, this.walkVZ) : 0;
      // (speeding up or slowing down, measured gently over about a third of a second: taken frame
      //  to frame it is all noise, and the body pitched forward and back on every frame)
      const accelRaw = dt > 0 ? (spNow - this.leanSpeed) / dt : 0;
      this.leanSpeed = spNow;
      this.leanAccel += (Math.max(-12, Math.min(12, accelRaw)) - this.leanAccel) * Math.min(1, dt * 3);
      const accel = this.leanAccel;
      let turn = Math.atan2(Math.sin(kid.facing - this.leanFacing), Math.cos(kid.facing - this.leanFacing));
      this.leanFacing = kid.facing;
      turn = dt > 0 ? Math.max(-6, Math.min(6, turn / dt)) : 0;
      const wantX = onFoot ? Math.max(-0.05, Math.min(0.11, accel * 0.012 + spNow * 0.012)) : 0;
      const wantZ = onFoot ? Math.max(-0.2, Math.min(0.2, -turn * 0.045 * spNow)) : 0;
      this.leanX += (wantX - this.leanX) * Math.min(1, dt * 4);
      this.leanZ += (wantZ - this.leanZ) * Math.min(1, dt * 6);
      kid.rig.root.rotation.x = this.swimPitch + this.leanX;
      if (!this.slide) kid.rig.root.rotation.z = this.leanZ;
      kid.rig.root.position.y = this.swimPitch * 0.45;
      kid.rig.setSwim(swimNow, swimMove);
    }

    if (this.sky) this.tickSky(dt, kid);
    // aboard the train, the coaster or the carousel the kid and their pet SIT (they used to stand
    // in the carriage running on the spot, since the ride's own speed read as their running)
    if (!!this.sky !== this.skySeated) {
      this.skySeated = !!this.sky;
      const stance = this.skySeated ? "sit" : null;
      kid.rig?.setStance(stance);
      this.pet?.rig?.setStance(stance);
      if (kid.rig) kid.rig.root.position.set(0, this.skySeated ? -SKY_SEAT_DROP : 0, 0);
      if (this.skySeated) {
        this.play(kid, "idle");
        if (this.pet) this.play(this.pet, "idle");
      }
    }
    if (this.climb) this.tickClimb(dt, kid);
    // waiting on a platform: aboard as soon as the train stands there; walk off and it's off
    if (this.trainWait) {
      const st = this.trainWait;
      const rw = this.park.railway;
      if (stationAt(pos.x, pos.z, 4) !== st || this.mount) {
        this.trainWait = null;
        rw.release();
      } else if (rw.train.at === st) {
        this.trainWait = null;
        // (aboard: the call is spent — a train that was already standing here never "arrives", so
        // nothing else would clear it and it would wait at this platform for ever)
        rw.release();
        this.sky = { v: 0, dist: 0, cheered: false, train: true };
        this.walkTarget = null;
        this.walkQueue = [];
        this.burst(pos.clone().setY(pos.y + 1.4), 24);
      }
    }

    // wizards stand on their floating mountains (which bob gently)
    for (const w of this.wizards) {
      if (!w.island) continue;
      const top = skyTopY(w.place.x, w.place.z, this.time);
      if (!top) continue;
      w.model.root.position.y = top.y;
      w.sign.position.y = top.y + 4.9;
      if (w.star) w.star.position.y = top.y + 6.1;
    }

    // rides round the world: animate them, and find one close enough to hop on
    {
      const atSea = seaDepth(pos.x, pos.z) > 2.5 && seaDist(pos.x, pos.z) > 0;
      let driven: DrivenCraft | null = null;
      if (this.mount && isCraft(this.mount.kind)) {
        driven = this.driven;
        driven.kind = this.mount.kind;
        driven.x = pos.x;
        driven.y = pos.y;
        driven.z = pos.z;
        driven.yaw = this.mount.root.rotation.y;
        driven.pitch = this.mount.root.rotation.x;
        driven.roll = this.mount.root.rotation.z;
        driven.speed = this.craftSpeed;
      }
      const diving = !this.mount && this.wasInSea && this.swimDepth > 1;
      this.park.rides.update(dt, this.time, { kid: pos, under: this.camUnder, atSea, glow: this.park.atmosphere.glow, driven, diving, camera: this.camera });
      const canHop = !this.mount && !this.sky && !this.climb && !this.launch && !this.gliding && !this.slide && !this.skiLock;
      // (measured to the ride's side: a whale or a pirate ship is as easy to reach as a bike; a
      // dragon: the one the kid faces / walks toward)
      const n = canHop ? this.park.rides.nearest(pos, undefined, this.headFacing) : null;
      if (n && Math.abs(n.y - pos.y) < 4.5) {
        const h = this.hopNear ?? { id: "", kind: n.kind, label: "", x: 0, y: 0, z: 0, yaw: 0 };
        h.id = n.id;
        h.kind = n.kind;
        h.label = n.label;
        h.x = n.x;
        h.y = n.y;
        h.z = n.z;
        h.yaw = n.yaw;
        h.breed = n.breed;
        // a dragon that doesn't know the kid yet: say hello first
        if (n.kind === "dragon" && !this.bondedDragons.has(n.id)) h.label = `\u{1F91A} Say hi to ${DRAGON_BREEDS[n.breed ?? "roostwarden"].name}`;
        this.hopNear = h;
        this.hopLast = Object.assign(this.hopLast ?? { ...h }, h);
        this.hopLastT = this.time;
      } else this.hopNear = null;
      if (this.bondSync) {
        this.bondSync = false;
        this.park.rides.setBonded(this.bondedDragons);
      }
      if (this.park.rides.bonding()) this.hopNear = null;
      // which dragon "Say hi" / "Fly" is for: a ring at its feet and an arrow over it
      this.park.rides.setTarget(this.hopNear && this.hopNear.kind === "dragon" ? this.hopNear.id : null);
      const bondId = this.park.rides.takeBonded();
      if (bondId) {
        this.bondedDragons.add(bondId);
        this.opts.onDragonBond?.(bondId);
        const nm = DRAGON_BREEDS[RIDEABLE_SPOTS.find((q) => q.id === bondId)?.breed ?? "roostwarden"].name;
        // the kid said hi to ride it: friends now, so climb on and off we go
        const b = this.bondRide?.id === bondId ? this.rideStill(this.bondRide, 8) : null;
        this.bondRide = null;
        if (b && !this.mount && !this.sky && !this.climb && !this.ride) {
          this.hopNear = b;
          this.opts.onRideHint?.(`\u{1F496} ${nm} is your friend now! Up we go: hold \u25B2 to fly higher, \u25BC to swoop down`);
          this.hopOn(this.hopStyle.accent, this.hopStyle.skin);
        } else {
          this.opts.onRideHint?.(`\u{1F496} ${nm} is your friend now! Tap Fly to take off`);
          kid.rig?.play("cheer", true);
        }
      }
      // point out a parked dragon close by (once each), and a manta that's come to a diving kid
      // (on foot: how far the kid has walked, for the hints' wait)
      if (!Number.isNaN(this.hintLast.x) && !this.mount) this.hintWalk += Math.min(2, Math.hypot(pos.x - this.hintLast.x, pos.z - this.hintLast.z));
      this.hintLast.copy(pos);
      if (canHop && hintsReady(this.time - this.readyAt, this.hintWalk)) {
        const dn = this.park.rides.parkedNear(pos, "dragon", 25);
        if (dn && !this.dragonHints.has(dn)) {
          this.dragonHints.add(dn);
          this.opts.onRideHint?.(this.bondedDragons.has(dn) ? "\u{1F409} Your dragon friend is waiting! Walk up to it and tap Fly" : "\u{1F409} A dragon! Walk up slowly and say hi");
        }
      }
      this.dragonFx?.update(dt, this.time, { pos, riding: this.mount?.kind === "dragon" });
      if (this.park.rides.takeMantaArrival() && !this.mount) this.opts.onRideHint?.("\u{1FABD} A manta ray has come to see you! Swim up to it and tap Hop on");
    }

    // Coralcove Isle: say hello the first time you arrive; villagers chat when you're close
    const talk = this.park.villageTalk;
    const talkKey = talk ? `${talk.id}:${talk.line}` : "";
    if (talkKey !== this.lastTalk) {
      this.lastTalk = talkKey;
      this.opts.onVillageTalk?.(talk);
    }
    if (!this.metVillage && Math.hypot(pos.x - VILLAGE_ISLAND.x, pos.z - VILLAGE_ISLAND.z) < VILLAGE_ISLAND.r + 12) {
      this.metVillage = true;
      this.opts.onVillage?.(VILLAGE_ISLAND.name, VILLAGE_ISLAND.clan, VILLAGE_ISLAND.id);
    }
    // a Wildlands settlement: say hello the first time the kid walks into it
    const settlementHere = settlementAt(pos.x, pos.z, 12);
    if (settlementHere && !this.metSettlements.has(settlementHere.id)) {
      this.metSettlements.add(settlementHere.id);
      this.opts.onVillage?.(settlementHere.name, settlementHere.clan, settlementHere.id);
    }
    // a Natural Wonder of the World: a big "you found it!" the first time the kid walks close
    const wonderHere = wonderAt(pos.x, pos.z);
    if (wonderHere && !this.metWonders.has(wonderHere.id)) {
      this.metWonders.add(wonderHere.id);
      this.opts.onWonder?.(wonderHere);
    }

    // discoveries on the floating mountains
    if (this.onSky && !this.launch) {
      this.park.skyChests.setKid(pos.x, pos.y, pos.z);
      for (const sp of SKY_SPOTS) {
        if (sp.island !== this.onSky) continue;
        const d = Math.hypot(pos.x - sp.x, pos.z - sp.z);
        if (sp.kind === "launcher") {
          // step onto a sky cannon: whoosh, off to another island
          if (d < sp.r * 0.7 && sp.target) {
            const to = skyIslandById(sp.target);
            if (to) {
              this.foundSpot(sp);
              this.launch = { fx: pos.x, fy: pos.y, fz: pos.z, tx: to.landing.x, tz: to.landing.z, to: to.id, t: 0, dur: 2.6 + Math.hypot(to.landing.x - pos.x, to.landing.z - pos.z) / 60 };
              this.onSky = null;
              this.walkTarget = null;
              this.walkQueue = [];
              this.burst(pos.clone().setY(pos.y + 0.5), 80);
              this.play(kid, "cheer", true);
            }
          }
          continue;
        }
        if (sp.kind === "stones") continue; // found by solving it (below)
        if (d < sp.r && !this.spotsFound.has(sp.id)) {
          this.foundSpot(sp);
          if (sp.kind === "telescope" && sp.target) {
            const to = skyIslandById(sp.target);
            if (to) this.peek = { x: to.x, y: to.y + 4, z: to.z, until: this.time + 3.5 };
          }
        }
      }
      for (const ps of this.park.skyChests.puzzleState()) {
        if (!ps.done || this.spotsFound.has(ps.id)) continue;
        const sp = SKY_SPOTS.find((q) => q.id === ps.id);
        if (sp) this.foundSpot(sp);
      }
    }

    // a floating mountain's treasure chest: walk up to it to open it
    if (this.onSky && !this.skyOpened.has(this.onSky)) {
      const isl = skyIslandById(this.onSky);
      if (isl && Math.hypot(pos.x - isl.treasure.x, pos.z - isl.treasure.z) < 2.4) {
        this.skyOpened.add(isl.id);
        this.park.skyChests.setOpened([...this.skyOpened]);
        this.burst(pos.clone().setY(pos.y + 1.6), 90);
        this.play(kid, "cheer", true);
        this.opts.onSkyTreasure?.(isl.id);
      }
    }

    // pet: follows behind, trots circles round the kid when idle — unless a station has it busy
    if (this.pet && (this.slide || this.petSlide) && this.petMode === "follow") {
      // on the penguin slides it toboggans too: on its tummy down the same chute, just behind the kid
      const pet = this.pet;
      const o = this.petSlideOut;
      if (this.slide) {
        const s0 = this.petSlideS;
        this.petSlideS = petSlidePose(this.slide, o);
        // (in it goes, just after the kid: its own splash)
        if (s0 < slideSplashS(this.slide.chute) && this.petSlideS >= slideSplashS(this.slide.chute)) {
          this.park.frost.slide.fx(o.x, WATER_Y, o.z, 1.4, 0);
          this.play(pet, "cheer", true);
        }
      } else if (this.petSlide) {
        const q = this.petSlide;
        stepKidSlide(q, dt, 0, true, Infinity);
        o.x = q.x;
        o.y = q.y;
        o.z = q.z;
        o.yaw = q.yaw;
        o.pitch = q.pitch;
        if (q.splash) {
          this.park.frost.slide.fx(q.x, WATER_Y, q.z, 1.4, 0);
          this.play(pet, "cheer", true);
        }
      }
      pet.root.position.set(o.x, o.y, o.z);
      pet.root.rotation.y = o.yaw;
      pet.facing = o.yaw;
      if (pet.rig) {
        pet.rig.setSlide(true);
        const r = pet.rig.root;
        const ca = Math.cos(o.pitch);
        const sa = Math.sin(o.pitch);
        r.rotation.order = "XYZ";
        r.rotation.set(Math.PI / 2 + o.pitch, 0, 0);
        r.position.set(0, 0.55 * sa + 0.32 / Math.max(0.5, ca), -0.55 * ca);
      }
      this.tickActor(pet, dt, 0, false);
      if (this.petSlide && this.petSlide.done) this.endPetSlide();
    } else if (this.pet && this.lifting && this.petMode === "follow") {
      // on the chairlift it sits on the seat beside the kid (and waits beside them to board)
      const L = this.park.frost.ski.lift();
      const pet = this.pet;
      const side = L.state === KL_RIDE ? 0.85 : 1.3;
      pet.root.position.set(L.x + Math.cos(L.yaw) * side, L.y + (L.state === KL_RIDE ? 0.02 : 0), L.z - Math.sin(L.yaw) * side);
      pet.root.rotation.y = L.yaw;
      pet.facing = L.yaw;
      this.tickActor(pet, dt, 0, L.state !== KL_RIDE);
    } else if (this.pet && this.mount && this.petMode === "follow") {
      const seat = this.mount.root.localToWorld(this.mount.petSeat.clone());
      this.pet.root.position.copy(seat);
      this.pet.root.rotation.y = kid.root.rotation.y;
      this.pet.facing = kid.facing;
      this.tickActor(this.pet, dt, 0, false);
    } else if (this.pet) {
      const pet = this.pet;
      let target: THREE.Vector3 | null = null;
      let speed = 3.5;
      let brainFacing: number | null = null;
      if (this.petMode === "follow") {
        // a creature with a body and a mind of its own (../pet/followBrain): at heel on a walk,
        // settling, pottering and playing when the kid stops
        const pp = pet.root.position;
        let b = this.petBrain;
        // (anything else that moved the pet — a ride, a door, fetch — and it picks up from there)
        if (!b || Math.hypot(b.x - pp.x, b.z - pp.z) > 0.6) b = this.petBrain = newPetBrain(pp.x, pp.z, pet.root.rotation.y);
        const K = this.petKid;
        const moved = Number.isNaN(this.petKidLast.x) || dt <= 0 ? 0 : Math.hypot(pos.x - this.petKidLast.x, pos.z - this.petKidLast.z) / dt;
        this.petKidLast.copy(pos);
        K.x = pos.x;
        K.z = pos.z;
        K.facing = kid.facing;
        // (smoothed, and nothing silly from a teleport)
        K.speed += ((moved > 40 ? 0 : moved) - K.speed) * Math.min(1, dt * 8);
        const step = stepPetBrain(b, dt, K, Math.random);
        pp.x = b.x;
        pp.z = b.z;
        brainFacing = b.heading;
        if (step.emote && (pet.current === "idle" || pet.current === "")) this.play(pet, "gesture-positive", true);
      } else if (this.petMode === "goto" && this.petTarget) {
        target = this.petTarget;
        speed = 2.6;
        if (pet.root.position.distanceTo(target) < 0.6) this.petArrive?.();
      } else if (this.petMode === "fetch" && this.fetch) {
        const f = this.fetch;
        if (f.phase === "flying") {
          f.t += dt / 0.9;
          const k = Math.min(1, f.t);
          f.ball.position.lerpVectors(f.from, f.to, k);
          f.ball.position.y = f.from.y * (1 - k) + 0.32 + Math.sin(k * Math.PI) * 4.5;
          if (k >= 1) f.phase = "chasing";
          target = f.to.clone().setY(0);
          speed = 1.6;
        } else if (f.phase === "chasing") {
          target = f.to.clone().setY(0);
          speed = 4.5;
          if (pet.root.position.distanceTo(target) < 0.8) f.phase = "returning";
        } else if (f.phase === "returning") {
          target = pos.clone().add(new THREE.Vector3(0, 0, 1.4));
          speed = 4;
          f.ball.position.copy(pet.root.position).setY(1.1);
          if (pet.root.position.distanceTo(target) < 1) {
            f.phase = "idle";
            f.ball.visible = false;
            this.play(pet, "gesture-positive", true);
            this.burst(pet.root.position.clone().setY(1.6), 18);
            this.opts.onFetchCatch?.();
          }
        }
      }
      const before = pet.root.position.clone();
      if (target) {
        const k = Math.min(1, dt * speed);
        pet.root.position.x += (target.x - pet.root.position.x) * k;
        pet.root.position.z += (target.z - pet.root.position.z) * k;
      }
      const step = pet.root.position.clone().sub(before);
      const petMoving = step.length() > (brainFacing === null ? 0.01 : dt * 0.35);
      if (brainFacing !== null) pet.facing = brainFacing;
      else if (petMoving) pet.facing = Math.atan2(step.x, step.z);
      turnTowards(pet, dt);
      if (this.petMode !== "sleep" && (pet.current === "idle" || pet.current === "walk" || pet.current === "run" || pet.current === ""))
        this.play(pet, petMoving && !this.sky ? (this.petMode === "fetch" ? "run" : "walk") : "idle");
      this.tickActor(pet, dt, this.sky ? 0 : undefined);
      const head = pet.root.position.y + 1.9;
      if (this.petStatus) this.petStatus.position.set(pet.root.position.x, head + 0.7, pet.root.position.z);
      if (this.petBubble) {
        this.petBubble.sprite.position.set(pet.root.position.x, head + (this.petStatus ? 1.8 : 0.9), pet.root.position.z);
        if (this.time > this.petBubble.until) this.clearBubble();
      }
      if (this.petZzz) this.petZzz.position.set(pet.root.position.x + 0.6, head + 0.4 + Math.sin(this.time * 2) * 0.25, pet.root.position.z);
    }

    // on the train the pet sits beside the kid, in the same carriage; on the coaster, in the car behind
    if (this.sky?.train && this.pet) {
      this.park.railway.carPose(1, this.trainPose);
      const sx = Math.cos(this.trainPose.yaw) * 0.5;
      const sz = -Math.sin(this.trainPose.yaw) * 0.5;
      kid.root.position.x = this.trainPose.x - sx;
      kid.root.position.z = this.trainPose.z - sz;
      this.pet.root.position.set(this.trainPose.x + sx, this.trainPose.y + 0.4, this.trainPose.z + sz);
      this.pet.facing = this.trainPose.yaw;
      this.pet.root.rotation.y = this.trainPose.yaw;
    } else if (this.sky && this.pet) {
      const st = this.park.skyTrain;
      const pp = st.loop.getPointAt((st.u - ((RIDE_CAR + 1) * CAR_GAP) / st.len + 1) % 1);
      this.pet.root.position.set(pp.x, pp.y + 0.75, pp.z);
      this.pet.facing = kid.facing;
      this.pet.root.rotation.y = kid.facing;
    } else if (this.climb && this.pet) {
      // snapped right beside the kid every frame (never the normal follow-path logic, which reads
      // badly against the climb's own eased-but-still-large position steps)
      const side = kid.facing + Math.PI / 2;
      const px = kid.root.position.x + Math.sin(side) * 1.4;
      const pz = kid.root.position.z + Math.cos(side) * 1.4;
      this.pet.root.position.set(px, groundY(px, pz), pz);
      this.pet.facing = kid.facing;
      this.pet.root.rotation.y = kid.facing;
    }

    // wandering visitors stroll between path points
    for (const n of this.npcs) {
      const a = n.actor;
      if (n.wait > 0) {
        n.wait -= dt;
        this.play(a, "idle");
      } else {
        const dx = n.target.x - a.root.position.x;
        const dz = n.target.z - a.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) {
          n.wait = 1.5 + Math.random() * 4;
          const pts = this.park.pathPoints;
          const near = pts.filter((p) => p.distanceTo(a.root.position) < 22);
          n.target = (near.length ? near : pts)[Math.floor(Math.random() * (near.length || pts.length))].clone();
        } else {
          a.root.position.x += (dx / d) * 2.4 * dt;
          a.root.position.z += (dz / d) * 2.4 * dt;
          a.facing = Math.atan2(dx, dz);
          this.play(a, "walk");
        }
      }
      turnTowards(a, dt);
      this.tickActor(a, dt);
    }

    // doors
    if (this.inputOn && !aloft && !this.sky && !this.climb && !this.gliding && !this.launch && !this.slide && !this.skiLock) {
      let found: PlaceDef | null = null;
      const here = this.onSky
        ? [...this.park.places.filter((p) => p.sky === this.onSky), ...this.wizards.filter((w) => w.island === this.onSky).map((w) => w.place)]
        : [...this.park.places.filter((p) => !p.sky), ...this.wizards.filter((w) => !w.island).map((w) => w.place)];
      for (const p of here) {
        if (p.doorRadius <= 0) continue;
        if (Math.hypot(pos.x - p.x, pos.z - p.z) < p.doorRadius) {
          found = p;
          break;
        }
      }
      if (found && found.id !== this.nearPlace) {
        this.walkTarget = null;
        this.walkQueue = [];
        this.opts.onPlace?.(found);
      }
      if (!found && this.nearPlace) this.opts.onLeavePlace?.(this.nearPlace);
      this.nearPlace = found?.id ?? null;
    }

    this.park.update(dt, this.time, pos);
    const q3 = this.park.quests3d.update(dt, this.time, pos, !!this.mount?.flies && this.alt > 2, this.park.atmosphere.glow);
    if (q3.shard !== null) {
      this.burst(pos.clone().setY(pos.y + 1.6), 70);
      this.play(kid, "cheer", true);
      this.opts.onShard?.(q3.shard);
    }
    // the sea: the reef and its creatures show when you're in (or looking into) the water
    const uw = this.park.underwater;
    const nearSea = Math.hypot(pos.x, pos.z) > 118;
    // (not in Rainbow Lake or the river: they're fresh water, with their own fish)
    const inland = seaDist(pos.x, pos.z) < -4 && waterSdf(pos.x, pos.z) < 3;
    uw.group.visible = !inland && (this.camUnder || this.wasInSea || nearSea || (!!this.mount && MOUNT_CAPS[this.mount.kind].medium === "under" && pos.y < WATER_Y));
    const uwr = uw.update(dt, this.time, { kid: pos, under: this.camUnder, glow: this.park.atmosphere.glow });
    const ab = this.park.abyss.update(dt, this.time, { kid: pos, under: this.camUnder, glow: this.park.atmosphere.glow }).spot;
    if (ab && ab.id !== this.abyssSpot) this.opts.onAbyssSpot?.(ab);
    this.abyssSpot = ab?.id ?? null;
    // Frostpeak's slides: standing at a chute's start arch offers a turn (its penguins step aside)
    const nearFrost = Math.hypot(pos.x - FROST_ISLAND.x, pos.z - FROST_ISLAND.z) < FROST_ISLAND.r + 20;
    this.slideNear = nearFrost && !this.slide && !this.mount && !this.sky && !this.onSky && !this.gliding && !this.launch && !this.wasInSea && !this.building ? this.park.frost.slide.offer(pos.x, pos.z) : -1;
    this.park.frost.slide.hold(this.slide ? this.slide.chute : this.slideNear);
    const fs = this.park.frost.update(dt, this.time, { kid: pos, glow: this.park.atmosphere.glow, hour: this.park.atmosphere.hour, under: this.camUnder }).spot;
    if (fs && fs.id !== this.frostSpot) this.opts.onAbyssSpot?.(fs);
    this.frostSpot = fs?.id ?? null;
    // the Penguin Ski Run: skis at the start hut, the chairlift at the bottom, the lodge's viewpoint;
    // and on foot the kid never walks through a penguin (they step aside; the rest is a bump)
    {
      const fr = this.park.frost;
      const onFoot = nearFrost && !this.slide && !this.skiLock && !this.mount && !this.sky && !this.onSky && !this.gliding && !this.launch && !this.wasInSea && !this.building;
      this.skiNear = onFoot && fr.ski.hutAt(pos.x, pos.z);
      this.liftNear = onFoot && fr.ski.liftAt(pos.x, pos.z);
      fr.ski.kidOnPiste(this.ski ? this.ski.s : -99);
      if (onFoot) fr.blockKid(pos);
      const v = FROST_SKI.view;
      const dv = Math.hypot(pos.x - v.x, pos.z - v.z);
      const atView = onFoot && dv < 2.6;
      this.skiView += ((atView ? 1 : 0) - this.skiView) * Math.min(1, dt * 1.6);
      if (atView && !this.skiViewSaid) {
        this.skiViewSaid = true;
        this.opts.onSki?.("view");
      } else if (dv > 7) this.skiViewSaid = false;
    }
    this.park.dolphins.update(dt, this.time, { kid: pos, under: this.camUnder });
    const dn = this.park.dino.update(dt, this.time, { kid: pos, glow: this.park.atmosphere.glow, hour: this.park.atmosphere.hour });
    if (dn.roar) this.opts.onRoar?.();
    if (dn.spot && dn.spot.id !== this.dinoSpot) this.opts.onAbyssSpot?.(dn.spot);
    this.dinoSpot = dn.spot?.id ?? null;
    if (!this.metDino && dinoShoreDist(pos.x, pos.z) < 10) {
      this.metDino = true;
      this.opts.onVillage?.(DINO_ISLAND.name, "the dinosaurs", DINO_ISLAND.id);
    }
    if (!this.metFrost && Math.hypot(pos.x - FROST_ISLAND.x, pos.z - FROST_ISLAND.z) < FROST_ISLAND.r + 10) {
      this.metFrost = true;
      this.opts.onVillage?.(FROST_ISLAND.name, "the penguins", FROST_ISLAND.id);
    }
    if (uwr.pearl !== null) {
      this.burst(pos.clone().setY(pos.y + 1.2), 50);
      this.opts.onPearl?.(uwr.pearl);
    }
    if (q3.ring) {
      this.burst(pos.clone().setY(pos.y + 1), q3.ring.lap !== undefined ? 90 : 30);
      this.opts.onRing?.(q3.ring.passed, q3.ring.lap);
    }
    if (!this.heroLight.parent) this.scene.add(this.heroLight);
    if (this.mount && isSub(this.mount.kind) && pos.y < WATER_Y - 1.5) {
      // driving a sub under water: the warm light becomes its headlights' glow, out ahead on the
      // rocks and whatever swims up (the fleet draws the beams themselves)
      const yaw = this.mount.root.rotation.y;
      const ahead = this.mount.kind === "deepsub" ? 9 : 7.5;
      this.heroLight.position.set(pos.x + Math.sin(yaw) * ahead, pos.y + 0.4, pos.z + Math.cos(yaw) * ahead);
      this.heroLight.distance = 34;
      this.heroLight.decay = 1;
      this.heroLight.color.set("#fff0c8");
      this.heroLight.intensity = 9 + Math.min(14, (WATER_Y - pos.y) * 0.25);
    } else {
      this.heroLight.distance = 9;
      this.heroLight.decay = 1.6;
      this.heroLight.color.set("#ffe2f6");
      this.heroLight.position.set(pos.x, pos.y + 4.5, pos.z + 1.5);
      this.heroLight.intensity = this.park.atmosphere.glow * 7;
    }
    // at twilight your footsteps leave a little trail of sparkles
    if (moving && this.park.atmosphere.glow > 0.45) {
      this.stepSparkle -= dt;
      if (this.stepSparkle <= 0) {
        this.stepSparkle = 0.28;
        this.burst(pos.clone().setY(0.25), 5);
      }
    }
    for (const w of this.wizards) {
      const near = w.model.root.position.distanceTo(pos) < 12 ? pos : null;
      w.model.update(dt, this.time, near, this.park.atmosphere.glow);
      if (w.star) w.star.position.y = w.model.root.position.y + 6.1 + Math.sin(this.time * 2.4) * 0.25;
    }
    const foundId = this.treasures?.update(dt, this.time, pos) ?? null;
    if (foundId !== null) {
      this.burst(pos.clone().setY(2), 60);
      this.play(kid, "dance", true);
      this.opts.onTreasure?.(foundId);
    }
    this.dream?.update(dt, this.time);
    for (const b of this.beacons.values()) b.sprite.position.y = b.base + Math.sin(this.time * 3) * 0.35;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const attr = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let k = 0; k < b.vel.length; k += 3) {
        b.vel[k + 1] -= dt * 9;
        arr[k] += b.vel[k] * dt;
        arr[k + 1] += b.vel[k + 1] * dt;
        arr[k + 2] += b.vel[k + 2] * dt;
      }
      attr.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / 1.4);
      if (b.life <= 0) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        (b.pts.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }

    // the camera drifts round behind the kid as they move, so "forward" is ahead — unless a finger
    // turned the view a moment ago, or they're heading back towards the camera (no sudden spins)
    if (moving && !this.building && !this.sky && !this.climb && !this.slide && !this.skiLock && !this.ride && this.time - this.userTurnAt > 2.2) {
      let d = kid.facing + Math.PI - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // strong when heading away from the camera, only a gentle drift when walking sideways
      // (a full-strength follow chased a sideways walk round in circles)
      // (driving, the view swings round firmly behind the car as it turns — steering left keeps
      // turning left, the way a car does; on foot that same strength spun a sideways walk in circles)
      const driving = this.mount?.kind === "car";
      const w = driving ? 0.65 + 0.35 * Math.max(0, Math.cos(d)) : 0.22 + 0.78 * Math.max(0, Math.cos(d));
      if (Math.abs(d) < 2.4) this.camYaw += d * Math.min(1, dt * (driving ? 2.4 : 1.3) * w);
    }
    if (this.slide) {
      // tobogganing: chase cam just behind and a little above, framing the chute ahead
      const k = this.slide;
      const want = this.slideCam.set(pos.x - k.dx * 7.5, pos.y + 3.6 + Math.max(0, Math.tan(k.pitch)) * 4, pos.z - k.dz * 7.5);
      this.camera.position.lerp(want, Math.min(1, dt * 4.5));
      const ground = worldFloor(this.camera.position.x, this.camera.position.z) + 1.4;
      if (this.camera.position.y < ground) this.camera.position.y = ground;
      this.camera.lookAt(pos.x + k.dx * 5, pos.y + 0.4 - Math.tan(k.pitch) * 3, pos.z + k.dz * 5);
      this.camBase.copy(this.camera.position);
      this.lookAtPt.set(pos.x, pos.y + 1.2, pos.z);
      this.camYaw = k.yaw + Math.PI;
    } else if (this.ski || this.lifting) {
      // skiing: chase cam behind and up, looking down the piste; on the lift: off to the side,
      // watching the chair climb with the run below
      if (this.ski) {
        const k = this.ski;
        const hx = Math.sin(Math.atan2(k.dx, k.dz));
        const hz = Math.cos(Math.atan2(k.dx, k.dz));
        // (up behind the kid and off to the side away from the chairlift, so the lift's top station
        // and its chairs never come between the camera and the kid)
        this.slideCam.set(pos.x - hx * 6.5 + hz * 3, pos.y + 6.5, pos.z - hz * 6.5 - hx * 3);
        this.camera.position.lerp(this.slideCam, Math.min(1, dt * 3.5));
        this.camera.lookAt(pos.x + hx * 5, pos.y - 0.3, pos.z + hz * 5);
        this.camYaw = Math.atan2(k.dx, k.dz) + Math.PI;
      } else {
        const L = this.park.frost.ski.lift();
        const sx = Math.cos(L.yaw);
        const sz = -Math.sin(L.yaw);
        this.slideCam.set(pos.x - sx * 9 - Math.sin(L.yaw) * 4, pos.y + 2.5, pos.z - sz * 9 - Math.cos(L.yaw) * 4);
        this.camera.position.lerp(this.slideCam, Math.min(1, dt * 3));
        this.camera.lookAt(pos.x, pos.y + 0.6, pos.z);
        this.camYaw = L.yaw + Math.PI;
      }
      const ground = worldFloor(this.camera.position.x, this.camera.position.z) + 1.4;
      if (this.camera.position.y < ground) this.camera.position.y = ground;
      this.camBase.copy(this.camera.position);
      this.lookAtPt.set(pos.x, pos.y + 1.2, pos.z);
    } else if (this.sky?.carousel) {
      // on the carousel: through the rider's own eyes — over the animal's head and its brass pole,
      // rising and falling with it, looking along the way it gallops and a little in towards the
      // painted drum (the kid's own body is hidden while they ride, see rideCarousel)
      const yaw = this.kid!.facing;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const cl = Math.hypot(pos.x - CAROUSEL.x, pos.z - CAROUSEL.z) || 1;
      const inX = (CAROUSEL.x - pos.x) / cl;
      const inZ = (CAROUSEL.z - pos.z) / cl;
      // (leaning a little to the inside of the pole, so it frames the view instead of filling it)
      this.camera.position.set(pos.x - fx * 0.15 + inX * 0.42, pos.y + 1.3, pos.z - fz * 0.15 + inZ * 0.42);
      // (a circle curves away from straight ahead: looking well in keeps the animal in front, the
      // inner ring and the painted drum in view, with the park sliding by beyond)
      this.camera.lookAt(pos.x + fx * 4 + inX * 4.6, pos.y + 0.5, pos.z + fz * 4 + inZ * 4.6);
      this.camBase.copy(this.camera.position);
      this.lookAtPt.copy(pos);
    } else if (this.sky) {
      // chase cam: behind and above the car, looking down the track
      const tan = this.sky.train ? this.trainTan() : this.park.skyTrain.loop.getTangentAt(this.park.skyTrain.u);
      // high and to one side of the train, so the smoke streams past rather than into the lens
      const sideX = tan.z;
      const sideZ = -tan.x;
      const want = new THREE.Vector3(pos.x - tan.x * 10 + sideX * 3.5, pos.y - tan.y * 10 + 6.5, pos.z - tan.z * 10 + sideZ * 3.5);
      this.camera.position.lerp(want, Math.min(1, dt * 5));
      this.camera.lookAt(pos.x + tan.x * 12, pos.y + tan.y * 12 + 0.6, pos.z + tan.z * 12);
      this.camBase.copy(this.camera.position);
      this.lookAtPt.copy(pos);
    } else if (this.climb) {
      if (this.climb.phase === "summit") {
        // a slow orbit round the true top — the island falls away on every side as it circles
        const ang = this.time * 0.22;
        const R = this.climb.route.summitOrbitR;
        const top = this.climb.route.pointAtU(1);
        const want = new THREE.Vector3(top.x + Math.sin(ang) * R, pos.y + 13, top.z + Math.cos(ang) * R);
        this.camera.position.lerp(want, Math.min(1, dt * 1.6));
        this.camera.lookAt(top.x, pos.y - 3, top.z);
      } else if (this.climb.phase === "flyDown") {
        // the helicopter swoop: high and a little behind, following the kid all the way down
        const want = new THREE.Vector3(pos.x, pos.y + 17, pos.z + 13);
        this.camera.position.lerp(want, Math.min(1, dt * 3));
        this.camera.lookAt(pos.x, pos.y, pos.z);
      } else {
        // climbing: chase cam behind and above, same shape as the train/coaster's own
        const heading = this.kid?.facing ?? 0;
        const tanX = Math.sin(heading);
        const tanZ = Math.cos(heading);
        const sideX = tanZ;
        const sideZ = -tanX;
        const want = new THREE.Vector3(pos.x - tanX * 9 + sideX * 3, pos.y + 6, pos.z - tanZ * 9 + sideZ * 3);
        this.camera.position.lerp(want, Math.min(1, dt * 3.5));
        this.camera.lookAt(pos.x + tanX * 8, pos.y + 1.2, pos.z + tanZ * 8);
      }
      this.camBase.copy(this.camera.position);
      this.lookAtPt.copy(pos);
    } else if (this.building) {
      // overhead view of the whole Dream Park lawn
      const zb = zoneBounds();
      const cx = (zb.minX + zb.maxX) / 2;
      const cz = (zb.minZ + zb.maxZ) / 2;
      const span = Math.max(zb.maxX - zb.minX, zb.maxZ - zb.minZ);
      const portrait = this.camera.aspect < 0.8;
      // a friendly 3/4 view (not straight down) so tall candy pieces still read well
      this.camera.position.lerp(new THREE.Vector3(cx, span * (portrait ? 1.25 : 0.72), cz + span * (portrait ? 0.95 : 0.9)), Math.min(1, dt * 3));
      this.camera.lookAt(cx, 0, cz + (portrait ? 1.5 : 2.5));
    } else {
      // (big rides - a whale, the dragon, the Pirate Ship - pull the camera further back)
      const view = this.mount ? MOUNT_VIEW[this.mount.kind] : 1;
      const seatY = this.mount ? this.mount.seat.y : 0;
      let dist = CAM_OFFSET.length() * this.camZoom * (this.look === "diorama" ? 1.32 : 1) * (this.mount?.flies && this.alt > 1 ? 1.3 : this.mount ? 1.15 : 1) * view * (this.mount?.kind === "dragon" && this.dragonFx ? this.dragonFx.camBack : 1);
      // under the sea the water swallows anything far away: bring the camera in close (the
      // storybook look's model-railway distance lost the kid and the manta in the haze)
      // (riding: is the KID's head under? a sub's cabin can sit below its root)
      const headUp = this.mount ? 2.0 : 1.6;
      // (…but a giant near the kid — a true-size blue whale is 40 units, the megalodon 26 — pulls it
      // back smoothly, and a little wider, until both fit: ../world/sea/bigSea)
      const uwView = pos.y + seatY + headUp < WATER_Y;
      let bigWant = 0;
      let bigFov = 0;
      if (uwView) {
        dist = Math.min(dist, this.mount ? 15 * view : 13);
        const bb = this.bigBuf;
        bb.length = 0;
        forEachBigSea((b) => bb.push(b));
        const f = bigFrame(this.lookAtPt, bb, dist, 36, this.bigOut);
        bigWant = f.dist - dist;
        bigFov = f.fov;
      }
      this.camBigX += (bigWant - this.camBigX) * Math.min(1, dt * (bigWant > this.camBigX ? 0.9 : 0.6));
      this.camBigFov += (bigFov - this.camBigFov) * Math.min(1, dt * 0.9);
      if (uwView) dist += this.camBigX;
      // a tree (or big rock) between the camera and the kid? slide the camera in closer, like
      // a proper third-person camera, instead of staring at a trunk
      // (not in the diorama look: from that height canopies rarely block, and pulling in ruins the view)
      if (!(this.mount?.flies && this.alt > 3) && this.look !== "diorama") {
        const dirX = Math.sin(this.camYaw) * Math.cos(this.camPitch);
        const dirZ = Math.cos(this.camYaw) * Math.cos(this.camPitch);
        let want = dist;
        for (const o of this.park.obstacles) {
          const ox = o.x - pos.x;
          const oz = o.z - pos.z;
          const along = ox * dirX + oz * dirZ; // how far along the view line (horizontal)
          if (along <= 1.5 || along >= want) continue;
          const side = Math.abs(ox * dirZ - oz * dirX);
          // canopies spread well past a trunk; big solid things (a wreck, a temple) block only themselves
          const reach = o.r < 2 ? Math.max(1.6, o.r * 5.5) : o.r + 2.5;
          if (side < reach) want = Math.min(want, Math.max(5, (along - 1) / Math.max(0.3, Math.cos(this.camPitch))));
        }
        this.camPull += (want - this.camPull) * Math.min(1, dt * (want < this.camPull ? 6 : 2));
        dist = Math.min(dist, this.camPull);
      }
      // under the rainforest's canopy on foot: drop down among the trunks, closer in and looking up a
      // little, so the roof of leaves is overhead (the jungle's cut keeps the leaves off the lens)
      const inForest = !this.mount && !this.building && underCanopy(pos.x, pos.z) && pos.y > WATER_Y - 0.5;
      this.forestCam += ((inForest ? 1 : 0) - this.forestCam) * Math.min(1, dt * 1.6);
      const fc = this.forestCam * this.forestCam * (3 - 2 * this.forestCam);
      let pitch = this.camPitch + (Math.min(this.camPitch, 0.3) - this.camPitch) * fc;
      if (fc > 0.001) {
        dist *= 1 - 0.38 * fc;
        // keep the camera over the trail behind the kid rather than deep in the undergrowth
        const dx = Math.sin(this.camYaw);
        const dz = Math.cos(this.camYaw);
        let room = dist;
        for (let k = 2; k <= 14; k++) {
          const d = (k / 14) * dist * Math.cos(pitch);
          if (thicketSdf(pos.x + dx * d, pos.z + dz * d) < -2.2) {
            room = Math.max(7, d / Math.max(0.3, Math.cos(pitch)));
            break;
          }
        }
        this.forestPull += (room - this.forestPull) * Math.min(1, dt * (room < this.forestPull ? 5 : 1.5));
        dist = Math.min(dist, dist + (this.forestPull - dist) * fc);
      }
      // inside one of the island's road tunnels (registry/roads.ts's tunnelCeilingAt): the chase
      // camera ducks down and pulls right in, almost level, so it stays inside the low, dark bore
      // instead of poking through the lining above — see the hard Y-clamp just after camBase is set
      const tunnelCeil = tunnelCeilingAt(pos.x, pos.z);
      this.tunnelCam += ((tunnelCeil !== null ? 1 : 0) - this.tunnelCam) * Math.min(1, dt * 2.2);
      const tc = this.tunnelCam * this.tunnelCam * (3 - 2 * this.tunnelCam);
      if (tc > 0.001) {
        dist *= 1 - 0.75 * tc;
        pitch += (0.08 - pitch) * tc;
      }
      const fov0 = this.look === "diorama" ? (this.camera.aspect < 0.8 ? 56 : 38) : this.camera.aspect < 0.8 ? 58 : 42;
      const fov = fov0 + 20 * fc + this.camBigFov;
      if (Math.abs(this.camera.fov - fov) > 0.05) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
      const off = new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
      // look a little ahead of where the kid is heading, so they can see what's coming
      const ahead = moving ? 3 : 1.2;
      const lx = pos.x + Math.sin(kid.facing) * ahead;
      const lz = pos.z + Math.cos(kid.facing) * ahead;
      // (after a jump — the world wrap, a ride far across the island — snap rather than ease the
      // whole way: an easing camera hundreds of metres behind would see past the sky)
      const lookWant = new THREE.Vector3(lx, pos.y + seatY + 1.2, lz);
      if (this.lookAtPt.distanceTo(lookWant) > 60) this.lookAtPt.copy(lookWant);
      else this.lookAtPt.lerp(lookWant, Math.min(1, dt * 3));
      // ease an un-lifted camera position, then add the hill lift on top (so the lift can't feed back)
      const baseWant = new THREE.Vector3(this.lookAtPt.x, this.lookAtPt.y - 1.2 - seatY * 0.5, this.lookAtPt.z).add(off);
      if (this.camBase.distanceTo(baseWant) > 60) this.camBase.copy(baseWant);
      else this.camBase.lerp(baseWant, Math.min(1, dt * 3.5));
      this.camera.position.copy(this.camBase);
      // keep the view clear over hills: march from the kid to the camera and lift the camera
      // until the line of sight clears the ground (and never let it dip into a hill) — the Grand
      // Canyon's own VISUAL rock (canyonVisualFloorY, standing proud of the softened height field
      // groundY itself never shows) counts as "ground" here too, cheaply skipped everywhere else
      // on the island (nearGrandCanyon's own early-out)
      const cp = this.camera.position;
      let lift = 0;
      for (let k = 1; k <= 8; k++) {
        const u = k / 9;
        const sx = this.lookAtPt.x + (cp.x - this.lookAtPt.x) * u;
        const sz = this.lookAtPt.z + (cp.z - this.lookAtPt.z) * u;
        const lineY = this.lookAtPt.y + (cp.y - this.lookAtPt.y) * u;
        const canyonFloor = nearGrandCanyon(sx, sz) ? canyonVisualFloorY(sx, sz, rawHeight(sx, sz)) : null;
        const need = Math.max(groundY(sx, sz), canyonFloor ?? -Infinity) + 1.4 - lineY;
        if (need > 0) lift = Math.max(lift, need / u);
      }
      this.camLift += (Math.min(lift, 30) - this.camLift) * Math.min(1, dt * 4);
      cp.y += this.camLift;
      const canyonUnderCam = nearGrandCanyon(cp.x, cp.z) ? canyonVisualFloorY(cp.x, cp.z, rawHeight(cp.x, cp.z)) : null;
      const under = Math.max(worldFloor(cp.x, cp.z), canyonUnderCam ?? -Infinity) + 1.2;
      if (cp.y < under) cp.y = under;
      // hard safety clamp: never let the camera itself end up above a tunnel's own lining, however
      // the hill-lift above just moved it (checked at the camera's OWN (x, z), not just the kid's)
      const ceilAtCam = tunnelCeilingAt(cp.x, cp.z);
      if (ceilAtCam !== null && cp.y > ceilAtCam) cp.y = ceilAtCam;
      // belt and braces for the Grand Canyon specifically: the lift/clamp above keeps the camera
      // ABOVE the visual rock at its own (x, z), but a sheer wall right beside a narrow gorge can
      // still sit BETWEEN the kid and a camera that's merely "high enough" — the classic case a
      // chase camera clips through a wall to one side rather than one directly underneath it. Walk
      // the actual sightline (not just the vertical lift sweep above, which only raises Y) and ease
      // the boom itself in toward the kid the moment any sample along it dips inside the rock,
      // exactly like uwPull's own "slide in to the last clear point" just below — a smooth pull-in,
      // never an instant snap, and fully skipped (canyonPull eases back to 1) away from the canyon.
      let canyonClear = 1;
      if (nearGrandCanyon(pos.x, pos.z, 40) || nearGrandCanyon(cp.x, cp.z, 40)) {
        const L = this.lookAtPt;
        // k starts at 2 (20% of the way along), not 1: right beside the kid's own feet the crisp
        // wall profile (round 8: near-vertical cliff bands, not ramps) can step from floor to full
        // rim height within a metre or two — a real step a kid can stand right beside — and a k=1
        // sample there used to read "blocked at the very start", collapsing canyonPull to ~0 and
        // snapping the camera onto the kid's own face (nose in the dirt, frame full of one flat
        // colour). Skipping that first tenth means only an obstruction genuinely BETWEEN the kid and
        // the camera triggers the pull-in; a floor of 0.3 below also means the boom can shrink hard
        // but never fully vanish onto the kid, so even a genuine near-miss stays a recognisable shot.
        for (let k = 2; k <= 10; k++) {
          const u = k / 10;
          const sx = L.x + (cp.x - L.x) * u;
          const sy = L.y + (cp.y - L.y) * u;
          const sz = L.z + (cp.z - L.z) * u;
          if (!nearGrandCanyon(sx, sz)) continue;
          const wallY = canyonVisualFloorY(sx, sz, rawHeight(sx, sz));
          if (wallY !== null && sy < wallY + 1.5) {
            canyonClear = (k - 1) / 10;
            break;
          }
        }
        canyonClear = Math.max(canyonClear, 0.3);
      }
      this.canyonPull += (canyonClear - this.canyonPull) * Math.min(1, dt * (canyonClear < this.canyonPull ? 8 : 1.5));
      if (this.canyonPull < 0.999) {
        const L = this.lookAtPt;
        cp.set(L.x + (cp.x - L.x) * this.canyonPull, L.y + (cp.y - L.y) * this.canyonPull, L.z + (cp.z - L.z) * this.canyonPull);
      }
      // the camera never straddles the waterline: it dives with a diving kid (closer in, the sea
      // is murky) and stays above the waves for one paddling at the top
      const kidUnder = pos.y + seatY + headUp < WATER_Y; // head below the surface (paddling sits at WATER_Y - 0.95)
      if (kidUnder) {
        cp.lerp(this.lookAtPt, 0.15);
        // over water too shallow to hide a camera (the lagoon's edge)? slide in toward the kid
        for (let k = 0; k < 6 && groundY(cp.x, cp.z) + 0.8 > WATER_Y - 0.6; k++) cp.lerp(this.lookAtPt, 0.3);
        // stay down near the kid's depth, looking a little down on them (hugging the surface
        // filled the view with its bright underside)
        // float a little above the kid, over the coral tops (down among the coral, sea fans and
        // grass blocked the view), and never up through the surface
        // (pulled back over a rift wall or a reef slope, the floor there would lift the camera far
        // above the kid, looking down from the rim: slide it in toward them instead)
        for (let k = 0; k < 10 && worldFloor(cp.x, cp.z) + 2.2 > pos.y + seatY + 4.5; k++) cp.lerp(this.lookAtPt, 0.25);
        cp.y = Math.min(WATER_Y - 0.6, Math.max(pos.y + seatY + 1.6, worldFloor(cp.x, cp.z) + 2.2));
        // the line from the kid back to the camera must stay in open water (pulled back for a giant,
        // it would otherwise sit inside a rift wall, a reef slope or up through the surface): slide
        // in to the last clear point, smoothly
        const L = this.lookAtPt;
        let clear = 1;
        for (let k = 1; k <= 14; k++) {
          const u = k / 14;
          const sx = L.x + (cp.x - L.x) * u;
          const sy = L.y + (cp.y - L.y) * u;
          const sz = L.z + (cp.z - L.z) * u;
          if (sy < worldFloor(sx, sz) + 1.1 || sy > WATER_Y - 0.4) {
            clear = (k - 1) / 14;
            break;
          }
        }
        const span = Math.hypot(cp.x - L.x, cp.y - L.y, cp.z - L.z);
        clear = Math.max(clear, Math.min(1, 4 / Math.max(span, 1e-3)));
        this.uwPull += (clear - this.uwPull) * Math.min(1, dt * (clear < this.uwPull ? 8 : 1.5));
        // (in at once when something's in the way, back out gently)
        const pull = Math.min(this.uwPull, clear);
        if (pull < 0.999) cp.set(L.x + (cp.x - L.x) * pull, L.y + (cp.y - L.y) * pull, L.z + (cp.z - L.z) * pull);
      } else if (seaDepth(cp.x, cp.z) > 0 && cp.y < WATER_Y + 1.2) cp.y = WATER_Y + 1.2;
      // aim a little above the kid: they sit in the lower third and the world fills the frame
      // (aiming straight at them left the bottom half of the screen as empty grass)
      // (under the sea, look a little DOWN at the reef instead — up is just the surface)
      // (under water: look level, out across the reef and the blue — the water is clear now)
      // (on a dragon, aim lower so the whole dragon - wings, rolls, fire - stays in the picture)
      const aimUp = (kidUnder ? 0.2 : dist * (this.camera.aspect < 0.8 ? 0.34 : 0.38) * Math.max(0, Math.cos(pitch) - 0.35) + this.forestCam * dist * 0.1) * (this.mount?.kind === "dragon" && this.alt > 1 ? 0.35 : 1) - (this.mount?.kind === "ship" ? dist * 0.38 * Math.max(0, Math.cos(pitch) - 0.35) + 2.2 : 0);
      // (the Pirate Ship: aim at the captain at the wheel, so they sit in the middle of the picture
      // with the deck, masts and sails rising ahead - aimed higher, the stern and the kid fell off the bottom)
      this.camera.lookAt(this.lookAtPt.x, this.lookAtPt.y + aimUp, this.lookAtPt.z);
      // a telescope's peek: glance over at the island it's aimed at
      if (this.peek && this.time < this.peek.until) this.camera.lookAt(this.peek.x, this.peek.y, this.peek.z);
    }
    // under the sea? deep-blue fog, no sky
    const camUnder = !this.building && !this.ride && this.camera.position.y < WATER_Y - 0.05;
    if (camUnder || this.camUnder) {
      // (Rainbow Lake and the river are fresh water: greener and clearer than the sea)
      this.park.atmosphere.setFresh(camUnder && waterSdf(this.camera.position.x, this.camera.position.z) < 3 && seaDist(this.camera.position.x, this.camera.position.z) < 0);
      this.park.atmosphere.setUnderwater(camUnder, WATER_Y - this.camera.position.y);
      this.park.storybook?.setUnderwater(camUnder);
      this.park.fauna.setVisible(!camUnder);
    }
    this.camUnder = camUnder;
    // (big creatures dither away between the camera and the kid, under water)
    if (this.kid) {
      const kp = this.kid.root.position;
      setOccluderFocus(kp.x, kp.y + (this.mount ? this.mount.seat.y : 0) + 1.1, kp.z, camUnder ? 1 : 0);
    }
    // bloom a little stronger at twilight, when the magic comes out
    const glowNow = this.park.atmosphere.glow;
    if (this.bloom) this.bloom.strength = 0.28 + glowNow * 0.5;
    // lift the exposure at twilight so the world stays readable around the glow
    this.renderer.toneMappingExposure = 1.12 + glowNow * 0.55;
    const framed = this.frameSkiView();
    if (this.sceneRT) {
      this.renderer.setRenderTarget(this.sceneRT);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
    }
    this.renderFxMask();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (framed) {
      this.camera.position.copy(this.skiSaved.p);
      this.camera.quaternion.copy(this.skiSaved.q);
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  /** renders just FX_NO_OUTLINE_LAYER (mist, spray plumes, a rainbow) alone into fxMaskRT, so the
   *  diorama pass can tell where they are and skip drawing an outline there — the objects themselves
   *  still render normally in the main pass (both layers), properly depth-tested and composited;
   *  this is only a mask, so it's fine that it isn't. No-op without a mask target to fill. */
  private renderFxMask() {
    if (!this.fxMaskRT) return;
    this.camera.layers.set(FX_NO_OUTLINE_LAYER);
    this.renderer.setRenderTarget(this.fxMaskRT);
    const prevColor = this.fxMaskClear.copy(this.renderer.getClearColor(this.fxMaskClear));
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setClearColor(prevColor, prevAlpha);
    this.renderer.setRenderTarget(null);
    this.camera.layers.set(0);
    this.camera.layers.enable(FX_NO_OUTLINE_LAYER);
  }

  /** at the lodge's viewpoint: swing the camera round behind the kid to frame the whole ski run */
  private frameSkiView(): boolean {
    const w = this.skiView;
    if (w < 0.01 || !this.kid || this.ride) return false;
    const e = w * w * (3 - 2 * w);
    const v = FROST_SKI.view;
    const k = this.kid.root.position;
    const lx = v.look.x;
    const lz = v.look.z;
    const dx = lx - v.x;
    const dz = lz - v.z;
    const dl = Math.hypot(dx, dz) || 1;
    this.skiSaved.p.copy(this.camera.position);
    this.skiSaved.q.copy(this.camera.quaternion);
    // (behind the kid and well up, over the chairlift's cables, the whole run filling the view beyond)
    const want = this.skiCamTmp.set(k.x - (dx / dl) * 9, k.y + 12, k.z - (dz / dl) * 9);
    this.camera.position.lerp(want, e);
    const q0 = this.skiSaved.q;
    this.camera.lookAt(lx, v.lookY + 1, lz);
    this.camera.quaternion.slerpQuaternions(q0, this.camera.quaternion.clone(), e);
    return true;
  }
  private skiCamTmp = new THREE.Vector3();

  /** where the pointer ray meets the ground (the terrain mesh, else a flat plane) */
  private groundHit(out: THREE.Vector3): boolean {
    const g = this.park?.ground;
    if (g && g.raycast(this.raycaster.ray, out)) return true;
    return !!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
  }

  private allPlaces(): PlaceDef[] {
    const base = this.park?.places ?? [];
    return this.wizards.length ? [...base, ...this.wizards.map((w) => w.place)] : base;
  }

  /**
   * Put today's wizards in the park. Spots are picked beside the paths (away from buildings and
   * each other) from `seed`, so they move every day but stay put all day. Returns where they went.
   */
  setWizards(list: { id: string; name: string; robe: string; hat: string; orb?: string; hasLesson: boolean }[], seed: number): { id: string; x: number; z: number }[] {
    for (const w of this.wizards) {
      this.scene.remove(w.model.root, w.sign);
      if (w.star) this.scene.remove(w.star);
      w.model.dispose();
      w.sign.material.map?.dispose();
      w.sign.material.dispose();
      if (w.star) {
        w.star.material.map?.dispose();
        w.star.material.dispose();
      }
      if (this.park) this.park.tappables = this.park.tappables.filter((o) => !(o.userData.placeId as string | undefined)?.startsWith("wizard:"));
    }
    this.wizards = [];
    if (!this.park) return [];
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // the wizards live up on the floating mountains — a different set of mountains each day
    const islands = [...SKY_ISLANDS];
    for (let i = islands.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [islands[i], islands[j]] = [islands[j], islands[i]];
    }
    const out: { id: string; x: number; z: number }[] = [];
    const park = this.park;
    list.forEach((w, wi) => {
      const isl = islands[wi % islands.length];
      // a clear patch of grass on its top: not on the chest, the landing spot, a tree or the peak
      let x = isl.landing.x;
      let z = isl.landing.z;
      for (let tries = 0; tries < 80; tries++) {
        const a = rnd() * Math.PI * 2;
        const d = isl.r * (0.25 + rnd() * 0.45);
        const tx = isl.x + Math.sin(a) * d;
        const tz = isl.z + Math.cos(a) * d;
        if (!skyTopY(tx, tz, 0)) continue;
        if (Math.hypot(tx - isl.treasure.x, tz - isl.treasure.z) < 5 || Math.hypot(tx - isl.landing.x, tz - isl.landing.z) < 3.5) continue;
        if (SKY_OBSTACLES.some((o) => o.id === isl.id && Math.hypot(tx - o.x, tz - o.z) < o.r + 1.8)) continue;
        // not standing in the spring's stream as it runs off the edge
        const end = skyStreamEnd(isl);
        const sx = end.x - isl.spring.x;
        const sz = end.z - isl.spring.z;
        const k = Math.max(0, Math.min(1, ((tx - isl.spring.x) * sx + (tz - isl.spring.z) * sz) / (sx * sx + sz * sz || 1)));
        if (Math.hypot(tx - isl.spring.x - sx * k, tz - isl.spring.z - sz * k) < 3.5) continue;
        x = tx;
        z = tz;
        break;
      }
      const model = buildWizardModel({ robe: w.robe, hat: w.hat, orb: w.orb });
      const gy = skyTopY(x, z, this.time)?.y ?? groundY(x, z);
      model.root.position.set(x, gy, z);
      model.root.traverse((o) => (o.userData.placeId = `wizard:${w.id}`));
      this.scene.add(model.root);
      park.tappables.push(model.root);
      const sign = nameTag(`🧙 ${w.name}`, w.robe);
      sign.position.set(x, gy + 4.9, z);
      this.scene.add(sign);
      let star: THREE.Sprite | null = null;
      if (w.hasLesson) {
        star = emojiSprite("✨", 1.3);
        star.position.set(x, gy + 6.1, z);
        this.scene.add(star);
      }
      const place: PlaceDef = { id: `wizard:${w.id}`, label: w.name, emoji: "🧙", land: "plaza", x, z, radius: 1.1, doorRadius: 3.4, action: "wizard", signY: 0, models: [] };
      this.wizards.push({ model, place, sign, star, island: isl.id });
      out.push({ id: w.id, x, z });
    });
    return out;
  }

  /** Show or hide the ✨ over a wizard (✨ = today's lesson not learned yet). */
  setWizardSparkle(id: string, on: boolean) {
    const w = this.wizards.find((x) => x.place.id === `wizard:${id}`);
    if (!w) return;
    if (!on && w.star) {
      this.scene.remove(w.star);
      w.star.material.map?.dispose();
      w.star.material.dispose();
      w.star = null;
    }
  }

  private foundSpot(sp: SkySpot) {
    if (this.spotsFound.has(sp.id)) return;
    this.spotsFound.add(sp.id);
    this.park?.skyChests.setSpotsFound([...this.spotsFound]);
    if (sp.kind !== "launcher" && this.kid) {
      this.burst(this.kid.root.position.clone().setY(this.kid.root.position.y + 1.4), 45);
      this.play(this.kid, "cheer", true);
    }
    this.opts.onSkySpot?.(sp);
  }

  /**
   * Keep the park playable on slower tablets: if frames average slower than ~24 fps for 3 s,
   * step down — fewer pixels first, then no shadows, then no glow. (Never steps back up in a
   * session, so it can't flicker between settings.)
   */
  private governFrameRate(raw: number) {
    if (this.opts.adaptiveQuality === false) return;
    if (raw <= 0 || raw > 0.5) return; // a paused tab or a hitch while loading, not a slow device
    this.frameAvg += (raw - this.frameAvg) * 0.05;
    this.sinceStep += raw;
    if (this.sinceStep < 4 || this.qualityStep >= 3) return;
    this.slowFor = this.frameAvg > 1 / 24 ? this.slowFor + raw : 0;
    if (this.slowFor < 3) return;
    this.qualityStep++;
    this.slowFor = 0;
    this.sinceStep = 0;
    if (this.qualityStep === 1) {
      this.renderer.setPixelRatio(this.renderer.getPixelRatio() * 0.78);
      this.resize();
    } else if (this.qualityStep === 2) {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    } else if (this.bloom) this.bloom.enabled = false;
    console.info(`[park] slow frames (${Math.round(1 / this.frameAvg)} fps): quality step ${this.qualityStep}`);
  }

  /** Which floating-mountain discoveries this kid has already made. */
  setSkySpotsFound(ids: string[]) {
    this.spotsFound = new Set(ids);
    this.park?.skyChests.setSpotsFound(ids);
  }

  /** can the boat / sub we're driving move from `pos` to (x, z)? */
  /** everything afloat near a boat at pos: the rides' boats and sea friends, and the big sea creatures at the surface */
  private afloatNear(pos: THREE.Vector3): readonly SeaBody[] {
    const out = this.afloat;
    out.length = 0;
    if (this.park) for (const b of this.park.rides.seaBodies()) out.push(b);
    if (this.park) for (const b of this.park.fishingBoats.seaBodies()) out.push(b);
    let n = 0;
    forEachBigSea((b) => {
      // (a whale or an orca with its back up near the surface)
      if (Math.abs(b.x - pos.x) > 80 || Math.abs(b.z - pos.z) > 80 || b.y + b.len * 0.09 < WATER_Y - 2.4) return;
      const s = this.afloatBig[n] ?? (this.afloatBig[n] = { x: 0, z: 0, r: 0, hl: 0, yaw: 0 });
      n++;
      s.x = b.x;
      s.z = b.z;
      s.r = Math.max(0.8, b.len * 0.1);
      s.hl = b.len * 0.36;
      s.yaw = b.yaw;
      out.push(s);
    });
    return out;
  }

  private craftOk(kind: MountKind, pos: THREE.Vector3, x: number, z: number): boolean {
    const yaw = this.kid?.root.rotation.y ?? 0;
    return isBoat(kind) ? boatCanMove(kind, pos.x, pos.z, x, z, yaw, seaDepth) : isSub(kind) ? subCanMove(kind, pos.y, x, z, worldFloor) : true;
  }

  /** A ride waiting close by (for the HUD's "Hop on" button), or null. */
  /** where the rides kids can find are (dragons, manta reefs, docks, unicorn glades), for the map */
  get ridePins(): RidePin[] {
    return this.park ? this.park.rides.pins() : [];
  }

  /** the dragons this kid has already made friends with (saved per kid by the app) */
  setBondedDragons(ids: string[]) {
    this.bondedDragons = new Set(ids);
    this.bondSync = true;
  }

  /** On a dragon: "roll" = a barrel roll, "fire" = a puff of sparkly (harmless) fire. */
  dragonTrick(k: "roll" | "fire"): boolean {
    if (this.mount?.kind !== "dragon" || this.alt < 1) return false;
    return this.dragonFlight().trick(k);
  }

  private dragonFlight(): DragonFlight {
    if (!this.dragonFx) this.dragonFx = createDragonFlight(this.scene, { lowQuality: this.opts.quality === "low" });
    return this.dragonFx;
  }

  /** `h` where it is now, if it's still free to climb on and within `r` of the kid, else null */
  private rideStill(h: HopNear, r: number): HopNear | null {
    const p = this.park?.rides.peek(h.id);
    const kp = this.kid?.root.position;
    if (!p || !kp || (p.state !== "idle" && p.state !== "waiting")) return null;
    if (Math.hypot(p.x - kp.x, p.z - kp.z) > r || Math.abs(p.y - kp.y) > 4.5) return null;
    return { ...h, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  }

  get hopTarget(): { kind: MountKind; label: string } | null {
    return this.hopNear ? { kind: this.hopNear.kind, label: this.hopNear.label } : null;
  }

  /** Hop onto the ride that's close by (bikes, cars, unicorns, dragons, mantas, whales, dolphins). */
  hopOn(accent?: string, skin?: MountSkin): MountKind | null {
    if (!this.park || !this.kid || this.mount || this.sky || this.ride) return null;
    // (the ride the button showed, if the nearest one has just changed under the kid's thumb)
    const n = this.hopNear ?? (this.time - this.hopLastT < 2.5 && this.hopLast ? this.rideStill(this.hopLast, 7) : null);
    if (!n) return null;
    this.hopStyle = { accent, skin };
    // a dragon the kid hasn't met: hold out a hand; it sniffs, nuzzles, and you're friends (then
    // the kid climbs on)
    if (n.kind === "dragon" && !this.bondedDragons.has(n.id)) {
      if (!this.park.rides.bond(n.id)) {
        this.opts.onRideHint?.(`\u{1F409} ${DRAGON_BREEDS[n.breed ?? "roostwarden"].name} is busy right now. Try again in a moment!`);
        return null;
      }
      this.bondRide = { ...n };
      const kp = this.kid.root.position;
      this.kid.facing = Math.atan2(n.x - kp.x, n.z - kp.z);
      this.kid.root.rotation.y = this.kid.facing;
      this.kid.rig?.play("wave", true);
      this.walkTarget = null;
      this.walkQueue = [];
      this.opts.onRideHint?.(`\u{1F91A} Hold out your hand and stay still... ${DRAGON_BREEDS[n.breed ?? "roostwarden"].name} is a little shy`);
      this.hopNear = null;
      return null;
    }
    this.park.rides.take(n.id);
    // climb aboard where it is, facing the way it faces (a boat stays at its mooring; the kid
    // steps off the jetty onto it)
    const kp = this.kid.root.position;
    kp.set(n.x, isCraft(n.kind) ? n.y : kp.y, n.z);
    this.kid.facing = n.yaw;
    this.kid.root.rotation.y = n.yaw;
    this.prevFacing = n.yaw;
    this.mountUp(n.kind, accent, skin, n.breed);
    if (isSub(n.kind)) this.alt = this.altTarget = this.prevAlt = Math.min(SUB_CAPS[n.kind].surf, n.y - WATER_Y);
    this.helm.speed = this.craftSpeed = 0;
    this.helm.reverse = false;
    this.craftPitch = this.craftRoll = 0;
    this.rideId = n.id;
    this.hopNear = null;
    return n.kind;
  }

  /** Which floating mountains' chests this kid has opened (they stay open). */
  setSkyTreasuresOpened(ids: string[]) {
    this.skyOpened = new Set(ids);
    this.park?.skyChests.setOpened(ids);
  }

  /** Flying over a floating mountain's top? Its name (the HUD offers "Land on …"). */
  get skyLandable(): string | null {
    const p = this.kid?.root.position;
    if (!p || !this.mount?.flies || this.landing) return null;
    const s = skyTopY(p.x, p.z, this.time);
    return s && p.y > s.y + 0.8 ? (skyIslandById(s.id)?.name ?? null) : null;
  }

  /** Standing on a floating mountain? Its name. */
  get onSkyIslandName(): string | null {
    return this.onSky ? (skyIslandById(this.onSky)?.name ?? null) : null;
  }

  // ── Frostpeak's Penguin Ski Run ──

  /** By the start hut? (the HUD offers "⛷️ Ski!") */
  get skiOffer(): boolean {
    return this.skiNear && !this.skiLock;
  }
  /** By the chairlift's boarding line? (the HUD offers "🚡 Chairlift") */
  get liftOffer(): boolean {
    return this.liftNear && !this.skiLock;
  }
  /** On skis or on the chairlift right now? (the HUD keeps only the joystick) */
  get skiing(): boolean {
    return this.skiLock;
  }

  /** Grab skis at the start hut and glide onto the start line (off when the top's clear). */
  startSki(): boolean {
    const kid = this.kid;
    if (!this.park || !kid || this.skiLock || this.slide || this.ride || this.mount || !this.skiNear) return false;
    this.ski = makeKidSki();
    this.skiFrom.copy(kid.root.position);
    this.walkTarget = null;
    this.walkQueue = [];
    kid.rig?.setSwim(false, false);
    kid.rig?.setStance("ski");
    if (!this.skiGear) this.skiGear = buildKidSkis();
    kid.root.add(this.skiGear);
    this.opts.onSki?.("start");
    return true;
  }

  private tickSki(dt: number, kid: Actor) {
    const k = this.ski!;
    const fr = this.park!.frost;
    // (the joystick's sideways push: the camera chases from behind, screen-right = the kid's right)
    const mag = Math.hypot(this.move.x, this.move.y);
    const steer = this.inputOn && mag > 0.12 ? -Math.max(-1, Math.min(1, this.move.x)) : 0;
    stepKidSki(k, dt, steer, fr.ski.topClear(), fr.ski.aheadOf(k.s));
    const pos = kid.root.position;
    if (k.phase === "start") {
      // gliding from the hut onto the start line
      const u = Math.min(1, k.t / 0.8);
      pos.lerpVectors(this.skiFrom, this.skiCamTmp.set(k.x, k.y, k.z), u * u * (3 - 2 * u));
    } else pos.set(k.x, k.y, k.z);
    kid.facing = k.yaw;
    kid.root.rotation.y = k.yaw;
    if (kid.rig) {
      kid.rig.root.rotation.set(0, 0, -k.roll);
      kid.rig.root.position.set(0, 0.06, 0);
    }
    this.tickActor(kid, dt, 0, false);
    if (k.spray) {
      // a fan of snow off the outside ski
      const side = k.turnSign || 1;
      fr.slide.fx(pos.x - Math.cos(k.yaw) * side * 0.5 - k.dx * 0.4, pos.y + 0.1, pos.z + Math.sin(k.yaw) * side * 0.5 - k.dz * 0.4, 1.3 + k.v * 0.15, 4);
    }
    if (k.gate) this.opts.onSki?.("gate", k.gates, FROST_SKI.gates.length);
    if (k.finish) {
      fr.slide.fx(pos.x, pos.y + 0.1, pos.z, 2, 4);
      this.burst(pos.clone().setY(pos.y + 1.6), 60);
      this.opts.onSki?.("finish", k.gates, FROST_SKI.gates.length);
      this.endSki();
      this.play(kid, "cheer", true);
    }
  }

  /** Skis off (at the bottom, or if anything else takes over). */
  endSki() {
    if (!this.ski) return;
    this.ski = null;
    this.park?.frost.ski.kidOnPiste(-99);
    const kid = this.kid;
    if (!kid) return;
    if (this.skiGear) kid.root.remove(this.skiGear);
    kid.rig?.setStance(null);
    if (kid.rig) {
      kid.rig.root.rotation.set(0, 0, 0);
      kid.rig.root.position.set(0, 0, 0);
    }
    const p = kid.root.position;
    p.y = worldFloor(p.x, p.z);
  }

  /** Step onto the chairlift's boarding line: the next chair scoops you up, you hop off at the top. */
  rideLift(): boolean {
    const kid = this.kid;
    if (!this.park || !kid || this.skiLock || this.slide || this.ride || this.mount || !this.liftNear) return false;
    if (!this.park.frost.ski.rideLift(kid.root.position.x, kid.root.position.z)) return false;
    this.lifting = true;
    this.walkTarget = null;
    this.walkQueue = [];
    this.opts.onSki?.("lift");
    return true;
  }

  private tickLift(dt: number, kid: Actor) {
    const fr = this.park!.frost;
    const L = fr.ski.lift();
    const pos = kid.root.position;
    pos.set(L.x, L.y, L.z);
    kid.facing = L.yaw;
    kid.root.rotation.y = L.yaw;
    const sit = L.state === KL_RIDE;
    kid.rig?.setStance(sit ? "sit" : null);
    if (kid.rig) kid.rig.root.position.set(0, sit ? -KID_SEAT_DROP : 0, sit ? 0.12 : 0);
    this.tickActor(kid, dt, L.state === KL_WAIT && L.t < 0.6 ? 1.2 : 0, false);
    if (L.state === KL_DONE) this.endLift(true);
  }

  /** Off the chairlift (hopped off at the top, or called off). */
  endLift(top = false) {
    if (!this.lifting) return;
    this.lifting = false;
    this.park?.frost.ski.liftDone();
    const kid = this.kid;
    if (!kid) return;
    kid.rig?.setStance(null);
    kid.rig?.root.position.set(0, 0, 0);
    const p = kid.root.position;
    p.y = worldFloor(p.x, p.z);
    if (top) {
      this.play(kid, "cheer", true);
      this.opts.onSki?.("top");
    }
  }

  /** the pet's slide is over (in the sea after the kid): back on its feet / paddling */
  private endPetSlide() {
    this.petSlide = null;
    const pet = this.pet;
    if (pet?.rig) {
      pet.rig.setSlide(false);
      pet.rig.root.rotation.set(0, 0, 0);
      pet.rig.root.position.set(0, 0, 0);
    }
  }

  // ── Frostpeak's penguin slides ──

  /** Standing at a penguin slide's start arch? Its name (the HUD offers "🐧 Slide!"). */
  get slideOffer(): string | null {
    return this.slideNear >= 0 && !this.slide ? slideName(this.slideNear) : null;
  }
  /** Tobogganing down a penguin slide right now? (the HUD keeps only the joystick) */
  get sliding(): boolean {
    return !!this.slide;
  }

  /** Flop onto your tummy at the slide's start and toboggan down it (waiting for the penguin ahead first). */
  startSlide(): boolean {
    const kid = this.kid;
    if (!this.park || !kid || this.slide || this.ride || this.slideNear < 0) return false;
    const c = this.slideNear;
    const p = kid.root.position;
    this.slide = makeKidSlide(c, p.x, p.z);
    this.slideFlop = 0;
    this.slideWaitSaid = false;
    this.walkTarget = null;
    this.walkQueue = [];
    this.swimVX = this.swimVZ = 0;
    // how far in front of its feet the kid's tummy (or snout) reaches: lying down, that's under them
    if (kid.rig) {
      const r = kid.rig.root;
      const yaw0 = kid.root.rotation.y;
      kid.root.rotation.y = 0;
      r.rotation.set(0, 0, 0);
      r.position.set(0, 0, 0);
      kid.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(r);
      kid.root.rotation.y = yaw0;
      if (Number.isFinite(box.max.z)) this.slideDepth = Math.max(0.25, Math.min(1.2, box.max.z - p.z));
      kid.rig.setSwim(false, false);
      kid.rig.setSlide(true);
    }
    this.swimPitch = 0;
    this.park.frost.slide.hold(c);
    this.opts.onSlide?.("start", slideName(c));
    return true;
  }

  private tickSlide(dt: number, kid: Actor) {
    const k = this.slide!;
    const frost = this.park!.frost.slide;
    // the joystick's sideways push (the camera chases from behind: screen-right = the kid's right)
    const mag = Math.hypot(this.move.x, this.move.y);
    const steer = this.inputOn && mag > 0.12 ? -Math.max(-1, Math.min(1, this.move.x)) : 0;
    const wasWaiting = k.waiting;
    stepKidSlide(k, dt, steer, frost.clear(k.chute), frost.ahead(k.chute, k.s));
    if (k.waiting && k.t > 1.2 && !this.slideWaitSaid) {
      this.slideWaitSaid = true;
      this.opts.onSlide?.("wait", slideName(k.chute));
    }
    const pos = kid.root.position;
    pos.set(k.x, k.y, k.z);
    kid.facing = k.yaw;
    kid.root.rotation.y = k.yaw;
    // the flop: tip forward onto the tummy, lying along the slope, leaning into the bends
    this.slideFlop = Math.min(1, this.slideFlop + dt * 3.2);
    const w = this.slideFlop * this.slideFlop * (3 - 2 * this.slideFlop);
    if (kid.rig) {
      const r = kid.rig.root;
      const half = 1.0;
      const ca = Math.cos(k.pitch);
      const sa = Math.sin(k.pitch);
      r.rotation.order = "XYZ";
      r.rotation.set((Math.PI / 2 + k.pitch) * w, k.lean * w, 0);
      // (its middle on the chute's floor: feet back up the slope, tummy resting on the ice)
      r.position.set(0, (half * sa + this.slideDepth / Math.max(0.5, ca) + Math.abs(k.lean) * 0.2) * w, -half * ca * w);
    }
    this.tickActor(kid, dt, 0, false);
    // snow off the sides, a bump on the wall, the big SPLASH
    if (k.puff || k.bump) frost.fx(pos.x - k.dx * 1.2 + k.dz * (Math.random() - 0.5), pos.y + 0.15, pos.z - k.dz * 1.2 - k.dx * (Math.random() - 0.5), k.bump ? 0.7 : 0.45 + k.v * 0.03, 2);
    if (wasWaiting && !k.waiting) frost.fx(pos.x, pos.y + 0.15, pos.z, 0.7, 2);
    if (k.splash) {
      // a big crown of spray (and a ring of little ones round it)
      frost.fx(pos.x, WATER_Y, pos.z, 2.2, 0);
      for (let i = 0; i < 4; i++) frost.fx(pos.x + Math.sin(k.yaw + i * 1.6) * 1.1, WATER_Y, pos.z + Math.cos(k.yaw + i * 1.6) * 1.1, 1, 1);
      this.burst(pos.clone().setY(WATER_Y + 1.2), 70);
      this.play(kid, "cheer", true);
      this.opts.onSlide?.("splash", slideName(k.chute));
    }
    if (k.done) this.endSlide(true);
  }

  /** Off the slide: in the sea (swimming on with your speed) after a splash, else back on your feet. */
  private endSlide(splashed: boolean) {
    const k = this.slide;
    if (!k) return;
    this.slide = null;
    this.walkTarget = null;
    this.walkQueue = [];
    this.park?.frost.slide.hold(-1);
    if (splashed && this.pet && this.petMode === "follow") {
      // (the pet is a few metres behind: it carries on down the chute and splashes in after the kid)
      const q = makeKidSlide(k.chute, this.petSlideOut.x, this.petSlideOut.z);
      q.s = this.petSlideS;
      q.lat = k.lat * 0.6;
      q.v = Math.max(3, k.v);
      q.waiting = false;
      this.petSlide = q;
    } else this.endPetSlide();
    const kid = this.kid;
    if (!kid) return;
    if (kid.rig) {
      kid.rig.root.rotation.set(0, 0, 0);
      kid.rig.root.position.set(0, 0, 0);
      kid.rig.setSlide(false);
    }
    const p = kid.root.position;
    if (splashed) {
      // glide on as a swimmer, at the depth the chute left you
      this.swimVX = k.dx * Math.min(6, k.v + 2);
      this.swimVZ = k.dz * Math.min(6, k.v + 2);
      const maxD = Math.max(0, seaDepth(p.x, p.z) - 1.1);
      this.swimDepth = this.swimTarget = Math.max(0, Math.min(maxD, WATER_Y - 0.95 - k.y));
    } else {
      p.y = worldFloor(p.x, p.z);
    }
    const blob = kid.root.children[1];
    if (blob) blob.visible = true;
  }

  /** Board the Sky Coaster at its station for one full lap round the island. */
  rideSkyCoaster(): boolean {
    if (!this.park || !this.kid || this.ride || this.sky || this.building) return false;
    this.endSlide(false);
    this.endSki();
    this.endLift();
    this.dismount(true);
    const st = this.park.skyTrain;
    st.held = true;
    st.u = st.stationU;
    this.sky = { v: 7, dist: 0, cheered: false };
    this.walkTarget = null;
    this.walkQueue = [];
    this.burst(this.kid.root.position.clone().setY(this.kid.root.position.y + 1.4), 40);
    this.opts.onSkyCoaster?.(true);
    return true;
  }

  /** Hop on the Grand Carousel: onto the nearest animal, for a few turns. */
  rideCarousel(): boolean {
    if (!this.park || !this.kid || this.ride || this.sky || this.building || this.climb) return false;
    this.endSlide(false);
    this.endSki();
    this.endLift();
    this.dismount(true);
    const c = this.park.carousel;
    const p = this.kid.root.position;
    this.sky = { v: 0, dist: 0, cheered: false, carousel: { seat: c.nearestSeat(p.x, p.z), from: c.spin } };
    c.setRiding(true);
    this.kid.root.visible = false; // (a first-person ride: see the camera)
    this.walkTarget = null;
    this.walkQueue = [];
    this.burst(p.clone().setY(p.y + 1.6), 40);
    this.opts.onCarousel?.(true);
    return true;
  }
  /** Step off the carousel (the ride's over, or the kid asked to get off). */
  leaveCarousel(): boolean {
    if (!this.park || !this.kid || !this.sky?.carousel) return false;
    const c = this.park.carousel;
    c.setRiding(false);
    // down beside the deck, straight out from the animal they were on
    const P = c.riderPose(this.sky.carousel.seat, this.carouselPose);
    const dx = P.x - CAROUSEL.x;
    const dz = P.z - CAROUSEL.z;
    const l = Math.hypot(dx, dz) || 1;
    const r = CAROUSEL.deckR + 2.6;
    this.sky = null;
    this.kid.root.visible = true;
    const kp = this.kid.root.position;
    kp.set(CAROUSEL.x + (dx / l) * r, 0, CAROUSEL.z + (dz / l) * r);
    kp.y = groundY(kp.x, kp.z);
    this.kid.facing = Math.atan2(-dx, -dz);
    if (this.pet) this.pet.root.position.set(kp.x + 1.2, groundY(kp.x + 1.2, kp.z + 1), kp.z + 1);
    this.burst(kp.clone().setY(kp.y + 1.2), 30);
    this.opts.onCarousel?.(false);
    return true;
  }
  /** on the carousel right now (the HUD hides the joystick and offers "Hop off") */
  get onCarousel(): boolean {
    return !!this.sky?.carousel;
  }

  // ── the Wildlands Railway ──
  private _tan = new THREE.Vector3();
  private trainTan(): THREE.Vector3 {
    const P = this.trainPose;
    this.park!.railway.carPose(0, P);
    const x0 = P.x;
    const y0 = P.y;
    const z0 = P.z;
    this.park!.railway.carPose(1, P);
    return this._tan.set(x0 - P.x, y0 - P.y, z0 - P.z).normalize();
  }
  /** On a station's platform, on foot: the station (the HUD offers "Ride the train"), and whether
   *  the train's already been called */
  get railOffer(): { name: string; emoji: string; waiting: boolean } | null {
    if (!this.park || !this.kid || this.sky || this.mount || this.ride || this.building) return null;
    const p = this.kid.root.position;
    const st = stationAt(p.x, p.z, 1.5);
    return st ? { name: st.name, emoji: st.emoji, waiting: this.trainWait === st } : null;
  }
  /** Standing at a settlement's activity spot, on foot (the HUD offers e.g. "Go fishing"); null off
   *  foot (riding, flying, on the train...) or nowhere near one. */
  get activityOffer(): { settlement: string; id: string; label: string; emoji: string } | null {
    if (!this.park || !this.kid || this.sky || this.mount || this.ride || this.building) return null;
    return this.park.activityOffer;
  }
  /** Standing by a Natural Wonder's wooden info sign, on foot (the HUD offers "📖 Read the sign") */
  get signOffer(): { wonder: string; realPlace: string; emoji: string; fact: string } | null {
    if (!this.kid || this.sky || this.mount || this.ride || this.building) return null;
    const p = this.kid.root.position;
    const s = wonderSignAt(p.x, p.z, 6);
    return s ? { wonder: s.wonder.name, realPlace: s.wonder.realPlace, emoji: s.wonder.emoji, fact: s.fact } : null;
  }
  /** Is it night in the park right now (the twilight glow is up)? For 2D overlays that draw the
   *  same time of day as the 3D world (e.g. the fishing pier at night). */
  get isNight(): boolean {
    return (this.park?.atmosphere.glow ?? 0) > 0.5;
  }
  /** On the train, standing at a station: where (the HUD offers "Get off here") */
  get railStop(): { name: string; emoji: string } | null {
    if (!this.park || !this.sky?.train) return null;
    const at = this.park.railway.train.at;
    return at ? { name: at.name, emoji: at.emoji } : null;
  }
  /** riding the railway right now (the HUD hides the joystick) */
  get onTrain(): boolean {
    return !!this.sky?.train;
  }
  /** Call the train to the platform the kid's standing on; they get on when it comes in. */
  boardTrain(): boolean {
    if (!this.park || !this.kid || this.sky || this.ride || this.building) return false;
    const p = this.kid.root.position;
    const st = stationAt(p.x, p.z, 1.5);
    if (!st) return false;
    this.dismount(true);
    this.trainWait = st;
    this.park.railway.call(st);
    return true;
  }
  /** Get off at the station the train's standing at (onto its platform). */
  leaveTrain(): boolean {
    if (!this.park || !this.kid || !this.sky?.train) return false;
    const st = this.park.railway.train.at;
    if (!st) return false;
    this.sky = null;
    const kp = this.kid.root.position;
    kp.set(st.x, 0, st.z);
    kp.y = groundY(kp.x, kp.z);
    if (this.pet) this.pet.root.position.set(kp.x + 1.2, groundY(kp.x + 1.2, kp.z + 1), kp.z + 1);
    this.burst(kp.clone().setY(kp.y + 1.2), 30);
    return true;
  }

  // ── a guided route climb (Climb Everest!, Climb to the crater!): on the real ground
  // (registry/climbRoutes.ts), the same way the train walks the real rails — no separate scene. The
  // HUD offers it via the existing settlement activityOffer (each route's own trailhead activity
  // spot); boarding/leaving/progress are these few calls, generic over whichever route id is passed
  // to boardClimb(). ──
  /** Climbing right now (any phase) — the HUD hides the joystick, same as onTrain. */
  get onClimb(): boolean {
    return !!this.climb;
  }
  /** "climbing" under way, "summit" during the celebration (the HUD offers to head back down),
   *  "flyDown" during the swoop/hop back; null the rest of the time. */
  get climbPhase(): "climbing" | "summit" | "flyDown" | null {
    return this.climb?.phase ?? null;
  }
  /** which route is under way right now (registry/climbRoutes.ts's id), or null */
  get climbRouteId(): string | null {
    return this.climb?.route.id ?? null;
  }
  /** Set off up a guided route from its own trailhead (routeId: registry/climbRoutes.ts, e.g.
   *  "everest" or "paricutin"). */
  boardClimb(routeId: string): boolean {
    if (!this.kid || this.sky || this.mount || this.ride || this.building || this.climb) return false;
    const route = climbRouteById(routeId);
    if (!route) return false;
    this.dismount(true);
    const start = route.pointAtU(0);
    const kp = this.kid.root.position;
    kp.set(start.x, worldFloor(start.x, start.z), start.z);
    this.kid.facing = route.headingAtU(0);
    this.kid.root.rotation.y = this.kid.facing;
    const guide = buildChibi(route.guideAnimal, { height: route.guideHeight, role: "kid", accent: route.guideAccent });
    this.scene.add(guide.root);
    this.climb = { route, u: 0, targetU: 0, phase: "climbing", timer: 0, guide };
    this.climbSnow = this.buildClimbSnow(route.ambientColor);
    return true;
  }
  /** Leave the climb early (the kid tapped the exit before the top) — a safe, immediate return to
   *  the route's own trailhead. */
  leaveClimb(): boolean {
    if (!this.climb) return false;
    this.endClimb(true);
    return true;
  }
  /** The HUD calls this after every progress-making tap with the climb's own 0..1 overall progress
   *  — the route eases towards it rather than jumping, so one tap reads as a few real steps up. */
  setClimbProgress(u: number) {
    if (this.climb) this.climb.targetU = Math.max(0, Math.min(1, u));
  }
  /** The HUD's "head back down" tap (once the top's celebration has run) — starts the swoop/hop
   *  back to the trailhead; the climb ends itself (onClimb -> false) the moment it lands. */
  startClimbFlyDown(): boolean {
    if (!this.climb || this.climb.phase === "flyDown") return false;
    this.climb.phase = "flyDown";
    this.climb.timer = 0;
    return true;
  }
  private buildClimbSnow(color: string): THREE.Points {
    const N = 90;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 22, Math.random() * 12, (Math.random() - 0.5) * 22], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.3, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    this.scene.add(pts);
    return pts;
  }
  private disposeClimbSnow() {
    if (!this.climbSnow) return;
    this.scene.remove(this.climbSnow);
    this.climbSnow.geometry.dispose();
    (this.climbSnow.material as THREE.Material).dispose();
    this.climbSnow = null;
  }
  private endClimb(returnToStart: boolean) {
    if (!this.climb) return;
    const start = this.climb.route.start;
    this.climb.guide?.dispose();
    this.disposeClimbSnow();
    this.climb = null;
    if (returnToStart && this.kid) {
      const kp = this.kid.root.position;
      kp.set(start.x, worldFloor(start.x, start.z), start.z);
      this.kid.root.rotation.y = this.kid.facing;
    }
  }
  private tickClimb(dt: number, kid: Actor) {
    const c = this.climb;
    if (!c) return;
    const route = c.route;
    c.timer += dt;
    if (c.phase === "climbing") {
      c.u += (c.targetU - c.u) * Math.min(1, dt * 2.2);
      const p = route.pointAtU(c.u);
      const y = worldFloor(p.x, p.z);
      kid.root.position.set(p.x, y, p.z);
      kid.facing = route.headingAtU(c.u);
      kid.root.rotation.y = kid.facing;
      if (c.guide) {
        const gu = Math.min(1, c.u + 0.02);
        const gp = route.pointAtU(gu);
        c.guide.root.position.set(gp.x, worldFloor(gp.x, gp.z), gp.z);
        c.guide.root.rotation.y = route.headingAtU(gu);
        c.guide.update(dt, 2.2);
      }
      if (this.climbSnow) {
        const aboveAmbientLine = y > route.ambientAbove;
        this.climbSnow.visible = aboveAmbientLine;
        if (aboveAmbientLine) {
          this.climbSnow.position.set(p.x, y, p.z);
          const attr = this.climbSnow.geometry.getAttribute("position") as THREE.BufferAttribute;
          const arr = attr.array as Float32Array;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] -= dt * 2.2;
            arr[i] += Math.sin(this.time * 2 + i) * dt * 0.6;
            if (arr[i + 1] < -2) arr[i + 1] = 10 + Math.random() * 4;
          }
          attr.needsUpdate = true;
        }
      }
      if (c.u >= 0.999 && c.targetU >= 0.999) {
        c.phase = "summit";
        c.timer = 0;
        this.burst(kid.root.position.clone().setY(kid.root.position.y + 1.6), 50);
        this.play(kid, "cheer", true);
      }
    } else if (c.phase === "summit") {
      // (the floor the kid really stands on — a modelled surface like the canyon's, not the height
      // field sunk out of sight beneath it)
      const top = route.pointAtU(1);
      const y = worldFloor(top.x, top.z);
      kid.root.position.set(top.x, y, top.z);
      if (this.climbSnow) {
        this.climbSnow.visible = true;
        this.climbSnow.position.set(top.x, y, top.z);
      }
    } else {
      // flyDown: a quick swoop/hop straight back to the trailhead
      const t = Math.min(1, c.timer / route.descendSeconds);
      const from = route.pointAtU(1);
      const to = route.pointAtU(0);
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      // an arc between the two ends' own heights that always clears whatever stands between them
      // (the way back up out of the canyon crosses its cliffs)
      const y0 = worldFloor(from.x, from.z);
      const y1 = worldFloor(to.x, to.z);
      const y = Math.max(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * route.descendArc, worldFloor(x, z) + 1.5 * Math.sin(t * Math.PI));
      kid.root.position.set(x, y, z);
      if (c.guide) c.guide.root.position.set(x + 2, Math.max(y, worldFloor(x + 2, z + 1)), z + 1);
      if (this.climbSnow) this.climbSnow.visible = false;
      if (t >= 1) this.endClimb(false); // the lerp already lands exactly at the trailhead
    }
  }

  /** Riding the coaster right now? (the HUD hides the joystick) */
  get onSkyCoaster(): boolean {
    return !!this.sky;
  }

  private tickSky(dt: number, kid: Actor) {
    const s = this.sky!;
    if (s.carousel) {
      // up on a galloper: round with the deck, rising and falling with the animal; the pet rides
      // the one in front
      const c = this.park!.carousel;
      const P = c.riderPose(s.carousel.seat, this.carouselPose);
      kid.root.position.set(P.x, P.y, P.z);
      kid.facing = P.yaw;
      kid.root.rotation.y = P.yaw;
      if (this.pet) {
        const Q = c.riderPose((s.carousel.seat + 1) % 10, this.carouselPose); // (the one in front, where the kid can see it)
        this.pet.root.position.set(Q.x, Q.y, Q.z);
        this.pet.root.rotation.y = Q.yaw;
      }
      const turned = c.spin - s.carousel.from;
      if (!s.cheered && turned > Math.PI) {
        s.cheered = true;
        this.play(kid, "cheer", true);
        if (this.pet) this.play(this.pet, "cheer", true);
      }
      if (turned >= CAROUSEL_RIDE_TURNS * Math.PI * 2) this.leaveCarousel();
      return;
    }
    if (s.train) {
      // in the first carriage, behind the engine (the train drives itself: ../world/railway)
      const P = this.trainPose;
      this.park!.railway.carPose(1, P);
      kid.root.position.set(P.x, P.y + 0.4, P.z);
      kid.facing = P.yaw;
      kid.root.rotation.y = P.yaw;
      return;
    }
    const st = this.park!.skyTrain;
    const tan = st.loop.getTangentAt(st.u);
    // gravity: slow up the climbs, whoosh down the drops (a chain lift keeps it moving)
    s.v = Math.max(7, Math.min(30, s.v - tan.y * 20 * dt));
    st.u = (st.u + (s.v * dt) / st.len) % 1;
    s.dist += s.v * dt;
    // ride in the first open carriage, just behind the engine
    const p = st.loop.getPointAt((st.u - (RIDE_CAR * CAR_GAP) / st.len + 1) % 1);
    kid.root.position.set(p.x, p.y + 0.75, p.z);
    kid.facing = Math.atan2(tan.x, tan.z);
    kid.root.rotation.y = kid.facing;
    if (tan.y < -0.3 && !s.cheered) {
      s.cheered = true;
      this.play(kid, "cheer", true);
      if (this.pet) this.play(this.pet, "cheer", true);
    }
    if (tan.y > 0.05) s.cheered = false;
    if (s.dist >= st.len - 1) this.endSky();
  }

  private endSky() {
    if (!this.park || !this.kid) return;
    const st = this.park.skyTrain;
    st.held = false;
    this.sky = null;
    // step off at the station, down on the ground
    const p = st.loop.getPointAt(st.stationU);
    const kp = this.kid.root.position;
    kp.set(p.x * 0.93, 0, p.z * 0.93);
    kp.y = groundY(kp.x, kp.z);
    if (this.pet) this.pet.root.position.set(kp.x + 1.4, groundY(kp.x + 1.4, kp.z + 1), kp.z + 1);
    this.burst(kp.clone().setY(kp.y + 1.2), 40);
    this.opts.onSkyCoaster?.(false);
  }

  /** Hop on a mount (pony gallops, manta/dragon fly). Replaces any current mount. */
  mountUp(kind: MountKind, accent?: string, skin?: MountSkin, breed?: DragonBreed) {
    if (!this.kid || this.ride) return;
    this.endSlide(false);
    this.endSki();
    this.endLift();
    this.dismount(true);
    const m = buildMount(kind, accent ?? this.opts.accent, skin, breed);
    if (kind === "dragon") {
      this.dragonFlight().start(m.breed ?? "roostwarden");
      this.dragonPrevAlt = 0;
    }
    m.root.traverse((o) => ((o as THREE.Mesh).isMesh && o.name !== "mount-shadow" && (o.castShadow = true)));
    this.mount = m;
    this.scene.add(m.root);
    m.root.position.copy(this.kid.root.position).setY(0);
    this.landing = false;
    this.alt = 0;
    const medium0 = MOUNT_CAPS[kind].medium;
    this.altTarget = medium0 === "air" ? 9 : 0;
    this.flyInput = 0;
    if (medium0 === "under") this.alt = this.altTarget = Math.min(-1.5, this.kid.root.position.y - WATER_Y);
    // taking off from a floating mountain: heights count from its top
    const kp0 = this.kid.root.position;
    const top0 = this.onSky ? skyTopY(kp0.x, kp0.z, this.time) : null;
    this.flyBase = top0 ? top0.y : Math.max(worldFloor(kp0.x, kp0.z), WATER_Y);
    this.onSky = null;
    this.gliding = false;
    // hopping on a manta while swimming under water: it carries on from this depth
    if (kind === "manta" && this.wasInSea && this.swimDepth > 0.6) this.alt = this.altTarget = this.kid.root.position.y - WATER_Y;
    if (this.kid.rig) {
      this.kid.rig.root.rotation.x = 0;
      this.kid.rig.setSwim(false, false);
    }
    this.swimPitch = 0;
    if (this.kid.rig) this.kid.rig.root.position.copy(m.seat);
    const shadow = this.kid.root.children[1];
    if (shadow) shadow.visible = false;
    this.burst(this.kid.root.position.clone().setY(1.5), 50);
    this.walkTarget = null;
    this.walkQueue = [];
  }

  /** Riding a flier, in the air: the map can send it somewhere (flyTo) */
  get canFlyTo(): boolean {
    return !!this.mount?.flies && !this.landing && !this.sky && !this.ride;
  }
  /** where the autopilot's flying to (the HUD shows it), or null */
  get flyingTo(): string | null {
    return this.autoFly?.label ?? null;
  }
  /** Fly the dragon (any flier) to (x, z): it steers itself, cruises faster, and lands there.
   *  Touch the joystick to take over. */
  flyTo(x: number, z: number, label = ""): boolean {
    if (!this.canFlyTo || !this.kid) return false;
    this.autoFly = { x, z, label };
    this.walkTarget = null;
    this.walkQueue = [];
    if (this.altTarget < 12) this.altTarget = 12;
    return true;
  }

  /** Hop off. Fliers glide down and land first (unless `now`). */
  dismount(now = false) {
    const m = this.mount;
    if (!m || !this.kid) return;
    if (m.flies && this.alt > 0.4 && !now) {
      this.landing = true;
      this.altTarget = 0;
      return;
    }
    const wasY = this.kid.root.position.y;
    if (this.rideId && this.park) {
      const p0 = this.kid.root.position;
      this.park.rides.release(this.rideId, p0.x, MOUNT_CAPS[m.kind].medium === "land" || MOUNT_CAPS[m.kind].medium === "air" ? worldFloor(p0.x, p0.z) : p0.y, p0.z, this.kid.facing);
      this.rideId = null;
    }
    m.dispose();
    this.mount = null;
    this.landing = false;
    this.alt = 0;
    this.altTarget = 0;
    this.kid.root.rotation.x = 0;
    this.kid.root.rotation.z = 0;
    this.helm.speed = this.craftSpeed = 0;
    const kp = this.kid.root.position;
    // off a boat (or a surfaced sub) beside a jetty or a beach: step ashore
    if (isCraft(m.kind) && (isBoat(m.kind) || wasY > WATER_Y - 2.2)) {
      const [hl, hw, off] = MOUNT_BODY[m.kind];
      const yaw = m.root.rotation.y;
      const at = landingSpot(kp.x + Math.sin(yaw) * off, kp.z + Math.cos(yaw) * off, yaw, hl, hw + 3.2, worldFloor, this.landAt);
      if (at) {
        kp.set(at.x, at.y, at.z);
        this.swimDepth = this.swimTarget = 0;
        if (this.kid.rig) this.kid.rig.root.position.set(0, 0, 0);
        const sh = this.kid.root.children[1];
        if (sh) sh.visible = true;
        if (this.pet) this.pet.root.position.set(at.x + 0.9, at.y, at.z + 0.6);
        this.burst(kp.clone().setY(at.y + 1), 24);
        return;
      }
    }
    // hopping off above a floating mountain: you're standing on it
    const top = skyTopY(kp.x, kp.z, this.time);
    if (top && wasY >= top.y - 1.5) {
      kp.y = top.y;
      this.onSky = top.id;
      this.gliding = false;
      if (this.kid.rig) this.kid.rig.root.position.set(0, 0, 0);
      const shadow0 = this.kid.root.children[1];
      if (shadow0) shadow0.visible = true;
      if (this.pet) this.pet.root.position.set(kp.x + 1.2, top.y, kp.z + 0.8);
      this.opts.onSkyIsland?.(top.id, "land");
      return;
    }
    // off a manta in the sea: keep swimming at the same depth
    const sea = seaDepth(kp.x, kp.z);
    if (sea > SWIM_DEPTH) this.swimDepth = this.swimTarget = Math.max(0, Math.min(sea - 1.1, WATER_Y - 0.95 - wasY));
    kp.y = sea > SWIM_DEPTH ? WATER_Y - 0.95 - this.swimDepth : worldFloor(kp.x, kp.z);
    if (this.kid.rig) this.kid.rig.root.position.set(0, 0, 0);
    const shadow = this.kid.root.children[1];
    if (shadow) shadow.visible = true;
    if (this.pet) this.pet.root.position.set(this.kid.root.position.x + 1.6, 0, this.kid.root.position.z + 1);
  }

  /** Which Sea Pearls this kid has already found. */
  setPearlsFound(ids: number[]) {
    this.park?.underwater.setPearlsFound(ids);
  }

  /** Which Star Shards this kid has already found (they vanish from the world). */
  setShardsFound(ids: number[]) {
    this.park?.quests3d.setFound(ids);
  }

  /** While flying: +1 climb, -1 dive, 0 hold. */
  setFly(dir: number) {
    this.flyInput = Math.max(-1, Math.min(1, dir));
  }

  /** Swimming (on foot, or on a manta under the waves)? For the HUD's swim/dive buttons. */
  get swim(): { under: boolean; depth: number } | null {
    const p = this.kid?.root.position;
    if (!p) return null;
    const onManta = this.mount?.kind === "manta" && p.y < WATER_Y - 0.4;
    if (!onManta && (this.mount || !this.wasInSea)) return null;
    const depth = Math.max(0, WATER_Y - p.y - 0.95);
    return { under: depth > 0.6, depth };
  }

  /** What we're riding right now (for the HUD). */
  get riding(): { kind: MountKind; flying: boolean; landing: boolean } | null {
    return this.mount ? { kind: this.mount.kind, flying: this.mount.flies && this.alt > 0.4, landing: this.landing } : null;
  }

  /** What the world feels like right now, for the soundscape: twilight glow, forest depth, sea closeness. */
  getAmbient(): { glow: number; forest: number; shore: number; under: number } {
    const a = this.park?.atmosphere;
    const p = this.kid?.root.position;
    const r = p ? Math.hypot(p.x, p.z) : 0;
    return { glow: a?.glow ?? 0, forest: a?.forest ?? 0, shore: Math.min(1, Math.max(0, (r - 78) / 36)), under: this.camUnder ? Math.min(1, 0.4 + (WATER_Y - this.camera.position.y) / 10) : 0 };
  }

  /** Grow (or shrink) the pet in the park, e.g. 0.7 for a baby up to ~1.35 fully grown. */
  setPetGrowth(scale: number, celebrate = false) {
    this.petGrowth = scale;
    if (this.pet && !this.ride) this.pet.root.scale.setScalar(scale);
    if (celebrate && this.pet) {
      this.play(this.pet, "gesture-positive", true);
      this.burst(this.pet.root.position.clone().setY(1.2), 40);
    }
  }

  /** The world's own clock (seconds since this visit began) — same `t` the park's `update()` runs
   *  on, so the mini map can place things whose position is a function of it (travelling traders:
   *  world/trade/plan.ts) without drifting out of step with the 3D world. */
  getClockT(): number {
    return this.time;
  }

  /** Where the kid (and pet) are and which way the view faces — for the HUD mini map. */
  getPose(): { x: number; z: number; facing: number; yaw: number; pet: { x: number; z: number } | null } | null {
    if (!this.kid || this.ride || this.building) return null;
    const p = this.kid.root.position;
    const pp = this.pet?.root.position;
    return { x: p.x, z: p.z, facing: this.kid.facing, yaw: this.camYaw, pet: pp ? { x: pp.x, z: pp.z } : null };
  }

  /** Leave a place: step back out of its door so it doesn't reopen straight away. */
  stepOutOf(placeId: string) {
    this.endSlide(false);
    this.endSki();
    this.endLift();
    const p = this.allPlaces().find((x) => x.id === placeId);
    if (!p || !this.kid) return;
    if (placeId === "my-home") {
      // (out beside the cottage where they started, in view of the camera)
      this.kid.root.position.set(SPAWN.x, 0, SPAWN.z);
      this.kid.facing = Math.atan2(-SPAWN.x, -SPAWN.z);
      this.nearPlace = null;
      return;
    }
    const dir = new THREE.Vector3(-p.x, 0, -p.z).normalize();
    this.kid.root.position.set(p.x, 0, p.z).addScaledVector(dir, p.doorRadius + 1);
    this.kid.facing = Math.atan2(dir.x, dir.z);
    this.nearPlace = null;
  }

  dispose() {
    this.disposed = true;
    this.dragonFx?.dispose();
    this.stop();
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.domElement.removeEventListener("pointermove", this.onMove);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
    this.ride?.dispose();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.park?.dispose();
    this.treasures?.dispose();
    this.dream?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(o as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
    });
    this.assets.dispose();
    this.sparkTex.dispose();
    this.sceneRT?.depthTexture?.dispose();
    this.sceneRT?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** a glowing dark-glass badge with a gold ring (the park's markers: ❗ quests, 🎁 gift...) */
function badgeSprite(emoji: string, size: number): THREE.Sprite {
  const px = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const c = cv.getContext("2d")!;
  const glow = c.createRadialGradient(64, 64, 30, 64, 64, 64);
  glow.addColorStop(0, "rgba(255,211,107,0.55)");
  glow.addColorStop(1, "rgba(255,211,107,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, px, px);
  c.beginPath();
  c.arc(64, 64, 40, 0, Math.PI * 2);
  const fill = c.createLinearGradient(0, 24, 0, 104);
  fill.addColorStop(0, "#2c2766");
  fill.addColorStop(1, "#12102c");
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = "#ffd36b";
  c.stroke();
  c.font = "46px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(emoji, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1);
  return s;
}

function turnTowards(a: Actor, dt: number) {
  const diff = ((((a.facing - a.root.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  a.root.rotation.y += diff * Math.min(1, dt * 10);
}

/** sitting on the chairlift: how far below the seat the kid's feet-origin hangs (their hips on the seat) */
const KID_SEAT_DROP = 0.48;
/** seated on a ride (train, coaster, carousel): how far the kid's body drops onto the seat */
const SKY_SEAT_DROP = 0.3;

/** the Park kid's skis and poles (bright, chunky; under their feet, facing +z) */
function buildKidSkis(): THREE.Group {
  const g = new THREE.Group();
  g.name = "kid-skis";
  const skiMat = new THREE.MeshToonMaterial({ color: "#ff3d6e" });
  const tipMat = new THREE.MeshToonMaterial({ color: "#ffd257" });
  const poleMat = new THREE.MeshToonMaterial({ color: "#e8eef8" });
  for (const side of [-1, 1]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 1.9), skiMat);
    ski.position.set(side * 0.22, 0.03, 0.12);
    g.add(ski);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.3), tipMat);
    tip.position.set(side * 0.22, 0.1, 1.12);
    tip.rotation.x = -0.6;
    g.add(tip);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), poleMat);
    pole.position.set(side * 0.62, 0.62, 0.3);
    pole.rotation.x = 0.35;
    g.add(pole);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  return g;
}
