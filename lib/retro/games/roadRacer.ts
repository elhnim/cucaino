// ROAD RACER — a top-down highway dash. Hold ▲/A to speed up, ▼/B to brake and steer ◀ ▶
// around slow trucks and weaving cars. The road bends, narrows and widens; grass slows you
// down, oil slicks send you spinning, fuel cans keep the tank topped up and every checkpoint
// adds time to the clock. Run out of fuel or time and the race is over.
// (Original game in the spirit of 8-bit top-down racers.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";

const PY = 170; // the player's car sits on this screen row; the world scrolls past it
const CP_DIST = 6000; // world distance between checkpoints
const TOP_SPEED = 5;
const GRASS_SPEED = 2;

// ── pixel art ──
const CAR_ROWS = [
  "..cccccc..",
  ".cyccccyc.",
  "kcccccccck",
  "kcccccccck",
  ".ccwwwwcc.",
  ".cwwwwwwc.",
  ".cddddddc.",
  ".cddddddc.",
  ".cddddddc.",
  ".cwwwwwwc.",
  ".ccwwwwcc.",
  "kcccccccck",
  "kcccccccck",
  ".cccccccc.",
  ".crccccrc.",
  "..cccccc..",
];
const TRUCK_ROWS = [
  "..cccccccc..",
  ".cyccccccyc.",
  ".cccccccccc.",
  "kcwwwwwwwwck",
  "kcwwwwwwwwck",
  ".cccccccccc.",
  ".cccccccccc.",
  "..kkkkkkkk..",
  "bbbbbbbbbbbb",
  "kbeeeeeeeebk",
  "kbbbbbbbbbbk",
  "bbeeeeeeeebb",
  "bbbbbbbbbbbb",
  "bbeeeeeeeebb",
  "kbbbbbbbbbbk",
  "kbeeeeeeeebk",
  "bbbbbbbbbbbb",
  "bbeeeeeeeebb",
  "bbbbbbbbbbbb",
  "kbeeeeeeeebk",
  "kbbbbbbbbbbk",
  "bbbbbbbbbbbb",
  "brbbbbbbbbrb",
  "bbbbbbbbbbbb",
];
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
const mkCar = (c: string, d: string) => {
  const pal = { c, d, w: "#bfefff", y: PAL.yellow, k: PAL.black, r: PAL.red };
  return { up: sprite(CAR_ROWS, pal), side: sprite(rot(CAR_ROWS), pal) };
};
const PLAYER = mkCar(PAL.red, "#b8262e");
const CARS = [mkCar(PAL.blue, PAL.navy), mkCar(PAL.green, "#1f8a3a"), mkCar(PAL.purple, "#5a2ea0"), mkCar(PAL.pink, "#b0408f"), mkCar(PAL.teal, "#11756b")];
const WEAVER = mkCar(PAL.orange, "#c05a10");
const TRUCKS = [
  sprite(TRUCK_ROWS, { c: PAL.yellow, b: PAL.grey, e: "#c4c8dc", w: "#bfefff", y: PAL.white, k: PAL.black, r: PAL.red }),
  sprite(TRUCK_ROWS, { c: PAL.sky, b: PAL.tan, e: "#ffe0b8", w: "#bfefff", y: PAL.white, k: PAL.black, r: PAL.red }),
];
const OIL = sprite(
  ["....kkkkk.....", "..kkkkkkkkk...", ".kkkpkkkkkkkk.", "kkkkkkkkpkkkkk", "kkpkkkkkkkkkk.", ".kkkkkkkkkkk..", "...kkkkkkkk...", ".....kkkk....."],
  { k: "#2a2240", p: PAL.purple },
);
const FUEL = sprite(["..kk....", ".krrkkk.", "krrrrrrk", "krwrrrrk", "krrwrrrk", "krrrwrrk", "krrrrwrk", "krrrrrrk", "krrrrrrk", ".kkkkkk."], { k: PAL.black, r: PAL.red, w: PAL.white });

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
    // never stack two things on top of each other
    for (const o of things) if (Math.abs(o.d - d) < (traffic ? 46 : 26) && Math.abs(o.lf - lf) < 0.45) return;
    const w = kind === "truck" ? 12 : kind === "oil" ? 14 : kind === "coin" ? 8 : 10;
    const h = kind === "truck" ? 24 : kind === "oil" ? 8 : kind === "coin" ? 8 : 16;
    const ramp = Math.min(1.2, level * 0.15);
    const v = kind === "truck" ? r.range(1.5, 2.1) : kind === "weaver" ? r.range(2.5, 3.2) + ramp * 0.5 : kind === "car" ? r.range(2.1, 3.3) + ramp * 0.4 : 0;
    const spr = kind === "truck" ? r.pick(TRUCKS) : kind === "weaver" ? WEAVER.up : kind === "car" ? r.pick(CARS).up : kind === "oil" ? OIL : null;
    things.push({ kind, d, lf, base: lf, v, t: r.int(0, 200), w, h, spr, gone: false, passed: false });
  };

  const startSpin = (dir: number, io: IO) => {
    spin = 46;
    spinDir = dir;
    hitCool = 70;
    shake = 8;
    io.sfx.play("hit");
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
        things.push({ kind: "fuel", d: nextFuel, lf, base: lf, v: 0, t: 0, w: 8, h: 10, spr: FUEL, gone: false, passed: false });
        nextFuel += r.range(1500, 2300) + cps * 150;
      }

      // ── traffic + pickups ──
      const me = { x: px + 1, y: PY + 1, w: 8, h: 14 };
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
          }
        }
        const box = { x: xOf(o), y: yOf(o), w: o.w, h: o.h };
        if (ending || !overlap(me, box)) continue;
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
            say("OIL SLICK!", 40);
          }
        } else if (hitCool === 0) {
          startSpin(px + 5 < box.x + o.w / 2 ? -1 : 1, io);
          speed = Math.min(speed, o.v) * 0.5;
          o.d += 8;
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
      g.clear("#3aa845");
      // road, drawn in 2px strips from the world distance under each row
      for (let sy = 0; sy < H; sy += 2) {
        const d = dist + (PY - sy);
        const rd = road(d);
        if (Math.floor(d / 24) & 1) g.rect(0, sy, W, 2, "#34993f");
        const L = rd.cx - rd.hw + sx;
        const R = rd.cx + rd.hw + sx;
        const stripe = Math.floor(d / 12) & 1;
        g.rect(L - 6, sy, 6, 2, stripe ? PAL.red : PAL.white);
        g.rect(R, sy, 6, 2, stripe ? PAL.red : PAL.white);
        g.rect(L, sy, R - L, 2, Math.floor(d / 40) & 1 ? "#565a72" : "#5c6078");
        if (Math.floor(d / 18) & 1) {
          const n = lanes(rd.hw);
          for (let i = 1; i < n; i++) g.rect(L + ((R - L) * i) / n - 1, sy, 2, 2, "#e4e6f2");
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
      // roadside trees and flowers
      for (let i = Math.floor((dist - 60) / 34); i <= Math.floor((dist + PY + 30) / 34); i++) {
        const d = i * 34;
        const rd = road(d);
        const y = PY - (d - dist);
        const a = hash(i);
        const b = hash(i + 0.37);
        const lx = rd.cx - rd.hw - 18 - a * 60 + sx;
        const rx = rd.cx + rd.hw + 18 + b * 60 + sx;
        for (const [x, v] of [
          [lx, a],
          [rx, b],
        ]) {
          if (x < -12 || x > W + 12) continue;
          if (v < 0.25) {
            g.circle(x, y, 3, "#2a8a38");
            g.rect(x - 1, y - 1, 2, 2, v < 0.12 ? PAL.pink : PAL.yellow);
          } else {
            g.circle(x + 2, y + 3, 8, "#1f6a2c");
            g.circle(x, y, 8, "#2f9a44");
            g.circle(x - 2, y - 2, 4, PAL.lime);
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
            const w = Math.max(1, Math.abs(Math.cos(o.t * 0.12)) * 8);
            g.rect(x + 4 - w / 2, y, w, 8, PAL.orange);
            g.rect(x + 4 - w / 2 + 1, y + 1, Math.max(1, w - 2), 6, PAL.yellow);
          } else if (o.spr) {
            if (traffic) g.rect(x + 1, y + 2, o.w, o.h, "rgba(13,11,26,0.3)");
            g.sprite(o.spr, x, y);
            if (o.kind === "fuel" && Math.floor(o.t / 10) % 2) g.box(x - 2, y - 2, 12, 14, PAL.yellow);
          }
        }
      }
      // player (spins through 4 facings)
      const f = spin > 0 ? Math.floor(spin / 3) % 4 : 0;
      const blink = hitCool > 0 && spin === 0 && Math.floor(hitCool / 4) % 2;
      if (!blink) {
        g.rect(px + 1 + sx, PY + 2, 10, 16, "rgba(13,11,26,0.3)");
        if (f === 0) g.sprite(PLAYER.up, px + sx, PY);
        else if (f === 2) g.sprite(PLAYER.up, px + sx, PY, { flipY: true });
        else g.sprite(PLAYER.side, px - 3 + sx, PY + 3, { flipX: f === 3 });
      }
      for (const b of bits) g.rect(b.x - b.r / 2, b.y - b.r / 2, b.r, b.r, b.c);

      // HUD
      g.rect(0, 0, W, 12, "rgba(13,11,26,0.65)");
      g.text("FUEL", 4, 3, PAL.white);
      g.rect(30, 3, 52, 6, PAL.dark);
      const low = fuel < 25;
      g.rect(31, 4, 50 * (fuel / 100), 4, low ? (Math.floor(frame / 8) % 2 ? PAL.red : PAL.orange) : PAL.lime);
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
