import type { Player, ExpenseEvent, GameAction } from "@/lib/money-town/types"

interface Props { player: Player; event: ExpenseEvent; dispatch: (action: GameAction) => void }

export default function ExpenseCard({ dispatch }: Props) {
  return <div onClick={() => dispatch({ type: 'DISMISS_EXPENSE' })}>ExpenseCard stub</div>
}
