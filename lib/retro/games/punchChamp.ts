// PUNCH CHAMP — an original cartoon boxing game in the spirit of the classic ring fighters,
// but kid-friendly: big puffy gloves, silly animal opponents, "BOINK!" and stars instead of
// injuries. Behind-the-player view: your boxer (back view) at the bottom, the opponent big
// in the middle of the ring. Watch for the "tell" (a wind-up, a flash, an eyebrow wiggle)
// before every attack, then dodge (◀ ▶) or block (▼) it and counter-punch (A/B) while the
// opponent is open. Fill the star meter by dodging well, then ▲+A unleashes a Star Punch.
// Win 3 rounds by knockdown or on points to move on; beat the big-hearted champ to win it all.
// (Original game in the spirit of 8-bit boxing classics — no real people or trademarks.)
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeShadow, hash2, mixHex, shade } from "../art";

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

// ── baked backdrop (built once, cached, never baked inside the draw loop) ──
interface PunchArt {
  sky: Sprite;
  floor: Sprite;
  post: Sprite;
  pad: Sprite;
  gloveShadow: Sprite;
  burstStar: Sprite;
}
function makeArt(): PunchArt {
  const SKY_H = 34;
  const sky = bake(W, SKY_H, (x, y) => {
    const t = y / (SKY_H - 1);
    const base = mixHex("#171033", "#241a44", t);
    if (hash2(x, y, 7) > 0.994) return shade(base, 0.3); // the odd faint floodlight glint
    return base;
  });
  const FLOOR_H = 26;
  const floor = bake(W, FLOOR_H, (x, y) => {
    let base = y < 3 ? shade(PAL.brown, 0.3) : mixHex(PAL.brown, "#2a160a", ((y - 3) / (FLOOR_H - 3)) * 0.65);
    const n = hash2(Math.floor(x / 3), Math.floor(y / 2), 3);
    if (x % 32 === 0 || x % 32 === 31) base = shade(base, -0.3); // plank seams
    else if (n > 0.9) base = shade(base, -0.14); // grain streak
    else if (n < 0.08) base = shade(base, 0.1);
    return base;
  });
  const POST_W = 10;
  const POST_H = 150;
  const postBase = "#aab0c8";
  const post = bake(POST_W, POST_H, (x, y) => {
    const edge = Math.abs(x - (POST_W - 1) / 2) / ((POST_W - 1) / 2);
    if (y < 6) return shade(postBase, 0.32 - edge * 0.3); // cap
    if (y === 6) return "#5a5e78";
    return shade(postBase, 0.22 - edge * 0.6);
  });
  const PAD_W = 16;
  const PAD_H = 22;
  const pad = bake(PAD_W, PAD_H, (x, y) => {
    const edgeK = x === 0 || x === PAD_W - 1 || y === 0 || y === PAD_H - 1 ? -0.4 : 0;
    const stitch = x === 4 || x === 11 ? -0.28 : 0;
    const topLight = y < 3 ? 0.18 : 0;
    return shade(PAL.red, edgeK + stitch + topLight);
  });
  const gloveShadow = bakeShadow(24, 7, "#120a1e");
  const burstStar = bake(7, 7, (x, y) => {
    const cx = 3;
    const cy = 3;
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (x === cx && y === cy) return "#fffde8";
    if (d <= 1) return PAL.yellow;
    if (d <= 3 && (x === cx || y === cy)) return shade(PAL.yellow, -0.1);
    return null;
  });
  return { sky, floor, post, pad, gloveShadow, burstStar };
}
let PA: PunchArt | null = null;
const art = () => (PA ??= makeArt());

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

/** fixed relative fur/texture flecks on a body block (fractions of body width/height) so the
 *  fill reads as fur, not a flat slab — fixed offsets keep them deterministic, no flicker */
const FUR_SPECKS = [
  { dx: 0.18, dy: 0.15 },
  { dx: 0.62, dy: 0.3 },
  { dx: 0.32, dy: 0.42 },
  { dx: 0.78, dy: 0.12 },
  { dx: 0.08, dy: 0.38 },
];

/** a shiny pixel-art ball: dark rim, base fill, small top-left highlight — three cheap draws
 *  instead of one flat circle, used for heads, ears, gloves and bellies. */
function shadedBall(g: Gfx, cx: number, cy: number, r: number, base: string) {
  g.circle(cx + r * 0.12, cy + r * 0.16, r, shade(base, -0.4));
  g.circle(cx, cy, r * 0.96, base);
  g.circle(cx - r * 0.32, cy - r * 0.34, r * 0.3, shade(base, 0.35));
}
/** a block with a dark outline, a darker shadowed bottom and a lighter top edge */
function shadedBlock(g: Gfx, x: number, y: number, w: number, h: number, base: string) {
  g.box(x - 1, y - 1, w + 2, h + 2, shade(base, -0.5));
  g.rect(x, y, w, h, base);
  g.rect(x, y, w, Math.max(1, h * 0.22), shade(base, 0.22));
  g.rect(x, y + h * 0.78, w, h * 0.22, shade(base, -0.22));
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
    io.sfx.play("hurt");
    io.sfx.noise?.(10, 0.2, 500, 180);
    pop(RING_CX, PLAYER_Y - 36, "OOF!", PAL.red);
    if (player.hp <= 0) loseBout(io);
  };

  function loseBout(io: IO) {
    fightState = "lost";
    msg = "KNOCKED OUT!";
    io.sfx.play("die");
    io.sfx.slide?.(220, 70, 24, "sawtooth", 0.3);
    io.gameOver();
  }

  function advanceOrWin(io: IO) {
    if (oi >= OPPONENTS.length - 1) {
      fightState = "won";
      msg = "YOU'RE THE CHAMP!";
      io.sfx.play("win");
      io.sfx.play("cheer");
      io.sfx.noise?.(40, 0.18, 1200, 2200);
      for (let i = 0; i < 24; i++) {
        const c = r.pick([PAL.pink, PAL.sky, PAL.yellow, PAL.lime, PAL.cyan]);
        sparks.push({ x: r.range(20, W - 20), y: r.range(-10, 0), vx: r.range(-0.6, 0.6), vy: r.range(0.6, 1.6), life: r.int(60, 110), c });
      }
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
      io.sfx.play("zap");
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
          io.sfx.play(opp.dir === "body" ? "thud" : "whoosh");
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
        if (stateT === 8 || stateT === 1) io.sfx.tone(880, 0.09, "square", 0.25); // bell ding-ding to start the round
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
      const a = art();
      const sx = shake > 0 ? (frame % 2 ? 3 : -3) : 0;
      // ── arena: night sky, confetti, canvas ring, roped posts, wood apron ──
      g.clear("#14102a");
      g.sprite(a.sky, 0, 0);
      const confettiCols = [PAL.pink, PAL.sky, PAL.yellow, PAL.lime];
      for (let i = 0; i < 16; i++) {
        const cxp = (i * 17 + 8 + Math.sin(frame * 0.02 + i) * 2) % (W + 16);
        const cyp = 14 + ((i * 7) % 12) + Math.sin(frame * 0.05 + i * 1.7) * 1.5;
        const c = confettiCols[i % confettiCols.length];
        g.rect(cxp - 2, cyp, 4, 1, shade(c, -0.2));
        g.rect(cxp - 1, cyp - 1, 2, 3, c);
      }
      g.rect(0, 34, W, H - 34 - 26, flash > 0 ? "#473a6e" : mixHex("#241d46", "#2e2558", 0.5));
      // soft spotlight glow over the ring centre
      g.rect(RING_CX - 70, 40, 140, 70, "rgba(255,241,189,0.05)");
      g.rect(RING_CX - 40, 46, 80, 40, "rgba(255,241,189,0.05)");
      g.sprite(a.floor, 0, H - 26);
      // ropes: shaded top highlight + base + shadow row for a rounded look
      for (let i = 0; i < 3; i++) {
        const ry = 48 + i * 18;
        const base = i % 2 ? PAL.white : PAL.red;
        g.rect(0 + sx, ry - 1, W, 1, shade(base, 0.35));
        g.rect(0 + sx, ry, W, 2, base);
        g.rect(0 + sx, ry + 2, W, 1, shade(base, -0.3));
      }
      g.sprite(a.post, 4 + sx, 36);
      g.sprite(a.post, W - 14 + sx, 36);
      g.sprite(a.pad, 2 + sx, 40);
      g.sprite(a.pad, W - 18 + sx, 40);

      drawOpponent(g, sx);
      drawPlayer(g, sx);

      for (const s of sparks) {
        g.alpha(clamp(s.life / 18, 0.25, 1));
        g.rect(s.x + sx - 1, s.y - 1, 3, 3, s.c);
        g.alpha(1);
      }
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
      cy = OPP_Y + 40; // a touch less than before: the bigger sprite already reaches low enough
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
    const headR = 26 * s;
    const bodyW = 54 * s;
    const bodyH = 54 * s;
    const bx = cx + tilt;
    const by = cy + bodyY;

    // telegraph glow ring behind the body while winding up or vulnerable
    if (opp.state === "tell" && frame % 8 < 4) g.circle(bx, by + 6, headR + bodyW * 0.42, "rgba(255,225,77,0.22)");
    if (opp.state === "open") g.circle(bx, by + 6, headR + bodyW * 0.4, "rgba(92,242,255,0.2)");

    // body + belly patch, shaded with an outline so it pops off the dark ring
    const bodyTop = by + headR * 0.6;
    const bodyHNow = bodyH * (opp.state === "down" ? 0.55 : 1);
    shadedBlock(g, bx - bodyW / 2, bodyTop, bodyW, bodyHNow, d.color);
    shadedBlock(g, bx - bodyW * 0.32, bodyTop + bodyHNow * 0.18, bodyW * 0.64, bodyHNow * 0.5, d.accent);
    // a couple of fixed fur/feather flecks so the fill isn't a flat slab
    for (const f of FUR_SPECKS) {
      if (d.ear === "feather") continue;
      g.rect(bx - bodyW / 2 + f.dx * bodyW, bodyTop + f.dy * bodyHNow, 3, 2, shade(d.color, -0.2));
    }
    if (d.ear === "big") {
      shadedBlock(g, bx - bodyW * 0.55, by + headR * 1.4, bodyW * 1.1, 6 * s, PAL.yellow); // championship belt
      g.circle(bx, by + headR * 1.4 + 3 * s, 3 * s, shade(PAL.yellow, -0.3)); // belt buckle
    }

    // ears / crest per animal
    if (d.ear === "round") {
      shadedBall(g, bx - headR * 0.8, cy - headR * 0.9, headR * 0.42, d.color);
      shadedBall(g, bx + headR * 0.8, cy - headR * 0.9, headR * 0.42, d.color);
      g.circle(bx - headR * 0.8, cy - headR * 0.9, headR * 0.2, shade(d.accent, -0.1));
      g.circle(bx + headR * 0.8, cy - headR * 0.9, headR * 0.2, shade(d.accent, -0.1));
    } else if (d.ear === "point") {
      shadedBlock(g, bx - headR * 0.9, cy - headR * 1.5, headR * 0.35, headR * 0.9, d.color);
      shadedBlock(g, bx + headR * 0.55, cy - headR * 1.5, headR * 0.35, headR * 0.9, d.color);
    } else if (d.ear === "feather") {
      const spread = opp.state === "tell" || opp.state === "attack" ? 1.5 : 1;
      const fcols = [PAL.pink, PAL.purple, PAL.yellow, PAL.cyan, PAL.lime];
      for (let i = 0; i < 5; i++) {
        const a = (-0.9 + i * 0.45) * spread;
        shadedBall(g, bx + Math.sin(a) * headR * 1.8, cy - headR * 1.1 - Math.cos(a) * headR * 1.3, headR * 0.32, fcols[i]);
      }
    } else if (d.ear === "big") {
      shadedBall(g, bx - headR * 1.05, cy - headR * 0.3, headR * 0.58, d.accent);
      shadedBall(g, bx + headR * 1.05, cy - headR * 0.3, headR * 0.58, d.accent);
    }

    // head + face
    shadedBall(g, bx, cy, headR, d.color);
    const sleepy = d.name.startsWith("BOOMER") && opp.state === "idle";
    const eyeOpen = !sleepy || frame % 90 < 10;
    for (const side of [-1, 1]) {
      const ex = bx + side * headR * 0.42;
      const ey = cy - headR * 0.05;
      if (eyeOpen) {
        g.circle(ex, ey, headR * 0.17, PAL.white);
        g.circle(ex + side * 1, ey + 1, headR * 0.08, PAL.black);
        g.circle(ex - 1, ey - 1, headR * 0.05, PAL.white); // eye glint
      } else {
        g.rect(ex - headR * 0.14, ey, headR * 0.28, 2, PAL.black);
      }
    }
    // eyebrow wiggle — the readable "tell" cue
    if (opp.state === "tell" && frame % 10 < 6) {
      const wig = Math.sin(frame * 0.6) * 3;
      g.rect(bx - headR * 0.55, cy - headR * 0.55 + wig, headR * 0.9, 3, PAL.yellow);
    }
    shadedBall(g, bx, cy + headR * 0.4, headR * 0.32, d.accent); // snout/beak patch
    g.circle(bx, cy + headR * 0.34, headR * 0.08, shade(d.accent, -0.4)); // nose dot

    // arms/gloves — bigger, shiny, with a stitched cuff
    const gloveY = cy + headR * 0.3;
    const glR = headR * 0.56;
    const glLx = bx - headR * 1.3 + armL * -0.3;
    const glLy = gloveY + Math.abs(armL) * 0.1;
    const glRx = bx + headR * 1.3 + armR * 0.3;
    const glRy = gloveY + Math.abs(armR) * 0.1;
    shadedBall(g, glLx, glLy, glR, PAL.red);
    shadedBall(g, glRx, glRy, glR, PAL.red);
    g.rect(glLx - glR * 0.7, glLy + glR * 0.55, glR * 1.4, glR * 0.35, shade(PAL.red, -0.35));
    g.rect(glRx - glR * 0.7, glRy + glR * 0.55, glR * 1.4, glR * 0.35, shade(PAL.red, -0.35));

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
    // opponent health bar just above the ring action — a thick framed strip like the cabinet art
    const hpFrac = clamp(opp.hp / d.hp, 0, 1);
    g.box(RING_CX - 61, 35, 122, 9, PAL.black);
    g.rect(RING_CX - 60, 36, 120, 7, "#1a1530");
    g.rect(RING_CX - 59, 37, 118 * hpFrac, 5, hpFrac > 0.3 ? d.color : PAL.red);
    g.rect(RING_CX - 59, 37, 118 * hpFrac, 2, shade(hpFrac > 0.3 ? d.color : PAL.red, 0.3));
    g.box(RING_CX - 60, 36, 120, 7, PAL.white);
  }

  // ── player: back view, big gloves, shifts with dodge and swings to punch ──
  function drawPlayer(g: Gfx, sx: number) {
    const a = art();
    const cx = RING_CX + sx + player.dodge * 18;
    const duck = player.guard;
    const cy = PLAYER_Y + (duck ? 10 : 0);
    const tint = player.hitFlash > 0 && player.hitFlash % 4 < 2 ? PAL.red : PAL.cyan;
    g.alpha(0.5);
    g.sprite(a.gloveShadow, cx - 12, cy + 23); // soft contact shadow on the canvas
    g.alpha(1);
    // body (back view) — shaded with shoulder seams
    shadedBlock(g, cx - 19, cy - 10, 38, duck ? 27 : 35, tint);
    g.rect(cx - 19, cy - 10, 38, 3, shade(tint, -0.15)); // collar seam
    shadedBall(g, cx, cy - 18, 12, PAL.tan); // head/neck from behind
    shadedBlock(g, cx - 11, cy - 35, 22, 9, PAL.navy); // headband
    g.rect(cx - 11, cy - 32, 22, 2, PAL.red); // headband stripe
    // gloves: idle resting near shoulders, punch extends one up/forward
    const extend = player.punchT > 0 ? Math.min(1, player.punchT / (player.punch === "u" ? UPPER_ANIM : PUNCH_ANIM)) : 0;
    const activePunch = player.punch;
    const lOff = activePunch === "l" ? extend * 30 : 0;
    const rOff = activePunch === "r" ? extend * 30 : 0;
    const uOff = activePunch === "u" ? extend * 24 : 0;
    const glLy = cy - 6 - lOff * 0.6 - (activePunch === "u" ? uOff * 0.2 : 0);
    const glRy = cy - 6 - rOff * 0.6 - (activePunch === "u" ? uOff * 0.2 : 0);
    shadedBall(g, cx - 23, glLy, 12, "#ff4a4a");
    shadedBall(g, cx + 23, glRy, 12, "#ff4a4a");
    g.rect(cx - 23 - 8, glLy + 7, 16, 4, shade("#ff4a4a", -0.35)); // cuff
    g.rect(cx + 23 - 8, glRy + 7, 16, 4, shade("#ff4a4a", -0.35));
    if (activePunch === "l" && extend > 0) g.line(cx - 23, cy - 6, cx - 23, cy - 6 - 12, "rgba(255,255,255,0.5)");
    if (activePunch === "r" && extend > 0) g.line(cx + 23, cy - 6, cx + 23, cy - 6 - 12, "rgba(255,255,255,0.5)");
    if (activePunch === "u" && extend > 0) {
      shadedBall(g, cx, cy - 20 - uOff, 13, PAL.yellow);
      g.line(cx, cy - 10, cx, cy - 20 - uOff, "rgba(255,255,255,0.6)");
    }
    if (duck) g.text("BLOCK", cx, cy - 58, PAL.cyan, { align: "center" });
    // player health bar
    const hpFrac = clamp(player.hp / PLAYER_MAX, 0, 1);
    g.box(7, 179, 62, 9, PAL.black);
    g.rect(8, 180, 60, 7, "#1a1530");
    g.rect(9, 181, 58 * hpFrac, 5, hpFrac > 0.3 ? PAL.cyan : PAL.red);
    g.box(8, 180, 60, 7, PAL.white);
  }

  function drawHud(g: Gfx) {
    const a = art();
    g.rect(0, 0, W, 11, "rgba(13,11,26,0.6)");
    g.text("YOU", 4, 2, PAL.cyan);
    g.text(opp.def.name, W - 4, 2, opp.def.color, { align: "right" });
    g.text(`ROUND ${round}/${ROUNDS}`, RING_CX, 2, PAL.white, { align: "center" });
    const secs = Math.max(0, Math.ceil(roundTimer / 60));
    g.text(`${secs}s`, RING_CX, 22, PAL.grey, { align: "center" });
    // star meter — a little framed gauge with a spark icon, fills gold when ready
    const full = player.star >= STAR_MAX;
    g.box(W - 71, H - 15, 64, 10, PAL.black);
    g.rect(W - 70, H - 14, 62, 8, "#1a1530");
    g.rect(W - 69, H - 13, 60 * (player.star / STAR_MAX), 6, full ? PAL.yellow : PAL.purple);
    g.rect(W - 69, H - 13, 60 * (player.star / STAR_MAX), 2, shade(full ? PAL.yellow : PAL.purple, 0.3));
    g.box(W - 70, H - 14, 62, 8, PAL.white);
    if (full && frame % 10 < 5) g.sprite(a.burstStar, W - 76, H - 18);
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
