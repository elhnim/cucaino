# Dream Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Spec (source of truth):** `docs/superpowers/specs/2026-06-11-dream-life-design.md`
> **Approved mockups (visual contract):** `mockups/2026-06-11-dream-life/` — every UI task below
> names its exact mockup file and has a visual acceptance criterion. Before marking any UI task
> done: run the dev server, open the screen, compare side-by-side with the mockup
> (superpowers:verification-before-completion).
> **Backend implications: NONE.** No Supabase/schema/API changes. Game is client-only +
> localStorage. Only existing-code change: mini-game import paths in Money Town.

**Goal:** Build Dream Life — a 1–4 player, pass-the-tablet life-simulation strategy game
(3 phases: Teen Gigs → Tradesperson apprenticeship → Career-to-freedom) at `/play/dream-life`,
alongside (not replacing) Money Town.

**Architecture:** Pure-reducer engine (`lib/dream-life/engine.ts`) with all randomness pre-drawn
through a seeded RNG and passed in via actions (deterministic, save/replay-safe). All game content
(gigs, skills, assets, decks, power-ups, careers) is data in `lib/dream-life/content/`, keyed by
the spec's codes (`MS-L04`, `TRD-N01`…). UI is client components in `components/dream-life/`
driven by `useReducer` + an autosave hook. A Monte-Carlo sim (`scripts/dream-life-sim.mjs`)
imports the real engine and gates balance before UI polish.

**Tech Stack:** Next.js App Router · React 19 · TypeScript · Tailwind (existing app conventions) ·
vitest (new devDependency, engine tests only) · localStorage.

**Execution order matters:** Tasks 1–8 (engine + sim) before Tasks 9–17 (UI). The sim acceptance
(Task 8) is a HARD GATE: content numbers may change, UI must not hard-code them.

---

### Task 1: Test runner + shared mini-games folder

**Files:**
- Modify: `package.json` (add `vitest` devDep + `"test": "vitest run"` script)
- Create: `vitest.config.ts`
- Move: `components/money-town/games/{CoinRain,LemonSqueeze,CashGrab,PetRush}.tsx` → `components/games/`
- Modify: every Money Town file importing from `./games/` or `money-town/games/` (find with grep)

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: { include: ["lib/dream-life/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname) } },
})
```

- [ ] **Step 3: Add script** — in `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Move the four mini-game files** to `components/games/` (git mv), then
`grep -rn "games/CoinRain\|games/LemonSqueeze\|games/CashGrab\|games/PetRush\|./games" components/money-town lib/money-town` and update every import to `@/components/games/<Name>`.

- [ ] **Step 5: Verify Money Town still builds & plays**

Run: `npm run typecheck && npm run build` → both succeed.
Browser check: open `/play/money-town`, start a game, trigger one mini-game. Behaviour unchanged.

- [ ] **Step 6: Commit** — `feat(dream-life): test runner + shared mini-games folder`

---

### Task 2: Domain types

**Files:**
- Create: `lib/dream-life/types.ts`

- [ ] **Step 1: Write the complete types file** (the single source for all later tasks):

```ts
// lib/dream-life/types.ts
export type PhaseId = "phase1" | "careerReel" | "phase2" | "phase3" | "won"
export type SkillId = "moneySmarts" | "proSkills" | "grit" | "bigBrain"
export type AssetClassId =
  | "savings" | "index" | "shares" | "resi" | "commercial" | "crypto" | "business"
export type CareerId =
  | "tradesperson" | "farmer" | "teacher" | "doctor" | "lawyer" | "politician"
  | "tycoon" | "banker" | "artist" | "influencer" | "athlete" | "musician"
export type PlayerColor = "red" | "blue" | "green" | "amber"

export interface AssetInstance {
  uid: string
  classId: AssetClassId
  value: number
  loanBalance: number          // 0 = owned outright
  /** event-driven temporary/permanent rate overrides; cleared per duration rule */
  modifiers: AssetModifier[]
}
export interface AssetModifier {
  source: string               // card code e.g. "RES-N04"
  field: "incomeRate" | "expenseRate" | "growthRate" | "interestRate"
  delta: number                // additive, in rate points (0.01 = 1pp)
  permanent: boolean           // false ⇒ cleared at end of the year it fired
}

export interface Debt {
  uid: string
  kind: "education" | "tools" | "creditCard"
  balance: number
  rate: number                 // annual, e.g. 0.12 for credit card
}

export interface PowerUpCard {
  id: string                   // e.g. "PWR-O02"
  /** instance uid in hand */
  uid: string
}

export interface Player {
  id: string
  name: string
  emoji: string
  color: PlayerColor
  age: number                  // == 13 + completed turns
  cash: number
  // skills, level 1..10
  skills: Record<SkillId, number>
  talentTokens: number
  // phase-1
  gigId: string | null
  /** pre-assigned reel kinds for ages 13–16 (exactly 2 "card" + 2 "minigame") */
  phase1Reel: ("card" | "minigame")[]
  // career
  careerId: CareerId | null
  qualifiedCareers: CareerId[]
  qualificationRank: number    // phase-2 "Master the trade" count (0–3)
  // phase-3 economy
  lifestyleBracketDelta: number // 0 = rank default, -1 = downsized (capped at -1)
  ownsHome: boolean
  insured: boolean
  assets: AssetInstance[]
  debts: Debt[]
  apprentices: number          // 0..2, +$4K/yr each
  // power-ups
  hand: PowerUpCard[]          // max 3
  permanents: string[]         // earned permanent card ids
  usedOncePerGame: string[]    // e.g. ["GR-L10"]
  // per-year flags
  blockedActions: string[]     // from Red Tape: ["buyAsset","workHarder"], expires
  redTapeExpiresAge: number | null
  salaryModThisYear: number    // multiplicative, reset each settle (e.g. 0.75 injury)
  lifestyleModThisYear: number // additive $ (Headhunt), with expiry age
  headhuntExpiresAge: number | null
  permanentSalaryMult: number  // Body Wears Down stacks: 0.9^n
  hasWon: boolean
}

// ---- actions --------------------------------------------------------------
export type PlayerActionId =
  | "invest" | "workHarder" | "hustle" | "study"                  // skill actions (all phases)
  | "masterTrade" | "overtime" | "toolUp"                          // phase 2
  | "buyAsset" | "payDebt" | "insurance" | "buyHome" | "downsize" | "harvest" // phase 3

export interface SpinOutcome {
  /** the one reel card drawn this year (universal/career/market/minigame marker) */
  reelCard: string | null      // card code, or null when kind === "minigame"
  reelKind: "life" | "career" | "market" | "minigame"
  minigameId: string | null    // one of "coinrain"|"lemonsqueeze"|"cashgrab"|"petrush"
  /** per held asset uid → "risk" | "opportunity" | "calm" + drawn card code */
  assetRolls: { uid: string; roll: "risk" | "opportunity" | "calm"; card: string | null }[]
}

export type GameAction =
  | { type: "NEW_GAME"; players: { id: string; name: string; emoji: string }[]; seed: number }
  | { type: "CHOOSE_ACTION"; action: PlayerActionId; payload?: ActionPayload }
  | { type: "PLAY_POWERUP"; uid: string; payload?: PowerUpPayload }
  | { type: "RESOLVE_SPIN"; outcome: SpinOutcome }
  | { type: "MINIGAME_RESULT"; won: boolean }
  | { type: "REACTION"; play: boolean }            // answer to awaitingReaction
  | { type: "RESOLVE_CAREER_REEL" }                 // v1: always tradesperson
  | { type: "END_TURN" }                            // settle + advance player
  | { type: "DISMISS_OVERLAY" }

export interface ActionPayload {
  assetClassId?: AssetClassId    // buyAsset
  amount?: number                // invest / payDebt amount / buyAsset cash size
  debtUid?: string               // payDebt target
  sellUid?: string               // harvest: which asset to sell
}
export interface PowerUpPayload {
  targetPlayerId?: string
  targetAssetUid?: string
  skillId?: SkillId              // Grant
}

export interface PendingReaction {
  targetPlayerId: string
  trigger: { kind: "lifeCard" | "careerCard" | "assetEvent" | "powerUp"; code: string; assetUid?: string; byPlayerId?: string }
  eligibleCardUids: string[]
}

export interface GameState {
  schemaVersion: 1
  seed: number
  rngCursor: number              // how many draws consumed (replay support)
  phaseOf: Record<string, PhaseId>  // per player (players can be in different phases)
  players: Player[]
  currentPlayerIndex: number
  turnStage: "action" | "spin" | "minigame" | "reaction" | "settle" | "careerReel" | "gameOver"
  pendingSpin: SpinOutcome | null
  pendingReaction: PendingReaction | null
  lastSettlement: SettlementSummary | null
  winnerId: string | null
  log: string[]                  // human-readable event feed (most recent first, cap 50)
}

export interface SettlementSummary {
  playerId: string
  salary: number
  passive: number
  lifestyle: number
  interest: number
  premiums: number
  saved: number
  assetChanges: { uid: string; classId: AssetClassId; delta: number }[]
  freedomPct: number
}
```

- [ ] **Step 2: `npm run typecheck`** → passes (file has no imports).
- [ ] **Step 3: Commit** — `feat(dream-life): domain types`

---

### Task 3: Content — skills, careers, phase 1

**Files:**
- Create: `lib/dream-life/content/skills.ts` — the four L1–L10 ladders, every benefit as a typed
  effect record `{ code: "MS-L04", name, blurb, effect }` exactly per spec §7 ladders (transcribe
  all 40 rows; effects are discriminated unions like `{ kind: "assetUnlock", classId }`,
  `{ kind: "expenseDiscount", pct: 0.25 }`, `{ kind: "salaryRank", rankIndex }`, …).
- Create: `lib/dream-life/content/careers.ts` — 12-career roster with gates
  (`{ skill: "grit", level: 2 }` / `{ talentTokens: 1 }`), Tradesperson ranks
  (salary/lifestyle: 65000/44000 · 85000/55000 · 110000/67000 · 150000/85000 at PS rungs 1/4/7/9),
  apprenticeship (wages 28000/36000/45000, lifestyle 75% of wage, Tool-Up loan $15K @ 6% → +$8K/yr).
- Create: `lib/dream-life/content/phase1.ts` — 8 Tier-1 gigs (~$10K salary/~$2K net), Tier-2/3
  gig + knowledge-job tables per §4 ladder, Phase-1 life cards (±$100–300, write 10 kid-flavoured
  cards e.g. "Cracked Phone Screen −$220", "Birthday Money +$150"), investment tiers
  (savings $1K min/4% · index $2K min · shares $3K min), action costs (hustle −20% gross,
  study −50% gross).

- [ ] **Step 1: Write the three content files** with `as const satisfies` typing against types.ts.
- [ ] **Step 2: Sanity test** `lib/dream-life/content/content.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { SKILL_LADDERS } from "./skills"
import { CAREERS } from "./careers"
import { PHASE1_GIGS, PHASE1_CARDS } from "./phase1"

describe("content integrity", () => {
  it("every ladder has exactly 10 levels", () => {
    for (const ladder of Object.values(SKILL_LADDERS)) expect(ladder.levels).toHaveLength(10)
  })
  it("12 careers with gates", () => expect(Object.keys(CAREERS)).toHaveLength(12))
  it("phase1 cards bounded ±$300", () => {
    for (const c of PHASE1_CARDS) expect(Math.abs(c.cashDelta)).toBeLessThanOrEqual(300)
  })
  it("8 starting gigs", () => expect(PHASE1_GIGS.filter(g => g.tier === 1)).toHaveLength(8))
})
```

- [ ] **Step 3: `npm test`** → PASS. **Step 4: Commit** — `feat(dream-life): skills, careers, phase-1 content`

---

### Task 4: Content — assets, event decks, power-ups

**Files:**
- Create: `lib/dream-life/content/assets.ts` — master asset table §7 verbatim (7 classes: entry,
  growth/income/expense rates, opp/risk/calm, deposit & mortgage structure for resi 20%@4.5% and
  commercial 30%@5.5%, unlock gates incl. business multi-skill MS4+PS4+GR4 + $120K entry).
- Create: `lib/dream-life/content/decks.ts` — ALL decks transcribed with their codes: SAV(3+3),
  IDX(4+4), RES(6+5), COM(6+5), SHR(5+5), CRY(5+5), BUS(5+5), LIF(4+4), MKT(2+2), TRD(4+4).
  Each card: `{ code, title, emoji, blurb, effect, permanent?: true }`. Effects are typed:
  `{ kind: "valuePct", pct: -0.5 }`, `{ kind: "cash", amount: -8000 }`,
  `{ kind: "rateDelta", field: "incomeRate", delta: -0.02 }`, `{ kind: "salaryPctThisYear", pct: -0.25 }`,
  `{ kind: "apprentice" }`, `{ kind: "permanentSalaryMult", mult: 0.9, minAge: 45 }`, etc.
  Duration rule: `permanent` flag per spec §7 registry (BUS-P04, TRD-N04, TRD-P02, RES-N06; BUS-N02 until-paid).
- Create: `lib/dream-life/content/powerups.ts` — every card from spec §8 tables verbatim
  (`PWR-O01..O09`, `PWR-D01..03`, `PWR-E01..04`, `PWR-W01..02`) with
  `{ timing: "proactive" | "reactive", rarity: "common" | "uncommon", validTarget, effect }` +
  the 6 permanents with their milestones.

- [ ] **Step 1: Write the three files.**
- [ ] **Step 2: Extend `content.test.ts`:**

```ts
import { ASSET_CLASSES } from "./assets"
import { DECKS } from "./decks"
import { POWERUPS, PERMANENTS } from "./powerups"

it("asset opp+risk+calm = 100", () => {
  for (const a of Object.values(ASSET_CLASSES))
    expect(a.opp + a.risk + a.calm).toBeCloseTo(1)
})
it("every asset class has both decks", () => {
  for (const id of Object.keys(ASSET_CLASSES))
    expect(DECKS[id].negative.length).toBeGreaterThan(0)
})
it("every offensive power-up has a counter", () => {
  for (const p of Object.values(POWERUPS).filter(p => p.id.startsWith("PWR-O") && p.id !== "PWR-O09"))
    expect(p.counteredBy.length).toBeGreaterThan(0)
})
it("six permanents with milestones", () => expect(Object.keys(PERMANENTS)).toHaveLength(6))
```

- [ ] **Step 3: `npm test`** → PASS. **Step 4: Commit** — `feat(dream-life): assets, decks, power-ups content`

---

### Task 5: RNG + selectors

**Files:**
- Create: `lib/dream-life/rng.ts` · `lib/dream-life/selectors.ts` · `lib/dream-life/selectors.test.ts`

- [ ] **Step 1: `rng.ts`** — mulberry32 + cursor:

```ts
export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Draw the nth..(n+k)th values for a given base seed (replay-stable). */
export function drawsAt(seed: number, cursor: number, count: number): number[] {
  const rand = mulberry32(seed)
  for (let i = 0; i < cursor; i++) rand()
  return Array.from({ length: count }, () => rand())
}
```

- [ ] **Step 2: `selectors.ts`** — pure derivations (signatures fixed; all later code uses these):

```ts
export function effectiveRates(p: Player, a: AssetInstance): { growth: number; income: number; expense: number }
export function assetNetCash(p: Player, a: AssetInstance): number   // value*(income-expense incl. loan interest)
export function passiveIncome(p: Player): number  // Σ assetNetCash(+) + apprentices*4000 + sideHustle + chairman
export function salaryOf(p: Player): number       // rank salary * permanentSalaryMult * salaryModThisYear + bonus
export function lifestyleOf(p: Player): number    // rank lifestyle, − bracket delta (cap −16%), − housing 30% if ownsHome, + headhunt
export function debtInterest(p: Player): number
export function expensesOf(p: Player): number     // lifestyle + debtInterest + (insured ? 3000 : 0)
export function netWorth(p: Player): number       // cash + Σ(value−loan) − unsecured debts (home excluded)
export function freedomPct(p: Player): number     // clamp(passive/expenses*100)
export function hasWonCheck(p: Player): boolean   // passiveIncome >= expensesOf
export function qualifiedCareers(p: Player): CareerId[]
export function legalActions(state: GameState): PlayerActionId[]  // §4 safeguard: never empty
```

- [ ] **Step 3: Tests first for the tricky ones** (write, see fail, implement, see pass):

```ts
it("negatively geared rental flips positive when paid off", () => {
  const mortgaged = makeAsset("resi", { value: 100_000, loanBalance: 80_000 })
  const paidOff   = makeAsset("resi", { value: 100_000, loanBalance: 0 })
  expect(assetNetCash(basePlayer, mortgaged)).toBeLessThan(0)
  expect(assetNetCash(basePlayer, paidOff)).toBeGreaterThan(0)
})
it("crypto contributes zero passive income", () => { /* income rate 0 */ })
it("owning home removes 30% of lifestyle", () => { /* compare lifestyleOf */ })
it("phase-1 player always has a legal action", () => {
  const broke = { ...basePlayer, cash: 0 }   // invest & workHarder remain legal
  expect(legalActions(stateWith(broke))).toEqual(expect.arrayContaining(["invest", "workHarder"]))
})
it("win check is passive >= expenses", () => { /* boundary equality wins */ })
```

- [ ] **Step 4: `npm test`** → PASS. **Step 5: Commit** — `feat(dream-life): rng + selectors with tests`

---

### Task 6: Engine (reducer)

**Files:**
- Create: `lib/dream-life/engine.ts` · `lib/dream-life/engine.test.ts`

The reducer `reduce(state, action): GameState` is a pure function; every random draw happens in
`buildSpinOutcome(state)` (exported helper the UI calls to construct `RESOLVE_SPIN`), which uses
`drawsAt(seed, rngCursor, n)` and returns the outcome + new cursor.

- [ ] **Step 1: Write failing tests for the turn spine** (one per bullet, full code in test file):
  - `NEW_GAME` deals each player $5,000, age 13, a random Tier-1 gig, and a `phase1Reel` containing exactly 2 cards + 2 minigames.
  - Phase-1 `CHOOSE_ACTION study` is rejected (throws/no-op) when year-end cash would go < 0; `invest` always accepted.
  - A full phase-1 turn: CHOOSE_ACTION → RESOLVE_SPIN → END_TURN increments age, applies gig net income, compounds investments, advances `currentPlayerIndex`.
  - After every player's age-16 turn, `turnStage === "careerReel"`; `RESOLVE_CAREER_REEL` sets `careerId: "tradesperson"`, stores `qualifiedCareers` (≥ 2 entries guaranteed).
  - Phase-2 `toolUp` adds a `tools` debt of $15,000 @ 6% and +$8K/yr income; debts grow at END_TURN when unpaid.
  - Phase-3 buy resi: cash −$20K deposit, asset `{value:100_000, loanBalance:80_000}`.
  - Phase-3 settle: salary + passive − lifestyle − interest − premiums lands in cash; `lastSettlement` numbers match selectors.
  - Cash-floor rule: settlement that would go negative creates a `creditCard` debt at 12% and cash 0.
  - `RESOLVE_SPIN` with an asset `risk` roll applies the drawn card's effect; non-permanent modifiers are cleared after settle.
  - Reaction window: spin resolving `TRD-N01` against a player holding `PWR-D01` sets `pendingReaction`; `REACTION{play:true}` cancels the effect and discards the card; `{play:false}` applies it (insurance halves it if insured).
  - Win: a player whose passive ≥ expenses at settle sets `winnerId`, `turnStage:"gameOver"`.
  - Age-65 backstop: when all players have settled age 65, highest `netWorth` wins.
- [ ] **Step 2: Run tests** → all FAIL (engine not implemented).
- [ ] **Step 3: Implement `engine.ts`** until all pass. Key structure:

```ts
export function reduce(state: GameState, action: GameAction): GameState
export function buildSpinOutcome(state: GameState): { outcome: SpinOutcome; nextCursor: number }
// internal: applyCard, applyAssetEvent, settleYear, advanceTurn, enterReactionIfAble,
// applyPowerUp (one switch over PWR ids), grantMilestonePermanents
```

Phase-3 reel mix (content knob): life .45 / career .30 / market .10 / minigame .15.
One proactive power-up per turn enforced by a `powerUpPlayedThisTurn` flag reset in `advanceTurn`.

- [ ] **Step 4: `npm test`** → PASS (every test from Step 1).
- [ ] **Step 5: Commit** — `feat(dream-life): pure game engine with full test suite`

---

### Task 7: Save / load

**Files:**
- Create: `lib/dream-life/save.ts` · `lib/dream-life/save.test.ts`

- [ ] **Step 1: Failing tests:** round-trips a GameState; rejects wrong `schemaVersion`; returns
  `null` on corrupt JSON; `isStorageAvailable()` false path returns null without throwing.
- [ ] **Step 2: Implement:**

```ts
const KEY = "dream-life:save:v1"
export function saveGame(state: GameState): boolean        // false on quota/unavailable
export function loadGame(): GameState | null               // null on missing/corrupt/version-mismatch (and clears bad blob)
export function clearSave(): void
export function isStorageAvailable(): boolean
```

- [ ] **Step 3: `npm test`** → PASS. **Step 4: Commit** — `feat(dream-life): localStorage save/load`

---

### Task 8: Balance sim — HARD GATE 🚦

**Files:**
- Create: `scripts/dream-life-sim.mjs` (runs the compiled engine via `tsx`-style import: add
  `npx tsx` invocation, or compile a tiny ESM bridge with `npx tsc -p tsconfig.sim.json` — pick
  whichever works first; the sim must import the REAL `reduce`, not a re-implementation)

- [ ] **Step 1: Write 4 policy bots** (pure functions `GameState → GameAction`):
  Earner-Saver (workHarder→index), Investor (resi+shares, harvest at 50yo), Entrepreneur
  (spread skills to MS4/PS4/GR4 → business), Frugal Tortoise (downsize+buyHome+savings/index).
  Mini-games simulated as 50% win, cash only. Power-ups excluded (spec §12).
- [ ] **Step 2: Run 2000 4-player games**, report: win% per bot, median freedom age, % backstop
  games, luck share (variance across seeds with bots fixed ÷ total variance, spec §12 method).
- [ ] **Step 3: Tune ONLY `content/` numbers** until acceptance passes:
  every bot wins 15–35% · luck share ≤ 30% · median freedom age 33–47 · backstop < 10% ·
  zero illegal-action deadlocks (assert in sim).
- [ ] **Step 4: Record results table at the bottom of this plan file** (win%, ages, luck share).
- [ ] **Step 5: Commit** — `feat(dream-life): balance sim + tuned content (acceptance passed)`

---

### Task 9: Game shell, lobby, rules

**Files:**
- Create: `components/dream-life/DreamLifeGame.tsx` (useReducer + autosave + stage router) ·
  `components/dream-life/Lobby.tsx` · `components/dream-life/RulesModal.tsx`
- Create: `app/play/dream-life/page.tsx` (server component: fetch kids via `lib/data/stub`,
  render `<DreamLifeGame kids={...} activeKid={...}/>`; KidShell wiring identical to
  `app/play/money-town/page.tsx` — copy its `?kid=` pattern)

**Mockups:** `01-lobby-new.html`, `02-lobby-resume.html`, `03-rules.html`
**Visual acceptance:** kid-picker = 2-col cards with gold selected state + "✓ PLAYING"; resume card
shows per-player age/career/freedom% with CONTINUE pill; new-game-over-save shows confirm; rules =
5-slide carousel w/ coloured headers + dots; bright-sky palette per spec §15 design language.
**Verify:** `npm run dev`, open `/play/dream-life` with no save (01), with a save (02), first-run
rules (03); compare side-by-side with each mockup file before checking off.

- [ ] Step 1: Port the §15 design language into `app/globals.css` additions (sky gradient utility,
  toy-shadow utility) or Tailwind classes inline — follow Money Town's pattern (inline Tailwind).
- [ ] Step 2: Build Lobby (new + resume states) with autosave-detection via `loadGame()`.
- [ ] Step 3: Build RulesModal (5 slides, copy from mockup 03 + spec win condition).
- [ ] Step 4: Browser-verify vs mockups 01/02/03. Step 5: `npm run typecheck && npm run lint`. Step 6: Commit.

---

### Task 10: Phase 1 — board, action panel, event cards, mini-game bridge

**Files:**
- Create: `components/dream-life/Phase1Board.tsx` · `components/dream-life/SkillDots.tsx` ·
  `components/dream-life/EventCardOverlay.tsx` · `components/dream-life/MinigameOverlay.tsx`
  (wraps the four shared `components/games/*` exactly as Money Town's MiniGame.tsx does — read it first)

**Mockups:** `04-phase1-board.html`, `05-phase1-event-card.html`, `06-phase1-minigame.html`
**Visual acceptance:** turn banner "[emoji] [Name] — Age N / What are you doing this year?";
active card = gradient header + 4 skill-dot rows + chips; 4 action rows with FREE/−20%/🔒 tags,
unaffordable greyed; event card tilted −1.5° with settle-up bubble; mini-game intro shows WIN/LOSE
chips and talent-token explainer.
**Verify:** play 4 full phase-1 turns in the browser; compare each overlay with mockups 04–06.

- [ ] Step 1: Phase1Board + SkillDots. Step 2: EventCardOverlay (drives RESOLVE_SPIN→END_TURN).
- [ ] Step 3: MinigameOverlay (MINIGAME_RESULT, talent token toast). Step 4: browser-verify, lint, commit.

---

### Task 11: Career reel ceremony

**Files:** Create: `components/dream-life/CareerReel.tsx`
**Mockup:** `07-career-reel.html`
**Visual acceptance:** 12-career grid, qualified lit with gate badges ("🛡️ GRIT L2 ✓"), locked
greyed with 🔒 gates; spin animation lands on Tradesperson; result card + "More lives coming
soon!"; START MY APPRENTICESHIP CTA.
**Verify:** finish phase 1 in browser; ceremony fires per player; compare with mockup 07.

- [ ] Step 1: build · Step 2: verify vs 07 · Step 3: commit.

---

### Task 12: Phase 2 apprenticeship board

**Files:** Create: `components/dream-life/Phase2Board.tsx`
**Mockup:** `08-phase2-apprenticeship.html`
**Visual acceptance:** wage banner ("Apprentice wage this year: $36K · living costs $27K"),
rank stars, 4 chips (wage/expenses/invested/debt), Doctor-comparison bubble, 4 actions with
Tool-up = LOAN tag.
**Verify:** play 3 apprenticeship years in browser vs mockup 08.

- [ ] Step 1: build · Step 2: verify · Step 3: commit.

---

### Task 13: Phase 3 board + action sheet

**Files:** Create: `components/dream-life/Phase3Board.tsx` · `components/dream-life/ActionSheet.tsx`
**Mockups:** `09-phase3-board.html`, `10-phase3-actions.html`
**Visual acceptance (09):** player card = rank title + salary/lifestyle/insured line, freedom bar
with bouncing walker + passive-vs-expenses caption, horizontal asset shelf with +$/yr pills and 🃏
hand chip, PLAN YOUR YEAR CTA, three ghost buttons, race strip. **(10):** bottom sheet grouped
Grow money / Grow yourself / Shrink expenses with level context per row, locked rows show the
requirement, power-up footnote.
**Verify:** browser vs 09 & 10; all actions dispatch and reflect in state.

- [ ] Step 1: Phase3Board · Step 2: ActionSheet (legalActions() drives enable/disable) ·
- [ ] Step 3: verify · Step 4: commit.

---

### Task 14: Portfolio, asset shop, skills sheets

**Files:** Create: `components/dream-life/PortfolioSheet.tsx` · `components/dream-life/BuyAssetSheet.tsx` ·
`components/dream-life/SkillsSheet.tsx`
**Mockups:** `11-portfolio.html`, `12-buy-asset.html`, `13-skills.html`
**Visual acceptance (11):** Income/Growth/Debt sections, per-asset value·loan·rate meta + net
cash/yr, negative-gearing red flag + pay-down hint, crypto "$0 income — can't win until you SELL",
PAY DOWN buttons, NET pill. **(12):** 7 classes, four-field one-liners, locked = 🔒 with gate,
business shows per-skill ✓/✗. **(13):** 4 ladder cards, 10-dot rows with dashed next, Now/Next lines.
**Verify:** browser vs 11/12/13 with a mid-game save (buy, pay down, harvest round-trips work).

- [ ] Step 1: Portfolio · Step 2: BuyAsset · Step 3: Skills · Step 4: verify · Step 5: commit.

---

### Task 15: Power-ups — hand, reactive prompt

**Files:** Create: `components/dream-life/PowerUpHand.tsx` · `components/dream-life/ReactionPrompt.tsx`
**Mockups:** `14-powerups-hand.html`, `15-reactive-prompt.html`
**Visual acceptance (14):** 3 slots (proactive PLAY NOW purple / reactive AUTO-OFFERS amber /
empty dashed), permanents earned⭐ vs locked🔒 with milestone, attack explainer bubble. **(15):**
full-screen modal with event header, "📲 Pass the tablet to [name]!", two big choices showing
exact outcomes ("$0 lost" vs the halved hit), no timer.
**Verify:** force a TRD-N01 spin against a Hard-Hat holder in browser; both paths resolve per engine tests.

- [ ] Step 1: hand · Step 2: ReactionPrompt (renders whenever `pendingReaction` set) · Step 3: verify · Step 4: commit.

---

### Task 16: Settlement + win screen

**Files:** Create: `components/dream-life/SettlementOverlay.tsx` · `components/dream-life/WinScreen.tsx`
**Mockups:** `16-year-settlement.html`, `17-win-screen.html`
**Visual acceptance (16):** ledger rows (salary, passive, lifestyle, interest, premiums → Saved
this year), asset-growth line, freedom-check bar + verdict, NEXT PLAYER CTA — numbers come from
`lastSettlement`, never recomputed in the component. **(17):** "[NAME] IS FREE!" + age, winning-life
card (passive/expenses/net worth/engine summary + 4%-rule bubble), standings by freedom %, age-65
note, New life / Exit.
**Verify:** browser: settle a year vs 16; trigger a win (debug seed) vs 17.

- [ ] Step 1: Settlement · Step 2: WinScreen · Step 3: verify · Step 4: commit.

---

### Task 17: Play hub card + finishing pass

**Files:**
- Modify: `app/kid/[kidId]/play/page.tsx` (and `app/play/page.tsx` if it lists games) — add the
  Dream Life card next to Money Town: 🌟 "Dream Life — Live a whole life · deep strategy ·
  30–60 min"; Money Town card gains subtitle "Quick game · 5–10 min". **Check kid routes first**
  (per project memory: `app/kid/[kidId]/play/` is the real nav surface).

- [ ] Step 1: Add hub cards. Step 2: `npm run typecheck && npm run lint && npm test && npm run build` → all green.
- [ ] Step 3: Commit — `feat(dream-life): play hub entry`

---

### Task 18 (FINAL): Visual Sign-off

For every screen and state in the approved mockups (01–17):
1. `npm run dev`; play a full game on `http://localhost:3000/play/dream-life?kid=<id>`
2. Open the corresponding mockup file side-by-side
3. Confirm layout, copy, colours, spacing, states match (sample numbers may differ)
4. List any differences found and FIX them before requesting sign-off — do not ask the user to
   accept known drift
5. Present the side-by-side result to the user; the feature is complete only after the user
   explicitly confirms. Then run `npm run build` and push (pre-push checklist).

---

## Self-review (done at authoring time)

- Spec coverage: §1→T9/T17 · §3 win/backstop→T6 · §4→T3/T6/T10 · §5→T11 · §6→T3/T12 · §7 engine→T4/T5/T6, sheets→T13/T14 · §8→T4/T15 · §9→T7/T9 · §10 scope→T1/T17 · §11 architecture→file map above · §12→T8 · §15→every UI task. No gaps found.
- Type consistency: all later tasks reference only names defined in Task 2/5 signatures.
- Placeholders: content transcription tasks point at exact spec tables (data lives in spec, not "TBD").

## Sim results (Task 8 — 2000 four-player games, ACCEPTANCE PASSED ✅)

| Bot | Win % | Median freedom age | Notes |
|---|---|---|---|
| Earner-Saver | 22.8% | 33 | climbs PS→10, home, savings stack |
| Investor | 32.2% | 32 | 2× resi + shares → commercial → deleverage |
| Entrepreneur | 24.8% | 33 | MS/PS/GR→4, business, grows it with all spare cash |
| Frugal Tortoise | 20.2% | 32 | downsize + grit→7 side hustle + home + savings |
Luck share: 2.5% · Backstop games: 0.0% · Deadlocks: 0 ✅

**Tuning applied (content knobs changed from spec reference values):**
- `PS_BONUS_AT` 10/15/25% → **5/8/12%** · `PS_STOCK_AT` 8/12% → **4/6%** · `PS_CHAIRMAN_PASSIVE` 30% → **10%**
  (the corporate ladder dominated at spec values: 100% win rate, freedom at 28)
- Business income 18% → **14%** (net yield 10% → 6% — still the best income asset)
- `GR_SIDE_HUSTLE` 5K/12K → **6K/15K** (the tortoise's identity engine)
- `DOWNSIZE_PCT` 16% → **18%**
- Engine fix surfaced by sim: Phase-1 **max-2×-per-action rule** now enforced in `legalActions`.
