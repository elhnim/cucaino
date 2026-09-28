import * as THREE from "three";
import { buildVillage, ISLAND_RADIUS, LANDMARK_TRIGGER_RADIUS, type Village } from "./village";
import { buildCritter, type Critter } from "./character";
import type { LandmarkKey } from "./types";

const WALK_SPEED = 7.2; // world units / second
const CAMERA_OFFSET = new THREE.Vector3(0, 15.5, 16.5);
const MAX_DT = 1 / 20;

export interface World3DOptions {
  playerAccent: string;
  petSpeciesColor?: string;
  onArrive: (key: LandmarkKey) => void;
  onSparkle: (totalCollected: number) => void;
}

export class World3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private village: Village;
  private player: Critter;
  private pet: Critter | null;
  private container: HTMLElement;
  private clock = new THREE.Clock();
  private moveVec = { x: 0, y: 0 };
  private nearLandmark: LandmarkKey | null = null;
  private sparklesCollected = 0;
  private frameId = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private opts: World3DOptions;
  private inputEnabled = true;

  constructor(container: HTMLElement, opts: World3DOptions) {
    this.container = container;
    this.opts = opts;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

    this.village = buildVillage(this.scene, opts.playerAccent);

    this.player = buildCritter({
      bodyColor: "#f3cf8f",
      bellyColor: "#fff6e6",
      accentColor: opts.playerAccent,
      scale: 1.15,
      earStyle: "fox",
    });
    this.player.root.position.copy(this.village.spawnPoint);
    this.scene.add(this.player.root);

    if (opts.petSpeciesColor) {
      this.pet = buildCritter({
        bodyColor: opts.petSpeciesColor,
        bellyColor: "#fff2e0",
        accentColor: opts.playerAccent,
        scale: 0.62,
        earStyle: "round",
      });
      this.pet.root.position.copy(this.village.spawnPoint).add(new THREE.Vector3(1.6, 0, 1.6));
      this.scene.add(this.pet.root);
    } else {
      this.pet = null;
    }

    // start the camera already in place, so the first rendered frame isn't a fly-in from the origin
    this.camera.position.copy(this.player.root.position).add(CAMERA_OFFSET);
    this.camera.lookAt(this.player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)));

    this.applySize();
    this.resizeObserver = new ResizeObserver(() => this.applySize());
    this.resizeObserver.observe(container);

    this.frameId = requestAnimationFrame(this.tick);
  }

  setMoveVector(x: number, y: number) {
    this.moveVec.x = x;
    this.moveVec.y = y;
  }

  setInputEnabled(on: boolean) {
    this.inputEnabled = on;
    if (!on) this.moveVec = { x: 0, y: 0 };
  }

  celebratePet() {
    this.pet?.celebrate();
  }

  private applySize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private tick = () => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), MAX_DT);

    const mag = Math.hypot(this.moveVec.x, this.moveVec.y);
    const moving = this.inputEnabled && mag > 0.12;
    if (moving) {
      const scale = Math.min(mag, 1);
      const dx = (this.moveVec.x / mag) * scale;
      const dz = -(this.moveVec.y / mag) * scale;
      const next = this.player.root.position.clone();
      next.x += dx * WALK_SPEED * dt;
      next.z += dz * WALK_SPEED * dt;
      const r = Math.hypot(next.x, next.z);
      if (r > ISLAND_RADIUS - 3) {
        const k = (ISLAND_RADIUS - 3) / r;
        next.x *= k;
        next.z *= k;
      }
      this.player.root.position.x = next.x;
      this.player.root.position.z = next.z;
      this.player.setFacingAngle(Math.atan2(dx, dz));
    }
    this.player.update(dt, moving);

    if (this.pet) {
      const behind = new THREE.Vector3(Math.sin(this.player.root.rotation.y), 0, Math.cos(this.player.root.rotation.y)).multiplyScalar(-2.1);
      const leash = this.player.root.position.clone().add(behind);
      const before = this.pet.root.position.clone();
      this.pet.root.position.lerp(leash, Math.min(1, dt * 3.6));
      const moved = this.pet.root.position.distanceTo(before) > 0.005;
      if (moved) {
        const dir = this.pet.root.position.clone().sub(before);
        this.pet.setFacingAngle(Math.atan2(dir.x, dir.z));
      }
      this.pet.update(dt, moved);
    }

    const collected = this.village.update(dt, this.player.root.position);
    if (collected > 0) {
      this.sparklesCollected += collected;
      this.opts.onSparkle(this.sparklesCollected);
    }

    if (this.inputEnabled) {
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
    }

    const desired = this.player.root.position.clone().add(CAMERA_OFFSET);
    this.camera.position.lerp(desired, Math.min(1, dt * 4));
    const lookAt = this.player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.camera.lookAt(lookAt);

    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.tick);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.scene.traverse((obj) => {
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
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
