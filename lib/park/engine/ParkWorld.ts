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
import { buildMount, type MountKind, type MountRig, type MountSkin } from "../characters/mounts";
import { groundY, WATER_Y, wrapWorld } from "../registry/terrain";
import { seaFloorY } from "../world/sea/wander";
import { CAR_GAP, RIDE_CAR } from "../world/steamTrain";
import { SKY_ISLANDS, SKY_OBSTACLES, SKY_SPOTS, skyIslandById, skyStreamEnd, skyTopY, type SkySpot } from "../registry/skyIslands";

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
  /** discovered something on a floating mountain (a cave, a nest, a rune circle solved …) */
  onSkySpot?: (spot: SkySpot) => void;
  /** opened a floating mountain's treasure chest */
  onSkyTreasure?: (id: string) => void;
  /** boarded (true) or stepped off (false) the Sky Coaster */
  onSkyCoaster?: (riding: boolean) => void;
  /** the finish: "diorama" (default — outlines, stepped colour, chunky pixels) or "smooth" */
  look?: "diorama" | "smooth";
  /** crossed the edge of the ocean and came back round from the other side */
  onWrap?: () => void;
  /** a Sea Pearl was collected from a giant clam on the reef */
  onPearl?: (id: number) => void;
  /** the kid waded into deep water (true) or climbed back onto the beach (false) */
  onSwim?: (inSea: boolean) => void;
  /** a Star Shard was collected (id 0..29) */
  onShard?: (id: number) => void;
  /** flew through Sky Ring `passed` of 12; `lap` = seconds when the course is complete */
  onRing?: (passed: number, lap?: number) => void;
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
const seaDepth = (x: number, z: number) => WATER_Y - seaFloorY(x, z); // the same sea floor the art draws
/** the ground (or sea floor) under (x, z) */
const floorY0 = (x: number, z: number) => seaFloorY(x, z);
const CAM_OFFSET = new THREE.Vector3(0, 12, 14);
const MAX_DT = 1 / 20;

interface Actor {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  /** hand-made chibi character (procedural animation) — used instead of the mixer when set */
  rig?: ChibiRig;
  /** chibi: where it was last frame (speed drives walk/run), and how long a one-shot action holds */
  last?: THREE.Vector3;
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
  private alt = 0;
  private altTarget = 0;
  private flyInput = 0;
  // ── swimming: depth below the surface (0 = paddling at the top), eased toward swimTarget ──
  private swimDepth = 0;
  private swimTarget = 0;
  private swimPitch = 0;
  private swimVX = 0;
  private swimVZ = 0;
  private wasInSea = false;
  private camUnder = false;
  // ── the Sky Coaster: riding the train round the island (speed follows the drops) ──
  private sky: { v: number; dist: number; cheered: boolean } | null = null;
  // ── floating mountains: standing on one (its id), gliding down off an edge, flight's reference height ──
  private onSky: string | null = null;
  private gliding = false;
  private fallV = 0;
  private flyBase = 0;
  private skyOpened = new Set<string>();
  private spotsFound = new Set<string>();
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
  /** the diorama look draws the scene here first (HDR colour + its own depth) so outlines can read depth */
  private sceneRT: THREE.WebGLRenderTarget | null = null;
  /** "diorama": ink outlines, stepped colour and chunky pixels; "smooth": the plain filmic render */
  private look: "diorama" | "smooth";

  constructor(private container: HTMLElement, private opts: ParkWorldOptions) {
    this.quality = opts.quality ?? detectQuality();
    const low = this.quality === "low";
    this.look = opts.look ?? "smooth";
    const dio = this.look === "diorama" && !low;
    // look down on the island from higher up (~42°), the way you'd look at a model on a table
    if (dio) this.camPitch = 0.62;
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
      } else this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.6, 1.02); // only HDR magic (>1) blooms, not white signs
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      if (dio && this.sceneRT) {
        this.diorama = makeDioramaPass(this.sceneRT.depthTexture!, this.camera);
        this.composer.addPass(this.diorama);
      }
    }
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
      this.dream = dream;
      this.kid = kid;
      kid.root.position.set(SPAWN.x, 0, SPAWN.z);
      kid.facing = Math.PI;
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
      const gy = groundY(a.root.position.x, a.root.position.z);
      // in deep water everyone paddles at the surface
      a.root.position.y = WATER_Y - gy > SWIM_DEPTH ? WATER_Y - 0.95 + Math.sin(this.time * 2.4 + a.root.position.x) * 0.06 : gy + (a === this.pet && this.petMode === "sleep" ? 0.45 : 0);
    }
    if (!a.rig) {
      a.mixer?.update(dt);
      return;
    }
    const p = a.root.position;
    const speed = forceSpeed ?? (Number.isNaN(a.last!.x) || dt <= 0 ? 0 : Math.hypot(p.x - a.last!.x, p.z - a.last!.z) / dt);
    a.last!.copy(p);
    // the pet (and visitors) paddle when they're in the sea
    if (a !== this.kid) a.rig.setSwim(!this.ride && WATER_Y - seaFloorY(p.x, p.z) > SWIM_DEPTH && p.y < WATER_Y, speed > 0.4);
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
        this.walkTarget = new THREE.Vector3(place.x, 0, place.z).addScaledVector(dir, place.radius + 1.4);
        this.walkQueue = [];
        this.nearPlace = null;
        return;
      }
    }
    const ground = new THREE.Vector3();
    if (this.groundHit(ground)) {
      this.walkTarget = ground;
      this.walkQueue = [];
    }
  };
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
    this.camera.fov = this.look === "diorama" ? (this.camera.aspect < 0.8 ? 46 : 32) : this.camera.aspect < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); // CSS keeps it at 100% x 100%
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
    if (this.diorama) {
      const pr = this.renderer.getPixelRatio();
      this.sceneRT?.setSize(Math.round(w * pr), Math.round(h * pr));
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
    const dt = Math.min(this.clock.getDelta(), MAX_DT);
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
        this.pet.root.position.lerp(pt, Math.min(1, dt * 3));
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
      this.renderer.render(ride.scene, this.camera);
      this.frame = requestAnimationFrame(this.tick);
      return;
    }

    // movement: joystick first, else tap-to-walk target
    let vx = 0;
    let vz = 0;
    if (this.inputOn) {
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
    if (this.sky) {
      vx = 0;
      vz = 0;
    }
    const moving = Math.hypot(vx, vz) > 0.01;
    const swimmingNow = !this.mount && !this.onSky && !this.gliding && !this.sky && seaDepth(pos.x, pos.z) > SWIM_DEPTH;
    if (swimmingNow) {
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
      const sp = WALK_SPEED * (this.mount ? (this.mount.flies ? 2.4 : 1.9) : swimming ? (this.swimDepth > 0.6 ? 1.05 : 0.8) : this.routing && this.walkTarget ? 1.6 : 1);
      pos.x += vx * sp * dt;
      pos.z += vz * sp * dt;
      kid.facing = Math.atan2(vx, vz);
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
      if (m.flies && !this.landing) this.altTarget = Math.max(lowAlt, Math.min(maxAlt, this.altTarget + this.flyInput * 12 * dt));
      if (this.altTarget < minAlt) this.altTarget = minAlt;
      this.alt += (this.altTarget - this.alt) * Math.min(1, dt * (this.landing ? 1.6 : 2.2));
      if (this.alt < minAlt) this.alt = minAlt;
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
    turnTowards(kid, dt);
    if (kid.current === "idle" || kid.current === "walk" || kid.current === "run" || kid.current === "") this.play(kid, moving && !this.mount ? "walk" : "idle");
    const floorY = seaFloorY(pos.x, pos.z);
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
        }
        pos.y = base + this.alt;
      } else pos.y = seaHere > SWIM_DEPTH ? WATER_Y - 0.85 : floorY;
      m.root.position.set(pos.x, pos.y, pos.z);
      m.root.rotation.y = kid.root.rotation.y;
      m.root.rotation.z = moving && m.flies ? Math.sin(this.time * 1.5) * 0.06 : 0;
      // wings beat under water too; the shadow measures down to the real ground / sea floor
      m.update(dt, moving ? WALK_SPEED * 2 : 0, m.flies && Math.abs(this.alt) > 0.4, this.park.atmosphere.glow, pos.y - floorY);
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
      this.tickActor(kid, dt, undefined, false);
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
      this.tickActor(kid, dt, undefined, false);
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
    if (blob && !this.mount) blob.visible = !swimNow;
    if (kid.rig && !this.mount) {
      kid.rig.root.rotation.x = this.swimPitch;
      kid.rig.root.position.y = this.swimPitch * 0.45;
      kid.rig.setSwim(swimNow, swimMove);
    }

    if (this.sky) this.tickSky(dt, kid);

    // wizards stand on their floating mountains (which bob gently)
    for (const w of this.wizards) {
      if (!w.island) continue;
      const top = skyTopY(w.place.x, w.place.z, this.time);
      if (!top) continue;
      w.model.root.position.y = top.y;
      w.sign.position.y = top.y + 4.9;
      if (w.star) w.star.position.y = top.y + 6.1;
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
    if (this.pet && this.mount && this.petMode === "follow") {
      const seat = this.mount.root.localToWorld(this.mount.petSeat.clone());
      this.pet.root.position.copy(seat);
      this.pet.root.rotation.y = kid.root.rotation.y;
      this.pet.facing = kid.facing;
      this.tickActor(this.pet, dt, 0, false);
    } else if (this.pet) {
      const pet = this.pet;
      let target: THREE.Vector3 | null = null;
      let speed = 3.5;
      if (this.petMode === "follow") {
        target =
          this.idleT > 2
            ? new THREE.Vector3(pos.x + Math.sin(this.time * 0.9) * 2.4, 0, pos.z + Math.cos(this.time * 0.9) * 2.4)
            : new THREE.Vector3(pos.x - Math.sin(kid.facing) * 2, 0, pos.z - Math.cos(kid.facing) * 2);
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
      const petMoving = step.length() > 0.01;
      if (petMoving) pet.facing = Math.atan2(step.x, step.z);
      turnTowards(pet, dt);
      if (this.petMode !== "sleep" && (pet.current === "idle" || pet.current === "walk" || pet.current === "run" || pet.current === ""))
        this.play(pet, petMoving ? (this.petMode === "fetch" ? "run" : "walk") : "idle");
      this.tickActor(pet, dt);
      const head = pet.root.position.y + 1.9;
      if (this.petStatus) this.petStatus.position.set(pet.root.position.x, head + 0.7, pet.root.position.z);
      if (this.petBubble) {
        this.petBubble.sprite.position.set(pet.root.position.x, head + (this.petStatus ? 1.8 : 0.9), pet.root.position.z);
        if (this.time > this.petBubble.until) this.clearBubble();
      }
      if (this.petZzz) this.petZzz.position.set(pet.root.position.x + 0.6, head + 0.4 + Math.sin(this.time * 2) * 0.25, pet.root.position.z);
    }

    // on the coaster the pet rides in the car behind
    if (this.sky && this.pet) {
      const st = this.park.skyTrain;
      const pp = st.loop.getPointAt((st.u - ((RIDE_CAR + 1) * CAR_GAP) / st.len + 1) % 1);
      this.pet.root.position.set(pp.x, pp.y + 0.75, pp.z);
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
    if (this.inputOn && !aloft && !this.sky && !this.gliding && !this.launch) {
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
    uw.group.visible = this.camUnder || this.wasInSea || nearSea || (this.mount?.kind === "manta" && pos.y < WATER_Y);
    const uwr = uw.update(dt, this.time, { kid: pos, under: this.camUnder, glow: this.park.atmosphere.glow });
    if (uwr.pearl !== null) {
      this.burst(pos.clone().setY(pos.y + 1.2), 50);
      this.opts.onPearl?.(uwr.pearl);
    }
    if (q3.ring) {
      this.burst(pos.clone().setY(pos.y + 1), q3.ring.lap !== undefined ? 90 : 30);
      this.opts.onRing?.(q3.ring.passed, q3.ring.lap);
    }
    if (!this.heroLight.parent) this.scene.add(this.heroLight);
    this.heroLight.position.set(pos.x, pos.y + 4.5, pos.z + 1.5);
    this.heroLight.intensity = this.park.atmosphere.glow * 7;
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
    if (moving && !this.building && !this.sky && !this.ride && this.time - this.userTurnAt > 2.2) {
      let d = kid.facing + Math.PI - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // strong when heading away from the camera, only a gentle drift when walking sideways
      // (a full-strength follow chased a sideways walk round in circles)
      const w = 0.22 + 0.78 * Math.max(0, Math.cos(d));
      if (Math.abs(d) < 2.4) this.camYaw += d * Math.min(1, dt * 1.3 * w);
    }
    if (this.sky) {
      // chase cam: behind and above the car, looking down the track
      const tan = this.park.skyTrain.loop.getTangentAt(this.park.skyTrain.u);
      // high and to one side of the train, so the smoke streams past rather than into the lens
      const sideX = tan.z;
      const sideZ = -tan.x;
      const want = new THREE.Vector3(pos.x - tan.x * 10 + sideX * 3.5, pos.y - tan.y * 10 + 6.5, pos.z - tan.z * 10 + sideZ * 3.5);
      this.camera.position.lerp(want, Math.min(1, dt * 5));
      this.camera.lookAt(pos.x + tan.x * 12, pos.y + tan.y * 12 + 0.6, pos.z + tan.z * 12);
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
      let dist = CAM_OFFSET.length() * this.camZoom * (this.look === "diorama" ? 1.55 : 1) * (this.mount?.flies && this.alt > 1 ? 1.45 : this.mount ? 1.15 : 1);
      // under the sea the water swallows anything far away: bring the camera in close (the
      // storybook look's model-railway distance lost the kid and the manta in the haze)
      if (pos.y + 1.6 < WATER_Y) dist = Math.min(dist, this.mount ? 15 : 13);
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
      const off = new THREE.Vector3(0, Math.sin(this.camPitch) * dist, Math.cos(this.camPitch) * dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
      // look a little ahead of where the kid is heading, so they can see what's coming
      const ahead = moving ? 3 : 1.2;
      const lx = pos.x + Math.sin(kid.facing) * ahead;
      const lz = pos.z + Math.cos(kid.facing) * ahead;
      this.lookAtPt.lerp(new THREE.Vector3(lx, pos.y + 1.2, lz), Math.min(1, dt * 3));
      // ease an un-lifted camera position, then add the hill lift on top (so the lift can't feed back)
      this.camBase.lerp(new THREE.Vector3(this.lookAtPt.x, this.lookAtPt.y - 1.2, this.lookAtPt.z).add(off), Math.min(1, dt * 3.5));
      this.camera.position.copy(this.camBase);
      // keep the view clear over hills: march from the kid to the camera and lift the camera
      // until the line of sight clears the ground (and never let it dip into a hill)
      const cp = this.camera.position;
      let lift = 0;
      for (let k = 1; k <= 8; k++) {
        const u = k / 9;
        const sx = this.lookAtPt.x + (cp.x - this.lookAtPt.x) * u;
        const sz = this.lookAtPt.z + (cp.z - this.lookAtPt.z) * u;
        const lineY = this.lookAtPt.y + (cp.y - this.lookAtPt.y) * u;
        const need = groundY(sx, sz) + 1.4 - lineY;
        if (need > 0) lift = Math.max(lift, need / u);
      }
      this.camLift += (Math.min(lift, 30) - this.camLift) * Math.min(1, dt * 4);
      cp.y += this.camLift;
      const under = groundY(cp.x, cp.z) + 1.2;
      if (cp.y < under) cp.y = under;
      // the camera never straddles the waterline: it dives with a diving kid (closer in, the sea
      // is murky) and stays above the waves for one paddling at the top
      const kidUnder = pos.y + 1.6 < WATER_Y; // head below the surface (paddling sits at WATER_Y - 0.95)
      if (kidUnder) {
        cp.lerp(this.lookAtPt, 0.15);
        // over water too shallow to hide a camera (the lagoon's edge)? slide in toward the kid
        for (let k = 0; k < 6 && groundY(cp.x, cp.z) + 0.8 > WATER_Y - 0.6; k++) cp.lerp(this.lookAtPt, 0.3);
        // stay down near the kid's depth, looking a little down on them (hugging the surface
        // filled the view with its bright underside)
        // float a little above the kid, over the coral tops (down among the coral, sea fans and
        // grass blocked the view), and never up through the surface
        cp.y = Math.min(WATER_Y - 0.6, Math.max(pos.y + 1.6, seaFloorY(cp.x, cp.z) + 2.2));
      } else if (seaDepth(cp.x, cp.z) > 0 && cp.y < WATER_Y + 1.2) cp.y = WATER_Y + 1.2;
      // aim a little above the kid: they sit in the lower third and the world fills the frame
      // (aiming straight at them left the bottom half of the screen as empty grass)
      // (under the sea, look a little DOWN at the reef instead — up is just the surface)
      // (under water: look level, out across the reef and the blue — the water is clear now)
      const aimUp = kidUnder ? 0.2 : dist * (this.camera.aspect < 0.8 ? 0.34 : 0.38) * Math.max(0, Math.cos(this.camPitch) - 0.35);
      this.camera.lookAt(this.lookAtPt.x, this.lookAtPt.y + aimUp, this.lookAtPt.z);
      // a telescope's peek: glance over at the island it's aimed at
      if (this.peek && this.time < this.peek.until) this.camera.lookAt(this.peek.x, this.peek.y, this.peek.z);
    }
    // under the sea? deep-blue fog, no sky
    const camUnder = !this.building && !this.ride && this.camera.position.y < WATER_Y - 0.05;
    if (camUnder || this.camUnder) {
      this.park.atmosphere.setUnderwater(camUnder, WATER_Y - this.camera.position.y);
      this.park.storybook?.setUnderwater(camUnder);
    }
    this.camUnder = camUnder;
    // bloom a little stronger at twilight, when the magic comes out
    const glowNow = this.park.atmosphere.glow;
    if (this.bloom) this.bloom.strength = 0.28 + glowNow * 0.5;
    // lift the exposure at twilight so the world stays readable around the glow
    this.renderer.toneMappingExposure = 1.12 + glowNow * 0.55;
    if (this.sceneRT) {
      this.renderer.setRenderTarget(this.sceneRT);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** where the pointer ray meets the ground (the terrain mesh, else a flat plane) */
  private groundHit(out: THREE.Vector3): boolean {
    const g = this.park?.ground;
    if (g) {
      const hit = this.raycaster.intersectObject(g, false)[0];
      if (hit) {
        out.copy(hit.point);
        return true;
      }
    }
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

  /** Which floating-mountain discoveries this kid has already made. */
  setSkySpotsFound(ids: string[]) {
    this.spotsFound = new Set(ids);
    this.park?.skyChests.setSpotsFound(ids);
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

  /** Board the Sky Coaster at its station for one full lap round the island. */
  rideSkyCoaster(): boolean {
    if (!this.park || !this.kid || this.ride || this.sky || this.building) return false;
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

  /** Riding the coaster right now? (the HUD hides the joystick) */
  get onSkyCoaster(): boolean {
    return !!this.sky;
  }

  private tickSky(dt: number, kid: Actor) {
    const s = this.sky!;
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
  mountUp(kind: MountKind, accent?: string, skin?: MountSkin) {
    if (!this.kid || this.ride) return;
    this.dismount(true);
    const m = buildMount(kind, accent ?? this.opts.accent, skin);
    m.root.traverse((o) => ((o as THREE.Mesh).isMesh && o.name !== "mount-shadow" && (o.castShadow = true)));
    this.mount = m;
    this.scene.add(m.root);
    m.root.position.copy(this.kid.root.position).setY(0);
    this.landing = false;
    this.alt = 0;
    this.altTarget = m.flies ? 9 : 0;
    this.flyInput = 0;
    // taking off from a floating mountain: heights count from its top
    const kp0 = this.kid.root.position;
    const top0 = this.onSky ? skyTopY(kp0.x, kp0.z, this.time) : null;
    this.flyBase = top0 ? top0.y : Math.max(seaFloorY(kp0.x, kp0.z), WATER_Y);
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
    m.dispose();
    this.mount = null;
    this.landing = false;
    this.alt = 0;
    this.altTarget = 0;
    const kp = this.kid.root.position;
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
    kp.y = sea > SWIM_DEPTH ? WATER_Y - 0.95 - this.swimDepth : groundY(kp.x, kp.z);
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

  /** Where the kid (and pet) are and which way the view faces — for the HUD mini map. */
  getPose(): { x: number; z: number; facing: number; yaw: number; pet: { x: number; z: number } | null } | null {
    if (!this.kid || this.ride || this.building) return null;
    const p = this.kid.root.position;
    const pp = this.pet?.root.position;
    return { x: p.x, z: p.z, facing: this.kid.facing, yaw: this.camYaw, pet: pp ? { x: pp.x, z: pp.z } : null };
  }

  /** Leave a place: step back out of its door so it doesn't reopen straight away. */
  stepOutOf(placeId: string) {
    const p = this.allPlaces().find((x) => x.id === placeId);
    if (!p || !this.kid) return;
    const dir = new THREE.Vector3(-p.x, 0, -p.z).normalize();
    this.kid.root.position.set(p.x, 0, p.z).addScaledVector(dir, p.doorRadius + 1);
    this.kid.facing = Math.atan2(dir.x, dir.z);
    this.nearPlace = null;
  }

  dispose() {
    this.disposed = true;
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
