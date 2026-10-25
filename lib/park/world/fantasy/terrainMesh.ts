// The island's ground colours, and (optionally) the whole field as one mesh (tools; the park
// streams its ground in chunks: terrainChunks.ts; the shaders' textures: terrainWindow.ts).
//   buildTerrainMesh()   an optional ground mesh: vertex-coloured by height/slope — meadow greens
//                        with variation, warm rock on cliffs, snow caps, sand at the coast
import { savannaK } from "../../registry/habitats";
import * as THREE from "three";
import { ISLAND_R, TRAIL_POINTS, seaDist } from "../../registry/island";
import { beachK, mesaEdgeDist, waterSdf } from "../../registry/waterways";
import { wildShelfEdgeDist } from "../../registry/wildWater";
import { groundY, slopeAt } from "../../registry/terrain";
import { settlementAt } from "../../registry/settlements";
import { EVEREST_PEAK } from "../../registry/landform";
import { canyonFootprintWeight, CANYON_BAND_STOPS, CANYON_BAND_WOBBLE, CANYON_TERRAIN_BAND_EDGE } from "../../registry/grandCanyon";
import { PARICUTIN_CONE, LAVA_FIELD_OUT, CRATER_U, paricutinFootprintWeight } from "../../registry/paricutin";

/** the one-piece mesh covers the park's own square */
const TERRAIN_EXTENT = 200;
import { col, mix } from "./geo";
import { maskAt, terrainGrassFactor, type GrassMask } from "./mask";
import { fbm2, noise2, smoothstep } from "./noise";

const GRASS_A = col("#4f8a2a");
const GRASS_B = col("#7a9a2e");
const GRASS_C = col("#2f7a4c");
const GRASS_DARK = col("#2c5a1c");
const DIRT = col("#8a6a47");
const PAVED_FAR = col("#cdbfa3");
/** Sunnybrook's cobbled square + streets (mask.ts carves the same footprint clear of grass; this
 *  is just the tint) — a cool stone grey, distinct from every trail's warm DIRT brown */
const COBBLE_GROUND = col("#9a9486");
const ROCK_A = col("#8a7a6a");
const ROCK_B = col("#6f6a7c");
const ROCK_DARK = col("#4d4450");
const SNOW = col("#eef3fa");
const SAND = col("#e2cf9a");
const WET_SAND = col("#a8946a");
const SEA_SAND = col("#f4e3b2");
const SEA_TINT = col("#5cc8bc");
const REEF_ROCK = col("#c49a8e");
const DEEP_ROCK = col("#8a9cb4");
const MESA_A = col("#7a5e4a");
const MESA_B = col("#5c4a40");
const MESA_DARK = col("#3e3430");
const MESA_MOSS = col("#3f7a2e");
// Mount Everest reads unmistakably from afar: a clean, neutral dark-grey rock (never the general
// ROCK_DARK's purple cast — the owner's own note) and a crisp, bright snow line well above it —
// scoped tightly to its own massif (see the `everestW` falloff below) so Highstone, the Lone Peak
// and every other steep slope on the island keeps its ordinary look, untouched.
const EVEREST_ROCK_A = col("#5c5c64");
const EVEREST_ROCK_B = col("#47474e");
const EVEREST_ROCK_DARK = col("#2b2b31");
const EVEREST_SNOW = col("#f6faff");
// the Grand Canyon's own local override: HEIGHT-keyed horizontal strata (so the bands line up
// across the whole canyon, like the real thing's own layered rock — never xz-keyed, which would
// scatter them into a patchwork) — red, orange, cream and purple-brown cycling up the cliffs
// (canyonStrataT), a dusty desert tan on the flatter terraces/rim (never grass-green: real Tonto
// Platform and the Esplanade are dry, dusty benches), red soil right at the rim's edge. Scoped
// tightly to the canyon's own footprint (canyonFootprintWeight), blending out at the edge exactly
// like Everest's own override above.
/** registry/grandCanyon.ts's CANYON_BAND_STOPS, pre-built into real THREE.Color objects once (not
 *  per vertex — the hex strings there are the single source of truth; the cliff-wall shader in
 *  world/grandCanyonDecor.ts reads the exact same stops via CANYON_BAND_GLSL) */
const CANYON_BAND_COLORS = CANYON_BAND_STOPS.map((s) => col(s.color));
const _canyonBand = new THREE.Color();
// Parícutin's own local override (polish round 2: the first pass read as "muddy dark red/black
// blotches" — never again): a dark GREY-BROWN cinder cone with only subtle value variation (no
// hue-shifted patches) and a ring of rust red confined to right round the crater's own rim (a
// continuous, monotonic function of radius, never a periodic band — safe from the steep-slope
// aliasing Everest/the Grand Canyon's own height-banded strata would suffer here), and a distinct,
// near-SOLID BLACK lava field apron with only the faintest rough-texture variation — no warm
// streaks baked into the ground colour at all; the warm glow is a separate, animated decor layer
// (world/paricutinDecor.ts's crater glow + crack vents), never part of the static palette, so this
// reads as one crisp, distinct black field, not a blotchy gradient. Never grass inside its own
// footprint (PARICUTIN_CONE.r * LAVA_FIELD_OUT), with a CRISP (not blotchy) cut back to ordinary
// farmland right at the edge (paricutinFootprintWeight's own narrow fade).
// (round 2's first re-check: against the near-solid-black lava apron at the cone's own foot, the
// original #5e5349/#453c34 pair crushed to the same near-black under toon shading on the unlit
// side, so the whole mountain read as one flat dark smear with no peak standing out — lightened
// well clear of the lava's own near-black so the cone itself always reads as a lighter, warmer
// grey-brown shape rising OUT of the black field, even unlit/in shadow)
const PARICUTIN_CINDER = col("#8c7f6b");
const PARICUTIN_CINDER_DARK = col("#564a3d"); // round 3: darker grey-brown base (more "cinder", less "beige lump")
const PARICUTIN_RUST = col("#a1583c");
const PARICUTIN_GULLY = col("#453a30"); // dark weathered grooves running down the flank
const PARICUTIN_SCREE_RED = col("#6e3528"); // the crater bowl's own inner-wall banding: dark red
const PARICUTIN_SCREE_GREY = col("#5a564e"); //   ...alternating with grey scree
// round 3: the lava field was "a flat, featureless pure-black void — reads as a rendering hole, not
// lava" — a real dark charcoal-grey now, with warm (ember-tinted) patches worked in via noise, never
// a flat #000. The decor layer (world/paricutinDecor.ts) adds the rock chunks, glowing cracks and
// steam on top; this is just the base ground colour under/around them.
// round 4's own re-check: "the field itself near-black brown" with rocks that didn't read against
// it — lightened a notch so it sits clearly LIGHTER than the rocks' own shaded facets
// (world/paricutinDecor.ts's buildFacetedRockGeometry, #443a33..#73665a), so the rocks' dark sides
// read as distinct shapes against the ground rather than blending into one black mass.
const PARICUTIN_LAVA = col("#584d42");
const PARICUTIN_LAVA_LIGHT = col("#6b5d4f");
const PARICUTIN_LAVA_WARM = col("#7a4e30");
const SAVANNA_GOLD = col("#c8ae66");
const SAVANNA_STRAW = col("#dccb8c");
const SAVANNA_EARTH = col("#b68c5e");
const SAVANNA_OLIVE = col("#9aa04a");
const BED_SAND = col("#cdb88a");
const BED_MUD = col("#6f7a4a");
const BED_DEEP = col("#3a5a4c");
const PEBBLE = col("#a8a090");

/** ground colour at (x, z) — shared by the mesh and anything else that wants to match it */
export function groundColor(x: number, z: number, h: number, slope: number, out: THREE.Color, mask?: GrassMask, paths = false): THREE.Color {
  const n1 = fbm2(x / 40 + 3, z / 40 - 5, 3, 2);
  const n2 = noise2(x / 13, z / 13, 7);
  // the Grand Canyon's own footprint weight, computed up front (not just down by its own override
  // block below) so the grass blend itself can be damped by it: previously the grass pattern's own
  // high-contrast dark-green/teal blotches (from n1/n2 just below) were computed completely blind to
  // the canyon, then linearly blended toward the desert band colour by canyonW lower down — in the
  // wide canyonW transition ring (canyonFootprintWeight's own ~165-unit-wide falloff) that let a
  // stray GRASS_DARK blotch show through at, say, 50% strength right next to a plain GRASS_A patch
  // at the same 50% strength, reading as a patchy two-tone "camouflage" smear — worst exactly on the
  // canyon's own flat benches/rim, where there's no slope-driven rock term to mask it. Fading the
  // grass pattern's own contrast out as canyonW rises (grassK) means the little grass that does leak
  // through the blend is a flat, quiet green rather than its own blotchy self — a soft, even colour
  // on both sides of the blend, not two conflicting patterns fighting for the same pixels.
  const canyonW = canyonFootprintWeight(x, z);
  const grassK = 1 - canyonW * 0.92;
  // meadow: lush green, patches of sun-kissed yellow-green and cool teal
  mix(GRASS_A, GRASS_B, smoothstep(0.45, 0.72, n1), out);
  out.lerp(GRASS_C, smoothstep(0.5, 0.8, n2) * 0.55 * grassK);
  out.lerp(GRASS_DARK, smoothstep(0.35, 0.1, n2) * 0.4 * grassK);
  // the Savanna (registry/habitats.ts): sun-dried golden grass, paler straw patches and a little
  // bare red earth showing through
  const sav = savannaK(x, z);
  if (sav > 0) {
    const gold = mix(SAVANNA_GOLD, SAVANNA_STRAW, smoothstep(0.4, 0.7, n1), new THREE.Color());
    gold.lerp(SAVANNA_EARTH, smoothstep(0.62, 0.86, n2) * 0.4);
    gold.lerp(SAVANNA_OLIVE, smoothstep(0.4, 0.12, n2) * 0.35);
    out.lerp(gold, sav);
  }
  // rock on steep ground (strata bands), snow on the peaks
  const rockAmt = smoothstep(0.3, 0.52, slope);
  if (rockAmt > 0) {
    const band = 0.5 + 0.5 * Math.sin(h * 1.35 + n1 * 5);
    const rock = mix(ROCK_A, ROCK_B, band, new THREE.Color()).lerp(ROCK_DARK, smoothstep(0.7, 1, slope) * 0.5 + (1 - band) * 0.15);
    out.lerp(rock, rockAmt);
  }
  // (the park's peaks are snowy from 24 m; out in the Wildlands only the high tops of the Great
  // Ridge and the lone peak are)
  const snowLine = 24 + 48 * smoothstep(260, 520, Math.hypot(x, z));
  const snow = smoothstep(snowLine, snowLine + 5, h + n2 * 3) * (1 - smoothstep(0.75, 0.95, slope));
  out.lerp(SNOW, snow);
  // Mount Everest's own local override (see EVEREST_ROCK_A's comment above)
  const everestD = Math.hypot(x - EVEREST_PEAK.x, z - EVEREST_PEAK.z) / EVEREST_PEAK.r;
  if (everestD < 1.6) {
    const everestW = 1 - smoothstep(1.0, 1.6, everestD);
    if (everestW > 0) {
      const everestRockAmt = smoothstep(0.26, 0.48, slope);
      if (everestRockAmt > 0) {
        const band2 = 0.5 + 0.5 * Math.sin(h * 0.45 + n1 * 2.2);
        const erock = mix(EVEREST_ROCK_A, EVEREST_ROCK_B, band2, new THREE.Color()).lerp(EVEREST_ROCK_DARK, smoothstep(0.62, 1, slope) * 0.55);
        out.lerp(erock, everestRockAmt * everestW);
      }
      // a crisp, high snow line (Everest's own summit, not the general Wildlands one) with a
      // little streaky variation so it reads as snowfields, not one flat cap
      const everestSnowLine = 215 + n1 * 18;
      const everestSnow = smoothstep(everestSnowLine, everestSnowLine + 14, h) * (1 - smoothstep(0.82, 0.98, slope));
      out.lerp(EVEREST_SNOW, everestSnow * everestW);
    }
  }
  // the Grand Canyon's own local override: the real stratigraphy (registry/grandCanyon.ts's
  // CANYON_BAND_STOPS — Vishnu at the bottom up to the Kaibab cap), a function of WORLD HEIGHT
  // ONLY so the bands line up perfectly horizontally across the whole canyon (never xz-keyed,
  // which would scatter them into a patchwork) — applied on the cliffs AND the flat benches alike
  // (a real Tonto Platform/Esplanade bench is coloured by its own layer, not a generic "desert"),
  // with a touch of xz noise (<1 unit of height) so the boundary reads as organic rock, not a
  // ruled line. The vertex-coloured mesh itself is too coarse to hold a crisp edge on a
  // near-vertical cliff (a single triangle can span most of one band, so Gouraud interpolation
  // blurs it into a diagonal smear) — world/grandCanyonDecor.ts's cliff-wall decor redraws the
  // dramatic faces as their own geometry with a per-FRAGMENT banded shader instead; this terrain
  // colour is what shows between/behind that decor and from far away. (canyonW itself was already
  // computed up top, alongside grassK, so the grass blend above could be damped by it too.)
  if (canyonW > 0) {
    const wobble = (n1 - 0.5) * 2 * CANYON_BAND_WOBBLE;
    _canyonBand.copy(CANYON_BAND_COLORS[0]);
    for (let i = 1; i < CANYON_BAND_STOPS.length; i++) {
      const stop = CANYON_BAND_STOPS[i];
      // round 8: CANYON_TERRAIN_BAND_EDGE (7, not the wall decor's own crisp 1.6) — see its own
      // docstring. A flat bench's own vertices rarely differ by more than a few units, so the old
      // narrow edge was a de-facto hard threshold here — a single colour swatch with a jagged
      // (per-vertex) boundary, not a blend. This one spans most of the real gap between stops.
      _canyonBand.lerp(CANYON_BAND_COLORS[i], smoothstep(stop.h - CANYON_TERRAIN_BAND_EDGE, stop.h + CANYON_TERRAIN_BAND_EDGE, h + wobble));
    }
    // round 8: "a red plastic sheet" — a flat bench used to read as one dead-flat colour swatch
    // (the old within-band streak was only n1 at up to 8%, barely visible against a huge uniform
    // area). Two layered noises now: a slower one (n1, matching the band-wobble's own field, so
    // the streaking and the band edges feel like the same rock) and a faster one (n2, the same
    // ~13-unit field the grass/rock blends already use elsewhere in this function) for finer
    // texture — together reading as real rock variation, not a sheet, at up to 22% darkening. A
    // small flat 6% darken on top of that: the canyon's own benches/floor are a little duskier
    // than the sun-blasted open desert the same palette implies at full brightness.
    const darken = smoothstep(0.3, 0.85, n1) * 0.16 + smoothstep(0.35, 0.8, n2) * 0.12;
    _canyonBand.multiplyScalar(1 - Math.min(0.3, darken) - 0.06);
    out.lerp(_canyonBand, canyonW);
  }
  // Parícutin's own local override (see PARICUTIN_CINDER's comment above). The cone's flanks are
  // genuinely steep (a real cinder cone's own angle of repose), so — unlike Everest's/the Grand
  // Canyon's own height-banded strata above — any colour term keyed to HEIGHT aliases badly there
  // (a few vertices span a big height range on a steep face, so a periodic height-band reads as
  // jagged, flickering chevrons instead of a smooth stripe). Every term here is keyed to WORLD (x,
  // z) position, or to `paricD` (radius, a smooth MONOTONIC function of position — not periodic,
  // so it never aliases either), which varies smoothly across the mesh regardless of how steep it
  // is.
  const paricD = Math.hypot(x - PARICUTIN_CONE.x, z - PARICUTIN_CONE.z) / PARICUTIN_CONE.r;
  if (paricD < LAVA_FIELD_OUT) {
    const paricW = paricutinFootprintWeight(x, z);
    if (paricW > 0) {
      if (paricD <= 1) {
        // the cone's own cinder slopes: a darker grey-brown base (round 3: "a smooth beige-brown
        // lump" — this reads more like real cinder now) with only a subtle value variation
        const cinder = mix(PARICUTIN_CINDER, PARICUTIN_CINDER_DARK, smoothstep(0.38, 0.62, n1), new THREE.Color());
        // streaks running down from the rim: a quasi-random pattern keyed on ANGLE (theta) — cheap
        // trig, no actual randomness, and safe from the steep-slope aliasing a HEIGHT-keyed band
        // would suffer (round 2's own lesson) since it never depends on h. Two independent streak
        // fields: warm rust (the real mountain's own oxidised streaks) and darker "gully" grooves
        // (erosion channels) — different frequencies/phases so they don't line up and read as one
        // repeating pattern.
        const theta = Math.atan2(x - PARICUTIN_CONE.x, z - PARICUTIN_CONE.z);
        const rustStreak = Math.sin(theta * 9 + 1.3) * 0.5 + Math.sin(theta * 17 - 0.6) * 0.3 + Math.sin(theta * 5 + 2.4) * 0.2;
        const rustMask = smoothstep(0.35, 0.72, rustStreak * 0.5 + 0.5);
        const gullyStreak = Math.sin(theta * 13 - 2.1) * 0.5 + Math.sin(theta * 23 + 1.1) * 0.3 + Math.sin(theta * 7 - 0.4) * 0.2;
        const gullyMask = smoothstep(0.4, 0.78, gullyStreak * 0.5 + 0.5);
        // rust streaks start right at the rim and fade out by mid-flank (a real drip-down stain,
        // not a band all the way to the base); gullies (erosion grooves) reach further down, almost
        // to the base, the way real weathered scree channels do
        const fromRim = Math.max(0, paricD - CRATER_U) / (1 - CRATER_U);
        const rustReach = 1 - smoothstep(0.32, 0.62, fromRim);
        const gullyReach = 1 - smoothstep(0.55, 0.92, fromRim);
        cinder.lerp(PARICUTIN_GULLY, gullyMask * gullyReach * 0.55);
        cinder.lerp(PARICUTIN_RUST, rustMask * rustReach * 0.6);
        // the crater's own inner wall: banded dark red / grey scree, a function of bowl-depth `t`
        // (monotonic — never periodic/height-keyed, so it can't alias even on the bowl's own steep
        // inner slope) — distinct from the outer flank's streaky cinder
        if (paricD <= CRATER_U) {
          const t = paricD / CRATER_U; // 0 at the floor, 1 at the rim
          const band = smoothstep(0.18, 0.4, t) * (1 - smoothstep(0.62, 0.84, t)) + smoothstep(0.84, 1, t) * 0.6;
          const scree = mix(PARICUTIN_SCREE_GREY, PARICUTIN_SCREE_RED, smoothstep(0.3, 0.75, Math.sin(t * 11 + n1 * 2) * 0.5 + 0.5), new THREE.Color());
          cinder.copy(scree.lerp(cinder, 1 - Math.min(1, band + 0.25)));
        } else {
          // right at the rim itself: a tight, bright ring of rust (the oxidised lip every real
          // cinder cone shows), a smooth monotonic bump in radius
          const rimK = smoothstep(CRATER_U * 0.78, CRATER_U, paricD) * (1 - smoothstep(CRATER_U * 1.5, CRATER_U * 2.2, paricD));
          cinder.lerp(PARICUTIN_RUST, rimK * 0.65);
        }
        out.lerp(cinder, paricW);
      } else {
        // the lava field apron: a real dark charcoal-grey (round 3: "a flat, featureless pure-black
        // void — reads as a rendering hole, not lava" — never #000 again), with warm ember-tinted
        // patches worked in via noise so it reads as cooled, textured rock, not a flat void. The
        // rock chunks, glowing cracks and steam (world/paricutinDecor.ts) sit on top of this.
        const lava = mix(PARICUTIN_LAVA, PARICUTIN_LAVA_LIGHT, smoothstep(0.4, 0.7, n2), new THREE.Color());
        const warmPatch = smoothstep(0.62, 0.85, Math.sin(x * 0.07 + z * 0.05) * 0.5 + Math.sin(x * 0.03 - z * 0.08 + 2) * 0.5 + 0.5);
        lava.lerp(PARICUTIN_LAVA_WARM, warmPatch * 0.4);
        out.lerp(lava, paricW);
      }
    }
  }
  // bare earth where the grass is carved away (trails, plaza, around places) — optional
  if (mask && paths) {
    const bare = (1 - maskAt(mask, x, z)) * terrainGrassFactor(x, z, h, slope);
    const st = settlementAt(x, z, 4);
    // (inside the park the trails, squares and pads are PAVED — the ground's shader lays the flags
    //  close up, terrainChunks.ts; this is their colour from further off — out in the Wildlands a
    //  path is still worn dirt)
    const inPark = Math.hypot(x, z) < ISLAND_R + 6;
    out.lerp(st && st.style === "town" ? COBBLE_GROUND : inPark ? PAVED_FAR : DIRT, bare * (st && st.style === "town" ? 0.92 : 0.85));
  }
  // Rainbow Falls' mesa: warm dark rock in strata, moss and ferns on its ledges and its top
  // (the park's mesa, or the Great Falls' shelf out in the Wildlands)
  const md = Math.min(mesaEdgeDist(x, z), wildShelfEdgeDist(x, z));
  if (md < 6 && h > 2) {
    const band = 0.5 + 0.5 * Math.sin(h * 0.9 + n1 * 4);
    const rock = mix(MESA_A, MESA_B, band, new THREE.Color()).lerp(MESA_DARK, smoothstep(0.75, 1, slope) * 0.45 + n2 * 0.25);
    const ledge = (1 - smoothstep(0.35, 0.7, slope)) * smoothstep(0.35, 0.6, n2 + 0.2);
    out.lerp(rock, smoothstep(5, 0, md) * Math.max(smoothstep(0.25, 0.5, slope), 0.15));
    out.lerp(MESA_MOSS, ledge * smoothstep(5, 0, md) * 0.8);
  }
  // the river's, the pool's and the lake's beds and banks: pebbly sand at the edge, olive mud
  // deeper, dark green-blue in the deep; a sandy beach below the gate
  const wsd = waterSdf(x, z);
  if (wsd < 3 && h < 3) {
    const depth = -0.25 - h;
    if (wsd < 0.2) {
      const bed = mix(BED_SAND, BED_MUD, smoothstep(0.4, 2.2, depth), new THREE.Color()).lerp(BED_DEEP, smoothstep(2.2, 5.5, depth));
      bed.lerp(PEBBLE, smoothstep(0.62, 0.8, n2) * (1 - smoothstep(0.5, 2.5, depth)) * 0.6);
      out.copy(bed);
    } else {
      out.lerp(BED_SAND, (1 - smoothstep(0.2, 2.6, wsd)) * (0.55 + beachK(x, z) * 0.45));
    }
    out.lerp(SAND, beachK(x, z) * smoothstep(3, 0, wsd) * 0.8);
  }
  // sand at the coast, wet sand under the water line
  const sd = seaDist(x, z);
  out.lerp(SAND, smoothstep(-7, -3, sd + n2 * 2));
  out.lerp(WET_SAND, smoothstep(2, 10, sd));
  // under the sea: pale lagoon sand, then reef rock on the mounds, dark on the deep wall
  if (h < -0.8 && wsd > 0.5) {
    // sand seen through water takes on the sea's colour: turquoise in the lagoon, blue deeper
    out.lerp(SEA_SAND, smoothstep(-0.8, -2.2, h));
    // (the water itself is clear turquoise now: the sand only needs a light sea tint, not grey-teal)
    out.lerp(SEA_TINT, smoothstep(-0.5, -3.2, h) * 0.3);
    out.lerp(REEF_ROCK, smoothstep(0.45, 0.62, n1) * smoothstep(-2.5, -4, h) * (1 - smoothstep(-9, -13, h)) * 0.7);
    out.lerp(DEEP_ROCK, smoothstep(-8, -18, h) * 0.75);
  }
  return out;
}

export interface TerrainMeshOptions {
  lowQuality?: boolean;
  /** pass the grass mask to paint bare earth where grass is carved away (trails, plaza, places) */
  mask?: GrassMask;
  /** paint earthy trails from TRAIL_POINTS (default false — the park draws its own paths) */
  paths?: boolean;
}

/** An optional ground mesh (the park may draw its own). ~200² segments standard, 120² low. */
export function buildTerrainMesh(opts: TerrainMeshOptions = {}): THREE.Mesh {
  const segs = opts.lowQuality ? 120 : 200;
  const size = TERRAIN_EXTENT * 2;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute("uv");
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundY(x, z);
    pos.setY(i, h);
    groundColor(x, z, h, slopeAt(x, z), c, opts.mask, opts.paths);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  if (opts.paths && !opts.mask) {
    // no mask: paint the trails directly (coarse)
    for (const pts of TRAIL_POINTS)
      for (const [px, pz] of pts) {
        const step = size / segs;
        const ci = Math.round((px + TERRAIN_EXTENT) / step);
        const cj = Math.round((pz + TERRAIN_EXTENT) / step);
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const k = (cj + dj) * (segs + 1) + (ci + di);
            if (k < 0 || k >= pos.count) continue;
            colors[k * 3] = DIRT.r;
            colors[k * 3 + 1] = DIRT.g;
            colors[k * 3 + 2] = DIRT.b;
          }
      }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = "fantasy-terrain";
  return mesh;
}
