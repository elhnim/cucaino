# Perf Audit Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/perf-audit.mjs` — a single Node.js script that statically analyses the codebase for mobile performance anti-patterns and optionally runs a Playwright mobile simulation, outputting a prioritised markdown fix report.

**Architecture:** Two labelled sections in one file: a static analyser (Node.js `fs`, zero deps) that walks `app/` and `lib/` for known anti-patterns, and a Playwright browser module (dynamically imported, gracefully skipped if unavailable) that navigates public routes with Moto G4 emulation and Fast 3G throttling. Both feed a report generator that writes `docs/perf-report-YYYY-MM-DD.md`.

**Tech Stack:** Node.js ESM · Playwright · `web-vitals` already in app · no build step

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/perf-audit.mjs` | Main script — static analyser + browser module + report generator |
| Create | `docs/perf-screenshots/` | Created at runtime by script |
| Output | `docs/perf-report-YYYY-MM-DD.md` | Generated report, overwritten each run |
| Modify | `package.json` | Add `playwright` as devDependency |

---

## Task 1: Install Playwright and scaffold the script

**Files:**
- Modify: `package.json`
- Create: `scripts/perf-audit.mjs`

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev playwright
npx playwright install chromium
```

Expected: `node_modules/playwright` exists, chromium browser downloaded.

- [ ] **Step 2: Create the script scaffold**

Create `scripts/perf-audit.mjs` with this exact content:

```js
#!/usr/bin/env node
// Usage:
//   node scripts/perf-audit.mjs              # static + browser (localhost:3000)
//   node scripts/perf-audit.mjs --no-browser # static only

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE_URL = 'http://localhost:3000';
const NO_BROWSER = process.argv.includes('--no-browser');

const findings = [];
const timings = [];

// ============================================================
// HELPERS
// ============================================================

function rel(p) {
  return relative(ROOT, p);
}

function addFinding(severity, check, file, line, message, fix, effort) {
  findings.push({ severity, check, file: rel(file), line, message, fix, effort });
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

// ============================================================
// === STATIC ANALYSIS ===
// ============================================================

// ============================================================
// === BROWSER ===
// ============================================================

// ============================================================
// REPORT
// ============================================================

async function main() {
  log('\n🔍 Perf Audit starting...\n');

  // Static analysis
  log('── Static Analysis ──────────────────────────────');
  // (calls go here in later tasks)

  // Browser
  if (!NO_BROWSER) {
    log('\n── Browser (Moto G4 / Fast 3G) ─────────────────');
    // (call goes here in Task 6)
  }

  // Report
  log('\n── Generating report ────────────────────────────');
  const report = generateReport(findings, timings);
  const date = new Date().toISOString().slice(0, 10);
  const outPath = join(ROOT, 'docs', `perf-report-${date}.md`);
  writeFileSync(outPath, report, 'utf-8');
  log(`\n✅ Report written to docs/perf-report-${date}.md`);

  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  const medium = findings.filter(f => f.severity === 'medium').length;
  log(`\n   ${findings.length} issues found · 🔴 ${critical} critical · 🟡 ${high} high · 🟢 ${medium} medium\n`);
}

function generateReport(findings, timings) {
  return '# Perf Audit\n\n(placeholder — implemented in Task 5)\n';
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Verify scaffold runs**

```bash
node scripts/perf-audit.mjs --no-browser
```

Expected output:
```
🔍 Perf Audit starting...

── Static Analysis ──────────────────────────────

── Generating report ────────────────────────────

✅ Report written to docs/perf-report-2026-05-11.md

   0 issues found · 🔴 0 critical · 🟡 0 high · 🟢 0 medium
```

- [ ] **Step 4: Commit**

```bash
git add scripts/perf-audit.mjs package.json package-lock.json
git commit -m "feat: scaffold perf-audit script, install playwright"
```

---

## Task 2: Static check — missing loading.tsx per route

**Files:**
- Modify: `scripts/perf-audit.mjs`

This check walks every directory under `app/` that contains a `page.tsx` and flags any that are missing a sibling `loading.tsx`. Based on current codebase state: all 10 kid routes (`home`, `todo`, `rewards`, `progress`, `profile`, `practice`, `timetable`, `tuner`, `today`, `week`) are missing `loading.tsx`.

- [ ] **Step 1: Add the route walker function**

In `scripts/perf-audit.mjs`, replace the `// === STATIC ANALYSIS ===` comment block with:

```js
// ============================================================
// === STATIC ANALYSIS ===
// ============================================================

function walkDir(dir, callback) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    callback(full, entry.name);
    walkDir(full, callback);
  }
}

function checkMissingLoadingFiles() {
  const appDir = join(ROOT, 'app');
  const missing = [];

  walkDir(appDir, (full) => {
    const hasPage = existsSync(join(full, 'page.tsx'));
    const hasLoading = existsSync(join(full, 'loading.tsx'));
    if (hasPage && !hasLoading) {
      missing.push(full);
      addFinding(
        'critical',
        'missing-loading',
        full,
        null,
        `Missing loading.tsx in ${rel(full)}`,
        'Add loading.tsx with a skeleton that matches the page layout — prevents blank screen during SSR',
        '15–30 min per route'
      );
    }
  });

  log(`  missing loading.tsx: ${missing.length} routes`);
  missing.forEach(p => log(`    · ${rel(p)}`));
}
```

- [ ] **Step 2: Call it from main()**

In the `main()` function, replace the comment `// (calls go here in later tasks)` with:

```js
  checkMissingLoadingFiles();
```

- [ ] **Step 3: Run and verify**

```bash
node scripts/perf-audit.mjs --no-browser
```

Expected — should list all missing kid routes:
```
── Static Analysis ──────────────────────────────
  missing loading.tsx: 10 routes
    · app/kid/[kidId]/home
    · app/kid/[kidId]/practice
    · app/kid/[kidId]/profile
    · app/kid/[kidId]/progress
    · app/kid/[kidId]/rewards
    · app/kid/[kidId]/timetable
    · app/kid/[kidId]/today
    · app/kid/[kidId]/todo
    · app/kid/[kidId]/tuner
    · app/kid/[kidId]/week
```

- [ ] **Step 4: Commit**

```bash
git add scripts/perf-audit.mjs
git commit -m "feat(perf-audit): check missing loading.tsx per route"
```

---

## Task 3: Static check — sequential awaits

**Files:**
- Modify: `scripts/perf-audit.mjs`

Scans `page.tsx` files for consecutive `const x = await fn()` lines where the second call does NOT use the variable from the first. Those can be parallelised with `Promise.all`. Skips `params`/`searchParams` awaits (Next.js-required sequential).

- [ ] **Step 1: Add the sequential await scanner**

After `checkMissingLoadingFiles`, add:

```js
function scanSequentialAwaits() {
  const appDir = join(ROOT, 'app');
  let count = 0;

  function scanFile(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Find lines that are plain `const X = await fn(...)` — not params/searchParams
    const awaitPattern = /^\s*const\s+(\w+)\s*=\s*await\s+(?!params|searchParams)(\w+)\s*\(/;

    for (let i = 0; i < lines.length - 1; i++) {
      const m1 = awaitPattern.exec(lines[i]);
      const m2 = awaitPattern.exec(lines[i + 1]);
      if (!m1 || !m2) continue;

      const var1 = m1[1]; // variable declared on line i
      // If line i+1 references var1, the awaits are dependent — skip
      if (lines[i + 1].includes(var1)) continue;
      // If either line is inside a Promise.all context — skip
      const context = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
      if (context.includes('Promise.all')) continue;

      addFinding(
        'critical',
        'sequential-awaits',
        filePath,
        i + 1,
        `Sequential independent awaits at line ${i + 1}–${i + 2} in ${rel(filePath)}`,
        `Wrap in Promise.all([\n  ${m1[2]}(...),\n  ${m2[2]}(...),\n]) and destructure result`,
        '5 min'
      );
      count++;
      i++; // skip next line to avoid double-reporting
    }
  }

  walkDir(appDir, (full) => {
    const pageFile = join(full, 'page.tsx');
    if (existsSync(pageFile)) scanFile(pageFile);
  });

  log(`  sequential awaits: ${count} found`);
}
```

- [ ] **Step 2: Call it from main()**

Add after `checkMissingLoadingFiles()`:

```js
  scanSequentialAwaits();
```

- [ ] **Step 3: Run and verify**

```bash
node scripts/perf-audit.mjs --no-browser
```

Expected: reports any pages where two independent `await` calls run sequentially. (Based on current codebase most sequential awaits are dependent on `kid` — those should NOT be flagged.)

- [ ] **Step 4: Commit**

```bash
git add scripts/perf-audit.mjs
git commit -m "feat(perf-audit): detect sequential independent await chains"
```

---

## Task 4: Remaining static checks

**Files:**
- Modify: `scripts/perf-audit.mjs`

Four more checks: `router.refresh()` calls, missing `React.cache()` on `getKid`, `<img>` tags, and large `"use client"` files importing Supabase.

- [ ] **Step 1: Add router.refresh() check**

```js
function checkRouterRefresh() {
  const appDir = join(ROOT, 'app');
  const componentDir = join(ROOT, 'components');
  let count = 0;

  function scanDir(dir) {
    walkDir(dir, (full) => {
      for (const name of readdirSync(full)) {
        if (!name.endsWith('.tsx')) continue;
        const file = join(full, name);
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('router.refresh()')) {
            addFinding(
              'high',
              'router-refresh',
              file,
              i + 1,
              `router.refresh() call at ${rel(file)}:${i + 1}`,
              'Remove router.refresh() — it triggers a full RSC re-fetch. Use revalidatePath() in the server action instead, or rely on next navigation to update UI.',
              '10 min'
            );
            count++;
          }
        });
      }
    });
  }

  scanDir(appDir);
  scanDir(componentDir);
  log(`  router.refresh() calls: ${count}`);
}
```

- [ ] **Step 2: Add React.cache() check on getKid**

```js
function checkReactCache() {
  const queriesFile = join(ROOT, 'lib', 'data', 'queries.ts');
  if (!existsSync(queriesFile)) return;

  const content = readFileSync(queriesFile, 'utf-8');
  // Check if getKid is wrapped in cache()
  if (!content.includes('cache(') || !content.match(/cache\s*\(\s*.*getKid/s)) {
    addFinding(
      'high',
      'missing-react-cache',
      queriesFile,
      null,
      'getKid() is not wrapped in React.cache()',
      'Wrap getKid with React.cache() so multiple server components in one render share a single DB call:\n  import { cache } from "react";\n  export const getKid = cache(timed("getKid", async (id) => { ... }));',
      '5 min'
    );
    log(`  React.cache() on getKid: missing`);
  } else {
    log(`  React.cache() on getKid: ok`);
  }
}
```

- [ ] **Step 3: Add <img> tag check**

```js
function checkImgTags() {
  const dirs = [join(ROOT, 'app'), join(ROOT, 'components')];
  let count = 0;

  for (const dir of dirs) {
    walkDir(dir, (full) => {
      for (const name of readdirSync(full)) {
        if (!name.endsWith('.tsx')) continue;
        const file = join(full, name);
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (/<img\s/i.test(line) && !line.trim().startsWith('//')) {
            addFinding(
              'medium',
              'img-tag',
              file,
              i + 1,
              `<img> tag at ${rel(file)}:${i + 1}`,
              'Replace with next/image <Image> for automatic sizing, lazy loading, and WebP conversion',
              '5 min'
            );
            count++;
          }
        });
      }
    });
  }

  log(`  <img> tags: ${count}`);
}
```

- [ ] **Step 4: Add large "use client" + Supabase check**

```js
function checkLargeClientComponents() {
  const dirs = [join(ROOT, 'app'), join(ROOT, 'components')];
  let count = 0;
  const THRESHOLD = 150;

  for (const dir of dirs) {
    walkDir(dir, (full) => {
      for (const name of readdirSync(full)) {
        if (!name.endsWith('.tsx')) continue;
        const file = join(full, name);
        const content = readFileSync(file, 'utf-8');
        if (!content.startsWith('"use client"') && !content.startsWith("'use client'")) continue;
        if (!content.includes('@supabase')) continue;
        const lineCount = content.split('\n').length;
        if (lineCount > THRESHOLD) {
          addFinding(
            'medium',
            'large-client-supabase',
            file,
            null,
            `Large client component with Supabase import: ${rel(file)} (${lineCount} lines)`,
            'Move data fetching to a server component parent and pass data as props, or convert to a server action. Client components with Supabase calls block interactivity.',
            '30–60 min'
          );
          count++;
        }
      }
    });
  }

  log(`  large client+supabase components: ${count}`);
}
```

- [ ] **Step 5: Wire all four checks into main()**

Add after `scanSequentialAwaits()`:

```js
  checkRouterRefresh();
  checkReactCache();
  checkImgTags();
  checkLargeClientComponents();
```

- [ ] **Step 6: Run and verify**

```bash
node scripts/perf-audit.mjs --no-browser
```

Expected — should report:
- `router.refresh() calls: 2` (ParentKidEditClient.tsx:38, ParentProfileClient.tsx:42)
- `React.cache() on getKid: missing`
- `<img> tags: N` (varies)
- `large client+supabase components: N`

- [ ] **Step 7: Commit**

```bash
git add scripts/perf-audit.mjs
git commit -m "feat(perf-audit): add router.refresh, React.cache, img, large-client checks"
```

---

## Task 5: Report generator

**Files:**
- Modify: `scripts/perf-audit.mjs`

Replace the placeholder `generateReport` stub with the real implementation.

- [ ] **Step 1: Replace the generateReport function**

Replace the existing `function generateReport(findings, timings)` stub with:

```js
function generateReport(findings, timings) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const critical = findings.filter(f => f.severity === 'critical');
  const high = findings.filter(f => f.severity === 'high');
  const medium = findings.filter(f => f.severity === 'medium');

  function rateMetric(name, value) {
    if (value == null) return '—';
    const ms = Math.round(value);
    const thresholds = { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000] };
    const [good, poor] = thresholds[name] ?? [1000, 2000];
    const icon = value < good ? '🟢' : value < poor ? '🟡' : '🔴';
    return `${icon} ${ms}ms`;
  }

  function renderFindings(label, list) {
    if (!list.length) return '';
    let s = `### ${label}\n\n`;
    list.forEach((f, i) => {
      s += `#### ${i + 1}. ${f.message}\n\n`;
      s += `**File:** \`${f.file}\`${f.line ? `:${f.line}` : ''}\n\n`;
      s += `**Fix:** ${f.fix}\n\n`;
      s += `**Effort:** ${f.effort}\n\n`;
      s += '---\n\n';
    });
    return s;
  }

  let md = `# Perf Audit — ${dateStr}\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `**${findings.length} issues found** · 🔴 ${critical.length} critical · 🟡 ${high.length} high · 🟢 ${medium.length} medium\n\n`;
  if (timings.length) {
    md += `Tested ${timings.length} routes on mobile simulation (Moto G4 / Fast 3G)\n\n`;
  }

  // Browser timing table
  if (timings.length) {
    md += `## Browser Timing\n\n`;
    md += `| Route | Status | TTFB | FCP | LCP |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const t of timings) {
      md += `| \`${t.route}\` | ${t.status ?? '—'} | ${rateMetric('ttfb', t.ttfb)} | ${rateMetric('fcp', t.fcp)} | ${rateMetric('lcp', t.lcp)} |\n`;
    }
    md += '\n';

    // Screenshots
    md += `## Screenshots\n\n`;
    for (const t of timings) {
      md += `**\`${t.route}\`**\n\n![${t.route}](${t.screenshot})\n\n`;
    }
  }

  // Findings by severity
  md += `## Findings\n\n`;
  md += renderFindings('🔴 Critical', critical);
  md += renderFindings('🟡 High', high);
  md += renderFindings('🟢 Medium', medium);

  // Recommended fix order
  md += `## Recommended Fix Order\n\n`;
  md += `_Work through these top-to-bottom for maximum perceived performance gain:_\n\n`;
  const ordered = [...critical, ...high, ...medium];
  ordered.forEach((f, i) => {
    const loc = f.line ? `:${f.line}` : '';
    md += `${i + 1}. **${f.message}**  \n`;
    md += `   \`${f.file}${loc}\` · ${f.effort}\n\n`;
  });

  return md;
}
```

- [ ] **Step 2: Run and check the report file**

```bash
node scripts/perf-audit.mjs --no-browser && cat docs/perf-report-$(date +%Y-%m-%d).md | head -60
```

Expected: well-formatted markdown with Summary, Findings sections, and Recommended Fix Order punch list.

- [ ] **Step 3: Commit**

```bash
git add scripts/perf-audit.mjs
git commit -m "feat(perf-audit): implement report generator"
```

---

## Task 6: Playwright browser module

**Files:**
- Modify: `scripts/perf-audit.mjs`

Dynamically imports Playwright so the script still works (static-only) if Playwright is not installed. Navigates three public routes with Moto G4 emulation and Fast 3G network conditions.

- [ ] **Step 1: Add the browser audit function**

Replace the `// === BROWSER ===` comment block with:

```js
// ============================================================
// === BROWSER ===
// ============================================================

async function runBrowserAudit() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    log('  playwright not installed — skipping browser module');
    return;
  }

  // Check dev server is reachable
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok && res.status !== 302 && res.status !== 301) throw new Error(`status ${res.status}`);
  } catch {
    log(`  dev server not reachable at ${BASE_URL} — skipping browser module`);
    return;
  }

  const { chromium, devices } = playwright;
  const motoG4 = devices['Moto G4'];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...motoG4,
    ignoreHTTPSErrors: true,
  });

  const screenshotDir = join(ROOT, 'docs', 'perf-screenshots');
  mkdirSync(screenshotDir, { recursive: true });

  const routes = [
    { path: '/login', slug: 'login' },
    { path: '/select-kid', slug: 'select-kid' },
    { path: '/play', slug: 'play' },
  ];

  for (const route of routes) {
    log(`  testing ${route.path}...`);
    const page = await context.newPage();

    // CDP session for network throttling
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: Math.floor((1.5 * 1024 * 1024) / 8), // 1.5 Mbps → bytes/s
      uploadThroughput: Math.floor((750 * 1024) / 8),           // 750 Kbps → bytes/s
      latency: 40,
    });

    // Inject LCP observer before navigation
    await page.addInitScript(() => {
      window.__perfData__ = { lcp: null };
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length) {
            window.__perfData__.lcp = entries[entries.length - 1].startTime;
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}
    });

    let status = null;
    try {
      const response = await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      status = response?.status() ?? null;
    } catch {
      log(`    ⚠ navigation timeout for ${route.path}`);
      await page.close();
      continue;
    }

    // Collect timing
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(p => p.name === 'first-contentful-paint');
      return {
        ttfb: nav ? nav.responseStart - nav.requestStart : null,
        fcp: fcp ? fcp.startTime : null,
        lcp: window.__perfData__?.lcp ?? null,
      };
    });

    // Screenshot
    const screenshotPath = join(screenshotDir, `${route.slug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    timings.push({
      route: route.path,
      status,
      screenshot: `perf-screenshots/${route.slug}.png`,
      ...timing,
    });

    const ttfbStr = timing.ttfb != null ? `TTFB ${Math.round(timing.ttfb)}ms` : 'TTFB —';
    const fcpStr = timing.fcp != null ? `FCP ${Math.round(timing.fcp)}ms` : 'FCP —';
    log(`    ${ttfbStr} · ${fcpStr} · status ${status}`);

    await page.close();
  }

  await browser.close();
}
```

- [ ] **Step 2: Wire browser module into main()**

Replace the comment `// (call goes here in Task 6)` with:

```js
    await runBrowserAudit();
```

- [ ] **Step 3: Start dev server and run the full audit**

In one terminal:
```bash
npm run dev
```

In another:
```bash
node scripts/perf-audit.mjs
```

Expected output includes browser timing lines like:
```
── Browser (Moto G4 / Fast 3G) ─────────────────
  testing /login...
    TTFB 45ms · FCP 380ms · status 200
  testing /select-kid...
    TTFB 38ms · FCP 290ms · status 307
  testing /play...
    TTFB 52ms · FCP 410ms · status 200
```

And `docs/perf-screenshots/login.png` etc. exist.

- [ ] **Step 4: Verify --no-browser still works**

```bash
node scripts/perf-audit.mjs --no-browser
```

Expected: no Playwright output, no error.

- [ ] **Step 5: Commit**

```bash
git add scripts/perf-audit.mjs docs/perf-screenshots/
git commit -m "feat(perf-audit): add Playwright mobile simulation module"
```

---

## Task 7: End-to-end verification and gitignore

**Files:**
- Modify: `.gitignore`
- Modify: `package.json` (add convenience script)

- [ ] **Step 1: Add perf report and screenshots to .gitignore**

Open `.gitignore` and add at the bottom:

```
# Perf audit outputs
docs/perf-report-*.md
docs/perf-screenshots/
```

- [ ] **Step 2: Add npm script for convenience**

In `package.json`, add to the `"scripts"` block:

```json
"perf": "node scripts/perf-audit.mjs",
"perf:static": "node scripts/perf-audit.mjs --no-browser"
```

- [ ] **Step 3: Run full audit one final time and read the report**

```bash
npm run dev &
sleep 5
npm run perf
cat docs/perf-report-$(date +%Y-%m-%d).md
```

Verify the report contains:
- Summary with counts
- Browser Timing table (if dev server was running)
- Findings sections with file paths and line numbers
- Recommended Fix Order punch list

- [ ] **Step 4: Final commit**

```bash
git add .gitignore package.json
git commit -m "feat(perf-audit): add gitignore rules and npm scripts"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Single file `scripts/perf-audit.mjs` | Task 1 |
| `--no-browser` flag | Task 1 |
| Missing `loading.tsx` check | Task 2 |
| Sequential await scanner | Task 3 |
| `router.refresh()` check | Task 4 |
| `React.cache()` check | Task 4 |
| `<img>` tag check | Task 4 |
| Large `"use client"` + Supabase check | Task 4 |
| Playwright Moto G4 emulation | Task 6 |
| Fast 3G network throttling via CDP | Task 6 |
| TTFB / FCP / LCP capture | Task 6 |
| Screenshots per route | Task 6 |
| Graceful degradation (no Playwright / no server) | Task 6 |
| Markdown report with severity tiers | Task 5 |
| Recommended Fix Order punch list | Task 5 |
| `docs/perf-report-YYYY-MM-DD.md` output | Task 5 |

All spec requirements covered. No placeholders. Types and function signatures consistent across tasks.
