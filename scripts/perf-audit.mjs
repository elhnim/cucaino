#!/usr/bin/env node
// Usage:
//   node scripts/perf-audit.mjs              # static + browser (localhost:3000)
//   node scripts/perf-audit.mjs --no-browser # static only

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
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
  return relative(ROOT, p).replace(/\\/g, '/');
}

function addFinding(severity, check, file, line, message, fix, effort) {
  findings.push({ severity, check, file: rel(file), line, message, fix, effort });
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

function walkDir(dir, callback) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    callback(full, entry.name);
    walkDir(full, callback);
  }
}

// ============================================================
// === STATIC ANALYSIS ===
// ============================================================

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

function scanSequentialAwaits() {
  const appDir = join(ROOT, 'app');
  let count = 0;

  function scanFile(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Match `const X = await fn(...)` — skip params/searchParams (Next.js required)
    const awaitPattern = /^\s*const\s+(\w+)\s*=\s*await\s+(?!params|searchParams)(\w+)\s*\(/;

    for (let i = 0; i < lines.length - 1; i++) {
      const m1 = awaitPattern.exec(lines[i]);
      const m2 = awaitPattern.exec(lines[i + 1]);
      if (!m1 || !m2) continue;

      const var1 = m1[1];
      // If line i+1 uses var1, the awaits are dependent — cannot parallelise
      if (lines[i + 1].includes(var1)) continue;
      // If Promise.all is nearby, already handled
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

  walkDir(join(ROOT, 'app'), (full) => {
    const pageFile = join(full, 'page.tsx');
    if (existsSync(pageFile)) scanFile(pageFile);
  });

  log(`  sequential awaits: ${count} found`);
}

function checkRouterRefresh() {
  const dirs = [join(ROOT, 'app'), join(ROOT, 'components')];
  let count = 0;

  for (const dir of dirs) {
    walkDir(dir, (full) => {
      for (const name of readdirSync(full)) {
        if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue;
        const file = join(full, name);
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('router.refresh()') && !line.trim().startsWith('//')) {
            addFinding(
              'high',
              'router-refresh',
              file,
              i + 1,
              `router.refresh() call at ${rel(file)}:${i + 1}`,
              'Remove router.refresh() — it triggers a full RSC re-fetch on every tap. Use revalidatePath() in the server action instead, or rely on next navigation to refresh UI.',
              '10 min'
            );
            count++;
          }
        });
      }
    });
  }

  log(`  router.refresh() calls: ${count}`);
}

function checkReactCache() {
  const queriesFile = join(ROOT, 'lib', 'data', 'queries.ts');
  if (!existsSync(queriesFile)) return;

  const content = readFileSync(queriesFile, 'utf-8');
  const hasCache = content.includes('cache(') && /cache\s*\(/.test(content);

  if (!hasCache) {
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

    // CDP for network throttling
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: Math.floor((1.5 * 1024 * 1024) / 8),
      uploadThroughput: Math.floor((750 * 1024) / 8),
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

    // Wait a moment for LCP to settle
    await page.waitForTimeout(1000);

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(p => p.name === 'first-contentful-paint');
      return {
        ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        lcp: window.__perfData__?.lcp ? Math.round(window.__perfData__.lcp) : null,
      };
    });

    const screenshotPath = join(screenshotDir, `${route.slug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    timings.push({
      route: route.path,
      status,
      screenshot: `perf-screenshots/${route.slug}.png`,
      ...timing,
    });

    const ttfbStr = timing.ttfb != null ? `TTFB ${timing.ttfb}ms` : 'TTFB —';
    const fcpStr = timing.fcp != null ? `FCP ${timing.fcp}ms` : 'FCP —';
    const lcpStr = timing.lcp != null ? `LCP ${timing.lcp}ms` : 'LCP —';
    log(`    ${ttfbStr} · ${fcpStr} · ${lcpStr} · status ${status}`);

    await page.close();
  }

  await browser.close();
}

// ============================================================
// REPORT
// ============================================================

async function generateReport(findings, timings) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const critical = findings.filter(f => f.severity === 'critical');
  const high     = findings.filter(f => f.severity === 'high');
  const medium   = findings.filter(f => f.severity === 'medium');

  // Rating helpers
  function rateClass(name, value) {
    if (value == null) return 'na';
    const thresholds = { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000] };
    const [good, poor] = thresholds[name] ?? [1000, 2000];
    return value < good ? 'good' : value < poor ? 'ok' : 'poor';
  }
  function rateCell(name, value) {
    if (value == null) return `<td class="na">—</td>`;
    const cls = rateClass(name, value);
    const label = cls === 'good' ? '●' : cls === 'ok' ? '●' : '●';
    return `<td class="${cls}"><span class="dot">${label}</span> ${value}ms</td>`;
  }

  // Embed screenshots as base64 data URIs so report is self-contained
  async function imgTag(screenshotRelPath, alt) {
    const absPath = join(ROOT, 'docs', screenshotRelPath);
    if (!existsSync(absPath)) return `<p class="no-screenshot">No screenshot</p>`;
    const buf = await readFile(absPath);
    const b64 = buf.toString('base64');
    return `<img src="data:image/png;base64,${b64}" alt="${alt}" class="screenshot">`;
  }

  function severityBadge(sev) {
    const map = { critical: '🔴 Critical', high: '🟡 High', medium: '🟢 Medium' };
    return `<span class="badge badge-${sev}">${map[sev] ?? sev}</span>`;
  }

  function findingCards(list) {
    return list.map((f, i) => {
      const loc = f.line ? `:${f.line}` : '';
      const fixHtml = f.fix.replace(/\n/g, '<br>');
      return `
      <div class="card">
        <div class="card-header">
          ${severityBadge(f.severity)}
          <span class="card-title">${escHtml(f.message)}</span>
        </div>
        <dl>
          <dt>File</dt><dd><code>${escHtml(f.file)}${loc}</code></dd>
          <dt>Fix</dt><dd>${fixHtml}</dd>
          <dt>Effort</dt><dd>${escHtml(f.effort)}</dd>
        </dl>
      </div>`;
    }).join('\n');
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Screenshots section
  let screenshotHtml = '';
  if (timings.length) {
    const imgs = await Promise.all(timings.map(t => imgTag(t.screenshot, t.route)));
    screenshotHtml = `
    <section>
      <h2>Screenshots <small>Moto G4 viewport</small></h2>
      <div class="screenshots">
        ${timings.map((t, i) => `
        <figure>
          <figcaption><code>${escHtml(t.route)}</code></figcaption>
          ${imgs[i]}
        </figure>`).join('')}
      </div>
    </section>`;
  }

  // Timing table
  let timingHtml = '';
  if (timings.length) {
    const rows = timings.map(t => `
        <tr>
          <td><code>${escHtml(t.route)}</code></td>
          <td>${t.status ?? '—'}</td>
          ${rateCell('ttfb', t.ttfb)}
          ${rateCell('fcp', t.fcp)}
          ${rateCell('lcp', t.lcp)}
        </tr>`).join('');
    timingHtml = `
    <section>
      <h2>Browser Timing <small>Moto G4 / Fast 3G simulation</small></h2>
      <table>
        <thead><tr><th>Route</th><th>Status</th><th>TTFB</th><th>FCP</th><th>LCP</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="legend">
        <span class="dot good">●</span> Good &nbsp;
        <span class="dot ok">●</span> Needs improvement &nbsp;
        <span class="dot poor">●</span> Poor
      </p>
    </section>`;
  }

  // Fix order
  const ordered = [...critical, ...high, ...medium];
  const fixOrderHtml = ordered.map((f, i) => {
    const loc = f.line ? `:${f.line}` : '';
    return `<li>${severityBadge(f.severity)} <strong>${escHtml(f.message)}</strong><br>
      <code>${escHtml(f.file)}${loc}</code> <em>· ${escHtml(f.effort)}</em></li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Perf Audit — ${dateStr}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a2e; background: #f4f6fb; }
  a { color: #4361ee; }
  header { background: #1a1a2e; color: #fff; padding: 2rem; }
  header h1 { font-size: 1.6rem; font-weight: 700; }
  header p { opacity: .7; font-size: .9rem; margin-top: .25rem; }
  main { max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; }
  section { background: #fff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  h2 { font-size: 1.15rem; font-weight: 700; margin-bottom: 1rem; color: #1a1a2e; }
  h2 small { font-size: .8rem; font-weight: 400; color: #888; margin-left: .5rem; }
  h3 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 .75rem; color: #333; }

  /* Summary cards */
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }
  .stat { border-radius: 10px; padding: 1rem 1.25rem; text-align: center; color: #fff; }
  .stat .num { font-size: 2.2rem; font-weight: 800; line-height: 1; }
  .stat .lbl { font-size: .8rem; opacity: .85; margin-top: .2rem; }
  .stat.total  { background: #4361ee; }
  .stat.crit   { background: #e63946; }
  .stat.hi     { background: #f4a261; color: #1a1a2e; }
  .stat.med    { background: #2a9d8f; }

  /* Browser timing table */
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th { text-align: left; padding: .5rem .75rem; background: #f4f6fb; color: #555; font-weight: 600; border-bottom: 2px solid #e8ecf5; }
  td { padding: .55rem .75rem; border-bottom: 1px solid #f0f0f0; }
  tr:last-child td { border-bottom: none; }
  td.good  { color: #2a9d8f; font-weight: 600; }
  td.ok    { color: #e07b00; font-weight: 600; }
  td.poor  { color: #e63946; font-weight: 600; }
  td.na    { color: #aaa; }
  .dot.good { color: #2a9d8f; }
  .dot.ok   { color: #e07b00; }
  .dot.poor { color: #e63946; }
  .legend   { font-size: .8rem; color: #666; margin-top: .75rem; }

  /* Screenshots */
  .screenshots { display: flex; gap: 1rem; flex-wrap: wrap; }
  figure { flex: 1; min-width: 200px; }
  figcaption { font-size: .8rem; color: #555; margin-bottom: .4rem; }
  .screenshot { width: 100%; border-radius: 8px; border: 1px solid #e8ecf5; display: block; }
  .no-screenshot { color: #aaa; font-size: .85rem; }

  /* Finding cards */
  .card { border: 1px solid #e8ecf5; border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: .75rem; }
  .card-header { display: flex; align-items: baseline; gap: .6rem; margin-bottom: .6rem; }
  .card-title { font-weight: 600; font-size: .95rem; }
  .badge { font-size: .75rem; font-weight: 700; padding: .2rem .55rem; border-radius: 20px; white-space: nowrap; }
  .badge-critical { background: #fde8ea; color: #c0392b; }
  .badge-high     { background: #fef3e2; color: #a04000; }
  .badge-medium   { background: #e6f7f5; color: #1a6b5e; }
  dl { display: grid; grid-template-columns: 80px 1fr; gap: .2rem .75rem; font-size: .875rem; }
  dt { font-weight: 600; color: #666; padding-top: .1rem; }
  dd code { background: #f4f6fb; padding: .1rem .35rem; border-radius: 4px; font-size: .82rem; word-break: break-all; }

  /* Fix order */
  ol.fix-list { padding-left: 1.25rem; }
  ol.fix-list li { margin-bottom: .9rem; line-height: 1.5; }
  ol.fix-list code { background: #f4f6fb; padding: .1rem .35rem; border-radius: 4px; font-size: .82rem; }
  ol.fix-list em { color: #888; font-size: .85rem; }
</style>
</head>
<body>
<header>
  <h1>Perf Audit</h1>
  <p>Generated ${dateStr} · Mobile simulation: Moto G4 / Fast 3G</p>
</header>
<main>

  <section>
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="stat total"><div class="num">${findings.length}</div><div class="lbl">Total issues</div></div>
      <div class="stat crit"><div class="num">${critical.length}</div><div class="lbl">Critical</div></div>
      <div class="stat hi"><div class="num">${high.length}</div><div class="lbl">High</div></div>
      <div class="stat med"><div class="num">${medium.length}</div><div class="lbl">Medium</div></div>
    </div>
  </section>

  ${timingHtml}
  ${screenshotHtml}

  <section>
    <h2>Findings</h2>
    ${critical.length ? `<h3>🔴 Critical</h3>${findingCards(critical)}` : ''}
    ${high.length     ? `<h3>🟡 High</h3>${findingCards(high)}` : ''}
    ${medium.length   ? `<h3>🟢 Medium</h3>${findingCards(medium)}` : ''}
  </section>

  <section>
    <h2>Recommended Fix Order</h2>
    <p style="color:#666;font-size:.9rem;margin-bottom:1rem">Work through these top-to-bottom for maximum perceived performance gain.</p>
    <ol class="fix-list">
      ${fixOrderHtml}
    </ol>
  </section>

</main>
</body>
</html>`;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log('\n🔍 Perf Audit starting...\n');

  log('── Static Analysis ──────────────────────────────');
  checkMissingLoadingFiles();
  scanSequentialAwaits();
  checkRouterRefresh();
  checkReactCache();
  checkImgTags();
  checkLargeClientComponents();

  if (!NO_BROWSER) {
    log('\n── Browser (Moto G4 / Fast 3G) ─────────────────');
    await runBrowserAudit();
  }

  log('\n── Generating report ────────────────────────────');
  const report = await generateReport(findings, timings);
  const date = new Date().toISOString().slice(0, 10);
  const outPath = join(ROOT, 'docs', `perf-report-${date}.html`);
  writeFileSync(outPath, report, 'utf-8');
  log(`\n✅ Report written to docs/perf-report-${date}.html`);

  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  const medium = findings.filter(f => f.severity === 'medium').length;
  log(`\n   ${findings.length} issues found · 🔴 ${critical} critical · 🟡 ${high} high · 🟢 ${medium} medium\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
