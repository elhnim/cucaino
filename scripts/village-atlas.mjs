// Packs each village's painted houses (codex-world-art/villages/) into ONE picture per village,
// public/park-assets/buildings/<village>-atlas.webp, so all of a village's houses are a single
// mesh and a single draw call. The layouts below are mirrored by the `Rect`s each village's style
// hands to world/settlements/styles/paintedHouses.ts.
//
//   node scripts/village-atlas.mjs
import sharp from "sharp";
const SRC = "codex-world-art/villages/";
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
};
for (const [name, A] of Object.entries(ATLASES)) {
  const comps = [];
  for (const [file, left, top, w, h] of A.parts) comps.push({ input: await sharp(SRC + file).resize(w, h, { fit: "fill" }).removeAlpha().toBuffer(), left, top });
  const [tx, ty, tw, th] = A.trim;
  comps.push({ input: await sharp({ create: { width: tw, height: th, channels: 3, background: "#f4ecd8" } }).png().toBuffer(), left: tx, top: ty });
  await sharp({ create: { width: A.w, height: A.h, channels: 3, background: "#f4ecd8" } }).composite(comps).webp({ quality: 82 }).toFile(`public/park-assets/buildings/${name}-atlas.webp`);
  console.log(`${name}-atlas.webp`);
}
