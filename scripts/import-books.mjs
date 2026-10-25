#!/usr/bin/env node
/**
 * Imports full public-domain chapter books from Project Gutenberg into the
 * story library format (lib/stories/content/*.ts). Source text is fetched
 * live at import time — nothing is retyped or paraphrased.
 *
 * Usage: node scripts/import-books.mjs
 * Requires scripts/books-manifest.json (run lookup-books.mjs first).
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const OUT_DIR = join(process.cwd(), "lib", "stories", "content");
const CACHE_DIR = join(process.cwd(), ".gutenberg-cache");
const MANIFEST_PATH = join(process.cwd(), "scripts", "books-manifest.json");

// slug/collection/emoji-free presentation metadata per book (matched by manifest "title").
const META = {
  "The Marvelous Land of Oz": { collection: "Classic Chapter Books", minutes: 110, starReward: 20 },
  "Ozma of Oz": { collection: "Classic Chapter Books", minutes: 110, starReward: 20 },
  "Peter and Wendy": { collection: "Classic Chapter Books", minutes: 120, starReward: 20 },
  "The Wind in the Willows": { collection: "Classic Chapter Books", minutes: 110, starReward: 20 },
  "Alice's Adventures in Wonderland": { collection: "Classic Chapter Books", minutes: 90, starReward: 18 },
  "Through the Looking-Glass": { collection: "Classic Chapter Books", minutes: 90, starReward: 18 },
  "The Princess and the Goblin": { collection: "Classic Chapter Books", minutes: 100, starReward: 20 },
  "At the Back of the North Wind": { collection: "Classic Chapter Books", minutes: 140, starReward: 24 },
  "The Water-Babies": { collection: "Classic Chapter Books", minutes: 110, starReward: 20 },
  "Pinocchio: The Tale of a Puppet": { collection: "Classic Chapter Books", minutes: 100, starReward: 20 },
  "Treasure Island": { collection: "Adventure Classics", minutes: 150, starReward: 24 },
  "Kidnapped": { collection: "Adventure Classics", minutes: 150, starReward: 24 },
  "Robinson Crusoe": { collection: "Adventure Classics", minutes: 160, starReward: 26 },
  "The Swiss Family Robinson": { collection: "Adventure Classics", minutes: 170, starReward: 26 },
  "Around the World in Eighty Days": { collection: "Adventure Classics", minutes: 130, starReward: 22 },
  "Twenty Thousand Leagues under the Sea": { collection: "Adventure Classics", minutes: 170, starReward: 26 },
  "The Adventures of Tom Sawyer": { collection: "Adventure Classics", minutes: 150, starReward: 24 },
  "Adventures of Huckleberry Finn": { collection: "Adventure Classics", minutes: 170, starReward: 26 },
  "Kim": { collection: "Adventure Classics", minutes: 160, starReward: 26 },
  "The Jungle Book": { collection: "Adventure Classics", minutes: 110, starReward: 20 },
  "The Second Jungle Book": { collection: "Adventure Classics", minutes: 110, starReward: 20 },
  "Little Women": { collection: "Family Classics", minutes: 200, starReward: 30 },
  "Little Men": { collection: "Family Classics", minutes: 180, starReward: 28 },
  "Eight Cousins": { collection: "Family Classics", minutes: 150, starReward: 24 },
  "Anne of Green Gables": { collection: "Family Classics", minutes: 180, starReward: 28 },
  "Anne of Avonlea": { collection: "Family Classics", minutes: 170, starReward: 26 },
  "The Secret Garden": { collection: "Family Classics", minutes: 150, starReward: 24 },
  "A Little Princess": { collection: "Family Classics", minutes: 140, starReward: 22 },
  "Little Lord Fauntleroy": { collection: "Family Classics", minutes: 130, starReward: 22 },
  "Heidi": { collection: "Family Classics", minutes: 140, starReward: 22 },
  "Rebecca of Sunnybrook Farm": { collection: "Family Classics", minutes: 150, starReward: 24 },
  "Understood Betsy": { collection: "Family Classics", minutes: 120, starReward: 20 },
  "Five Little Peppers and How They Grew": { collection: "Family Classics", minutes: 130, starReward: 22 },
  "The Story of Doctor Dolittle": { collection: "Family Classics", minutes: 110, starReward: 20 },
  "Five Children and It": { collection: "E. Nesbit's Magic", minutes: 110, starReward: 20 },
  "The Phoenix and the Carpet": { collection: "E. Nesbit's Magic", minutes: 110, starReward: 20 },
  "The Story of the Treasure Seekers": { collection: "E. Nesbit's Magic", minutes: 110, starReward: 20 },
  "The Railway Children": { collection: "E. Nesbit's Magic", minutes: 120, starReward: 20 },
  "Black Beauty": { collection: "Animal Story", minutes: 130, starReward: 22 },
};

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[':]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fetchText(url) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, encodeURIComponent(url));
  if (!existsSync(cachePath)) {
    execSync(`curl -sSL -m 40 -o "${cachePath}" "${url}"`, { stdio: "inherit" });
  }
  return readFileSync(cachePath, "utf8");
}

function stripBoilerplate(raw) {
  const startMatch = raw.match(/\*\*\* START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
  const endMatch = raw.match(/\*\*\* END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
  const start = startMatch ? startMatch.index + startMatch[0].length : 0;
  const end = endMatch ? endMatch.index : raw.length;
  return raw.slice(start, end);
}

function cleanParagraph(p) {
  return p
    .split("\n")
    .map((l) => l.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^\[Illustration.*?\]$/i, "")
    .trim();
}

const ROMAN_MAP = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanToInt(s) {
  if (!/^[IVXLCDM]+$/i.test(s)) return null;
  s = s.toUpperCase();
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_MAP[s[i]];
    const next = ROMAN_MAP[s[i + 1]];
    total += next && cur < next ? -cur : cur;
  }
  return total;
}

const WORD_NUMS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five",
  "twenty-six", "twenty-seven", "twenty-eight", "twenty-nine", "thirty",
];
function wordToInt(s) {
  const i = WORD_NUMS.indexOf(s.toLowerCase());
  return i === -1 ? null : i;
}

function chapterNumberValue(raw) {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const roman = romanToInt(raw);
  if (roman !== null) return roman;
  const word = wordToInt(raw);
  if (word !== null) return word;
  return null;
}

// Matches "CHAPTER I", "Chapter 1", "CHAPTER ONE", optionally with ". Title" or " Title" trailing on the same line.
const HEADING_RE_WORD = /^(?:CHAPTER|Chapter)\.?\s+([IVXLCDMivxlcdm]+|\d+|[A-Za-z][A-Za-z-]*)\.?\s*[-—.]?\s*(.*)$/;
// Fallback for editions that number chapters without the word "Chapter": a bare roman numeral,
// digit, or zero-padded digit alone on a line — optionally with the title on the same line.
const HEADING_RE_BARE = /^(0?\d{1,3}|[IVXLCDM]{1,7})\.?\s*[-—.]?\s*(.*)$/;

function findHeadings(lines, re, { requireBlankBefore = false } = {}) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0 || trimmed.length > 90) continue;
    if (requireBlankBefore && i > 0 && lines[i - 1].trim() !== "") continue;
    const m = re.exec(trimmed);
    if (!m) continue;
    const num = chapterNumberValue(m[1]);
    if (num === null || num < 0 || num > 200) continue;
    matches.push({ lineIdx: i, num, inlineTitle: (m[2] || "").trim() });
  }
  return matches;
}

// Keeps only the LAST ascending run starting back at the minimum chapter number — front matter
// (title page, dedication, table of contents) often repeats "Chapter I..N" before the real body does.
function lastRun(matches) {
  if (matches.length === 0) return [];
  const minNum = Math.min(...matches.map((m) => m.num));
  let runStart = 0;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].num === minNum) runStart = i;
  }
  return matches.slice(runStart);
}

function buildChapters(lines, real, headingRe) {
  const chapters = [];
  for (let idx = 0; idx < real.length; idx++) {
    const { lineIdx, inlineTitle } = real[idx];
    let title = inlineTitle;
    let bodyStart = lineIdx + 1;
    if (!title) {
      let j = lineIdx + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim().length > 0 && lines[j].trim().length <= 70 && !headingRe.test(lines[j].trim())) {
        title = lines[j].trim();
        bodyStart = j + 1;
      }
    }
    const bodyEnd = idx + 1 < real.length ? real[idx + 1].lineIdx : lines.length;
    const text = lines.slice(bodyStart, bodyEnd).join("\n");
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(cleanParagraph)
      .filter((p) => p.length > 0 && !/^\[Illustration/i.test(p));
    chapters.push({ title: title || `Chapter ${idx + 1}`, paragraphs });
  }
  return chapters.filter((c) => c.paragraphs.length > 0);
}

function parseChapters(body) {
  const lines = body.split("\n");

  const wordMatches = lastRun(findHeadings(lines, HEADING_RE_WORD));
  if (wordMatches.length >= 3) {
    const chapters = buildChapters(lines, wordMatches, HEADING_RE_WORD);
    if (chapters.length >= 3) return chapters;
  }

  // Fallback: bare numeral/roman headings, only counted when flanked by blank lines (avoids
  // matching stray digits inside prose) and forming a plausible ascending run.
  const bareMatches = lastRun(findHeadings(lines, HEADING_RE_BARE, { requireBlankBefore: true }));
  if (bareMatches.length >= 3) {
    const chapters = buildChapters(lines, bareMatches, HEADING_RE_BARE);
    if (chapters.length >= 3) return chapters;
  }

  return [];
}

function toTsLiteral(value, indent) {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .join("\n" + " ".repeat(indent));
}

function importBook(entry) {
  const meta = META[entry.title];
  if (!meta) {
    console.warn(`  ⚠ No META entry for "${entry.title}" — skipping`);
    return null;
  }
  console.log(`Fetching ${entry.title} (id ${entry.gutenbergId})…`);
  const raw = fetchText(entry.url);
  const body = stripBoilerplate(raw);
  const chapters = parseChapters(body);

  if (chapters.length < 3) {
    console.warn(`  ⚠ Only parsed ${chapters.length} chapter(s) for "${entry.title}" — needs manual review`);
    return { title: entry.title, ok: false, chapters: chapters.length };
  }

  const totalParas = chapters.reduce((n, c) => n + c.paragraphs.length, 0);
  const avg = totalParas / chapters.length;
  console.log(`  Parsed ${chapters.length} chapters (avg ${avg.toFixed(1)} paragraphs/chapter).`);

  const slug = slugify(entry.title);
  const exportName = slug.toUpperCase().replace(/-/g, "_");
  const story = {
    id: slug,
    collection: meta.collection,
    title: entry.gutenbergTitle.split(":")[0].trim(),
    author: entry.author,
    emoji: "",
    illustration: "",
    level: "Chapter book",
    minutes: meta.minutes,
    starReward: meta.starReward,
    chapters,
  };
  delete story.emoji;
  delete story.illustration;

  const header = `import type { LibraryStory } from "@/lib/stories/types";\n\n// Imported from Project Gutenberg (public domain). Source: ${entry.url}\n\nexport const ${exportName}: LibraryStory[] = [\n`;
  const body_ = "  " + toTsLiteral(story, 2).split("\n").join("\n  ");
  const footer = "\n];\n";
  const outPath = join(OUT_DIR, `${slug}.ts`);
  writeFileSync(outPath, header + body_ + footer, "utf8");
  console.log(`  Wrote ${outPath}`);
  return { title: entry.title, ok: true, slug, exportName, chapters: chapters.length };
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const results = [];
for (const entry of manifest) {
  if (!entry.found) {
    console.warn(`⚠ Skipping "${entry.title}" — not found in lookup`);
    continue;
  }
  results.push(importBook(entry));
}

console.log("\n--- Summary ---");
for (const r of results) {
  if (!r) continue;
  console.log(`${r.ok ? "✓" : "✗"} ${r.title}: ${r.chapters} chapters`);
}
writeFileSync(join(process.cwd(), "scripts", "import-results.json"), JSON.stringify(results, null, 2));
