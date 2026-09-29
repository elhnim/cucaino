// Cucaino Park runtime: one renderer, the candy park scene, the kid's animal + pet, input,
// camera and effects. React (components/park/*) owns every 2D overlay and talks to this
// class through a few methods + callbacks.
import * as THREE from "three";
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
import { buildMount, type MountKind, type MountRig } from "../characters/mounts";

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
  onError?: (err: unknown) => void;
}

const WALK_SPEED = 7;
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
  private wizards: { model: WizardModel; place: PlaceDef; sign: THREE.Sprite; star: THREE.Sprite | null }[] = [];
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
  /** camera height angle: drag up/down to look from low (almost eye level) to high overhead */
  private camPitch = Math.atan2(CAM_OFFSET.y, CAM_OFFSET.z);
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

  constructor(private container: HTMLElement, private opts: ParkWorldOptions) {
    this.quality = opts.quality ?? detectQuality();
    const low = this.quality === "low";
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: low ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // no tone mapping: toon materials + candy palette are authored for straight sRGB output,
    // any filmic curve desaturates them into pastel mush
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
    Object.assign(this.renderer.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
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
    const s = emojiSprite(emoji, 2);
    const base = place.signY + 2;
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
        buildPark(this.scene, this.assets, { hour: this.opts.hour, lowQuality: this.quality === "low" }),
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
    root.add(rig.root, blobShadow(height * 1.3));
    return { root, mixer: null, actions: new Map(), current: "", facing: 0, rig, last: new THREE.Vector3(Number.NaN, 0, 0), hold: 0 };
  }

  /** Advance an actor's animation: chibi rigs are driven by how fast they're moving. */
  private tickActor(a: Actor, dt: number, forceSpeed?: number) {
    if (!a.rig) {
      a.mixer?.update(dt);
      return;
    }
    const p = a.root.position;
    const speed = forceSpeed ?? (Number.isNaN(a.last!.x) || dt <= 0 ? 0 : Math.hypot(p.x - a.last!.x, p.z - a.last!.z) / dt);
    a.last!.copy(p);
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
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), g)) this.throwBall(g.x, g.z);
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
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), g)) this.opts.onBuildTap?.(g.x, g.z);
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
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) {
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
    this.camera.fov = this.camera.aspect < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); // CSS keeps it at 100% x 100%
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
    const moving = Math.hypot(vx, vz) > 0.01;
    if (moving) {
      if (!this.walkTarget) this.routing = false;
      const sp = WALK_SPEED * (this.mount ? (this.mount.flies ? 2.4 : 1.9) : this.routing && this.walkTarget ? 1.6 : 1);
      pos.x += vx * sp * dt;
      pos.z += vz * sp * dt;
      kid.facing = Math.atan2(vx, vz);
      this.idleT = 0;
      this.waved = false;
    } else {
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
      if (m.flies && !this.landing) this.altTarget = Math.max(4, Math.min(34, this.altTarget + this.flyInput * 9 * dt));
      this.alt += (this.altTarget - this.alt) * Math.min(1, dt * (this.landing ? 1.6 : 2.2));
      if (this.landing && this.alt < 0.25) this.dismount(true);
    }
    const aloft = this.alt > 3;
    // keep inside the park (fliers may roam out over the sea) and out of buildings
    const r = Math.hypot(pos.x, pos.z);
    const limit = aloft ? PARK_RADIUS + 70 : PARK_RADIUS;
    if (r > limit) pos.multiplyScalar(limit / r);
    // walk round the grassy hills
    for (const o of aloft ? [] : this.park.obstacles) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 0.001) {
        pos.x = o.x + (dx / d) * o.r;
        pos.z = o.z + (dz / d) * o.r;
      }
    }
    for (const p of aloft ? [] : this.allPlaces()) {
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
    if (this.mount) {
      const m = this.mount;
      pos.y = this.alt;
      m.root.position.set(pos.x, this.alt, pos.z);
      m.root.rotation.y = kid.root.rotation.y;
      m.root.rotation.z = moving && m.flies ? Math.sin(this.time * 1.5) * 0.06 : 0;
      m.update(dt, moving ? WALK_SPEED * 2 : 0, m.flies && this.alt > 0.4, this.park.atmosphere.glow);
      if (kid.rig) kid.rig.root.position.copy(m.seat);
      this.tickActor(kid, dt, 0);
      // a sparkly trail behind fliers
      if (m.flies && this.alt > 1 && moving) {
        this.flySparkle -= dt;
        if (this.flySparkle <= 0) {
          this.flySparkle = 0.12;
          this.burst(pos.clone().setY(this.alt + 0.4), 4);
        }
      }
    } else this.tickActor(kid, dt);

    // pet: follows behind, trots circles round the kid when idle — unless a station has it busy
    if (this.pet && this.mount && this.petMode === "follow") {
      const seat = this.mount.root.localToWorld(this.mount.petSeat.clone());
      this.pet.root.position.copy(seat);
      this.pet.root.rotation.y = kid.root.rotation.y;
      this.pet.facing = kid.facing;
      this.tickActor(this.pet, dt, 0);
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
    if (this.inputOn && !aloft) {
      let found: PlaceDef | null = null;
      for (const p of this.allPlaces()) {
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
    if (!this.heroLight.parent) this.scene.add(this.heroLight);
    this.heroLight.position.set(pos.x, 4.5, pos.z + 1.5);
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
      if (w.star) w.star.position.y = 6.1 + Math.sin(this.time * 2.4) * 0.25;
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

    if (this.building) {
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
      const dist = CAM_OFFSET.length() * this.camZoom * (this.mount?.flies && this.alt > 1 ? 1.45 : this.mount ? 1.15 : 1);
      const off = new THREE.Vector3(0, Math.sin(this.camPitch) * dist, Math.cos(this.camPitch) * dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
      // look a little ahead of where the kid is heading, so they can see what's coming
      const ahead = moving ? 3 : 1.2;
      const lx = pos.x + Math.sin(kid.facing) * ahead;
      const lz = pos.z + Math.cos(kid.facing) * ahead;
      this.lookAtPt.lerp(new THREE.Vector3(lx, 1.2 + this.alt, lz), Math.min(1, dt * 3));
      this.camera.position.lerp(new THREE.Vector3(this.lookAtPt.x, this.lookAtPt.y - 1.2, this.lookAtPt.z).add(off), Math.min(1, dt * 3.5));
      if (this.camera.position.y < 0.8) this.camera.position.y = 0.8; // never dip under the grass
      this.camera.lookAt(this.lookAtPt);
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

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
    const pts = this.park.pathPoints.filter((p) => Math.hypot(p.x, p.z) > 16 && !this.park!.places.some((pl) => Math.hypot(pl.x - p.x, pl.z - p.z) < pl.doorRadius + 5));
    const chosen: THREE.Vector3[] = [];
    const out: { id: string; x: number; z: number }[] = [];
    for (const w of list) {
      let spot: THREE.Vector3 | null = null;
      for (let tries = 0; tries < 60 && pts.length; tries++) {
        const p = pts[Math.floor(rnd() * pts.length)];
        if (chosen.some((c) => c.distanceTo(p) < 22)) continue;
        spot = p;
        break;
      }
      if (!spot) continue;
      chosen.push(spot);
      // step off the path to the side (perpendicular to the way back to the plaza)
      const side = rnd() < 0.5 ? -1 : 1;
      const r = Math.hypot(spot.x, spot.z) || 1;
      const x = spot.x + (-spot.z / r) * 3.4 * side;
      const z = spot.z + (spot.x / r) * 3.4 * side;
      const model = buildWizardModel({ robe: w.robe, hat: w.hat, orb: w.orb });
      model.root.position.set(x, 0, z);
      model.root.traverse((o) => (o.userData.placeId = `wizard:${w.id}`));
      this.scene.add(model.root);
      this.park.tappables.push(model.root);
      const sign = nameTag(`🧙 ${w.name}`, w.robe);
      sign.position.set(x, 4.9, z);
      this.scene.add(sign);
      let star: THREE.Sprite | null = null;
      if (w.hasLesson) {
        star = emojiSprite("✨", 1.3);
        star.position.set(x, 6.1, z);
        this.scene.add(star);
      }
      const place: PlaceDef = { id: `wizard:${w.id}`, label: w.name, emoji: "🧙", land: "plaza", x, z, radius: 1.1, doorRadius: 3.4, action: "wizard", signY: 0, models: [] };
      this.wizards.push({ model, place, sign, star });
      out.push({ id: w.id, x, z });
    }
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

  /** Hop on a mount (pony gallops, manta/dragon fly). Replaces any current mount. */
  mountUp(kind: MountKind, accent?: string) {
    if (!this.kid || this.ride) return;
    this.dismount(true);
    const m = buildMount(kind, accent ?? this.opts.accent);
    this.mount = m;
    this.scene.add(m.root);
    m.root.position.copy(this.kid.root.position).setY(0);
    this.landing = false;
    this.alt = 0;
    this.altTarget = m.flies ? 9 : 0;
    this.flyInput = 0;
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
    m.dispose();
    this.mount = null;
    this.landing = false;
    this.alt = 0;
    this.altTarget = 0;
    this.kid.root.position.y = 0;
    if (this.kid.rig) this.kid.rig.root.position.set(0, 0, 0);
    const shadow = this.kid.root.children[1];
    if (shadow) shadow.visible = true;
    // landed somewhere out over the sea? hop back onto the beach
    const r = Math.hypot(this.kid.root.position.x, this.kid.root.position.z);
    if (r > PARK_RADIUS) this.kid.root.position.multiplyScalar(PARK_RADIUS / r);
    if (this.pet) this.pet.root.position.set(this.kid.root.position.x + 1.6, 0, this.kid.root.position.z + 1);
  }

  /** While flying: +1 climb, -1 dive, 0 hold. */
  setFly(dir: number) {
    this.flyInput = Math.max(-1, Math.min(1, dir));
  }

  /** What we're riding right now (for the HUD). */
  get riding(): { kind: MountKind; flying: boolean; landing: boolean } | null {
    return this.mount ? { kind: this.mount.kind, flying: this.mount.flies && this.alt > 0.4, landing: this.landing } : null;
  }

  /** What the world feels like right now, for the soundscape: twilight glow, forest depth, sea closeness. */
  getAmbient(): { glow: number; forest: number; shore: number } {
    const a = this.park?.atmosphere;
    const p = this.kid?.root.position;
    const r = p ? Math.hypot(p.x, p.z) : 0;
    return { glow: a?.glow ?? 0, forest: a?.forest ?? 0, shore: Math.min(1, Math.max(0, (r - 78) / 36)) };
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function turnTowards(a: Actor, dt: number) {
  const diff = ((((a.facing - a.root.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  a.root.rotation.y += diff * Math.min(1, dt * 10);
}
