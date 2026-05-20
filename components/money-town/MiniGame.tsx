import type { PendingMinigame, GameAction } from "@/lib/money-town/types"

interface Props { minigame: PendingMinigame; usedTriviaIds: string[]; dispatch: (action: GameAction) => void }

export default function MiniGame({ dispatch }: Props) {
  return <div onClick={() => dispatch({ type: 'MINIGAME_COMPLETE', cashEarned: 0 })}>MiniGame stub</div>
}
