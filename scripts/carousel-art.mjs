// Turns the carousel's painted artwork (codex-carousel-art/*.png — generated pictures, kept out of
// the repo) into what the park ships: small .webp textures in public/park-assets/carousel/ and, for
// each ride animal, its traced outline in lib/park/registry/carouselArt.ts. The 3D carousel
// (lib/park/world/carousel.ts) extrudes that outline into a solid carved animal and wraps the
// picture round it.
//
//   node scripts/carousel-art.mjs [sourceDir]
import sharp from "sharp";
import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2] ?? "codex-carousel-art";
const OUT = "public/park-assets/carousel";
const REG = "lib/park/registry/carouselArt.ts";
mkdirSync(OUT, { recursive: true });

const MOUNT_PX = 640; // longest side of a ride animal's texture
const TRACE_PX = 220; // the outline is traced on a mask this big
const ALPHA_ON = 96;

/** green-screen fallback: turn a flat #00FF00 background into alpha */
function keyGreen(data, w, h) {
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    if (g > 150 && r < 110 && b < 110) data[i * 4 + 3] = 0;
  }
}

/** shave the fringe: a pixel only stays solid if its whole 3x3 neighbourhood is solid-ish, and the
 *  colour of the pixels just inside the edge is bled outwards so no halo shows at the cut */
function cleanEdge(data, w, h) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3];
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a[yy * w + xx];
          if (v < m) m = v;
        }
      out[y * w + x] = m;
    }
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = out[i] > 200 ? 255 : out[i] > 60 ? out[i] : 0;
  // bleed colour into the now-transparent rim (8 passes)
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < 8; pass++) {
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!solid[j]) continue;
          r += data[j * 4];
          g += data[j * 4 + 1];
          b += data[j * 4 + 2];
          n++;
        }
        if (n) add.push([i, r / n, g / n, b / n]);
      }
    for (const [i, r, g, b] of add) {
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      solid[i] = 1;
    }
  }
}

/** the biggest solid blob's outer boundary, as pixel-corner points (Moore tracing on a padded mask) */
function traceOutline(mask, w, h) {
  // keep only the largest 4-connected blob
  const label = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestN = 0;
  let nLab = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const stack = [s];
    label[s] = nLab;
    let n = 0;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (mask[j] && label[j] < 0) {
          label[j] = nLab;
          stack.push(j);
        }
      }
    }
    if (n > bestN) {
      bestN = n;
      best = nLab;
    }
    nLab++;
  }
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === best;
  // every unit edge between a solid and an empty cell, directed clockwise round its solid cell
  // (solid on the right of travel); they chain into closed loops — the outer one starts at the
  // top-left solid pixel's top edge. Where two loops touch at a corner, turn right (stay with the
  // same solid cell).
  const W1 = w + 1;
  const outEdges = new Map(); // corner index -> [dir, ...]   dir: 0 right, 1 down, 2 left, 3 up
  const add = (cx, cy, dir) => {
    const k = cy * W1 + cx;
    const l = outEdges.get(k);
    if (l) l.push(dir);
    else outEdges.set(k, [dir]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x, y, 0);
      if (!on(x + 1, y)) add(x + 1, y, 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, 2);
      if (!on(x - 1, y)) add(x, y + 1, 3);
    }
  let sx = 0;
  let sy = 0;
  outer: for (sy = 0; sy < h; sy++) for (sx = 0; sx < w; sx++) if (on(sx, sy)) break outer;
  const pts = [];
  let x = sx;
  let y = sy;
  let dir = 0;
  for (let guard = 0; guard < w * h * 4; guard++) {
    pts.push([x, y]);
    if (dir === 0) x++;
    else if (dir === 1) y++;
    else if (dir === 2) x--;
    else y--;
    if (x === sx && y === sy) break;
    const opts = outEdges.get(y * W1 + x) ?? [];
    const pick = [(dir + 1) % 4, dir, (dir + 3) % 4].find((d) => opts.includes(d));
    if (pick === undefined) throw new Error("carousel-art: the outline did not close");
    dir = pick;
  }
  return pts;
}

/** Ramer–Douglas–Peucker on a closed ring */
function simplify(pts, eps) {
  const rdp = (a, b, out) => {
    let far = -1;
    let fd = eps;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * (by - ay) - (pts[i][1] - ay) * (bx - ax)) / l;
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (far < 0) return;
    rdp(a, far, out);
    out.push(far);
    rdp(far, b, out);
  };
  // split the ring at its two extreme-x points
  let i0 = 0;
  let i1 = 0;
  pts.forEach((p, i) => {
    if (p[0] < pts[i0][0]) i0 = i;
    if (p[0] > pts[i1][0]) i1 = i;
  });
  const ring = [...pts.slice(i0), ...pts.slice(0, i0)];
  const mid = (i1 - i0 + pts.length) % pts.length;
  const save = pts;
  pts = ring;
  const keep = [0];
  rdp(0, mid, keep);
  keep.push(mid);
  rdp(mid, ring.length - 1, keep);
  keep.push(ring.length - 1);
  const out = keep.map((i) => ring[i]);
  pts = save;
  return out;
}

const mounts = [];
const surfaces = {};
const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith(".png")).sort() : [];
for (const f of files) {
  const id = f.replace(/\.png$/, "");
  const img = sharp(join(SRC, f)).ensureAlpha();
  if (id.startsWith("mount-")) {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    let hasAlpha = false;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 250) hasAlpha = true;
    if (!hasAlpha) keyGreen(data, info.width, info.height);
    cleanEdge(data, info.width, info.height);
    // crop to the solid pixels
    let x0 = info.width;
    let y0 = info.height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > ALPHA_ON) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const cropped = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract({ left: x0, top: y0, width: cw, height: ch });
    const scale = MOUNT_PX / Math.max(cw, ch);
    const tw = Math.round(cw * scale);
    const th = Math.round(ch * scale);
    await cropped.clone().resize(tw, th).webp({ quality: 88, alphaQuality: 90 }).toFile(join(OUT, `${id}.webp`));
    // trace on a small mask
    const mw = Math.round((cw / Math.max(cw, ch)) * TRACE_PX);
    const mh = Math.round((ch / Math.max(cw, ch)) * TRACE_PX);
    const small = await cropped.clone().resize(mw, mh, { fit: "fill" }).raw().toBuffer();
    const mask = new Uint8Array(mw * mh);
    for (let i = 0; i < mw * mh; i++) mask[i] = small[i * 4 + 3] > ALPHA_ON ? 1 : 0;
    // simplified, then rounded off (two passes of corner-cutting): a carved edge, not pixel steps
    let ring = simplify(traceOutline(mask, mw, mh), 1.1);
    for (let pass = 0; pass < 2; pass++) {
      const next = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      ring = next;
    }
    // u right 0..1, v UP 0..1 (texture space)
    const outline = ring.map(([x, y]) => [+(x / mw).toFixed(4), +(1 - y / mh).toFixed(4)]);
    // where a rider sits: the top of the back, just behind the middle
    let seatV = 0;
    const seatU = 0.47;
    {
      const x = Math.round(seatU * mw);
      for (let y = 0; y < mh; y++)
        if (mask[y * mw + x]) {
          seatV = 1 - y / mh;
          break;
        }
    }
    // the paint colour for the carved edge: the average of the solid pixels, a little darker
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < mw * mh; i++)
      if (mask[i]) {
        r += small[i * 4];
        g += small[i * 4 + 1];
        b += small[i * 4 + 2];
        n++;
      }
    // the carved edge's own little texture: the picture with its colours flooded right out past the
    // outline and blurred, so the animal's edge takes the broad colour of whatever is beside it
    // (white flank, gold hoof) without the fine detail smearing into stripes
    {
      const e = Buffer.from(small);
      const filled = Uint8Array.from(mask);
      for (let pass = 0; pass < mw + mh; pass++) {
        const todo = [];
        for (let y = 0; y < mh; y++)
          for (let x = 0; x < mw; x++) {
            const i = y * mw + x;
            if (filled[i]) continue;
            let rr = 0;
            let gg = 0;
            let bb = 0;
            let nn = 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= mw || yy >= mh || !filled[yy * mw + xx]) continue;
              const j = yy * mw + xx;
              rr += e[j * 4];
              gg += e[j * 4 + 1];
              bb += e[j * 4 + 2];
              nn++;
            }
            if (nn) todo.push([i, rr / nn, gg / nn, bb / nn]);
          }
        if (!todo.length) break;
        for (const [i, rr, gg, bb] of todo) {
          e[i * 4] = rr;
          e[i * 4 + 1] = gg;
          e[i * 4 + 2] = bb;
          filled[i] = 1;
        }
      }
      for (let i = 0; i < mw * mh; i++) e[i * 4 + 3] = 255;
      await sharp(e, { raw: { width: mw, height: mh, channels: 4 } }).removeAlpha().blur(5).modulate({ brightness: 0.86 }).resize(96, Math.round((96 * mh) / mw)).webp({ quality: 80 }).toFile(join(OUT, `${id}-edge.webp`));
    }
    const hex = "#" + [r, g, b].map((v) => Math.round((v / n) * 0.82).toString(16).padStart(2, "0")).join("");
    mounts.push({ id, file: `${id}.webp`, edgeFile: `${id}-edge.webp`, aspect: +(cw / ch).toFixed(4), seat: [seatU, +seatV.toFixed(4)], edge: hex, outline });
    console.log(id, `${tw}x${th}`, "outline", outline.length, "points, seat v", seatV.toFixed(2), "edge", hex);
  } else {
    const meta = await img.metadata();
    const max = id === "floor" || id === "canopy" ? 512 : 1024;
    const k = max / Math.max(meta.width, meta.height);
    const w = Math.round(meta.width * k);
    const h = Math.round(meta.height * k);
    await sharp(join(SRC, f)).resize(w, h).webp({ quality: 86 }).toFile(join(OUT, `${id}.webp`));
    surfaces[id] = { file: `${id}.webp`, aspect: +(w / h).toFixed(4) };
    console.log(id, `${w}x${h}`);
  }
}

const body = `// GENERATED by scripts/carousel-art.mjs from the carousel's painted artwork — do not edit by hand.
// Each ride animal: its texture (public/park-assets/carousel/), its width/height, where a rider
// sits and the traced outline the 3D carousel extrudes into a solid carved animal (u right, v up,
// both 0..1 across the picture).
export interface CarouselMountArt {
  id: string;
  file: string;
  /** a tiny blurred copy for the carved edge */
  edgeFile: string;
  aspect: number;
  seat: [number, number];
  /** the paint colour of the carved edge */
  edge: string;
  outline: [number, number][];
}
export const CAROUSEL_MOUNT_ART: CarouselMountArt[] = ${JSON.stringify(mounts)};
export const CAROUSEL_SURFACE_ART: Record<string, { file: string; aspect: number }> = ${JSON.stringify(surfaces)};
`;
writeFileSync(REG, body);
console.log("wrote", REG, "-", mounts.length, "mounts,", Object.keys(surfaces).length, "surfaces");
