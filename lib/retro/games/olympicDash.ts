// SUMMER GAMES — an original side-scrolling track-and-field meet in the spirit of the 8-bit
// multi-event classics (no trademarked names or logos here, just our own candy-pixel athletes).
// Tap A and B back and forth (or mash A) to build up your pace, press ▲ to clear a hurdle, and
// hold A/B then let go to aim a long jump or javelin throw. Four events, run in order, each with
// a qualifying mark to beat — miss it and the meet is over; beat it and you climb the podium.
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeShadow, hash2, outlined, shade, tinted } from "../art";

// ── layout ──
// the stadium (sky/roof/floodlights/crowd/sponsor wall/infield) gets the top ~40% of the 224px
// screen; the track gets the lower ~55% with 4 lanes tall enough to read clearly (the rest is the
// HUD's own margin). No gap between the two bands.
const PXM = 9; // pixels per metre of track/runway
const SKY_H = 25; // sky strip above the roofline (the 13px HUD covers its top, ~12px stays visible)
const CROWD_H = 70; // stand height (sky + roof + 3 crowd rows), clearly below the HUD bar
const GRASS_H = 6; // infield mow-stripe strip between the sponsor boards and the track
const TRACK_TOP = 90; // where the track/runway visuals start — ~40% down the screen
const GROUND_Y = 214; // the player's (near) lane baseline — feet stand here
const LANE_H = (GROUND_Y - TRACK_TOP) / 4; // one lane's share of the track band (31px, was ~41)
const LANE_LINES = [TRACK_TOP + LANE_H, TRACK_TOP + LANE_H * 2, TRACK_TOP + LANE_H * 3]; // dividers, far → near
const RIVAL_Y = LANE_LINES[2] - LANE_H + 16; // the rival's lane baseline, one lane back (smaller, higher)
const LANE_CENTERS = [LANE_LINES[0] - 16, LANE_LINES[1] - 16, RIVAL_Y, GROUND_Y]; // lane number / runner rows
const TRACK_COLOR = "#bb4330"; // red tartan (a real track's Mondo-red rubber, not dirt brown)
const SPRITE_H = 18; // unscaled athlete sprite height (rows): procedurally baked head/vest/legs
const PLAYER_SCALE = 1.95; // ~35px tall — a real Track & Field hero, taller than its own lane
const RIVAL_SCALE = PLAYER_SCALE; // same detailed art, same scale — just a lane further back
const CAM_OFFSET = 90; // the runner sits about a third in from the left, not pinned to the edge
const SPEED_MAX = 3.2; // fastest pace, px/frame
const BOOST_ALT = 0.13; // speed added for an A→B or B→A tap
const BOOST_SAME = 0.08; // speed added for mashing the same button twice in a row
const DECAY = 0.985; // pace fades a little every frame
const OVERRUN_PX = 34; // how far past the board/line you can run before it's an automatic foul
const FOUL_TOL = 6; // a few forgiving pixels past the board before it counts as a foul
const RUNUP_TIMEOUT = 600; // 10s — auto-attempt if nobody presses the jump button
const JUMP_WINDOW = 26; // frames a hurdle jump stays "active" after pressing ▲

// ── pixel art: a 28-32px athlete baked PROCEDURALLY (not hand-typed ASCII) — a head with hair and
//    a headband, a vest with a number bib, shorts, long bare legs ending in shoes with a spike
//    fleck, and arms that pump. The legs/arms trace a simple, classic 2D run-cycle ellipse (foot
//    sweeps back along the ground in stance, lifts and swings forward in recovery) so 8 baked
//    frames read as a real stride with knee lift, not a toy 2-pose shuffle. Baked once per kit
//    (lazily, in makeArt), never per frame — drawing is one cached sprite blit. ──
const RUN_W = 18;
const RUN_H = 22; // taller canvas so the legs get real length, not a stubby afterthought
const HIP = { x: 9, y: 13 };
const SHOULDER = { x: 9, y: 5 };
const GROUND_LOCAL = 21; // the local (unscaled) y a straight leg's foot reaches
const STRIDE = 5.8; // how far fore/aft the foot swings from the hip — an obvious, big stride
const LIFT = 5.4; // how high the foot lifts during the recovery swing
const LEG_THICK = 1.8; // ~3-4px thick once outlined
const ARM_THICK = 1.6; // ~2-3px thick once outlined
const RUN_FRAMES = 8;

/** perpendicular distance from (px,py) to the segment (x1,y1)-(x2,y2) */
function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
/** one leg's foot/knee for stride phase theta — a classic run-cycle ellipse: the foot drags back
 *  along the ground through stance (sin <= 0), then lifts and swings forward through recovery */
function legPoints(theta: number) {
  const s = Math.max(0, Math.sin(theta));
  const foot = { x: HIP.x + STRIDE * Math.cos(theta), y: GROUND_LOCAL - LIFT * s };
  const knee = { x: HIP.x + (foot.x - HIP.x) * 0.5 + 0.9 * s, y: HIP.y + (foot.y - HIP.y) * 0.42 - 1.8 * s };
  return { foot, knee };
}
function legAt(x: number, y: number, theta: number, skin: string, shoe: string): string | null {
  const { foot, knee } = legPoints(theta);
  const px = x + 0.5;
  const py = y + 0.5;
  if (segDist(px, py, HIP.x, HIP.y, knee.x, knee.y) < LEG_THICK) return skin;
  if (segDist(px, py, knee.x, knee.y, foot.x, foot.y) < LEG_THICK) return skin;
  if (Math.abs(px - foot.x) < 1.7 && py > foot.y - 0.5 && py < foot.y + 1.7) return shoe; // shoe block
  if (Math.sin(theta) < 0.15 && py >= foot.y + 1.5 && py < foot.y + 2.1 && Math.abs(px - foot.x - (Math.cos(theta) >= 0 ? 1.2 : -1.2)) < 1) {
    return shade(shoe, -0.35); // a spike fleck under the toe while the foot is planted
  }
  return null;
}
function armAt(x: number, y: number, theta: number, skin: string): string | null {
  const s = Math.max(0, -Math.sin(theta));
  const hand = { x: SHOULDER.x + 3.2 * Math.cos(theta), y: SHOULDER.y + 3.4 + 0.9 * s };
  const elbow = { x: SHOULDER.x + (hand.x - SHOULDER.x) * 0.5, y: SHOULDER.y + (hand.y - SHOULDER.y) * 0.5 };
  const px = x + 0.5;
  const py = y + 0.5;
  if (segDist(px, py, SHOULDER.x, SHOULDER.y, elbow.x, elbow.y) < ARM_THICK) return skin;
  if (segDist(px, py, elbow.x, elbow.y, hand.x, hand.y) < ARM_THICK) return skin;
  return null;
}
interface Kit {
  skin: string;
  hair: string;
  headband: string;
  vest: string;
  shorts: string;
  shoe: string;
}
const BIB = "#f3ead2"; // bib patch — always off-white, regardless of kit colour
const BIB_MARK = shade(PAL.dark, -0.2); // bib number smudge
/** the shared head/vest/shorts "base body", independent of pose — legs and arms are layered by
 *  the caller so a raised knee or a lean can draw on top of (or poke out from behind) the torso */
function paintBody(x: number, y: number, kit: Kit, leanX: number): string | null {
  const cx = SHOULDER.x + leanX;
  const hx = (x + 0.5 - cx) / 2.6;
  const hy = (y + 0.5 - 2.3) / 2.6;
  if (hx * hx + hy * hy <= 1) {
    if (y <= 1) return kit.hair;
    if (Math.abs(y - 2) < 0.6) return kit.headband;
    return kit.skin;
  }
  const tx = x - cx + SHOULDER.x;
  if (y >= 5 && y <= 9 && tx >= 3.5 && tx <= 13.5) {
    if (y === 5) return shade(kit.vest, 0.25); // shoulder highlight
    if (tx >= 7 && tx <= 10 && y >= 6 && y <= 7) return y === 6 ? BIB_MARK : BIB; // bib patch + number dot
    if (tx < 4.5 || tx > 12.5) return shade(kit.vest, -0.18); // side shading
    return kit.vest;
  }
  if (y >= 10 && y <= 12 && tx >= 4.5 && tx <= 12.5) return kit.shorts;
  return null;
}
function paintRunner(kit: Kit, legTheta: number, leanX = 0): (x: number, y: number) => string | null {
  return (x: number, y: number) => {
    const body = paintBody(x, y, kit, leanX);
    if (body) return body;
    const nearLeg = legAt(x - leanX, y, legTheta, kit.skin, kit.shoe);
    if (nearLeg) return nearLeg;
    // the far (back) leg reads clearly darker — real depth shading, not just a slightly duller tone
    const farLeg = legAt(x - leanX, y, legTheta + Math.PI, shade(kit.skin, -0.3), shade(kit.shoe, -0.3));
    if (farLeg) return farLeg;
    const nearArm = armAt(x - leanX, y, legTheta + Math.PI, kit.skin);
    if (nearArm) return nearArm;
    return armAt(x - leanX, y, legTheta, shade(kit.skin, -0.3));
  };
}
function bakeRunFrame(kit: Kit, i: number): Sprite {
  const theta = (i / RUN_FRAMES) * Math.PI * 2;
  return outlined(bake(RUN_W, RUN_H, paintRunner(kit, theta)));
}
function makeFrames(kit: Kit): Sprite[] {
  return Array.from({ length: RUN_FRAMES }, (_, i) => bakeRunFrame(kit, i));
}
/** the forward lean at the finish: body tipped 2px ahead, legs mid-stride */
function bakeLean(kit: Kit): Sprite {
  return outlined(bake(RUN_W, RUN_H, paintRunner(kit, Math.PI * 1.55, -2)));
}
/** a static crouch at the blocks: one knee down and forward, the other leg braced back */
function bakeCrouch(kit: Kit): Sprite {
  return outlined(
    bake(RUN_W, RUN_H, (x, y) => {
      const body = paintBody(x, y, kit, -1);
      if (body) return body;
      const px = x + 0.5 + 1;
      const py = y + 0.5;
      // front leg: knee bent low and forward
      if (segDist(px, py, HIP.x, HIP.y, HIP.x - 2, HIP.y + 3) < LEG_THICK) return kit.skin;
      if (segDist(px, py, HIP.x - 2, HIP.y + 3, HIP.x - 4.5, GROUND_LOCAL) < LEG_THICK) return kit.skin;
      if (Math.abs(px - (HIP.x - 4.5)) < 1.7 && py > GROUND_LOCAL - 0.5 && py < GROUND_LOCAL + 1.7) return kit.shoe;
      // back leg: braced further back, nearly straight
      const bshade = shade(kit.skin, -0.3);
      if (segDist(px, py, HIP.x, HIP.y, HIP.x + 3, HIP.y + 4) < LEG_THICK) return bshade;
      if (segDist(px, py, HIP.x + 3, HIP.y + 4, HIP.x + 5.5, GROUND_LOCAL - 1) < LEG_THICK) return bshade;
      if (Math.abs(px - (HIP.x + 5.5)) < 1.7 && py > GROUND_LOCAL - 1.5 && py < GROUND_LOCAL + 0.7) return shade(kit.shoe, -0.3);
      // one braced arm, hand down near the line
      if (segDist(px, py, SHOULDER.x, SHOULDER.y, SHOULDER.x - 1, SHOULDER.y + 4) < ARM_THICK) return kit.skin;
      if (segDist(px, py, SHOULDER.x - 1, SHOULDER.y + 4, SHOULDER.x - 2, GROUND_LOCAL - 2) < ARM_THICK) return kit.skin;
      return null;
    }),
  );
}
/** clearing a hurdle: both legs tucked up and forward, airborne */
function bakeHurdleJump(kit: Kit): Sprite {
  return outlined(
    bake(RUN_W, RUN_H, (x, y) => {
      const body = paintBody(x, y, kit, 0);
      if (body) return body;
      const px = x + 0.5;
      const py = y + 0.5;
      if (segDist(px, py, HIP.x, HIP.y, HIP.x + 4, HIP.y + 1) < LEG_THICK) return kit.skin;
      if (segDist(px, py, HIP.x + 4, HIP.y + 1, HIP.x + 6.5, HIP.y + 2) < LEG_THICK) return kit.skin;
      if (Math.abs(px - (HIP.x + 6.5)) < 1.6 && Math.abs(py - (HIP.y + 2.4)) < 1.2) return kit.shoe;
      const bshade = shade(kit.skin, -0.3);
      if (segDist(px, py, HIP.x, HIP.y, HIP.x - 3, HIP.y + 0.5) < LEG_THICK) return bshade;
      if (segDist(px, py, HIP.x - 3, HIP.y + 0.5, HIP.x - 5, HIP.y + 2.2) < LEG_THICK) return bshade;
      if (Math.abs(px - (HIP.x - 5)) < 1.6 && Math.abs(py - (HIP.y + 2.6)) < 1.2) return shade(kit.shoe, -0.3);
      if (segDist(px, py, SHOULDER.x, SHOULDER.y, SHOULDER.x + 3, SHOULDER.y - 2) < ARM_THICK) return kit.skin;
      return null;
    }),
  );
}
/** the mid-stumble sprawl after clipping a hurdle: low, off-balance, legs splayed flat */
function bakeStumble(kit: Kit): Sprite {
  return outlined(
    bake(RUN_W, RUN_H, (x, y) => {
      const body = paintBody(x, y, kit, 3);
      if (body) return body;
      const px = x + 0.5;
      const py = y + 0.5;
      if (segDist(px, py, HIP.x + 3, HIP.y + 2, HIP.x + 7, HIP.y + 4) < LEG_THICK) return kit.skin;
      if (segDist(px, py, HIP.x + 3, HIP.y + 2, HIP.x, HIP.y + 5) < LEG_THICK) return shade(kit.skin, -0.3);
      return null;
    }),
  );
}
const AP: Kit = { skin: "#ffd9a8", hair: "#3a2a1c", headband: PAL.white, vest: PAL.red, shorts: PAL.white, shoe: PAL.navy };
const RP: Kit = { skin: "#e8b488", hair: "#1c1420", headband: PAL.yellow, vest: PAL.blue, shorts: PAL.yellow, shoe: PAL.orange };

// ── big/baked art lives behind one lazy memo: the arcade imports every game's module at once, so
//    none of this runs (and no canvases get cached) until this game is actually created ──
const TILE_W = 32; // ground tiles repeat every 32px along the track/runway
const AD_H = TRACK_TOP - CROWD_H - 2 - GRASS_H; // bunting-board height between the fence and the infield strip
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
    if ((x + y * 3) % 10 === 0) return shade(base, -0.14); // rake lines combed across the pit
    const n = hash2(x + 7, y + 3, 17);
    return n > 0.9 ? shade(base, -0.18) : n < 0.12 ? shade(base, 0.16) : base;
  });
}
/** the infield lawn beyond the near lane: mowed stripes, not a flat green rect */
function bakeInfield(): Sprite {
  const base = "#2f9c57";
  return bake(TILE_W, GRASS_H, (x, y) => {
    const band = Math.floor(x / 8) % 2 === 0 ? shade(base, 0.08) : shade(base, -0.08);
    return hash2(x, y, 41) > 0.92 ? shade(band, -0.18) : band;
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
/** a knocked-flat hurdle (lying on its side) swapped in once a stumble topples it */
function bakeHurdleDown(): Sprite {
  return outlined(
    bake(18, 6, (x, y) => {
      if (y < 2) return (x + y) % 4 < 2 ? PAL.red : PAL.white;
      if (y === 2) return x % 5 < 2 ? shade(PAL.grey, -0.1) : null;
      return null;
    }),
  );
}
/** a puffy cloud, three overlapping lobes lit from the top */
function bakeCloud(): Sprite {
  return bake(18, 6, (x, y) => {
    const d1 = ((x - 4) / 5) ** 2 + ((y - 3) / 2.3) ** 2;
    const d2 = ((x - 9.5) / 6) ** 2 + ((y - 2) / 2) ** 2;
    const d3 = ((x - 14) / 4.3) ** 2 + ((y - 3.2) / 2.2) ** 2;
    if (d1 > 1 && d2 > 1 && d3 > 1) return null;
    return y < 1.6 ? "#ffffff" : "#d8e6f5";
  });
}
/** the stand's curved roof fascia: a wrap-around scalloped arch strip — light concrete/cream so it
 *  reads as a distinct structure against the navy crowd fill below it, not just more dark blue */
function bakeRoofTile(): Sprite {
  const w = 32;
  const h = 8;
  return bake(w, h, (x, y) => {
    const bump = Math.round(Math.sin((x % 16 / 16) * Math.PI) * 3);
    const top = h - 2 - bump;
    if (y < top) return null;
    if (y === top) return "#f3f0e6"; // bright lip catching the light
    if (y === top + 1) return "#c7cadb";
    return y === h - 1 ? "#5a5f78" : "#8a8fa8";
  });
}
/** a floodlight tower: a tall pole with the lamp cluster at the BOTTOM of the sprite, sized so the
 *  lit lamps sit right at the (now taller) roofline — clearly below the HUD bar, pole rising up
 *  behind it through the sky */
function bakeFloodlight(): Sprite {
  const h = SKY_H + 8;
  return bake(7, h, (x, y) => {
    const lampTop = h - 8;
    if (y >= lampTop) {
      const ly = y - lampTop;
      if (ly === 0) return x >= 0 && x <= 6 ? "#aab0d8" : null;
      if (ly <= 4) return x === 1 || x === 3 || x === 5 ? "#fff6c8" : x >= 1 && x <= 5 ? "#6068a0" : null;
      return x === 3 ? shade("#6068a0", -0.15) : null;
    }
    return x === 3 ? shade("#6068a0", -0.2) : null; // the pole, rising up behind the roof
  });
}
/** a pennant flag frame; `lean` offsets the ripple so two frames alternate into a flutter */
function bakeFlagFrame(color: string, lean: number): Sprite {
  const w = 9;
  return bake(w, 6, (x, y) => {
    const wave = Math.sin((x / w) * Math.PI + lean) * 1.3;
    const edge = 5 - x * 0.5 + wave;
    if (y > edge || y < 0) return null;
    return y < 1 ? shade(color, 0.3) : color;
  });
}
/** a big banner flag at one end of the stand (same ripple trick, 3 bold horizontal bands) */
function bakeBigFlag(a: string, b: string, c: string, lean: number): Sprite {
  const w = 20;
  return bake(w, 13, (x, y) => {
    const wave = Math.sin((x / w) * Math.PI * 1.3 + lean) * 1.7;
    const edge = 12 - x * 0.35 + wave;
    if (y > edge || y < 0) return null;
    if (y < 1) return shade(a, 0.3);
    const band = y < 4 ? a : y < 8 ? b : c;
    return x % 7 === 0 ? shade(band, -0.15) : band;
  });
}
/** a scalloped bunting banner draped along the crowd's front rail, tiled with drawStrip */
function bakeBannerTile(): Sprite {
  return bake(24, 6, (x, y) => {
    const depth = 2 + Math.abs((x % 8) - 4);
    if (y > depth) return null;
    if (y === 0) return "#fff8e8";
    return Math.floor(x / 4) % 2 === 0 ? PAL.red : PAL.white;
  });
}
/** one little crowd person, readable at ~7x8px: hair + face, a neck sliver, shoulders in a shirt
 *  colour with bare arms at the sides — and a full raised arm (shoulder to tip) when cheering */
function bakePerson(skin: string, hair: string, shirt: string, armsUp: boolean): Sprite {
  return bake(7, 8, (x, y) => {
    if (armsUp && (x === 0 || x === 6)) return y <= 5 ? skin : shirt;
    if (y <= 1) return Math.abs(x - 3) > 1.4 ? null : hair;
    if (y <= 3) return Math.abs(x - 3) > 1.6 ? null : skin;
    if (y === 4) return Math.abs(x - 3) > 0.8 ? null : shade(skin, -0.1);
    if (y <= 7) return x === 0 || x === 6 ? skin : shirt;
    return null;
  });
}
/** a tripod-mounted photo-finish camera beside the line */
function bakeCameraPost(): Sprite {
  return outlined(
    bake(10, 16, (x, y) => {
      if (y > 10) return x === 1 || x === 8 ? shade(PAL.dark, -0.1) : null;
      if (y === 10) return x >= 1 && x <= 8 ? PAL.dark : null;
      if (y >= 2 && y <= 9 && x >= 2 && x <= 7) return x === 4 && y === 5 ? PAL.cyan : y === 2 ? shade(PAL.black, 0.25) : PAL.black;
      return null;
    }),
  );
}
/** tile a textured ground sprite across a world-space span (inside an active g.camera block) */
function tileFill(g: Gfx, tile: Sprite, left: number, right: number, y: number) {
  const start = Math.floor(left / TILE_W) * TILE_W;
  for (let x = start; x < right; x += TILE_W) g.sprite(tile, x, y);
}
// crowd variety: 8 skin/hair/shirt combinations, each baked arms-down and arms-up (cheering)
const CROWD_KITS = [
  { skin: "#ffd9a8", hair: "#2a2030", shirt: PAL.yellow },
  { skin: "#caa06a", hair: PAL.red, shirt: PAL.pink },
  { skin: "#8a5a36", hair: "#1c1420", shirt: PAL.cyan },
  { skin: "#ffd9a8", hair: "#caa028", shirt: PAL.lime },
  { skin: "#caa06a", hair: "#2a2030", shirt: PAL.orange },
  { skin: "#8a5a36", hair: "#5a4330", shirt: PAL.purple },
  { skin: "#ffd9a8", hair: "#5a4330", shirt: PAL.white },
  { skin: "#caa06a", hair: "#1c1420", shirt: PAL.red },
];
function makeArt() {
  const grooves = LANE_CENTERS.map((y) => y - TRACK_TOP);
  const playerFrames = makeFrames(AP);
  const rivalFrames = makeFrames(RP);
  const playerStumble = bakeStumble(AP);
  return {
    playerFrames,
    rivalFrames,
    playerJump: bakeHurdleJump(AP),
    playerCrouch: bakeCrouch(AP),
    rivalCrouch: bakeCrouch(RP),
    playerLean: bakeLean(AP),
    rivalLean: bakeLean(RP),
    playerStumble,
    stumbleFlash: tinted(playerStumble, "#fff8e8"),
    shadow: bakeShadow(14, 5, "rgba(20,12,10,0.4)"),
    hurdle: bakeHurdle(),
    hurdleDown: bakeHurdleDown(),
    track: bakeGround(TRACK_COLOR, grooves),
    sand: bakeSand(),
    grass: bakeGrass(),
    infield: bakeInfield(),
    board: bakeBoard(),
    adPanels: { yellow: bakeAdPanel("#ffd24d"), pink: bakeAdPanel("#fe6ecf") },
    lights: [bakeLight(PAL.yellow), bakeLight(PAL.pink), bakeLight(PAL.cyan)],
    cloud: bakeCloud(),
    roof: bakeRoofTile(),
    floodlight: bakeFloodlight(),
    flags: [PAL.yellow, PAL.pink, PAL.cyan].map((c) => [bakeFlagFrame(c, 0), bakeFlagFrame(c, Math.PI)] as const),
    bigFlag: [bakeBigFlag(PAL.cyan, PAL.yellow, PAL.pink, 0), bakeBigFlag(PAL.cyan, PAL.yellow, PAL.pink, Math.PI)] as const,
    banner: bakeBannerTile(),
    cameraPost: bakeCameraPost(),
    crowd: CROWD_KITS.map((k) => [bakePerson(k.skin, k.hair, k.shirt, false), bakePerson(k.skin, k.hair, k.shirt, true)] as const),
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
  down: boolean; // toppled flat once a stumble knocks it over, for the rest of the race
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
  let crowdPulse = 0; // 0-1, spikes on a hurdle clear / medal / good jump and decays — the stand jumps with it
  let roarCd = 0; // frames until the crowd roar can fire again (throttled, scales with pace)
  let flashT = 0; // a few bright frames for the finish-line camera flash
  let tapeBroken = false; // the finish tape snaps once per race

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
  const gaitPhase = (speed: number) => Math.floor(frame * (0.12 + speed * 0.3)) % RUN_FRAMES;
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
        hurdles.push({ x: m * PXM, cleared: null, down: false });
      }
    }
    jumpT = 0;
    stumbleT = 0;
    falseStarts = 0;
    runFrames = 0;
    tapeBroken = false;
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
    flashT = 9; // the photo-finish camera catches the tape break
    io.sfx.play("pop");
    crowdPulse = Math.min(1, crowdPulse + (medal === "gold" ? 1 : medal ? 0.65 : 0.3));
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
    crowdPulse = Math.min(1, crowdPulse + (medal === "gold" ? 1 : 0.6));
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
    message = "FALSE START!"; // kept short — at the HUD's size-2 font, anything longer runs off 256px
    messageT = 55;
    io.sfx.play("hit");
    io.sfx.slide?.(1500, 700, 0.3, "sawtooth", 0.1); // the starter's whistle, calling everyone back
    phase = "marks";
    phaseT = 55;
  };
  const tryJump = () => {
    jumpT = JUMP_WINDOW;
  };
  /** a throttled crowd roar that rises with pace — never every frame, and louder the faster you go */
  const crowdRoar = (io: IO, speed: number) => {
    if (roarCd > 0 || speed < SPEED_MAX * 0.45) return;
    io.sfx.noise?.(0.35, 0.04 + speed * 0.035, 450, 1300);
    roarCd = Math.max(16, 52 - Math.floor(speed * 10));
  };

  startCard(0);

  return {
    update(io: IO) {
      frame++;
      if (messageT > 0) messageT--;
      if (shakeT > 0) shakeT--;
      if (flashT > 0) flashT--;
      if (roarCd > 0) roarCd--;
      crowdPulse *= 0.95; // the stand settles back down between cheers
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
            io.sfx.play("shoot"); // the starter's pistol
            io.sfx.noise?.(0.1, 0.18, 2400, 300);
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
          crowdRoar(io, player.pace.speed);
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
                crowdPulse = Math.min(1, crowdPulse + 0.4);
              } else {
                player.pace.speed *= 0.35;
                stumbleT = 22;
                shakeT = 10;
                hd.down = true;
                io.sfx.play("hit");
                burst(player.x, GROUND_Y, [TRACK_COLOR, PAL.tan], 8, 1.4, 0.15, 10, 20, fx);
              }
            }
          }
        }
        const finishPx = ev.meters * PXM;
        if (player.x >= finishPx) {
          if (!tapeBroken) {
            tapeBroken = true;
            burst(finishPx, GROUND_Y - SPRITE_H * PLAYER_SCALE * 0.6, [PAL.white, PAL.red], 10, 1.6, 0.08, 16, 28, fx);
          }
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
          crowdRoar(io, field.pace.speed);
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
      if (flashT > 0) g.rect(0, 0, W, H, `rgba(255,255,255,${((flashT / 9) * 0.7).toFixed(2)})`); // the photo-finish camera flash
    },
  };

  // ── drawing helpers (closures over the state above) ──
  function drawCrowd(g: Gfx, f: number) {
    // a sky strip above the roofline: the HUD covers its top, but ~12px of clear blue shows below
    // it with clouds, floodlight lamps and flags all clearly visible before the roof starts
    g.rect(0, 0, W, SKY_H, "#8fd0ff");
    g.rect(0, SKY_H - 3, W, 3, "#aee4ff");
    for (let i = 0; i < 3; i++) {
      const cx = ((((i * 96 + 24 - f * 0.07) % (W + 36)) + W + 36) % (W + 36)) - 18;
      g.sprite(A.cloud, cx, 14 + (i % 2) * 3);
    }
    // the lamp cluster sits at the BOTTOM of the floodlight sprite, right at the roofline — clear
    // of the HUD even though the pole rises up behind it
    for (let i = 0; i < 4; i++) g.sprite(A.floodlight, 18 + i * 76, 0);
    const [flagA, flagB] = A.flags[0];
    g.sprite(f % 26 < 13 ? flagA : flagB, 52, 17);
    const [flagC, flagD] = A.flags[2];
    g.sprite(f % 22 < 11 ? flagD : flagC, 170, 17);
    // the stand's curved roof, scalloped and lit on the lip — light concrete, not more dark blue —
    // tiled across the whole width, clearly below the sky
    const roofY = SKY_H - 1;
    for (let x = 0; x < W; x += 32) g.sprite(A.roof, x, roofY);
    const crowdTop = roofY + 8; // right under the roof's shadow edge
    // a navy fill behind the crowd (not a flat gradient alone — the people read against it)
    g.rect(0, crowdTop, W, CROWD_H - crowdTop, "#213a74");
    // 3 rows of real little people (7x8px — head, shoulders, arms all readable): varied
    // skin/hair/shirt, swaying, some arms-up and cheering — the whole stand bounces harder and
    // waves more arms the more excited `crowdPulse` is
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 20; i++) {
        const x = i * 13 + (row % 2) * 6 - 6;
        if (x < -8 || x > W + 4) continue;
        const kit = A.crowd[(i * 3 + row * 7) % A.crowd.length];
        const wave = Math.sin(f * 0.09 - i * 0.4 + row * 0.6);
        const cheer = crowdPulse > 0.12 && hash2(i, row, 3) < 0.2 + crowdPulse * 0.55;
        const bob = wave * (1.6 + crowdPulse * 2.4) - (cheer ? crowdPulse * 3 : 0);
        g.sprite(cheer ? kit[1] : kit[0], x, crowdTop + row * 12 + bob);
      }
    }
    // a scalloped bunting banner draped along the crowd's front rail, then a big flag at one end
    for (let x = 0; x < W; x += 24) g.sprite(A.banner, x, CROWD_H - 10);
    g.sprite(f % 24 < 12 ? A.bigFlag[0] : A.bigFlag[1], W - 32, crowdTop - 3);
    // a wood-grained fence tile, then the sponsor-board wall, then a striped infield lawn beyond
    for (let x = 0; x < W; x += 16) g.sprite(A.board, x, CROWD_H - 6);
    g.rect(0, CROWD_H, W, TRACK_TOP - CROWD_H, "#1f8a5c");
    for (let i = 0; i < 10; i++) {
      const x = (((i * 32 - f * 0.4) % 320) + 320) % 320 - 32;
      g.sprite(i % 2 ? A.adPanels.yellow : A.adPanels.pink, x, CROWD_H + 2);
    }
    for (let x = 0; x < W; x += TILE_W) g.sprite(A.infield, x, TRACK_TOP - GRASS_H);
  }

  function drawRunnerPose(g: Gfx, x: number, baselineY: number, speed: number, stumbling: boolean, jumping: number, frames: Sprite[], scale: number, flashing = false, override?: Sprite) {
    let spr: Sprite;
    const idx = Math.floor(frame * (0.12 + speed * 0.3)) % frames.length;
    if (override) spr = override;
    else if (stumbling) spr = flashing && frame % 4 < 2 ? A.stumbleFlash : A.playerStumble;
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
  /** a small painted plate with a bold lane number, one per lane, centred in that lane's band */
  function lanePlates(g: Gfx, camX: number, worldX: number) {
    const sx = worldX - camX;
    if (sx < -14 || sx > W + 14) return;
    for (let i = 0; i < 4; i++) {
      const y = TRACK_TOP + LANE_H * (i + 0.5);
      g.rect(sx - 7, y - 6, 14, 9, "rgba(18,12,8,0.4)");
      g.text(`${i + 1}`, sx, y - 4, "rgba(255,255,255,0.85)", { align: "center" });
    }
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
    // lane-number plates repeat every 40m down the track (not just once at the start) so they
    // keep scrolling past and reinforce the sense of speed, the same way the distance markers do
    for (let m = 0; m * 40 * PXM < trackLen + 80; m++) lanePlates(g, camX, m * 40 * PXM + 14);
    // finish line: a tall checkered post, a photo-finish camera on its tripod, and a tape across
    // the lanes that snaps into fluttering fx debris the instant the player crosses it
    for (let i = 0; i < 10; i++) g.rect(trackLen + 2, TRACK_TOP + i * ((H - TRACK_TOP) / 10), 5, (H - TRACK_TOP) / 10 - 1, i % 2 ? PAL.black : PAL.white);
    g.sprite(A.cameraPost, trackLen + 10, GROUND_Y - 18);
    if (!tapeBroken) for (let ty = TRACK_TOP + 6; ty < GROUND_Y - 8; ty += 6) g.rect(trackLen - 1, ty, 2, 4, Math.floor(ty / 6) % 2 ? PAL.red : PAL.white);
    laneNumber(g, camX, trackLen - 10, TRACK_TOP - 1, "FINISH");
    if (ev.hurdles) {
      for (const hd of hurdles) {
        if (hd.x < camX - 30 || hd.x > camX + W + 30) continue;
        if (hd.down) g.sprite(A.hurdleDown, hd.x - 12, GROUND_Y - 7);
        else g.sprite(A.hurdle, hd.x - 10, GROUND_Y - 30, { scale: 1.5 });
      }
    }
    speedStreaks(g, rival.x, RIVAL_Y, rival.pace.speed, RIVAL_SCALE);
    speedStreaks(g, player.x, GROUND_Y, player.pace.speed, PLAYER_SCALE);
    const starting = phase === "marks" || phase === "set" || phase === "wait";
    const leaning = phase === "run" && stumbleT === 0 && jumpT === 0 && trackLen - player.x < 40;
    const rivalLeaning = phase === "run" && trackLen - rival.x < 40;
    drawRunnerPose(g, rival.x, RIVAL_Y, rival.pace.speed, false, 0, A.rivalFrames, RIVAL_SCALE, false, starting ? A.rivalCrouch : rivalLeaning ? A.rivalLean : undefined);
    drawRunnerPose(g, player.x, GROUND_Y, player.pace.speed, stumbleT > 0, jumpT, A.playerFrames, PLAYER_SCALE, true, starting ? A.playerCrouch : leaning ? A.playerLean : undefined);
    for (const b of fx) g.rect(b.x, b.y, 2, 2, b.c);
    g.camera(0, 0);
    // the rival can fall off either edge of the screen — point to them so they never just vanish.
    // Only once they're FULLY off-screen (clear of their own sprite width), in a small dark pill
    // parked in the sponsor-board band (screen-space, fixed) so it never lands on a world-space
    // distance marker or lane plate.
    const rivalSx = rival.x - camX;
    const gapM = Math.round(Math.abs(rival.x - player.x) / PXM);
    const pillY = CROWD_H + 2;
    if (rivalSx < -24) {
      g.rect(2, pillY, 72, 10, "rgba(10,8,20,0.75)");
      g.text(`< RIVAL ${gapM}M`, 5, pillY + 2, PAL.white);
    } else if (rivalSx > W + 4) {
      g.rect(W - 74, pillY, 72, 10, "rgba(10,8,20,0.75)");
      g.text(`RIVAL ${gapM}M >`, W - 5, pillY + 2, PAL.white, { align: "right" });
    }
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
    if (ev.kind === "jump") g.rect(boardPx - 10, TRACK_TOP + 2, 10, H - TRACK_TOP - 4, "#caa46a"); // the take-off board itself
    g.rect(boardPx, TRACK_TOP, 3, H - TRACK_TOP, PAL.white); // foul line painted on its edge
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
        // a quick spin-glint flickering along the shaft, so the javelin reads as spinning not static
        if (frame % 3 === 0) g.line(field.flyX, field.flyY, field.flyX - Math.cos(ang) * len * 0.5, field.flyY - Math.sin(ang) * len * 0.5, "rgba(255,255,255,0.55)");
        g.line(field.flyX - Math.cos(ang) * (len + 6), field.flyY - Math.sin(ang) * (len + 6), field.flyX - Math.cos(ang) * len, field.flyY - Math.sin(ang) * len, "rgba(255,255,255,0.3)");
      } else {
        const handY = GROUND_Y - SPRITE_H * PLAYER_SCALE + 10;
        g.line(field.x + 10, handY, field.x + 32, handY - 9, "#9a6a28");
        g.circle(field.x + 32, handY - 9, 1, "#e3e8ff");
      }
    }
    if (field.best > 0) {
      const lx = boardPx + field.best * PXM;
      if (lx < camX + W + 20) {
        if (ev.kind === "jump") g.rect(lx, GROUND_Y - 10, 2, 14, PAL.red);
        // the best javelin left stuck, quivering in the grass at an angle
        else {
          g.line(lx - 8, GROUND_Y + 1, lx + 9, GROUND_Y - 15, "#9a6a28");
          g.line(lx + 4, GROUND_Y - 7, lx + 9, GROUND_Y - 15, PAL.grey);
          g.circle(lx + 9, GROUND_Y - 15, 1, "#e3e8ff");
        }
      }
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
    if (phase === "marks" || phase === "set" || phase === "wait") {
      if (phase === "marks") backedText(g, "ON YOUR MARKS...", H / 2 - 16, PAL.white, 2);
      else backedText(g, "SET...", H / 2 - 16, PAL.yellow, 2);
    } else if (phase === "go") backedText(g, "GO!", H / 2 - 20, PAL.lime, 4);
    // teach the controls during the very first race
    if (eventIdx === 0 && ev.kind === "sprint" && phase === "run" && player.x < (ev.meters * PXM) / 2 && Math.floor(frame / 15) % 2 === 0) {
      backedText(g, "TAP A B A B!", 100, PAL.white, 2); // over the empty first lane, clear of both runners
    }
    if (messageT > 0 && phase !== "result" && phase !== "fail") {
      const small = phase === "runup" || phase === "hold";
      backedText(g, message, 24, PAL.yellow, small ? 1 : 2);
    }
  }

  /** centred text on a dark panel sized to it, so it never blends into the lane markers */
  function backedText(g: Gfx, s: string, y: number, color: string, size: number) {
    const w = s.length * 6 * size + 6 * size;
    g.rect(Math.round(W / 2 - w / 2), y - 2 * size, w, 7 * size + 3 * size, "rgba(10,8,20,0.7)");
    g.text(s, W / 2, y, color, { align: "center", size });
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
