# Money Town Redesign — Design Spec

## Goal

Redesign Money Town from a single-player spin screen into a Monopoly-style multiplayer board that shows all players at once, with a per-turn lever overlay, better graphics, proper kid-picker, job-assignment ceremony, and a rules page.

---

## 1. Visual Style

- **Background:** Sky-blue `#e0f2fe` page, white `#fff` card surfaces
- **Font:** Lilita One (Google Fonts) for all headings, badges, numbers; Nunito 800/900 for body
- **Topbar:** Blue gradient `#3b82f6 → #2563eb`
- **Gold hierarchy:** `#fbbf24` / `#d97706` for cash values, active buttons, lever
- **Buttons:** Flat with soft shadow (`box-shadow: 0 2px 8px`), no thick 3D press-shadow
- **Cards:** White, `border: 1.5px solid #e2e8f0`, `border-radius: 16–24px`, `box-shadow: 0 4px 20px rgba(0,0,0,0.08)`
- **Reel machine:** Red cabinet (`#ef4444`) with gold `SPIN TO WIN` marquee, dark reel window (`#1e293b`), gold active-row border

---

## 2. Lobby Screen — Kid Picker

**File:** `components/money-town/GameLobby.tsx`

- Show all family kids as **avatar cards** (emoji + name), fetched via `listKids()` in `app/play/money-town/page.tsx` and passed as a prop
- Tapping a kid card adds them as a player (card highlights, shows a checkmark)
- A **"+ Add Guest"** button opens a text-input for guests without accounts
- Min 1 player, max 4 players
- "Start Game" button is enabled once at least 1 player is added

---

## 3. Job Assignment — Spin Ceremony

Runs once at game start, before round 1, one player at a time.

- A dedicated screen (not the main board) shows the reel loaded with **job segments** instead of event segments: Artist 🎨, Chef 👩‍🍳, Mechanic 🔧, Coder 👩‍💻
- Each player pulls the lever to land on their job
- The result card shows the assigned job: name, salary/round, living expenses/round
- "Got it! Next player →" advances to the next player's job spin
- After all players have spun, transition to the main board

**Implementation note:** Replace the current `JOBS[Math.floor(Math.random() * JOBS.length)]` random assignment in `GameLobby.tsx` with the spin ceremony flow. The reel uses the same animation as the game reel.

---

## 4. Main Board Screen

**Always visible between turns.** Replaces the current single-player spin screen as the primary game view.

### Layout

- **Header bar:** "💰 Money Town" title (Lilita One) + "ROUND N" badge (gold)
- **Turn banner:** "🎰 [NAME]'S TURN" + "Pull Lever ›" action chip — highlights whose turn it is
- **2×2 player grid** (or 1-col list for 1–2 players): one card per player
- **Bottom action button:** "🎰 Pull the Lever — [Name]'s Turn" — opens the lever overlay

### Player Card

Each card shows:
- Avatar emoji + name + job emoji + salary
- Cash on hand (Lilita One, gold)
- **Rat Race Escape track:** horizontal progress bar, orange fill, percentage label. Fill = `passive / job.expenses * 100`. Milestones at 25/50/75/100% show asset emojis as markers. A 🏃 runner sits at the current fill position.
- **Your Assets row:** horizontal-scrolling chips, one per owned asset, each showing `emoji + income/round`. Total passive income shown top-right of the assets section. Empty state: "No assets yet."
- Active player card: blue border + `YOUR TURN` badge
- Won player card: green border + `🏆 FREE!` badge

---

## 5. Lever Overlay (Per-Turn)

Triggered by the "Pull the Lever" button. Appears as a **modal overlay** on top of the dimmed board.

- Dark semi-transparent backdrop (`rgba(15,23,42,0.55)`) covers the board
- Centred white card (300px wide) containing:
  - **Header:** player avatar + name + job + current cash
  - **Reel machine:** red cabinet, vertical reel window, gold lever on the right
  - **"Pull the Lever!" button**
- Lever animation: knob drops 20px on click, springs back; reel spins with the easing curve from mockup (5.8s, ease-in → linear → easeOutCubic, velocity-matched at phase boundary)
- After the reel stops, automatically transitions to the **Result Card** (no dismiss button needed)

---

## 6. Result Card Overlay

Shown on top of the dimmed board after the reel stops.

Event types and their result cards:

| Segment | Card colour | Content |
|---|---|---|
| PAYDAY! 💰 | Gold gradient header | Salary + passive income − expenses = collected total. Green "COLLECT! 🎉" button |
| EXPENSE 💸 | Red gradient header | Expense description + amount deducted. "OK" button |
| DEAL! 🤝 | Green gradient header | Asset purchase offer — cost, income/round. "Buy" or "Skip" |
| MINI-GAME 🎮 | Purple gradient header | Mini-game prompt (existing mini-game flow) |
| BAD LUCK ⚡ | Dark grey header | Bad luck event description + penalty. "Ugh, OK" button |

Dismissing any result card (collect / OK / buy+skip / complete) returns to the **main board** with the next player's turn banner active.

---

## 7. Rules / How to Play Page

- Always accessible via a **"? How to Play"** button visible in the lobby and on the main board header
- Opens a full-screen modal (no new route needed)
- Content sections:
  1. **Goal:** Make your passive income ≥ your living expenses to escape the Rat Race
  2. **Your Job:** Salary each Payday, living expenses each round
  3. **The Reel:** What each segment means (Payday, Expense, Deal, Mini-game, Bad Luck)
  4. **Assets:** How buying assets adds passive income each Payday
  5. **Winning:** When passive ≥ expenses you're FREE — but other players finish the round

---

## 8. Reel Animation Spec

Single `requestAnimationFrame` loop, timestamp-based (frame-rate independent):

- **Total duration:** 5800ms
- **Phase 1** (0–6% time, 0–5% distance): ease-in quad — ramp up from rest
- **Phase 2** (6–41% time, 5–65% distance): linear — full-speed blur
- **Phase 3** (41–100% time, 65–100% distance): ease-out cubic — long smooth deceleration

Velocity is matched at the phase 2→3 boundary (cruise speed ≈ 1.71, phase-3 initial speed ≈ 1.78 in normalised units) so there is no visible jump.

Lever knob: `translateY(22px)` on click with `0.12s ease-in`, springs back `0.35s ease-out`.

---

## 9. Files Touched

| File | Change |
|---|---|
| `app/play/money-town/page.tsx` | Fetch `listKids()`, pass to `GameLobby` |
| `components/money-town/GameLobby.tsx` | Kid avatar-card picker, guest input |
| `components/money-town/MoneyTownGame.tsx` | New screen state: `job-spin → board → lever-overlay → result` |
| `components/money-town/GameBoard.tsx` | **New** — main board with 2×2 player grid |
| `components/money-town/PlayerCard.tsx` | **New** — rat race track + assets chips |
| `components/money-town/JobSpinCeremony.tsx` | **New** — per-player job assignment spin |
| `components/money-town/LeverOverlay.tsx` | **New** — modal overlay with reel + lever |
| `components/money-town/PaydayCard.tsx` | Rename → `ResultCard.tsx`, extend for all 5 event types |
| `components/money-town/RulesModal.tsx` | **New** — How to Play content |
| `lib/money-town/constants.ts` | Add job segments array for ceremony reel |

---

## Out of Scope

- Changing job salary/expense values (existing 4 jobs kept as-is)
- Online multiplayer or turn persistence across sessions
- Sound effects
