// ROAD RACER — a top-down highway dash. Hold ▲/A to speed up, ▼/B to brake and steer ◀ ▶
// around slow trucks and weaving cars. The road bends, narrows and widens; grass slows you
// down, oil slicks send you spinning, fuel cans keep the tank topped up and every checkpoint
// adds time to the clock. Run out of fuel or time and the race is over.
// (Original game in the spirit of 8-bit top-down racers.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, fbm, hash2, mixHex, outlined, shade } from "../art";

const PY = 170; // the player's car sits on this screen row; the world scrolls past it
const CP_DIST = 6000; // world distance between checkpoints
const TOP_SPEED = 5;
const GRASS_SPEED = 2;
const CAR_W = 16;
const CAR_H = 24;
const TRUCK_W = 18;
const TRUCK_H = 40;
const OIL_W = 20;
const OIL_H = 14;
const FUEL_W = 12;
const FUEL_H = 16;
const TREE_W = 22;
const TREE_H = 26;
const ROCK_W = 10;
const ROCK_H = 8;
// collision boxes stay INSET inside the drawn sprite (kid-friendly — dodging must not get
// harder just because the art got bigger); sprite size (CAR_W etc.) is only for drawing/placement
const CAR_HB_W = 12;
const CAR_HB_H = 19;
const TRUCK_HB_W = 14;
const TRUCK_HB_H = 34;
const OIL_HB_W = 14;
const OIL_HB_H = 9;
const FUEL_HB_W = 9;
const FUEL_HB_H = 12;
const COIN_HB = 7;

/** rotate pixel rows 90° clockwise (front of the car ends up facing right) */
const rot = (rows: string[]) => {
  const out: string[] = [];
  for (let x = 0; x < rows[0].length; x++) {
    let s = "";
    for (let y = rows.length - 1; y >= 0; y--) s += rows[y][x];
    out.push(s);
  }
  return out;
};

// ── all baked pixel art lives behind one lazy memo: the arcade imports every game's module at
//    once, so none of this runs until this game is actually created ──

// a top-down car, baked from one shape function so every colour shares the same boxy sedan
// body (squared shoulders, short nose/tail bumpers, wheels peeking at the corners) with a
// distinct roof/cabin rectangle — windscreen at the front, a separate rear window at the back —
// like the cabinet painting's sedans rather than a rounded "egg"
function carRaw(base: string, stripe = false): Sprite {
  const dark = shade(base, -0.42);
  const roof = shade(base, -0.2);
  return bake(CAR_W, CAR_H, (x, y) => {
    const nx = (x + 0.5 - CAR_W / 2) / (CAR_W / 2);
    const ny = (y + 0.5 - CAR_H / 2) / (CAR_H / 2);
    // mostly a flat-sided rectangle: only the very tip of the nose and tail taper in, so the
    // body reads as squared shoulders rather than a continuous egg curve
    const nose = ny < -0.78 ? clamp((ny + 1) / 0.22, 0.35, 1) : 1;
    const tail = ny > 0.85 ? clamp((1 - ny) / 0.15, 0.6, 1) : 1;
    let hw = 0.84 * nose * tail;
    const corner = Math.max(0, Math.abs(ny) - 0.85) / 0.15;
    hw -= corner * corner * 0.1; // a touch of corner rounding, not a full taper
    if (Math.abs(nx) > hw) {
      // a side mirror pokes just past the body, level with the windscreen
      if (ny > -0.3 && ny < -0.1 && Math.abs(nx) < hw + 0.16) return shade(PAL.black, 0.1);
      return null;
    }
    // wheels peeking at the front and rear corners
    if ((ny > -0.62 && ny < -0.4) || (ny > 0.36 && ny < 0.58)) {
      if (Math.abs(nx) > hw - 0.12) return shade(PAL.black, -0.3);
    }
    // the cabin/roof is a separate, narrower rectangle inset from the body — a windscreen band
    // at its front edge, a smaller rear-window band at its back edge, flat roof colour between
    if (ny > -0.52 && ny < 0.46 && Math.abs(nx) < hw * 0.72) {
      if (ny < -0.3) return ny < -0.42 && nx > -0.12 && nx < 0.16 ? "#b8e8ff" : "#1c2440"; // windscreen (+ glare)
      if (ny > 0.26) return "#232c46"; // rear window
      return roof;
    }
    if (stripe && Math.abs(nx) > 0.16 && Math.abs(nx) < 0.3) return PAL.white;
    if (ny < -0.86 && Math.abs(Math.abs(nx) - hw * 0.55) < 0.14) return "#fff6c8"; // headlights
    if (ny > 0.84 && Math.abs(Math.abs(nx) - hw * 0.55) < 0.16) return PAL.red; // taillights
    const edge = hw - Math.abs(nx);
    return edge < 0.08 ? dark : base;
  });
}
const mkCar = (base: string, stripe = false) => outlined(carRaw(base, stripe));
const mkCarPair = (base: string) => {
  const raw = carRaw(base);
  return { up: outlined(raw), side: outlined(sprite(rot(raw.rows), raw.pal)) };
};

// trucks: a boxy container trailer and a cylindrical fuel tanker, cab up top
function truckRaw(cab: string, kind: "box" | "tank"): Sprite {
  const cabDark = shade(cab, -0.35);
  const bodyBase = kind === "box" ? "#d8dbe6" : "#b8bcc8";
  const cabH = 10;
  return bake(TRUCK_W, TRUCK_H, (x, y) => {
    const cx = (x + 0.5 - TRUCK_W / 2) / (TRUCK_W / 2);
    if (y < cabH) {
      const nose = clamp((y + 1) / 3, 0, 1);
      const hw = 0.92 * (0.45 + 0.55 * nose);
      if (Math.abs(cx) > hw) {
        if (y >= 7 && Math.abs(cx) < hw + 0.13) return shade(PAL.black, 0.1); // mirrors
        return null;
      }
      if (y < 2 && Math.abs(Math.abs(cx) - hw * 0.6) < 0.18) return "#fff6c8"; // headlights
      if (y > 2 && y < 6 && Math.abs(cx) < hw * 0.65) return "#9fd8ff"; // windshield
      return Math.abs(cx) > hw - 0.12 ? cabDark : cab;
    }
    if (y === cabH) return shade(PAL.black, -0.2); // coupling gap
    const hw = 0.94;
    if (Math.abs(cx) > hw) return null;
    if (y > TRUCK_H - 3 && Math.abs(Math.abs(cx) - hw * 0.6) < 0.2) return PAL.red; // tail lights
    if ((Math.abs(y - (cabH + 11)) < 2 || Math.abs(y - (TRUCK_H - 5)) < 2) && Math.abs(cx) > hw - 0.16) return PAL.black; // wheels
    if (kind === "box") {
      const ridge = x % 3 === 0 || y === cabH + 1 || y === TRUCK_H - 6;
      return ridge ? shade(bodyBase, -0.12) : Math.abs(cx) > hw - 0.08 ? shade(bodyBase, -0.2) : bodyBase;
    }
    if (y > TRUCK_H - 13 && y < TRUCK_H - 10) return y % 2 === 0 ? PAL.black : PAL.yellow; // hazard band
    const round = 1 - Math.abs(cx) / hw;
    const lit = mixHex(shade(bodyBase, -0.3), "#eef3fb", Math.pow(round, 1.4));
    return y === cabH + 3 ? shade(lit, 0.15) : lit;
  });
}

// roadside scenery: a tree cluster and a boulder, baked from shape functions
function treeRaw(): Sprite {
  return bake(TREE_W, TREE_H, (x, y) => {
    const cx = (x + 0.5 - TREE_W / 2) / (TREE_W * 0.46);
    const cy = (y + 0.5 - TREE_H * 0.34) / (TREE_H * 0.46);
    if (y > TREE_H * 0.74 && Math.abs(x - TREE_W / 2) <= 1) return y % 2 === 0 ? "#6b4a28" : "#54381e";
    const d = cx * cx + cy * cy;
    if (d > 1) return null;
    const n = fbm(x * 0.3, y * 0.3, 2, 31);
    const lit = cx < -0.1 && cy < -0.15;
    if (d > 0.74) return lit ? "#56b852" : "#194f22";
    return lit ? (n > 0.5 ? "#469e49" : "#368a38") : n > 0.5 ? "#275f24" : "#1c4b1e";
  });
}
function rockRaw(): Sprite {
  return bake(ROCK_W, ROCK_H, (x, y) => {
    const nx = (x + 0.5 - ROCK_W / 2) / (ROCK_W / 2);
    const ny = (y + 0.5 - ROCK_H * 0.6) / (ROCK_H * 0.5);
    const d = nx * nx + ny * ny;
    if (d > 1) return null;
    const lit = nx < 0 && ny < -0.1;
    return lit ? "#b9bcc9" : d > 0.7 ? "#6a6d7c" : "#888b99";
  });
}
const mkFlower = (petal: string, mid: string) =>
  bake(5, 5, (x, y) => {
    if (x === 2 && y === 2) return mid;
    if ((x === 2 && y !== 2) || (y === 2 && x !== 2)) return petal;
    return null;
  });

/** every baked sprite, built once the first time a round starts (never at module load) */
function makeArt() {
  const player = mkCarPair(PAL.red);
  const cars = [mkCar(PAL.blue, true), mkCar(PAL.pink), mkCar(PAL.purple), mkCar(PAL.yellow), mkCar(PAL.green)];
  const weaver = mkCar(PAL.orange);
  const trucks = [outlined(truckRaw(PAL.sky, "box")), outlined(truckRaw(PAL.orange, "tank"))];
  const oil = outlined(
    bake(OIL_W, OIL_H, (x, y) => {
      const nx = (x + 0.5 - OIL_W / 2) / (OIL_W / 2);
      const ny = (y + 0.5 - OIL_H / 2) / (OIL_H / 2);
      const n = fbm(x * 0.35, y * 0.45, 2, 77);
      const d = nx * nx * 0.9 + ny * ny * 1.7;
      if (d > 0.55 + n * 0.4) return null;
      if (d > 0.38 + n * 0.3) return "#473a74";
      return n > 0.68 ? "#5a4a8c" : "#160f28";
    }),
  );
  const fuel = outlined(
    bake(FUEL_W, FUEL_H, (x, y) => {
      if (y < 3) return x >= 5 && x <= 7 ? shade(PAL.grey, y === 0 ? 0.2 : -0.1) : null;
      const nx = (x + 0.5 - FUEL_W / 2) / (FUEL_W / 2);
      const edge = Math.abs(nx);
      if (y === 3 && edge > 0.75) return null;
      const label = Math.round(FUEL_H * 0.55);
      if (y === label) return PAL.white;
      if (y > label && y < label + 3 && edge < 0.8) return shade(PAL.red, 0.1);
      return edge > 0.82 ? shade(PAL.red, -0.3) : shade(PAL.red, 0.2 - edge * 0.4);
    }),
  );
  const tree = outlined(treeRaw());
  const rock = outlined(rockRaw());
  const flowers = [mkFlower(PAL.yellow, PAL.white), mkFlower(PAL.white, PAL.yellow)];
  return { player, cars, weaver, trucks, oil, fuel, tree, rock, flowers };
}
let ART: ReturnType<typeof makeArt> | null = null;
const art = () => (ART ??= makeArt());

type Kind = "car" | "weaver" | "truck" | "oil" | "fuel" | "coin";
interface Thing {
  kind: Kind;
  d: number; // world distance of the thing's top edge
  lf: number; // -1..1 across the road
  base: number;
  v: number;
  t: number;
  w: number;
  h: number;
  hw: number; // hit box width — inset within the drawn sprite (w), not the same thing
  hh: number; // hit box height — inset within the drawn sprite (h)
  spr: Sprite | null;
  gone: boolean;
  passed: boolean;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  r: number;
}

function create(seed: number): GameInstance {
  const A = art();
  const r = rng(seed);
  const ph = [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)];
  const hash = (i: number) => {
    const s = Math.sin(i * 127.1 + ph[0] * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  /** the road's centre and half-width at world distance d — bends, narrows and widens */
  const road = (d: number) => {
    const k = clamp((d - 300) / 900, 0, 1);
    const hw = 58 + k * 22 * Math.sin(d * 0.0021 + ph[2]);
    let cx = 128 + k * (38 * Math.sin(d * 0.0032 + ph[0]) + 18 * Math.sin(d * 0.0091 + ph[1]));
    cx = clamp(cx, hw + 14, W - hw - 14);
    return { cx, hw };
  };
  const lanes = (hw: number) => Math.max(2, Math.round((hw * 2) / 27));

  let dist = 0;
  let speed = 0;
  let px = 123;
  let fuel = 100;
  let time = 45;
  let spin = 0;
  let spinDir = 1;
  let hitCool = 0;
  let frame = 0;
  let nextScore = 50;
  let nextCp = CP_DIST;
  let cps = 0;
  let nextSpawn = 260;
  let nextFuel = 1500;
  let ending: "" | "fuel" | "time" = "";
  let endT = 0;
  let over = false;
  let msg = "GET SET...";
  let msgT = 70;
  let shake = 0;
  const things: Thing[] = [];
  const bits: Bit[] = [];

  const xOf = (o: Thing) => {
    const rd = road(o.d);
    return rd.cx + o.lf * Math.max(0, rd.hw - o.w / 2 - 4) - o.w / 2;
  };
  const yOf = (o: Thing) => PY - (o.d - dist);
  const say = (s: string, t = 70) => {
    msg = s;
    msgT = t;
  };
  const puff = (x: number, y: number, c: string, n = 1, spread = 1) => {
    for (let i = 0; i < n; i++) bits.push({ x, y, vx: r.range(-1, 1) * spread, vy: r.range(-1, 0.5) * spread, life: r.int(14, 26), c, r: r.int(1, 3) });
  };

  const spawn = (d: number) => {
    const level = d / CP_DIST;
    const rd = road(d);
    const n = lanes(rd.hw);
    const roll = r.next();
    let kind: Kind;
    if (roll < 0.62) kind = d > 2500 && r.chance(0.3) ? "weaver" : d > 800 && r.chance(0.28) ? "truck" : "car";
    else if (roll < 0.74 && d > 1500) kind = "oil";
    else kind = "coin";
    const lane = r.int(0, n - 1);
    const lf = n > 1 ? -1 + ((lane + 0.5) * 2) / n : 0;
    const traffic = kind === "car" || kind === "weaver" || kind === "truck";
    const w = kind === "truck" ? TRUCK_W : kind === "oil" ? OIL_W : kind === "coin" ? 8 : CAR_W;
    const h = kind === "truck" ? TRUCK_H : kind === "oil" ? OIL_H : kind === "coin" ? 8 : CAR_H;
    const hw = kind === "truck" ? TRUCK_HB_W : kind === "oil" ? OIL_HB_W : kind === "coin" ? COIN_HB : CAR_HB_W;
    const hh = kind === "truck" ? TRUCK_HB_H : kind === "oil" ? OIL_HB_H : kind === "coin" ? COIN_HB : CAR_HB_H;
    // never stack two things on top of each other
    if (things.some((o) => Math.abs(o.d - d) < h + (traffic ? 26 : 14) && Math.abs(o.lf - lf) < 0.45)) return;
    const ramp = Math.min(1.2, level * 0.15);
    const v = kind === "truck" ? r.range(1.5, 2.1) : kind === "weaver" ? r.range(2.5, 3.2) + ramp * 0.5 : kind === "car" ? r.range(2.1, 3.3) + ramp * 0.4 : 0;
    const spr = kind === "truck" ? r.pick(A.trucks) : kind === "weaver" ? A.weaver : kind === "car" ? r.pick(A.cars) : kind === "oil" ? A.oil : null;
    things.push({ kind, d, lf, base: lf, v, t: r.int(0, 200), w, h, hw, hh, spr, gone: false, passed: false });
  };

  const startSpin = (dir: number, io: IO) => {
    spin = 46;
    spinDir = dir;
    hitCool = 70;
    shake = 8;
    io.sfx.play("hit");
    io.sfx.slide?.(260, 90, 0.3, "sawtooth", 0.1);
    for (let i = 0; i < 6; i++) puff(px + 5, PY + 8, PAL.white, 1, 1.4);
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      const h = io.input.held;
      if (msgT > 0) msgT--;
      if (shake > 0) shake--;
      if (hitCool > 0) hitCool--;
      const started = frame > 70;
      if (frame === 70) {
        say("GO!", 40);
        io.sfx.play("powerup");
      }

      // ── driving ──
      const rp = road(dist + 8);
      const onGrass = px + 8 < rp.cx - rp.hw || px + 2 > rp.cx + rp.hw;
      if (spin > 0) {
        spin--;
        speed *= 0.97;
        px += spinDir * 0.9;
        if (frame % 3 === 0) puff(px + 5, PY + 12, "#d8dae8");
      } else {
        const gas = (h.up || h.a) && started && fuel > 0 && !ending;
        const brake = h.down || h.b;
        if (gas) speed += 0.06;
        else speed -= 0.025;
        if (brake) speed -= 0.15;
        const top = onGrass ? GRASS_SPEED : TOP_SPEED;
        if (speed > top) speed = Math.max(top, speed - 0.14);
        speed = clamp(speed, 0, TOP_SPEED);
        const steer = (h.left ? -1 : 0) + (h.right ? 1 : 0);
        px += steer * Math.min(2.6, 0.4 + speed * 0.5);
      }
      px = clamp(px, 2, W - 12);
      dist += speed;
      if (onGrass && speed > 0.5) {
        if (frame % 4 === 0) puff(px + r.range(0, 10), PY + 16, PAL.lime);
        shake = Math.max(shake, 2);
      }
      if (speed > 0.3 && frame % 8 === 0) io.sfx.tone(70 + speed * 28, 0.06, "square", 0.02);
      if (speed > 0.6 && frame % 24 === 0) io.sfx.noise?.(0.12, 0.03 + speed * 0.01, 110, 60);
      if (fuel < 25 && fuel > 0 && !ending && frame % 50 === 0) io.sfx.play("blip");

      // ── fuel + clock ──
      if (started && !ending) {
        fuel -= 0.01 + speed * 0.0065;
        time -= 1 / 60;
        if (fuel <= 0) {
          fuel = 0;
          ending = "fuel";
          say("OUT OF FUEL!", 999);
          io.sfx.play("die");
        } else if (time <= 0) {
          time = 0;
          ending = "time";
          say("TIME UP!", 999);
          io.sfx.play("die");
        }
      }
      if (ending) {
        endT++;
        speed = Math.max(0, speed - 0.05);
        if (speed <= 0 && endT > 60) {
          over = true;
          io.gameOver();
          return;
        }
      }

      // ── score + checkpoints ──
      while (dist >= nextScore) {
        io.score(10);
        nextScore += 50;
      }
      if (dist >= nextCp) {
        nextCp += CP_DIST;
        cps++;
        const bonus = Math.max(15, 27 - cps * 2);
        time += bonus;
        io.score(500 * cps);
        io.sfx.play("win");
        io.sfx.slide?.(440, 880, 0.35, "triangle", 0.12);
        say(`CHECKPOINT! +${bonus} SEC`, 90);
      }

      // ── spawns ──
      while (nextSpawn < dist + 280) {
        spawn(nextSpawn);
        const level = nextSpawn / CP_DIST;
        nextSpawn += Math.max(42, r.range(80, 150) / (1 + level * 0.3));
      }
      if (dist + 280 > nextFuel) {
        const rd = road(nextFuel);
        const n = lanes(rd.hw);
        const lf = -1 + ((r.int(0, n - 1) + 0.5) * 2) / n;
        things.push({ kind: "fuel", d: nextFuel, lf, base: lf, v: 0, t: 0, w: FUEL_W, h: FUEL_H, hw: FUEL_HB_W, hh: FUEL_HB_H, spr: A.fuel, gone: false, passed: false });
        nextFuel += r.range(1500, 2300) + cps * 150;
      }

      // ── traffic + pickups ──
      // the player's hit box is inset inside the drawn car (kid-friendly — bigger art must
      // not make dodging harder), centred the same way as every other thing's hw/hh below
      const me = { x: px + (CAR_W - CAR_HB_W) / 2, y: PY + (CAR_H - CAR_HB_H) / 2, w: CAR_HB_W, h: CAR_HB_H };
      for (const o of things) {
        o.t++;
        if (o.v > 0) {
          // don't rear-end the car ahead in the same lane
          let v = o.v;
          for (const q of things) if (q !== o &&q.v > 0 && q.d > o.d && q.d - o.d < o.h + 14 && Math.abs(q.lf - o.lf) < 0.4) v = Math.min(v, q.v);
          o.d += v;
          if (o.kind === "weaver") o.lf = clamp(o.base + 0.45 * Math.sin(o.t * 0.025), -0.9, 0.9);
          if (!o.passed && o.d + o.h < dist - 4) {
            o.passed = true;
            io.score(20);
            if (o.kind === "truck") io.sfx.play("whoosh");
          }
        }
        const box = { x: xOf(o), y: yOf(o), w: o.w, h: o.h };
        // the collision box is the inset hw/hh, centred inside the drawn sprite (box)
        const hb = { x: box.x + (o.w - o.hw) / 2, y: box.y + (o.h - o.hh) / 2, w: o.hw, h: o.hh };
        if (ending || !overlap(me, hb)) continue;
        if (o.kind === "coin") {
          o.gone = true;
          io.score(100);
          io.sfx.play("coin");
          for (let i = 0; i < 6; i++) puff(box.x + 4, box.y + 4, PAL.yellow, 1, 1.5);
        } else if (o.kind === "fuel") {
          o.gone = true;
          fuel = Math.min(100, fuel + 35);
          io.score(150);
          io.sfx.play("powerup");
          say("FUEL +", 50);
        } else if (o.kind === "oil") {
          if (spin === 0 && speed > 1 && hitCool === 0) {
            startSpin(r.chance(0.5) ? -1 : 1, io);
            io.sfx.play("bounce");
            io.sfx.noise?.(0.22, 0.08, 300, 700);
            say("OIL SLICK!", 40);
          }
        } else if (hitCool === 0) {
          startSpin(px + 5 < box.x + o.w / 2 ? -1 : 1, io);
          speed = Math.min(speed, o.v) * 0.5;
          o.d += 8;
          if (o.kind === "truck") io.sfx.play("thud");
          say("BONK!", 30);
        }
      }

      for (let i = things.length - 1; i >= 0; i--) {
        const o = things[i];
        if (o.gone || o.d < dist - 120 || o.d > dist + 520) things.splice(i, 1);
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx;
        b.y += b.vy + speed * 0.9;
        if (--b.life <= 0) bits.splice(i, 1);
      }
    },

    draw(g: Gfx) {
      const sx = shake > 0 ? (frame % 2 ? 1 : -1) : 0;
      // lane count frozen for the whole frame (road half-width barely moves, but recomputing it
      // every 2px row let it round up/down mid-screen and the dividers would jump — "doubled"
      // dashes); one stable count per frame keeps every divider a single clean line
      const laneN = lanes(road(dist + 85).hw);
      g.clear("#1d5a2d");
      // road, drawn in 2px strips from the world distance under each row: dark lush grass either
      // side, a tan shoulder, a steady silver guardrail on posts, then asphalt with a lane rumble
      for (let sy = 0; sy < H; sy += 2) {
        const d = dist + (PY - sy);
        const rd = road(d);
        if (hash2(Math.floor(d / 16), 0, 3) > 0.55) g.rect(0, sy, W, 2, "#215f31");
        const L = rd.cx - rd.hw + sx;
        const R = rd.cx + rd.hw + sx;
        g.rect(L - 8, sy, 8, 2, "#c6b280");
        g.rect(R, sy, 8, 2, "#c6b280");
        const onPost = Math.floor(d) % 48 < 4;
        const rail = onPost ? "#575b6c" : "#d9dce4";
        g.rect(L - 6, sy, 2, 2, rail);
        g.rect(R + 4, sy, 2, 2, rail);
        g.rect(L, sy, R - L, 2, Math.floor(d / 36) & 1 ? "#3c3f4c" : "#454858");
        g.rect(L, sy, 2, 2, "#575b6c");
        g.rect(R - 2, sy, 2, 2, "#575b6c");
        if (Math.floor(d / 18) & 1) {
          for (let i = 1; i < laneN; i++) g.rect(L + ((R - L) * i) / laneN - 1, sy, 2, 2, "#eef0f6");
        }
      }
      // start line + checkpoint banners
      for (const cd of [40, nextCp - CP_DIST, nextCp]) {
        if (cd <= 0) continue;
        const y = PY - (cd - dist);
        if (y < -20 || y > H + 10) continue;
        const rd = road(cd);
        for (let i = 0; i < 12; i++) {
          const x0 = rd.cx - rd.hw + ((rd.hw * 2) / 12) * i + sx;
          g.rect(x0, y, (rd.hw * 2) / 12 + 1, 4, i % 2 ? PAL.black : PAL.white);
          g.rect(x0, y + 4, (rd.hw * 2) / 12 + 1, 4, i % 2 ? PAL.white : PAL.black);
        }
        g.rect(rd.cx - rd.hw - 10 + sx, y - 12, 3, 20, PAL.dark);
        g.rect(rd.cx + rd.hw + 7 + sx, y - 12, 3, 20, PAL.dark);
        if (cd > 40) g.text("CHECKPOINT", rd.cx + sx, y - 10, PAL.yellow, { align: "center" });
      }
      // roadside bushes, trees, rocks and flowers — dense, overlapping clumps packed right up
      // against the guardrail (like the painting's lush dark verge), plus a dimmer, smaller far
      // row behind them so the tree-line reads with real depth instead of scattered dots
      const STEP = 18;
      for (let i = Math.floor((dist - 90) / STEP); i <= Math.floor((dist + PY + 30) / STEP); i++) {
        const d = i * STEP;
        const rd = road(d);
        const y = PY - (d - dist);
        for (const side of [-1, 1] as const) {
          const edge = side < 0 ? rd.cx - rd.hw : rd.cx + rd.hw;
          // a dim, smaller far row sits behind the near clump about 40% of the time
          const farV = hash(i * 1.7 + side * 9.3);
          if (farV > 0.6) {
            const fx = edge + side * (40 + farV * 44) + sx;
            if (fx > -18 && fx < W + 18) {
              g.alpha(0.8);
              g.sprite(A.tree, fx - (TREE_W * 0.65) / 2, y - TREE_H * 0.42, { scale: 0.65 });
              g.alpha(1);
            }
          }
          // two near clump slots per side, packed close enough to overlap — a lush dense verge
          for (let k = 0; k < 2; k++) {
            const v = hash(i * 2.3 + side * 5.1 + k * 3.7);
            if (v < 0.1) continue; // the occasional gap, so it isn't a solid wall
            const x = edge + side * (8 + k * 12 + v * 9) + sx;
            if (x < -14 || x > W + 14) continue;
            if (v < 0.18) g.sprite(A.rock, x - ROCK_W / 2, y - ROCK_H * 0.5);
            else if (v < 0.25) g.sprite(A.flowers[v < 0.21 ? 0 : 1], x - 2, y - 2);
            else {
              const scl = 0.85 + hash(i + side + k + 3.1) * 0.4;
              g.sprite(A.tree, x - (TREE_W * scl) / 2, y - TREE_H * scl * 0.58, { scale: scl });
            }
          }
        }
      }
      // things: flat stuff first, then traffic
      for (const pass of [0, 1]) {
        for (const o of things) {
          const traffic = o.v > 0;
          if ((pass === 1) !== traffic) continue;
          const x = xOf(o) + sx;
          const y = yOf(o);
          if (y < -30 || y > H + 4) continue;
          if (o.kind === "coin") {
            const w = Math.max(2, Math.abs(Math.cos(o.t * 0.12)) * 8);
            g.rect(x + 4 - w / 2 - 1, y - 1, w + 2, 10, "#8a5a10");
            g.rect(x + 4 - w / 2, y, w, 8, PAL.orange);
            g.rect(x + 4 - w / 2 + 1, y + 1, Math.max(1, w - 2), 6, PAL.yellow);
            if (w > 5) g.rect(x + 3, y + 2, 1, 2, PAL.white);
          } else if (o.spr) {
            if (traffic) g.rect(x + 1, y + 2, o.w, o.h, "rgba(13,11,26,0.3)");
            g.sprite(o.spr, x, y);
            if (o.kind === "fuel" && Math.floor(o.t / 10) % 2) g.box(x - 2, y - 2, o.w + 4, o.h + 4, PAL.yellow);
          }
        }
      }
      // player (spins through 4 facings)
      const f = spin > 0 ? Math.floor(spin / 3) % 4 : 0;
      const blink = hitCool > 0 && spin === 0 && Math.floor(hitCool / 4) % 2;
      if (!blink) {
        g.rect(px + 1 + sx, PY + 3, CAR_W - 2, CAR_H - 3, "rgba(13,11,26,0.3)");
        if (f === 0) g.sprite(A.player.up, px + sx, PY);
        else if (f === 2) g.sprite(A.player.up, px + sx, PY, { flipY: true });
        else g.sprite(A.player.side, px - 4 + sx, PY + 4, { flipX: f === 3 });
      }
      for (const b of bits) g.rect(b.x - b.r / 2, b.y - b.r / 2, b.r, b.r, b.c);

      // HUD
      g.rect(0, 0, W, 12, "rgba(13,11,26,0.65)");
      g.sprite(A.fuel, 2, 0, { scale: 0.5 });
      g.text("FUEL", 12, 3, PAL.white);
      g.rect(38, 3, 52, 6, PAL.dark);
      const low = fuel < 25;
      g.rect(39, 4, 50 * (fuel / 100), 4, low ? (Math.floor(frame / 8) % 2 ? PAL.red : PAL.orange) : PAL.lime);
      g.text(`TIME ${Math.ceil(time)}`, 128, 3, time < 10 && Math.floor(frame / 10) % 2 ? PAL.red : PAL.yellow, { align: "center" });
      g.text(`${Math.round(speed * 36)} KMH`, W - 4, 3, PAL.cyan, { align: "right" });
      const prog = clamp(1 - (nextCp - dist) / CP_DIST, 0, 1);
      g.rect(0, 12, W, 2, PAL.dark);
      g.rect(0, 12, W * prog, 2, PAL.yellow);
      if (msgT > 0) {
        g.rect(0, 70, W, 16, "rgba(13,11,26,0.5)");
        g.text(msg, W / 2, 75, ending ? PAL.red : PAL.white, { align: "center" });
      }
      if (low && !ending && Math.floor(frame / 20) % 2) g.text("LOW FUEL!", W / 2, 20, PAL.red, { align: "center" });
    },
  };
}

export const roadRacer: RetroGameDef = {
  id: "road-racer",
  title: "Road Racer",
  blurb: "Zoom down the winding highway, dodge traffic and grab fuel!",
  genre: "Racing",
  emoji: "🏎️",
  color: "#ff4a4a",
  controls: "▲ or A go · ▼ or B brake · ◀ ▶ steer · grab fuel cans, dodge oil!",
  pad: { dpad: "4", a: "Go", b: "Brake" },
  create,
};
