// Capture the two rare screens (reaction prompt, win screen) by seeding save states.
import { chromium } from "playwright"

const base = {
  id: "p1", name: "Mia", emoji: "🦄", color: "red", age: 30, cash: 50000,
  skills: { moneySmarts: 5, proSkills: 4, grit: 4, bigBrain: 4 },
  talentTokens: 1, gigId: "lemonade",
  phase1Reel: ["card", "card", "minigame", "minigame"], phase1ReelCursor: 4,
  pendingReveal: null, careerId: "tradesperson",
  qualifiedCareers: ["tradesperson", "teacher", "tycoon"],
  qualificationRank: 2, apprenticeshipYears: 3, hasTools: true,
  lifestyleBracketDelta: 0, ownsHome: false, insured: true,
  assets: [
    { uid: "a1", classId: "resi", value: 112000, loanBalance: 80000, modifiers: [] },
    { uid: "a2", classId: "index", value: 58000, loanBalance: 0, modifiers: [] },
  ],
  debts: [], apprentices: 1,
  hand: [{ id: "PWR-D01", uid: "hh-1" }, { id: "PWR-E01", uid: "dd-1" }],
  permanents: ["PER-01"], usedOncePerGame: [], powerUpPlayedThisTurn: false,
  blockedActions: [], redTapeExpiresAge: null, salaryModThisYear: 1,
  headhuntExpiresAge: null, permanentSalaryMult: 1, staffQuitUnpaid: false,
  hotTipAssetUid: null, doubleIncomeAssetUid: null, taxBreakThisYear: false,
  secondActionAvailable: false, injuriesSurvived: 1, crashesSurvived: 0, hasWon: false,
}
const leo = { ...base, id: "p2", name: "Leo", emoji: "🦊", color: "blue", cash: 22000, hand: [], permanents: [], assets: [{ uid: "b1", classId: "savings", value: 90000, loanBalance: 0, modifiers: [] }], apprentices: 0 }

function makeState(over) {
  return {
    schemaVersion: 1, seed: 42, rngCursor: 100,
    players: [structuredClone(base), structuredClone(leo)],
    phaseOf: { p1: "phase3", p2: "phase3" },
    currentPlayerIndex: 0, turnStage: "action",
    pendingAction: null, pendingSpin: null, pendingReaction: null,
    lastSettlement: null, winnerId: null, log: [], ...over,
  }
}

// 1) reaction prompt: TRD-N01 injury hitting Mia who holds Hard Hat
const reactionState = makeState({
  turnStage: "reaction",
  pendingSpin: { reelCard: "TRD-N01", reelKind: "career", minigameId: null, assetRolls: [] },
  pendingReaction: { targetPlayerId: "p1", trigger: { kind: "careerCard", code: "TRD-N01" }, eligibleCardUids: ["hh-1"] },
})

// 2) win screen: Mia free
const winState = makeState({ turnStage: "gameOver", winnerId: "p1" })
winState.players[0].hasWon = true
winState.players[0].age = 36
winState.players[0].ownsHome = true
winState.players[0].assets = [
  { uid: "a1", classId: "resi", value: 180000, loanBalance: 0, modifiers: [] },
  { uid: "a3", classId: "commercial", value: 320000, loanBalance: 0, modifiers: [] },
  { uid: "a2", classId: "index", value: 250000, loanBalance: 0, modifiers: [] },
]
winState.players[0].apprentices = 2

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 430, height: 900 } })

async function shootWith(state, name) {
  await page.goto("http://localhost:3000/dev-dream-life")
  await page.evaluate(blob => localStorage.setItem("dream-life:save:v1", blob), JSON.stringify({ schemaVersion: 1, savedAt: "2026-06-11", state }))
  await page.reload()
  await page.waitForLoadState("networkidle")
  if (await page.getByText("How to Win").first().isVisible().catch(() => false)) await page.getByText("Skip").first().click()
  const resume = page.getByText("Resume your lives").first()
  if (await resume.isVisible().catch(() => false)) await resume.click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `screenshots/dream-life/${name}.png` })
  console.log("📸", name)
}

await shootWith(reactionState, "17-reaction-prompt")
await shootWith(winState, "18-win-screen")
// bonus: the resume lobby card itself
await page.goto("http://localhost:3000/dev-dream-life")
await page.evaluate(blob => localStorage.setItem("dream-life:save:v1", blob), JSON.stringify({ schemaVersion: 1, savedAt: "2026-06-11", state: makeState({}) }))
await page.reload()
await page.waitForLoadState("networkidle")
if (await page.getByText("How to Win").first().isVisible().catch(() => false)) await page.getByText("Skip").first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: "screenshots/dream-life/19-lobby-resume.png" })
console.log("📸 19-lobby-resume")
await browser.close()
console.log("done")
