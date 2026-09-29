// A cute chibi wizard for the park: a flowing robe, a tall starry hat, a big fluffy beard and a
// staff topped with a glowing orb. Robe/hat colours come from the WizardDef. Idle animation:
// gentle float, beard sway, orb pulse, and turning to face the kid when they come close.
import * as THREE from "three";
import { getToonRamp } from "../assets/loader";

export interface WizardModel {
  root: THREE.Group;
  update(dt: number, t: number, lookAt: THREE.Vector3 | null, glow: number): void;
  dispose(): void;
}

export function buildWizardModel(opts: { robe: string; hat: string; beard?: string; skin?: string; orb?: string }): WizardModel {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const ramp = getToonRamp();
  const toon = (c: string) => track(new THREE.MeshToonMaterial({ color: c, gradientMap: ramp }));
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(track(g), m);

  const root = new THREE.Group();
  const body = new THREE.Group(); // floats + sways
  root.add(body);

  // robe: a soft bell shape with a trim
  const robePts = [0, 0.15, 0.4, 0.7, 1, 1.3, 1.55, 1.7].map((y, i) => new THREE.Vector2(0.95 - i * 0.075 - (y > 1.2 ? (y - 1.2) * 0.5 : 0), y));
  robePts.unshift(new THREE.Vector2(0.001, 0));
  robePts.push(new THREE.Vector2(0.001, 1.72));
  const robe = mesh(new THREE.LatheGeometry(robePts, 20), toon(opts.robe));
  const trim = mesh(new THREE.TorusGeometry(0.93, 0.07, 8, 28), toon("#ffe08a"));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.08;
  // little stars on the robe
  const starMat = toon("#fff3b0");
  for (let i = 0; i < 6; i++) {
    const s = mesh(new THREE.OctahedronGeometry(0.08, 0), starMat);
    const a = (i / 6) * Math.PI * 2;
    s.position.set(Math.sin(a) * 0.72, 0.45 + (i % 2) * 0.45, Math.cos(a) * 0.72);
    body.add(s);
  }
  body.add(robe, trim);

  // head
  const head = new THREE.Group();
  head.position.y = 2.15;
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.62, 18, 14), toon(opts.skin ?? "#ffd9c2")));
  // eyes (with sparkles) + blush + nose
  const eyeMat = toon("#2b1d2e");
  const hiMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  track(hiMat);
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.22, 0.05, 0.54);
    eye.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeMat));
    const hi = mesh(new THREE.SphereGeometry(0.035, 6, 5), hiMat);
    hi.position.set(0.03, 0.04, 0.07);
    eye.add(hi);
    head.add(eye);
    eyes.push(eye);
    const blush = mesh(new THREE.SphereGeometry(0.09, 8, 6), toon("#ff9fb8"));
    blush.scale.set(1.3, 0.7, 0.4);
    blush.position.set(side * 0.34, -0.12, 0.48);
    head.add(blush);
  }
  const nose = mesh(new THREE.SphereGeometry(0.09, 8, 6), toon("#ffb89c"));
  nose.position.set(0, -0.08, 0.6);
  head.add(nose);
  // big fluffy beard of puffs
  const beard = new THREE.Group();
  beard.position.set(0, -0.3, 0.3);
  const beardMat = toon(opts.beard ?? "#f4f1ff");
  [[0, -0.1, 0.18, 0.34], [-0.26, 0, 0.1, 0.24], [0.26, 0, 0.1, 0.24], [0, -0.45, 0.14, 0.26], [-0.15, -0.3, 0.12, 0.22], [0.15, -0.3, 0.12, 0.22], [0, -0.7, 0.08, 0.17]].forEach(([x, y, z, r]) => {
    const puff = mesh(new THREE.SphereGeometry(r, 10, 8), beardMat);
    puff.position.set(x, y, z);
    beard.add(puff);
  });
  const mous = [-1, 1].map((side) => {
    const m = mesh(new THREE.SphereGeometry(0.13, 8, 6), beardMat);
    m.scale.set(1.4, 0.6, 0.7);
    m.position.set(side * 0.13, 0.12, 0.28);
    return m;
  });
  beard.add(...mous);
  head.add(beard);
  // tall floppy starry hat
  const hat = new THREE.Group();
  hat.position.y = 0.42;
  const hatMat = toon(opts.hat);
  const brim = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 24), hatMat);
  const cone = new THREE.ConeGeometry(0.6, 1.5, 20, 6);
  // bend the tip over a little
  const pos = cone.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.75;
    pos.setX(i, pos.getX(i) + Math.pow(y / 1.5, 3) * 0.45);
  }
  cone.computeVertexNormals();
  const coneMesh = mesh(cone, hatMat);
  coneMesh.position.y = 0.78;
  const band = mesh(new THREE.TorusGeometry(0.56, 0.06, 6, 24), toon("#ffe08a"));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.12;
  const hatStar = mesh(new THREE.OctahedronGeometry(0.13, 0), toon("#fff3b0"));
  hatStar.position.set(0.12, 0.7, 0.5);
  hat.add(brim, coneMesh, band, hatStar);
  head.add(hat);

  // arms (sleeves) + staff with a glowing orb
  const sleeveMat = toon(opts.robe);
  const staffArm = new THREE.Group();
  staffArm.position.set(0.72, 1.45, 0.1);
  const sleeve = mesh(new THREE.CapsuleGeometry(0.16, 0.45, 4, 8), sleeveMat);
  sleeve.rotation.z = 0.6;
  sleeve.position.set(0.12, -0.15, 0);
  staffArm.add(sleeve);
  const staff = new THREE.Group();
  staff.position.set(0.35, -0.25, 0.1);
  staff.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), toon("#9a6a44")));
  const orbColor = new THREE.Color(opts.orb ?? "#8ff7ff");
  const orbMat = new THREE.MeshBasicMaterial({ color: orbColor.clone() });
  track(orbMat);
  const orb = mesh(new THREE.SphereGeometry(0.2, 14, 10), orbMat);
  orb.position.y = 1.42;
  const haloTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return track(new THREE.CanvasTexture(cv));
  })();
  const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: haloTex, color: orbColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.position.y = 1.42;
  staff.add(orb, halo);
  staffArm.add(staff);
  body.add(staffArm);
  const otherArm = mesh(new THREE.CapsuleGeometry(0.16, 0.45, 4, 8), sleeveMat);
  otherArm.position.set(-0.72, 1.35, 0.1);
  otherArm.rotation.z = -0.5;
  body.add(otherArm);

  // soft shadow
  const shadowTex = haloTex;
  const shadow = new THREE.Mesh(track(new THREE.CircleGeometry(1.1, 20)), track(new THREE.MeshBasicMaterial({ map: shadowTex, color: "#5a2a70", transparent: true, opacity: 0.35, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  let blinkT = 2;
  let facing = 0;
  const scale = 1.1;
  root.scale.setScalar(scale);

  return {
    root,
    update(dt, t, lookAt, glow) {
      body.position.y = 0.12 + Math.sin(t * 1.6) * 0.08;
      beard.rotation.z = Math.sin(t * 1.3) * 0.05;
      hat.rotation.z = Math.sin(t * 0.9) * 0.06;
      staffArm.rotation.x = Math.sin(t * 1.1) * 0.05;
      const pulse = 0.85 + Math.sin(t * 3) * 0.15;
      halo.scale.setScalar((0.9 + glow * 1.4) * pulse);
      (halo.material as THREE.SpriteMaterial).opacity = 0.35 + glow * 0.6;
      // blink
      blinkT -= dt;
      const closed = blinkT < 0.12;
      eyes.forEach((e) => (e.scale.y = closed ? 0.15 : 1));
      if (blinkT < 0) blinkT = 2 + Math.random() * 3;
      // turn to face the kid when they're near
      if (lookAt) {
        const want = Math.atan2(lookAt.x - root.position.x, lookAt.z - root.position.z);
        const diff = ((((want - facing + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        facing += diff * Math.min(1, dt * 3);
        root.rotation.y = facing;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** A name tag that sizes itself to the text (so long wizard names never get cut off). */
export function nameTag(text: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "900 44px system-ui, -apple-system, 'Segoe UI Emoji', sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 56;
  c.width = w;
  c.height = 80;
  g.font = font;
  const r = 32;
  const box = (x: number, y: number, bw: number, bh: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + bw, y, x + bw, y + bh, r);
    g.arcTo(x + bw, y + bh, x, y + bh, r);
    g.arcTo(x, y + bh, x, y, r);
    g.arcTo(x, y, x + bw, y, r);
    g.closePath();
  };
  g.fillStyle = "rgba(40,20,80,0.25)";
  box(4, 10, w - 8, 66);
  g.fill();
  g.fillStyle = "#ffffff";
  box(2, 2, w - 8, 66);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 6;
  box(2, 2, w - 8, 66);
  g.stroke();
  g.fillStyle = "#3b2a6a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2 - 2, 37);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const h = 0.95;
  s.scale.set((h * w) / 80, h, 1);
  return s;
}
