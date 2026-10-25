// SUPER KICK SOCCER — a top-down 4-a-side football match in the spirit of NES/SNES classics.
// The pitch is wider than the screen and scrolls with the ball (camera via g.camera). You
// control whichever teammate is closest to the ball (auto-switch, marked by a bouncing dot).
// D-pad moves (8-way), hold A to shoot (longer hold = harder shot), B passes to a teammate or
// slide-tackles to win the ball back when you don't have it. Win (or draw) a 2-half match to
// move up the mini cup against a tougher made-up team; lose and it's game over.
// (Original teams and art — no real clubs, players or branding.)
import { H, PAL, W, clamp, dist, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

// ── pitch geometry (wider than the screen; the camera follows the ball) ──
const FIELD_W = 480;
const FIELD_TOP = 20;
const FIELD_BOTTOM = H - 20;
const GOAL_CY = (FIELD_TOP + FIELD_BOTTOM) / 2;
const GOAL_H = 64;
const GOAL_Y0 = GOAL_CY - GOAL_H / 2;
const GOAL_Y1 = GOAL_CY + GOAL_H / 2;
const GOAL_LINE_L = 18;
const GOAL_LINE_R = FIELD_W - 18;
const BOX_W = 56;
const BOX_H = 120;
const BALL_R = 3;

// ── tuning ──
const BASE_SPEED = 1.05;
const GK_SPEED = 1.3;
const HUMAN_SPEED = 1.55;
const TACKLE_BOOST = 1.7;
const CAPTURE_R = 11;
const TACKLE_R = 16;
const LOCK_FRAMES = 22;
const PASS_SPEED = 3.1;
const SHOOT_BASE = 3.6;
const SHOOT_MAX = 6.8;
const CHARGE_MAX = 36;
const FRICTION = 0.985;
const HALF_FRAMES = 90 * 60; // ~90 real seconds per half

interface Tier {
  name: string;
  color: string;
  speed: number; // player speed multiplier
  acc: number; // 0..1 shooting/decision quality — low tiers shoot rarely and wildly
  gk: number; // 0..1 goalkeeper reaction/reach — low tiers have a sleepy keeper
}
const KID_TIER: Tier = { name: "STAR STRIKERS", color: PAL.blue, speed: 1.05, acc: 0.6, gk: 0.9 };
// Team 1 (first opponent) must be genuinely easy for a 6-year-old: slow, rarely shoots, and
// misses wide when it does. Each later team ramps up speed, shot quality and keeper skill.
const TEAMS: Tier[] = [
  { name: "COMET KICKERS", color: PAL.orange, speed: 0.6, acc: 0.14, gk: 0.2 },
  { name: "THUNDER WOLVES", color: PAL.purple, speed: 0.82, acc: 0.34, gk: 0.42 },
  { name: "ICE FALCONS", color: PAL.cyan, speed: 1.0, acc: 0.55, gk: 0.6 },
  { name: "GOLDEN DRAGONS", color: PAL.yellow, speed: 1.15, acc: 0.78, gk: 0.8 },
];

// ── pixel art: a 12x16 top-down body (head, team shirt, shorts) with a 2-frame run cycle ──
const BODY_TOP = [
  "....kkkk....",
  "...kssssk...",
  "..kssssssk..",
  "..kssssssk..",
  "...kssssk...",
  ".khhhhhhhhk.",
  "khhhhhhhhhhk",
  "khhhhhhhhhhk",
  "khhhhhhhhhhk",
  ".khhhhhhhhk.",
  ".kppppppppk.",
  "..kppppppk..",
];
const LEGS_A = ["...pp..pp...", "...pp..pp...", "...ww..ww...", "..kk....kk.."];
const LEGS_B = ["..pp....pp..", "..pp....pp..", "..ww....ww..", ".kk......kk."];
const bodyPal = (shirt: string, shorts: string) => ({ s: PAL.tan, h: shirt, k: PAL.black, p: shorts, w: PAL.white });
const spriteFor = (shirt: string, shorts: string) => {
  const pal = bodyPal(shirt, shorts);
  return [sprite([...BODY_TOP, ...LEGS_A], pal), sprite([...BODY_TOP, ...LEGS_B], pal)];
};
const PLAYER_W = 12;
const PLAYER_H = 16;

type Role = "GK" | "DEF" | "MID" | "FWD";
const ROLE_SLOTS: Record<Role, { frac: number; yOff: number }> = {
  GK: { frac: 0.035, yOff: 0 },
  DEF: { frac: 0.24, yOff: 0 },
  MID: { frac: 0.52, yOff: -30 },
  FWD: { frac: 0.74, yOff: 30 },
};

interface Player {
  team: 0 | 1;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  anim: number;
  baseFrac: number;
  baseY: number;
  decideT: number;
  dribbleYOff: number;
  chargeA: number;
  tackleT: number;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Player | null;
  lockT: number;
  noPickupT: number;
  noPickupWho: Player | null;
}
type MatchState = "intro" | "kickoff" | "play" | "goal" | "halftime" | "fulltime" | "won" | "lost";

function create(seed: number): GameInstance {
  const r = rng(seed);
  const kidShirt = spriteFor(KID_TIER.color, PAL.white);
  const kidGkShirt = spriteFor(PAL.yellow, PAL.white);
  let oppShirt = spriteFor(TEAMS[0].color, PAL.dark);
  let oppGkShirt = spriteFor(PAL.lime, PAL.dark);

  let matchIdx = 0;
  let score: [number, number] = [0, 0];
  let half: 1 | 2 = 1;
  let halfTimer = HALF_FRAMES;
  let state: MatchState = "intro";
  let stateT = 150;
  let frame = 0;
  let shake = 0;
  let flash = 0;
  let msg = "";
  let players: Player[] = [];
  interface Confetti {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    c: string;
  }
  const confetti: Confetti[] = [];
  const CONFETTI_COLORS = [PAL.yellow, PAL.pink, PAL.cyan, PAL.lime, PAL.orange, PAL.white];
  const spawnConfetti = (x: number, y: number) => {
    for (let i = 0; i < 24; i++) confetti.push({ x, y, vx: r.range(-2.4, 2.4), vy: r.range(-3.6, -0.6), life: r.int(32, 58), c: r.pick(CONFETTI_COLORS) });
  };
  const ball: Ball = { x: FIELD_W / 2, y: GOAL_CY, vx: 0, vy: 0, owner: null, lockT: 0, noPickupT: 0, noPickupWho: null };

  const oppTier = () => TEAMS[matchIdx];
  const tierFor = (team: 0 | 1) => (team === 0 ? KID_TIER : oppTier());
  const goalXFor = (team: 0 | 1) => (team === 0 ? GOAL_LINE_R : GOAL_LINE_L);
  const xForFrac = (team: 0 | 1, frac: number) => (team === 0 ? GOAL_LINE_L + frac * (GOAL_LINE_R - GOAL_LINE_L) : GOAL_LINE_R - frac * (GOAL_LINE_R - GOAL_LINE_L));

  const makePlayer = (team: 0 | 1, role: Role): Player => {
    const slot = ROLE_SLOTS[role];
    const baseY = GOAL_CY + slot.yOff;
    return { team, role, x: xForFrac(team, slot.frac), y: baseY, vx: 0, vy: 0, anim: 0, baseFrac: slot.frac, baseY, decideT: r.int(20, 50), dribbleYOff: 0, chargeA: 0, tackleT: 0 };
  };

  const resetFormation = () => {
    for (const p of players) {
      p.x = xForFrac(p.team, p.baseFrac);
      p.y = p.baseY;
      p.vx = 0;
      p.vy = 0;
      p.chargeA = 0;
      p.tackleT = 0;
    }
    ball.x = FIELD_W / 2;
    ball.y = GOAL_CY;
    ball.vx = 0;
    ball.vy = 0;
    ball.owner = null;
    ball.lockT = 0;
    ball.noPickupT = 0;
    ball.noPickupWho = null;
  };

  const newMatch = () => {
    oppShirt = spriteFor(oppTier().color, PAL.dark);
    oppGkShirt = spriteFor(PAL.lime, PAL.dark);
    players = [
      makePlayer(0, "GK"),
      makePlayer(0, "DEF"),
      makePlayer(0, "MID"),
      makePlayer(0, "FWD"),
      makePlayer(1, "GK"),
      makePlayer(1, "DEF"),
      makePlayer(1, "MID"),
      makePlayer(1, "FWD"),
    ];
    resetFormation();
    score = [0, 0];
    half = 1;
    halfTimer = HALF_FRAMES;
    state = "intro";
    stateT = 150;
    msg = `VS ${oppTier().name}`;
  };
  newMatch();

  const teamOf = (team: 0 | 1) => players.filter((p) => p.team === team);

  const moveToward = (p: Player, tx: number, ty: number, speed: number) => {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const s = Math.min(speed, d);
    p.vx = (dx / d) * s;
    p.vy = (dy / d) * s;
    p.x = clamp(p.x + p.vx, 10, FIELD_W - 10);
    p.y = clamp(p.y + p.vy, FIELD_TOP + 4, FIELD_BOTTOM - 4);
    if (s > 0.05) p.anim += s * 0.35;
  };

  const shiftedHome = (p: Player) => {
    const prog = clamp((ball.x - GOAL_LINE_L) / (GOAL_LINE_R - GOAL_LINE_L), 0, 1);
    const shiftFrac = p.team === 0 ? prog : 1 - prog;
    const pushed = clamp(p.baseFrac + (shiftFrac - 0.5) * 0.4, 0.04, 0.92);
    const x = xForFrac(p.team, pushed);
    const y = clamp(p.baseY + (ball.y - p.baseY) * 0.2, FIELD_TOP + 10, FIELD_BOTTOM - 10);
    return { x, y };
  };

  // Never a candidate for a pass that would send the ball back toward our own net — a pass
  // flies in a straight line until someone collects it, so an uncollected backward ball near
  // our own goal would otherwise drift in for an own goal.
  const bestPassTarget = (p: Player): Player | null => {
    const ownGoalX = p.team === 0 ? GOAL_LINE_L : GOAL_LINE_R;
    const inDanger = Math.abs(p.x - ownGoalX) < 150;
    const mates = players.filter((q) => q.team === p.team && q !== p);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const m of mates) {
      const forward = (m.x - p.x) * (p.team === 0 ? 1 : -1);
      if (inDanger && forward < -10) continue; // too risky: would send it back toward our net
      let openness = Infinity;
      for (const o of players) if (o.team !== p.team) openness = Math.min(openness, dist(m.x, m.y, o.x, o.y));
      const d = dist(p.x, p.y, m.x, m.y);
      if (d > 170) continue;
      const sc = forward * 0.6 + openness * 1.1 - d * 0.15;
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return best;
  };

  const passBall = (io: IO, p: Player) => {
    const target = bestPassTarget(p);
    let tx: number;
    let ty: number;
    if (target) {
      tx = target.x;
      ty = target.y;
    } else {
      // no safe teammate to find — just clear it forward, away from our own goal
      tx = p.team === 0 ? p.x + 170 : p.x - 170;
      ty = clamp(GOAL_CY + r.range(-30, 30), FIELD_TOP + 14, FIELD_BOTTOM - 14);
    }
    const dx = tx - ball.x;
    const dy = ty - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    ball.owner = null;
    ball.vx = (dx / d) * PASS_SPEED;
    ball.vy = (dy / d) * PASS_SPEED;
    ball.noPickupWho = p;
    ball.noPickupT = 8;
    io.sfx.play("blip");
  };

  const shootBall = (io: IO, p: Player, powerFrac: number, aimNudge: number) => {
    const goalX = goalXFor(p.team);
    const spd = SHOOT_BASE + clamp(powerFrac, 0.3, 1) * (SHOOT_MAX - SHOOT_BASE);
    const aimY = clamp(GOAL_CY + aimNudge, GOAL_Y0 + 6, GOAL_Y1 - 6);
    const dx = goalX - ball.x;
    const dy = aimY - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    ball.owner = null;
    ball.vx = (dx / d) * spd;
    ball.vy = (dy / d) * spd;
    ball.noPickupWho = p;
    ball.noPickupT = 10;
    io.sfx.play("shoot");
  };

  const gkMove = (p: Player, speed: number, tier: Tier) => {
    const ownGoalX = p.team === 0 ? GOAL_LINE_L : GOAL_LINE_R;
    const dir = p.team === 0 ? 1 : -1;
    let tx = ownGoalX + dir * 7;
    let ty = clamp(ball.y, GOAL_Y0 + 5, GOAL_Y1 - 5);
    const approaching = !ball.owner && ((p.team === 0 && ball.vx < -0.4) || (p.team === 1 && ball.vx > 0.4));
    if (approaching) {
      // a shot is in flight toward us — a good keeper reads where it will cross the line
      // immediately instead of laggily tracking the ball's current position; a weak keeper's
      // read is noisy, so they often dive the wrong way.
      const steps = Math.abs(ball.x - ownGoalX) / Math.max(0.3, Math.abs(ball.vx));
      const predY = ball.y + ball.vy * steps + r.range(-1, 1) * (1 - tier.gk) * 40;
      ty = clamp(predY, GOAL_Y0 + 4, GOAL_Y1 - 4);
      tx = ownGoalX + dir * 6;
    }
    const inBox = Math.abs(ball.x - ownGoalX) < BOX_W + 20;
    if (!ball.owner && !approaching && inBox) {
      tx = clamp(ball.x, ownGoalX + dir * 2, ownGoalX + dir * 34);
      ty = clamp(ball.y, GOAL_Y0, GOAL_Y1);
    } else if (ball.owner && ball.owner.team !== p.team && inBox && dist(p.x, p.y, ball.x, ball.y) < 60) {
      tx = ball.x;
      ty = ball.y;
    }
    moveToward(p, tx, ty, speed * 1.05);
  };

  // The human always "takes over" whichever teammate is nearest the ball, but when the kid
  // isn't actively chasing (idle or mashing randomly), that player sits still — so defensive
  // AI must pick its chaser from the OTHER teammates, never silently defer to a frozen human.
  const aiMove = (p: Player, io: IO, human: Player) => {
    const tier = tierFor(p.team);
    if (p.role === "GK") {
      // a keeper who catches the ball must give it up quickly — otherwise it just sticks
      // to them forever, since nothing else ever makes an AI goalkeeper shoot or pass.
      if (ball.owner === p) {
        p.decideT--;
        if (p.decideT <= 0) {
          if (r.chance(0.65)) passBall(io, p);
          else shootBall(io, p, 0.5, r.range(-1, 1) * 24);
          p.decideT = r.int(20, 40);
        }
      } else {
        p.decideT = r.int(14, 26);
      }
      gkMove(p, GK_SPEED * tier.gk, tier);
      return;
    }
    const speed = BASE_SPEED * tier.speed;
    const iHaveBall = ball.owner === p;
    const teamHasBall = ball.owner !== null && ball.owner.team === p.team;
    const oppHasBall = ball.owner !== null && ball.owner.team !== p.team;
    if (iHaveBall) {
      p.decideT--;
      if (p.decideT <= 0) {
        const goalX = goalXFor(p.team);
        // weak teams shoot far less often, and wildly off target when they do
        if (Math.abs(goalX - p.x) < 115 && r.chance(0.12 + tier.acc * 0.55)) {
          shootBall(io, p, tier.acc, r.range(-1, 1) * (1 - tier.acc) * 50);
        } else if (r.chance(0.4)) {
          passBall(io, p);
        }
        p.decideT = r.int(26, 56) + Math.round((1 - tier.acc) * 30);
        p.dribbleYOff = r.range(-22, 22);
      }
      const goalX = goalXFor(p.team);
      moveToward(p, goalX, clamp(GOAL_CY + p.dribbleYOff, FIELD_TOP + 14, FIELD_BOTTOM - 14), speed * 0.95);
    } else if (teamHasBall) {
      const h = shiftedHome(p);
      moveToward(p, h.x, h.y, speed);
    } else if (oppHasBall) {
      const chasers = teamOf(p.team).filter((q) => q !== human);
      const nearest = chasers.reduce((a, b) => (dist(a.x, a.y, ball.x, ball.y) < dist(b.x, b.y, ball.x, ball.y) ? a : b));
      if (nearest === p && dist(p.x, p.y, ball.x, ball.y) < 180) moveToward(p, ball.x, ball.y, speed * 1.15);
      else {
        const h = shiftedHome(p);
        moveToward(p, h.x, h.y, speed);
      }
    } else {
      const chasers = teamOf(p.team).filter((q) => q !== human);
      const nearest = chasers.reduce((a, b) => (dist(a.x, a.y, ball.x, ball.y) < dist(b.x, b.y, ball.x, ball.y) ? a : b));
      if (nearest === p) moveToward(p, ball.x, ball.y, speed * 1.1);
      else {
        const h = shiftedHome(p);
        moveToward(p, h.x, h.y, speed);
      }
    }
  };

  const contestCapture = (io: IO) => {
    if (ball.noPickupT > 0) ball.noPickupT--;
    if (ball.lockT > 0) ball.lockT--;
    let claimant: Player | null = null;
    let bestD = Infinity;
    for (const p of players) {
      if (ball.noPickupT > 0 && p === ball.noPickupWho) continue;
      // a skilled keeper gets a bigger shot-stopping reach than their raw speed alone would
      // give them — a weak team's keeper barely benefits, so the kid can still score on them
      const rad = p.role === "GK" ? CAPTURE_R + tierFor(p.team).gk * 16 : p.tackleT > 0 ? TACKLE_R : CAPTURE_R;
      const d = dist(p.x, p.y, ball.x, ball.y);
      if (d < rad && d < bestD) {
        bestD = d;
        claimant = p;
      }
    }
    if (!claimant) return;
    if (!ball.owner) {
      ball.owner = claimant;
      ball.lockT = LOCK_FRAMES;
      io.sfx.play("blip");
    } else if (ball.owner !== claimant && claimant.team !== ball.owner.team) {
      const canSteal = claimant.tackleT > 0 || ball.lockT <= 0;
      if (canSteal) {
        ball.owner = claimant;
        ball.lockT = LOCK_FRAMES;
        io.sfx.play("hit");
      }
    }
  };

  const attachBallToOwner = () => {
    const o = ball.owner;
    if (!o) return;
    const dir = o.team === 0 ? 1 : -1;
    const tx = o.x + dir * 8;
    const ty = o.y;
    ball.x += (tx - ball.x) * 0.5;
    ball.y += (ty - ball.y) * 0.5;
    ball.vx = 0;
    ball.vy = 0;
  };

  const scoreGoal = (io: IO, scoringTeam: 0 | 1) => {
    score[scoringTeam]++;
    if (scoringTeam === 0) {
      io.score(200);
      io.sfx.play("coin");
      msg = "GOAL!";
      spawnConfetti(GOAL_LINE_R - 10, GOAL_CY);
      flash = 12;
    } else {
      io.sfx.play("die");
      msg = `${oppTier().name} SCORES`;
    }
    shake = 16;
    ball.owner = null;
    ball.vx = 0;
    ball.vy = 0;
    state = "goal";
    stateT = 90;
  };

  const ballPhysics = (io: IO) => {
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= FRICTION;
    ball.vy *= FRICTION;
    if (Math.hypot(ball.vx, ball.vy) < 0.03) {
      ball.vx = 0;
      ball.vy = 0;
    }
    if (ball.y < FIELD_TOP + 3) {
      ball.y = FIELD_TOP + 3;
      ball.vy = Math.abs(ball.vy);
      io.sfx.play("bounce");
    } else if (ball.y > FIELD_BOTTOM - 3) {
      ball.y = FIELD_BOTTOM - 3;
      ball.vy = -Math.abs(ball.vy);
      io.sfx.play("bounce");
    }
    if (ball.x < GOAL_LINE_L) {
      if (ball.y > GOAL_Y0 && ball.y < GOAL_Y1) scoreGoal(io, 1);
      else {
        ball.x = GOAL_LINE_L;
        ball.vx = Math.abs(ball.vx);
      }
    } else if (ball.x > GOAL_LINE_R) {
      if (ball.y > GOAL_Y0 && ball.y < GOAL_Y1) scoreGoal(io, 0);
      else {
        ball.x = GOAL_LINE_R;
        ball.vx = -Math.abs(ball.vx);
      }
    }
  };

  const resolveAfterStoppage = () => {
    if (halfTimer <= 0) {
      if (half === 1) {
        state = "halftime";
        stateT = 130;
      } else {
        state = "fulltime";
        stateT = 170;
      }
    } else {
      resetFormation();
      state = "kickoff";
      stateT = 50;
    }
  };

  const advanceOrEnd = (io: IO) => {
    const kidOk = score[0] >= score[1];
    if (kidOk) {
      io.score(800 + matchIdx * 400);
      io.sfx.play("win");
      msg = score[0] === score[1] ? "A DRAW — YOU GO THROUGH!" : `YOU BEAT ${oppTier().name}!`;
      if (matchIdx >= TEAMS.length - 1) {
        io.score(3000);
        state = "won";
        io.win();
      } else {
        matchIdx++;
        newMatch();
      }
    } else {
      io.sfx.play("die");
      msg = `${oppTier().name} WIN THE MATCH`;
      state = "lost";
      io.gameOver();
    }
  };

  return {
    update(io: IO) {
      frame++;
      if (shake > 0) shake--;
      if (flash > 0) flash--;
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.08;
        if (--c.life <= 0) confetti.splice(i, 1);
      }
      if (state === "won" || state === "lost") return;

      if (state === "intro") {
        stateT--;
        if (stateT <= 0) {
          resetFormation();
          state = "kickoff";
          stateT = 50;
        }
        return;
      }
      if (state === "kickoff") {
        stateT--;
        if (stateT <= 0) state = "play";
        return;
      }
      if (state === "goal") {
        stateT--;
        if (stateT <= 0) resolveAfterStoppage();
        return;
      }
      if (state === "halftime") {
        stateT--;
        if (stateT <= 0) {
          half = 2;
          halfTimer = HALF_FRAMES;
          resetFormation();
          state = "kickoff";
          stateT = 50;
        }
        return;
      }
      if (state === "fulltime") {
        stateT--;
        if (stateT <= 0) advanceOrEnd(io);
        return;
      }

      // ── state === "play" ──
      const inp = io.input;
      // the kid only ever controls an outfielder — the keeper always stays under gkMove's AI,
      // so mashing a direction can never drag them out of position and leave the goal empty
      const outfield = teamOf(0).filter((p) => p.role !== "GK");
      const human = outfield.reduce((a, b) => (dist(a.x, a.y, ball.x, ball.y) < dist(b.x, b.y, ball.x, ball.y) ? a : b));
      const hasBall = ball.owner === human;

      let dx = 0;
      let dy = 0;
      if (inp.held.left) dx -= 1;
      if (inp.held.right) dx += 1;
      if (inp.held.up) dy -= 1;
      if (inp.held.down) dy += 1;
      let hSpeed = HUMAN_SPEED;
      if (human.tackleT > 0) hSpeed *= TACKLE_BOOST;
      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        human.vx = (dx / len) * hSpeed;
        human.vy = (dy / len) * hSpeed;
        human.x = clamp(human.x + human.vx, 10, FIELD_W - 10);
        human.y = clamp(human.y + human.vy, FIELD_TOP + 4, FIELD_BOTTOM - 4);
        human.anim += hSpeed * 0.35;
      } else if (human.tackleT > 0) {
        human.x = clamp(human.x + human.vx * 0.8, 10, FIELD_W - 10);
        human.y = clamp(human.y + human.vy * 0.8, FIELD_TOP + 4, FIELD_BOTTOM - 4);
      }
      if (human.tackleT > 0) human.tackleT--;

      if (inp.pressed.b) {
        if (hasBall) passBall(io, human);
        else {
          human.tackleT = 14;
          if (!dx && !dy) {
            const ddx = ball.x - human.x;
            const ddy = ball.y - human.y;
            const dd = Math.hypot(ddx, ddy) || 1;
            human.vx = ddx / dd;
            human.vy = ddy / dd;
          }
          io.sfx.play("step");
        }
      }
      if (hasBall && inp.held.a) {
        human.chargeA = Math.min(human.chargeA + 1, CHARGE_MAX);
      } else if (human.chargeA > 0) {
        if (ball.owner === human) {
          const powerFrac = clamp(human.chargeA / CHARGE_MAX, 0.3, 1);
          let nudge = 0;
          if (inp.held.up) nudge = -18;
          else if (inp.held.down) nudge = 18;
          nudge += r.range(-1, 1) * (1 - powerFrac) * 8;
          shootBall(io, human, powerFrac, nudge);
        }
        human.chargeA = 0;
      }
      if (!hasBall) human.chargeA = 0;

      for (const p of players) if (p !== human) aiMove(p, io, human);

      contestCapture(io);
      if (ball.owner) attachBallToOwner();
      else ballPhysics(io);

      if (state === "play") {
        halfTimer = Math.max(0, halfTimer - 1);
        if (halfTimer <= 0) {
          if (half === 1) {
            state = "halftime";
            stateT = 130;
          } else {
            state = "fulltime";
            stateT = 170;
          }
        }
      }
    },

    draw(g: Gfx) {
      const human = (() => {
        const outfield = teamOf(0).filter((p) => p.role !== "GK");
        return outfield.reduce((a, b) => (dist(a.x, a.y, ball.x, ball.y) < dist(b.x, b.y, ball.x, ball.y) ? a : b));
      })();
      const sx = shake > 0 ? (frame % 2 ? 2 : -2) : 0;
      const camX = clamp(ball.x - W / 2, 0, FIELD_W - W);

      g.clear(PAL.night);
      g.camera(camX + sx, 0);

      // pitch + mow stripes
      g.rect(0, FIELD_TOP, FIELD_W, FIELD_BOTTOM - FIELD_TOP, "#2fa040");
      for (let x = 0; x < FIELD_W; x += 40) g.rect(x, FIELD_TOP, 20, FIELD_BOTTOM - FIELD_TOP, "#36b24a");
      g.rect(0, FIELD_TOP - 3, FIELD_W, 3, PAL.white);
      g.rect(0, FIELD_BOTTOM, FIELD_W, 3, PAL.white);
      g.line(FIELD_W / 2, FIELD_TOP, FIELD_W / 2, FIELD_BOTTOM, PAL.white);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.rect(FIELD_W / 2 + Math.cos(a) * 28 - 1, GOAL_CY + Math.sin(a) * 28 - 1, 2, 2, PAL.white);
      }
      g.box(GOAL_LINE_L, GOAL_CY - BOX_H / 2, BOX_W, BOX_H, PAL.white);
      g.box(GOAL_LINE_R - BOX_W, GOAL_CY - BOX_H / 2, BOX_W, BOX_H, PAL.white);
      // goal nets
      g.rect(2, GOAL_Y0, GOAL_LINE_L - 2, GOAL_H, "rgba(255,255,255,0.1)");
      g.box(0, GOAL_Y0 - 2, GOAL_LINE_L, GOAL_H + 4, PAL.white);
      g.rect(GOAL_LINE_R, GOAL_Y0, FIELD_W - GOAL_LINE_R - 2, GOAL_H, "rgba(255,255,255,0.1)");
      g.box(GOAL_LINE_R, GOAL_Y0 - 2, FIELD_W - GOAL_LINE_R, GOAL_H + 4, PAL.white);

      // players
      for (const p of players) {
        const shirt = p.team === 0 ? (p.role === "GK" ? kidGkShirt : kidShirt) : p.role === "GK" ? oppGkShirt : oppShirt;
        const frameI = Math.floor(p.anim) % 2;
        g.circle(p.x, p.y + 6, 4, "rgba(0,0,0,0.25)");
        g.sprite(shirt[frameI], p.x - PLAYER_W / 2, p.y - PLAYER_H + 3);
      }
      // controlled marker
      const bob = Math.sin(frame * 0.2) * 2;
      g.circle(human.x, human.y - PLAYER_H - 2 + bob, 3, "rgba(0,0,0,0.4)");
      g.circle(human.x, human.y - PLAYER_H - 2 + bob, 2, PAL.white);

      // ball
      g.circle(ball.x + 1, ball.y + 2, BALL_R, "rgba(0,0,0,0.3)");
      g.circle(ball.x, ball.y, BALL_R, PAL.white);
      g.rect(ball.x - 1, ball.y - 1, 1, 1, PAL.black);

      // goal celebration confetti (drawn in field space, above everything else)
      for (const c of confetti) g.rect(c.x, c.y, 2, 2, c.c);

      g.camera(0, 0);

      // big flash on a kid's goal, under the HUD so the HUD stays readable
      if (flash > 0) g.rect(0, 0, W, H, `rgba(255,255,255,${clamp(flash / 12, 0, 1) * 0.55})`);

      // HUD
      g.rect(0, 0, W, 18, "rgba(13,11,26,0.65)");
      g.text(`${KID_TIER.name.slice(0, 10)} ${score[0]}`, 4, 2, KID_TIER.color);
      g.text(`${score[1]} ${oppTier().name.slice(0, 10)}`, W - 4, 2, oppTier().color, { align: "right" });
      const secs = Math.ceil(halfTimer / 60);
      g.text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, W / 2, 2, PAL.white, { align: "center" });
      g.text(`HALF ${half}  ·  CUP ${matchIdx + 1}/${TEAMS.length}`, W / 2, 10, PAL.grey, { align: "center" });

      // power bar while charging a shot
      if (state === "play" && ball.owner === human && human.chargeA > 0) {
        const frac = clamp(human.chargeA / CHARGE_MAX, 0, 1);
        g.rect(W / 2 - 24, H - 12, 48, 5, PAL.dark);
        g.rect(W / 2 - 24, H - 12, 48 * frac, 5, frac > 0.75 ? PAL.red : PAL.yellow);
      }

      // overlays
      if (state === "intro") {
        g.rect(28, 86, W - 56, 50, "rgba(13,11,26,0.82)");
        g.text(`MATCH ${matchIdx + 1}`, W / 2, 94, PAL.yellow, { align: "center", size: 2 });
        g.text(msg, W / 2, 114, PAL.white, { align: "center" });
        g.text("2 HALVES — GOOD LUCK!", W / 2, 126, PAL.grey, { align: "center" });
      } else if (state === "kickoff") {
        if (frame % 30 < 20) g.text("KICK OFF!", W / 2, 100, PAL.white, { align: "center", size: 2 });
      } else if (state === "goal") {
        const bigGoal = msg === "GOAL!";
        g.text(msg, W / 2, bigGoal ? 90 : 96, bigGoal ? PAL.yellow : PAL.red, { align: "center", size: bigGoal ? (frame % 10 < 5 ? 4 : 3) : 2 });
        g.text(`${score[0]} - ${score[1]}`, W / 2, 124, PAL.white, { align: "center" });
      } else if (state === "halftime") {
        g.rect(40, 90, W - 80, 40, "rgba(13,11,26,0.82)");
        g.text("HALF-TIME", W / 2, 100, PAL.white, { align: "center", size: 2 });
        g.text(`${score[0]} - ${score[1]}`, W / 2, 118, PAL.yellow, { align: "center" });
      } else if (state === "fulltime") {
        g.rect(26, 84, W - 52, 56, "rgba(13,11,26,0.85)");
        g.text("FULL-TIME", W / 2, 92, PAL.white, { align: "center", size: 2 });
        g.text(`${score[0]} - ${score[1]}`, W / 2, 112, PAL.yellow, { align: "center" });
        g.text(msg, W / 2, 128, score[0] >= score[1] ? PAL.lime : PAL.red, { align: "center" });
      }
    },
  };
}

export const kickSoccer: RetroGameDef = {
  id: "kick-soccer",
  title: "Super Kick Soccer",
  blurb: "Score screamers in a scrolling 4-a-side cup — beat 4 teams to lift the trophy!",
  genre: "Sports",
  emoji: "⚽",
  color: "#3ecf55",
  controls: "D-pad moves your player (auto-switches to whoever's closest to the ball) · hold A to shoot — longer hold is a harder shot · B passes to a teammate, or slide-tackles to win the ball back when you don't have it",
  pad: { dpad: "4", a: "Shoot", b: "Pass" },
  create,
};
