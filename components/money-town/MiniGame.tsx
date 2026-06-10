"use client"

import type { GameAction, ReflexGameId } from "@/lib/money-town/types"

interface PendingMinigame {
  type: 'reflex' | 'trivia'
  reflexGameId?: ReflexGameId
}
import Trivia from "./Trivia"
import CoinRain from "@/components/games/CoinRain"
import LemonSqueeze from "@/components/games/LemonSqueeze"
import CashGrab from "@/components/games/CashGrab"
import PetRush from "@/components/games/PetRush"

interface Props {
  minigame: PendingMinigame
  usedTriviaIds: string[]
  dispatch: (action: GameAction) => void
}

export default function MiniGame({ minigame, usedTriviaIds, dispatch }: Props) {
  const onReflexComplete = (cashEarned: number) => {
    dispatch({ type: 'MINIGAME_COMPLETE', cashEarned })
  }

  if (minigame.type === 'trivia') {
    return (
      <Trivia
        usedTriviaIds={usedTriviaIds}
        onComplete={(cashEarned, triviaIds) => {
          dispatch({ type: 'TRIVIA_COMPLETE', cashEarned, triviaIds })
        }}
      />
    )
  }

  const id = minigame.reflexGameId
  if (id === 'coin-rain')      return <CoinRain onComplete={onReflexComplete} />
  if (id === 'lemon-squeeze')  return <LemonSqueeze onComplete={onReflexComplete} />
  if (id === 'cash-grab')      return <CashGrab onComplete={onReflexComplete} />
  if (id === 'pet-rush')       return <PetRush onComplete={onReflexComplete} />

  return null
}
