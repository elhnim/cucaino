// Packs each village's painted houses (codex-world-art/villages/) into ONE picture per village,
// public/park-assets/buildings/<village>-atlas.webp, so all of a village's houses are a single
// mesh and a single draw call. The layouts below are mirrored by the `Rect`s each village's style
// hands to world/settlements/styles/paintedHouses.ts.
//
//   node scripts/village-atlas.mjs
import sharp from "sharp";
import { existsSync } from "node:fs";
const SRC = "codex-world-art/villages/";
/** a two-strip wrap picture (1536 x 1024: front half over back half) as two atlas parts at `top` */
const wraps = (file, top) => [
  [`../shape/${file}.png`, 0, top, 1024, 341, { left: 0, top: 0, width: 1536, height: 512 }],
  [`../shape/${file}.png`, 0, top + 341, 1024, 341, { left: 0, top: 512, width: 1536, height: 512 }],
];
const ATLASES = {
  // 2048 x 1024: four fronts 512 x 768; below, four side walls 192 x 256, tile and slate 256 x 256
  town: {
    w: 2048,
    h: 1024,
    parts: [
      ...["a", "b", "c", "d"].flatMap((n, i) => [
        [`town-house-${n}/front.png`, i * 512, 0, 512, 768],
        [`town-house-${n}/side.png`, i * 192, 768, 192, 256],
      ]),
      ["town-house-a/roof.png", 768, 768, 256, 256],
      ["town-house-d/roof.png", 1024, 768, 256, 256],
    ],
    trim: [1280, 768, 128, 128],
  },
  // 1024 x 640: the stone cottage 384 x 384 and the whitewashed painted house 576 x 384; below,
  // their side walls and the slate roof 256 x 256
  highstone: {
    w: 1024,
    h: 640,
    parts: [
      ["highstone-house-a/front.png", 0, 0, 384, 384],
      ["highstone-house-b/front.png", 384, 0, 576, 384],
      ["highstone-house-a/side.png", 0, 384, 256, 256],
      ["highstone-house-b/side.png", 256, 384, 256, 256],
      ["highstone-house-a/roof.png", 512, 384, 256, 256],
    ],
    trim: [768, 384, 128, 128],
  },
  // 1024 x 640: the adobe farmhouse 576 x 384 and the red barn 448 x 298; below, their side
  // walls, the clay tiles and grey shingles 256 x 256
  farm: {
    w: 1024,
    h: 640,
    parts: [
      ["farm-adobe/front.png", 0, 0, 576, 384],
      ["farm-barn/front.png", 576, 0, 448, 298],
      ["farm-adobe/side.png", 0, 384, 256, 256],
      ["farm-barn/side.png", 256, 384, 256, 256],
      ["farm-adobe/roof.png", 512, 384, 256, 256],
      ["lakeside-hut-a/roof.png", 768, 384, 256, 256],
    ],
    trim: [576, 304, 64, 64],
  },
  // 1024 x 1620: the round huts' wrap-around walls (codex-world-art/shape/: each picture is two
  // strips, the front half over the back half) — two families, each a front and a back strip
  // 1024 x 341 — then the reed thatch 256 x 256
  lakeside: {
    w: 1024,
    h: 1620,
    parts: [...wraps("lakeside-hut-wrap-a", 0), ...wraps("lakeside-hut-wrap-b", 682), ["../materials/thatch.png", 0, 1364, 256, 256]],
    trim: [256, 1364, 128, 128],
  },
  // the same for the treehouses, under palm thatch
  treetop: {
    w: 1024,
    h: 1620,
    parts: [...wraps("treetop-cabin-wrap-a", 0), ...wraps("treetop-cabin-wrap-b", 682), ["treetop-wall/roof.png", 0, 1364, 256, 256]],
    trim: [256, 1364, 128, 128],
  },
  // 1024 x 746: the dome tent's fabric, front strip over back strip
  basecamp: {
    w: 1024,
    h: 746,
    parts: wraps("dome-tent-wrap", 0),
    trim: [0, 682, 64, 64],
    trimColour: "#e8862e",
  },
};
for (const [name, A] of Object.entries(ATLASES)) {
  const comps = [];
  if (A.parts.some(([file]) => !existsSync(SRC + file))) {
    console.log(`${name}: artwork not there yet, skipped`);
    continue;
  }
  for (const [file, left, top, w, h, crop] of A.parts) {
    // (a picture that came a different size from the one asked for is brought to it first)
    let img = sharp(SRC + file);
    if (crop) img = sharp(await img.resize(1536, 1024, { fit: "fill" }).toBuffer()).extract(crop);
    comps.push({ input: await img.resize(w, h, { fit: "fill" }).removeAlpha().toBuffer(), left, top });
  }
  const [tx, ty, tw, th] = A.trim;
  comps.push({ input: await sharp({ create: { width: tw, height: th, channels: 3, background: A.trimColour ?? "#f4ecd8" } }).png().toBuffer(), left: tx, top: ty });
  await sharp({ create: { width: A.w, height: A.h, channels: 3, background: "#f4ecd8" } }).composite(comps).webp({ quality: 82 }).toFile(`public/park-assets/buildings/${name}-atlas.webp`);
  console.log(`${name}-atlas.webp`);
}
