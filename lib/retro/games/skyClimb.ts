// SKY CLIMB — an endless bouncy climb into the sky. Pip the jelly-bean hops all by itself;
// steer left and right (walk off one side, pop out the other) to land on the next platform.
// Some platforms slide, some crumble, clouds puff away after one bounce and springs send you
// flying. Grab stars, ride a jetpack, bop grumpy storm puffs from above. Don't fall! (Original
// game in the spirit of endless jumpers.)
import { H, PAL, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const GRAV = 0.18;
const BOUNCE = -5.3; // ~78px jump
const SPRING = -9.2;
const PW = 32; // platform width
const HERO_W = 12;

const HP = { k: PAL.black, g: PAL.lime, d: PAL.green, w: PAL.white, p: PAL.pink };
const HERO = [
  sprite(["....kkkk....", "..kkggggkk..", ".kggggggggk.", ".kgwkggwkgk.", "kggwkggwkggk", "kgppggggppgk", "kggggkkggggk", ".kggggggggk.", ".kddggggddk.", "..kkddddkk..", "...kk..kk...", "..kkk..kkk.."], HP),
  sprite(["............", "............", "....kkkk....", "..kkggggkk..", ".kggwkgwkggk", "kggggggggggk", "kgppggggppgk", "kggggkkggggk", ".kddggggddk.", "..kkkkkkkk..", "..kk....kk..", "............"], HP),
];
const PUFF = [
  sprite(["....kkk..kkk....", "..kkdddkkdddk...", ".kddddddddddddk.", "kddwwddddwwdddk.", "kddwkddddwkddddk", "kddddddkkddddddk", ".kdddddddddddk..", "..kkdkkdkkdkk...", "...k..k..k......", "..k..k..k......."], { k: PAL.black, d: PAL.grey, w: PAL.white }),
  sprite(["....kkk..kkk....", "..kkdddkkdddk...", ".kddddddddddddk.", "kddwwddddwwdddk.", "kddkwddddkwddddk", "kddddddkkddddddk", ".kdddddddddddk..", "..kkdkkdkkdkk...", "....k..k..k.....", ".....k..k..k...."], { k: PAL.black, d: PAL.grey, w: PAL.white }),
];
const STAR = sprite(["...y...", "...y...", "yyyyyyy", ".yyoyy.", ".yy.yy.", "yy...yy", "y.....y"], { y: PAL.yellow, o: PAL.orange });
const JET = sprite([".kkkkkk.", "kooookok", "kowwooko", "kooookok", "kooookok", "kooookok", ".kk..kk.", ".rr..rr."], { k: PAL.black, o: PAL.orange, w: PAL.white, r: PAL.red });

type PKind = "normal" | "moving" | "crumble" | "spring" | "cloud";
interface Plat {
  x: number;
  y: number;
  kind: PKind;
  vx: number;
  alive: boolean;
  fall: number; // crumble: >0 once broken
  squash: number;
}
interface Item {
  x: number;
  y: number;
  kind: "star" | "jet";
  got: boolean;
}
interface Puff {
  x: number;
  y: number;
  baseX: number;
  t: number;
  alive: boolean;
  dy: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const SKY = ["#6cb6ff", "#5aa4f5", "#4a8fe8", "#6b7de0", "#8a6ad0", "#a05cb8", "#5a3a8a", "#2e2a6b", "#1b1535", "#0d0b1a"];

function create(seed: number): GameInstance {
  const r = rng(seed);
  const START_Y = H - 40;
  const hero = { x: W / 2 - 6, y: START_Y - 12, vx: 0, vy: BOUNCE, lives: 3, inv: 0, jet: 0, face: 1, squash: 0, falling: -1 };
  const plats: Plat[] = [];
  const items: Item[] = [];
  const puffs: Puff[] = [];
  const parts: Part[] = [];
  const clouds = Array.from({ length: 7 }, () => ({ x: r.range(-20, W), y: r.range(0, H), s: r.range(0.6, 1.4) }));
  const skyStars = Array.from({ length: 40 }, () => ({ x: r.range(0, W), y: r.range(0, H) }));
  let camY = 0;
  let topY = START_Y; // highest generated platform
  let best = 0; // metres scored so far
  let frame = 0;
  let over = false;

  // the starting floor: a row of platforms so nobody falls straight away
  for (let x = 0; x < W; x += PW) plats.push({ x, y: START_Y, kind: "normal", vx: 0, alive: true, fall: 0, squash: 0 });

  const heightAt = (y: number) => Math.max(0, (START_Y - y) / 4); // metres

  const generate = () => {
    while (topY > camY - 60) {
      const m = heightAt(topY);
      const gap = r.range(22, 30 + Math.min(32, m / 25));
      topY -= gap;
      const x = r.range(0, W - PW);
      let kind: PKind = "normal";
      const roll = r.next();
      if (roll < 0.07) kind = "spring";
      else if (m > 80 && roll < 0.07 + Math.min(0.35, m / 1500)) kind = "moving";
      else if (m > 180 && roll < 0.55 && r.chance(0.3)) kind = "cloud";
      plats.push({ x, y: topY, kind, vx: kind === "moving" ? r.pick([-1, 1]) * r.range(0.5, Math.min(1.6, 0.6 + m / 800)) : 0, alive: true, fall: 0, squash: 0 });
      // decoy crumbling platforms never replace the safe path, they sit between
      if (m > 120 && r.chance(Math.min(0.35, m / 1200))) plats.push({ x: r.range(0, W - PW), y: topY + gap / 2, kind: "crumble", vx: 0, alive: true, fall: 0, squash: 0 });
      if (r.chance(0.28)) items.push({ x: x + PW / 2 - 3, y: topY - 16, kind: "star", got: false });
      else if (m > 60 && kind === "normal" && r.chance(0.018)) items.push({ x: x + PW / 2 - 4, y: topY - 10, kind: "jet", got: false });
      if (m > 150 && r.chance(Math.min(0.12, 0.02 + m / 6000))) {
        const px = r.range(8, W - 24);
        puffs.push({ x: px, y: topY - gap / 2 - 5, baseX: px, t: r.range(0, 6), alive: true, dy: 0 });
      }
    }
  };
  generate();

  const burst = (x: number, y: number, n: number, colors: string[]) => {
    for (let i = 0; i < n && parts.length < 100; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.3, 1.8);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 28), color: r.pick(colors) });
    }
  };

  const hurt = (io: IO) => {
    hero.lives--;
    hero.inv = 100;
    io.sfx.play("hit");
    burst(hero.x + 6, hero.y + 6, 12, [PAL.white, PAL.grey]);
    if (hero.lives <= 0) {
      hero.falling = 0;
      io.sfx.play("die");
    }
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life--;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);

      if (hero.falling >= 0) {
        // out of lives: tumble down, then end the run
        hero.falling++;
        hero.vy = Math.min(6, hero.vy + GRAV);
        hero.y += hero.vy;
        if (hero.falling > 70) {
          over = true;
          io.gameOver();
        }
        return;
      }

      // ── steering (wraps around the edges) ──
      const want = inp.held.left ? -2.3 : inp.held.right ? 2.3 : 0;
      hero.vx += (want - hero.vx) * 0.18;
      if (want) hero.face = Math.sign(want);
      hero.x += hero.vx;
      if (hero.x < -HERO_W / 2) hero.x += W;
      if (hero.x > W - HERO_W / 2) hero.x -= W;
      hero.inv = Math.max(0, hero.inv - 1);
      hero.squash = Math.max(0, hero.squash - 1);

      const oldFeet = hero.y + 12;
      if (hero.jet > 0) {
        hero.jet--;
        hero.vy = -6;
        if (frame % 2 === 0 && parts.length < 100) parts.push({ x: hero.x + 6 + r.range(-2, 2), y: hero.y + 13, vx: r.range(-0.3, 0.3), vy: 1.5, life: 14, color: r.pick([PAL.orange, PAL.yellow, PAL.red]) });
        if (frame % 6 === 0) io.sfx.play("step");
      } else hero.vy = Math.min(7, hero.vy + GRAV);
      hero.y += hero.vy;
      const feet = hero.y + 12;

      // ── platforms ──
      for (const p of plats) {
        if (!p.alive) continue;
        p.squash = Math.max(0, p.squash - 1);
        if (p.kind === "moving") {
          p.x += p.vx;
          if (p.x < 0 || p.x > W - PW) p.vx = -p.vx;
        }
        if (p.fall > 0) {
          p.fall++;
          p.y += 2.5;
          if (p.fall > 60) p.alive = false;
          continue;
        }
        if (hero.vy > 0 && hero.jet === 0 && oldFeet <= p.y + 2 && feet >= p.y && hero.x + HERO_W - 2 > p.x && hero.x + 2 < p.x + PW) {
          if (p.kind === "crumble") {
            p.fall = 1;
            burst(p.x + PW / 2, p.y + 2, 8, [PAL.brown, PAL.tan]);
            io.sfx.play("hit");
            continue;
          }
          hero.y = p.y - 12;
          hero.vy = p.kind === "spring" ? SPRING : BOUNCE;
          hero.squash = 6;
          p.squash = 6;
          io.sfx.play(p.kind === "spring" ? "powerup" : "jump");
          if (p.kind === "cloud") {
            p.alive = false;
            burst(p.x + PW / 2, p.y + 3, 12, [PAL.white, PAL.sky]);
          }
        }
      }

      // ── items ──
      for (const it of items) {
        if (it.got) continue;
        if (overlap({ x: hero.x, y: hero.y, w: 12, h: 12 }, { x: it.x, y: it.y, w: it.kind === "jet" ? 8 : 7, h: 8 })) {
          it.got = true;
          if (it.kind === "star") {
            io.score(100);
            io.sfx.play("coin");
            burst(it.x + 3, it.y + 3, 8, [PAL.yellow, PAL.white]);
          } else {
            hero.jet = 170;
            io.score(200);
            io.sfx.play("powerup");
          }
        }
      }

      // ── storm puffs ──
      for (const e of puffs) {
        if (!e.alive) {
          e.dy += 0.2;
          e.y += e.dy;
          continue;
        }
        e.t += 0.025;
        e.x = e.baseX + Math.sin(e.t) * 30;
        const box = { x: e.x + 1, y: e.y + 1, w: 14, h: 8 };
        if (overlap({ x: hero.x + 1, y: hero.y + 1, w: 10, h: 11 }, box)) {
          if (hero.jet > 0) {
            e.alive = false;
            io.score(150);
            io.sfx.play("explode");
            burst(e.x + 8, e.y + 5, 14, [PAL.grey, PAL.white]);
          } else if (hero.vy > 0 && oldFeet <= e.y + 5) {
            e.alive = false;
            hero.vy = BOUNCE - 1;
            io.score(150);
            io.sfx.play("bounce");
            burst(e.x + 8, e.y + 5, 14, [PAL.grey, PAL.white]);
          } else if (hero.inv === 0) {
            hurt(io);
            hero.vy = Math.max(hero.vy, 1.5);
            if (hero.falling >= 0) return;
          }
        }
      }

      // ── camera climbs, never drops ──
      camY = Math.min(camY, hero.y - 90);
      const m = Math.floor(heightAt(hero.y + 12));
      if (m > best) {
        io.score((m - best) * 10);
        best = m;
      }
      generate();

      // fell off the bottom: a rescue bounce while lives remain
      if (hero.y > camY + H + 8) {
        hurt(io);
        if (hero.falling >= 0) return;
        hero.y = camY + H;
        hero.vy = -10;
        hero.inv = 120;
        io.sfx.play("powerup");
      }

      // cleanup below the screen
      const bottom = camY + H + 40;
      for (let i = plats.length - 1; i >= 0; i--) if (!plats[i].alive || plats[i].y > bottom) plats.splice(i, 1);
      for (let i = items.length - 1; i >= 0; i--) if (items[i].got || items[i].y > bottom) items.splice(i, 1);
      for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].y > bottom) puffs.splice(i, 1);
    },

    draw(g: Gfx) {
      const band = Math.min(SKY.length - 1, Math.floor(best / 250));
      g.clear(SKY[band]);
      if (band >= 6) for (const s of skyStars) g.rect(s.x, (s.y - camY * 0.05) % H, 1, 1, PAL.white);
      if (band < 3) g.circle(210, 40, 14, "#fff6a8");
      for (const c of clouds) {
        const y = ((((c.y - camY * 0.3 * c.s) % (H + 40)) + H + 40) % (H + 40)) - 20;
        g.alpha(0.5);
        g.circle(c.x, y, 10 * c.s, PAL.white);
        g.circle(c.x + 12 * c.s, y + 2, 8 * c.s, PAL.white);
        g.circle(c.x - 11 * c.s, y + 3, 7 * c.s, PAL.white);
        g.alpha(1);
      }
      g.camera(0, camY);
      for (const p of plats) {
        if (!p.alive) continue;
        const sq = p.squash ? 1 : 0;
        if (p.kind === "cloud") {
          g.circle(p.x + 8, p.y + 3 + sq, 5, PAL.white);
          g.circle(p.x + 16, p.y + 1 + sq, 6, PAL.white);
          g.circle(p.x + 24, p.y + 3 + sq, 5, PAL.white);
          continue;
        }
        const col = p.kind === "moving" ? PAL.cyan : p.kind === "crumble" ? PAL.brown : PAL.green;
        const top = p.kind === "moving" ? PAL.white : p.kind === "crumble" ? PAL.tan : PAL.lime;
        g.rect(p.x, p.y + sq, PW, 6, PAL.black);
        g.rect(p.x + 1, p.y + 1 + sq, PW - 2, 4, col);
        g.rect(p.x + 1, p.y + 1 + sq, PW - 2, 1, top);
        if (p.kind === "crumble") {
          g.rect(p.x + 10, p.y + 1, 1, 4, PAL.black);
          g.rect(p.x + 21, p.y + 1, 1, 4, PAL.black);
        }
        if (p.kind === "spring") {
          const h = p.squash ? 3 : 6;
          g.rect(p.x + 12, p.y - h, 8, h, PAL.grey);
          for (let i = 0; i < h; i += 2) g.rect(p.x + 12, p.y - h + i, 8, 1, PAL.dark);
          g.rect(p.x + 10, p.y - h - 2, 12, 2, PAL.red);
        }
      }
      for (const it of items) {
        const bob = Math.sin(frame * 0.1 + it.x) * 1.5;
        g.sprite(it.kind === "star" ? STAR : JET, it.x, it.y + bob);
      }
      for (const e of puffs) g.sprite(PUFF[Math.floor(frame / 15) % 2], e.x, e.y, { flipY: !e.alive });
      // hero
      if (!(hero.inv > 0 && Math.floor(hero.inv / 4) % 2)) {
        if (hero.jet > 0) g.sprite(JET, hero.x + (hero.face > 0 ? -5 : 9), hero.y + 3);
        g.sprite(HERO[hero.squash > 0 ? 1 : 0], hero.x, hero.y, { flipX: hero.face < 0, flipY: hero.falling >= 0 });
        // wrap ghost so Pip looks right crossing an edge
        if (hero.x > W - HERO_W) g.sprite(HERO[hero.squash > 0 ? 1 : 0], hero.x - W, hero.y, { flipX: hero.face < 0 });
        if (hero.x < 0) g.sprite(HERO[hero.squash > 0 ? 1 : 0], hero.x + W, hero.y, { flipX: hero.face < 0 });
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      g.camera(0, 0);
      // HUD
      g.rect(0, 0, W, 11, "rgba(13,11,26,0.45)");
      for (let i = 0; i < hero.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`${best} M`, W - 4, 2, PAL.white, { align: "right" });
      if (hero.jet > 0) {
        g.rect(W / 2 - 20, 4, 40, 3, PAL.dark);
        g.rect(W / 2 - 20, 4, (40 * hero.jet) / 170, 3, PAL.orange);
      }
      if (best < 3) g.text("< > STEER!", W / 2, 40, PAL.white, { align: "center" });
    },
  };
}

export const skyClimb: RetroGameDef = {
  id: "sky-climb",
  title: "Sky Climb",
  blurb: "Bounce from cloud to cloud and climb as high as you can!",
  genre: "Platformer",
  emoji: "☁️",
  color: "#6cb6ff",
  controls: "◀ ▶ steer (wrap around the sides) · bop puffs from above",
  pad: { dpad: "lr" },
  create,
};
