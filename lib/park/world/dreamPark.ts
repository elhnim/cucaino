// The kid's own Dream Park: a fenced candy lawn (lib/park/builder/rules.ts DREAM_ZONE) where
// pieces bought with tickets are placed. Owns the zone visuals, the placed piece objects and
// the build-mode ghost preview. Pure layout rules live in builder/rules.ts.
import * as THREE from "three";
import type { ParkAssets } from "../assets/loader";
import { getPiece } from "../registry/pieces";
import { DREAM_ZONE, canPlace, cellCenter, worldToCell, footprint, zoneBounds, type Placed } from "../builder/rules";

export interface DreamParkView {
  group: THREE.Group;
  /** objects that can be tapped in build mode (userData.pieceUid) */
  tappables(): THREE.Object3D[];
  setLayout(layout: Placed[]): Promise<void>;
  /** show a see-through preview of `pieceId` at world (x,z); returns snapped cell + validity */
  setGhost(pieceId: string | null, x?: number, z?: number, r?: number, ignoreUid?: string): { gx: number; gz: number; ok: boolean } | null;
  highlight(uid: string | null): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

function lawnTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      c.fillStyle = (x + y) % 2 ? "#c9f7de" : "#b3f0d0";
      c.fillRect(x * 32, y * 32, 32, 32);
    }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(DREAM_ZONE.cols / 2, DREAM_ZONE.rows / 2);
  return tex;
}

export async function createDreamPark(scene: THREE.Scene, assets: ParkAssets): Promise<DreamParkView> {
  const group = new THREE.Group();
  scene.add(group);
  const b = zoneBounds();
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  // candy-checker lawn so kids can see the build grid
  const lawnTex = track(lawnTexture());
  const lawn = new THREE.Mesh(track(new THREE.PlaneGeometry(w, d)), track(new THREE.MeshToonMaterial({ map: lawnTex })));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(b.minX + w / 2, 0.035, b.minZ + d / 2);
  group.add(lawn);

  // candy fence round the edge, leaving a gate on the side facing the plaza
  const fenceMats: THREE.Matrix4[] = [];
  const gateZ = b.minZ + d / 2;
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(DREAM_ZONE.cell, 2.2, DREAM_ZONE.cell);
  const addFence = (x: number, z: number, yaw: number) =>
    fenceMats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q.clone().setFromEuler(new THREE.Euler(0, yaw, 0)), s));
  for (let z = b.minZ + DREAM_ZONE.cell / 2; z < b.maxZ; z += DREAM_ZONE.cell) {
    if (Math.abs(z - gateZ) > 3) addFence(b.minX, z, 0);
    addFence(b.maxX, z, 0);
  }
  for (let x = b.minX + DREAM_ZONE.cell / 2; x < b.maxX; x += DREAM_ZONE.cell) {
    addFence(x, b.minZ, Math.PI / 2);
    addFence(x, b.maxZ, Math.PI / 2);
  }
  group.add(await assets.instanced("town", "fence", fenceMats));

  // placed pieces
  const placed = new Map<string, { obj: THREE.Object3D; piece: string; key: string }>();
  let pop: { obj: THREE.Object3D; t: number } | null = null;

  async function spawnPiece(p: Placed) {
    const def = getPiece(p.piece);
    if (!def) return null;
    const obj = await assets.spawn(def.kit, def.model);
    obj.scale.setScalar(def.scale);
    const c = cellCenter(p.piece, p.gx, p.gz, p.r);
    obj.position.set(c.x, 0.04, c.z);
    obj.rotation.y = (p.r * Math.PI) / 2;
    obj.traverse((o) => (o.userData.pieceUid = p.uid));
    return obj;
  }

  // ghost preview: a see-through clone + green/red footprint square
  let ghost: THREE.Object3D | null = null;
  let ghostPiece: string | null = null;
  const ghostMat = track(new THREE.MeshBasicMaterial({ color: 0xff8fc8, transparent: true, opacity: 0.72, depthWrite: false }));
  const footMat = track(new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.45, depthWrite: false }));
  const foot = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), footMat);
  foot.rotation.x = -Math.PI / 2;
  foot.position.y = 0.06;
  foot.visible = false;
  group.add(foot);

  const ring = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.08, 6, 32)), track(new THREE.MeshBasicMaterial({ color: 0xffd23f })));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  group.add(ring);

  let t = 0;
  return {
    group,
    tappables: () => [...placed.values()].map((p) => p.obj),
    async setLayout(layout) {
      const want = new Map(layout.map((p) => [p.uid, p]));
      for (const [uid, item] of placed) {
        const next = want.get(uid);
        if (!next || `${next.piece}:${next.gx}:${next.gz}:${next.r}` !== item.key) {
          group.remove(item.obj);
          placed.delete(uid);
        }
      }
      for (const p of layout) {
        if (placed.has(p.uid)) continue;
        const obj = await spawnPiece(p);
        if (!obj) continue;
        group.add(obj);
        placed.set(p.uid, { obj, piece: p.piece, key: `${p.piece}:${p.gx}:${p.gz}:${p.r}` });
        pop = { obj, t: 0 };
      }
    },
    setGhost(pieceId, x = 0, z = 0, r = 0, ignoreUid) {
      if (!pieceId) {
        if (ghost) group.remove(ghost);
        ghost = null;
        ghostPiece = null;
        foot.visible = false;
        return null;
      }
      const def = getPiece(pieceId);
      if (!def) return null;
      if (ghostPiece !== pieceId) {
        if (ghost) group.remove(ghost);
        ghost = null;
        ghostPiece = pieceId;
        void assets.spawn(def.kit, def.model).then((obj) => {
          if (ghostPiece !== pieceId) return;
          obj.scale.setScalar(def.scale);
          obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) m.material = ghostMat;
          });
          ghost = obj;
          group.add(obj);
          ghost.position.copy(foot.position).setY(0.05);
          ghost.rotation.y = (r * Math.PI) / 2;
        });
      }
      const cell = worldToCell(pieceId, x, z, r);
      const layoutNow: Placed[] = [...placed.entries()].map(([uid, v]) => {
        const [piece, gx, gz, rr] = v.key.split(":");
        return { uid, piece, gx: +gx, gz: +gz, r: +rr };
      });
      const ok = canPlace(layoutNow, pieceId, cell.gx, cell.gz, r, ignoreUid).ok;
      const c = cellCenter(pieceId, cell.gx, cell.gz, r);
      const fp = footprint(def, r);
      foot.visible = true;
      foot.scale.set(fp.w * DREAM_ZONE.cell, fp.d * DREAM_ZONE.cell, 1);
      foot.position.set(c.x, 0.06, c.z);
      footMat.color.set(ok ? 0x3ddc84 : 0xff4f6d);
      if (ghost) {
        ghost.position.set(c.x, 0.05, c.z);
        ghost.rotation.y = (r * Math.PI) / 2;
      }
      return { gx: cell.gx, gz: cell.gz, ok };
    },
    highlight(uid) {
      const item = uid ? placed.get(uid) : null;
      if (!item) {
        ring.visible = false;
        return;
      }
      const def = getPiece(item.piece);
      const fp = def ? Math.max(def.w, def.d) : 1;
      ring.visible = true;
      ring.scale.setScalar(fp * DREAM_ZONE.cell * 0.75);
      ring.position.set(item.obj.position.x, 0.12, item.obj.position.z);
    },
    update(dt) {
      t += dt;
      if (pop) {
        pop.t += dt;
        const k = Math.min(1, pop.t / 0.45);
        const def = getPiece(placed.get(pop.obj.userData.pieceUid as string)?.piece ?? "");
        const base = def?.scale ?? 1;
        // springy "boing" as a new piece lands
        pop.obj.scale.setScalar(base * (k < 1 ? 0.4 + 0.6 * k + Math.sin(k * Math.PI) * 0.25 : 1));
        if (k >= 1) pop = null;
      }
      if (ring.visible) ring.rotation.z = t * 1.5;
      if (ghost) ghost.position.y = 0.05 + Math.abs(Math.sin(t * 4)) * 0.3;
    },
    dispose() {
      scene.remove(group);
      for (const x of disposables) x.dispose();
    },
  };
}
