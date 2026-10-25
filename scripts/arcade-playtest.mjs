#!/usr/bin/env node
// Play-test the AI Arcade prompts against the REAL model through /api/arcade-playtest
// (the endpoint holds the API key; this script never sees it).
//
//   PLAYTEST_URL=https://<site>.netlify.app PLAYTEST_TOKEN=<ARCADE_PLAYTEST_TOKEN> node scripts/arcade-playtest.mjs
//
// Optional env:
//   PLAYTEST_RUNS=3             how many times to run each game
//   PLAYTEST_GAMES=doodle,mystery   only these (whatami, emoji, stump, doodle, mystery)
//   PLAYTEST_OUT=./playtest-out     also save the synthetic doodles as PNGs
//   PLAYTEST_RAW=1              print raw model text for every call
//
// Doodle Guess needs pictures, so this script rasterises a few simple kid-style drawings
// (sun, house, cat, fish, tree, ice cream) and encodes them as PNG with node:zlib — no
// canvas package needed.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.PLAYTEST_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.PLAYTEST_TOKEN || "";
const RUNS = Math.max(1, Number(process.env.PLAYTEST_RUNS) || 3);
const ONLY = (process.env.PLAYTEST_GAMES || "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = process.env.PLAYTEST_OUT || "";
const RAW = process.env.PLAYTEST_RAW === "1";

if (!BASE || !TOKEN) {
  console.error("Set PLAYTEST_URL (site base URL) and PLAYTEST_TOKEN (the server's ARCADE_PLAYTEST_TOKEN).");
  process.exit(1);
}

const want = (g) => !ONLY.length || ONLY.includes(g);
const hr = (t) => console.log(`\n${"=".repeat(78)}\n${t}\n${"=".repeat(78)}`);
const sub = (t) => console.log(`\n--- ${t} ---`);
const wrap = (s, indent = "    ") =>
  String(s ?? "")
    .replace(/(.{1,74})(\s+|$)/g, `${indent}$1\n`)
    .trimEnd();

async function call(body) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${BASE}/api/arcade-playtest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-playtest-token": TOKEN },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: `network: ${err.message}` };
  }
  if (res.status === 404) {
    console.error("404 — the endpoint is off (ARCADE_PLAYTEST_TOKEN unset on the server) or the token is wrong.");
    process.exit(2);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }
  json.wall = Date.now() - t0;
  const tag = `[${json.model || "?"} · ${json.ms ?? "?"}ms model · ${json.wall}ms total${json.raw?.length > 1 ? ` · ${json.raw.length} attempts` : ""}]`;
  console.log(json.ok ? `  ${tag}` : `  ${tag} FAILED: ${json.error}`);
  if (RAW || !json.ok) for (const [i, r] of (json.raw || []).entries()) console.log(`  raw#${i + 1}: ${r.slice(0, 1500)}`);
  return json;
}

// ---------------------------------------------------------------------------
// Tiny raster + PNG encoder
// ---------------------------------------------------------------------------

const W = 256;
function canvas() {
  const px = new Uint8Array(W * W * 3).fill(255);
  const dot = (cx, cy, r, [R, G, B]) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          const i = (y * W + x) * 3;
          px[i] = R; px[i + 1] = G; px[i + 2] = B;
        }
      }
    }
  };
  const line = (x0, y0, x1, y1, w = 3, c = [30, 30, 40]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    // a little hand wobble so it looks drawn, not rendered
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wob = Math.sin(t * 9 + x0) * 0.8;
      dot(x0 + (x1 - x0) * t + wob, y0 + (y1 - y0) * t - wob, w, c);
    }
  };
  const poly = (pts, w, c, close = false) => {
    for (let i = 0; i < pts.length - 1; i++) line(...pts[i], ...pts[i + 1], w, c);
    if (close) line(...pts[pts.length - 1], ...pts[0], w, c);
  };
  const ellipse = (cx, cy, rx, ry, w, c, from = 0, to = Math.PI * 2) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = from + ((to - from) * i) / 48;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    poly(pts, w, c);
  };
  return { px, dot, line, poly, ellipse };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(W, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((W * 3 + 1) * W);
  for (let y = 0; y < W; y++) {
    raw[y * (W * 3 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const INK = [30, 30, 40];
const ORANGE = [249, 115, 22];
const GREEN = [34, 197, 94];
const BROWN = [146, 64, 14];
const BLUE = [59, 130, 246];
const PINK = [236, 72, 153];

/** each drawing: word + a list of stroke "steps" so we can also send a half-finished version */
const DRAWINGS = [
  {
    word: "sun",
    steps: [
      (c) => c.ellipse(128, 128, 42, 42, 4, ORANGE),
      (c) => { for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; c.line(128 + Math.cos(a) * 58, 128 + Math.sin(a) * 58, 128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90, 4, ORANGE); } },
      (c) => { c.dot(114, 118, 4, INK); c.dot(142, 118, 4, INK); c.ellipse(128, 136, 16, 10, 2.5, INK, 0.2, Math.PI - 0.2); },
    ],
  },
  {
    word: "house",
    steps: [
      (c) => c.poly([[70, 120], [186, 120], [186, 215], [70, 215]], 3.5, INK, true),
      (c) => c.poly([[58, 122], [128, 55], [198, 122]], 3.5, INK),
      (c) => { c.poly([[112, 215], [112, 170], [144, 170], [144, 215]], 3, BROWN); c.poly([[82, 140], [104, 140], [104, 160], [82, 160]], 3, BLUE, true); c.poly([[152, 140], [174, 140], [174, 160], [152, 160]], 3, BLUE, true); },
    ],
  },
  {
    word: "cat",
    steps: [
      (c) => c.ellipse(128, 140, 60, 52, 3.5, INK),
      (c) => { c.poly([[82, 108], [88, 55], [115, 92]], 3.5, INK); c.poly([[141, 92], [168, 55], [174, 108]], 3.5, INK); },
      (c) => { c.dot(106, 130, 5, INK); c.dot(150, 130, 5, INK); c.dot(128, 150, 4, PINK); c.line(128, 154, 118, 166, 2.5); c.line(128, 154, 138, 166, 2.5); for (const s of [-1, 1]) { c.line(128 + s * 18, 152, 128 + s * 62, 144, 2); c.line(128 + s * 18, 158, 128 + s * 62, 162, 2); } },
    ],
  },
  {
    word: "fish",
    steps: [
      (c) => c.ellipse(118, 128, 62, 36, 3.5, BLUE),
      (c) => c.poly([[178, 128], [220, 96], [220, 160]], 3.5, BLUE, true),
      (c) => { c.dot(84, 120, 5, INK); c.ellipse(70, 136, 8, 5, 2, INK, 0, Math.PI); c.line(120, 100, 132, 156, 2, BLUE); },
    ],
  },
  {
    word: "tree",
    steps: [
      (c) => c.poly([[114, 225], [114, 150], [142, 150], [142, 225]], 3.5, BROWN),
      (c) => { c.ellipse(128, 110, 55, 48, 3.5, GREEN); c.ellipse(96, 132, 26, 22, 3, GREEN, Math.PI * 0.5, Math.PI * 1.6); c.ellipse(160, 132, 26, 22, 3, GREEN, Math.PI * 1.4, Math.PI * 2.5); },
      (c) => { c.dot(110, 100, 5, [239, 68, 68]); c.dot(146, 118, 5, [239, 68, 68]); c.dot(128, 84, 5, [239, 68, 68]); },
    ],
  },
  {
    word: "ice cream",
    steps: [
      (c) => c.poly([[92, 118], [128, 225], [164, 118]], 3.5, BROWN, true),
      (c) => { c.line(104, 140, 150, 170, 2, BROWN); c.line(152, 140, 106, 170, 2, BROWN); },
      (c) => { c.ellipse(128, 100, 42, 34, 3.5, PINK, Math.PI * 0.95, Math.PI * 2.05); c.line(86, 108, 170, 108, 3.5, PINK); c.dot(128, 58, 7, [239, 68, 68]); },
    ],
  },
];

function render(drawing, upto = drawing.steps.length) {
  const c = canvas();
  for (const s of drawing.steps.slice(0, upto)) s(c);
  return png(c.px).toString("base64");
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

async function doodle() {
  hr("🎨 DOODLE GUESS (vision)");
  if (OUT) mkdirSync(OUT, { recursive: true });
  let hits = 0, tries = 0;
  for (let run = 0; run < RUNS; run++) {
    for (const d of DRAWINGS) {
      sub(`run ${run + 1} · draw "${d.word}"`);
      // a half-finished look first (like a live look mid-drawing), then the full drawing
      const partial = render(d, 1);
      const full = render(d);
      if (OUT && run === 0) {
        writeFileSync(join(OUT, `${d.word.replace(/\s+/g, "-")}-1.png`), Buffer.from(partial, "base64"));
        writeFileSync(join(OUT, `${d.word.replace(/\s+/g, "-")}-full.png`), Buffer.from(full, "base64"));
      }
      const a = await call({ game: "doodle", imageBase64: partial, word: d.word, look: 1 });
      if (a.ok) console.log(`  look 1 (partial): ${a.parsed.guesses.join(", ")}\n    "${a.parsed.line}"${a.matched ? `  ✅ matched "${a.matched}"` : ""}`);
      const b = await call({ game: "doodle", imageBase64: full, word: d.word, look: 2, previous: a.ok ? a.parsed.guesses : [], final: true });
      tries++;
      if (b.ok) {
        if (b.matched) hits++;
        console.log(`  look 2 (full):    ${b.parsed.guesses.join(", ")}\n    "${b.parsed.line}"  ${b.matched ? `✅ matched "${b.matched}"` : "❌ no match"}`);
      }
    }
  }
  console.log(`\nDoodle accuracy on full drawings: ${hits}/${tries}`);
}

async function mystery() {
  hr("🕵️ MYSTERY DETECTIVE");
  const levels = ["easy", "medium", "hard"];
  for (let run = 0; run < RUNS; run++) {
    const difficulty = levels[run % levels.length];
    sub(`run ${run + 1} · new case (${difficulty})`);
    const n = await call({ game: "mystery", step: "new", difficulty });
    if (!n.ok) continue;
    const c = n.parsed;
    const name = (id) => c.suspects.find((s) => s.id === id)?.name ?? id;
    console.log(`  ${c.emoji} ${c.title}\n${wrap(c.intro)}\n  Missing: ${c.item} · scene: ${c.crimeScene}`);
    for (const s of c.suspects) {
      console.log(`  ${s.id === c.culpritId ? "🔴" : "⚪"} ${s.emoji} ${s.name} — ${s.personality}\n      alibi: ${s.alibi}\n      truth: ${c.truths[s.id]?.truth}${c.truths[s.id]?.secret ? `\n      secret: ${c.truths[s.id].secret}` : ""}`);
    }
    console.log(`  Culprit: ${name(c.culpritId)} · motive: ${c.motive}\n  Lie: ${c.lie}`);
    for (const cl of c.clues) console.log(`  🔍 [${cl.location}] ${cl.title} — ${cl.text}  (${cl.kind} ${name(cl.suspectId)})`);
    console.log(`  Solution:\n${wrap(c.solution)}`);

    const culprit = c.culpritId;
    const innocent = c.suspects.find((s) => s.id !== culprit).id;
    const implicating = c.clues.find((cl) => cl.kind === "implicates");
    const log = [];
    const ask = async (sid, question) => {
      sub(`ask ${name(sid)}${sid === culprit ? " (CULPRIT)" : ""}: ${question}`);
      const r = await call({ game: "mystery", step: "ask", caseFile: c, suspectId: sid, question, log });
      if (r.ok) {
        console.log(`  ${r.parsed.mood} ${wrap(r.parsed.answer, "").trim()}\n  📓 ${r.parsed.note}`);
        log.push({ suspectId: sid, question, answer: r.parsed.answer, note: r.parsed.note });
      }
    };
    await ask(culprit, `Where were you when the ${c.item} went missing?`);
    await ask(innocent, `Where were you when the ${c.item} went missing?`);
    await ask(innocent, `Did you see anything strange?`);
    if (implicating) await ask(culprit, `Can you explain the ${implicating.title.toLowerCase()}?`);
    await ask(culprit, "Did you take it? Tell the truth!");

    sub(`accuse ${name(innocent)} (wrong)`);
    const wrong = await call({ game: "mystery", step: "accuse", caseFile: c, suspectId: innocent, reason: "They seemed nervous", found: [] });
    if (wrong.ok) console.log(`  correct=${wrong.correct} · ${wrong.parsed.headline}\n${wrong.parsed.paragraphs.map((p) => wrap(p)).join("\n")}\n  💬 ${wrong.parsed.aboutReason}`);
    sub(`accuse ${name(culprit)} (right)`);
    const right = await call({
      game: "mystery", step: "accuse", caseFile: c, suspectId: culprit,
      reason: implicating ? `The ${implicating.title.toLowerCase()} gave them away` : "Their story didn't add up",
      found: c.clues.slice(0, 3).map((cl) => `${cl.title}: ${cl.text}`),
    });
    if (right.ok) console.log(`  correct=${right.correct} · ${right.parsed.headline}\n${right.parsed.paragraphs.map((p) => wrap(p)).join("\n")}\n  💬 ${right.parsed.aboutReason}`);
  }
}

async function stump() {
  hr("🐾 STUMP THE AI");
  const scenarios = [
    { category: "Animals", history: [] },
    {
      category: "Animals",
      secret: "penguin",
      history: [
        { kind: "question", text: "Is it a mammal?", answer: "No" },
        { kind: "question", text: "Is it a bird?", answer: "Yes" },
        { kind: "question", text: "Can it fly?", answer: "No" },
        { kind: "question", text: "Does it live somewhere cold?", answer: "Yes" },
      ],
    },
    {
      category: "Foods",
      secret: "pizza",
      history: [
        { kind: "question", text: "Is it sweet?", answer: "No" },
        { kind: "question", text: "Is it usually eaten hot?", answer: "Yes" },
        { kind: "question", text: "Does it come from Italy?", answer: "Yes" },
        { kind: "question", text: "Is it pasta?", answer: "No" },
        { kind: "question", text: "Is it round?", answer: "Sometimes" },
      ],
    },
  ];
  for (let run = 0; run < RUNS; run++) {
    for (const s of scenarios) {
      sub(`run ${run + 1} · ${s.category} · ${s.history.length} turns${s.secret ? ` (secret: ${s.secret})` : ""}`);
      const r = await call({ game: "stump", category: s.category, history: s.history });
      if (r.ok) console.log(`  ${r.parsed.type.toUpperCase()}: ${r.parsed.text}   (${r.parsed.reaction})`);
    }
  }
}

async function whatami() {
  hr("❓ WHAT AM I?");
  const cats = ["animal", "food", "place", "vehicle"];
  const avoid = [];
  for (let run = 0; run < RUNS; run++) {
    const category = cats[run % cats.length];
    sub(`run ${run + 1} · ${category}`);
    const r = await call({ game: "whatami", category, avoid });
    if (r.ok) {
      avoid.push(r.parsed.answer);
      console.log(`  ${r.parsed.emoji} ${r.parsed.answer} (aliases: ${r.parsed.aliases.join(", ") || "-"})`);
      r.parsed.clues.forEach((cl, i) => console.log(`   ${i + 1}. ${cl}`));
      console.log(`  🤓 ${r.parsed.funFact}`);
    }
  }
}

async function emoji() {
  hr("🎭 EMOJI STORY");
  const sets = [["🐙", "🚀", "🍩", "🏰", "⚡"], ["🦖", "🎸", "🌈", "🧀", "🛸"], ["🐧", "🎁", "🌋", "🤖", "🍕"]];
  for (let run = 0; run < RUNS; run++) {
    const emojis = sets[run % sets.length];
    sub(`run ${run + 1} · ${emojis.join(" ")}`);
    const a = await call({ game: "emoji", step: "start", emojis });
    if (!a.ok) continue;
    console.log(`  "${a.parsed.title}"\n${a.parsed.paragraphs.map((p) => wrap(p)).join("\n")}\n  ${a.parsed.question}\n  1) ${a.parsed.choices[0].emoji} ${a.parsed.choices[0].text}\n  2) ${a.parsed.choices[1].emoji} ${a.parsed.choices[1].text}`);
    const b = await call({ game: "emoji", step: "end", emojis, title: a.parsed.title, paragraphs: a.parsed.paragraphs, choice: a.parsed.choices[0].text });
    if (b.ok) console.log(`${b.parsed.paragraphs.map((p) => wrap(p)).join("\n")}\n  Moral: ${b.parsed.moral}`);
  }
}

const GAMES = { doodle, mystery, stump, whatami, emoji };
for (const [name, fn] of Object.entries(GAMES)) {
  if (want(name)) await fn();
}
console.log("\nDone.");
