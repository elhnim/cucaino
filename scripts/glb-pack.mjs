// Shrinks a Blender-exported model for the park: dedupe, prune, quantize + meshopt-compress
// (the same treatment scripts/park-assets.mjs gives the Kenney kits).
//
//   node scripts/glb-pack.mjs <in.glb> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { statSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node scripts/glb-pack.mjs <in.glb> <out.glb>");
  process.exit(1);
}
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(src);
await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(out, doc);
const tris = doc
  .getRoot()
  .listMeshes()
  .flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
console.log(`${out}: ${tris} triangles, ${(statSync(out).size / 1024).toFixed(1)} KB (from ${(statSync(src).size / 1024).toFixed(1)} KB)`);
