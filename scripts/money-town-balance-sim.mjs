// Money Town v2 — balance simulator (Phase 3 win-path balance).
//
// Question this answers: starting all four players as a qualified Tradesperson,
// do the four WIN PATHS (Frugal Tortoise / Earner-Saver / Investor /
// Entrepreneur) reach financial freedom (passive income >= expenses) at roughly
// equal rates, by a realistic age, with luck contributing ~25%?
//
// It does NOT model power-ups or auctions yet — those are a layer tuned later.
// It models the core economic engine: salary, auto-lifestyle, downsizing,
// debt/mortgages, the variable-return asset engine, and bounded life events.
//
// Run: node scripts/money-town-balance-sim.mjs

// ----------------------------- tunable config -----------------------------
const CONFIG = {
  startAge: 20,
  maxAge: 65,
  startCash: 12000, // carried from Phase 1 + apprenticeship

  // Tradesperson rank ladder. Auto-lifestyle is SUB-LINEAR (a smaller % of
  // salary at higher ranks: 68% → 65% → 61% → 57%) so climbing buys a better
  // savings rate — offsetting the higher win bar and keeping rank-climbing a
  // viable path rather than a trap. Still "higher salary = higher living cost",
  // just not 1:1.
  ranks: [
    { name: "Qualified",  salary: 65000,  lifestyle: 44000 }, // 68%
    { name: "Specialist", salary: 85000,  lifestyle: 55000 }, // 65%
    { name: "Contractor", salary: 110000, lifestyle: 67000 }, // 61%
    { name: "Business",   salary: 150000, lifestyle: 85000, volatility: 0.45 }, // 57%
  ],

  // Assets: cash YIELD (counts toward win bar) + APPRECIATION (net worth only).
  assets: {
    index:    { yield: 0.028, appMean: 0.072, appStd: 0.11, minBuy: 5000 },
    property: { yield: 0.052, appMean: 0.035, appStd: 0.07, minBuy: 60000, deposit: 0.20, mortgageRate: 0.045 },
    shares:   { yield: 0.022, appMean: 0.118, appStd: 0.28, minBuy: 3000 },
    crypto:   { yield: 0.000, appMean: 0.110, appStd: 0.60, minBuy: 2000 },
    business: { yield: 0.130, appMean: 0.050, appStd: 0.42, minBuy: 100000, failChance: 0.07 },
  },

  housingShareOfLifestyle: 0.30, // buying home outright removes this slice
  event: { chance: 0.60, min: -11000, max: 8500 }, // bounded annual life event (~25% luck)
  marketCrashChance: 0.07,
  marketCrashHit: -0.28, // extra appreciation hit to risk assets on a crash year
};

// ----------------------------- PRNG -----------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  // Box–Muller, clamped to ±3 std
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, g));
}

// ----------------------------- strategies -----------------------------
// Each returns a decision for the year given player + cash on hand.
// targetRank: how far to climb. downsize: fraction cut from lifestyle.
// buyOrder: which assets to accumulate (in priority order). buyHome: bool.
const STRATEGIES = {
  "Frugal Tortoise": {
    targetRank: 0, downsize: 0.16, buyHome: true,
    buyOrder: ["index"],
  },
  "Earner-Saver": {
    targetRank: 2, downsize: 0.15, buyHome: true,
    buyOrder: ["index", "property"],
  },
  "Investor": {
    targetRank: 1, downsize: 0.16, buyHome: false, realize: 0.20,
    buyOrder: ["shares"], // appreciation engine, realized into index for yield
  },
  "Entrepreneur": {
    targetRank: 3, downsize: 0.14, buyHome: false,
    buyOrder: ["business", "shares"],
  },
};

// ----------------------------- one player's year -----------------------------
function newPlayer(strat) {
  return {
    strat, rank: 0, cash: CONFIG.startCash, downsize: 0,
    homeOwned: false,
    holdings: { index: 0, property: 0, shares: 0, crypto: 0, business: 0 },
    mortgage: 0, // debt against property
    businessFailed: false,
  };
}

function expenses(p) {
  const base = CONFIG.ranks[p.rank].lifestyle;
  let e = base * (1 - p.downsize);
  if (p.homeOwned) e -= base * CONFIG.housingShareOfLifestyle;
  return Math.max(8000, e);
}

// Cash thrown off each year (rent, dividends, business profit) — reinvestable.
function yieldCash(p) {
  const A = CONFIG.assets;
  let pi = 0;
  pi += p.holdings.index * A.index.yield;
  pi += p.holdings.property * A.property.yield - p.mortgage * A.property.mortgageRate;
  pi += p.holdings.shares * A.shares.yield;
  if (!p.businessFailed) pi += p.holdings.business * A.business.yield;
  return pi;
}

// Investable net worth (excludes the home you live in — you can't spend it).
function netWorth(p) {
  let nw = p.cash;
  for (const t of ["index", "property", "shares", "crypto", "business"]) nw += p.holdings[t];
  nw -= p.mortgage;
  return nw;
}

// THE WIN METRIC: the 4% rule. You're financially free when a safe 4% annual
// withdrawal from your net worth covers your expenses (net worth >= 25× expenses).
function passiveIncome(p) {
  return netWorth(p) * 0.04;
}

function salary(p, rng) {
  const r = CONFIG.ranks[p.rank];
  if (r.volatility) return r.salary * (1 + (rng() - 0.5) * 2 * r.volatility);
  return r.salary;
}

function buyAsset(p, type) {
  const A = CONFIG.assets[type];
  if (p.cash < A.minBuy) return false;
  if (type === "property") {
    // leverage: pay deposit, take mortgage for the rest of a min-size parcel
    const parcel = A.minBuy;
    const deposit = parcel * A.deposit;
    if (p.cash < deposit) return false;
    p.cash -= deposit;
    p.holdings.property += parcel;
    p.mortgage += parcel - deposit;
    return true;
  }
  // spend most of available cash into the asset (keep a small buffer)
  const spend = Math.max(A.minBuy, p.cash - 3000);
  if (spend < A.minBuy) return false;
  p.cash -= spend;
  p.holdings[type] += spend;
  return true;
}

function takeAction(p, s) {
  // 1) climb to target rank if affordable focus-year (model upgrade as free action; salary rises now)
  if (p.rank < s.targetRank) {
    // Business rank needs capital seeded; others are time/effort
    if (s.targetRank === 3 && p.rank === 2 && p.holdings.business < CONFIG.assets.business.minBuy) {
      // need to fund the business first
    } else {
      p.rank++;
      return;
    }
  }
  // 2) apply downsize immediately (one-time stance)
  if (p.downsize < s.downsize) { p.downsize = s.downsize; return; }
  // 3) buy home outright once affordable (kills housing slice)
  if (s.buyHome && !p.homeOwned && p.cash > 180000) {
    p.cash -= 180000; p.homeOwned = true; return;
  }
  // 4) deleverage once a property base exists — flips negative carry positive
  if (s.payDown && p.mortgage > 0 && p.holdings.property >= CONFIG.assets.property.minBuy * 2 && p.cash > 15000) {
    const pay = Math.min(p.mortgage, p.cash - 5000);
    p.cash -= pay; p.mortgage -= pay; return;
  }
  // 5) buy assets in priority order
  for (const type of s.buyOrder) {
    if (buyAsset(p, type)) return;
  }
}

function stepYear(p, s, age, rngPersonal, marketZ, crash) {
  // income
  p.cash += salary(p, rngPersonal) + yieldCash(p);
  // expenses
  p.cash -= expenses(p);
  // life event (bounded — the ~25% luck)
  if (rngPersonal() < CONFIG.event.chance) {
    let delta = CONFIG.event.min + rngPersonal() * (CONFIG.event.max - CONFIG.event.min);
    p.cash += delta;
  }
  // market roll on appreciation (shared marketZ across players that year)
  for (const type of ["index", "property", "shares", "crypto", "business"]) {
    const A = CONFIG.assets[type];
    if (p.holdings[type] <= 0) continue;
    let app = A.appMean + A.appStd * marketZ;
    if (crash && (type === "shares" || type === "crypto" || type === "business")) app += CONFIG.marketCrashHit;
    p.holdings[type] *= 1 + app;
    if (type === "business" && !p.businessFailed && rngPersonal() < A.failChance) {
      p.holdings.business *= 0.4; p.businessFailed = true; // a hit, not total wipeout
    }
  }
  if (p.cash < 0) p.cash = 0; // can't go below zero; missed opportunities instead of debt spiral
  // realize gains: shift a fraction of appreciation-asset value into yielding index
  if (s.realize && p.holdings.shares > 20000) {
    const shift = p.holdings.shares * s.realize;
    p.holdings.shares -= shift;
    p.holdings.index += shift;
  }
  // action
  takeAction(p, s);
  // win?
  return passiveIncome(p) >= expenses(p);
}

// ----------------------------- run one game (4-player race) -----------------------------
function playGame(seed) {
  const names = Object.keys(STRATEGIES);
  const players = names.map((n) => newPlayer(n));
  const rngs = names.map((_, i) => mulberry32(seed * 31 + i + 1));
  const market = mulberry32(seed * 97 + 7); // shared market stream
  const freedomAge = {};
  let winner = null;

  for (let age = CONFIG.startAge; age <= CONFIG.maxAge; age++) {
    const marketZ = gauss(market);
    const crash = market() < CONFIG.marketCrashChance;
    for (let i = 0; i < players.length; i++) {
      if (freedomAge[names[i]]) continue;
      const free = stepYear(players[i], STRATEGIES[names[i]], age, rngs[i], marketZ, crash);
      if (free) {
        freedomAge[names[i]] = age;
        if (!winner) winner = names[i];
      }
    }
    if (winner && Object.keys(freedomAge).length === players.length) break;
  }
  return { winner, freedomAge, names };
}

// ----------------------------- Monte Carlo -----------------------------
const N = 2000;
const names = Object.keys(STRATEGIES);
const wins = Object.fromEntries(names.map((n) => [n, 0]));
const freedAges = Object.fromEntries(names.map((n) => [n, []]));
let noWinner = 0;

for (let g = 0; g < N; g++) {
  const { winner, freedomAge } = playGame(g + 1);
  if (winner) wins[winner]++; else noWinner++;
  for (const n of names) if (freedomAge[n]) freedAges[n].push(freedomAge[n]);
}

function stats(arr) {
  if (!arr.length) return { n: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return { n: arr.length, mean, sd };
}

console.log(`\nMoney Town balance — ${N} games (4-player race), Tradesperson\n`);
console.log("Strategy".padEnd(18), "Win%".padStart(7), "Free%".padStart(7), "AgeFree".padStart(9), "±sd".padStart(6));
for (const n of names) {
  const s = stats(freedAges[n]);
  const winPct = ((wins[n] / N) * 100).toFixed(1);
  const freePct = ((s.n / N) * 100).toFixed(0);
  const age = s.n ? s.mean.toFixed(1) : "—";
  const sd = s.n ? s.sd.toFixed(1) : "—";
  console.log(n.padEnd(18), `${winPct}%`.padStart(7), `${freePct}%`.padStart(7), String(age).padStart(9), String(sd).padStart(6));
}
console.log(`\nGames with no winner by 65: ${((noWinner / N) * 100).toFixed(1)}%`);

// Meaningful readouts:
// 1) Parity — how close win rates are. Top strategy near 25% = no dominant
//    strategy. Near 100% = one path dominates.
// 2) Per-strategy luck — CV (sd / mean) of freedom age. Low = your outcome is
//    reliably skill-driven; high = swingy / luck-driven (the risky paths).
const topWin = Math.max(...names.map((n) => wins[n] / N));
console.log(`\nParity: top strategy wins ${(topWin * 100).toFixed(0)}%  (25% = perfectly balanced; <~35% = no dominant strategy)`);
console.log("Per-strategy luck (CV of freedom age — lower = more skill-driven):");
for (const n of names) {
  const st = stats(freedAges[n]);
  if (st.n) console.log("  " + n.padEnd(18) + (100 * st.sd / st.mean).toFixed(0) + "%");
}
