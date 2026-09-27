import * as THREE from "three";
import { buildVillage, LANDMARK_TRIGGER_RADIUS, type Village } from "./village";
import { buildCritter, type Critter } from "./character";
import { createTerrain, type Terrain } from "./terrain";
import { biomeFor } from "./biomes";
import { emojiSprite } from "./buildingKit";
import { makeSparkleTexture } from "./textures";
import { createSurprises, type Surprises, type SurpriseFind } from "./surprises";
import { ATTRACTIONS, attractionPosition, type AttractionInstance } from "./registry/attractions";
import type { AnimalDef } from "./registry/animals";
import { GROUND_BASE_Y } from "./terrainMath";
import type { Interior } from "./interiors/types";
import type { LandmarkKey } from "./types";
import type { ThemeId } from "@/lib/domain/types";

const WALK_SPEED = 7.2; // world units / second
const CAMERA_OFFSET = new THREE.Vector3(0, 15.5, 16.5);
const INTERIOR_CAMERA_OFFSET = new THREE.Vector3(0, 7.2, 7.6);
const MAX_DT = 1 / 20;
const PET_IDLE_ORBIT_AFTER_S = 1.6;

export type QualityTier = "standard" | "low";

/**
 * Two tiers only. "low" = older/cheaper tablets and reduced-motion users: no shadow maps,
 * no MSAA, lower pixel ratio, no plaza point lights. Everything else looks the same.
 */
export function detectQualityTier(): QualityTier {
  if (typeof window === "undefined") return "standard";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return cores <= 4 || mem <= 3 || reduced ? "low" : "standard";
}

export interface World3DOptions {
  playerAccent: string;
  /** which cute animal the kid plays as (registry/animals.ts); defaults to the classic fox */
  playerAnimal?: AnimalDef;
  petSpeciesColor?: string;
  /** full 3D look for the pet (registry/animals.ts animalForPetSpecies); falls back to a coloured critter */
  petAnimal?: AnimalDef;
  /** Kid theme, used to pick the outdoor biome palette (sky/fog/grass tint). */
  themeId?: ThemeId;
  /** Stable per-kid seed so the endless terrain generates the same world across sessions. */
  worldSeed?: number;
  /** Force a quality tier; defaults to detectQualityTier(). */
  quality?: QualityTier;
  onArrive: (key: LandmarkKey) => void;
  /** Fired when the player walks up to an interactive prop inside the current interior. */
  onZone?: (key: string) => void;
  onSparkle: (totalCollected: number) => void;
  /** Fired when the kid taps their pet in the 3D scene. */
  onPetTap?: () => void;
  /** Fired when the kid walks up to a plaza attraction (registry/attractions.ts). */
  onAttraction?: (id: string) => void;
  /** Fired when the kid discovers a hidden surprise out in the countryside. */
  onSurprise?: (find: SurpriseFind) => void;
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      for (const key of Object.keys(m) as (keyof THREE.Material)[]) {
        const value = m[key];
        if (value instanceof THREE.Texture) value.dispose();
      }
      m.dispose();
    }
  });
}

interface Burst {
  pts: THREE.Points;
  scene: THREE.Scene;
  vel: Float32Array;
  life: number;
  maxLife: number;
}

const CONFETTI_COLORS = [0xff5d8f, 0xffd447, 0x4ade80, 0x60a5fa, 0xc084fc, 0xfb923c];

export class World3D {
  readonly quality: QualityTier;
  private renderer: THREE.WebGLRenderer;
  private exteriorScene = new THREE.Scene();
  private activeScene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private village: Village;
  private terrain: Terrain;
  private player: Critter;
  private pet: Critter | null;
  private petBubble: THREE.Sprite | null = null;
  private petBubbleEmoji: string | null = null;
  private beacons = new Map<string, { sprite: THREE.Sprite; emoji: string; baseY: number }>();
  private surprises: Surprises;
  private attractions: { id: string; position: THREE.Vector3; inst: AttractionInstance }[] = [];
  private nearAttraction: string | null = null;
  private container: HTMLElement;
  private clock = new THREE.Clock();
  private moveVec = { x: 0, y: 0 };
  private mode: "exterior" | "interior" = "exterior";
  private interior: Interior | null = null;
  private exteriorReturn: THREE.Vector3 | null = null;
  private enteredFrom: LandmarkKey | null = null;
  private nearLandmark: LandmarkKey | null = null;
  private nearZone: string | null = null;
  private sparklesCollected = 0;
  private idleT = 0;
  private time = 0;
  private bursts: Burst[] = [];
  private sparkTex: THREE.CanvasTexture;
  private raycaster = new THREE.Raycaster();
  private frameId = 0;
  private running = false;
  private paused = false;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private opts: World3DOptions;
  private inputEnabled = true;

  constructor(container: HTMLElement, opts: World3DOptions) {
    this.container = container;
    this.opts = opts;
    this.quality = opts.quality ?? detectQualityTier();
    const low = this.quality === "low";

    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: low ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2; // keeps white animals (bunny, panda, unicorn) from reading grey
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.activeScene = this.exteriorScene;
    this.sparkTex = makeSparkleTexture();

    const biome = biomeFor(opts.themeId);
    this.village = buildVillage(this.exteriorScene, opts.playerAccent, { biome, lowQuality: low });
    this.terrain = createTerrain(this.exteriorScene, { seed: opts.worldSeed ?? 1337, grassTint: biome.grassTint });

    this.surprises = createSurprises(this.exteriorScene, { seed: opts.worldSeed ?? 1337, heightAt: this.terrain.heightAt });
    for (const def of ATTRACTIONS) {
      const position = attractionPosition(def, GROUND_BASE_Y);
      const inst = def.build({ scene: this.exteriorScene, accent: opts.playerAccent, position });
      this.attractions.push({ id: def.id, position, inst });
    }

    this.player = this.makePlayer(opts.playerAnimal);
    this.player.root.position.copy(this.village.spawnPoint);
    this.exteriorScene.add(this.player.root);

    if (opts.petSpeciesColor) {
      this.pet = buildCritter({
        bodyColor: opts.petSpeciesColor,
        bellyColor: "#fff2e0",
        accentColor: opts.playerAccent,
        scale: 0.62,
        earStyle: "round",
        animal: opts.petAnimal,
      });
      this.pet.root.position.copy(this.village.spawnPoint).add(new THREE.Vector3(1.6, 0, 1.6));
      this.exteriorScene.add(this.pet.root);
    } else {
      this.pet = null;
    }

    // stream in the chunks around the spawn point before the first frame renders
    this.terrain.update(this.player.root.position);

    // start the camera already in place, so the first rendered frame isn't a fly-in from the origin
    this.camera.position.copy(this.player.root.position).add(CAMERA_OFFSET);
    this.camera.lookAt(this.player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)));

    this.applySize();
    this.resizeObserver = new ResizeObserver(() => this.applySize());
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.start();
  }

  setMoveVector(x: number, y: number) {
    this.moveVec.x = x;
    this.moveVec.y = y;
  }

  setInputEnabled(on: boolean) {
    this.inputEnabled = on;
    if (!on) this.moveVec = { x: 0, y: 0 };
  }

  private makePlayer(animal?: AnimalDef): Critter {
    return buildCritter({
      bodyColor: "#f3cf8f",
      bellyColor: "#fff6e6",
      accentColor: this.opts.playerAccent,
      scale: 1.15,
      earStyle: "fox",
      animal,
    });
  }

  /** Swap the kid's character live (in-world wardrobe) — keeps position/facing, plays a hop. */
  setPlayerAnimal(animal: AnimalDef) {
    const old = this.player;
    const parent = old.root.parent;
    const next = this.makePlayer(animal);
    next.root.position.copy(old.root.position);
    next.root.rotation.y = old.root.rotation.y;
    next.setFacingAngle(old.root.rotation.y);
    parent?.remove(old.root);
    disposeObject3D(old.root);
    parent?.add(next.root);
    this.player = next;
    next.celebrate();
    this.spawnBurst(next.root.position.clone().setY(next.root.position.y + 1.4), 24, CONFETTI_COLORS, 0.8);
  }

  /** Say hi: the player waves (used on arrival / greeting). */
  waveHello() {
    this.player.wave();
  }

  /** Drive an attraction's look from React (e.g. daily gift ready, fireworks on). */
  setAttractionState(id: string, state: Record<string, unknown>) {
    this.attractions.find((a) => a.id === id)?.inst.setState?.(state);
  }

  /** A sparkle burst at an attraction, e.g. when the daily gift is opened. */
  burstAt(id: string) {
    const a = this.attractions.find((x) => x.id === id);
    if (a) this.spawnBurst(a.position.clone().setY(a.position.y + 1.6), 36, CONFETTI_COLORS, 1);
  }

  /** Stop rendering entirely, e.g. while a full-screen overlay (quiz) hides the canvas. Saves battery. */
  setPaused(on: boolean) {
    this.paused = on;
    if (on) this.stop();
    else if (!document.hidden) this.start();
  }

  celebratePet() {
    this.pet?.celebrate();
    if (this.pet) this.spawnBurst(this.pet.root.position.clone().setY(this.pet.root.position.y + 1), 14, [0xff7aa8], 0.6);
  }

  /** Confetti around the player + a happy pet: used when a chore is done or a reward claimed. */
  celebrate() {
    this.player.celebrate();
    this.pet?.celebrate();
    this.spawnBurst(this.player.root.position.clone().setY(this.player.root.position.y + 2.2), 40, CONFETTI_COLORS, 1.1);
  }

  /** Floating emoji over the pet's head (hungry / dirty / sleepy ...). null hides it. */
  setPetMood(emoji: string | null) {
    if (!this.pet || emoji === this.petBubbleEmoji) return;
    this.petBubbleEmoji = emoji;
    if (this.petBubble) {
      this.pet.root.remove(this.petBubble);
      disposeObject3D(this.petBubble);
      this.petBubble = null;
    }
    if (!emoji) return;
    const bubble = emojiSprite(emoji, 1.7);
    bubble.position.set(0, 3.2, 0); // in the pet's local (pre-scale) space
    this.pet.root.add(bubble);
    this.petBubble = bubble;
  }

  /**
   * A bobbing emoji beacon over a landmark, e.g. "❗" on the Schedule barn while chores are
   * left, or "🍽️" on Pet Home when the pet is hungry. Guides kids to what needs doing.
   */
  setBeacon(key: LandmarkKey | string, emoji: string | null) {
    const existing = this.beacons.get(key);
    if (existing && existing.emoji === emoji) return;
    if (existing) {
      this.exteriorScene.remove(existing.sprite);
      disposeObject3D(existing.sprite);
      this.beacons.delete(key);
    }
    if (!emoji) return;
    const node = this.village.landmarks.find((l) => l.key === key);
    const attraction = this.attractions.find((a) => a.id === key);
    const at = node?.position ?? attraction?.position;
    if (!at) return;
    const sprite = emojiSprite(emoji, 1.9);
    const baseY = node ? node.position.y + node.radius + 4.6 : at.y + 4.2;
    sprite.position.set(at.x, baseY, at.z);
    this.exteriorScene.add(sprite);
    this.beacons.set(key, { sprite, emoji, baseY });
  }

  /** Walks the player into a freshly-built interior room, remembering where to put them back outside. */
  enterInterior(build: (accent: string) => Interior, from?: LandmarkKey) {
    if (this.mode === "interior") return;
    this.exteriorReturn = this.player.root.position.clone();
    this.enteredFrom = from ?? this.nearLandmark;
    this.exteriorScene.remove(this.player.root);
    if (this.pet) this.exteriorScene.remove(this.pet.root);

    const interior = build(this.opts.playerAccent);
    this.interior = interior;
    this.activeScene = interior.scene;
    this.mode = "interior";
    this.nearZone = null;

    this.player.root.position.copy(interior.spawnPoint);
    this.player.setFacingAngle(Math.PI); // face into the room
    interior.scene.add(this.player.root);
    if (this.pet) {
      this.pet.root.position.copy(interior.spawnPoint).add(new THREE.Vector3(1.1, 0, 0.4));
      interior.scene.add(this.pet.root);
    }
    this.snapCamera();
  }

  /** Leaves the current interior, disposing it, and puts the player back just outside the door. */
  exitInterior() {
    const interior = this.interior;
    if (this.mode !== "interior" || !interior) return;

    interior.scene.remove(this.player.root);
    if (this.pet) interior.scene.remove(this.pet.root);
    this.clearBursts(interior.scene);
    interior.dispose();
    this.interior = null;
    this.activeScene = this.exteriorScene;
    this.mode = "exterior";
    this.nearZone = null;

    const node = this.village.landmarks.find((l) => l.key === this.enteredFrom);
    if (node) {
      // Step back out onto the path, clear of the entrance trigger — otherwise the very next
      // frame would see the player standing in the doorway and walk them straight back in.
      const toPlaza = node.position.clone().setY(0).normalize().multiplyScalar(-1);
      const out = node.position.clone().add(toPlaza.multiplyScalar(node.radius + LANDMARK_TRIGGER_RADIUS + 1.2));
      this.player.root.position.set(out.x, 0, out.z);
      this.player.setFacingAngle(Math.atan2(toPlaza.x, toPlaza.z));
    } else if (this.exteriorReturn) {
      this.player.root.position.copy(this.exteriorReturn);
    }
    // belt and braces: even if the step-out lands inside a trigger, don't re-fire until they leave it
    this.nearLandmark = this.enteredFrom;
    this.enteredFrom = null;

    this.player.root.position.y = this.terrain.heightAt(this.player.root.position.x, this.player.root.position.z);
    this.exteriorScene.add(this.player.root);
    if (this.pet) {
      this.pet.root.position.copy(this.player.root.position).add(new THREE.Vector3(1.6, 0, 1.6));
      this.pet.root.position.y = this.terrain.heightAt(this.pet.root.position.x, this.pet.root.position.z);
      this.exteriorScene.add(this.pet.root);
    }
    this.exteriorReturn = null;
    this.snapCamera();
  }

  private snapCamera() {
    const offset = this.mode === "interior" ? (this.interior?.cameraOffset ?? INTERIOR_CAMERA_OFFSET) : CAMERA_OFFSET;
    this.camera.position.copy(this.player.root.position).add(offset);
    this.camera.lookAt(this.player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
  }

  private start() {
    if (this.running || this.disposed || this.paused) return;
    this.running = true;
    this.clock.getDelta(); // swallow the time spent stopped so nothing jumps
    this.frameId = requestAnimationFrame(this.tick);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else if (!this.paused) this.start();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.pet) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.intersectObject(this.pet.root, true).length > 0) {
      this.celebratePet();
      this.opts.onPetTap?.();
    }
  };

  private applySize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    // a resize while stopped would otherwise leave a stretched/blank canvas until the next frame
    if (!this.running && !this.disposed) this.renderer.render(this.activeScene, this.camera);
  }

  private clampToRoom(x: number, z: number): { x: number; z: number } {
    const room = this.interior;
    if (!room) return { x, z };
    if (room.rect) {
      return {
        x: Math.max(-room.rect.halfX, Math.min(room.rect.halfX, x)),
        z: Math.max(-room.rect.halfZ, Math.min(room.rect.halfZ, z)),
      };
    }
    const r = Math.hypot(x, z);
    return r > room.bounds ? { x: (x * room.bounds) / r, z: (z * room.bounds) / r } : { x, z };
  }

  /** Ground height under (x, z): terrain outdoors, or the current room's flat floor indoors. */
  private groundY(x: number, z: number): number {
    if (this.mode === "interior" && this.interior) return this.interior.spawnPoint.y;
    return this.terrain.heightAt(x, z);
  }

  private spawnBurst(pos: THREE.Vector3, n: number, colors: number[], size: number) {
    const positions = new Float32Array(n * 3);
    const cols = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      vel[i * 3] = (Math.random() - 0.5) * 5;
      vel[i * 3 + 1] = Math.random() * 4 + 2;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 5;
      c.setHex(colors[i % colors.length]);
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({ map: this.sparkTex, size, vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.activeScene.add(pts);
    this.bursts.push({ pts, scene: this.activeScene, vel, life: 1.2, maxLife: 1.2 });
  }

  private updateBursts(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const pos = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let k = 0; k < b.vel.length; k += 3) {
        b.vel[k + 1] -= dt * 6;
        arr[k] += b.vel[k] * dt;
        arr[k + 1] += b.vel[k + 1] * dt;
        arr[k + 2] += b.vel[k + 2] * dt;
      }
      pos.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / b.maxLife);
      if (b.life <= 0) {
        b.scene.remove(b.pts);
        b.pts.geometry.dispose();
        (b.pts.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  private clearBursts(scene: THREE.Scene) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      if (this.bursts[i].scene !== scene) continue;
      const b = this.bursts[i];
      scene.remove(b.pts);
      b.pts.geometry.dispose();
      (b.pts.material as THREE.Material).dispose();
      this.bursts.splice(i, 1);
    }
  }

  private tick = () => {
    if (this.disposed || !this.running) return;
    const dt = Math.min(this.clock.getDelta(), MAX_DT);
    this.time += dt;

    const mag = Math.hypot(this.moveVec.x, this.moveVec.y);
    const moving = this.inputEnabled && mag > 0.12;
    if (moving) {
      const scale = Math.min(mag, 1);
      const dx = (this.moveVec.x / mag) * scale;
      const dz = -(this.moveVec.y / mag) * scale;
      let nextX = this.player.root.position.x + dx * WALK_SPEED * dt;
      let nextZ = this.player.root.position.z + dz * WALK_SPEED * dt;
      if (this.mode === "interior" && this.interior) {
        const c = this.clampToRoom(nextX, nextZ);
        nextX = c.x;
        nextZ = c.z;
      }
      this.player.root.position.x = nextX;
      this.player.root.position.z = nextZ;
      this.player.setFacingAngle(Math.atan2(dx, dz));
      this.idleT = 0;
    } else {
      this.idleT += dt;
    }
    this.player.root.position.y = this.groundY(this.player.root.position.x, this.player.root.position.z);
    this.player.update(dt, moving);
    if (this.mode === "exterior") this.terrain.update(this.player.root.position);

    if (this.pet) {
      // Follows behind while walking; once the kid stands still the pet trots little circles
      // around them, so it always feels alive and pleased to be with them.
      let target: THREE.Vector3;
      // A surprise nearby? The pet dashes over and bounces beside it to show the kid the way.
      const hint = this.mode === "exterior" ? this.surprises.nearest(this.player.root.position, 16) : null;
      if (hint) {
        target = hint.clone().add(new THREE.Vector3(1.4, 0, 1.4));
      } else if (this.idleT > PET_IDLE_ORBIT_AFTER_S) {
        const a = this.time * 0.9;
        target = this.player.root.position.clone().add(new THREE.Vector3(Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2));
      } else {
        const behind = new THREE.Vector3(Math.sin(this.player.root.rotation.y), 0, Math.cos(this.player.root.rotation.y)).multiplyScalar(-2.1);
        target = this.player.root.position.clone().add(behind);
      }
      const before = this.pet.root.position.clone();
      if (this.mode === "interior" && this.interior) {
        const c = this.clampToRoom(target.x, target.z);
        target.x = c.x;
        target.z = c.z;
      }
      this.pet.root.position.lerp(target, Math.min(1, dt * (hint ? 2.2 : 3.6)));
      this.pet.root.position.y = this.groundY(this.pet.root.position.x, this.pet.root.position.z);
      const moved = this.pet.root.position.distanceTo(before) > 0.005;
      if (moved) {
        const dir = this.pet.root.position.clone().sub(before);
        this.pet.setFacingAngle(Math.atan2(dir.x, dir.z));
      }
      this.pet.update(dt, moved);
      if (hint && !moved && Math.random() < dt * 1.5) this.pet.celebrate(); // "over here!"
      if (this.petBubble) this.petBubble.position.y = 3.2 + Math.sin(this.time * 3) * 0.15;
    }

    if (this.mode === "exterior") {
      const collected = this.village.update(dt, this.player.root.position);
      if (collected > 0) {
        this.sparklesCollected += collected;
        this.opts.onSparkle(this.sparklesCollected);
      }
      const find = this.surprises.update(dt, this.player.root.position);
      if (find) {
        this.spawnBurst(this.player.root.position.clone().setY(this.player.root.position.y + 1.5), 40, CONFETTI_COLORS, 1);
        this.player.celebrate();
        this.pet?.celebrate();
        this.sparklesCollected += find.sparkles;
        this.opts.onSparkle(this.sparklesCollected);
        this.opts.onSurprise?.(find);
      }
      for (const a of this.attractions) a.inst.update(dt, this.time);
      for (const b of this.beacons.values()) {
        b.sprite.position.y = b.baseY + Math.sin(this.time * 2.6) * 0.35;
        const pulse = 1.9 * (1 + Math.sin(this.time * 5.2) * 0.06);
        b.sprite.scale.set(pulse, pulse, 1);
      }
    } else {
      this.interior?.update?.(dt, this.player.root.position);
    }
    this.updateBursts(dt);

    if (this.inputEnabled) {
      if (this.mode === "exterior") {
        let found: LandmarkKey | null = null;
        for (const l of this.village.landmarks) {
          const d = Math.hypot(this.player.root.position.x - l.position.x, this.player.root.position.z - l.position.z);
          if (d < l.radius + LANDMARK_TRIGGER_RADIUS) {
            found = l.key;
            break;
          }
        }
        if (found && found !== this.nearLandmark) {
          this.nearLandmark = found;
          this.opts.onArrive(found);
        } else if (!found) {
          this.nearLandmark = null;
        }
        let nearA: string | null = null;
        for (const a of this.attractions) {
          const d = Math.hypot(this.player.root.position.x - a.position.x, this.player.root.position.z - a.position.z);
          if (d < a.inst.radius + 1.3) {
            nearA = a.id;
            break;
          }
        }
        if (nearA && nearA !== this.nearAttraction) this.opts.onAttraction?.(nearA);
        this.nearAttraction = nearA;
      } else if (this.interior) {
        let found: string | null = null;
        for (const z of this.interior.zones) {
          const d = Math.hypot(this.player.root.position.x - z.position.x, this.player.root.position.z - z.position.z);
          if (d < z.radius) {
            found = z.key;
            break;
          }
        }
        if (found && found !== this.nearZone) {
          this.nearZone = found;
          this.opts.onZone?.(found);
        } else if (!found) {
          this.nearZone = null;
        }
      }
    }

    const offset = this.mode === "interior" ? (this.interior?.cameraOffset ?? INTERIOR_CAMERA_OFFSET) : CAMERA_OFFSET;
    const desired = this.player.root.position.clone().add(offset);
    this.camera.position.lerp(desired, Math.min(1, dt * 4));
    const lookAt = this.player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.camera.lookAt(lookAt);

    this.renderer.render(this.activeScene, this.camera);
    this.frameId = requestAnimationFrame(this.tick);
  };

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.interior) {
      this.clearBursts(this.interior.scene);
      this.interior.dispose();
    }
    this.clearBursts(this.exteriorScene);
    // terrain owns pooled geometries/materials with their own lifetime rules, so it disposes
    // itself explicitly rather than relying on the generic sweep below.
    this.terrain.dispose();
    this.surprises.dispose();
    for (const a of this.attractions) a.inst.dispose();
    for (const b of this.beacons.values()) disposeObject3D(b.sprite);
    disposeObject3D(this.exteriorScene);
    disposeObject3D(this.player.root);
    if (this.pet) disposeObject3D(this.pet.root);
    this.sparkTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
