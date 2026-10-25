#!/usr/bin/env node
// Looks up each title on Gutendex (Project Gutenberg's catalog API) to get a
// reliable book id + plain-text download URL, and writes scripts/books-manifest.json.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const CACHE_DIR = join(process.cwd(), ".gutenberg-cache");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

function httpGetJson(url) {
  const cachePath = join(CACHE_DIR, "api-" + encodeURIComponent(url));
  if (!existsSync(cachePath)) {
    execSync(`curl -sSL -m 20 -o "${cachePath}" "${url}"`, { stdio: "inherit" });
  }
  return JSON.parse(readFileSync(cachePath, "utf8"));
}

// title -> preferred gutendex book id (null = auto-pick first English public-domain result)
const TITLES = [
  ["The Marvelous Land of Oz", null],
  ["Ozma of Oz", null],
  ["Peter and Wendy", null],
  ["The Wind in the Willows", null],
  ["Alice's Adventures in Wonderland", null],
  ["Through the Looking-Glass", null],
  ["The Princess and the Goblin", null],
  ["At the Back of the North Wind", null],
  ["The Water-Babies", null],
  ["Pinocchio: The Tale of a Puppet", null],
  ["Treasure Island", null],
  ["Kidnapped", null],
  ["Robinson Crusoe", null],
  ["The Swiss Family Robinson", null],
  ["Around the World in Eighty Days", null],
  ["Twenty Thousand Leagues under the Sea", null],
  ["The Adventures of Tom Sawyer", null],
  ["Adventures of Huckleberry Finn", null],
  ["Kim", null],
  ["The Jungle Book", null],
  ["The Second Jungle Book", null],
  ["Little Women", null],
  ["Little Men", null],
  ["Eight Cousins", null],
  ["Anne of Green Gables", null],
  ["Anne of Avonlea", null],
  ["The Secret Garden", null],
  ["A Little Princess", null],
  ["Little Lord Fauntleroy", null],
  ["Heidi", null],
  ["Rebecca of Sunnybrook Farm", null],
  ["Understood Betsy", null],
  ["Five Little Peppers and How They Grew", null],
  ["The Story of Doctor Dolittle", null],
  ["Five Children and It", null],
  ["The Phoenix and the Carpet", null],
  ["The Story of the Treasure Seekers", 770],
  ["The Railway Children", null],
  ["Black Beauty", null],
];

const manifest = [];
for (const [title, preferId] of TITLES) {
  let pick = null;
  if (preferId) {
    // Fetch the known-correct id directly rather than trusting fuzzy search ranking.
    pick = httpGetJson(`https://gutendex.com/books/${preferId}`);
  } else {
    const q = encodeURIComponent(title);
    const data = httpGetJson(`https://gutendex.com/books/?search=${q}`);
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const wantNorm = norm(title.split(":")[0]);
    const eligible = data.results.filter(
      (r) => r.languages.includes("en") && r.copyright === false && r.formats["text/plain; charset=utf-8"],
    );
    // Exact (ignoring subtitle/punctuation) match first, else "starts with" match, else give up.
    pick =
      eligible.find((r) => norm(r.title.split(":")[0]) === wantNorm) ||
      eligible.find((r) => norm(r.title).startsWith(wantNorm) || wantNorm.startsWith(norm(r.title.split(":")[0])));
  }
  if (!pick) {
    console.warn(`  ⚠ No good match for "${title}"`);
    manifest.push({ title, found: false });
    continue;
  }
  const url =
    pick.formats["text/plain; charset=utf-8"] ||
    pick.formats["text/plain; charset=us-ascii"] ||
    pick.formats["text/plain"];
  console.log(`✓ ${title} -> id ${pick.id} (${pick.title}) by ${pick.authors.map((a) => a.name).join(", ")}`);
  manifest.push({
    title,
    found: true,
    gutenbergId: pick.id,
    gutenbergTitle: pick.title,
    author: pick.authors.map((a) => a.name).join(", "),
    url,
  });
}

writeFileSync(join(process.cwd(), "scripts", "books-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nWrote scripts/books-manifest.json (${manifest.filter((m) => m.found).length}/${manifest.length} found)`);
