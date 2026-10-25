// Generates the Cucaino app icon: a candy Ferris wheel on a little island at sunset, its hub a
// golden star (the stars kids earn). Pure SVG — no emoji, so it looks the same on every device.
//   node scripts/make-icon.mjs            -> public/icon.svg (rounded) + public/icon-full.svg (square)
//   node scripts/make-icon.mjs --png      -> also renders the PNGs with playwright
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1024;
const cx = 512;
const cy = 452;
const R = 238;
const f = (n) => Math.round(n * 10) / 10;

function star(x, y, outer, inner, rot = -90) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((rot + i * 36) * Math.PI) / 180;
    pts.push(`${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`);
  }
  return pts.join(" ");
}
function sparkle(x, y, s, fill, op = 1) {
  return `<path d="M${x} ${y - s} C${x + s * 0.12} ${y - s * 0.12} ${x + s * 0.12} ${y - s * 0.12} ${x + s} ${y} C${x + s * 0.12} ${y + s * 0.12} ${x + s * 0.12} ${y + s * 0.12} ${x} ${y + s} C${x - s * 0.12} ${y + s * 0.12} ${x - s * 0.12} ${y + s * 0.12} ${x - s} ${y} C${x - s * 0.12} ${y - s * 0.12} ${x - s * 0.12} ${y - s * 0.12} ${x} ${y - s}Z" fill="${fill}" opacity="${op}"/>`;
}

const GONDOLA = ["#ff5fa8", "#ffd23f", "#4fd1ff", "#7cf29a", "#b37bff", "#ff8a4c", "#5ee0c8", "#ff7eb6"];

function art() {
  const parts = [];
  // ── sky: violet to candy pink to peach ──
  parts.push(`<rect width="${W}" height="${W}" fill="url(#sky)"/>`);
  // the setting sun's glow behind the wheel
  parts.push(`<circle cx="${cx}" cy="${cy + 40}" r="330" fill="url(#glow)"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy + 60}" r="196" fill="url(#sun)"/>`);
  // background sparkles
  parts.push(sparkle(176, 214, 26, "#fff", 0.95));
  parts.push(sparkle(852, 170, 34, "#fff7c2", 0.95));
  parts.push(sparkle(905, 372, 16, "#fff", 0.8));
  parts.push(sparkle(118, 420, 14, "#fff", 0.75));
  parts.push(sparkle(250, 120, 12, "#fff", 0.7));
  // puffy clouds
  const cloud = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity="0.92"><ellipse cx="0" cy="0" rx="78" ry="40"/><circle cx="-38" cy="-18" r="40"/><circle cx="20" cy="-34" r="52"/><circle cx="62" cy="-8" r="36"/></g>`;
  parts.push(cloud(196, 560, 1.05));
  parts.push(cloud(842, 600, 0.9));
  // ── the sea, with candy wave stripes ──
  parts.push(`<path d="M0 780 Q 128 752 256 780 T 512 780 T 768 780 T 1024 780 V1024 H0Z" fill="url(#sea)"/>`);
  for (const [y, o] of [[842, 0.55], [905, 0.4], [968, 0.3]])
    parts.push(`<path d="M-20 ${y} Q 60 ${y - 18} 140 ${y} T 300 ${y} T 460 ${y} T 620 ${y} T 780 ${y} T 940 ${y} T 1100 ${y}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="${o}"/>`);
  // ── the island: a round grassy hill with a sandy rim ──
  parts.push(`<path d="M150 806 C 210 700, 360 664, 512 664 C 664 664, 814 700, 874 806 Z" fill="#ffe2a8"/>`);
  parts.push(`<path d="M182 792 C 240 700, 376 676, 512 676 C 648 676, 784 700, 842 792 Z" fill="url(#grass)"/>`);
  parts.push(`<ellipse cx="420" cy="712" rx="70" ry="14" fill="#c8ffb8" opacity="0.7"/>`);
  // little candy trees on the hill
  const tree = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-6" y="-6" width="12" height="40" rx="6" fill="#a8664a"/><circle cx="0" cy="-30" r="36" fill="${c}"/><circle cx="-12" cy="-42" r="12" fill="#fff" opacity="0.45"/></g>`;
  parts.push(tree(258, 744, 1.0, "#ff7eb6"));
  parts.push(tree(770, 748, 0.9, "#7cf29a"));
  parts.push(tree(812, 760, 0.6, "#ffd23f"));
  // ── the Ferris wheel's A-frame legs ──
  const legY = 720;
  parts.push(`<path d="M${cx} ${cy} L${cx - 150} ${legY} M${cx} ${cy} L${cx + 150} ${legY}" stroke="#fff" stroke-width="30" stroke-linecap="round"/>`);
  parts.push(`<path d="M${cx} ${cy} L${cx - 150} ${legY} M${cx} ${cy} L${cx + 150} ${legY}" stroke="#ff5fa8" stroke-width="12" stroke-linecap="round" stroke-dasharray="26 22"/>`);
  // ── spokes ──
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${f(cx + Math.cos(a) * R)}" y2="${f(cy + Math.sin(a) * R)}" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity="0.95"/>`);
  }
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.58}" fill="none" stroke="#fff" stroke-width="8" opacity="0.8"/>`);
  // ── the candy-striped rim ──
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#ff4f9a" stroke-width="34"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#fff" stroke-width="34" stroke-dasharray="34 40"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R + 17}" fill="none" stroke="#c2185b" stroke-width="5" opacity="0.35"/>`);
  // rim lights
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    parts.push(`<circle cx="${f(cx + Math.cos(a) * R)}" cy="${f(cy + Math.sin(a) * R)}" r="7" fill="#fff7a8"/>`);
  }
  // ── the gondolas, hanging level ──
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const gx = cx + Math.cos(a) * R;
    const gy = cy + Math.sin(a) * R;
    const c = GONDOLA[i];
    parts.push(`<line x1="${f(gx)}" y1="${f(gy)}" x2="${f(gx)}" y2="${f(gy + 22)}" stroke="#fff" stroke-width="6"/>`);
    parts.push(`<rect x="${f(gx - 34)}" y="${f(gy + 18)}" width="68" height="54" rx="20" fill="${c}" stroke="#fff" stroke-width="6"/>`);
    parts.push(`<rect x="${f(gx - 22)}" y="${f(gy + 28)}" width="44" height="18" rx="8" fill="#fff" opacity="0.75"/>`);
  }
  // ── the hub: a big golden star ──
  parts.push(`<circle cx="${cx}" cy="${cy}" r="120" fill="url(#hubGlow)"/>`);
  parts.push(`<polygon points="${star(cx, cy + 7, 122, 54)}" fill="#c47a00" opacity="0.35"/>`);
  parts.push(`<polygon points="${star(cx, cy, 122, 54)}" fill="url(#gold)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>`);
  parts.push(`<polygon points="${star(cx - 18, cy - 22, 36, 16)}" fill="#fff" opacity="0.55"/>`);
  parts.push(sparkle(cx + 118, cy - 122, 24, "#fff"));
  return parts.join("\n  ");
}

const defs = `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b4dff"/>
      <stop offset="0.45" stop-color="#ff6fb5"/>
      <stop offset="0.78" stop-color="#ffb36b"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.85"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></radialGradient>
    <radialGradient id="sun" cx="0.5" cy="0.4"><stop offset="0" stop-color="#fffbe0"/><stop offset="1" stop-color="#ffd36e"/></radialGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fe0ff"/><stop offset="1" stop-color="#2f7dff"/></linearGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8af58c"/><stop offset="1" stop-color="#2fbf71"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff07a"/><stop offset="0.55" stop-color="#ffc41f"/><stop offset="1" stop-color="#ff9a00"/></linearGradient>
    <radialGradient id="hubGlow"><stop offset="0" stop-color="#fff6a0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6a0" stop-opacity="0"/></radialGradient>
    <clipPath id="round"><rect width="${W}" height="${W}" rx="224"/></clipPath>
  </defs>`;

const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}">\n  ${defs}\n  ${art()}\n</svg>\n`;
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}">\n  ${defs}\n  <g clip-path="url(#round)">\n  ${art()}\n  </g>\n</svg>\n`;
writeFileSync(new URL("../public/icon.svg", import.meta.url), rounded);
writeFileSync(new URL("../public/icon-full.svg", import.meta.url), full);
console.log("wrote public/icon.svg and public/icon-full.svg");

if (process.argv.includes("--png")) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const shots = [
    // maskable + Apple: full-bleed square (the OS rounds/masks it itself); the art keeps its key
    // shapes inside the central safe circle
    { svg: full, size: 512, out: "manifest-icon-512.maskable.png" },
    { svg: full, size: 192, out: "manifest-icon-192.maskable.png" },
    { svg: full, size: 180, out: "apple-icon-180.png" },
    { svg: rounded, size: 512, out: "icon-512.png", transparent: true },
  ];
  for (const s of shots) {
    const p = await browser.newPage({ viewport: { width: s.size, height: s.size } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s.svg.replace("<svg ", `<svg width="${s.size}" height="${s.size}" `)}</body></html>`);
    await p.screenshot({ path: fileURLToPath(new URL(`../public/${s.out}`, import.meta.url)), omitBackground: !!s.transparent });
    await p.close();
    console.log("rendered", s.out);
  }
  await browser.close();
}
