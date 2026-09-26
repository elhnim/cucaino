import * as THREE from "three";

function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(width: number, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  return [canvas, ctx];
}

function texture(canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const result = new THREE.CanvasTexture(canvas);
  result.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  result.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  result.colorSpace = THREE.SRGBColorSpace;
  result.needsUpdate = true;
  return result;
}

// Repeat the same mark across boundaries, without consuming extra random numbers.
function tiled(ctx: CanvasRenderingContext2D, size: number, draw: () => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
  }
}

function speckle(ctx: CanvasRenderingContext2D, rng: () => number, count: number,
  x: number, y: number, width: number, height: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,250,224,0.12)" : "rgba(39,46,37,0.09)";
    const radius = 0.3 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(x + radius + rng() * (width - radius * 2),
      y + radius + rng() * (height - radius * 2), radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tint(ctx: CanvasRenderingContext2D, amount: number,
  x: number, y: number, width: number, height: number): void {
  ctx.fillStyle = amount < 0 ? `rgba(32,24,35,${-amount})` : `rgba(255,249,217,${amount})`;
  ctx.fillRect(x, y, width, height);
}

export function makeGrassTexture(seed = 101): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(512);
  const rng = random(seed);
  ctx.fillStyle = "#6ea843";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) {
    const x = rng() * 512, y = rng() * 512;
    const angle = (rng() - 0.5) * 1.9, length = 3 + rng() * 6;
    const light = rng() > 0.48;
    tiled(ctx, 512, () => {
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = light ? "rgba(181,217,95,0.65)" : "rgba(58,125,46,0.46)";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-3, 1);
      ctx.quadraticCurveTo(-4, -length / 2, -2, -length);
      ctx.moveTo(0, 1);
      ctx.quadraticCurveTo(0, -length / 2, 3, -length * 0.8);
      ctx.stroke();
    });
  }
  speckle(ctx, rng, 2200, 0, 0, 512, 512);
  for (let i = 0; i < 52; i++) {
    const x = rng() * 512, y = rng() * 512, radius = 1 + rng() * 0.5;
    ctx.fillStyle = i % 3 === 0 ? "#fff4c8" : i % 3 === 1 ? "#ffe078" : "#f6a8c4";
    tiled(ctx, 512, () => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return texture(canvas);
}

export function makeDirtPathTexture(seed = 202): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(512);
  const rng = random(seed);
  ctx.fillStyle = "#8a8275";
  ctx.fillRect(0, 0, 512, 512);
  const wash = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
  wash.addColorStop(0, "#b7ad99");
  wash.addColorStop(1, "rgba(183,173,153,0.55)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 64 + (row % 2) * 32 + 4 + rng() * 3;
      const y = row * 51.2 + 4 + rng() * 3;
      const w = 53 + rng() * 5, h = 39 + rng() * 4, shade = 61 + rng() * 14;
      tiled(ctx, 512, () => {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [12, 15, 11, 14]);
        ctx.fillStyle = `hsl(36, 18%, ${shade}%)`;
        ctx.fill();
        ctx.strokeStyle = "rgba(82,71,57,0.45)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 16);
        ctx.quadraticCurveTo(x + 6, y + 5, x + 18, y + 5);
        ctx.lineTo(x + w - 14, y + 5);
        ctx.strokeStyle = "rgba(255,247,216,0.5)";
        ctx.stroke();
      });
    }
  }
  speckle(ctx, rng, 2400, 0, 0, 512, 512);
  return texture(canvas);
}

export function makeWoodTexture(colorHex = "#a9713f", seed = 303): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(256);
  const rng = random(seed);
  for (let plank = 0; plank < 4; plank++) {
    const x = plank * 64;
    ctx.fillStyle = colorHex;
    ctx.fillRect(x, 0, 64, 256);
    tint(ctx, (rng() - 0.5) * 0.3, x, 0, 64, 256);
    const sheen = ctx.createLinearGradient(x, 0, x + 64, 0);
    sheen.addColorStop(0, "rgba(255,234,185,0.16)");
    sheen.addColorStop(0.65, "rgba(255,234,185,0)");
    sheen.addColorStop(1, "rgba(61,32,24,0.16)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x, 0, 64, 256);
    for (let line = 0; line < 38; line++) {
      const y = 4 + rng() * 248, start = x + 5 + rng() * 10;
      ctx.strokeStyle = line % 2 ? "rgba(255,226,171,0.23)" : "rgba(70,37,23,0.19)";
      ctx.lineWidth = 0.6 + rng();
      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.bezierCurveTo(x + 24, y - 3, x + 38, y + 3, x + 58, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(54,29,22,0.4)";
    ctx.fillRect(x, 0, 2, 256);
    ctx.fillStyle = "rgba(255,226,177,0.3)";
    ctx.fillRect(x + 2, 0, 1, 256);
  }
  speckle(ctx, rng, 950, 0, 0, 256, 256);
  return texture(canvas);
}

export function makeRoofTexture(colorHex: string, seed = 404): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(256);
  const rng = random(seed);
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 256, 256);
  // Each visible row starts with its own recessed top, so the last row joins the first.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * 64 + (row % 2) * 32, y = row * 32;
      const variation = (row % 2 ? -0.06 : 0.05) + (rng() - 0.5) * 0.18;
      tiled(ctx, 256, () => {
        ctx.fillStyle = "rgba(34,22,46,0.3)";
        ctx.fillRect(x, y, 64, 32);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 4);
        ctx.lineTo(x + 62, y + 4);
        ctx.lineTo(x + 62, y + 23);
        ctx.quadraticCurveTo(x + 61, y + 30, x + 51, y + 30);
        ctx.lineTo(x + 13, y + 30);
        ctx.quadraticCurveTo(x + 2, y + 30, x + 2, y + 23);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = colorHex;
        ctx.fillRect(x, y, 64, 32);
        tint(ctx, variation, x, y, 64, 32);
        const glaze = ctx.createLinearGradient(0, y + 4, 0, y + 30);
        glaze.addColorStop(0, "rgba(255,244,224,0.25)");
        glaze.addColorStop(0.65, "rgba(255,244,224,0)");
        glaze.addColorStop(1, "rgba(36,20,44,0.2)");
        ctx.fillStyle = glaze;
        ctx.fillRect(x, y, 64, 32);
        ctx.restore();
      });
    }
  }
  speckle(ctx, rng, 750, 0, 0, 256, 256);
  return texture(canvas);
}

export function makeStoneTexture(seed = 505): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(256);
  const rng = random(seed);
  ctx.fillStyle = "#6e727b";
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    const widths = [52 + rng() * 20, 52 + rng() * 20, 52 + rng() * 20];
    widths.push(256 - widths.reduce((sum, width) => sum + width, 0));
    let x = row % 2 ? -28 : 0;
    for (const width of widths) {
      const bx = x + 2, by = row * 64 + 2, w = width - 4;
      const shade = 55 + rng() * 23;
      const blockSeed = Math.floor(rng() * 4294967296);
      tiled(ctx, 256, () => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx, by, w, 60, 5);
        ctx.clip();
        ctx.fillStyle = `hsl(218, 7%, ${shade}%)`;
        ctx.fillRect(bx, by, w, 60);
        ctx.fillStyle = "rgba(255,255,246,0.26)";
        ctx.fillRect(bx + 2, by + 2, w - 4, 2);
        ctx.fillStyle = "rgba(41,47,60,0.2)";
        ctx.fillRect(bx, by + 55, w, 5);
        speckle(ctx, random(blockSeed), 100, bx, by, w, 60);
        ctx.restore();
      });
      x += width;
    }
  }
  return texture(canvas);
}

export function makeSkyGradientTexture(topHex: string, bottomHex: string): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(256, 512);
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, topHex);
  gradient.addColorStop(1, bottomHex);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 512);
  for (let cloud = 0; cloud < 4; cloud++) {
    const x = 56 + (cloud % 2) * 122, y = 66 + cloud * 72;
    for (let puff = 0; puff < 5; puff++) {
      ctx.save();
      ctx.translate(x + (puff - 2) * 15, y + Math.sin(puff * 2 + cloud) * 7);
      ctx.scale(1.5, 0.65);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
      glow.addColorStop(0, "rgba(255,255,249,0.21)");
      glow.addColorStop(0.4, "rgba(255,255,249,0.14)");
      glow.addColorStop(1, "rgba(255,255,249,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-24, -24, 48, 48);
      ctx.restore();
    }
  }
  return texture(canvas, false);
}

export function makeSparkleTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(128);
  ctx.clearRect(0, 0, 128, 128);
  const halo = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  halo.addColorStop(0, "rgba(255,251,223,0.95)");
  halo.addColorStop(0.2, "rgba(255,226,134,0.55)");
  halo.addColorStop(0.6, "rgba(255,204,104,0.12)");
  halo.addColorStop(1, "rgba(255,204,104,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 128, 128);
  const star = ctx.createRadialGradient(64, 64, 0, 64, 64, 56);
  star.addColorStop(0, "rgba(255,255,247,1)");
  star.addColorStop(0.25, "rgba(255,249,217,0.98)");
  star.addColorStop(0.65, "rgba(255,224,148,0.7)");
  star.addColorStop(1, "rgba(255,224,148,0)");
  ctx.fillStyle = star;
  ctx.beginPath();
  ctx.moveTo(64, 8);
  ctx.quadraticCurveTo(70, 56, 120, 64);
  ctx.quadraticCurveTo(70, 72, 64, 120);
  ctx.quadraticCurveTo(58, 72, 8, 64);
  ctx.quadraticCurveTo(58, 56, 64, 8);
  ctx.closePath();
  ctx.fill();
  return texture(canvas, false);
}

export function makeSoftShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(128);
  ctx.clearRect(0, 0, 128, 128);
  const shadow = ctx.createRadialGradient(64, 64, 0, 64, 64, 61);
  shadow.addColorStop(0, "rgba(0,0,0,0.65)");
  shadow.addColorStop(0.2, "rgba(0,0,0,0.6)");
  shadow.addColorStop(0.45, "rgba(0,0,0,0.39)");
  shadow.addColorStop(0.7, "rgba(0,0,0,0.14)");
  shadow.addColorStop(0.9, "rgba(0,0,0,0.025)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, 128, 128);
  return texture(canvas, false);
}

export function makeWaterTexture(seed = 606): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(512);
  const rng = random(seed);
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, "#32b6cc");
  base.addColorStop(0.5, "#40c9ce");
  base.addColorStop(1, "#32b6cc");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 65; i++) {
    const x = rng() * 512, y = rng() * 512, length = 24 + rng() * 82;
    const bend = 3 + rng() * 7;
    tiled(ctx, 512, () => {
      const fade = ctx.createLinearGradient(x, y, x + length, y);
      fade.addColorStop(0, "rgba(224,255,252,0)");
      fade.addColorStop(0.5, "rgba(224,255,252,0.42)");
      fade.addColorStop(1, "rgba(224,255,252,0)");
      ctx.strokeStyle = fade;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length / 3, y - bend, x + length * 2 / 3, y + bend, x + length, y);
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.2;
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 1;
      ctx.stroke();
    });
  }
  speckle(ctx, rng, 1300, 0, 0, 512, 512);
  for (let i = 0; i < 65; i++) {
    const x = rng() * 512, y = rng() * 512, r = 1 + rng() * 2;
    ctx.fillStyle = "rgba(236,255,248,0.65)";
    tiled(ctx, 512, () => {
      ctx.fillRect(x - r, y - 0.5, r * 2, 1);
      ctx.fillRect(x - 0.5, y - r, 1, r * 2);
    });
  }
  return texture(canvas);
}
