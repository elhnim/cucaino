// DIRT DASH — a side-view motocross race over 3 original tracks. Hold A to throttle, hold B
// for turbo (watch the HEAT gauge — overheat and the engine stalls for a moment), ▲ ▼ to
// switch between the 4 lanes, and ◀ ▶ to lean the bike in the air: land level with the
// ground or you tumble. Hay bales knock you off, mud slows you down, rival riders get in
// the way. Beat each track's qualify time to move on; clear all 3 to win the cup.
// (Original game in the spirit of 8-bit motocross racers.)
import { PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const LANE_Y = [136, 152, 168, 184]; // wheel baseline of each lane (far → near)
const BIKE_SX = 72; // the bike's screen x
const GRAV = 0.13;
const LAND_OK = 0.55; // how far off the ground angle (radians) a landing may be

interface Track {
  name: string;
  seed: number;
  len: number;
  time: number;
  dirt: string;
  sky: string;
  hill: string;
  rivalV: [number, number];
}
const TRACKS: Track[] = [
  { name: "SUNNY HILLS", seed: 11, len: 6400, time: 56, dirt: "#c98a4a", sky: "#6cb6ff", hill: "#3ecf55", rivalV: [2.1, 2.6] },
  { name: "CANDY CANYON", seed: 23, len: 7400, time: 63, dirt: "#d9906a", sky: "#ffb3e6", hill: "#ff9a3c", rivalV: [2.3, 2.9] },
  { name: "THUNDER DUNES", seed: 37, len: 8400, time: 70, dirt: "#e0b060", sky: "#9a5cff", hill: "#26306b", rivalV: [2.5, 3.1] },
];

const HAY = sprite(
  ["..yyyyyyyyyy..", ".yooyooyooyoy.", "yyyyyyyyyyyyyy", "yoyooyooyooyoy", "yyyyyyyyyyyyyy", "ynnnnnnnnnnnny", "yyyyyyyyyyyyyy", "yooyooyooyooyy", "yyyyyyyyyyyyyy", ".yoyooyooyooy.", "..yyyyyyyyyy.."],
  { y: PAL.yellow, o: PAL.orange, n: PAL.brown },
);

interface Ramp {
  x: number;
  up: number;
  top: number;
  down: number; // 0 = sheer drop (a jump)
  h: number;
}
interface Spot {
  x: number;
  lane: number;
  w: number;
  gone: boolean;
}
interface Rider {
  x: number;
  lane: number;
  y: number; // current baseline (animates between lanes)
  alt: number;
  vy: number;
  air: boolean;
  pitch: number;
  v: number;
  color: string;
  passed: boolean;
  t: number;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

function buildTrack(t: Track, level: number) {
  const r = rng(t.seed);
  const ramps: Ramp[] = [];
  const hay: Spot[] = [];
  const mud: Spot[] = [];
  let x = 520;
  while (x < t.len - 500) {
    const k = r.int(0, 5 + level);
    if (k <= 1) {
      const h = r.int(14, 20 + level * 3);
      ramps.push({ x, up: 50, top: r.int(10, 30), down: 50, h });
      x += 130 + r.int(120, 220);
    } else if (k <= 3) {
      const h = r.int(20, 26 + level * 5);
      ramps.push({ x, up: 56 + level * 4, top: 0, down: 0, h });
      x += 60 + r.int(230, 300); // room to land
    } else if (k === 4) {
      ramps.push({ x, up: 50, top: r.int(70, 110), down: 50, h: r.int(18, 24) });
      x += 230 + r.int(120, 200);
    } else if (k === 5) {
      // hay bales in 1–3 lanes, never all 4
      const lanes = [0, 1, 2, 3].sort(() => r.next() - 0.5).slice(0, r.int(1, Math.min(3, 1 + level)));
      for (const lane of lanes) hay.push({ x: x + r.int(0, 30), lane, w: 14, gone: false });
      x += r.int(160, 240);
    } else {
      const lanes = [0, 1, 2, 3].sort(() => r.next() - 0.5).slice(0, r.int(1, 2));
      const w = r.int(60, 120);
      for (const lane of lanes) mud.push({ x, lane, w, gone: false });
      x += w + r.int(120, 200);
    }
  }
  return { ramps, hay, mud };
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let ti = 0;
  let track = TRACKS[0];
  let course = buildTrack(track, 0);
  const bike = { x: 0, lane: 1, y: LANE_Y[1], alt: 0, vy: 0, v: 0, pitch: 0, air: false, tumble: 0, heat: 0, stall: 0, wheel: 0, laneCool: 0, airT: 0 };
  let rivals: Rider[] = [];
  const bits: Bit[] = [];
  let time = 0;
  let state: "count" | "race" | "done" | "fail" | "won" = "count";
  let stateT = 0;
  let frame = 0;
  let msg = "";
  let msgT = 0;
  let rivalT = 0;

  const groundH = (x: number) => {
    for (const p of course.ramps) {
      if (x < p.x) return 0;
      const rel = x - p.x;
      if (rel < p.up) return (p.h * rel) / p.up;
      if (rel < p.up + p.top) return p.h;
      if (p.down > 0 && rel < p.up + p.top + p.down) return p.h * (1 - (rel - p.up - p.top) / p.down);
    }
    return 0;
  };
  const slope = (x: number) => (groundH(x + 1) - groundH(x - 1)) / 2;
  const say = (s: string, t = 60) => {
    msg = s;
    msgT = t;
  };
  const dust = (x: number, y: number, c: string, n: number, up = 1) => {
    for (let i = 0; i < n; i++) bits.push({ x, y, vx: r.range(-1.6, 0.4), vy: -r.range(0.2, 1.4) * up, life: r.int(12, 24), c });
  };

  const startTrack = () => {
    track = TRACKS[ti];
    course = buildTrack(track, ti);
    Object.assign(bike, { x: 0, lane: 1, y: LANE_Y[1], alt: 0, vy: 0, v: 0, pitch: 0, air: false, tumble: 0, heat: 0, stall: 0, laneCool: 0 });
    time = track.time;
    state = "count";
    stateT = 180;
    rivals = [];
    const colors = [PAL.blue, PAL.green, PAL.purple, PAL.teal, PAL.pink];
    for (let i = 0; i < 4; i++) {
      const lane = (i + 2) % 4;
      rivals.push({ x: 40 + i * 50, lane, y: LANE_Y[lane], alt: 0, vy: 0, air: false, pitch: 0, v: r.range(track.rivalV[0], track.rivalV[1]), color: colors[i], passed: false, t: 0 });
    }
  };
  startTrack();

  /** shared ground-following / jumping physics for every bike */
  const ride = (b: { x: number; alt: number; vy: number; air: boolean; pitch: number }, v: number) => {
    const rise = slope(b.x) * v;
    b.x += v;
    const g1 = groundH(b.x);
    if (!b.air) {
      if (b.alt + Math.max(0, rise) > g1 + 1.5) {
        b.air = true;
        b.vy = Math.max(0, rise);
      } else {
        b.alt = g1;
        b.pitch = Math.atan(slope(b.x));
        return "ground";
      }
    }
    b.vy -= GRAV;
    b.alt += b.vy;
    if (b.alt <= g1 && b.vy < 0) {
      b.alt = g1;
      b.air = false;
      return "land";
    }
    return "air";
  };

  const tumble = (io: IO, why: string) => {
    bike.tumble = 70;
    bike.air = false;
    bike.v = Math.min(bike.v, 0.8);
    io.sfx.play("die");
    say(why, 50);
    dust(BIKE_SX, bike.y - bike.alt, PAL.tan, 10, 1.5);
  };

  return {
    update(io) {
      frame++;
      if (msgT > 0) msgT--;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx - bike.v; // bits live in screen space; the world scrolls under them
        b.y += b.vy;
        b.vy += 0.06;
        if (--b.life <= 0) bits.splice(i, 1);
      }
      if (state === "won") return;
      if (state === "count") {
        stateT--;
        if (stateT % 60 === 0 && stateT > 0) io.sfx.tone(440, 0.15, "square", 0.08);
        if (stateT <= 0) {
          state = "race";
          io.sfx.tone(880, 0.3, "square", 0.1);
          say("GO!", 40);
        }
        return;
      }
      if (state === "done") {
        bike.v = Math.max(0, bike.v - 0.05);
        bike.x += bike.v;
        if (--stateT <= 0) {
          if (ti >= TRACKS.length - 1) {
            state = "won";
            io.win();
          } else {
            ti++;
            startTrack();
          }
        }
        return;
      }
      if (state === "fail") {
        bike.v = Math.max(0, bike.v - 0.05);
        if (--stateT === 0) io.gameOver();
        return;
      }

      // ── race ──
      time -= 1 / 60;
      if (time <= 0) {
        time = 0;
        state = "fail";
        stateT = 90;
        say("DID NOT QUALIFY", 999);
        io.sfx.play("die");
        return;
      }
      const inp = io.input;
      if (bike.laneCool > 0) bike.laneCool--;
      if (bike.tumble > 0) {
        bike.tumble--;
        bike.v *= 0.92;
        bike.x += bike.v;
        bike.alt = groundH(bike.x);
        if (bike.tumble === 0) {
          bike.pitch = Math.atan(slope(bike.x));
          say("GO GO!", 30);
        }
      } else {
        // engine + turbo heat
        let top = 0;
        if (bike.stall > 0) {
          bike.stall--;
          bike.heat = Math.max(0, bike.heat - 0.6);
          if (bike.stall % 20 === 0) io.sfx.tone(90, 0.1, "sawtooth", 0.05);
        } else if (inp.held.b) {
          top = 4.1;
          bike.heat += 0.8;
          if (bike.heat >= 100) {
            bike.heat = 100;
            bike.stall = 100;
            io.sfx.play("explode");
            say("OVERHEAT!", 70);
          }
        } else if (inp.held.a) top = 3;
        if (!inp.held.b && bike.stall === 0) bike.heat = Math.max(0, bike.heat - 0.45);
        const inMud = !bike.air && course.mud.some((m) => m.lane === bike.lane && bike.x + 6 > m.x && bike.x - 6 < m.x + m.w);
        if (inMud) {
          top = Math.min(top, 1.3);
          if (frame % 3 === 0 && bike.v > 0.5) bits.push({ x: BIKE_SX - 8, y: bike.y - 2, vx: -1, vy: -1.2, life: 16, c: "#5a3a1e" });
        }
        if (!bike.air) {
          if (bike.v < top) bike.v += top > 3.5 ? 0.07 : 0.05;
          else bike.v -= inMud ? 0.12 : 0.04;
          bike.v -= slope(bike.x) * 0.03;
          bike.v = clamp(bike.v, 0, 4.3);
          if (top > 0 && frame % 4 === 0) dust(BIKE_SX - 10, bike.y - bike.alt, "#e8c89a", 1);
        }
        // lanes (only with wheels down)
        if (!bike.air && bike.laneCool === 0) {
          if (inp.held.up && bike.lane > 0) {
            bike.lane--;
            bike.laneCool = 14;
            io.sfx.play("step");
          } else if (inp.held.down && bike.lane < 3) {
            bike.lane++;
            bike.laneCool = 14;
            io.sfx.play("step");
          }
        }
        // lean in the air (and the bike slowly noses up by itself)
        if (bike.air) {
          bike.airT++;
          if (inp.held.left) bike.pitch += 0.055;
          if (inp.held.right) bike.pitch -= 0.055;
          bike.pitch = clamp(bike.pitch + 0.006, -1.3, 1.3);
        }
        const wasAir = bike.air;
        const res = ride(bike, bike.v);
        if (!wasAir && res === "air") {
          bike.airT = 0;
          io.sfx.play("jump");
        }
        if (res === "land") {
          const diff = Math.abs(bike.pitch - Math.atan(slope(bike.x)));
          if (diff > LAND_OK) tumble(io, "TUMBLE!");
          else {
            dust(BIKE_SX, bike.y - bike.alt, "#e8c89a", 6, 1.2);
            io.sfx.play("bounce");
            if (bike.airT > 16) {
              if (diff < 0.18) {
                io.score(300);
                bike.v = Math.min(4.3, bike.v + 0.4);
                bike.heat = Math.max(0, bike.heat - 30);
                say("PERFECT LANDING!", 45);
                io.sfx.play("coin");
              } else io.score(80);
            }
            bike.pitch = Math.atan(slope(bike.x));
          }
        }
        // hay bales
        for (const hb of course.hay) {
          if (hb.gone || hb.lane !== bike.lane || Math.abs(bike.y - LANE_Y[hb.lane]) > 6) continue;
          if (bike.x + 7 > hb.x && bike.x - 7 < hb.x + hb.w && bike.alt < 10) {
            hb.gone = true;
            for (let i = 0; i < 12; i++) bits.push({ x: hb.x - bike.x + BIKE_SX + 7, y: LANE_Y[hb.lane] - 6, vx: r.range(-1.5, 2), vy: -r.range(0.5, 2.5), life: r.int(20, 34), c: r.chance(0.5) ? PAL.yellow : PAL.orange });
            tumble(io, "HAY BALE!");
          }
        }
      }
      bike.wheel += bike.v * 0.3;
      bike.y += clamp(LANE_Y[bike.lane] - bike.y, -2, 2);

      // ── rivals ──
      rivalT--;
      if (rivalT <= 0 && rivals.length < 5 && bike.x < track.len - 700) {
        rivalT = r.int(200, 360);
        const lane = r.int(0, 3);
        rivals.push({ x: bike.x + W, lane, y: LANE_Y[lane], alt: groundH(bike.x + W), vy: 0, air: false, pitch: 0, v: r.range(track.rivalV[0] - 0.4, track.rivalV[1] - 0.3), color: r.pick([PAL.blue, PAL.green, PAL.purple, PAL.teal]), passed: false, t: 0 });
      }
      for (const rv of rivals) {
        rv.t++;
        // steer round hay bales ahead
        if (!rv.air && rv.y === LANE_Y[rv.lane] && course.hay.some((hb) => !hb.gone && hb.lane === rv.lane && hb.x > rv.x && hb.x - rv.x < 70)) {
          const alt = rv.lane === 0 ? 1 : rv.lane === 3 ? 2 : rv.t % 2 ? rv.lane - 1 : rv.lane + 1;
          rv.lane = alt;
        }
        rv.y += clamp(LANE_Y[rv.lane] - rv.y, -1.5, 1.5);
        const res = ride(rv, rv.v);
        if (res === "land") rv.pitch = Math.atan(slope(rv.x));
        if (rv.air) rv.pitch = clamp(rv.pitch - 0.02, -0.5, 0.8);
        // bumping a rival from behind slows you down
        if (bike.tumble === 0 && rv.lane === bike.lane && Math.abs(rv.y - bike.y) < 6 && bike.x < rv.x && rv.x - bike.x < 16 && Math.abs(rv.alt - bike.alt) < 10) {
          bike.v = Math.min(bike.v, rv.v * 0.7);
          rv.x += 2;
          if (frame % 10 === 0) io.sfx.play("hit");
        }
        if (!rv.passed && bike.x > rv.x + 16) {
          rv.passed = true;
          io.score(100);
          io.sfx.play("blip");
        }
      }
      rivals = rivals.filter((rv) => rv.x > bike.x - 160 && rv.x < bike.x + 700);

      // ── finish ──
      if (bike.x >= track.len) {
        state = "done";
        stateT = 170;
        const left = Math.ceil(time);
        io.score(1000 + left * 100 + ti * 500);
        io.sfx.play("win");
        say(ti >= TRACKS.length - 1 ? "CHAMPION!" : `QUALIFIED! +${left} SEC`, 170);
      }
    },

    draw(g: Gfx) {
      const camX = bike.x - BIKE_SX;
      const wrap = (v: number, m: number) => ((v % m) + m) % m;
      // sky + hills
      g.clear(track.sky);
      g.rect(0, 0, W, 30, "rgba(255,255,255,0.18)");
      g.circle(206, 30, 14, "#fff6a8");
      for (let i = 0; i < 5; i++) g.circle(wrap(i * 70 - camX * 0.1, 350) - 40, 90, 44, track.hill);
      for (let i = 0; i < 6; i++) g.circle(wrap(i * 60 + 20 - camX * 0.2, 360) - 50, 100, 30, "rgba(13,11,26,0.18)");
      // grandstand with a cheering crowd (parallax)
      g.rect(0, 78, W, 34, "#4a4e6a");
      g.rect(0, 76, W, 3, PAL.white);
      const cols = ["#ffd1a8", PAL.tan, PAL.brown, "#c68642", PAL.pink, PAL.yellow];
      const off = camX * 0.5;
      for (let row = 0; row < 3; row++) {
        for (let i = Math.floor(off / 7) - 1; i < Math.floor(off / 7) + W / 7 + 2; i++) {
          const hsh = Math.abs(Math.sin(i * 12.9898 + row * 78.233) * 43758.5453) % 1;
          if (hsh < 0.15) continue;
          const x = i * 7 - off + (row % 2) * 3;
          const bob = Math.sin(frame * 0.25 + i * 1.7 + row) > 0.6 ? -2 : 0;
          const shirt = [PAL.red, PAL.blue, PAL.green, PAL.purple, PAL.orange, PAL.cyan][Math.floor(hsh * 60) % 6];
          g.rect(x, 86 + row * 9 + bob, 5, 5, shirt);
          g.rect(x + 1, 82 + row * 9 + bob, 3, 3, cols[Math.floor(hsh * 100) % cols.length]);
        }
      }
      // fence with ad boards
      g.rect(0, 112, W, 10, PAL.white);
      for (let i = Math.floor(camX / 90) - 1; i < Math.floor(camX / 90) + 4; i++) {
        const x = i * 90 - camX;
        g.rect(x, 112, 60, 10, i % 2 ? PAL.red : PAL.blue);
        g.text(i % 3 === 0 ? "CUCAINO" : i % 3 === 1 ? "GO GO!" : "DIRT", x + 30, 114, PAL.white, { align: "center" });
      }
      // the dirt track
      g.rect(0, 122, W, 102, track.dirt);
      for (let l = 0; l < 4; l++) {
        const y = LANE_Y[l] + 3;
        for (let i = Math.floor(camX / 24) - 1; i < Math.floor(camX / 24) + 12; i++) g.rect(i * 24 - camX, y, 12, 1, "rgba(255,255,255,0.35)");
      }
      g.rect(0, 190, W, 34, "#2f9a44");
      g.rect(0, 190, W, 2, PAL.lime);

      const bikeLane = LANE_Y.reduce((best, y, i) => (Math.abs(y - bike.y) < Math.abs(LANE_Y[best] - bike.y) ? i : best), 0);
      for (let l = 0; l < 4; l++) {
        const base = LANE_Y[l];
        // ramps
        for (const p of course.ramps) {
          const x0 = p.x - camX;
          const x1 = x0 + p.up + p.top + p.down;
          if (x1 < -2 || x0 > W + 2) continue;
          for (let sx = Math.max(-1, Math.floor(x0)); sx < Math.min(W + 1, x1 + 1); sx += 2) {
            const gh = groundH(sx + camX);
            if (gh <= 0.5) continue;
            g.rect(sx, base - gh, 2, gh + 1, l % 2 ? "#8a5a2c" : "#7a4a24");
            g.rect(sx, base - gh, 2, 2, "#e8c89a");
          }
        }
        for (const m of course.mud) {
          if (m.lane !== l) continue;
          const x = m.x - camX;
          if (x > W || x + m.w < 0) continue;
          g.rect(x, base - 3, m.w, 6, "#5a3a1e");
          g.rect(x + 4, base - 2, m.w - 8, 2, "#7a5030");
        }
        // finish line
        const fx = track.len - camX;
        if (fx > -10 && fx < W + 10) {
          for (let k = 0; k < 4; k++) g.rect(fx + (k % 2) * 4, base - 10 + k * 3, 4, 3, PAL.black);
          for (let k = 0; k < 4; k++) g.rect(fx + ((k + 1) % 2) * 4, base - 10 + k * 3, 4, 3, PAL.white);
        }
        for (const hb of course.hay) if (!hb.gone && hb.lane === l) g.sprite(HAY, hb.x - camX, base - 11);
        for (const rv of rivals) if (Math.round((rv.y - LANE_Y[0]) / 16) === l) drawBike(g, rv.x - camX, rv.y - rv.alt, rv.pitch, rv.color, rv.t * 0.4, 0);
        if (l === bikeLane) {
          const tum = bike.tumble;
          drawBike(g, BIKE_SX, bike.y - bike.alt, tum > 0 ? tum * 0.35 : bike.pitch, PAL.red, bike.wheel, tum);
        }
      }
      for (const b of bits) g.rect(b.x, b.y, 2, 2, b.c);
      if (fxInView(track.len - camX)) g.text("FINISH", track.len - camX + 4, 124, PAL.white, { align: "center" });

      // HUD
      g.rect(0, 0, W, 22, "rgba(13,11,26,0.6)");
      g.text(`TRACK ${ti + 1}/3 ${track.name}`, 4, 3, PAL.white);
      g.text(`TIME ${time.toFixed(1)}`, W - 4, 3, time < 10 && frame % 20 < 10 ? PAL.red : PAL.yellow, { align: "right" });
      g.text("HEAT", 4, 13, PAL.white);
      g.rect(30, 13, 62, 6, PAL.dark);
      const hot = bike.stall > 0 ? (frame % 10 < 5 ? PAL.red : PAL.white) : bike.heat > 75 ? PAL.red : bike.heat > 45 ? PAL.orange : PAL.lime;
      g.rect(31, 14, 60 * (bike.heat / 100), 4, hot);
      // mini course map
      g.rect(104, 15, 148, 2, PAL.grey);
      for (const rv of rivals) g.rect(104 + 146 * clamp(rv.x / track.len, 0, 1), 13, 2, 6, rv.color);
      g.rect(104 + 144 * clamp(bike.x / track.len, 0, 1), 12, 4, 8, PAL.red);
      g.rect(250, 12, 2, 8, PAL.white);
      if (state === "count") {
        const n = Math.ceil(stateT / 60);
        g.text(`QUALIFY IN ${track.time} SEC`, W / 2, 44, PAL.white, { align: "center" });
        g.text(`${n}`, W / 2, 58, PAL.yellow, { align: "center", size: 3 });
      }
      if (msgT > 0) g.text(msg, W / 2, 50, state === "fail" ? PAL.red : PAL.yellow, { align: "center", size: msg.length > 12 ? 1 : 2 });
      if (bike.air && bike.tumble === 0 && Math.abs(bike.pitch) > 0.35 && frame % 16 < 10) g.text(bike.pitch > 0 ? "LEAN > !" : "< LEAN !", W / 2, 32, PAL.white, { align: "center" });
    },
  };
}

const fxInView = (x: number) => x > -20 && x < W + 20;

/** a procedurally drawn dirt bike + rider, rotated by pitch (nose-up positive) */
function drawBike(g: Gfx, cx: number, baseY: number, pitch: number, color: string, wheel: number, tumble: number) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const fx = c;
  const fy = -s; // forward
  const ux = -s;
  const uy = -c; // up
  const ox = cx;
  const oy = baseY - 4;
  const rear = { x: ox - fx * 7, y: oy - fy * 7 };
  const front = { x: ox + fx * 7, y: oy + fy * 7 };
  for (const wh of [rear, front]) {
    g.circle(wh.x, wh.y, 4, PAL.black);
    g.circle(wh.x, wh.y, 2, PAL.grey);
    g.rect(wh.x + Math.cos(wheel) * 2 - 0.5, wh.y + Math.sin(wheel) * 2 - 0.5, 1, 1, PAL.white);
  }
  const seat = { x: ox + ux * 5 - fx * 2, y: oy + uy * 5 - fy * 2 };
  const bars = { x: ox + ux * 7 + fx * 5, y: oy + uy * 7 + fy * 5 };
  g.line(rear.x, rear.y, seat.x, seat.y, color);
  g.line(seat.x, seat.y, bars.x, bars.y, color);
  g.line(bars.x, bars.y, front.x, front.y, PAL.grey);
  g.rect(ox - 2, oy - 2 + uy * 2, 4, 3, PAL.dark);
  if (tumble > 0) {
    // rider tumbles off in a cartoon roll
    const t = 70 - tumble;
    const rx = cx - 10 - Math.min(t, 30) * 0.3;
    const ry = baseY - 6 - Math.abs(Math.sin(t * 0.25)) * 8;
    g.circle(rx, ry, 4, PAL.white);
    g.circle(rx, ry, 3, color);
    g.rect(rx - 1, ry - 1, 2, 2, PAL.cyan);
    if (t % 12 < 6) g.text("*", rx + 4, ry - 10, PAL.yellow);
    return;
  }
  const hip = { x: seat.x, y: seat.y };
  const head = { x: hip.x + ux * 8 + fx * 3, y: hip.y + uy * 8 + fy * 3 };
  g.line(hip.x, hip.y, head.x, head.y, PAL.white);
  g.line(hip.x + ux * 5 + fx * 2, hip.y + uy * 5 + fy * 2, bars.x, bars.y, PAL.white);
  g.line(hip.x, hip.y, ox + fx * 2, oy, PAL.navy);
  g.circle(head.x, head.y, 3, color);
  g.rect(head.x + fx * 2 - 1, head.y + fy * 2 - 1, 2, 2, PAL.cyan);
}

export const dirtDash: RetroGameDef = {
  id: "dirt-dash",
  title: "Dirt Dash",
  blurb: "Race dirt bikes over jumps on 3 tracks. Land it level!",
  genre: "Racing",
  emoji: "🏍️",
  color: "#f2c48d",
  controls: "A throttle · B turbo (watch HEAT) · ▲ ▼ change lane · ◀ ▶ lean in the air",
  pad: { dpad: "4", a: "Gas", b: "Turbo" },
  create,
};
