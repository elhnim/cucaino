// Packs Sunnybrook's painted townhouses (codex-world-art/villages/town-house-{a,b,c,d}) into ONE
// picture, public/park-assets/buildings/town-atlas.webp, so the whole town's houses are a single
// mesh and a single draw call (world/settlements/styles/townPainted.ts reads the same layout).
//
//   node scripts/town-atlas.mjs
//
// 2048 x 1024: four fronts 512 x 768 along the top; below them four side walls 192 x 256, the red
// tile and the slate roof coverings 256 x 256 each, and a block of cream trim.
import sharp from "sharp";
const SRC = "codex-world-art/villages/";
const fit = (file, w, h) => sharp(SRC + file).resize(w, h, { fit: "fill" }).removeAlpha().toBuffer();
const comps = [];
const names = ["a", "b", "c", "d"];
for (let i = 0; i < 4; i++) {
  comps.push({ input: await fit(`town-house-${names[i]}/front.png`, 512, 768), left: i * 512, top: 0 });
  comps.push({ input: await fit(`town-house-${names[i]}/side.png`, 192, 256), left: i * 192, top: 768 });
}
comps.push({ input: await fit("town-house-a/roof.png", 256, 256), left: 768, top: 768 });
comps.push({ input: await fit("town-house-d/roof.png", 256, 256), left: 1024, top: 768 });
comps.push({ input: await sharp({ create: { width: 128, height: 128, channels: 3, background: "#f4ecd8" } }).png().toBuffer(), left: 1280, top: 768 });
await sharp({ create: { width: 2048, height: 1024, channels: 3, background: "#f4ecd8" } }).composite(comps).webp({ quality: 82 }).toFile("public/park-assets/buildings/town-atlas.webp");
console.log("town-atlas.webp written");
