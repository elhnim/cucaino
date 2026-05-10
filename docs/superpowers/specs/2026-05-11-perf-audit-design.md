# Perf Audit Tool — Design Spec
_2026-05-11_

## Goal

A developer-run script that scans the codebase and simulates a mobile browser session, then produces a prioritised markdown report of concrete code changes to make the app feel like a native mobile app.

## Scope

Single project. Primary user journey: developer runs `node scripts/perf-audit.mjs`, reads `docs/perf-report-YYYY-MM-DD.md`, works through the fix list.

Out of scope: authenticated flows, CI integration, real-user monitoring dashboard.

---

## Script

**File:** `scripts/perf-audit.mjs` (Node.js ESM, no build step)

**Usage:**
```bash
node scripts/perf-audit.mjs              # static analysis + browser (dev server at localhost:3000)
node scripts/perf-audit.mjs --no-browser # static analysis only
```

**New devDependency:** `playwright`

---

## Module 1: Static Analyser

Scans `app/` and `lib/` using Node.js `fs` (no external deps). Produces findings with file path, line number, description, and estimated impact.

### Checks

| Severity | Check | Detection method |
|---|---|---|
| 🔴 Critical | Missing `loading.tsx` per route | Every dir with `page.tsx` checked for sibling `loading.tsx` |
| 🔴 Critical | Sequential `await` chains | Regex scan for consecutive `await` calls not inside `Promise.all` |
| 🟡 High | `router.refresh()` calls | Grep across all `.tsx` files |
| 🟡 High | Query functions called without `React.cache()` | Find functions in `lib/data/queries.ts` used in multiple server components |
| 🟢 Medium | `<img>` tags (should be `next/image`) | Grep for `<img ` in `.tsx` files |
| 🟢 Medium | `"use client"` files > 150 lines that import from `@supabase` | File size + import scan |
| 🟢 Medium | Missing `Suspense` around `useEffect`+fetch patterns | Heuristic: `useEffect` + state setter with no parent `<Suspense>` |

---

## Module 2: Browser (Playwright)

**Emulation:** Moto G4 (375×667, deviceScaleFactor: 2)
**Network throttling:** Fast 3G (1.5 Mbps down, 750 Kbps up, 40ms latency) via CDP

**Routes tested (no auth):**

| Route | Purpose |
|---|---|
| `/login` | First paint, form render speed |
| `/select-kid` | Redirect timing, any public content |
| `/play` | Quiz hub (partially public) |

**Metrics captured per route (via CDP `Performance` domain):**
- TTFB — navigationStart → responseStart
- FCP — via `PerformancePaintTiming`
- LCP — via `PerformanceObserver` injected into page
- Blank screen duration — time until first non-white pixel (screenshot diff)
- Screenshot — saved to `docs/perf-screenshots/<route-slug>.png`

**Rating thresholds (Google Core Web Vitals):**
- TTFB: 🟢 < 800ms · 🟡 800–1800ms · 🔴 > 1800ms
- FCP: 🟢 < 1800ms · 🟡 1800–3000ms · 🔴 > 3000ms
- LCP: 🟢 < 2500ms · 🟡 2500–4000ms · 🔴 > 4000ms

Degrades gracefully if dev server is not running — skips browser module and continues with static analysis only.

---

## Output

**Terminal:** One-line summary per finding as the script runs, then final counts.

**File:** `docs/perf-report-YYYY-MM-DD.md`

### Report structure

```
# Perf Audit — YYYY-MM-DD HH:MM

## Summary
N issues found · X critical · Y high · Z medium
Tested N routes on mobile simulation (Moto G4 / Fast 3G)

## Browser Timing
| Route | TTFB | FCP | LCP | Rating |

## Screenshots
Linked images from docs/perf-screenshots/

## Findings

### 🔴 Critical
Each finding: title, affected files with line numbers, fix description, estimated time

### 🟡 High
...

### 🟢 Medium
...

## Recommended Fix Order
Numbered punch list — biggest perceived-performance impact first
```

---

## Implementation notes

- Script is a single file with two named sections (`// === STATIC ANALYSIS ===`, `// === BROWSER ===`) for readability — no need to split into modules given the scope.
- Playwright is imported dynamically so the script still runs (static-only mode) if `playwright` is not installed.
- Screenshots directory is created if it doesn't exist; old screenshots are overwritten on each run.
- The report file is overwritten on each run (date in filename means history is preserved naturally).
