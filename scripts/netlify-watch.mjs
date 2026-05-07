#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook — fires after every Bash call.
 * Exits immediately unless the command was `git push`.
 * When it was a push: waits for the latest Netlify deploy to finish
 * and prints a pass/fail summary with any error messages.
 *
 * Credentials are read from .env.local (NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID).
 */

import { readFileSync } from "fs";
import { join } from "path";

// ---------- helpers ----------

function readEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", () => resolve(buf));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function netlify(token, path) {
  const r = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Netlify API ${r.status}: ${text}`);
  }
  return r.json();
}

// ---------- main ----------

const env = readEnvLocal();
const TOKEN = env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
const SITE_ID = env.NETLIFY_SITE_ID || process.env.NETLIFY_SITE_ID;

if (!TOKEN || !SITE_ID) {
  process.stderr.write(
    "[netlify-watch] Missing NETLIFY_AUTH_TOKEN or NETLIFY_SITE_ID in .env.local\n"
  );
  process.exit(0);
}

const raw = await readStdin();
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  // not JSON — ignore
}

// Hook input shape: { tool_name, tool_input: { command }, tool_response: { output } }
const command =
  input?.tool_input?.command ?? input?.input?.command ?? input?.command ?? "";

if (!command.includes("git push")) process.exit(0);

// Give Netlify ~6 s to pick up the push before we query
console.log("\n[netlify-watch] Push detected — waiting for Netlify to queue a deploy...");
await sleep(6000);

let deploys;
try {
  deploys = await netlify(TOKEN, `/sites/${SITE_ID}/deploys?per_page=3`);
} catch (e) {
  console.error(`[netlify-watch] Could not fetch deploys: ${e.message}`);
  process.exit(0);
}

// Find the most recent non-cancelled deploy
const deploy = deploys.find((d) => d.state !== "canceled");
if (!deploy) {
  console.log("[netlify-watch] No active deploy found.");
  process.exit(0);
}

const shortId = deploy.id.slice(0, 8);
console.log(`[netlify-watch] Deploy ${shortId}… (${deploy.state})`);

const FINAL = new Set(["ready", "error", "canceled"]);
let d = deploy;
let lastState = d.state;
let dots = 0;

while (!FINAL.has(d.state)) {
  await sleep(5000);
  try {
    d = await netlify(TOKEN, `/deploys/${d.id}`);
  } catch {
    // transient — keep waiting
    continue;
  }
  if (d.state !== lastState) {
    console.log(`[netlify-watch]  → ${d.state}`);
    lastState = d.state;
  } else {
    process.stdout.write(".");
    dots++;
    if (dots % 12 === 0) process.stdout.write("\n");
  }
}

if (dots > 0) process.stdout.write("\n");

if (d.state === "ready") {
  console.log(`[netlify-watch] ✅ Deploy succeeded in ${d.deploy_time ?? "?"}s`);
  const url = d.deploy_ssl_url || d.ssl_url || d.url || "";
  if (url) console.log(`[netlify-watch] 🌐 ${url}`);
} else {
  console.log(`[netlify-watch] ❌ Deploy ${d.state}`);

  // Print structured error summary if available
  const msgs = d.summary?.messages;
  if (Array.isArray(msgs) && msgs.length) {
    for (const m of msgs) {
      const prefix = m.type === "error" ? "  ✗" : "  •";
      console.log(`${prefix} ${m.title}`);
      if (m.description) {
        // Indent multi-line descriptions
        for (const line of m.description.split("\n")) {
          console.log(`    ${line}`);
        }
      }
    }
  } else {
    console.log(
      `[netlify-watch] Check full log: https://app.netlify.com/sites/${SITE_ID}/deploys/${d.id}`
    );
  }
}
