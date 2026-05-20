import type { Player, BadLuckEvent, GameAction } from "@/lib/money-town/types"

interface Props { player: Player; event: BadLuckEvent; dispatch: (action: GameAction) => void }

export default function BadLuckCard({ dispatch }: Props) {
  return <div onClick={() => dispatch({ type: 'DISMISS_BAD_LUCK' })}>BadLuckCard stub</div>
}
