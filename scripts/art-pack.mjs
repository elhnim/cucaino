// Packs painted artwork (generated PNGs kept out of the repo, e.g. codex-train-art/) into the small
// .webp textures the park ships under public/park-assets/<name>/.
//
//   node scripts/art-pack.mjs <sourceDir> <outName> [maxSide=768] [smallSide=384] [small=a,b,c]
//
// Every .png in <sourceDir> (and its sub-folders, flattened as folder-file.webp) is resized so its
// longest side is at most maxSide (names listed in `small` use smallSide), keeping any transparency.
// A picture that should be transparent but came on a flat green screen is keyed.
import sharp from "sharp";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const [src, name, maxArg, smallArg, smallList] = process.argv.slice(2);
if (!src || !name) {
  console.error("usage: node scripts/art-pack.mjs <sourceDir> <outName> [maxSide] [smallSide] [small,names]");
  process.exit(1);
}
const MAX = Number(maxArg ?? 768);
const SMALL = Number(smallArg ?? 384);
const small = new Set((smallList ?? "").split(",").filter(Boolean));
const out = join("public/park-assets", name);
mkdirSync(out, { recursive: true });

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith(".png") ? [join(dir, f)] : []));
let total = 0;
for (const file of walk(src)) {
  const id = relative(src, file).replace(/\\/g, "/").replace(/\.png$/, "").replace(/\//g, "-");
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // a green screen? (the four corners are flat pure green)
  const px = (x, y) => [data[(y * info.width + x) * 4], data[(y * info.width + x) * 4 + 1], data[(y * info.width + x) * 4 + 2], data[(y * info.width + x) * 4 + 3]];
  const corners = [px(1, 1), px(info.width - 2, 1), px(1, info.height - 2), px(info.width - 2, info.height - 2)];
  const green = corners.every(([r, g, b, a]) => a > 250 && g > 200 && r < 90 && b < 90);
  if (green)
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      if (g > 150 && r < 120 && b < 120) data[i * 4 + 3] = 0;
    }
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4 * 53) if (data[i] < 250) hasAlpha = true;
  const side = small.has(id) ? SMALL : MAX;
  const k = Math.min(1, side / Math.max(info.width, info.height));
  const w = Math.round(info.width * k);
  const h = Math.round(info.height * k);
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(w, h);
  if (!hasAlpha) img = img.removeAlpha();
  const target = join(out, `${id}.webp`);
  await img.webp({ quality: 84, alphaQuality: 90 }).toFile(target);
  const size = statSync(target).size;
  total += size;
  console.log(id.padEnd(30), `${w}x${h}`, hasAlpha ? "alpha" : "     ", (size / 1024).toFixed(0) + " KB");
}
console.log("total", (total / 1024).toFixed(0), "KB ->", out);
