// One-off trace of a single-bot game to debug balance. Run: npx tsx scripts/dream-life-debug.mjs
import { buildNewGame, buildSpinOutcome, reduce } from "../lib/dream-life/engine.ts"
import { expensesOf, passiveIncome } from "../lib/dream-life/selectors.ts"

let s = buildNewGame([{ id: "earnerSaver-0", name: "e", emoji: "🤖" }], 1234)
let guard = 0
while (s.turnStage !== "gameOver" && guard++ < 400) {
  const p = s.players[0]
  if (s.turnStage === "careerReel") { s = reduce(s, { type: "RESOLVE_CAREER_REEL" }); continue }
  if (s.turnStage === "action") {
    let a
    const ph = s.phaseOf[p.id]
    if (ph === "phase1") a = { type: "CHOOSE_ACTION", action: "workHarder" }
    else if (ph === "phase2") a = { type: "CHOOSE_ACTION", action: "masterTrade" }
    else if (p.skills.proSkills < 10) a = { type: "CHOOSE_ACTION", action: "workHarder" }
    else if (!p.insured) a = { type: "CHOOSE_ACTION", action: "insurance" }
    else if (p.cash > 10000) a = { type: "CHOOSE_ACTION", action: "buyAsset", payload: { assetClassId: "savings", amount: p.cash - 5000 } }
    else a = { type: "CHOOSE_ACTION", action: "downsize" }
    const b = s
    s = reduce(s, a)
    if (s === b) s = reduce(s, { type: "CHOOSE_ACTION", action: "invest" })
    continue
  }
  if (s.turnStage === "spin") { const { outcome, nextCursor } = buildSpinOutcome(s); s = reduce(s, { type: "RESOLVE_SPIN", outcome, nextCursor }); continue }
  if (s.turnStage === "minigame") { s = reduce(s, { type: "MINIGAME_RESULT", won: false }); continue }
  if (s.turnStage === "reaction") { s = reduce(s, { type: "REACTION", play: false }); continue }
  if (s.turnStage === "settle") {
    const me = s.players[0]
    if (s.phaseOf[me.id] === "phase3")
      console.log("age", me.age, "PS", me.skills.proSkills, "passive", passiveIncome(me), "exp", expensesOf(me, "phase3"), "cash", Math.round(me.cash), "assets", me.assets.map(x => x.classId + ":" + Math.round(x.value)).join(","))
    s = reduce(s, { type: "END_TURN" })
    continue
  }
}
const w = s.players[0]
console.log("END age", w.age, "passive", passiveIncome(w), "exp", expensesOf(w, "phase3"), "won", w.hasWon)
