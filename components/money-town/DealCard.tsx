import type { Player, Asset, GameAction } from "@/lib/money-town/types"

interface Props { player: Player; asset: Asset; dispatch: (action: GameAction) => void }

export default function DealCard({ dispatch }: Props) {
  return <div onClick={() => dispatch({ type: 'PASS_DEAL' })}>DealCard stub</div>
}
