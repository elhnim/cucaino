// SUMMER GAMES — an original side-scrolling track-and-field meet in the spirit of the 8-bit
// multi-event classics (no trademarked names or logos here, just our own candy-pixel athletes).
// Tap A and B back and forth (or mash A) to build up your pace, press ▲ to clear a hurdle, and
// hold A/B then let go to aim a long jump or javelin throw. Four events, run in order, each with
// a qualifying mark to beat — miss it and the meet is over; beat it and you climb the podium.
import { H, PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeShadow, hash2, outlined, shade, tinted } from "../art";

// ── layout ──
// crowd (0-44) + fence/ad boards (44-58) + track/runway filling the rest of the screen — no gap.
const PXM = 9; // pixels per metre of track/runway
const CROWD_H = 44; // stand height
const TRACK_TOP = 58; // where the track/runway visuals start (right under the fence)
const GROUND_Y = 204; // the player's (near) lane baseline — feet stand here
const RIVAL_Y = 162; // the rival's lane baseline, a lane further back (smaller, higher on screen)
const LANE_LINES = [100, 141, 183]; // dividers between the 4 lanes, far → near
const LANE_CENTERS = [TRACK_TOP + 21, 120, RIVAL_Y, GROUND_Y]; // worn-groove bands + lane number rows
const TRACK_COLOR = "#c9894b"; // sampled from the cabinet painting's track dirt
const SPRITE_H = 14; // unscaled athlete sprite height (rows): 8 head/torso + 6 legs
const PLAYER_SCALE = 2.4; // ~34px tall, matching the painting's hero proportions
const RIVAL_SCALE = 1.8; // smaller: a lane further back
const CAM_OFFSET = 90; // the runner sits about a third in from the left, not pinned to the edge
const SPEED_MAX = 3.2; // fastest pace, px/frame
const BOOST_ALT = 0.13; // speed added for an A→B or B→A tap
const BOOST_SAME = 0.08; // speed added for mashing the same button twice in a row
const DECAY = 0.985; // pace fades a little every frame
const OVERRUN_PX = 34; // how far past the board/line you can run before it's an automatic foul
const FOUL_TOL = 6; // a few forgiving pixels past the board before it counts as a foul
const RUNUP_TIMEOUT = 600; // 10s — auto-attempt if nobody presses the jump button
const JUMP_WINDOW = 26; // frames a hurdle jump stays "active" after pressing ▲

// ── pixel art: a sprinter built from a 12-wide head/torso (two arm-swing variants, so the
//    trailing arm the painting shows actually pumps) plus a 12-wide leg frame per stride. 3-4
//    shading tones per colour (a highlight and a shadow key alongside the base) give the small
//    sprite some roundness, and `outlined` wraps the whole thing in a 1px dark edge so it still
//    reads crisply against the busy stadium backdrop. ──
const HEAD = ["..jjjjjjjj..", "..hhhhhhJJ..", "..hhkhhkhh..", "..hhhhhhhh.."];
// torso A: shoulders bump a px wider than the head (breaks the outline into a shoulder, not one
// long straight side), then a short trailing-arm nub on the chest row; torso B swings it right
const TORSO_A = [".wwwwwwwwww.", "Aawwwwwwww..", ".awwwwwwww..", "..uuuuuuuu.."];
const TORSO_B = [".wwwwwwwwww.", "..wwwwwwwwaA", "..wwwwwwwwa.", "..uuuuuuuu.."];
const LEG_A = ["....b..c....", "...b....c...", "..b......c..", ".b........c.", "oo........oo", "tt........tt"];
const LEG_B = [".....bc.....", ".....bc.....", "....b..c....", "....b..c....", "...oo..oo...", "...tt..tt..."];
const LEG_C = ["....c..b....", "...c....b...", "..c......b..", ".c........b.", "oo........oo", "tt........tt"];
const LEG_JUMP = ["...b....c...", "..bb....cc..", ".ooo....ooo.", "............", "............", "............"];
const LEG_STUMBLE = [".b.......c..", "o.........o.", "............", "............", "............", "............"];
function athletePal(skin: string, headband: string, shirt: string, shorts: string, farLeg: string, nearLeg: string) {
  return {
    j: headband,
    J: shade(headband, -0.3),
    h: skin,
    H: shade(skin, -0.22),
    k: PAL.black,
    w: shirt,
    a: skin,
    A: shade(skin, -0.2),
    u: shorts,
    b: shade(farLeg, -0.25),
    c: nearLeg,
    o: PAL.black,
    t: PAL.grey,
  };
}
const AP = athletePal("#ffd9a8", PAL.red, PAL.white, PAL.navy, PAL.blue, PAL.blue);
const RP = athletePal("#ffd9a8", PAL.blue, PAL.yellow, PAL.purple, PAL.pink, PAL.pink);
function makeFrames(pal: Record<string, string>): Sprite[] {
  const build = (torso: string[], legs: string[]) => outlined(sprite([...HEAD, ...torso, ...legs], pal));
  return [build(TORSO_A, LEG_A), build(TORSO_B, LEG_B), build(TORSO_A, LEG_C), build(TORSO_B, LEG_B)];
}

// ── big/baked art lives behind one lazy memo: the arcade imports every game's module at once, so
//    none of this runs (and no canvases get cached) until this game is actually created ──
const TILE_W = 32; // ground tiles repeat every 32px along the track/runway
const AD_H = TRACK_TOP - CROWD_H - 4; // bunting-board height between the fence and the track
function bakeGround(base: string, grooves: number[]): Sprite {
  const h = H - TRACK_TOP;
  return bake(TILE_W, h, (x, y) => {
    for (const gy of grooves) if (Math.abs(y - gy) <= 1) return shade(base, -0.22);
    const n = hash2(x + 101, y, 5);
    return n > 0.93 ? shade(base, -0.16) : n < 0.08 ? shade(base, 0.12) : base;
  });
}
function bakeSand(): Sprite {
  const base = "#e8c98a";
  return bake(TILE_W, H - TRACK_TOP, (x, y) => {
    const n = hash2(x + 7, y + 3, 17);
    return n > 0.9 ? shade(base, -0.18) : n < 0.12 ? shade(base, 0.16) : base;
  });
}
function bakeGrass(): Sprite {
  const base = "#5a9a4e";
  return bake(TILE_W, H - TRACK_TOP, (x, y) => {
    const blade = hash2(Math.floor(x / 2), 11, 3) > 0.55;
    if (hash2(x, y, 29) > 0.95) return shade(base, -0.2);
    return blade ? shade(base, 0.1) : base;
  });
}
/** a wood-plank fence tile under the crowd, grained instead of a flat brown bar */
function bakeBoard(): Sprite {
  const color = "#8a5a2c";
  return bake(16, 6, (x, y) => (y === 0 ? shade(color, 0.3) : x % 6 === 0 ? shade(color, -0.16) : color));
}
/** a beveled bunting panel (yellow/pink), not a flat rect */
function bakeAdPanel(color: string): Sprite {
  return bake(26, AD_H, (x, y) => (y === 0 ? shade(color, 0.3) : y === AD_H - 1 ? shade(color, -0.3) : x === 0 || x === 25 ? shade(color, -0.15) : color));
}
/** a little round light/flag dot in the stands, lit from the top-left */
function bakeLight(color: string): Sprite {
  return bake(6, 6, (x, y) => {
    const dx = (x - 2.5) / 3;
    const dy = (y - 2.5) / 3;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (dx < -0.2 && dy < -0.2) return shade(color, 0.45);
    return d > 0.6 ? shade(color, -0.2) : color;
  });
}
// a candy-cane hurdle: a red/white striped bar on two posts with a dark base plate
function bakeHurdle(): Sprite {
  return outlined(
    bake(12, 18, (x, y) => {
      if (y < 3) {
        if (Math.abs(x - 2) > 1 && Math.abs(x - 9) > 1) return null;
        return y === 0 ? shade(PAL.red, 0.2) : PAL.white;
      }
      if (y === 3) return x < 2 || x > 9 ? null : (x + y) % 4 < 2 ? PAL.red : PAL.white;
      if (y < 15) return x === 2 || x === 9 ? shade(PAL.grey, -0.1) : null;
      return x < 1 || x > 10 ? null : PAL.dark;
    }),
  );
}
/** tile a textured ground sprite across a world-space span (inside an active g.camera block) */
function tileFill(g: Gfx, tile: Sprite, left: number, right: number, y: number) {
  const start = Math.floor(left / TILE_W) * TILE_W;
  for (let x = start; x < right; x += TILE_W) g.sprite(tile, x, y);
}
function makeArt() {
  const grooves = LANE_CENTERS.map((y) => y - TRACK_TOP);
  const playerFrames = makeFrames(AP);
  const playerStumble = outlined(sprite([...HEAD, ...TORSO_B, ...LEG_STUMBLE], AP));
  return {
    playerFrames,
    rivalFrames: makeFrames(RP),
    playerJump: outlined(sprite([...HEAD, ...TORSO_A, ...LEG_JUMP], AP)),
    playerStumble,
    stumbleFlash: tinted(playerStumble, "#fff8e8"),
    shadow: bakeShadow(14, 5, "rgba(20,12,10,0.4)"),
    hurdle: bakeHurdle(),
    track: bakeGround(TRACK_COLOR, grooves),
    sand: bakeSand(),
    grass: bakeGrass(),
    board: bakeBoard(),
    adPanels: { yellow: bakeAdPanel("#ffd24d"), pink: bakeAdPanel("#fe6ecf") },
    lights: [bakeLight(PAL.yellow), bakeLight(PAL.pink), bakeLight(PAL.cyan)],
  };
}
type Art = ReturnType<typeof makeArt>;
let ART: Art | null = null;
const art = () => (ART ??= makeArt());

// ── events ──
type Kind = "sprint" | "jump" | "throw";
interface EventDef {
  name: string;
  kind: Kind;
  meters: number; // race length, or runway length for field events
  hurdles?: number;
  gold: number;
  silver: number;
  bronze: number; // the qualifying mark
  unit: "s" | "m";
}
const EVENTS: EventDef[] = [
  { name: "100M DASH", kind: "sprint", meters: 100, gold: 11, silver: 12.5, bronze: 15, unit: "s" },
  { name: "110M HURDLES", kind: "sprint", meters: 110, hurdles: 8, gold: 14, silver: 17, bronze: 21, unit: "s" },
  { name: "LONG JUMP", kind: "jump", meters: 40, gold: 6, silver: 4.5, bronze: 3, unit: "m" },
  { name: "JAVELIN THROW", kind: "throw", meters: 30, gold: 38, silver: 28, bronze: 18, unit: "m" },
];

type Medal = "gold" | "silver" | "bronze" | null;
function medalFor(ev: EventDef, mark: number): Medal {
  if (!Number.isFinite(mark)) return null;
  if (ev.unit === "s") {
    if (mark <= ev.gold) return "gold";
    if (mark <= ev.silver) return "silver";
    if (mark <= ev.bronze) return "bronze";
    return null;
  }
  if (mark >= ev.gold) return "gold";
  if (mark >= ev.silver) return "silver";
  if (mark >= ev.bronze) return "bronze";
  return null;
}
const medalColor = (m: Medal) => (m === "gold" ? PAL.yellow : m === "silver" ? "#e3e8ff" : m === "bronze" ? PAL.orange : PAL.grey);
const medalPoints = (m: Medal) => (m === "gold" ? 500 : m === "silver" ? 300 : m === "bronze" ? 150 : 0);

// ── shared pace mechanic: alternating A/B (or mashed A) builds speed, every game reads `pressed` ──
interface Pace {
  speed: number;
  last: "a" | "b" | null;
}
function pump(inp: Input, p: Pace) {
  if (inp.pressed.a || inp.pressed.b) {
    const btn: "a" | "b" = inp.pressed.a ? "a" : "b";
    p.speed = Math.min(SPEED_MAX, p.speed + (btn === p.last ? BOOST_SAME : BOOST_ALT));
    p.last = btn;
  }
  p.speed *= DECAY;
}

interface Runner {
  x: number;
  pace: Pace;
}
interface Hurdle {
  x: number;
  cleared: boolean | null;
}
interface FieldRun {
  pace: Pace;
  x: number;
  runT: number;
  angle: number;
  angleDir: 1 | -1;
  attempt: number;
  best: number;
  lastFoul: boolean;
  flyX: number;
  flyY: number;
  flyVX: number;
  flyVY: number;
  flyGrav: number;
  flyFromX: number;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  g: number;
}
interface Result {
  mark: number;
  medal: Medal;
}
type Phase = "card" | "marks" | "set" | "wait" | "go" | "run" | "runup" | "hold" | "flight" | "result" | "fail" | "podium";

function create(seed: number): GameInstance {
  const A = art();
  const r = rng(seed);
  const results: Result[] = [];
  const confetti: Bit[] = []; // screen-space celebration
  const fx: Bit[] = []; // world-space hit/sand effects

  let eventIdx = 0;
  let phase: Phase = "card";
  let phaseT = 110;
  let frame = 0;
  let message = "";
  let messageT = 0;
  let shakeT = 0; // a few frames of camera jitter on a hurdle stumble
  let playerGait = -1; // last foot-plant phase, so dust/step sfx fire once per plant, not per frame
  let fieldGait = -1;

  // sprint state
  let player: Runner = { x: 0, pace: { speed: 0, last: null } };
  let rival: Runner = { x: 0, pace: { speed: 0, last: null } };
  let rivalBaseSpeed = 1.5;
  let hurdles: Hurdle[] = [];
  let jumpT = 0;
  let stumbleT = 0;
  let falseStarts = 0;
  let runFrames = 0;

  // field state
  let field: FieldRun = { pace: { speed: 0, last: null }, x: 0, runT: 0, angle: 45, angleDir: 1, attempt: 1, best: -1, lastFoul: false, flyX: 0, flyY: 0, flyVX: 0, flyVY: 0, flyGrav: 0.2, flyFromX: 0 };

  /** which of the 4 running frames is "down" right now — shared by the draw loop and the
   *  footstep/dust triggers below so a dust puff always lines up with a foot touching down */
  const gaitPhase = (speed: number) => Math.floor(frame * (0.12 + speed * 0.3)) % 4;
  const burst = (x: number, y: number, colors: string[], n: number, spread: number, grav: number, lo: number, hi: number, arr: Bit[]) => {
    for (let i = 0; i < n; i++) arr.push({ x, y, vx: r.range(-spread, spread), vy: r.range(-spread * 0.6, 0), life: r.int(lo, hi), c: r.pick(colors), g: grav });
  };
  const footPlant = (x: number, y: number) => burst(x, y, [shade(TRACK_COLOR, -0.12), TRACK_COLOR, "#e8c98a"], 3, 0.7, 0.1, 8, 15, fx);
  const spawnConfetti = () => {
    for (let i = 0; i < 44; i++) confetti.push({ x: r.range(0, W), y: -10, vx: r.range(-0.6, 0.6), vy: r.range(0.4, 1.3), life: r.int(100, 170), c: r.pick([PAL.yellow, PAL.pink, PAL.cyan, PAL.lime, PAL.orange, PAL.white]), g: 0.02 });
  };
  const stepBits = (arr: Bit[]) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.x += b.vx;
      b.y += b.vy;
      b.vy += b.g;
      if (--b.life <= 0 || b.y > H + 20) arr.splice(i, 1);
    }
  };

  const startCard = (idx: number) => {
    eventIdx = idx;
    phase = "card";
    phaseT = 110;
  };
  const startSprintCountdown = () => {
    const ev = EVENTS[eventIdx];
    player = { x: 0, pace: { speed: 0, last: null } };
    rival = { x: 0, pace: { speed: 0, last: null } };
    rivalBaseSpeed = ev.meters === 100 ? 1.5 : 1.3;
    hurdles = [];
    if (ev.hurdles) {
      for (let i = 0; i < ev.hurdles; i++) {
        const m = 14 + (i * (ev.meters - 26)) / (ev.hurdles - 1);
        hurdles.push({ x: m * PXM, cleared: null });
      }
    }
    jumpT = 0;
    stumbleT = 0;
    falseStarts = 0;
    runFrames = 0;
    phase = "marks";
    phaseT = 60;
  };
  const startField = () => {
    field = { pace: { speed: 0, last: null }, x: 0, runT: 0, angle: 45, angleDir: 1, attempt: 1, best: -1, lastFoul: false, flyX: 0, flyY: 0, flyVX: 0, flyVY: 0, flyGrav: 0.2, flyFromX: 0 };
    phase = "runup";
  };

  const failEvent = (io: IO, info: string) => {
    message = info;
    messageT = 99999;
    phase = "fail";
    io.sfx.play("die");
    io.gameOver();
  };
  const advanceAfterResult = (io: IO) => {
    if (eventIdx >= EVENTS.length - 1) {
      phase = "podium";
      spawnConfetti();
      io.sfx.play("win");
      io.sfx.play("cheer");
      io.sfx.slide?.(500, 1000, 0.5, "triangle", 0.1);
      io.win();
    } else startCard(eventIdx + 1);
  };
  const finishRace = (io: IO) => {
    const ev = EVENTS[eventIdx];
    const mark = runFrames / 60;
    const medal = medalFor(ev, mark);
    results.push({ mark, medal });
    io.score(medalPoints(medal) + Math.max(0, Math.round((ev.bronze - mark) * 15)));
    io.sfx.play(medal === "gold" ? "win" : "coin");
    if (medal) io.sfx.play("cheer");
    if (medal === "gold") spawnConfetti();
    message = `${mark.toFixed(2)}S — ${medal ? medal.toUpperCase() : "QUALIFIED"}`;
    messageT = 99999;
    phase = "result";
    phaseT = 170;
  };
  const finishField = (io: IO) => {
    const ev = EVENTS[eventIdx];
    const mark = field.best;
    const medal = medalFor(ev, mark);
    if (!medal) {
      failEvent(io, `NEEDED ${ev.bronze}${ev.unit.toUpperCase()} OR MORE — YOU GOT ${Math.max(0, mark).toFixed(2)}${ev.unit.toUpperCase()}`);
      return;
    }
    results.push({ mark, medal });
    io.score(medalPoints(medal) + Math.round(mark * 4));
    io.sfx.play(medal === "gold" ? "win" : "coin");
    io.sfx.play("cheer");
    if (medal === "gold") spawnConfetti();
    message = `${mark.toFixed(2)}${ev.unit.toUpperCase()} — ${medal.toUpperCase()}`;
    messageT = 99999;
    phase = "result";
    phaseT = 170;
  };
  const resolveAttempt = (io: IO, mark: number) => {
    const ev = EVENTS[eventIdx];
    if (mark > field.best) field.best = mark;
    io.sfx.play(field.lastFoul ? "hit" : "blip");
    if (field.attempt < 2) {
      message = field.lastFoul ? "FOUL!" : `${mark.toFixed(2)}${ev.unit.toUpperCase()} — ONE MORE TRY`;
      messageT = 90;
      field.attempt++;
      field.pace = { speed: 0, last: null };
      field.x = 0;
      field.runT = 0;
      field.angle = 45;
      field.angleDir = 1;
      field.lastFoul = false;
      phase = "runup";
    } else finishField(io);
  };
  const takeOff = (io: IO) => {
    const ev = EVENTS[eventIdx];
    if (field.lastFoul) {
      io.sfx.play("hit");
      resolveAttempt(io, 0);
      return;
    }
    const v = Math.max(0.5, field.pace.speed);
    const rad = (field.angle * Math.PI) / 180;
    const boardPx = ev.meters * PXM;
    const jump = ev.kind === "jump";
    field.flyGrav = jump ? 0.25 : 0.09;
    field.flyVX = v * Math.cos(rad) * (jump ? 1.6 : 2.2);
    field.flyVY = -v * Math.sin(rad) * (jump ? 2.2 : 1.8);
    field.flyX = jump ? field.x : boardPx;
    field.flyY = jump ? GROUND_Y : GROUND_Y - 14;
    field.flyFromX = boardPx;
    io.sfx.play(jump ? "jump" : "shoot");
    if (!jump) io.sfx.noise?.(0.3, 0.1, 1800, 500);
    phase = "flight";
  };

  const stepRival = () => {
    const target = rivalBaseSpeed + Math.sin(frame * 0.05) * 0.15;
    rival.pace.speed += (target - rival.pace.speed) * 0.04;
    rival.x += rival.pace.speed;
  };
  const handleFalseStart = (io: IO) => {
    if (falseStarts >= 1) return; // one grace reset, then it stops interrupting the start
    falseStarts++;
    message = "FALSE START! BACK TO THE LINE";
    messageT = 55;
    io.sfx.play("hit");
    phase = "marks";
    phaseT = 55;
  };
  const tryJump = () => {
    jumpT = JUMP_WINDOW;
  };

  startCard(0);

  return {
    update(io: IO) {
      frame++;
      if (messageT > 0) messageT--;
      if (shakeT > 0) shakeT--;
      stepBits(confetti);
      stepBits(fx);
      const inp = io.input;
      const ev = EVENTS[eventIdx];

      if (phase === "card") {
        phaseT--;
        if (phaseT <= 0) {
          if (ev.kind === "sprint") startSprintCountdown();
          else startField();
        }
        return;
      }
      if (phase === "marks" || phase === "set" || phase === "wait") {
        if (inp.pressed.a || inp.pressed.b) handleFalseStart(io);
        phaseT--;
        if (phaseT <= 0) {
          if (phase === "marks") {
            phase = "set";
            phaseT = 55;
            io.sfx.tone(420, 0.09, "square", 0.08);
          } else if (phase === "set") {
            phase = "wait";
            phaseT = r.int(25, 65);
            io.sfx.tone(560, 0.09, "square", 0.08);
          } else {
            phase = "go";
            phaseT = 22;
            runFrames = 0;
            io.sfx.play("blip");
            io.sfx.noise?.(0.14, 0.14, 1000, 240);
          }
        }
        return;
      }
      if (phase === "go" || phase === "run") {
        runFrames++;
        pump(inp, player.pace);
        if (stumbleT > 0) {
          stumbleT--;
          player.pace.speed *= 0.9;
        }
        if (jumpT > 0) jumpT--;
        if (phase === "run" && (inp.pressed.up || inp.pressed.b)) tryJump();
        player.x += player.pace.speed;
        stepRival();
        // a dust puff + footstep sound each time a new foot plants down, not every frame
        if (phase === "run" && stumbleT === 0 && player.pace.speed > 0.35) {
          const g2 = gaitPhase(player.pace.speed);
          if (g2 !== playerGait) {
            playerGait = g2;
            footPlant(player.x, GROUND_Y);
            if (g2 % 2 === 0) io.sfx.play("step");
          }
        }
        if (phase === "go") {
          phaseT--;
          if (phaseT <= 0) phase = "run";
          return;
        }
        if (ev.hurdles) {
          for (const hd of hurdles) {
            if (hd.cleared === null && player.x >= hd.x) {
              hd.cleared = jumpT > 0;
              if (hd.cleared) {
                io.sfx.play("blip");
                io.sfx.play("whoosh");
                io.score(20);
              } else {
                player.pace.speed *= 0.35;
                stumbleT = 22;
                shakeT = 10;
                io.sfx.play("hit");
                burst(player.x, GROUND_Y, [TRACK_COLOR, PAL.tan], 8, 1.4, 0.15, 10, 20, fx);
              }
            }
          }
        }
        const finishPx = ev.meters * PXM;
        if (player.x >= finishPx) {
          finishRace(io);
          return;
        }
        const elapsed = runFrames / 60;
        if (elapsed > ev.bronze) {
          failEvent(io, `NEEDED UNDER ${ev.bronze}S TO QUALIFY — TIME'S UP!`);
          return;
        }
        return;
      }
      if (phase === "runup") {
        pump(inp, field.pace);
        field.x += field.pace.speed;
        field.runT++;
        if (field.pace.speed > 0.35) {
          const g2 = gaitPhase(field.pace.speed);
          if (g2 !== fieldGait) {
            fieldGait = g2;
            footPlant(field.x, GROUND_Y);
            if (g2 % 2 === 0) io.sfx.play("step");
          }
        }
        const boardPx = ev.meters * PXM;
        if (inp.held.up || inp.held.b) {
          phase = "hold";
          return;
        }
        if (field.x > boardPx + OVERRUN_PX || field.runT > RUNUP_TIMEOUT) {
          field.lastFoul = true;
          resolveAttempt(io, 0);
        }
        return;
      }
      if (phase === "hold") {
        const boardPx = ev.meters * PXM;
        field.angle += field.angleDir * 1.6;
        if (field.angle >= 75) {
          field.angle = 75;
          field.angleDir = -1;
        } else if (field.angle <= 15) {
          field.angle = 15;
          field.angleDir = 1;
        }
        field.x += field.pace.speed * 0.5;
        field.pace.speed *= 0.99;
        const stillHeld = inp.held.up || inp.held.b;
        if (!stillHeld) {
          field.lastFoul = field.x > boardPx + FOUL_TOL;
          takeOff(io);
        } else if (field.x > boardPx + OVERRUN_PX) {
          field.lastFoul = true;
          takeOff(io);
        }
        return;
      }
      if (phase === "flight") {
        field.flyVY += field.flyGrav;
        field.flyX += field.flyVX;
        field.flyY += field.flyVY;
        const floorY = ev.kind === "jump" ? GROUND_Y : GROUND_Y - 2;
        if (field.flyY >= floorY) {
          field.flyY = floorY;
          const mark = Math.max(0, (field.flyX - field.flyFromX) / PXM);
          if (ev.kind === "jump") {
            burst(field.flyX, GROUND_Y, ["#e8c98a", "#caa968"], 12, 1.8, 0.2, 14, 26, fx);
            io.sfx.play("thud");
            shakeT = 6;
          } else {
            burst(field.flyX, field.flyY, ["#5a9a4e", PAL.dark], 6, 1, 0.12, 10, 18, fx);
            io.sfx.play("thud");
          }
          resolveAttempt(io, mark);
        }
        return;
      }
      if (phase === "result") {
        phaseT--;
        if (phaseT <= 0) advanceAfterResult(io);
        return;
      }
      // "fail" and "podium" are frozen end states — update() just keeps particles alive above
    },

    draw(g: Gfx) {
      const ev = EVENTS[eventIdx];
      g.camera(0, 0);
      g.clear(PAL.sky);
      drawCrowd(g, frame);
      if (ev.kind === "sprint") drawSprint(g, ev);
      else drawField(g, ev);
      drawHud(g, ev);
      for (const b of confetti) g.rect(b.x, b.y, 2, 2, b.c);
      drawOverlay(g, ev);
    },
  };

  // ── drawing helpers (closures over the state above) ──
  function drawCrowd(g: Gfx, f: number) {
    // the stadium wall: a two-tone navy gradient (not a flat rect) behind rows of little lit
    // dots — small sources with their own highlight, not a big flat glow
    g.rect(0, 0, W, CROWD_H - 8, "#2a5fa0");
    g.rect(0, CROWD_H - 8, W, 8, "#2f6fb0");
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 18; i++) {
        const x = i * 15 + 4;
        const wave = Math.sin(f * 0.1 - i * 0.35 + row);
        const y = 5 + row * 10 + wave * 2;
        const light = A.lights[wave > 0.4 ? 0 : row % 2 ? 1 : 2];
        g.sprite(light, x, y);
      }
    }
    // a wood-grained fence tile, then the sponsor boards between the stands and the track
    for (let x = 0; x < W; x += 16) g.sprite(A.board, x, CROWD_H - 6);
    g.rect(0, CROWD_H, W, TRACK_TOP - CROWD_H, "#1f8a5c");
    for (let i = 0; i < 10; i++) {
      const x = (((i * 32 - f * 0.4) % 320) + 320) % 320 - 32;
      g.sprite(i % 2 ? A.adPanels.yellow : A.adPanels.pink, x, CROWD_H + 2);
    }
  }

  function drawRunnerPose(g: Gfx, x: number, baselineY: number, speed: number, stumbling: boolean, jumping: number, frames: Sprite[], scale: number, flashing = false) {
    let spr: Sprite;
    const idx = Math.floor(frame * (0.12 + speed * 0.3)) % frames.length;
    if (stumbling) spr = flashing && frame % 4 < 2 ? A.stumbleFlash : A.playerStumble;
    else if (jumping > 0) spr = A.playerJump;
    else spr = frames[idx];
    g.sprite(A.shadow, x - 1, baselineY - 3, { scale: scale * 0.7 });
    g.sprite(spr, x, baselineY - SPRITE_H * scale, { scale });
  }

  /** world-space lane number near the start line (scrolls away like the real painted numbers) */
  function laneNumber(g: Gfx, camX: number, worldX: number, y: number, label: string) {
    const sx = worldX - camX;
    if (sx > -14 && sx < W + 14) g.text(label, sx, y, "rgba(255,255,255,0.55)", { align: "center" });
  }

  /** 2-3 short streak lines trailing a fast runner — juice without a big flat glow */
  function speedStreaks(g: Gfx, x: number, baselineY: number, speed: number, scale: number) {
    if (speed < SPEED_MAX * 0.55) return;
    const n = speed > SPEED_MAX * 0.85 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const sy = baselineY - SPRITE_H * scale * (0.3 + i * 0.22);
      const len = 5 + speed * 2;
      g.line(x - 3, sy, x - 3 - len, sy, "rgba(255,255,255,0.35)");
    }
  }

  function drawSprint(g: Gfx, ev: EventDef) {
    const trackLen = ev.meters * PXM;
    const camX = clamp(player.x - CAM_OFFSET, 0, Math.max(0, trackLen + 50 - W));
    const shx = shakeT > 0 ? (frame % 2 ? 1 : -1) * Math.ceil(shakeT / 4) : 0;
    g.camera(camX + shx, 0);
    // the track fills everything below the fence — no empty gap, a tiled dirt texture not a flat rect
    tileFill(g, A.track, camX - 60, camX + W + 60, TRACK_TOP);
    for (const ly of LANE_LINES) g.rect(-60, ly, trackLen + 200, 1, "rgba(255,255,255,0.55)");
    for (let x = 0; x < trackLen; x += 22) g.rect(x, GROUND_Y - 1, 9, 2, "rgba(255,255,255,0.65)");
    // 10m distance markers scroll past so speed reads clearly (text ignores the camera, offset by hand)
    for (let m = 10; m * PXM < trackLen; m += 10) {
      const wx = m * PXM;
      g.rect(wx, TRACK_TOP + 2, 1, H - TRACK_TOP - 4, "rgba(255,255,255,0.28)");
      const sx = wx - camX;
      if (sx > -10 && sx < W + 10) g.text(`${m}`, sx, TRACK_TOP + 4, "rgba(255,255,255,0.8)", { align: "center" });
    }
    LANE_CENTERS.forEach((cy, i) => laneNumber(g, camX, 10, cy - 24, `${i + 1}`));
    // finish line: a tall checkered post plus a sign
    for (let i = 0; i < 10; i++) g.rect(trackLen + 2, TRACK_TOP + i * ((H - TRACK_TOP) / 10), 5, (H - TRACK_TOP) / 10 - 1, i % 2 ? PAL.black : PAL.white);
    laneNumber(g, camX, trackLen - 10, TRACK_TOP - 1, "FINISH");
    if (ev.hurdles) {
      for (const hd of hurdles) {
        if (hd.x < camX - 30 || hd.x > camX + W + 30) continue;
        g.sprite(A.hurdle, hd.x - 10, GROUND_Y - 30, { scale: 1.5 });
      }
    }
    speedStreaks(g, rival.x, RIVAL_Y, rival.pace.speed, RIVAL_SCALE);
    speedStreaks(g, player.x, GROUND_Y, player.pace.speed, PLAYER_SCALE);
    drawRunnerPose(g, rival.x, RIVAL_Y, rival.pace.speed, false, 0, A.rivalFrames, RIVAL_SCALE);
    drawRunnerPose(g, player.x, GROUND_Y, player.pace.speed, stumbleT > 0, jumpT, A.playerFrames, PLAYER_SCALE, true);
    for (const b of fx) g.rect(b.x, b.y, 2, 2, b.c);
    g.camera(0, 0);
    // the rival can fall off either edge of the screen — point to them so they never just vanish
    const rivalSx = rival.x - camX;
    const gapM = Math.round(Math.abs(rival.x - player.x) / PXM);
    if (rivalSx < 6) g.text(`< RIVAL ${gapM}M`, 4, RIVAL_Y - 8, "rgba(255,255,255,0.85)");
    else if (rivalSx > W - 6) g.text(`RIVAL ${gapM}M >`, W - 4, RIVAL_Y - 8, "rgba(255,255,255,0.85)", { align: "right" });
  }

  function drawField(g: Gfx, ev: EventDef) {
    const boardPx = ev.meters * PXM;
    const totalLen = boardPx + 420;
    const activeX = phase === "flight" ? field.flyX : field.x;
    const camX = clamp(activeX - CAM_OFFSET, 0, Math.max(0, totalLen - W));
    const shx = shakeT > 0 ? (frame % 2 ? 1 : -1) * Math.ceil(shakeT / 4) : 0;
    g.camera(camX + shx, 0);
    tileFill(g, A.track, camX - 60, boardPx + 90, TRACK_TOP);
    for (const ly of LANE_LINES) g.rect(-60, ly, boardPx + 90, 1, "rgba(255,255,255,0.4)");
    for (let x = 0; x < boardPx; x += 22) g.rect(x, GROUND_Y - 1, 9, 2, "rgba(255,255,255,0.65)");
    for (let m = 10; m * PXM < boardPx; m += 10) {
      const wx = m * PXM;
      const sx = wx - camX;
      if (sx > -10 && sx < W + 10) g.text(`${m}`, sx, TRACK_TOP + 4, "rgba(255,255,255,0.8)", { align: "center" });
    }
    g.rect(boardPx, TRACK_TOP, 3, H - TRACK_TOP, PAL.white); // board / foul line
    if (ev.kind === "jump") {
      tileFill(g, A.sand, boardPx + 3, boardPx + 260, TRACK_TOP);
    } else {
      tileFill(g, A.grass, boardPx + 3, Math.min(camX + W + 60, totalLen), TRACK_TOP);
      for (let m = 10; m <= 50; m += 10) g.rect(boardPx + m * PXM, TRACK_TOP + 2, 1, H - TRACK_TOP - 4, "rgba(255,255,255,0.3)");
    }
    const athleteX = ev.kind === "jump" && phase === "flight" ? field.flyX : field.x;
    const athleteBaseline = ev.kind === "jump" && phase === "flight" ? field.flyY : GROUND_Y;
    const jumping = phase === "hold" || (phase === "flight" && ev.kind === "jump") ? 1 : 0;
    speedStreaks(g, field.x, GROUND_Y, field.pace.speed, PLAYER_SCALE);
    drawRunnerPose(g, athleteX, athleteBaseline, field.pace.speed, false, jumping, A.playerFrames, PLAYER_SCALE);
    if (ev.kind === "throw") {
      if (phase === "flight") {
        const ang = Math.atan2(field.flyVY, field.flyVX);
        const len = 16;
        const tx = field.flyX + Math.cos(ang) * len;
        const ty = field.flyY + Math.sin(ang) * len;
        g.line(field.flyX - Math.cos(ang) * len * 0.8, field.flyY - Math.sin(ang) * len * 0.8, tx, ty, "#9a6a28");
        g.line(field.flyX + Math.cos(ang) * len * 0.3, field.flyY + Math.sin(ang) * len * 0.3, tx, ty, PAL.grey);
        g.circle(tx, ty, 1, "#e3e8ff");
        g.line(field.flyX - Math.cos(ang) * (len + 6), field.flyY - Math.sin(ang) * (len + 6), field.flyX - Math.cos(ang) * len, field.flyY - Math.sin(ang) * len, "rgba(255,255,255,0.3)");
      } else {
        const handY = GROUND_Y - SPRITE_H * PLAYER_SCALE + 10;
        g.line(field.x + 10, handY, field.x + 32, handY - 9, "#9a6a28");
        g.circle(field.x + 32, handY - 9, 1, "#e3e8ff");
      }
    }
    if (field.best > 0) {
      const lx = boardPx + field.best * PXM;
      if (lx < camX + W + 20) g.rect(lx, GROUND_Y - 10, 2, 14, PAL.red);
    }
    for (const b of fx) g.rect(b.x, b.y, 2, 2, b.c);
    g.camera(0, 0);
  }

  function drawHud(g: Gfx, ev: EventDef) {
    g.rect(0, 0, W, 13, "rgba(13,11,26,0.65)");
    g.rect(0, 12, W, 1, "rgba(255,225,77,0.4)");
    g.text(`EVENT ${eventIdx + 1}/${EVENTS.length}`, 4, 3, PAL.white);
    g.text(ev.name, W / 2, 3, PAL.yellow, { align: "center" });
    let mx = W - 4;
    for (let i = results.length - 1; i >= 0; i--) {
      g.text("★", mx, 3, medalColor(results[i].medal), { align: "right" });
      mx -= 7;
    }
    const racing = phase === "go" || phase === "run" || phase === "runup" || phase === "hold";
    if (racing) {
      // a solid dark framed HUD panel, top-left under the event title — never bare over the art
      const pace = ev.kind === "sprint" ? player.pace.speed : field.pace.speed;
      g.rect(2, 14, 68, 20, "rgba(13,11,26,0.75)");
      g.box(2, 14, 68, 20, "rgba(255,255,255,0.25)");
      g.text("SPEED", 5, 16, PAL.white);
      g.rect(5, 25, 60, 6, PAL.dark);
      g.rect(5, 25, clamp(pace / SPEED_MAX, 0, 1) * 60, 6, pace > SPEED_MAX * 0.7 ? PAL.lime : PAL.yellow);
    }
    if (ev.kind === "sprint" && (phase === "go" || phase === "run")) g.text(`${(runFrames / 60).toFixed(2)}S`, W - 4, 3, PAL.cyan, { align: "right" });
    if (phase === "hold") {
      g.rect(126, 14, 128, 20, "rgba(13,11,26,0.75)");
      g.box(126, 14, 128, 20, "rgba(255,255,255,0.25)");
      g.text("ANGLE", 130, 16, PAL.white);
      g.rect(130, 25, 80, 6, PAL.dark);
      const pct = clamp((field.angle - 15) / 60, 0, 1);
      g.rect(130 + pct * 76, 24, 3, 8, PAL.red);
    }
    if (phase === "runup" && (ev.kind === "jump" || ev.kind === "throw")) g.text(`ATTEMPT ${field.attempt}/2`, 80, 18, PAL.white);
    if (phase === "marks") g.text("ON YOUR MARKS...", W / 2, H / 2 - 16, PAL.white, { align: "center", size: 2 });
    else if (phase === "set" || phase === "wait") g.text("SET...", W / 2, H / 2 - 16, PAL.yellow, { align: "center", size: 2 });
    else if (phase === "go") g.text("GO!", W / 2, H / 2 - 20, PAL.lime, { align: "center", size: 4 });
    // teach the controls during the very first race
    if (eventIdx === 0 && ev.kind === "sprint" && phase === "run" && player.x < (ev.meters * PXM) / 2 && Math.floor(frame / 15) % 2 === 0) {
      g.text("TAP A B A B!", W / 2, H - 16, PAL.white, { align: "center", size: 2 });
    }
    if (messageT > 0 && phase !== "result" && phase !== "fail") g.text(message, W / 2, 30, PAL.yellow, { align: "center", size: phase === "runup" || phase === "hold" ? 1 : 2 });
  }

  function drawOverlay(g: Gfx, ev: EventDef) {
    if (phase === "card") {
      g.rect(0, 0, W, H, "rgba(13,11,26,0.55)");
      g.text(`EVENT ${eventIdx + 1}`, W / 2, H / 2 - 34, PAL.white, { align: "center", size: 2 });
      g.text(ev.name, W / 2, H / 2 - 8, PAL.yellow, { align: "center", size: 3 });
      g.text(ev.unit === "s" ? `QUALIFY: UNDER ${ev.bronze}S` : `QUALIFY: ${ev.bronze}${ev.unit.toUpperCase()} OR MORE`, W / 2, H / 2 + 26, PAL.cyan, { align: "center" });
    } else if (phase === "result") {
      const res = results[results.length - 1];
      g.rect(28, 66, W - 56, 86, "rgba(13,11,26,0.85)");
      g.text(res.medal ? `${res.medal.toUpperCase()} MEDAL!` : "QUALIFIED!", W / 2, 82, medalColor(res.medal), { align: "center", size: 2 });
      g.text(`${res.mark.toFixed(2)}${ev.unit.toUpperCase()}`, W / 2, 108, PAL.white, { align: "center", size: 2 });
      g.text(eventIdx < EVENTS.length - 1 ? "NEXT EVENT..." : "FINAL RESULTS...", W / 2, 132, PAL.grey, { align: "center" });
    } else if (phase === "fail") {
      g.rect(16, 56, W - 32, 110, "rgba(60,10,10,0.85)");
      g.text("NOT QUALIFIED", W / 2, 74, PAL.red, { align: "center", size: 3 });
      g.text(message, W / 2, 104, PAL.white, { align: "center" });
      const golds = results.filter((x) => x.medal === "gold").length;
      const silvers = results.filter((x) => x.medal === "silver").length;
      const bronzes = results.filter((x) => x.medal === "bronze").length;
      g.text(`GOLD x${golds}  SILVER x${silvers}  BRONZE x${bronzes}`, W / 2, 140, PAL.grey, { align: "center" });
    } else if (phase === "podium") {
      g.rect(60, 174, 34, 30, PAL.dark);
      g.box(60, 174, 34, 30, "rgba(255,255,255,0.2)");
      g.rect(96, 150, 36, 54, "#c89a3a");
      g.box(96, 150, 36, 54, "rgba(255,255,255,0.3)");
      g.rect(134, 166, 34, 38, PAL.dark);
      g.box(134, 166, 34, 38, "rgba(255,255,255,0.2)");
      g.sprite(A.shadow, 106, 146, { scale: 1.4 });
      g.sprite(A.playerFrames[0], 100, 118, { scale: 2 });
      g.text("CHAMPION!", W / 2, 26, PAL.yellow, { align: "center", size: 4 });
      const golds = results.filter((x) => x.medal === "gold").length;
      const silvers = results.filter((x) => x.medal === "silver").length;
      const bronzes = results.filter((x) => x.medal === "bronze").length;
      g.text(`GOLD x${golds}  SILVER x${silvers}  BRONZE x${bronzes}`, W / 2, 56, PAL.white, { align: "center" });
    }
  }
}

export const olympicDash: RetroGameDef = {
  id: "olympic-dash",
  title: "Summer Games",
  blurb: "Sprint, hurdle, jump and throw your way across four classic track-and-field events!",
  genre: "Sports",
  emoji: "🏅",
  color: "#e8542e",
  controls: "A/B back and forth (or mash A) to run · ▲ to clear a hurdle · hold A/B then let go to aim your jump or throw",
  pad: { dpad: "4", a: "Run", b: "Run / Jump" },
  create,
};
