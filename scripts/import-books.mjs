#!/usr/bin/env node
// Import full public-domain novels from Project Gutenberg into the Story
// Library as multi-chapter "Chapter Books".
//
//   npm run import:books
//
// Run this on a machine with open internet (Gutenberg is blocked in some CI
// sandboxes). It fetches each book below, strips the Gutenberg boilerplate,
// splits it into chapters + paragraphs, and writes:
//   lib/stories/content/gutenberg-books.generated.ts
// which the library already imports. Then commit the generated file.
//
// To add a book: find its id at gutenberg.org (the number in the URL) and add
// an entry to BOOKS with a short comprehension quiz. If chapter detection fails
// for a title, set `chapterRegex` (a JS regex source string) to match its
// chapter headings, e.g. "\\nCHAPTER [IVXLCDM]+".

import { writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("lib/stories/content/gutenberg-books.generated.ts");
const WPM = 200;

// ---- Books to import -------------------------------------------------------
const BOOKS = [
  {
    id: 11,
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    emoji: "🐇",
    illustration: "🐇🕳️🎩",
    level: "Chapter book",
    starReward: 10,
    chapterRegex: "\\nCHAPTER [IVXLCDM]+\\.",
    quiz: [
      { q: "What does Alice follow down the rabbit-hole?", options: ["A White Rabbit", "A cat", "A mouse", "A fox"], answer: 0 },
      { q: "What happens to Alice when she eats or drinks certain things?", options: ["She grows larger or smaller", "She falls asleep", "She turns invisible", "She flies"], answer: 0 },
      { q: "Who keeps shouting “Off with their heads!”?", options: ["The Queen of Hearts", "The Mad Hatter", "The Cheshire Cat", "The Caterpillar"], answer: 0 },
    ],
  },
  {
    id: 55,
    title: "The Wonderful Wizard of Oz",
    author: "L. Frank Baum",
    emoji: "🌪️",
    illustration: "🌪️👠💚",
    level: "Chapter book",
    starReward: 10,
    chapterRegex: "\\n\\s*\\d+\\.\\s+[A-Z]",
    quiz: [
      { q: "How is Dorothy carried to the Land of Oz?", options: ["A cyclone (tornado)", "A boat", "A balloon", "A train"], answer: 0 },
      { q: "Who travels with Dorothy to the Emerald City?", options: ["The Scarecrow, Tin Woodman, and Lion", "Her parents", "Three witches", "A band of monkeys"], answer: 0 },
      { q: "What does the Cowardly Lion want from the Wizard?", options: ["Courage", "A brain", "A heart", "A way home"], answer: 0 },
    ],
  },
  {
    id: 16,
    title: "Peter Pan",
    author: "J. M. Barrie",
    emoji: "🧚",
    illustration: "🧚🏴‍☠️⭐",
    level: "Chapter book",
    starReward: 10,
    chapterRegex: "\\nChapter [0-9IVXLC]+",
    quiz: [
      { q: "Where does Peter Pan take the Darling children?", options: ["Neverland", "The moon", "A castle", "Under the sea"], answer: 0 },
      { q: "Who is Peter Pan's enemy?", options: ["Captain Hook", "The Queen", "A dragon", "Long John Silver"], answer: 0 },
      { q: "What is Tinker Bell?", options: ["A fairy", "A pirate", "A mermaid", "A dog"], answer: 0 },
    ],
  },
  {
    id: 74,
    title: "The Adventures of Tom Sawyer",
    author: "Mark Twain",
    emoji: "🪣",
    illustration: "🪣🎨🌉",
    level: "Chapter book",
    starReward: 10,
    chapterRegex: "\\nCHAPTER [IVXLCDM]+",
    quiz: [
      { q: "How does Tom get others to whitewash the fence for him?", options: ["He makes it seem like a fun privilege", "He pays them", "He threatens them", "He does it all himself"], answer: 0 },
      { q: "Who is Tom's free-living friend by the river?", options: ["Huckleberry Finn", "Becky Thatcher", "Aunt Polly", "Injun Joe"], answer: 0 },
      { q: "What does the fence trick really show?", options: ["People want what seems hard to get", "Painting is easy", "Fences are fun", "Always work alone"], answer: 0 },
    ],
  },
];

// ---- Helpers ---------------------------------------------------------------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function fetchBook(id) {
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "cucaino-book-importer/1.0" } });
      if (res.ok) return await res.text();
    } catch {
      /* try next */
    }
  }
  throw new Error(`could not fetch book ${id}`);
}

function stripBoilerplate(text) {
  const norm = text.replace(/\r\n/g, "\n");
  const start = norm.match(/\*\*\*\s*START OF TH[EI]S? PROJECT GUTENBERG.*?\*\*\*/i);
  const end = norm.match(/\*\*\*\s*END OF TH[EI]S? PROJECT GUTENBERG.*?\*\*\*/i);
  let body = norm;
  if (start) body = body.slice(start.index + start[0].length);
  if (end) {
    const endIdx = body.search(/\*\*\*\s*END OF TH[EI]S? PROJECT GUTENBERG.*?\*\*\*/i);
    if (endIdx >= 0) body = body.slice(0, endIdx);
  }
  return body.trim();
}

function toParagraphs(chunk) {
  return chunk
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && !/^[\s_*]+$/.test(p));
}

function splitChapters(body, regexSrc) {
  const re = new RegExp(regexSrc, "gi");
  const matches = [...body.matchAll(re)];
  const chapters = [];

  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const startIdx = matches[i].index;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index : body.length;
      const chunk = body.slice(startIdx, endIdx);
      // first line is the heading
      const nl = chunk.indexOf("\n");
      const heading = chunk.slice(0, nl < 0 ? chunk.length : nl).replace(/[_*]/g, "").trim();
      const paragraphs = toParagraphs(chunk.slice(nl + 1));
      if (paragraphs.length >= 3) {
        chapters.push({ title: titleCase(heading) || `Chapter ${chapters.length + 1}`, paragraphs });
      }
    }
  }

  // Fallback: chapter detection failed — chunk the whole book into readable parts.
  if (chapters.length < 2) {
    const paras = toParagraphs(body);
    const PER = 14;
    for (let i = 0; i < paras.length; i += PER) {
      chapters.push({ title: `Part ${chapters.length + 1}`, paragraphs: paras.slice(i, i + PER) });
    }
  }
  return chapters;
}

function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bChapter\b/i, "Chapter");
}

// ---- Main ------------------------------------------------------------------
async function main() {
  const out = [];
  for (const b of BOOKS) {
    process.stdout.write(`Fetching “${b.title}” (#${b.id})… `);
    try {
      const raw = await fetchBook(b.id);
      const body = stripBoilerplate(raw);
      const chapters = splitChapters(body, b.chapterRegex ?? "\\nchapter [ivxlcdm0-9]+");
      const words = chapters.reduce((n, c) => n + c.paragraphs.join(" ").split(/\s+/).length, 0);
      out.push({
        id: slug(b.title),
        collection: "Full-Length Books",
        title: b.title,
        author: b.author,
        emoji: b.emoji,
        illustration: b.illustration,
        level: b.level ?? "Chapter book",
        minutes: Math.max(10, Math.round(words / WPM)),
        chapters,
        quiz: b.quiz,
        starReward: b.starReward ?? 10,
      });
      console.log(`ok — ${chapters.length} chapters, ~${Math.round(words / 1000)}k words`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
    }
  }

  const header =
    'import type { LibraryStory } from "@/lib/stories/types";\n\n' +
    "// AUTO-GENERATED by scripts/import-books.mjs — do not edit by hand.\n" +
    "// Regenerate with: npm run import:books\n";
  const file = `${header}export const GUTENBERG_BOOKS: LibraryStory[] = ${JSON.stringify(out, null, 2)};\n`;
  await writeFile(OUT, file, "utf8");
  console.log(`\nWrote ${out.length} book(s) → ${path.relative(process.cwd(), OUT)}`);
  console.log("Now run `npm run build` and commit the generated file.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
