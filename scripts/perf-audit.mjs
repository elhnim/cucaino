#!/usr/bin/env node
// Usage:
//   node scripts/perf-audit.mjs              # static + browser (localhost:3000)
//   node scripts/perf-audit.mjs --no-browser # static only

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
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

function generateReport(findings, timings) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const critical = findings.filter(f => f.severity === 'critical');
  const high = findings.filter(f => f.severity === 'high');
  const medium = findings.filter(f => f.severity === 'medium');

  function rateMetric(name, value) {
    if (value == null) return '—';
    const thresholds = { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000] };
    const [good, poor] = thresholds[name] ?? [1000, 2000];
    const icon = value < good ? '🟢' : value < poor ? '🟡' : '🔴';
    return `${icon} ${value}ms`;
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

  md += `## Summary\n\n`;
  md += `**${findings.length} issues found** · 🔴 ${critical.length} critical · 🟡 ${high.length} high · 🟢 ${medium.length} medium\n\n`;
  if (timings.length) {
    md += `Tested ${timings.length} routes on mobile simulation (Moto G4 / Fast 3G)\n\n`;
  }

  if (timings.length) {
    md += `## Browser Timing\n\n`;
    md += `| Route | Status | TTFB | FCP | LCP |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const t of timings) {
      md += `| \`${t.route}\` | ${t.status ?? '—'} | ${rateMetric('ttfb', t.ttfb)} | ${rateMetric('fcp', t.fcp)} | ${rateMetric('lcp', t.lcp)} |\n`;
    }
    md += '\n';

    md += `## Screenshots\n\n`;
    for (const t of timings) {
      md += `**\`${t.route}\`**\n\n![${t.route}](${t.screenshot})\n\n`;
    }
  }

  md += `## Findings\n\n`;
  md += renderFindings('🔴 Critical', critical);
  md += renderFindings('🟡 High', high);
  md += renderFindings('🟢 Medium', medium);

  md += `## Recommended Fix Order\n\n`;
  md += `_Work through these top-to-bottom for maximum perceived performance gain:_\n\n`;
  const ordered = [...critical, ...high, ...medium];
  ordered.forEach((f, i) => {
    const loc = f.line ? `:${f.line}` : '';
    md += `${i + 1}. **${f.message}**  \n   \`${f.file}${loc}\` · ${f.effort}\n\n`;
  });

  return md;
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

main().catch(err => { console.error(err); process.exit(1); });
