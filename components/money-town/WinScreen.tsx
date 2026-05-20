import type { Player } from "@/lib/money-town/types"

interface Props { winner: Player; round: number; onPlayAgain: () => void }

export default function WinScreen({ winner, onPlayAgain }: Props) {
  return <div onClick={onPlayAgain}>WinScreen stub — {winner.name} won!</div>
}
