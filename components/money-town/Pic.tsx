import { JOBS, DEGREE_JOBS, ASSETS } from "@/lib/money-town/constants"
import type { ReelSegment } from "@/lib/money-town/types"

export type PicKind = 'job' | 'asset' | 'reel'

/** Reel/wheel segment symbols — the lever's 4 spin outcomes */
const REEL_EMOJI: Record<ReelSegment, string> = {
  'event':     '📋',
  'chance':    '🌟',
  'mini-game': '🎮',
  'big-event': '💥',
}

interface Props {
  kind: PicKind
  /** job id, asset defId, or reel segment — looked up in the matching registry */
  id: string
  className?: string
}

/** The ONE place a job/asset/wheel symbol becomes a picture. Emoji today —
    when painted art arrives, swap the lookup tables here and every screen
    that shows a job, asset or reel symbol updates at once. */
export default function Pic({ kind, id, className }: Props) {
  let emoji = '❓'
  if (kind === 'job') {
    emoji = [...JOBS, ...DEGREE_JOBS].find(j => j.id === id)?.emoji ?? emoji
  } else if (kind === 'asset') {
    emoji = ASSETS.find(a => a.id === id)?.emoji ?? emoji
  } else if (kind === 'reel') {
    emoji = REEL_EMOJI[id as ReelSegment] ?? emoji
  }
  return <span className={className}>{emoji}</span>
}
