// SUMMER GAMES — an original side-scrolling track-and-field meet in the spirit of the 8-bit
// multi-event classics (no trademarked names or logos here, just our own candy-pixel athletes).
// Tap A and B back and forth (or mash A) to build up your pace, press ▲ to clear a hurdle, and
// hold A/B then let go to aim a long jump or javelin throw. Four events, run in order, each with
// a qualifying mark to beat — miss it and the meet is over; beat it and you climb the podium.
import { H, PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef, type Sprite } from "../engine";

// ── layout ──
// crowd (0-44) + fence/ad boards (44-58) + track/runway filling the rest of the screen — no gap.
const PXM = 9; // pixels per metre of track/runway
const CROWD_H = 44; // stand height
const TRACK_TOP = 58; // where the track/runway visuals start (right under the fence)
const GROUND_Y = 204; // the player's (near) lane baseline — feet stand here
const RIVAL_Y = 162; // the rival's lane baseline, a lane further back (smaller, higher on screen)
const LANE_LINES = [100, 141, 183]; // dividers between the 4 lanes, far → near
const SPRITE_H = 13; // unscaled athlete sprite height (rows)
const PLAYER_SCALE = 2.1; // ~27px tall — big and grounded
const RIVAL_SCALE = 1.6; // smaller: a lane further back
const CAM_OFFSET = 90; // the runner sits about a third in from the left, not pinned to the edge
const SPEED_MAX = 3.2; // fastest pace, px/frame
const BOOST_ALT = 0.13; // speed added for an A→B or B→A tap
const BOOST_SAME = 0.08; // speed added for mashing the same button twice in a row
const DECAY = 0.985; // pace fades a little every frame
const OVERRUN_PX = 34; // how far past the board/line you can run before it's an automatic foul
const FOUL_TOL = 6; // a few forgiving pixels past the board before it counts as a foul
const RUNUP_TIMEOUT = 600; // 10s — auto-attempt if nobody presses the jump button
const JUMP_WINDOW = 26; // frames a hurdle jump stays "active" after pressing ▲

// ── pixel art ──
const AP = { j: PAL.red, h: "#ffd9a8", k: PAL.black, w: PAL.white, l: PAL.navy, s: PAL.blue, o: PAL.black };
const RP = { j: PAL.blue, h: "#ffd9a8", k: PAL.black, w: PAL.yellow, l: PAL.purple, s: PAL.pink, o: PAL.black };
const HEAD_TORSO = ["....jjjj....", "...jhhhhj...", "...hhkhkh...", "...hhhhhh...", "....wwww....", "...wwwwww...", "...wwwwww...", "...llllll..."];
const LEG_A = ["..l......s..", "..l......s..", ".l........s.", ".l........s.", "oo........oo"];
const LEG_B = ["....llss....", "....llss....", "....ll.ss...", "....l....s..", "...oo..oo..."];
const LEG_C = ["..s......l..", "..s......l..", ".s........l.", ".s........l.", "oo........oo"];
const LEG_JUMP = ["...ll..ss...", "..l......s..", ".l........s.", "............", "............"];
const LEG_STUMBLE = [".l........s.", "l..........s", "............", "............", "............"];
function makeFrames(pal: Record<string, string>): Sprite[] {
  return [LEG_A, LEG_B, LEG_C, LEG_B].map((legs) => sprite([...HEAD_TORSO, ...legs], pal));
}
const PLAYER_FRAMES = makeFrames(AP);
const RIVAL_FRAMES = makeFrames(RP);
const PLAYER_JUMP = sprite([...HEAD_TORSO, ...LEG_JUMP], AP);
const PLAYER_STUMBLE = sprite([...HEAD_TORSO, ...LEG_STUMBLE], AP);
const HURDLE = sprite([".wwwwwwww.", ".wyyyyyyw.", "....ww....", "....ww....", "....ww....", "....ww....", "...wwww..."], { w: PAL.white, y: PAL.orange });

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

  const burst = (x: number, y: number, colors: string[], n: number, spread: number, grav: number, lo: number, hi: number, arr: Bit[]) => {
    for (let i = 0; i < n; i++) arr.push({ x, y, vx: r.range(-spread, spread), vy: r.range(-spread * 0.6, 0), life: r.int(lo, hi), c: r.pick(colors), g: grav });
  };
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
          } else if (phase === "set") {
            phase = "wait";
            phaseT = r.int(25, 65);
          } else {
            phase = "go";
            phaseT = 22;
            runFrames = 0;
            io.sfx.play("blip");
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
                io.score(20);
              } else {
                player.pace.speed *= 0.35;
                stumbleT = 22;
                io.sfx.play("hit");
                burst(player.x, GROUND_Y, ["#c98a4a", PAL.tan], 8, 1.4, 0.15, 10, 20, fx);
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
          if (ev.kind === "jump") burst(field.flyX, GROUND_Y, ["#e8c98a", "#caa968"], 12, 1.8, 0.2, 14, 26, fx);
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
    g.rect(0, 0, W, CROWD_H, "#2f6fb0");
    g.rect(0, CROWD_H - 6, W, 6, "#8a5a2c");
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 18; i++) {
        const x = i * 15 + 4;
        const wave = Math.sin(f * 0.1 - i * 0.35 + row);
        const y = 5 + row * 10 + wave * 2;
        const col = wave > 0.4 ? PAL.yellow : row % 2 ? PAL.pink : PAL.cyan;
        g.rect(x, y, 6, 6, col);
      }
    }
    // a strip of sponsor boards between the stands and the track, drifting slightly for depth
    g.rect(0, CROWD_H, W, TRACK_TOP - CROWD_H, "#1f8a5c");
    for (let i = 0; i < 10; i++) {
      const x = (((i * 32 - f * 0.4) % 320) + 320) % 320 - 32;
      g.rect(x, CROWD_H + 2, 26, TRACK_TOP - CROWD_H - 4, i % 2 ? "#ffd34d" : "#ff6fcf");
    }
  }

  function drawRunnerPose(g: Gfx, x: number, baselineY: number, speed: number, stumbling: boolean, jumping: number, frames: Sprite[], scale: number) {
    let spr: Sprite;
    if (stumbling) spr = PLAYER_STUMBLE;
    else if (jumping > 0) spr = PLAYER_JUMP;
    else spr = frames[Math.floor(frame * (0.12 + speed * 0.3)) % frames.length];
    g.sprite(spr, x, baselineY - SPRITE_H * scale, { scale });
  }

  /** world-space lane number near the start line (scrolls away like the real painted numbers) */
  function laneNumber(g: Gfx, camX: number, worldX: number, y: number, label: string) {
    const sx = worldX - camX;
    if (sx > -14 && sx < W + 14) g.text(label, sx, y, "rgba(255,255,255,0.55)", { align: "center" });
  }

  function drawSprint(g: Gfx, ev: EventDef) {
    const trackLen = ev.meters * PXM;
    const camX = clamp(player.x - CAM_OFFSET, 0, Math.max(0, trackLen + 50 - W));
    g.camera(camX, 0);
    // the track fills everything below the fence — no empty gap
    g.rect(-60, TRACK_TOP, trackLen + 200, H - TRACK_TOP, "#c98a4a");
    for (const ly of LANE_LINES) g.rect(-60, ly, trackLen + 200, 1, "rgba(255,255,255,0.55)");
    for (let x = 0; x < trackLen; x += 22) g.rect(x, GROUND_Y - 1, 9, 2, "rgba(255,255,255,0.65)");
    // 10m distance markers scroll past so speed reads clearly (text ignores the camera, offset by hand)
    for (let m = 10; m * PXM < trackLen; m += 10) {
      const wx = m * PXM;
      g.rect(wx, TRACK_TOP + 2, 1, H - TRACK_TOP - 4, "rgba(255,255,255,0.28)");
      const sx = wx - camX;
      if (sx > -10 && sx < W + 10) g.text(`${m}`, sx, TRACK_TOP + 4, "rgba(255,255,255,0.8)", { align: "center" });
    }
    const laneCenters = [TRACK_TOP + 21, 120, RIVAL_Y, GROUND_Y];
    laneCenters.forEach((cy, i) => laneNumber(g, camX, 10, cy - 24, `${i + 1}`));
    // finish line: a tall checkered post plus a sign
    for (let i = 0; i < 10; i++) g.rect(trackLen + 2, TRACK_TOP + i * ((H - TRACK_TOP) / 10), 5, (H - TRACK_TOP) / 10 - 1, i % 2 ? PAL.black : PAL.white);
    laneNumber(g, camX, trackLen - 10, TRACK_TOP - 1, "FINISH");
    if (ev.hurdles) {
      for (const hd of hurdles) {
        if (hd.x < camX - 30 || hd.x > camX + W + 30) continue;
        g.sprite(HURDLE, hd.x - 10, GROUND_Y - 14, { scale: 2 });
      }
    }
    drawRunnerPose(g, rival.x, RIVAL_Y, rival.pace.speed, false, 0, RIVAL_FRAMES, RIVAL_SCALE);
    drawRunnerPose(g, player.x, GROUND_Y, player.pace.speed, stumbleT > 0, jumpT, PLAYER_FRAMES, PLAYER_SCALE);
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
    g.camera(camX, 0);
    g.rect(-60, TRACK_TOP, boardPx + 90, H - TRACK_TOP, "#c98a4a");
    for (const ly of LANE_LINES) g.rect(-60, ly, boardPx + 90, 1, "rgba(255,255,255,0.4)");
    for (let x = 0; x < boardPx; x += 22) g.rect(x, GROUND_Y - 1, 9, 2, "rgba(255,255,255,0.65)");
    for (let m = 10; m * PXM < boardPx; m += 10) {
      const wx = m * PXM;
      const sx = wx - camX;
      if (sx > -10 && sx < W + 10) g.text(`${m}`, sx, TRACK_TOP + 4, "rgba(255,255,255,0.8)", { align: "center" });
    }
    g.rect(boardPx, TRACK_TOP, 3, H - TRACK_TOP, PAL.white); // board / foul line
    if (ev.kind === "jump") {
      g.rect(boardPx + 3, TRACK_TOP, 260, H - TRACK_TOP, "#e8c98a");
      for (let i = 0; i < 16; i++) g.rect(boardPx + 10 + i * 16, TRACK_TOP + 20 + ((i * 37) % 120), 3, 3, "#caa968");
    } else {
      g.rect(boardPx + 3, TRACK_TOP, totalLen - boardPx, H - TRACK_TOP, "#5a9a4e");
      for (let m = 10; m <= 50; m += 10) g.rect(boardPx + m * PXM, TRACK_TOP + 2, 1, H - TRACK_TOP - 4, "rgba(255,255,255,0.3)");
    }
    const athleteX = ev.kind === "jump" && phase === "flight" ? field.flyX : field.x;
    const athleteBaseline = ev.kind === "jump" && phase === "flight" ? field.flyY : GROUND_Y;
    const jumping = phase === "hold" || (phase === "flight" && ev.kind === "jump") ? 1 : 0;
    drawRunnerPose(g, athleteX, athleteBaseline, field.pace.speed, false, jumping, PLAYER_FRAMES, PLAYER_SCALE);
    if (ev.kind === "throw") {
      if (phase === "flight") {
        const ang = Math.atan2(field.flyVY, field.flyVX);
        const len = 15;
        g.line(field.flyX - Math.cos(ang) * len, field.flyY - Math.sin(ang) * len, field.flyX + Math.cos(ang) * len, field.flyY + Math.sin(ang) * len, "#d8b23a");
        g.circle(field.flyX + Math.cos(ang) * len, field.flyY + Math.sin(ang) * len, 2, PAL.grey);
      } else {
        const handY = GROUND_Y - SPRITE_H * PLAYER_SCALE + 10;
        g.line(field.x + 10, handY, field.x + 30, handY - 8, "#d8b23a");
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
    g.rect(0, 0, W, 13, "rgba(13,11,26,0.6)");
    g.text(`EVENT ${eventIdx + 1}/${EVENTS.length}`, 4, 3, PAL.white);
    g.text(ev.name, W / 2, 3, PAL.yellow, { align: "center" });
    let mx = W - 4;
    for (let i = results.length - 1; i >= 0; i--) {
      g.text("*", mx, 3, medalColor(results[i].medal), { align: "right" });
      mx -= 7;
    }
    const racing = phase === "go" || phase === "run" || phase === "runup" || phase === "hold";
    if (racing) {
      // a solid dark HUD box, top-left under the event title — never bare over the crowd/fence art
      const pace = ev.kind === "sprint" ? player.pace.speed : field.pace.speed;
      g.rect(2, 14, 68, 20, "rgba(13,11,26,0.7)");
      g.text("SPEED", 5, 16, PAL.white);
      g.rect(5, 25, 60, 6, PAL.dark);
      g.rect(5, 25, clamp(pace / SPEED_MAX, 0, 1) * 60, 6, pace > SPEED_MAX * 0.7 ? PAL.lime : PAL.yellow);
    }
    if (ev.kind === "sprint" && (phase === "go" || phase === "run")) g.text(`${(runFrames / 60).toFixed(2)}S`, W - 4, 3, PAL.cyan, { align: "right" });
    if (phase === "hold") {
      g.rect(126, 14, 128, 20, "rgba(13,11,26,0.7)");
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
      g.rect(96, 150, 36, 54, "#c89a3a");
      g.rect(134, 166, 34, 38, PAL.dark);
      g.sprite(PLAYER_FRAMES[0], 102, 116);
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
