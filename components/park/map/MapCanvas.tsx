"use client";

// The one canvas renderer both the little HUD map and the big map draw through: a cached base
// picture (relief + biomes + water, built once per band — lib/park/map/artwork.ts) blitted with
// `drawImage`, plus a light vector overlay (trails, routes, pins, the kid) drawn fresh every frame
// directly from world-space paths, via a single canvas transform (so every path/point below is in
// plain world units — the transform, not per-point maths, does the zoom/pan/rotate). Three.js never
// enters this file or anything it imports.
import { useEffect, useRef } from "react";
import type { Camera } from "@/lib/park/map/camera";
import { bandFor, scaleOf } from "@/lib/park/map/camera";
import * as art from "@/lib/park/map/artwork";
import { ISLAND_R } from "@/lib/park/registry/island";
import { ISLAND_CENTER, ISLAND_VIEW, WORLD_EDGE } from "@/lib/park/registry/worldMap";
import { STATIONS } from "@/lib/park/registry/railway";
import { ISLAND_LANDMARKS } from "@/lib/park/registry/worldMap";
import type { ClusterResult } from "@/lib/park/map/cluster";

export const WORLD_VIEW = WORLD_EDGE + 36;

export interface MapMovers {
  tradeDots?: { id: string; x: number; z: number; mode: "cart" | "boat" }[];
  fishDots?: { id: string; x: number; z: number }[];
  petAt?: { x: number; z: number } | null;
}

export interface MapMarkerDraw extends ClusterResult {
  /** faint "?" silhouette instead of its real emoji (an undiscovered wonder/settlement/island) */
  mystery?: boolean;
  badge?: number;
  pulse?: boolean;
}

export interface TripDraw {
  /** the whole route so far, as a line (world points) */
  points: [number, number][];
  /** the next step's target, for the big arrow */
  next: { x: number; z: number } | null;
}

export interface MapCanvasProps {
  mode: "mini" | "big";
  width: number;
  height: number;
  camera: Camera;
  /** which way the kid is facing (mini map only: the picture turns, this doesn't) */
  yaw: number;
  pose: { x: number; z: number; facing: number } | null;
  markers: MapMarkerDraw[];
  movers?: MapMovers;
  trip?: TripDraw | null;
  /** 0 (full day) .. 1 (full night): a soft blue tint, following the park's own clock */
  night?: number;
  reducedMotion?: boolean;
}

function isoNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** draws one frame into `ctx`, in a (w,h) viewport. Exported so a static screenshot harness (and a
 *  future offscreen pre-render) can call it without mounting React. */
export function paintMap(ctx: CanvasRenderingContext2D, p: MapCanvasProps) {
  const { mode, width: w, height: h, camera: cam, yaw, pose, markers, movers, trip, night = 0 } = p;
  const band = bandFor(cam.view, ISLAND_VIEW, WORLD_VIEW);
  const scale = scaleOf(cam, w, h);
  const big = mode === "big";

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (!big) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.clip();
  }

  // sea
  ctx.fillStyle = "#8fd8f5";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (!big) ctx.rotate(-yaw);
  ctx.scale(scale, scale);
  ctx.translate(-cam.cx, -cam.cz);

  const px = (n: number) => n / scale; // world-unit length that reads as n screen px

  // the edge of the world (sail on past it and you come back round)
  if (big && band === "world") {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = px(3);
    ctx.setLineDash([px(14), px(10)]);
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_EDGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `900 ${px(13)}px system-ui`;
    ctx.textAlign = "center";
    ctx.lineWidth = px(5);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText("✨ the edge of the world — sail on and you come back round ✨", 0, -WORLD_EDGE - px(12));
    ctx.fillStyle = "#1f5f8a";
    ctx.fillText("✨ the edge of the world — sail on and you come back round ✨", 0, -WORLD_EDGE - px(12));
  }

  // far world (islands / sky / abyss) — only worth the ink once you can see past the big island
  if (band === "world" || (!big && Math.hypot(cam.cx, cam.cz) > ISLAND_R + 28)) {
    for (const { w: wp, beach, land, crack } of art.WORLD_SHAPES) {
      if (wp.kind === "island") {
        ctx.fillStyle = "#ffe7bf";
        ctx.fill(new Path2D(beach));
        ctx.fillStyle = wp.land ?? "#a6e8bd";
        ctx.fill(new Path2D(land));
      } else if (wp.kind === "sky") {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill(new Path2D(land));
        ctx.strokeStyle = "#b9a6ff";
        ctx.lineWidth = px(1.4);
        ctx.stroke(new Path2D(land));
      } else if (wp.kind === "abyss" && crack) {
        ctx.strokeStyle = "rgba(18,48,90,0.75)";
        ctx.lineWidth = wp.r * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(new Path2D(crack));
        ctx.strokeStyle = "rgba(5,10,26,0.8)";
        ctx.lineWidth = wp.r * 0.8;
        ctx.stroke(new Path2D(crack));
      }
    }
  }

  // beach + island
  ctx.fillStyle = "#ffe7bf";
  ctx.fill(new Path2D(art.BEACH));
  ctx.fillStyle = "#a6e8bd";
  ctx.fill(new Path2D(art.COAST));

  // relief (cached bitmaps, blitted — never rebuilt per frame): the whole-island raster is drawn
  // FIRST, always, at every zoom — full coverage, so there is never a flat fallback colour showing
  // through anywhere inside the coastline. A crisper raster (the park's own close-up, or a small
  // tile that follows the camera out in the Wildlands) is then blended on top of it, feathered at
  // its own edges (paintRelief's `feather` flag — fades to transparent over its outer ~10%), so the
  // hand-off is a soft cross-fade into the coarser layer beneath, never a hard-edged rectangle.
  const awayFromPark = cam.view > 250 || Math.hypot(cam.cx, cam.cz) >= art.TERRAIN_EXTENT - 20 || (!big && Math.hypot(cam.cx, cam.cz) > ISLAND_R + 40);
  const showIslandRelief = awayFromPark;
  // zoomed in close AND out in the Wildlands: the whole-island raster alone is much too coarse at
  // this zoom (that's the "green mush" around the Great Falls) — a small tile that follows the
  // camera adds crisp detail on top of it instead
  const useLocalRelief = awayFromPark && (band === "close" || band === "park");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.clip(new Path2D(art.COAST));
  const island = art.islandRelief();
  if (island) ctx.drawImage(island, art.islandReliefBounds.x0, art.islandReliefBounds.z0, art.islandReliefBounds.span, art.islandReliefBounds.span);
  if (useLocalRelief) {
    const tile = art.localRelief(cam.cx, cam.cz, cam.view);
    if (tile) ctx.drawImage(tile.img, tile.x0, tile.z0, tile.span, tile.span);
  } else if (!showIslandRelief) {
    const park = art.parkRelief();
    if (park) ctx.drawImage(park, art.parkReliefBounds.x0, art.parkReliefBounds.z0, art.parkReliefBounds.span, art.parkReliefBounds.span);
  }
  ctx.restore();

  if (showIslandRelief) {
    ctx.fillStyle = "#f5dcae";
    ctx.fill(new Path2D(art.WILD_RIVER_BANK));
    ctx.fill(new Path2D(art.WILD_LAKE_PATH));
    ctx.beginPath();
    ctx.arc(art.WILD_FALLS.pool.x, art.WILD_FALLS.pool.z, art.WILD_FALLS.pool.r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f5dcae";
    ctx.lineWidth = Math.max(px(22), 3.6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(art.WILD_OUTLET_PATH));
    ctx.fillStyle = "#5cbcef";
    ctx.fill(new Path2D(art.WILD_RIVER));
    ctx.fill(new Path2D(art.WILD_LAKE_PATH));
    ctx.beginPath();
    ctx.arc(art.WILD_FALLS.pool.x, art.WILD_FALLS.pool.z, art.WILD_FALLS.pool.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5cbcef";
    ctx.lineWidth = Math.max(px(16), 2.4);
    ctx.stroke(new Path2D(art.WILD_OUTLET_PATH));
    // the railway loop: a solid ballast line with little perpendicular sleepers, like a real track
    ctx.strokeStyle = "rgba(120,78,44,0.8)";
    ctx.lineWidth = px(2.2);
    ctx.lineCap = "round";
    ctx.stroke(new Path2D(art.RAIL_PATH));
    ctx.strokeStyle = "rgba(90,64,40,0.85)";
    ctx.lineWidth = px(1.1);
    for (const sl of art.RAIL_SLEEPERS) {
      ctx.beginPath();
      ctx.moveTo(sl.x1, sl.z1);
      ctx.lineTo(sl.x2, sl.z2);
      ctx.stroke();
    }
    // the traders' dirt cart road and the settlements' own footpaths: dotted brown lines (the sea
    // route is just the moving boat dots below — see artwork.ts's header comment on why there's no
    // static boat-route line)
    ctx.strokeStyle = "rgba(154,122,74,0.6)";
    ctx.lineWidth = px(1.8);
    ctx.lineCap = "round";
    ctx.setLineDash([px(1.4), px(2.6)]);
    ctx.stroke(new Path2D(art.CART_ROAD_PATH));
    for (const fp of art.FOOTPATH_PATHS) ctx.stroke(new Path2D(fp));
    ctx.setLineDash([]);
    // the Wildlands' own forests, as little tree-crown clusters (same technique as the park's own
    // rainforest) — only worth the ink once they're not sub-pixel (close/park/island, never World)
    if (band !== "world") {
      for (const t of art.WILD_FOREST_CLUSTERS) {
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.beginPath();
        ctx.arc(t.x + 1, t.z + 1.2, t.s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.c;
        ctx.strokeStyle = "#1f6a3a";
        ctx.lineWidth = px(0.6);
        ctx.beginPath();
        ctx.arc(t.x, t.z, t.s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // the two named summits: a little triangle peak with a snow cap, not a whole mountain model
      for (const pk of art.MOUNTAIN_PEAKS) {
        const r = Math.max(px(9), 7);
        ctx.fillStyle = "#8f8478";
        ctx.strokeStyle = "#5c5349";
        ctx.lineWidth = px(0.8);
        ctx.beginPath();
        ctx.moveTo(pk.x, pk.z - r);
        ctx.lineTo(pk.x + r * 0.85, pk.z + r * 0.7);
        ctx.lineTo(pk.x - r * 0.85, pk.z + r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(pk.x, pk.z - r);
        ctx.lineTo(pk.x + r * 0.4, pk.z - r * 0.1);
        ctx.lineTo(pk.x, pk.z + r * 0.1);
        ctx.lineTo(pk.x - r * 0.4, pk.z - r * 0.1);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const td of movers?.tradeDots ?? []) {
      ctx.fillStyle = td.mode === "cart" ? "#c97a3c" : "#3a7aa8";
      ctx.beginPath();
      ctx.arc(td.x, td.z, px(2.6), 0, Math.PI * 2);
      ctx.fill();
    }
    if (band === "island") {
      ctx.strokeStyle = "rgba(255,226,138,0.85)";
      ctx.fillStyle = "rgba(255,226,138,0.22)";
      ctx.lineWidth = px(2.6);
      ctx.setLineDash([px(1.5), px(2.2)]);
      const area = new Path2D(art.PARK_AREA);
      ctx.fill(area);
      ctx.stroke(area);
      ctx.setLineDash([]);
      ctx.font = `900 ${px(9)}px system-ui`;
      ctx.textAlign = "center";
      ctx.lineWidth = px(2.6);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText("🍭 Cucaino Park", 0, -ISLAND_R - px(16));
      ctx.fillStyle = "#8a5a1a";
      ctx.fillText("🍭 Cucaino Park", 0, -ISLAND_R - px(16));
    }
    for (const lm of ISLAND_LANDMARKS) drawLabel(ctx, lm.x, lm.z, lm.emoji, lm.name, px, true);
    for (const rl of art.REGION_LABELS) drawLabel(ctx, rl.x, rl.z, rl.emoji, rl.name, px, true);
    // every Wildlands station except Park Station (drawn below, unconditionally — it's right by
    // the park and the kart circuit, so it needs to show at the park's own close zoom too)
    for (const st of STATIONS) {
      if (st.id === "park-station") continue;
      ctx.fillStyle = "#fff7e8";
      ctx.strokeStyle = "#8a5a34";
      ctx.lineWidth = px(1.6);
      ctx.beginPath();
      ctx.arc(st.x, st.z, px(7), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawEmoji(ctx, st.x, st.z + px(3), st.emoji, px(8.5));
      if (big) drawLabel(ctx, st.x, st.z, "", st.name, px, false, 16);
    }
  }

  // Park Station: unconditional (not gated by showIslandRelief) — it sits just outside the park,
  // right by the kart circuit, and both need to show together at a close zoom on that area, not
  // only once the Wildlands' own wide relief/detail band kicks in
  {
    const parkStation = STATIONS.find((s) => s.id === "park-station");
    if (parkStation) {
      ctx.fillStyle = "#fff7e8";
      ctx.strokeStyle = "#8a5a34";
      ctx.lineWidth = px(1.6);
      ctx.beginPath();
      ctx.arc(parkStation.x, parkStation.z, px(7), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawEmoji(ctx, parkStation.x, parkStation.z + px(3), parkStation.emoji, px(8.5));
      if (big) drawLabel(ctx, parkStation.x, parkStation.z, "", parkStation.name, px, false, 16);
    }
  }
  // the kart circuit: its real track outline, a dark asphalt ribbon with a dashed centreline —
  // never a generic land disc (see artwork.ts's KART_TRACK_PATH comment). Also unconditional, for
  // the same reason as Park Station just above.
  ctx.strokeStyle = "#4a4a52";
  ctx.lineWidth = Math.max(px(art.KART_TRACK_WIDTH), 2.4);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(art.KART_TRACK_PATH));
  ctx.strokeStyle = "rgba(255,221,110,0.85)";
  ctx.lineWidth = px(0.8);
  ctx.setLineDash([px(2.2), px(2.2)]);
  ctx.stroke(new Path2D(art.KART_TRACK_PATH));
  ctx.setLineDash([]);
  ctx.fillStyle = "#fff7e8";
  ctx.strokeStyle = "#8a5a34";
  ctx.lineWidth = px(1.6);
  ctx.beginPath();
  ctx.arc(art.KART_PIN.x, art.KART_PIN.z, px(7), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawEmoji(ctx, art.KART_PIN.x, art.KART_PIN.z + px(3), art.KART_PIN.emoji, px(8.5));
  if (big) drawLabel(ctx, art.KART_PIN.x, art.KART_PIN.z, "", art.KART_PIN.name, px, false, 16);

  // Rainbow Falls' mesa, river, lake, falls (the park's own close detail)
  ctx.fillStyle = "#a88a70";
  ctx.strokeStyle = "#7a5e4a";
  ctx.lineWidth = px(1.2);
  const mesa = new Path2D(art.MESA_PATH);
  ctx.fill(mesa);
  ctx.stroke(mesa);
  ctx.fillStyle = "#f5dcae";
  ctx.fill(new Path2D(art.RIVER_BANK));
  ctx.fill(new Path2D(art.LAKE_PATH));
  ctx.strokeStyle = "#f5dcae";
  ctx.lineWidth = art.OUTLET_HALF * 2 + 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(art.OUTLET_PATH));
  ctx.beginPath();
  ctx.arc(art.FALLS.pool.x, art.FALLS.pool.z, art.FALLS.pool.r + 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5cbcef";
  ctx.fill(new Path2D(art.RIVER));
  ctx.fill(new Path2D(art.LAKE_PATH));
  ctx.strokeStyle = "#5cbcef";
  ctx.lineWidth = art.OUTLET_HALF * 2;
  ctx.stroke(new Path2D(art.OUTLET_PATH));
  ctx.beginPath();
  ctx.arc(art.FALLS.pool.x, art.FALLS.pool.z, art.FALLS.pool.r, 0, Math.PI * 2);
  ctx.fill();

  for (const b of art.BRIDGES) {
    ctx.strokeStyle = "#b07a44";
    ctx.lineWidth = px(3.2);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x - Math.sin(b.heading) * b.span * 0.5, b.z - Math.cos(b.heading) * b.span * 0.5);
    ctx.lineTo(b.x + Math.sin(b.heading) * b.span * 0.5, b.z + Math.cos(b.heading) * b.span * 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = "#b07a44";
  ctx.lineWidth = px(2.6);
  ctx.beginPath();
  ctx.moveTo(art.JETTY.ax, art.JETTY.az);
  ctx.lineTo(art.JETTY.bx, art.JETTY.bz);
  ctx.stroke();

  if (band === "close" || band === "park") {
    for (const t of art.JUNGLE_TREES) {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.arc(t.x + 0.8, t.z + 1, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.c;
      ctx.strokeStyle = "#1f6a3a";
      ctx.lineWidth = px(0.6);
      ctx.beginPath();
      ctx.arc(t.x, t.z, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // lands as soft blobs
  for (const { l, path } of art.LAND_SHAPES) {
    ctx.fillStyle = l.ground;
    ctx.globalAlpha = 0.92;
    ctx.fill(new Path2D(path));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = px(1.8);
    ctx.setLineDash([px(4), px(3)]);
    ctx.stroke(new Path2D(path));
    ctx.setLineDash([]);
  }
  // trails
  for (const pth of art.TRAIL_PATHS) {
    ctx.strokeStyle = "#e98fbf";
    ctx.lineWidth = px(4.2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(pth));
  }
  for (const pth of art.TRAIL_PATHS) {
    ctx.strokeStyle = "#ffd3ea";
    ctx.lineWidth = px(2.4);
    ctx.stroke(new Path2D(pth));
  }

  if (band === "close" || band === "park") {
    for (const t of art.TREES) {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.beginPath();
      ctx.arc(t.x + 0.6, t.z + 0.8, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.c;
      ctx.strokeStyle = "#3faa70";
      ctx.lineWidth = px(0.6);
      ctx.beginPath();
      ctx.arc(t.x, t.z, t.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const t of art.GLOW_TREES) {
      ctx.fillStyle = t.c;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = px(0.6);
      ctx.beginPath();
      ctx.arc(t.x, t.z, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const closeUp = band === "close" || band === "park";
  if (big && closeUp) {
    for (const pl of art.PLACE_ICONS) drawEmoji(ctx, pl.x, pl.z + px(2.5), pl.emoji, px(7));
  }
  if (big && (band === "world" || band === "island")) {
    for (const s of art.SEA_LIFE) {
      ctx.globalAlpha = 0.85;
      drawEmoji(ctx, s.x, s.z, s.e, px(11));
      ctx.globalAlpha = 1;
    }
  }

  // land names + icons: once zoomed past the park itself (Island/World bands), the dozen land
  // labels would just overlap into an unreadable knot — the Island band's own "🍭 Cucaino Park"
  // tag (above) already stands in for all of them until the kid zooms back in
  if (closeUp || !big) {
    for (const { l } of art.LAND_SHAPES) {
      drawEmoji(ctx, l.x, l.z + (big ? -px(1) : px(4)), l.emoji, big ? px(15) : px(11));
      if (big) drawLabel(ctx, l.x, l.z, "", l.name, px, false, 12);
    }
  }

  // fishing boats, far out at sea (world band only)
  if (band === "world")
    for (const f of movers?.fishDots ?? []) {
      ctx.fillStyle = "#f2ede0";
      ctx.strokeStyle = "#4a4440";
      ctx.lineWidth = px(0.7);
      ctx.beginPath();
      ctx.arc(f.x, f.z, px(2.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

  // markers (already clustered by the caller)
  for (const m of markers) {
    const scaleHint = m.count > 1 ? 1.15 : 1;
    if (m.pulse) {
      ctx.strokeStyle = "#ff2f6d";
      ctx.lineWidth = px(1.8);
      const t = (isoNow() % 1200) / 1200;
      ctx.globalAlpha = 1 - t * 0.8;
      ctx.beginPath();
      ctx.arc(m.x, m.z, px(6 + t * 6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = m.mystery ? "rgba(255,255,255,0.55)" : "#ffffff";
    ctx.strokeStyle = m.mystery ? "#c9b8d8" : "#ff9fcd";
    ctx.lineWidth = px(1.5);
    ctx.beginPath();
    ctx.arc(m.x, m.z, px(7 * scaleHint), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (m.mystery) ctx.globalAlpha = 0.6;
    drawEmoji(ctx, m.x, m.z + px(3.4), m.emoji, px(9 * scaleHint));
    ctx.globalAlpha = 1;
    // a small "?" corner badge: the silhouette hints at the KIND of thing (a village, a wonder…)
    // without spoiling what it actually is — this badge is what says "and you haven't found it yet"
    if (m.mystery) {
      ctx.fillStyle = "#8a6fd8";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = px(1);
      ctx.beginPath();
      ctx.arc(m.x - px(5.5), m.z + px(5.5), px(4.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${px(5.6)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("?", m.x - px(5.5), m.z + px(7.4));
    }
    if (m.count > 1) {
      ctx.fillStyle = "#ff2f6d";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = px(1);
      ctx.beginPath();
      ctx.arc(m.x + px(6), m.z - px(6), px(4.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${px(6)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${m.count}`, m.x + px(6), m.z - px(4));
    } else if (m.badge) {
      ctx.fillStyle = "#ff2f6d";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = px(1);
      ctx.beginPath();
      ctx.arc(m.x + px(5), m.z - px(5), px(4), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${px(5.2)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${m.badge}`, m.x + px(5), m.z - px(3.3));
    }
    if (big && (!m.mystery || m.count > 1)) drawLabel(ctx, m.x, m.z, "", m.count > 1 ? `${m.emoji} x${m.count}` : "", px, false, 15, m.mystery ? "#6a5a9e" : "#c2185b");
  }

  // the planned trip: a bright dashed line + an arrow at the next step
  if (trip && trip.points.length > 1) {
    ctx.strokeStyle = "#5ef2ff";
    ctx.lineWidth = px(2.4);
    ctx.setLineDash([px(3), px(2)]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(trip.points[0][0], trip.points[0][1]);
    for (const [x, z] of trip.points.slice(1)) ctx.lineTo(x, z);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (trip?.next) {
    ctx.fillStyle = "#5ef2ff";
    ctx.beginPath();
    ctx.arc(trip.next.x, trip.next.z, px(5), 0, Math.PI * 2);
    ctx.fill();
  }

  if (movers?.petAt) {
    ctx.fillStyle = "#ffb020";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = px(1.2);
    ctx.beginPath();
    ctx.arc(movers.petAt.x, movers.petAt.z, px(big ? 3 : 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // you are here
  if (pose) {
    const kidScale = band === "world" ? 0.8 : band === "island" ? 0.9 : band === "park" ? 0.75 : 1;
    ctx.save();
    ctx.translate(pose.x, pose.z);
    ctx.rotate(-pose.facing);
    ctx.scale(px(1) * kidScale, px(1) * kidScale);
    ctx.fillStyle = "rgba(255,79,158,0.25)";
    ctx.beginPath();
    ctx.arc(0, 0, big ? 8 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff2f8a";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (big) {
      ctx.moveTo(0, 7);
      ctx.lineTo(-5, -4.6);
      ctx.lineTo(0, -1.8);
      ctx.lineTo(5, -4.6);
    } else {
      ctx.moveTo(0, 4.2);
      ctx.lineTo(-3, -2.8);
      ctx.lineTo(0, -1.1);
      ctx.lineTo(3, -2.8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore(); // world transform

  if (night > 0) {
    ctx.fillStyle = `rgba(10,16,58,${0.58 * night})`;
    ctx.fillRect(0, 0, w, h);
    // a little moon + a scatter of stars, so "it's night" reads at a glance, not just a dimmer map
    ctx.globalAlpha = night;
    ctx.font = `${Math.min(w, h) * 0.07}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText("🌙", w - Math.min(w, h) * 0.14, Math.min(w, h) * 0.16);
    ctx.fillStyle = "#ffffff";
    let starSeed = 7;
    const starRnd = () => ((starSeed = (starSeed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 18; i++) {
      const sx = starRnd() * w;
      const sy = starRnd() * h * 0.5;
      ctx.globalAlpha = night * (0.3 + starRnd() * 0.6);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.1 + starRnd(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (big) {
    // compass
    ctx.save();
    ctx.translate(w - 24, 24);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#f0c2dc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff4f9e";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(3, 0);
    ctx.lineTo(0, 3);
    ctx.lineTo(-3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5a2350";
    ctx.font = "900 9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("N", 0, -15);
    ctx.restore();
  } else {
    // tiny N tick at the top, rotated back to true north so it still reads at a glance
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-yaw);
    ctx.translate(0, -Math.min(w, h) / 2 + 10);
    ctx.fillStyle = "#fff";
    ctx.font = "900 9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("N", 0, 4);
    ctx.restore();
  }

  ctx.restore();
}

function drawEmoji(ctx: CanvasRenderingContext2D, x: number, z: number, emoji: string, px: number) {
  ctx.font = `${px * 1.5}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(emoji, x, z);
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, z: number, emoji: string, name: string, px: (n: number) => number, big: boolean, dyPx = 15, color = "#5a2350") {
  if (emoji) drawEmoji(ctx, x, z + px(4), emoji, px(big ? 10 : 10));
  if (!name) return;
  ctx.font = `900 ${px(big ? 9 : 7.4)}px system-ui`;
  ctx.textAlign = "center";
  ctx.lineWidth = px(2.6);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(name, x, z + px(dyPx));
  ctx.fillStyle = color;
  ctx.fillText(name, x, z + px(dyPx));
}

/** React wrapper: a <canvas> kept in sync with devicePixelRatio, repainting on every prop change
 *  and — while something's animating (the pulsing quest badge) — every frame. */
export function MapCanvas(props: MapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    cv.width = Math.round(props.width * dpr);
    cv.height = Math.round(props.height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const hasPulse = props.markers.some((m) => m.pulse);
    const frame = () => {
      if (!alive) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintMap(ctx, propsRef.current);
      if (hasPulse && !props.reducedMotion) raf.current = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      alive = false;
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.width, props.height, props.camera, props.yaw, props.pose, props.markers, props.movers, props.trip, props.night, props.mode]);

  return <canvas ref={ref} style={{ width: props.width, height: props.height, display: "block", borderRadius: props.mode === "mini" ? 999 : 18 }} role="img" aria-label="Map of Cucaino Island" />;
}
