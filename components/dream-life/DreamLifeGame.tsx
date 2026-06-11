"use client"

// Dream Life — top-level client component: reducer + autosave + stage router.
// Mockups: mockups/2026-06-11-dream-life/ (spec §15 is the visual contract).

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Kid } from "@/lib/domain/types"
import type { GameAction, GameState } from "@/lib/dream-life/types"
import { reduce } from "@/lib/dream-life/engine"
import { clearSave, isStorageAvailable, loadGame, saveGame } from "@/lib/dream-life/save"
import GameAudio from "@/components/audio/GameAudio"
import { playSfx } from "@/lib/audio/sound-manager"
import { SKY_BG, HEADER_BG } from "./theme"
import Lobby from "./Lobby"
import RulesModal from "./RulesModal"
import Phase1Board from "./Phase1Board"
import Phase2Board from "./Phase2Board"
import Phase3Board from "./Phase3Board"
import CareerReel from "./CareerReel"
import EventCardOverlay from "./EventCardOverlay"
import MinigameOverlay from "./MinigameOverlay"
import ReactionPrompt from "./ReactionPrompt"
import SettlementOverlay from "./SettlementOverlay"
import WinScreen from "./WinScreen"

const RULES_SEEN_KEY = "dream-life-rules-seen"

interface Props {
  kids: Kid[]
  activeKidId: string | null
}

function lobbyReducer(state: GameState | null, action: GameAction | { type: "LOAD"; state: GameState } | { type: "TO_LOBBY" }): GameState | null {
  if (action.type === "LOAD") return action.state
  if (action.type === "TO_LOBBY") return null
  if (action.type === "NEW_GAME") return reduce(undefined as unknown as GameState, action)
  if (state === null) return null
  return reduce(state, action)
}

export default function DreamLifeGame({ kids, activeKidId }: Props) {
  const [state, dispatch] = useReducer(lobbyReducer, null)
  const [hydrated, setHydrated] = useState(false)
  const [savedGame, setSavedGame] = useState<GameState | null>(null)
  const [canSave, setCanSave] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setSavedGame(loadGame())
    setCanSave(isStorageAvailable())
    setRulesOpen(!localStorage.getItem(RULES_SEEN_KEY))
    setHydrated(true)
  }, [])

  // autosave after every state change (spec §9)
  useEffect(() => {
    if (state && state.turnStage !== "gameOver") saveGame(state)
    if (state && state.turnStage === "gameOver") clearSave()
  }, [state])

  // win fanfare — turnStage flips to "gameOver" once per game, dep change fires this once
  useEffect(() => {
    if (state?.turnStage === "gameOver") playSfx("win")
  }, [state?.turnStage])

  // power-up gained — hand sizes only ever grow via the engine's drawPowerUp
  // (card effect or phase-3 minigame win), so a total-hand-count increase IS a gain.
  // Ref starts null and resets on lobby so resuming a saved game doesn't sparkle.
  const prevHandCount = useRef<number | null>(null)
  useEffect(() => {
    if (state === null) {
      prevHandCount.current = null
      return
    }
    const count = state.players.reduce((n, pl) => n + pl.hand.length, 0)
    if (prevHandCount.current !== null && count > prevHandCount.current) playSfx("sparkle")
    prevHandCount.current = count
  }, [state])

  const handleExit = useCallback(() => {
    router.push(activeKidId ? `/kid/${activeKidId}/play` : "/select-kid")
  }, [activeKidId, router])

  const closeRules = useCallback(() => {
    try {
      localStorage.setItem(RULES_SEEN_KEY, "1")
    } catch {}
    setRulesOpen(false)
  }, [])

  if (!hydrated) {
    return <div className="h-full" style={SKY_BG} />
  }

  if (state === null) {
    return (
      <div className="relative h-full flex flex-col overflow-hidden" style={SKY_BG}>
        <GameAudio track="dream-life" className="fixed top-14 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />
        <Lobby
          kids={kids}
          activeKidId={activeKidId}
          savedGame={savedGame}
          canSave={canSave}
          onResume={() => savedGame && dispatch({ type: "LOAD", state: savedGame })}
          onStart={(players, seed) => dispatch({ type: "NEW_GAME", players, seed })}
          onExit={handleExit}
          onHelp={() => setRulesOpen(true)}
        />
        {rulesOpen && <RulesModal onClose={closeRules} />}
      </div>
    )
  }

  const p = state.players[state.currentPlayerIndex]
  const phase = state.phaseOf[p.id]

  if (state.turnStage === "gameOver" && state.winnerId) {
    return (
      <WinScreen
        state={state}
        onNewGame={() => {
          clearSave()
          setSavedGame(null)
          dispatch({ type: "TO_LOBBY" })
        }}
        onExit={handleExit}
      />
    )
  }

  const pill =
    phase === "phase1"
      ? "🧒 TEEN YEARS"
      : phase === "phase2"
        ? `🔧 APPRENTICE ${Math.min(p.apprenticeshipYears + 1, 3)}/3`
        : phase === "careerReel"
          ? "🎓 AGE 17"
          : `💼 CAREER · AGE ${p.age}`

  return (
    <div className="relative h-full flex flex-col overflow-hidden" style={SKY_BG}>
      <GameAudio track="dream-life" className="fixed top-14 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-lg active:scale-95 transition-transform" />
      {/* header */}
      <header
        className="shrink-0 px-4 py-2 flex items-center justify-between z-10 border-b-[3px] border-white/50"
        style={HEADER_BG}
      >
        <button type="button" onClick={handleExit} className="text-sm font-black text-white/95 active:scale-95">
          ✕ Exit
        </button>
        <span className="font-black text-white text-sm tracking-wide" style={{ textShadow: "0 2px 0 rgba(0,0,0,.15)" }}>
          🌟 DREAM LIFE
        </span>
        <div className="flex items-center gap-2">
          <span className="bg-white text-orange-700 font-black text-[11px] px-2.5 py-0.5 rounded-full shadow">{pill}</span>
          <button type="button" onClick={() => setRulesOpen(true)} className="text-sm font-black text-white/95 active:scale-95">
            ?
          </button>
        </div>
      </header>

      {/* stage router */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {state.turnStage === "careerReel" ? (
          <CareerReel state={state} dispatch={dispatch} />
        ) : phase === "phase1" ? (
          <Phase1Board state={state} dispatch={dispatch} />
        ) : phase === "phase2" ? (
          <Phase2Board state={state} dispatch={dispatch} />
        ) : (
          <Phase3Board state={state} dispatch={dispatch} />
        )}
      </div>

      {/* overlays by stage */}
      {(state.turnStage === "spin" || state.turnStage === "settle") && (
        <EventCardOverlay state={state} dispatch={dispatch} />
      )}
      {state.turnStage === "minigame" && <MinigameOverlay state={state} dispatch={dispatch} />}
      {state.turnStage === "reaction" && state.pendingReaction && (
        <ReactionPrompt state={state} dispatch={dispatch} />
      )}
      {state.lastSettlement && state.turnStage !== "gameOver" && (
        <SettlementOverlay state={state} dispatch={dispatch} />
      )}
      {rulesOpen && <RulesModal onClose={closeRules} />}
    </div>
  )
}
