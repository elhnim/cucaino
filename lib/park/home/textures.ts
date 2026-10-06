// My Home: hand-painted canvas textures — wallpapers, floors, the park seen through the windows
// and the posters. Small canvases (they get stepped + inked by the diorama pass anyway).
import * as THREE from "three";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function toTexture(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * A painted picture from public/park-assets/home/ (packed by scripts/art-pack.mjs from
 * codex-world-art/home/). It arrives a moment after the room opens: until then it is `pending`,
 * and whenReady() holds off putting it on a material, so nothing flashes black.
 */
export function paintedHomeTexture(name: string, tile = false): THREE.Texture {
  const waiters: (() => void)[] = [];
  const t = new THREE.TextureLoader().load(`/park-assets/home/${name}.webp`, () => {
    t.userData.pending = false;
    for (const f of waiters.splice(0)) f();
  });
  t.userData.pending = true;
  t.userData.waiters = waiters;
  t.colorSpace = THREE.SRGBColorSpace;
  if (tile) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
/** run `f` once the texture has its picture (straight away for a drawn one) */
export function whenReady(t: THREE.Texture, f: () => void) {
  if (t.userData.pending) (t.userData.waiters as (() => void)[]).push(f);
  else f();
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.45, y - s, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.35, x, y + s * 0.35);
  g.fill();
}
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** One tile of wallpaper = 2 x 2 world units (textures repeat with world-space UVs). */
export function wallpaperTexture(id: string): THREE.Texture {
  if (id === "wp-roses") return paintedHomeTexture("wallpaper-bedroom", true);
  if (id === "wp-paws") return paintedHomeTexture("wallpaper-den", true);
  const [c, g] = canvas(128, 128);
  switch (id) {
    case "wp-stripes":
      g.fillStyle = "#fff4f8";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ffcfe1";
      for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 128);
      g.fillStyle = "#ffe6ef";
      for (let x = 16; x < 128; x += 32) g.fillRect(x + 6, 0, 4, 128);
      break;
    case "wp-dots":
      g.fillStyle = "#d8f6e8";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ffffff";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.beginPath();
        g.arc(x * 32 + (y % 2 ? 16 : 0) + 8, y * 32 + 16, 6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "wp-hearts":
      g.fillStyle = "#ffeaf3";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ff9cc4";
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) heart(g, x * 43 + (y % 2 ? 21 : 0) + 12, y * 43 + 26, 11);
      break;
    case "wp-clouds": {
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, "#a9dcff");
      grd.addColorStop(1, "#d3eeff");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ffffff";
      for (const [x, y] of [
        [30, 34],
        [94, 92],
      ]) {
        for (const [ox, oy, r] of [
          [-14, 4, 11],
          [0, -2, 15],
          [15, 4, 11],
        ]) {
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case "wp-stars":
      g.fillStyle = "#34337c";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ffe27a";
      for (const [x, y, r] of [
        [20, 22, 9],
        [86, 40, 7],
        [50, 90, 10],
        [110, 108, 6],
        [110, 12, 4],
        [14, 110, 4],
      ])
        star(g, x, y, r);
      g.fillStyle = "#c7c6ff";
      for (let i = 0; i < 14; i++) g.fillRect((i * 53) % 128, (i * 37) % 128, 2, 2);
      break;
    case "wp-leaves":
      g.fillStyle = "#e6f7d2";
      g.fillRect(0, 0, 128, 128);
      for (const [x, y, a, col] of [
        [24, 30, 0.5, "#6cc873"],
        [90, 24, -0.6, "#8fd67a"],
        [60, 80, 0.2, "#5fbf6a"],
        [110, 100, 0.9, "#8fd67a"],
        [16, 104, -0.3, "#6cc873"],
      ] as const) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(0, 0, 8, 18, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#4a9a55";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -16);
        g.lineTo(0, 16);
        g.stroke();
        g.restore();
      }
      break;
    default: {
      // buttercream: soft cream with a tiny diamond pattern
      g.fillStyle = "#fff0d4";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#f7ddb2";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 32 + (y % 2 ? 16 : 0) + 8;
        const cy = y * 32 + 16;
        g.beginPath();
        g.moveTo(cx, cy - 4);
        g.lineTo(cx + 4, cy);
        g.lineTo(cx, cy + 4);
        g.lineTo(cx - 4, cy);
        g.fill();
      }
    }
  }
  return toTexture(c);
}

/** One tile of flooring = 2 x 2 world units. */
export function floorTexture(id: string): THREE.Texture {
  if (id === "fl-wood") return paintedHomeTexture("floorboards", true);
  const [c, g] = canvas(128, 128);
  switch (id) {
    case "fl-checker":
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? "#ffc98a" : "#ffe9bf";
        g.fillRect(x * 32, y * 32, 32, 32);
      }
      break;
    case "fl-tiles":
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#bdeedd";
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
      g.fillStyle = "#a6e3cf";
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(x * 64 + 3, y * 64 + 50, 58, 11);
      break;
    case "fl-carpet":
      g.fillStyle = "#d4bfff";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#c8b0fb";
      for (let i = 0; i < 90; i++) g.fillRect((i * 71) % 128, (i * 43) % 128, 3, 3);
      break;
    case "fl-candy": {
      g.fillStyle = "#ffe0ec";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#c7ebff";
      for (let k = -128; k < 256; k += 32) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 16, 0);
        g.lineTo(k + 16 + 128, 128);
        g.lineTo(k + 128, 128);
        g.fill();
      }
      break;
    }
    default: {
      // planks: honey (fl-wood) or chocolate (fl-dark)
      const dark = id === "fl-dark";
      const cols = dark ? ["#a8704a", "#9a6340", "#b27a52"] : ["#e7b477", "#dca668", "#eebf85"];
      for (let row = 0; row < 4; row++) {
        const y = row * 32;
        let x = row % 2 ? -40 : 0;
        let k = row;
        while (x < 128) {
          const len = 64 + ((k * 23) % 3) * 16;
          g.fillStyle = cols[k % 3];
          g.fillRect(x, y, len, 32);
          g.fillStyle = dark ? "#7c4e30" : "#c48e55";
          g.fillRect(x, y, 2, 32);
          x += len;
          k++;
        }
        g.fillStyle = dark ? "#7c4e30" : "#c48e55";
        g.fillRect(0, y + 30, 128, 2);
      }
    }
  }
  return toTexture(c);
}

/** The park seen through the windows: sky, candy hills, lollipop trees, the Ferris wheel. */
export function windowViewTexture(night: boolean, seed = 0): THREE.Texture {
  const [c, g] = canvas(256, 192);
  const sky = g.createLinearGradient(0, 0, 0, 192);
  if (night) {
    sky.addColorStop(0, "#26235e");
    sky.addColorStop(1, "#7a5ab8");
  } else {
    sky.addColorStop(0, "#7fd0ff");
    sky.addColorStop(1, "#dff4ff");
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 192);
  if (night) {
    g.fillStyle = "#fff6c8";
    for (let i = 0; i < 30; i++) g.fillRect((i * 67 + seed * 13) % 256, (i * 29) % 110, 2, 2);
    g.beginPath();
    g.arc(200, 40, 16, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = "#ffffff";
    for (const [x, y] of [
      [50 + seed * 30, 40],
      [190 - seed * 20, 60],
    ]) {
      for (const [ox, oy, r] of [
        [-16, 4, 12],
        [0, -3, 17],
        [17, 4, 12],
      ]) {
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // the Ferris wheel far away
  g.strokeStyle = night ? "#ffb3e0" : "#ff8fc4";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(70 + seed * 60, 105, 38, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(70 + seed * 60, 105);
    g.lineTo(70 + seed * 60 + Math.cos(a) * 38, 105 + Math.sin(a) * 38);
    g.stroke();
    g.fillStyle = ["#ffd36b", "#7fe0c0", "#b99bff", "#ff9a7a"][i % 4];
    g.fillRect(70 + seed * 60 + Math.cos(a) * 38 - 4, 105 + Math.sin(a) * 38 - 4, 8, 8);
  }
  // hills
  const hill = (y: number, col: string, amp: number, ph: number) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 192);
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 40 + ph) * amp);
    g.lineTo(256, 192);
    g.fill();
  };
  hill(128, night ? "#4b6f8f" : "#9fe0a8", 10, seed * 2);
  hill(150, night ? "#3d5e76" : "#7fd08f", 8, 1 + seed);
  // lollipop trees
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 52 + ((i * 17 + seed * 31) % 20);
    const y = 150 + ((i * 7) % 12);
    g.fillStyle = "#ffffff";
    g.fillRect(x - 2, y - 24, 4, 26);
    g.fillStyle = ["#ff8fc4", "#ffd36b", "#8fd3ff", "#b99bff", "#7ee8a8"][(i + seed) % 5];
    g.beginPath();
    g.arc(x, y - 30, 12, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = night ? "#34546a" : "#6cc47f";
  g.fillRect(0, 176, 256, 16);
  return toTexture(c, false);
}

/** a framed poster: a soft gradient with a big emoji and an optional word */
export function posterTexture(emoji: string, from: string, to: string, word?: string, wide = false): THREE.Texture {
  const [c, g] = canvas(wide ? 256 : 128, 160);
  const W = c.width;
  const grd = g.createLinearGradient(0, 0, 0, 160);
  grd.addColorStop(0, from);
  grd.addColorStop(1, to);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, 160);
  g.font = `${wide ? 84 : 72}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, W / 2, word ? 68 : 82);
  if (word) {
    g.font = "900 24px system-ui, sans-serif";
    g.fillStyle = "#ffffff";
    g.strokeStyle = "rgba(90,35,80,0.55)";
    g.lineWidth = 5;
    g.strokeText(word, W / 2, 132);
    g.fillText(word, W / 2, 132);
  }
  return toTexture(c, false);
}

/** a round clock face (the hands are real meshes) */
export function clockFaceTexture(): THREE.Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#fffaf0";
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#7a4a2a";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.arc(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50, i % 3 ? 3 : 6, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, false);
}

/** a soft round emoji badge for the trophy shelf */
export function badgeTexture(emoji: string): THREE.Texture {
  const [c, g] = canvas(96, 96);
  g.fillStyle = "#fff4c8";
  g.beginPath();
  g.arc(48, 48, 44, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#e8a92a";
  g.lineWidth = 6;
  g.stroke();
  g.font = "52px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 48, 52);
  return toTexture(c, false);
}

/** vertical sky gradient behind the whole diorama */
export function backdropTexture(night: boolean): THREE.Texture {
  const [c, g] = canvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  if (night) {
    grd.addColorStop(0, "#1e1c4a");
    grd.addColorStop(1, "#5b4a9a");
  } else {
    grd.addColorStop(0, "#9fdcff");
    grd.addColorStop(0.7, "#ffe9f3");
    grd.addColorStop(1, "#fff4e0");
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = toTexture(c, false);
  return t;
}

/** a little wooden sign (over the front door) */
export function signTexture(text: string): THREE.Texture {
  const [c, g] = canvas(256, 72);
  g.fillStyle = "#c98d52";
  g.beginPath();
  g.roundRect(2, 2, 252, 68, 18);
  g.fill();
  g.fillStyle = "#e3ab6c";
  g.beginPath();
  g.roundRect(8, 8, 240, 56, 14);
  g.fill();
  g.font = "900 30px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#5a3018";
  g.fillText(text, 128, 38);
  return toTexture(c, false);
}

/** round soft sprite image for little floating hearts / bubbles / sparkles */
export function emojiTexture(emoji: string): THREE.Texture {
  const [c, g] = canvas(64, 64);
  g.font = "48px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 32, 36);
  return toTexture(c, false);
}

/** a speech bubble that fits its text (wrapped onto up to 3 lines); returns the texture + width/height */
export function bubbleTexture(text: string): { texture: THREE.Texture; aspect: number } {
  const font = "800 38px system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  const [m] = canvas(8, 8);
  const mg = m.getContext("2d")!;
  mg.font = font;
  const maxW = 440;
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (mg.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = lines[2].replace(/.{0,2}$/, "…");
  }
  const w = Math.ceil(Math.max(...lines.map((l) => mg.measureText(l).width))) + 56;
  const lh = 46;
  const h = lines.length * lh + 40;
  const [c, g] = canvas(w, h + 18);
  g.fillStyle = "rgba(60,30,50,0.22)";
  g.beginPath();
  g.roundRect(5, 8, w - 8, h - 4, 26);
  g.fill();
  g.fillStyle = "#fffaf3";
  g.strokeStyle = "#ffb3d1";
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(3, 3, w - 8, h - 8, 26);
  g.fill();
  g.stroke();
  // little tail pointing down at the pet
  g.beginPath();
  g.moveTo(w / 2 - 14, h - 6);
  g.lineTo(w / 2, h + 14);
  g.lineTo(w / 2 + 14, h - 6);
  g.fill();
  g.font = font;
  g.fillStyle = "#5a2350";
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, w / 2 - 2, 26 + lh / 2 + i * lh - 4));
  return { texture: toTexture(c, false), aspect: w / (h + 18) };
}
