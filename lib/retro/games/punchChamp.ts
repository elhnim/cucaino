// PUNCH CHAMP — an original cartoon boxing game in the spirit of the classic ring fighters,
// but kid-friendly: big puffy gloves, silly animal opponents, "BOINK!" and stars instead of
// injuries. Behind-the-player view: your boxer (back view) at the bottom, the opponent big
// in the middle of the ring. Watch for the "tell" (a wind-up, a flash, an eyebrow wiggle)
// before every attack, then dodge (◀ ▶) or block (▼) it and counter-punch (A/B) while the
// opponent is open. Fill the star meter by dodging well, then ▲+A unleashes a Star Punch.
// Win 3 rounds by knockdown or on points to move on; beat the big-hearted champ to win it all.
// (Original game in the spirit of 8-bit boxing classics — no real people or trademarks.)
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef } from "../engine";

const PLAYER_MAX = 100;
const ROUND_FRAMES = 60 * 40; // 40s rounds — plenty of time, clock stops during a knockdown
const ROUNDS = 3;
const STAR_MAX = 100;
const DIZZY_FRAMES = 70;
const DOWN_TICK = 22; // frames per referee count (1..10)
const PUNCH_COOL = 16;
const UPPER_COOL = 26;
const PUNCH_ANIM = 14;
const UPPER_ANIM = 20;
const PUNCH_DMG = 9;
const UPPER_DMG = 13;
const STAR_DMG = 34;
const OPEN_MULT = 1.8;
const DIZZY_MULT = 2.2;
const BASE_OPP_DMG = 13;
const DODGE_STAR = 15;
const COUNTER_STAR = 20;
const RING_CX = W / 2;
const OPP_Y = 92;
const PLAYER_Y = 182;

type Dir = "left" | "right" | "body" | "special" | "feint";
type OppState = "idle" | "tell" | "attack" | "open" | "recover" | "dizzy" | "down";

interface OppDef {
  name: string;
  line: string;
  color: string;
  accent: string;
  ear: "round" | "point" | "feather" | "big";
  hp: number;
  power: number;
  tellMin: number;
  tellMax: number;
  active: number;
  recover: number;
  openWin: number;
  idleMin: number;
  idleMax: number;
  moves: Dir[];
  combo: number;
  scale: number;
  bob: number;
}

const OPPONENTS: OppDef[] = [
  {
    name: "BOOMER THE BEAR",
    line: "Zzz... huh? A fight? Okaaay... *yawn*... let's go, slowly.",
    color: PAL.brown,
    accent: PAL.tan,
    ear: "round",
    hp: 55,
    power: 0.7,
    tellMin: 70,
    tellMax: 100,
    active: 16,
    recover: 55,
    openWin: 44,
    idleMin: 100,
    idleMax: 150,
    moves: ["left", "right", "body"],
    combo: 0,
    scale: 1.0,
    bob: 2,
  },
  {
    name: "RICOCHET ROO",
    line: "Boing boing boing! Betcha can't catch me, champ!",
    color: PAL.orange,
    accent: PAL.tan,
    ear: "point",
    hp: 75,
    power: 0.9,
    tellMin: 48,
    tellMax: 68,
    active: 13,
    recover: 38,
    openWin: 34,
    idleMin: 55,
    idleMax: 95,
    moves: ["left", "right", "body", "special"],
    combo: 0.18,
    scale: 1.05,
    bob: 10,
  },
  {
    name: "DAZZLE THE PEACOCK",
    line: "Ta-da! Admire my feathers... right before I admire your fall!",
    color: PAL.teal,
    accent: PAL.cyan,
    ear: "feather",
    hp: 88,
    power: 1.0,
    tellMin: 36,
    tellMax: 54,
    active: 11,
    recover: 30,
    openWin: 28,
    idleMin: 42,
    idleMax: 72,
    moves: ["left", "right", "feint", "special"],
    combo: 0.28,
    scale: 1.05,
    bob: 3,
  },
  {
    name: "BIG-HEART HUGO",
    line: "I may look soft, but my hooks are not! Good luck, friend!",
    color: PAL.purple,
    accent: PAL.pink,
    ear: "big",
    hp: 130,
    power: 1.25,
    tellMin: 40,
    tellMax: 58,
    active: 13,
    recover: 32,
    openWin: 26,
    idleMin: 36,
    idleMax: 62,
    moves: ["left", "right", "body", "special"],
    combo: 0.32,
    scale: 1.25,
    bob: 4,
  },
];

interface OppRuntime {
  def: OppDef;
  hp: number;
  state: OppState;
  timer: number;
  dir: Dir | null;
  fakeDir: Dir | null;
  comboCount: number;
  anim: number;
}

interface Pop {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

function checkDefense(dir: Dir, inp: Input): boolean {
  if (dir === "left") return inp.held.left;
  if (dir === "right") return inp.held.right;
  if (dir === "body") return inp.held.down;
  if (dir === "special") return inp.held.left || inp.held.right;
  return false; // feints are never actually resolved against
}

function tellLabel(dir: Dir): string {
  if (dir === "left") return "< DODGE!";
  if (dir === "right") return "DODGE! >";
  if (dir === "body") return "DOWN = BLOCK!";
  return "< DODGE!! >";
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let oi = 0;
  let round = 1;
  let roundTimer = ROUND_FRAMES;
  let fightState: "intro" | "roundcard" | "fight" | "won" | "lost" = "intro";
  let stateT = 160;
  let msg = "";
  let msg2 = "";
  let frame = 0;
  let shake = 0;
  let flash = 0;
  const pops: Pop[] = [];
  const sparks: Spark[] = [];
  const downCount = { n: 0, t: DOWN_TICK };

  const player = { hp: PLAYER_MAX, star: 0, dodge: 0, guard: false, punch: null as null | "l" | "r" | "u", punchT: 0, cool: 0, hitFlash: 0 };

  const makeOpp = (i: number): OppRuntime => ({
    def: OPPONENTS[i],
    hp: OPPONENTS[i].hp,
    state: "idle",
    timer: r.int(OPPONENTS[i].idleMin, OPPONENTS[i].idleMax),
    dir: null,
    fakeDir: null,
    comboCount: 0,
    anim: 0,
  });
  let opp = makeOpp(0);

  const burst = (x: number, y: number, c: string, n = 8) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: r.range(-2.2, 2.2), vy: r.range(-2.6, 1), life: r.int(10, 22), c });
  };
  const pop = (x: number, y: number, text: string, color: string) => pops.push({ x, y, vy: -0.6, life: 42, text, color });
  const addStar = (n: number) => (player.star = clamp(player.star + n, 0, STAR_MAX));

  const hurtPlayer = (io: IO, dmg: number) => {
    player.hp = clamp(player.hp - dmg, 0, PLAYER_MAX);
    player.hitFlash = 12;
    shake = 9;
    flash = 5;
    io.sfx.play("hit");
    pop(RING_CX, OPP_Y + 70, "OOF!", PAL.red);
    if (player.hp <= 0) loseBout(io);
  };

  function loseBout(io: IO) {
    fightState = "lost";
    msg = "KNOCKED OUT!";
    io.sfx.play("die");
    io.gameOver();
  }

  function advanceOrWin(io: IO) {
    if (oi >= OPPONENTS.length - 1) {
      fightState = "won";
      msg = "YOU'RE THE CHAMP!";
      io.sfx.play("win");
      io.win();
    } else {
      oi++;
      opp = makeOpp(oi);
      round = 1;
      roundTimer = ROUND_FRAMES;
      player.hp = PLAYER_MAX;
      player.star = 0;
      fightState = "intro";
      stateT = 170;
    }
  }

  function koOpponent(io: IO) {
    io.score(300 * (oi + 1));
    io.sfx.play("win");
    advanceOrWin(io);
  }

  function endRound(io: IO) {
    if (round < ROUNDS) {
      round++;
      roundTimer = ROUND_FRAMES;
      player.hp = PLAYER_MAX;
      fightState = "roundcard";
      stateT = 90;
    } else {
      const oppFrac = opp.hp / opp.def.hp;
      const plFrac = player.hp / PLAYER_MAX;
      if (plFrac >= oppFrac) {
        io.score(150 * (oi + 1));
        msg2 = "WINS ON POINTS!";
        advanceOrWin(io);
      } else {
        msg2 = "LOSES ON POINTS";
        loseBout(io);
      }
    }
  }

  function landPunch(io: IO, kind: "l" | "r" | "u") {
    let dmg = kind === "u" ? UPPER_DMG : PUNCH_DMG;
    let starHit = false;
    if (kind === "u" && player.star >= STAR_MAX) {
      dmg = STAR_DMG;
      player.star = 0;
      starHit = true;
      io.sfx.play("powerup");
    }
    if (opp.state === "idle") dmg *= 1.0;
    else if (opp.state === "open") {
      dmg *= OPEN_MULT;
      addStar(COUNTER_STAR);
      pop(RING_CX, OPP_Y - 20, "NICE COUNTER!", PAL.cyan);
      opp.state = "recover";
      opp.timer = Math.max(10, Math.round(opp.def.recover * 0.6));
    } else if (opp.state === "dizzy") dmg *= DIZZY_MULT;
    else dmg = 0; // whiffs on a guarded/mid-move opponent
    if (dmg <= 0) {
      io.sfx.play("blip");
      return;
    }
    opp.hp = clamp(opp.hp - dmg, 0, opp.def.hp);
    io.score(Math.round(dmg));
    io.sfx.play("hit");
    shake = Math.max(shake, starHit ? 12 : 5);
    flash = Math.max(flash, starHit ? 8 : 3);
    burst(RING_CX, OPP_Y + 10, PAL.white, starHit ? 16 : 7);
    pop(RING_CX, OPP_Y - 36, starHit ? "STAR PUNCH!" : "BOINK!", starHit ? PAL.yellow : PAL.white);
    if (opp.hp <= 0 && opp.state !== "dizzy" && opp.state !== "down") {
      opp.state = "dizzy";
      opp.timer = DIZZY_FRAMES;
      opp.dir = null;
      io.sfx.play("explode");
      pop(RING_CX, OPP_Y - 10, "DIZZY!", PAL.lime);
    }
  }

  function startPunch(io: IO, kind: "l" | "r" | "u") {
    player.punch = kind;
    player.punchT = kind === "u" ? UPPER_ANIM : PUNCH_ANIM;
    player.cool = kind === "u" ? UPPER_COOL : PUNCH_COOL;
    landPunch(io, kind);
  }

  function updatePlayerInput(io: IO, inp: Input) {
    if (player.cool > 0) player.cool--;
    if (player.hitFlash > 0) player.hitFlash--;
    if (player.punchT > 0) player.punchT--;
    player.guard = !!inp.held.down;
    player.dodge = inp.held.left ? -1 : inp.held.right ? 1 : 0;
    if (player.cool <= 0) {
      if (inp.held.up && inp.pressed.a) startPunch(io, "u");
      else if (inp.pressed.a) startPunch(io, "r");
      else if (inp.pressed.b) startPunch(io, "l");
    }
  }

  function startMove(isCombo: boolean) {
    const d = opp.def;
    const picked = r.pick(d.moves);
    if (picked === "feint") {
      opp.dir = "feint";
      opp.fakeDir = r.pick(d.moves.filter((m) => m !== "feint" && m !== "special") as Dir[]) ?? "left";
    } else {
      opp.dir = picked;
      opp.fakeDir = null;
    }
    opp.state = "tell";
    opp.timer = isCombo ? Math.max(16, Math.round(d.tellMin * 0.5)) : r.int(d.tellMin, d.tellMax);
  }

  function endMoveCycle() {
    const d = opp.def;
    if (r.chance(d.combo) && opp.comboCount < 2) {
      opp.comboCount++;
      startMove(true);
    } else {
      opp.comboCount = 0;
      opp.state = "idle";
      opp.timer = r.int(d.idleMin, d.idleMax);
    }
  }

  function updateOpponent(io: IO, inp: Input) {
    opp.anim++;
    const d = opp.def;
    switch (opp.state) {
      case "idle":
        opp.timer--;
        if (opp.timer <= 0) startMove(false);
        break;
      case "tell":
        opp.timer--;
        if (opp.timer <= 0) {
          if (opp.dir === "feint") {
            opp.state = "idle";
            opp.timer = Math.round(r.int(d.idleMin, d.idleMax) * 0.6);
            pop(RING_CX, OPP_Y - 30, "...JUST KIDDING!", PAL.grey);
          } else {
            opp.state = "attack";
            opp.timer = d.active;
          }
        }
        break;
      case "attack": {
        const defended = opp.dir ? checkDefense(opp.dir, inp) : false;
        if (defended) {
          opp.state = "open";
          opp.timer = d.openWin;
          addStar(DODGE_STAR);
          io.score(5);
          io.sfx.play("blip");
          pop(RING_CX - 40, PLAYER_Y - 10, "DODGED!", PAL.cyan);
        } else {
          opp.timer--;
          if (opp.timer <= 0) {
            const mult = opp.dir === "special" ? 1.5 : 1;
            hurtPlayer(io, BASE_OPP_DMG * d.power * mult);
            opp.state = "recover";
            opp.timer = d.recover;
          }
        }
        break;
      }
      case "open":
        opp.timer--;
        if (opp.timer <= 0) endMoveCycle();
        break;
      case "recover":
        opp.timer--;
        if (opp.timer <= 0) endMoveCycle();
        break;
      case "dizzy":
        opp.timer--;
        if (opp.timer <= 0) {
          opp.state = "down";
          downCount.n = 0;
          downCount.t = DOWN_TICK;
        }
        break;
      case "down":
        downCount.t--;
        if (downCount.t <= 0) {
          downCount.n++;
          downCount.t = DOWN_TICK;
          io.sfx.play(downCount.n >= 10 ? "win" : downCount.n % 2 ? "blip" : "hit");
          if (downCount.n >= 10) koOpponent(io);
        }
        break;
    }
  }

  return {
    update(io: IO) {
      frame++;
      if (shake > 0) shake--;
      if (flash > 0) flash--;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        if (--s.life <= 0) sparks.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.y += p.vy;
        if (--p.life <= 0) pops.splice(i, 1);
      }
      if (fightState === "won" || fightState === "lost") return;
      if (fightState === "intro") {
        stateT--;
        if (stateT <= 0) {
          fightState = "roundcard";
          stateT = 80;
        }
        return;
      }
      if (fightState === "roundcard") {
        stateT--;
        if (stateT <= 0) fightState = "fight";
        return;
      }
      const inp = io.input;
      updatePlayerInput(io, inp);
      updateOpponent(io, inp);
      if (fightState === "fight" && opp.state !== "dizzy" && opp.state !== "down") {
        roundTimer--;
        if (roundTimer <= 0) endRound(io);
      }
    },

    draw(g: Gfx) {
      const sx = shake > 0 ? (frame % 2 ? 3 : -3) : 0;
      // ── arena ──
      g.clear("#14102a");
      g.rect(0, 0, W, 34, "#201a40");
      for (let i = 0; i < 16; i++) {
        const cxp = (i * 17 + 8 + Math.sin(frame * 0.02 + i) * 2) % (W + 16);
        g.circle(cxp, 14 + ((i * 7) % 12), 5, i % 3 === 0 ? PAL.pink : i % 3 === 1 ? PAL.sky : PAL.yellow);
      }
      g.rect(0, 34, W, H - 34, flash > 0 ? "#3a2f5a" : "#2a2250");
      g.rect(0, H - 26, W, 26, "#3a2a1a");
      g.rect(0, H - 26, W, 4, "#6a4a2a");
      // ropes
      for (let i = 0; i < 3; i++) {
        const ry = 48 + i * 18;
        g.rect(0 + sx, ry, W, 3, i % 2 ? PAL.white : PAL.red);
      }
      g.rect(6 + sx, 36, 6, H - 60, PAL.dark);
      g.rect(W - 12 + sx, 36, 6, H - 60, PAL.dark);

      drawOpponent(g, sx);
      drawPlayer(g, sx);

      for (const s of sparks) g.rect(s.x + sx, s.y, 2, 2, s.c);
      for (const p of pops) g.text(p.text, RING_CX, p.y, p.color, { align: "center", size: p.text.length > 10 ? 1 : 2 });

      drawHud(g);

      if (fightState === "intro") {
        g.rect(14, 60, W - 28, 100, "rgba(13,11,26,0.85)");
        g.box(14, 60, W - 28, 100, opp.def.color);
        g.text(`BOUT ${oi + 1}/${OPPONENTS.length}`, RING_CX, 68, PAL.yellow, { align: "center" });
        g.text(opp.def.name, RING_CX, 86, opp.def.color, { align: "center", size: 2 });
        g.text(wrapLine(opp.def.line, 30)[0] ?? "", RING_CX, 112, PAL.white, { align: "center" });
        g.text(wrapLine(opp.def.line, 30)[1] ?? "", RING_CX, 126, PAL.white, { align: "center" });
        if (frame % 40 < 28) g.text("GET READY!", RING_CX, 146, PAL.lime, { align: "center" });
      } else if (fightState === "roundcard") {
        g.rect(40, 90, W - 80, 44, "rgba(13,11,26,0.85)");
        g.text(`ROUND ${round}`, RING_CX, 102, PAL.yellow, { align: "center", size: 2 });
        g.text(`OF ${ROUNDS}`, RING_CX, 122, PAL.white, { align: "center" });
      } else if (opp.state === "down") {
        g.text(`${Math.min(10, downCount.n + 1)}...`, RING_CX, 150, PAL.red, { align: "center", size: 3 });
      } else if (fightState === "fight" && opp.state === "tell" && opp.dir) {
        const shown = opp.dir === "feint" ? opp.fakeDir ?? "left" : opp.dir;
        if (frame % 10 < 7) g.text(tellLabel(shown), RING_CX, OPP_Y + 48, PAL.yellow, { align: "center" });
      }

      if (fightState === "won") {
        g.rect(20, 70, W - 40, 90, "rgba(13,11,26,0.9)");
        g.text("CHAMPION!", RING_CX, 90, PAL.yellow, { align: "center", size: 3 });
        g.text(msg, RING_CX, 120, PAL.white, { align: "center" });
      } else if (fightState === "lost") {
        g.rect(20, 70, W - 40, 90, "rgba(13,11,26,0.9)");
        g.text(msg, RING_CX, 95, PAL.red, { align: "center", size: 2 });
        if (msg2) g.text(msg2, RING_CX, 118, PAL.white, { align: "center" });
      }
    },
  };

  // ── opponent drawing: every animal is a few circles/rects, posed by state ──
  function drawOpponent(g: Gfx, sx: number) {
    const d = opp.def;
    const cx = RING_CX + sx;
    const bob = opp.state === "down" ? 0 : Math.sin(frame * 0.08) * d.bob;
    let cy = OPP_Y + bob;
    let tilt = 0;
    let armL = 0;
    let armR = 0;
    let bodyY = 0;
    const dirNow: Dir | null = opp.dir === "feint" ? opp.fakeDir : opp.dir;
    if (opp.state === "down") {
      cy = OPP_Y + 52;
      bodyY = 18;
    } else if (opp.state === "dizzy") {
      tilt = Math.sin(frame * 0.3) * 7;
      bodyY = 6;
    } else if (opp.state === "tell") {
      if (dirNow === "left") armL = -9;
      else if (dirNow === "right") armR = -9;
      else if (dirNow === "body") {
        armL = -6;
        armR = -6;
        bodyY = 6;
      } else if (dirNow === "special") {
        armL = -11;
        armR = -11;
      }
    } else if (opp.state === "attack") {
      if (opp.dir === "left") armL = 16;
      else if (opp.dir === "right") armR = 16;
      else if (opp.dir === "body") {
        armL = 11;
        armR = 11;
        bodyY = 8;
      } else if (opp.dir === "special") {
        armL = 18;
        armR = 18;
      }
    } else if (opp.state === "open") {
      tilt = 6;
      bodyY = 4;
    }
    const s = d.scale;
    const headR = 22 * s;
    const bodyW = 46 * s;
    const bodyH = 48 * s;
    const bx = cx + tilt;
    const by = cy + bodyY;

    // telegraph glow ring behind the body while winding up or vulnerable
    if (opp.state === "tell" && frame % 8 < 4) g.circle(bx, by + 6, headR + bodyW * 0.42, "rgba(255,225,77,0.22)");
    if (opp.state === "open") g.circle(bx, by + 6, headR + bodyW * 0.4, "rgba(92,242,255,0.2)");

    // body + belly patch
    g.rect(bx - bodyW / 2, by + headR * 0.6, bodyW, bodyH * (opp.state === "down" ? 0.55 : 1), d.color);
    g.rect(bx - bodyW * 0.32, by + headR * 0.6 + bodyH * 0.18, bodyW * 0.64, bodyH * 0.5, d.accent);
    if (d.ear === "big") g.rect(bx - bodyW * 0.55, by + headR * 1.4, bodyW * 1.1, 6 * s, PAL.yellow); // championship belt

    // ears / crest per animal
    if (d.ear === "round") {
      g.circle(bx - headR * 0.8, cy - headR * 0.9, headR * 0.4, d.color);
      g.circle(bx + headR * 0.8, cy - headR * 0.9, headR * 0.4, d.color);
    } else if (d.ear === "point") {
      g.rect(bx - headR * 0.9, cy - headR * 1.5, headR * 0.35, headR * 0.9, d.color);
      g.rect(bx + headR * 0.55, cy - headR * 1.5, headR * 0.35, headR * 0.9, d.color);
    } else if (d.ear === "feather") {
      const spread = opp.state === "tell" || opp.state === "attack" ? 1.5 : 1;
      const fcols = [PAL.pink, PAL.purple, PAL.yellow, PAL.cyan, PAL.lime];
      for (let i = 0; i < 5; i++) {
        const a = (-0.9 + i * 0.45) * spread;
        g.circle(bx + Math.sin(a) * headR * 1.8, cy - headR * 1.1 - Math.cos(a) * headR * 1.3, headR * 0.3, fcols[i]);
      }
    } else if (d.ear === "big") {
      g.circle(bx - headR * 1.05, cy - headR * 0.3, headR * 0.55, d.accent);
      g.circle(bx + headR * 1.05, cy - headR * 0.3, headR * 0.55, d.accent);
    }

    // head + face
    g.circle(bx, cy, headR, d.color);
    const sleepy = d.name.startsWith("BOOMER") && opp.state === "idle";
    const eyeOpen = !sleepy || frame % 90 < 10;
    for (const side of [-1, 1]) {
      const ex = bx + side * headR * 0.42;
      const ey = cy - headR * 0.05;
      if (eyeOpen) {
        g.circle(ex, ey, headR * 0.17, PAL.white);
        g.circle(ex + side * 1, ey + 1, headR * 0.08, PAL.black);
      } else {
        g.rect(ex - headR * 0.14, ey, headR * 0.28, 2, PAL.black);
      }
    }
    // eyebrow wiggle — the readable "tell" cue
    if (opp.state === "tell" && frame % 10 < 6) {
      const wig = Math.sin(frame * 0.6) * 3;
      g.rect(bx - headR * 0.55, cy - headR * 0.55 + wig, headR * 0.9, 3, PAL.yellow);
    }
    g.circle(bx, cy + headR * 0.4, headR * 0.3, d.accent); // snout/beak patch

    // arms/gloves
    const gloveY = cy + headR * 0.3;
    g.circle(bx - headR * 1.3 + armL * -0.3, gloveY + Math.abs(armL) * 0.1, headR * 0.5, PAL.red);
    g.circle(bx + headR * 1.3 + armR * 0.3, gloveY + Math.abs(armR) * 0.1, headR * 0.5, PAL.red);

    if (opp.state === "dizzy") {
      for (let i = 0; i < 3; i++) {
        const a = frame * 0.12 + (i * Math.PI * 2) / 3;
        g.text("★", bx + Math.cos(a) * headR * 1.6, cy - headR * 1.6 + Math.sin(a) * headR * 0.6, PAL.yellow, { align: "center" });
      }
    }
    if (opp.state === "down") {
      g.text("X", bx - headR * 0.4, cy - headR * 0.15, PAL.black, { align: "center" });
      g.text("X", bx + headR * 0.4, cy - headR * 0.15, PAL.black, { align: "center" });
    }
    // opponent health bar just above the ring action
    const hpFrac = clamp(opp.hp / d.hp, 0, 1);
    g.rect(RING_CX - 60, 36, 120, 7, PAL.black);
    g.rect(RING_CX - 59, 37, 118 * hpFrac, 5, hpFrac > 0.3 ? d.color : PAL.red);
    g.box(RING_CX - 60, 36, 120, 7, PAL.white);
  }

  // ── player: back view, big gloves, shifts with dodge and swings to punch ──
  function drawPlayer(g: Gfx, sx: number) {
    const cx = RING_CX + sx + player.dodge * 18;
    const duck = player.guard;
    const cy = PLAYER_Y + (duck ? 10 : 0);
    const tint = player.hitFlash > 0 && player.hitFlash % 4 < 2 ? PAL.red : PAL.cyan;
    // body (back view)
    g.rect(cx - 18, cy - 10, 36, duck ? 26 : 34, tint);
    g.rect(cx - 10, cy - 28, 20, 20, PAL.tan); // head/neck from behind
    g.rect(cx - 10, cy - 34, 20, 8, PAL.navy); // headband
    // gloves: idle resting near shoulders, punch extends one up/forward
    const extend = player.punchT > 0 ? Math.min(1, player.punchT / (player.punch === "u" ? UPPER_ANIM : PUNCH_ANIM)) : 0;
    const activePunch = player.punch;
    const lOff = activePunch === "l" ? extend * 30 : 0;
    const rOff = activePunch === "r" ? extend * 30 : 0;
    const uOff = activePunch === "u" ? extend * 24 : 0;
    g.circle(cx - 22, cy - 6 - lOff * 0.6 - (activePunch === "u" ? uOff * 0.2 : 0), 10, "#ff4a4a");
    g.circle(cx + 22, cy - 6 - rOff * 0.6 - (activePunch === "u" ? uOff * 0.2 : 0), 10, "#ff4a4a");
    if (activePunch === "l" && extend > 0) g.line(cx - 22, cy - 6, cx - 22, cy - 6 - 10, "rgba(255,255,255,0.5)");
    if (activePunch === "r" && extend > 0) g.line(cx + 22, cy - 6, cx + 22, cy - 6 - 10, "rgba(255,255,255,0.5)");
    if (activePunch === "u" && extend > 0) {
      g.circle(cx, cy - 20 - uOff, 11, PAL.yellow);
      g.line(cx, cy - 10, cx, cy - 20 - uOff, "rgba(255,255,255,0.6)");
    }
    if (duck) g.text("BLOCK", cx, cy - 46, PAL.cyan, { align: "center" });
    // player health bar
    const hpFrac = clamp(player.hp / PLAYER_MAX, 0, 1);
    g.rect(8, 180, 60, 7, PAL.black);
    g.rect(9, 181, 58 * hpFrac, 5, hpFrac > 0.3 ? PAL.cyan : PAL.red);
    g.box(8, 180, 60, 7, PAL.white);
  }

  function drawHud(g: Gfx) {
    g.rect(0, 0, W, 11, "rgba(13,11,26,0.6)");
    g.text("YOU", 4, 2, PAL.cyan);
    g.text(opp.def.name, W - 4, 2, opp.def.color, { align: "right" });
    g.text(`ROUND ${round}/${ROUNDS}`, RING_CX, 2, PAL.white, { align: "center" });
    const secs = Math.max(0, Math.ceil(roundTimer / 60));
    g.text(`${secs}s`, RING_CX, 22, PAL.grey, { align: "center" });
    // star meter
    const full = player.star >= STAR_MAX;
    g.rect(W - 70, H - 14, 62, 8, PAL.black);
    g.rect(W - 69, H - 13, 60 * (player.star / STAR_MAX), 6, full ? PAL.yellow : PAL.purple);
    g.box(W - 70, H - 14, 62, 8, PAL.white);
    g.text(full && frame % 20 < 12 ? "★ READY!" : "STAR", W - 39, H - 23, PAL.yellow, { align: "center" });
  }
}

/** split a line roughly in half on a word boundary so it fits the intro card */
function wrapLine(s: string, max: number): [string, string] {
  if (s.length <= max) return [s, ""];
  let cut = s.lastIndexOf(" ", max);
  if (cut < 0) cut = max;
  return [s.slice(0, cut), s.slice(cut + 1)];
}

export const punchChamp: RetroGameDef = {
  id: "punch-champ",
  title: "Punch Champ",
  blurb: "An original cartoon boxing bout! Dodge, block and counter 4 silly animal champs.",
  genre: "Sports",
  emoji: "🥊",
  color: "#ff4a4a",
  controls: "◀ ▶ dodge · ▼ block · A/B punch · ▲+A star punch",
  pad: { dpad: "4", a: "Right", b: "Left" },
  create,
};
