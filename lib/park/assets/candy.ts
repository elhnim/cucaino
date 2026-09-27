// Candy-world recolouring. Kenney kits colour every model through one small palette texture
// (a grid of flat swatches), so repainting those swatches repaints the whole kit — no model
// edits, no extra downloads, and it can follow the kid's theme. Pure maths, unit tested.

export interface CandyPalette {
  /** hue (0..1) greys/neutrals are tinted towards — the theme's candy colour */
  neutralHue: number;
  /** 0..1: how strongly to push colours to pastel candy (0 = original) */
  strength: number;
}

export const DEFAULT_CANDY: CandyPalette = { neutralHue: 0.9, strength: 1 };

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Map one colour (0..1 rgb) into the candy world:
 *  - whites stay (icing / clouds), near-blacks become deep grape instead of black
 *  - greys and browns become the theme's candy neutral (e.g. bubblegum / lilac / caramel-pink)
 *  - everything else keeps its hue but goes bright pastel: high saturation, mid-high lightness
 */
export function candyColor(r: number, g: number, b: number, pal: CandyPalette = DEFAULT_CANDY): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  let nh = h;
  let ns: number;
  let nl: number;
  if (l > 0.93) return [r, g, b]; // icing white
  const isBrown = h > 0.02 && h < 0.11 && s < 0.6 && l < 0.55;
  if (s < 0.18 || isBrown) {
    // neutrals: stone, wood, metal, dirt -> soft candy neutrals, keeping their light/dark order
    nh = isBrown ? 0.97 : pal.neutralHue; // browns -> strawberry-caramel, greys -> theme candy
    ns = isBrown ? 0.78 : 0.7;
    nl = lerp(0.55, 0.82, l);
  } else {
    // candy-shop brights: fully saturated, mid lightness (vivid, never muddy or neon-dark)
    ns = Math.min(1, 0.86 + s * 0.14);
    nl = lerp(0.55, 0.7, l);
    // greens -> minty, reds -> strawberry pink, deep blues -> sky blue: the candy-shop set
    if (h > 0.2 && h < 0.45) nh = lerp(h, 0.42, 0.55);
    else if (h < 0.02 || h > 0.95) nh = 0.96;
    else if (h > 0.55 && h < 0.7) nh = lerp(h, 0.56, 0.5);
  }
  const [cr, cg, cb] = hslToRgb(nh, ns, nl);
  const t = pal.strength;
  return [lerp(r, cr, t), lerp(g, cg, t), lerp(b, cb, t)];
}

/** Recolour RGBA pixel data in place (used on each kit's palette texture). */
export function candyPixels(data: Uint8ClampedArray | Uint8Array, pal: CandyPalette = DEFAULT_CANDY) {
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = candyColor(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, pal);
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}

/** Per-theme candy neutral hue (the colour stone/wood/metal turns into). */
export const THEME_CANDY_HUE: Record<string, number> = {
  adventure: 0.07, // peach
  magical: 0.83, // lilac
  galactic: 0.7, // periwinkle
  ocean: 0.53, // sky
  dino: 0.4, // mint
  garden: 0.93, // bubblegum
};
