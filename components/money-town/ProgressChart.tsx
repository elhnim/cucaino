import type { Player } from "@/lib/money-town/types"

interface Props { players: Player[] }

export default function ProgressChart({ players }: Props) {
  return <div>ProgressChart stub — {players.length} players</div>
}
