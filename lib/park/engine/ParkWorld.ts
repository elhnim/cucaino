// Cucaino Park runtime: one renderer, the candy park scene, the kid's animal + pet, input,
// camera and effects. React (components/park/*) owns every 2D overlay and talks to this
// class through a few methods + callbacks.
import * as THREE from "three";
import { ParkAssets, type AnimalId } from "../assets/loader";
import { DEFAULT_CANDY, THEME_CANDY_HUE } from "../assets/candy";
import { buildPark, type BuiltPark } from "../world/buildPark";
import { createDreamPark, type DreamParkView } from "../world/dreamPark";
import { zoneBounds, type Placed } from "../builder/rules";
import { SPAWN, type PlaceDef } from "../registry/places";
import { emojiSprite } from "@/lib/game3d/buildingKit";
import { makeSparkleTexture } from "@/lib/game3d/textures";

export type QualityTier = "standard" | "low";

export function detectQuality(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3 || reduced ? "low" : "standard";
}

export interface ParkWorldOptions {
  kidAnimal: AnimalId;
  petAnimal?: AnimalId | null;
  themeId?: string;
  quality?: QualityTier;
  /** kid walked into / tapped a place */
  onPlace?: (place: PlaceDef) => void;
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
  private kid: Actor | null = null;
  private pet: Actor | null = null;
  private clock = new THREE.Clock();
  private time = 0;
  private move = { x: 0, y: 0 };
  private walkTarget: THREE.Vector3 | null = null;
  private inputOn = true;
  private nearPlace: string | null = null;
  private idleT = 0;
  private beacons = new Map<string, { sprite: THREE.Sprite; base: number }>();
  private bursts: { pts: THREE.Points; vel: Float32Array; life: number }[] = [];
  private sparkTex = makeSparkleTexture();
  private raycaster = new THREE.Raycaster();
  private downAt: { x: number; y: number; t: number } | null = null;
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
    this.assets = new ParkAssets({ ...DEFAULT_CANDY, neutralHue: THEME_CANDY_HUE[opts.themeId ?? ""] ?? DEFAULT_CANDY.neutralHue });
    this.camera.position.set(SPAWN.x, 0, SPAWN.z).add(CAM_OFFSET);
    this.camera.lookAt(SPAWN.x, 1, SPAWN.z);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    void this.boot();
  }

  // ── public API ──
  setMove(x: number, y: number) {
    this.move = { x, y };
    if (Math.hypot(x, y) > 0.1) this.walkTarget = null;
  }
  setInputEnabled(on: boolean) {
    this.inputOn = on;
    if (!on) {
      this.move = { x: 0, y: 0 };
      this.walkTarget = null;
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
    const place = this.park?.places.find((p) => p.id === placeId);
    if (!emoji || !place) return;
    const s = emojiSprite(emoji, 2);
    const base = place.signY + 2;
    s.position.set(place.x, base, place.z);
    this.scene.add(s);
    this.beacons.set(placeId, { sprite: s, base });
  }
  // ── Dream Park builder ──
  async setLayout(layout: Placed[]) {
    await this.dream?.setLayout(layout);
  }
  /** Build mode: camera swoops overhead the Dream Park lawn and taps go to the builder. */
  setBuildMode(on: boolean) {
    this.building = on;
    this.walkTarget = null;
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

  /** Swap the kid's animal live (dress-up). */
  async setKidAnimal(id: AnimalId) {
    const next = await this.makeActor(id, 2.1);
    if (this.disposed) return;
    if (this.kid) {
      next.root.position.copy(this.kid.root.position);
      next.facing = this.kid.facing;
      this.scene.remove(this.kid.root);
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
        buildPark(this.scene, this.assets),
        createDreamPark(this.scene, this.assets),
        this.makeActor(this.opts.kidAnimal, 2.1),
        this.opts.petAnimal ? this.makeActor(this.opts.petAnimal, 1.25) : Promise.resolve(null),
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
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  private async makeActor(id: AnimalId, height: number): Promise<Actor> {
    const { root: model, clips } = await this.assets.spawnAnimal(id);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    model.scale.setScalar(height / h);
    const root = new THREE.Group();
    root.add(model, blobShadow(height * 1.3));
    const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of clips) if (mixer) actions.set(clip.name, mixer.clipAction(clip));
    const actor: Actor = { root, mixer, actions, current: "", facing: 0 };
    this.play(actor, "idle");
    return actor;
  }

  private play(a: Actor, name: string, once = false) {
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
  private onDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  private onUp = (e: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    if (!d || !this.park || (!this.inputOn && !this.building)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || performance.now() - d.t > 500) return; // a drag, not a tap
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
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
      const place = this.park.places.find((p) => p.id === placeId);
      if (place) {
        // walk to the door, it opens on arrival
        const dir = new THREE.Vector3(-place.x, 0, -place.z).normalize();
        this.walkTarget = new THREE.Vector3(place.x, 0, place.z).addScaledVector(dir, place.radius + 1.4);
        this.nearPlace = null;
        return;
      }
    }
    const ground = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) this.walkTarget = ground;
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
    this.renderer.setSize(w, h);
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

    // movement: joystick first, else tap-to-walk target
    let vx = 0;
    let vz = 0;
    if (this.inputOn) {
      const mag = Math.hypot(this.move.x, this.move.y);
      if (mag > 0.12) {
        vx = (this.move.x / mag) * Math.min(1, mag);
        vz = (-this.move.y / mag) * Math.min(1, mag);
      } else if (this.walkTarget) {
        const dx = this.walkTarget.x - pos.x;
        const dz = this.walkTarget.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) this.walkTarget = null;
        else {
          vx = dx / d;
          vz = dz / d;
        }
      }
    }
    const moving = Math.hypot(vx, vz) > 0.01;
    if (moving) {
      pos.x += vx * WALK_SPEED * dt;
      pos.z += vz * WALK_SPEED * dt;
      kid.facing = Math.atan2(vx, vz);
      this.idleT = 0;
    } else this.idleT += dt;
    // keep inside the park and out of buildings
    const r = Math.hypot(pos.x, pos.z);
    if (r > 75) pos.multiplyScalar(75 / r);
    for (const p of this.park.places) {
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
    if (kid.current === "idle" || kid.current === "walk" || kid.current === "run" || kid.current === "") this.play(kid, moving ? "walk" : "idle");
    kid.mixer?.update(dt);

    // pet: follows behind, trots circles round the kid when idle
    if (this.pet) {
      const pet = this.pet;
      const target =
        this.idleT > 2
          ? new THREE.Vector3(pos.x + Math.sin(this.time * 0.9) * 2.4, 0, pos.z + Math.cos(this.time * 0.9) * 2.4)
          : new THREE.Vector3(pos.x - Math.sin(kid.facing) * 2, 0, pos.z - Math.cos(kid.facing) * 2);
      const before = pet.root.position.clone();
      pet.root.position.lerp(target, Math.min(1, dt * 3.5));
      const step = pet.root.position.clone().sub(before);
      const petMoving = step.length() > 0.01;
      if (petMoving) pet.facing = Math.atan2(step.x, step.z);
      turnTowards(pet, dt);
      if (pet.current === "idle" || pet.current === "walk" || pet.current === "") this.play(pet, petMoving ? "walk" : "idle");
      pet.mixer?.update(dt);
    }

    // doors
    if (this.inputOn) {
      let found: PlaceDef | null = null;
      for (const p of this.park.places) {
        if (p.doorRadius <= 0) continue;
        if (Math.hypot(pos.x - p.x, pos.z - p.z) < p.doorRadius) {
          found = p;
          break;
        }
      }
      if (found && found.id !== this.nearPlace) {
        this.walkTarget = null;
        this.opts.onPlace?.(found);
      }
      this.nearPlace = found?.id ?? null;
    }

    this.park.update(dt, this.time);
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
      const desired = pos.clone().add(CAM_OFFSET);
      this.camera.position.lerp(desired, Math.min(1, dt * 3.5));
      this.camera.lookAt(pos.x, 1.2, pos.z);
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Leave a place: step back out of its door so it doesn't reopen straight away. */
  stepOutOf(placeId: string) {
    const p = this.park?.places.find((x) => x.id === placeId);
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
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.park?.dispose();
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
